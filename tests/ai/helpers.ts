import { vi } from 'vitest';

export const KEYS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_VISION_MODEL', 'OPENAI_MODEL', 'AI_PROVIDER_ORDER', 'GROQ_FALLBACK_MODEL', 'GEMINI_FALLBACK_MODEL'] as const;

/** Clear every provider variable, then set only the ones given. */
export function setEnv(vars: Partial<Record<(typeof KEYS)[number], string>> = {}) {
  for (const k of KEYS) delete process.env[k];
  // One model per provider keeps call counts easy to read.
  process.env.GROQ_FALLBACK_MODEL = '';
  process.env.GEMINI_FALLBACK_MODEL = '';
  Object.assign(process.env, vars);
}

export type Provider = 'gemini' | 'groq' | 'openai' | 'deepseek';
export type Reply = { status?: number; text?: string; body?: string; hang?: boolean; throws?: boolean };

const hostOf = (url: string): Provider =>
  url.includes('generativelanguage') ? 'gemini' : url.includes('groq.com') ? 'groq' : url.includes('openai.com') ? 'openai' : 'deepseek';

export const geminiBody = (text: string) => JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
export const chatBody = (text: string) => JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] });

/**
 * Fake `fetch`. `script[provider]` is a list of replies used in order (the last one repeats).
 * `hang` waits until the request is aborted, like a real timeout.
 */
export function mockProviders(script: Partial<Record<Provider, Reply[]>>) {
  const calls: { provider: Provider; url: string; body: any; headers: Record<string, string> }[] = [];
  const counters: Record<string, number> = {};
  const fn = vi.fn(async (url: string, init: any) => {
    const provider = hostOf(String(url));
    const body = JSON.parse(init.body);
    calls.push({ provider, url: String(url), body, headers: init.headers });
    const list = script[provider] || [{ status: 500, text: 'no script' }];
    const i = Math.min(counters[provider] ?? 0, list.length - 1);
    counters[provider] = (counters[provider] ?? 0) + 1;
    const r = list[i];
    if (r.throws) throw new Error('socket hang up');
    if (r.hang) {
      await new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }
    const status = r.status ?? 200;
    const text = r.body ?? (provider === 'gemini' ? geminiBody(r.text ?? '') : chatBody(r.text ?? ''));
    return new Response(status >= 400 ? (r.body ?? r.text ?? '') : text, { status });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls, count: (p: Provider) => calls.filter(c => c.provider === p).length };
}

export const VALID_FLASHCARD = JSON.stringify({ mnemonic: 'PEMDAS', explanation: 'Order of operations.' });
