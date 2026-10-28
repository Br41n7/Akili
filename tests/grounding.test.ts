import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groundedSearch, groundingPrompt, parseGrounded } from '@/lib/grounding';
import { attachSources, groundingRequest, modulePrompt, DEFAULT_OPTIONS } from '@/lib/course-builder';
import { capabilities } from '@/lib/plan';

const good = (over: any = {}) => ({ candidates: [{ content: { parts: [{ text: 'Osmosis is the net movement of water across a membrane.' }] }, groundingMetadata: { webSearchQueries: ['osmosis definition'], groundingChunks: [{ web: { uri: 'https://example.org/osmosis', title: 'Osmosis - Example' } }, { web: { uri: 'https://example.org/osmosis', title: 'dup' } }, { web: { uri: 'http://insecure.example/x', title: 'no' } }, { web: { uri: 'javascript:alert(1)', title: 'bad' } }, { web: { uri: 'https://www.uni.edu/bio' } }] }, ...over }] });

describe('reading a grounded answer', () => {
  it('keeps notes with https, de-duplicated sources and titles them sensibly', () => {
    const r = parseGrounded(good())!;
    expect(r.notes).toContain('Osmosis'); expect(r.sources).toEqual([{ title: 'Osmosis - Example', url: 'https://example.org/osmosis' }, { title: 'uni.edu', url: 'https://www.uni.edu/bio' }]); expect(r.queries).toEqual(['osmosis definition']);
  });
  it('refuses notes with no cited source, empty text and garbage', () => {
    expect(parseGrounded(good({ groundingMetadata: { groundingChunks: [] } }))).toBeNull();
    expect(parseGrounded({ candidates: [{ content: { parts: [{ text: '' }] }, groundingMetadata: good().candidates[0].groundingMetadata }] })).toBeNull();
    for (const bad of [null, {}, { candidates: [] }, 'x']) expect(parseGrounded(bad)).toBeNull();
  });
  it('caps notes length and number of sources', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ web: { uri: `https://s${i}.org/a`, title: `S${i}` } }));
    const r = parseGrounded({ candidates: [{ content: { parts: [{ text: 'x'.repeat(9000) }] }, groundingMetadata: { groundingChunks: many } }] })!;
    expect(r.notes.length).toBe(4000); expect(r.sources).toHaveLength(6);
  });
});

describe('asking Gemini', () => {
  it('sends the search tool as its own plain-text request with the key in a header', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(good()), { status: 200 }));
    const r = await groundedSearch({ apiKey: 'K', model: 'm 1', prompt: 'p', fetchImpl: f as any });
    const [url, init] = f.mock.calls[0] as any; const sent = JSON.parse(init.body);
    expect(url).toContain('/models/m%201:generateContent'); expect(init.headers['x-goog-api-key']).toBe('K'); expect(url).not.toContain('K');
    expect(sent.tools).toEqual([{ google_search: {} }]); expect(sent.generationConfig).toBeUndefined(); expect(r?.sources.length).toBe(2);
  });
  it('throws on an API error so the caller can carry on without research', async () => {
    await expect(groundedSearch({ apiKey: 'K', model: 'm', prompt: 'p', fetchImpl: (async () => new Response('no', { status: 500 })) as any })).rejects.toThrow('500');
  });
  it('builds the search prompt from titles, clipped', () => {
    const p = groundingPrompt('Osmosis'.repeat(100), ['A', 'B'], 'SS2'); expect(p).toContain('Lessons the notes should support: A; B'); expect(p.length).toBeLessThan(1200);
  });
});

describe('research in the course module', () => {
  const mod = { title: 'Osmosis', summary: '', lessons: [{ title: 'Water movement', objective: '' }] };
  const scope = { topic: 'Biology', secondary: true, classLevel: 'SS2', region: 'Nigeria' };
  const research = { notes: 'Water moves down its concentration gradient.', sources: [{ title: 'Ex', url: 'https://example.org/o' }] };
  it('the prompt carries the notes only when extra material is allowed, and forbids model-written links', () => {
    const on = modulePrompt(scope, { ...DEFAULT_OPTIONS, beyondNotes: true, web: true }, ['Osmosis'], mod, 1, 'ctx', research);
    expect(on).toContain('Water moves down'); expect(on).toContain('never write URLs yourself'); expect(on).toContain('"web"');
    expect(modulePrompt(scope, DEFAULT_OPTIONS, ['Osmosis'], mod, 1, 'ctx', research)).not.toContain('Water moves down');
    expect(modulePrompt(scope, { ...DEFAULT_OPTIONS, beyondNotes: true }, ['O'], mod, 1, 'ctx', null)).not.toContain('Web research notes');
  });
  it('the search is built from the module titles, never from learner-typed goals', () => {
    expect(groundingRequest(scope, mod)).toEqual({ topic: 'Osmosis (Biology)', lessons: ['Water movement'], level: 'Secondary school, SS2' });
  });
  it('only web lessons get the researched sources; model-supplied links are dropped; unsupported "web" is downgraded', () => {
    const ls = [{ origin: 'web', sources: [{ url: 'https://evil.example' }] }, { origin: 'notes', sources: [{ url: 'https://evil.example' }] }, { origin: 'beyond_notes' }];
    const withR = attachSources(ls, research); expect(withR[0].sources).toEqual(research.sources); expect(withR[1].sources).toBeUndefined(); expect(withR[2].origin).toBe('beyond_notes');
    const noR = attachSources(ls, null); expect(noR[0]).toEqual({ origin: 'beyond_notes' }); expect(noR[0].sources).toBeUndefined();
  });
  it('is a switchable paid feature, off by default', () => {
    expect(capabilities({}).has('search_grounding')).toBe(false); expect(capabilities({ NEXT_PUBLIC_AKILI_FEATURES: 'search_grounding' }).has('search_grounding')).toBe(true); expect(capabilities({ NEXT_PUBLIC_AKILI_PLAN: 'pro' }).has('search_grounding')).toBe(true);
  });
});

let user: { id: string } | null = { id: 'u1' }; let used = 0; const recorded = vi.fn(); const fetchMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { count: used } }) }) }) }) }), rpc: async (...a: any[]) => { recorded(...a); return { error: null }; } } }));

describe('ground route', () => {
  const call = async (b: unknown = { topic: 'Osmosis', lessons: ['Water movement'], level: 'SS2' }) => {
    const { POST } = await import('@/app/api/ai/ground/route');
    return POST(new Request('http://x/api/ai/ground', { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } }) as any);
  };
  beforeEach(() => { vi.resetModules(); user = { id: 'u1' }; used = 0; recorded.mockClear(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); process.env.GEMINI_API_KEY = 'k'; process.env.NEXT_PUBLIC_AKILI_FEATURES = 'search_grounding'; delete process.env.NEXT_PUBLIC_AKILI_PLAN; });
  it('is closed to anonymous users and when the feature is off, and says when it is not configured', async () => {
    user = null; expect((await call()).status).toBe(401); user = { id: 'u1' };
    delete process.env.NEXT_PUBLIC_AKILI_FEATURES; const off = await call(); expect(off.status).toBe(403); expect((await off.json()).code).toBe('GROUNDING_OFF'); expect(fetchMock).not.toHaveBeenCalled();
    process.env.NEXT_PUBLIC_AKILI_FEATURES = 'search_grounding'; delete process.env.GEMINI_API_KEY; expect((await call()).status).toBe(503);
  });
  it('rejects bad input and a spent daily allowance before calling Google', async () => {
    expect((await call({ topic: 'x' })).status).toBe(400); expect((await call('nope' as any)).status).toBe(400);
    used = 20; expect((await call()).status).toBe(429); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns notes and sources, counts one use, and reports no sources or a failure plainly', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(good()), { status: 200 }));
    const ok = await call(); const j = await ok.json(); expect(ok.status).toBe(200); expect(j.sources).toHaveLength(2); expect(recorded).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [] }), { status: 200 })); expect((await call()).status).toBe(404);
    fetchMock.mockResolvedValueOnce(new Response('x', { status: 500 })); const bad = await call(); expect(bad.status).toBe(502); expect(recorded).toHaveBeenCalledTimes(1);
  });
});
