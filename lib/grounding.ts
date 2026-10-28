/**
 * Search grounding (server side). Asks Gemini to research a topic with Google Search and returns plain notes plus the
 * sources it used. It is a separate, plain-text request on purpose: Google Search grounding has historically not been
 * allowed together with JSON output, so the JSON module request afterwards simply receives these notes as extra context.
 *
 * Off unless the "search_grounding" feature is enabled (lib/plan.ts). Never called with learner-typed text as the
 * instruction: the query is built from the module's own title and lesson titles.
 */
export interface GroundedSource { title: string; url: string }
export interface GroundedResult { notes: string; sources: GroundedSource[]; queries: string[] }

const MAX_NOTES = 4_000;
const MAX_SOURCES = 6;

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Read the model's answer and its citations. Returns null when there is nothing usable, so callers fall back to no web material. */
export function parseGrounded(data: any): GroundedResult | null {
  const cand = data?.candidates?.[0];
  const notes = (cand?.content?.parts || []).filter((p: any) => typeof p?.text === 'string' && !p.thought).map((p: any) => p.text).join('').trim().slice(0, MAX_NOTES);
  const meta = cand?.groundingMetadata;
  const seen = new Set<string>(); const sources: GroundedSource[] = [];
  for (const ch of Array.isArray(meta?.groundingChunks) ? meta.groundingChunks : []) {
    const url = typeof ch?.web?.uri === 'string' ? ch.web.uri.trim() : '';
    if (!/^https:\/\/[^\s]+$/.test(url) || seen.has(url) || sources.length >= MAX_SOURCES) continue;
    seen.add(url);
    const title = (typeof ch.web.title === 'string' ? ch.web.title.trim() : '') || host(url) || url.slice(0, 60);
    sources.push({ title: title.slice(0, 120), url: url.slice(0, 500) });
  }
  // Notes without any cited source are not "from the web": refuse them rather than label model memory as research.
  if (!notes || !sources.length) return null;
  const queries = (Array.isArray(meta?.webSearchQueries) ? meta.webSearchQueries : []).filter((q: unknown): q is string => typeof q === 'string').map((q: string) => q.slice(0, 120)).slice(0, 6);
  return { notes, sources, queries };
}

export function groundingPrompt(topic: string, lessonTitles: string[], level: string): string {
  return `You are preparing teaching notes. Use Google Search to find reliable, established information on the topic below, preferring textbooks, universities, and health or science institutions. Write concise research notes (under 500 words) as plain paragraphs: key facts, definitions and standard explanations a teacher could rely on. No opinions, no marketing, no markdown links, and say plainly if reliable information is thin.

Topic: ${topic.slice(0, 200)}
Lessons the notes should support: ${lessonTitles.slice(0, 6).map(t => t.slice(0, 120)).join('; ') || 'general overview'}
Learner level: ${level.slice(0, 120) || 'not specified'}`;
}

export async function groundedSearch(args: { apiKey: string; model: string; prompt: string; timeoutMs?: number; signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<GroundedResult | null> {
  const f = args.fetchImpl ?? fetch;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), args.timeoutMs ?? 40_000);
  const onAbort = () => ctl.abort(); args.signal?.addEventListener('abort', onAbort);
  try {
    const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': args.apiKey }, signal: ctl.signal,
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: args.prompt }] }], tools: [{ google_search: {} }] }),
    });
    if (!res.ok) throw new Error(`grounding request failed (${res.status})`);
    return parseGrounded(await res.json());
  } finally { clearTimeout(timer); args.signal?.removeEventListener('abort', onAbort); }
}
