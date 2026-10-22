/**
 * Akili AI layer (server only).
 *
 * - Providers are optional. Any provider without a key is skipped silently.
 * - Every provider call has its own timeout, and the whole request has a budget.
 * - Failures fall through to the next provider/model; a short cooldown avoids
 *   hammering a provider that just failed.
 * - `runAIJSON` extracts, repairs, parses and validates JSON, and re-asks
 *   (preferring a different provider) when the output is unusable.
 * - Nothing provider-specific ever reaches the user: callers surface
 *   `AIServiceError.userMessage` (or `toPublicError`) and nothing else.
 *
 * No SDKs: Gemini and Groq are called over HTTPS so timeouts and cancellation
 * behave the same everywhere.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

import { getTask, type ProviderId, type TaskSpec } from './ai-tasks';

export type { ProviderId };
export type AIFormat = 'json' | 'text';

export interface AIImage { base64: string; mimeType: string }

export interface AIOptions {
  task: string;
  prompt: string;
  system: string;
  format?: AIFormat;
  image?: AIImage;
  /** The learner's own Groq key. Tried first when present. */
  userGroqKey?: string;
  /**
   * Only use the learner's own key. Set by the route when the free daily allowance is
   * used up, so a personal key can never spend the shared quota.
   */
  userKeyOnly?: boolean;
  /** Server-side override of provider order. Never take this from the client. */
  providerOrder?: string[];
  maxOutputTokens?: number;
  /** Per-attempt timeout. Defaults depend on the task. */
  timeoutMs?: number;
  /** Total time budget for the whole call, including fallbacks. */
  budgetMs?: number;
  /** Abort when the caller goes away (e.g. request.signal). */
  signal?: AbortSignal;
  /** Providers to try last (used by the JSON retry to switch provider). */
  deprioritize?: ProviderId[];
  /** Absolute deadline (ms epoch). Set internally by runAIJSON. */
  deadline?: number;
}

export interface AIResult {
  text: string;
  provider: ProviderId;
  model: string;
  usedUserKey: boolean;
  /** True when a personal key was supplied but rejected. */
  userKeyRejected: boolean;
  /** How many attempts failed before this one succeeded. */
  fallbacks: number;
  durationMs: number;
}

export type AIErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_NO_VISION'
  | 'AI_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_BAD_OUTPUT'
  | 'AI_ABORTED';

const PUBLIC_MESSAGES: Record<AIErrorCode, string> = {
  AI_NOT_CONFIGURED: 'The AI tutor is not available right now. Please try again later.',
  AI_NO_VISION: 'Reading pictures is not available right now. Try again later, or continue without the picture.',
  AI_UNAVAILABLE: 'The AI tutor is busy right now. Please try again in a moment.',
  AI_TIMEOUT: 'This is taking longer than expected. Try again, or use a smaller section of your material.',
  AI_RATE_LIMITED: 'Many students are studying right now. Wait a few seconds and try again.',
  AI_BAD_OUTPUT: 'The AI gave an answer we could not use. Please try again.',
  AI_ABORTED: 'Request cancelled.',
};

const PUBLIC_STATUS: Record<AIErrorCode, number> = {
  AI_NOT_CONFIGURED: 503,
  AI_NO_VISION: 503,
  AI_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_RATE_LIMITED: 429,
  AI_BAD_OUTPUT: 502,
  AI_ABORTED: 499,
};

/** The only error type that may be shown to users. `detail` is for server logs. */
export class AIServiceError extends Error {
  readonly code: AIErrorCode;
  readonly status: number;
  readonly userMessage: string;
  readonly detail: string;
  constructor(code: AIErrorCode, detail = '') {
    super(PUBLIC_MESSAGES[code]);
    this.name = 'AIServiceError';
    this.code = code;
    this.status = PUBLIC_STATUS[code];
    this.userMessage = PUBLIC_MESSAGES[code];
    this.detail = detail;
  }
}

/** Convert anything thrown into something safe to send to the browser. */
export function toPublicError(err: unknown): { message: string; code: AIErrorCode | 'INTERNAL'; status: number } {
  if (err instanceof AIServiceError) return { message: err.userMessage, code: err.code, status: err.status };
  return { message: 'Something went wrong on our side. Please try again.', code: 'INTERNAL', status: 500 };
}

type FailureKind =
  | 'auth' | 'rate_limit' | 'timeout' | 'model_missing' | 'bad_request'
  | 'server' | 'network' | 'empty' | 'blocked' | 'truncated' | 'aborted';

class ProviderFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly status: number | undefined,
    readonly detail: string,
    readonly retryAfterMs?: number,
  ) {
    super(detail);
  }
}

const TRANSIENT: FailureKind[] = ['rate_limit', 'timeout', 'server', 'network', 'empty', 'truncated'];
// Permanent: blocked, bad_request, auth, model_missing. Never retried; auth also disables the provider for the call.

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const env = (name: string) => (process.env[name] || '').trim();
const envNumber = (name: string, fallback: number) => {
  const n = Number(env(name));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const JSON_RULES =
  'OUTPUT FORMAT: Respond with a single valid JSON value only. No markdown fences and no commentary before or after it. Escape line breaks inside strings as \\n.';

const geminiModels = (): string[] => {
  const primary = env('GEMINI_MODEL') || 'gemini-3.8-flash';
  const fallbackEnv = process.env.GEMINI_FALLBACK_MODEL;
  const fallback = fallbackEnv === undefined ? 'gemini-3.7-flash' : fallbackEnv.trim();
  return Array.from(new Set([primary, fallback].filter(Boolean)));
};

const groqModels = (): string[] => {
  const primary = env('GROQ_MODEL') || 'openai/gpt-oss-120b';
  const fallbackEnv = process.env.GROQ_FALLBACK_MODEL;
  const fallback = fallbackEnv === undefined ? 'openai/gpt-oss-20b' : fallbackEnv.trim();
  return Array.from(new Set([primary, fallback].filter(Boolean)));
};

export interface Candidate {
  provider: ProviderId;
  model: string;
  apiKey: string;
  userKey: boolean;
}

function cleanUserKey(key?: string): string {
  const k = (key || '').trim();
  return k.length >= 8 && k.length <= 200 && /^[\x21-\x7e]+$/.test(k) ? k : '';
}

/** OpenAI models that accept images. An OPENAI_MODEL outside this list is skipped for image input. */
const OPENAI_VISION = /^(gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|o1|o3|o4|chatgpt-4o)/;

/**
 * Which providers can take an image, and with which model. Gemini always can.
 * Groq and OpenAI only when the configured model is known to support vision.
 * DeepSeek never. Returns the models to try, or [] when the provider must be skipped.
 */
export function providerCandidates(provider: ProviderId, opts: Pick<AIOptions, 'image'>): Candidate[] {
  const wantsImage = !!opts.image;
  switch (provider) {
    case 'gemini': {
      const apiKey = env('GEMINI_API_KEY');
      return apiKey ? geminiModels().map(model => ({ provider, model, apiKey, userKey: false })) : [];
    }
    case 'groq': {
      const apiKey = env('GROQ_API_KEY');
      if (!apiKey) return [];
      if (wantsImage) {
        // Vision on Groq is opt-in: set GROQ_VISION_MODEL to a model that accepts images.
        const vision = env('GROQ_VISION_MODEL');
        return vision ? [{ provider, model: vision, apiKey, userKey: false }] : [];
      }
      return groqModels().map(model => ({ provider, model, apiKey, userKey: false }));
    }
    case 'openai': {
      const apiKey = env('OPENAI_API_KEY');
      if (!apiKey) return [];
      const model = env('OPENAI_MODEL') || 'gpt-4o-mini';
      if (wantsImage && !OPENAI_VISION.test(model)) return [];
      return [{ provider, model, apiKey, userKey: false }];
    }
    case 'deepseek': {
      const apiKey = env('DEEPSEEK_API_KEY');
      return apiKey && !wantsImage ? [{ provider, model: env('DEEPSEEK_MODEL') || 'deepseek-chat', apiKey, userKey: false }] : [];
    }
  }
}

const ALL_PROVIDERS: ProviderId[] = ['gemini', 'groq', 'openai', 'deepseek'];

function providerOrder(opts: AIOptions, spec: TaskSpec): ProviderId[] {
  const parse = (list: string[]) =>
    list.map(x => x.trim().toLowerCase()).filter((x): x is ProviderId => (ALL_PROVIDERS as string[]).includes(x));

  const explicit = opts.providerOrder?.length ? parse(opts.providerOrder) : [];
  if (explicit.length) return explicit;
  const fromEnv = parse(env('AI_PROVIDER_ORDER').split(','));
  if (fromEnv.length) return fromEnv;

  return spec.providers;
}

function buildCandidates(opts: AIOptions, spec: TaskSpec): Candidate[] {
  const out: Candidate[] = [];

  // The learner's own key comes first: it uses their quota, not ours.
  const userKey = cleanUserKey(opts.userGroqKey);
  if (userKey && !opts.image) {
    for (const model of groqModels()) out.push({ provider: 'groq', model, apiKey: userKey, userKey: true });
  }

  if (opts.userKeyOnly) return out;

  for (const p of providerOrder(opts, spec)) out.push(...providerCandidates(p, opts));

  if (opts.deprioritize?.length) {
    const avoid = new Set(opts.deprioritize);
    return [...out.filter(c => !avoid.has(c.provider)), ...out.filter(c => avoid.has(c.provider))];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cooldowns (per server instance)
// ─────────────────────────────────────────────────────────────────────────────

const COOLDOWN_UNTIL = new Map<string, number>();
const candidateKey = (c: Candidate) => `${c.provider}:${c.model}:${c.userKey ? 'user' : 'server'}`;
const isCoolingDown = (c: Candidate) => !c.userKey && (COOLDOWN_UNTIL.get(candidateKey(c)) || 0) > Date.now();

function tripCooldown(c: Candidate, f: ProviderFailure) {
  if (c.userKey) return;
  let ms = 0;
  if (f.kind === 'rate_limit') ms = Math.min(f.retryAfterMs ?? 20_000, 60_000);
  else if (f.kind === 'server' || f.kind === 'network' || f.kind === 'timeout') ms = 10_000;
  else if (f.kind === 'auth') ms = 10 * 60_000;
  else if (f.kind === 'model_missing') ms = 30 * 60_000;
  if (ms) COOLDOWN_UNTIL.set(candidateKey(c), Date.now() + ms);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────────

const SECRET_PATTERN = /(AIza[0-9A-Za-z_-]{20,}|gsk_[0-9A-Za-z]{16,}|sk-[0-9A-Za-z_-]{16,}|Bearer\s+[0-9A-Za-z._-]{16,})/g;
const redact = (s: string) => s.replace(SECRET_PATTERN, '[redacted]').slice(0, 400);

function classifyStatus(status: number, body: string): FailureKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'model_missing';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  if (/decommission|no longer supported|model.*not found|does not exist/i.test(body)) return 'model_missing';
  return 'bad_request';
}

async function postJSON(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  outer?: AbortSignal,
): Promise<any> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = redact(await res.text().catch(() => ''));
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new ProviderFailure(
        classifyStatus(res.status, text),
        res.status,
        `HTTP ${res.status} ${text}`,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      );
    }
    return await res.json();
  } catch (err: any) {
    if (err instanceof ProviderFailure) throw err;
    if (timedOut) throw new ProviderFailure('timeout', undefined, `timed out after ${timeoutMs}ms`);
    if (outer?.aborted) throw new ProviderFailure('aborted', undefined, 'caller aborted');
    throw new ProviderFailure('network', undefined, redact(String(err?.message || err)));
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider calls
// ─────────────────────────────────────────────────────────────────────────────

function geminiThinkingLevel(spec: TaskSpec): 'low' | undefined {
  const forced = env('GEMINI_THINKING_LEVEL').toLowerCase();
  if (forced === 'default' || forced === 'medium' || forced === 'high') return undefined; // provider default is medium
  if (forced === 'low') return 'low';
  return spec.lowEffort ? 'low' : undefined;
}

async function callGemini(c: Candidate, o: AIOptions, timeoutMs: number): Promise<string> {
  const parts: any[] = [];
  if (o.image) parts.push({ inlineData: { mimeType: o.image.mimeType, data: o.image.base64 } });
  parts.push({ text: o.prompt });

  // Gemini 3.x: no temperature/top_p/top_k. Reasoning effort is set with thinkingLevel.
  const generationConfig: Record<string, unknown> = {};
  if (o.maxOutputTokens) generationConfig.maxOutputTokens = o.maxOutputTokens;
  if (o.format === 'json') generationConfig.responseMimeType = 'application/json';
  const level = geminiThinkingLevel(getTask(o.task));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`;
  const headers = { 'x-goog-api-key': c.apiKey };
  const build = (withThinking: boolean) => ({
    systemInstruction: { parts: [{ text: o.format === 'json' ? `${o.system}\n\n${JSON_RULES}` : o.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: withThinking && level ? { ...generationConfig, thinkingConfig: { thinkingLevel: level } } : generationConfig,
  });

  let data: any;
  try {
    data = await postJSON(url, headers, build(true), timeoutMs, o.signal);
  } catch (err) {
    // If the thinking setting is what the API rejected, retry once without it.
    if (err instanceof ProviderFailure && err.kind === 'bad_request' && level && /think/i.test(err.detail)) {
      data = await postJSON(url, headers, build(false), timeoutMs, o.signal);
    } else throw err;
  }

  if (data?.promptFeedback?.blockReason) {
    throw new ProviderFailure('blocked', 200, `prompt blocked: ${data.promptFeedback.blockReason}`);
  }
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .filter((p: any) => typeof p?.text === 'string' && !p.thought)
    .map((p: any) => p.text)
    .join('')
    .trim();

  if (candidate?.finishReason === 'MAX_TOKENS' && o.format === 'json') {
    throw new ProviderFailure('truncated', 200, 'output hit the token limit');
  }
  if (!text && /SAFETY|BLOCKLIST|PROHIBITED|RECITATION/.test(candidate?.finishReason || '')) {
    throw new ProviderFailure('blocked', 200, `finish: ${candidate.finishReason}`);
  }
  if (!text) throw new ProviderFailure('empty', 200, 'empty response');
  return text;
}

interface ChatCompletionsConfig {
  baseUrl: string;
  tokensParam: 'max_completion_tokens' | 'max_tokens';
  reasoningEffort?: 'low' | 'medium' | 'high';
}

async function callChatCompletions(c: Candidate, o: AIOptions, timeoutMs: number, cfg: ChatCompletionsConfig): Promise<string> {
  const system = o.format === 'json' ? `${o.system}\n\n${JSON_RULES}` : o.system;
  const userContent: any = o.image
    ? [
        { type: 'text', text: o.prompt },
        { type: 'image_url', image_url: { url: `data:${o.image.mimeType};base64,${o.image.base64}` } },
      ]
    : o.prompt;

  const maxTokens = o.maxOutputTokens ?? envNumber('AI_MAX_OUTPUT_TOKENS', getTask(o.task).heavy ? 16000 : 8000);
  const build = (withReasoning: boolean) => ({
    model: c.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
    temperature: 0.7,
    [cfg.tokensParam]: maxTokens,
    ...(o.format === 'json' ? { response_format: { type: 'json_object' } } : {}),
    ...(withReasoning && cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}),
  });

  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers = { Authorization: `Bearer ${c.apiKey}` };

  let data: any;
  try {
    data = await postJSON(url, headers, build(true), timeoutMs, o.signal);
  } catch (err) {
    if (err instanceof ProviderFailure && err.kind === 'bad_request' && cfg.reasoningEffort && /reasoning/i.test(err.detail)) {
      data = await postJSON(url, headers, build(false), timeoutMs, o.signal);
    } else throw err;
  }

  const choice = data?.choices?.[0];
  const text = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : '';
  if (choice?.finish_reason === 'length' && o.format === 'json') {
    throw new ProviderFailure('truncated', 200, 'output hit the token limit');
  }
  if (!text) throw new ProviderFailure('empty', 200, 'empty response');
  return text;
}

function groqReasoningEffort(model: string): 'low' | 'medium' | 'high' | undefined {
  if (!model.startsWith('openai/gpt-oss')) return undefined;
  const forced = env('GROQ_REASONING_EFFORT').toLowerCase();
  return forced === 'medium' || forced === 'high' ? forced : 'low';
}

function callProvider(c: Candidate, o: AIOptions, timeoutMs: number): Promise<string> {
  switch (c.provider) {
    case 'gemini':
      return callGemini(c, o, timeoutMs);
    case 'groq':
      return callChatCompletions(c, o, timeoutMs, {
        baseUrl: 'https://api.groq.com/openai/v1',
        tokensParam: 'max_completion_tokens',
        reasoningEffort: groqReasoningEffort(c.model),
      });
    case 'openai':
      return callChatCompletions(c, o, timeoutMs, { baseUrl: 'https://api.openai.com/v1', tokensParam: 'max_tokens' });
    case 'deepseek':
      return callChatCompletions(c, o, timeoutMs, {
        baseUrl: env('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1',
        tokensParam: 'max_tokens',
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core
// ─────────────────────────────────────────────────────────────────────────────

const MIN_ATTEMPT_MS = 4_000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function attemptTimeout(o: AIOptions, spec: TaskSpec): number {
  if (o.timeoutMs) return o.timeoutMs;
  const override = envNumber('AI_TIMEOUT_MS', 0);
  if (!override) return spec.timeoutMs;
  return spec.heavy ? Math.max(override, spec.timeoutMs) : override;
}

/** Transient kinds worth one more try on the same provider. Rate limits and timeouts move on instead. */
const RETRY_SAME: FailureKind[] = TRANSIENT.filter(k => k !== 'rate_limit' && k !== 'timeout' && k !== 'truncated');

/** One safe line per call: no prompts, no document text, no provider error bodies. */
function logCall(f: { task: string; ok: boolean; provider?: ProviderId; model?: string; ms: number; fallbacks: number; failures: FailureKind[] }) {
  const line = JSON.stringify({ task: f.task, ok: f.ok, provider: f.provider, model: f.model, ms: f.ms, fallbacks: f.fallbacks, failures: f.failures });
  (f.ok ? console.info : console.error)(`[ai] ${line}`);
}

export async function runAIDetailed(opts: AIOptions): Promise<AIResult> {
  const started = Date.now();
  const spec = getTask(opts.task);
  const deadline = opts.deadline ?? started + (opts.budgetMs ?? envNumber('AI_TOTAL_BUDGET_MS', 105_000));
  const all = buildCandidates(opts, spec);
  if (!all.length) {
    console.error(`[ai] No eligible provider for task "${opts.task}"${opts.image ? ' with an image' : ''}. Check provider keys and vision models.`);
    // Say so plainly when the problem is the picture, not the whole service.
    throw new AIServiceError(opts.image && !opts.userKeyOnly ? 'AI_NO_VISION' : 'AI_NOT_CONFIGURED', 'no eligible provider');
  }

  const failures: { c: Candidate; f: ProviderFailure }[] = [];
  const deadProviders = new Set<string>();
  let userKeyRejected = false;
  const maxTries = 1 + Math.max(0, spec.retries);

  // Healthy candidates first; ones on cooldown are a last resort, never excluded outright.
  const pool = [...all.filter(c => !isCoolingDown(c)), ...all.filter(isCoolingDown)];

  candidates: for (const c of pool) {
    const providerKey = `${c.provider}:${c.userKey ? 'user' : 'server'}`;
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      if (deadProviders.has(providerKey)) break;
      const remaining = deadline - Date.now();
      if (remaining < MIN_ATTEMPT_MS) break candidates;
      const timeout = Math.min(attemptTimeout(opts, spec), remaining - 250);

      try {
        const text = await callProvider(c, opts, timeout);
        const durationMs = Date.now() - started;
        logCall({ task: opts.task, ok: true, provider: c.provider, model: c.model, ms: durationMs, fallbacks: failures.length, failures: failures.map(x => x.f.kind) });
        return { text, provider: c.provider, model: c.model, usedUserKey: c.userKey, userKeyRejected, fallbacks: failures.length, durationMs };
      } catch (err) {
        const f = err instanceof ProviderFailure
          ? err
          : new ProviderFailure('network', undefined, redact(String((err as any)?.message || err)));
        if (f.kind === 'aborted') throw new AIServiceError('AI_ABORTED', f.detail);

        failures.push({ c, f });
        tripCooldown(c, f);
        if (c.userKey && f.kind === 'auth') userKeyRejected = true;
        // A bad key fails for every model of that provider, so skip the rest of them.
        if (f.kind === 'auth') deadProviders.add(providerKey);
        // Only the failure category is logged here. The provider's error body stays out of logs.
        console.warn(`[ai] ${c.provider}/${c.model}${c.userKey ? ' (user key)' : ''} failed: ${f.kind}${f.status ? ` ${f.status}` : ''}`);

        const backoff = 400 * attempt;
        if (RETRY_SAME.includes(f.kind) && attempt < maxTries && deadline - Date.now() > MIN_ATTEMPT_MS + backoff) {
          await sleep(backoff);
          continue;
        }
        break;
      }
    }
  }

  const kinds = failures.map(x => x.f.kind);
  const detail = failures.map(x => `${x.c.provider}/${x.c.model}: ${x.f.kind}`).join('; ');
  logCall({ task: opts.task, ok: false, ms: Date.now() - started, fallbacks: failures.length, failures: kinds });

  if (!failures.length) throw new AIServiceError('AI_TIMEOUT', 'budget exhausted');
  if (kinds.every(k => k === 'auth' || k === 'model_missing')) throw new AIServiceError('AI_NOT_CONFIGURED', detail);
  if (kinds.every(k => k === 'rate_limit')) throw new AIServiceError('AI_RATE_LIMITED', detail);
  if (kinds.includes('timeout') && !kinds.includes('server')) throw new AIServiceError('AI_TIMEOUT', detail);
  throw new AIServiceError('AI_UNAVAILABLE', detail);
}

/** Text in, text out. */
export async function runAI(opts: AIOptions): Promise<string> {
  return (await runAIDetailed(opts)).text;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON handling
// ─────────────────────────────────────────────────────────────────────────────

export function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/** The first balanced JSON object/array in the text (or the unclosed tail). */
function sliceJSON(text: string): string {
  const s = stripFences(text.replace(/^\uFEFF/, ''));
  const start = s.search(/[\[{]/);
  if (start === -1) return s;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.slice(start);
}

/** Fix common model mistakes: raw newlines/tabs inside strings and trailing commas. */
function repairJSON(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of Array.from(text)) {
    if (inString) {
      if (escaped) { escaped = false; out += ch; continue; }
      if (ch === '\\') { escaped = true; out += ch; continue; }
      if (ch === '"') { inString = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') continue;
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

export function parseJSONLoose(text: string): unknown {
  const candidate = sliceJSON(text);
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(repairJSON(candidate));
  }
}

export type Validation<T> = { ok: true; data: T } | { ok: false; error: string };
export interface JSONResult<T> extends AIResult { data: T }

/**
 * Ask for JSON, parse and validate it, and re-ask (on another provider first)
 * when the output is unusable. All attempts share one time budget.
 */
export async function runAIJSON<T = unknown>(
  opts: AIOptions,
  validate?: (data: unknown) => Validation<T>,
  maxAttempts = 3,
): Promise<JSONResult<T>> {
  const deadline = opts.deadline ?? Date.now() + (opts.budgetMs ?? envNumber('AI_TOTAL_BUDGET_MS', 105_000));
  let lastProblem = 'invalid JSON';
  let lastProvider: ProviderId | undefined;
  let tooLong = false;
  let userKeyRejected = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (deadline - Date.now() < MIN_ATTEMPT_MS) break;

    const prompt = attempt === 1
      ? opts.prompt
      : `${opts.prompt}\n\nIMPORTANT: your previous reply could not be used (${lastProblem}). ` +
        `${tooLong ? 'It was too long and got cut off, so keep every text field shorter. ' : ''}` +
        'Reply again with ONLY the complete, valid JSON in the requested shape. No markdown fences and no commentary.';

    let res: AIResult;
    try {
      res = await runAIDetailed({
        ...opts,
        format: 'json',
        prompt,
        deadline,
        deprioritize: attempt > 1 && lastProvider ? [...(opts.deprioritize || []), lastProvider] : opts.deprioritize,
      });
    } catch (err) {
      // Truncated output surfaces as a provider failure; give the model another go, shorter.
      if (err instanceof AIServiceError && err.code === 'AI_UNAVAILABLE' && /truncated/.test(err.detail) && attempt < maxAttempts) {
        tooLong = true;
        lastProblem = 'the output was cut off';
        continue;
      }
      throw err;
    }

    userKeyRejected ||= res.userKeyRejected;
    lastProvider = res.provider;

    let parsed: unknown;
    try {
      parsed = parseJSONLoose(res.text);
    } catch (e: any) {
      lastProblem = `it was not valid JSON (${redact(String(e?.message || 'parse error')).slice(0, 80)})`;
      tooLong = res.text.length > 4000 && !/[}\]]\s*$/.test(res.text.trim());
      console.warn(`[ai] attempt ${attempt}: unparseable JSON from ${res.provider}`);
      continue;
    }

    if (!validate) return { ...res, userKeyRejected, data: parsed as T };

    const v = validate(parsed);
    if (v.ok) return { ...res, userKeyRejected, data: v.data };
    lastProblem = v.error.slice(0, 160);
    tooLong = false;
    console.warn(`[ai] attempt ${attempt}: failed validation from ${res.provider}: ${v.error}`);
  }

  throw new AIServiceError('AI_BAD_OUTPUT', lastProblem);
}

/**
 * Compatibility wrapper (used by the PastQ importer).
 * Returns cleaned JSON text for `format: 'json'`, otherwise plain text.
 */
export async function runAIWithRetry(
  opts: AIOptions,
  validate?: (text: string) => { ok: boolean; error?: string },
): Promise<string> {
  if (opts.format !== 'json') return (await runAIDetailed(opts)).text.trim();
  const result = await runAIJSON<unknown>(opts, data => {
    const v = validate?.(JSON.stringify(data));
    return v && !v.ok ? { ok: false, error: v.error || 'validation failed' } : { ok: true, data };
  });
  return JSON.stringify(result.data);
}
