import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VALID_FLASHCARD, chatBody, mockProviders, setEnv } from './helpers';

// Cooldowns live in module state, so every test gets a fresh copy of the module.
const load = async () => {
  vi.resetModules();
  return import('@/lib/ai');
};

const base = { system: 'sys', prompt: 'hello' };
const IMAGE = { base64: 'AAAA', mimeType: 'image/png' };

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  for (const m of ['info', 'warn', 'error', 'log'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
  }
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('provider order comes from the task registry', () => {
  it('uses the primary provider when it succeeds', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_aaaaaaaaaaaaaaaaaaaa', GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' });
    const net = mockProviders({ groq: [{ text: 'ok' }] });
    const { runAIDetailed } = await load();
    const r = await runAIDetailed({ ...base, task: 'course_builder' });
    expect(r.provider).toBe('groq');
    expect(r.fallbacks).toBe(0);
    expect(net.fn).toHaveBeenCalledTimes(1);
  });

  it('puts Gemini first for tutor-style tasks', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_aaaaaaaaaaaaaaaaaaaa', GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' });
    mockProviders({ gemini: [{ text: 'ok' }] });
    const { runAIDetailed } = await load();
    expect((await runAIDetailed({ ...base, task: 'adaptive_tutor' })).provider).toBe('gemini');
  });

  it('prefers DeepSeek for routine tasks when it is configured, and skips it when it is not', async () => {
    setEnv({ DEEPSEEK_API_KEY: 'dsk-aaaaaaaaaaaaaaaaaaaa', GROQ_API_KEY: 'gsk_aaaaaaaaaaaaaaaaaaaa' });
    mockProviders({ deepseek: [{ text: VALID_FLASHCARD }] });
    let { runAIDetailed } = await load();
    expect((await runAIDetailed({ ...base, task: 'mnemonic' })).provider).toBe('deepseek');

    setEnv({ GROQ_API_KEY: 'gsk_aaaaaaaaaaaaaaaaaaaa' });
    mockProviders({ groq: [{ text: 'ok' }] });
    ({ runAIDetailed } = await load());
    expect((await runAIDetailed({ ...base, task: 'mnemonic' })).provider).toBe('groq');
  });
});

describe('fallback behaviour', () => {
  beforeEach(() => setEnv({ GROQ_API_KEY: 'gsk_aaaaaaaaaaaaaaaaaaaa', GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' }));

  it('falls back when the primary provider times out', async () => {
    const net = mockProviders({ groq: [{ hang: true }], gemini: [{ text: 'from gemini' }] });
    const { runAIDetailed } = await load();
    const r = await runAIDetailed({ ...base, task: 'course_builder', timeoutMs: 60 });
    expect(r.provider).toBe('gemini');
    expect(r.fallbacks).toBe(1);
    expect(net.count('groq')).toBe(1); // a timeout moves on, it is not retried on the same provider
  });

  it('falls back on a rate limit without retrying the limited provider', async () => {
    const net = mockProviders({ groq: [{ status: 429, text: 'slow down' }], gemini: [{ text: 'ok' }] });
    const { runAIDetailed } = await load();
    const r = await runAIDetailed({ ...base, task: 'course_builder' });
    expect(r.provider).toBe('gemini');
    expect(net.count('groq')).toBe(1);
  });

  it('retries a transient server error once on the same provider', async () => {
    const net = mockProviders({ groq: [{ status: 503, text: 'busy' }, { text: 'recovered' }] });
    const { runAIDetailed } = await load();
    const r = await runAIDetailed({ ...base, task: 'course_builder' });
    expect(r.provider).toBe('groq');
    expect(r.text).toBe('recovered');
    expect(r.fallbacks).toBe(1);
    expect(net.count('gemini')).toBe(0);
  });

  it('treats an invalid key as permanent: no retry, next provider answers', async () => {
    const net = mockProviders({ groq: [{ status: 401, text: 'bad key' }], gemini: [{ text: 'ok' }] });
    const { runAIDetailed } = await load();
    const r = await runAIDetailed({ ...base, task: 'course_builder' });
    expect(r.provider).toBe('gemini');
    expect(net.count('groq')).toBe(1);
  });

  it('stops using a provider for the rest of the call after an auth failure, across its models', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_aaaaaaaaaaaaaaaaaaaa', GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' });
    delete process.env.GROQ_FALLBACK_MODEL; // two Groq models this time
    const net = mockProviders({ groq: [{ status: 401, text: 'bad key' }], gemini: [{ text: 'ok' }] });
    const { runAIDetailed } = await load();
    await runAIDetailed({ ...base, task: 'course_builder' });
    expect(net.count('groq')).toBe(1);
  });

  it('reports AI_NOT_CONFIGURED when no key is set', async () => {
    setEnv();
    const net = mockProviders({});
    const { runAIDetailed, AIServiceError } = await load();
    await expect(runAIDetailed({ ...base, task: 'course_builder' })).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
    await expect(runAIDetailed({ ...base, task: 'course_builder' })).rejects.toBeInstanceOf(AIServiceError);
    expect(net.fn).not.toHaveBeenCalled();
  });

  it('reports AI_NOT_CONFIGURED when every key is rejected', async () => {
    mockProviders({ groq: [{ status: 401 }], gemini: [{ status: 403 }] });
    const { runAIDetailed } = await load();
    await expect(runAIDetailed({ ...base, task: 'course_builder' })).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });

  it('gives one friendly error after every provider fails', async () => {
    const net = mockProviders({ groq: [{ status: 500, text: 'boom' }], gemini: [{ status: 500, text: 'boom' }] });
    const { runAIDetailed } = await load();
    const err: any = await runAIDetailed({ ...base, task: 'course_builder' }).catch(e => e);
    expect(err.code).toBe('AI_UNAVAILABLE');
    expect(err.message).toBe(err.userMessage);
    expect(net.count('groq')).toBe(2); // first try plus one retry
    expect(net.count('gemini')).toBe(2);
  }, 15_000);

  it('reports a rate limit when every provider is rate limited', async () => {
    mockProviders({ groq: [{ status: 429 }], gemini: [{ status: 429 }] });
    const { runAIDetailed } = await load();
    await expect(runAIDetailed({ ...base, task: 'course_builder' })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED', status: 429 });
  });

  it('stops quickly when the caller aborts', async () => {
    mockProviders({ groq: [{ hang: true }] });
    const { runAIDetailed } = await load();
    const ctl = new AbortController();
    const p = runAIDetailed({ ...base, task: 'course_builder', signal: ctl.signal });
    setTimeout(() => ctl.abort(), 20);
    await expect(p).rejects.toMatchObject({ code: 'AI_ABORTED' });
  });
});

describe('malformed JSON', () => {
  beforeEach(() => setEnv({ GROQ_API_KEY: 'gsk_aaaaaaaaaaaaaaaaaaaa', GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' }));

  it('re-asks on a different provider and returns validated data', async () => {
    const net = mockProviders({ groq: [{ text: 'Sure! Here you go: not json' }], gemini: [{ text: VALID_FLASHCARD }] });
    const { runAIJSON } = await load();
    const { getValidator } = await import('@/lib/ai-schemas');
    const r = await runAIJSON({ ...base, task: 'course_builder' }, getValidator('flashcard'));
    expect(r.provider).toBe('gemini');
    expect(r.data).toEqual({ mnemonic: 'PEMDAS', explanation: 'Order of operations.' });
    expect(net.count('groq')).toBe(1);
    // The retry prompt keeps the original instructions and adds the problem.
    const retry = net.calls.find(c => c.provider === 'gemini')!.body.contents[0].parts[0].text as string;
    expect(retry).toContain('hello');
    expect(retry).toMatch(/previous reply could not be used/);
  });

  it('repairs fenced, trailing-comma output without another call', async () => {
    const net = mockProviders({ groq: [{ text: '```json\n{"mnemonic":"A","explanation":"B",}\n```' }] });
    const { runAIJSON } = await load();
    const { getValidator } = await import('@/lib/ai-schemas');
    const r = await runAIJSON({ ...base, task: 'course_builder' }, getValidator('flashcard'));
    expect(r.data).toEqual({ mnemonic: 'A', explanation: 'B' });
    expect(net.fn).toHaveBeenCalledTimes(1);
  });

  it('gives AI_BAD_OUTPUT when no provider returns usable JSON', async () => {
    mockProviders({ groq: [{ text: 'nope' }], gemini: [{ text: 'still nope' }] });
    const { runAIJSON } = await load();
    await expect(runAIJSON({ ...base, task: 'course_builder' })).rejects.toMatchObject({ code: 'AI_BAD_OUTPUT' });
  });

  it('rejects JSON that breaks the schema contract and regenerates', async () => {
    const net = mockProviders({ groq: [{ text: JSON.stringify({ mnemonic: '' }) }], gemini: [{ text: VALID_FLASHCARD }] });
    const { runAIJSON } = await load();
    const { getValidator } = await import('@/lib/ai-schemas');
    const r = await runAIJSON({ ...base, task: 'mnemonic' }, getValidator('flashcard'));
    expect(r.data).toMatchObject({ mnemonic: 'PEMDAS' });
    expect(net.fn.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('image input', () => {
  it('never sends an image to a text-only provider', async () => {
    setEnv({ DEEPSEEK_API_KEY: 'dsk-aaaaaaaaaaaaaaaaaaaa' });
    const net = mockProviders({ deepseek: [{ text: 'ok' }] });
    const { runAIDetailed } = await load();
    await expect(runAIDetailed({ ...base, task: 'snap_read', image: IMAGE })).rejects.toMatchObject({ code: 'AI_NO_VISION' });
    expect(net.fn).not.toHaveBeenCalled();
  });

  it('skips Groq without a vision model and goes to Gemini', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_aaaaaaaaaaaaaaaaaaaa', GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' });
    const net = mockProviders({ gemini: [{ text: 'seen' }] });
    const { runAIDetailed } = await load();
    const r = await runAIDetailed({ ...base, task: 'snap_read', image: IMAGE });
    expect(r.provider).toBe('gemini');
    expect(net.count('groq')).toBe(0);
    expect(net.calls[0].body.contents[0].parts[0].inlineData.data).toBe('AAAA');
  });

  it('uses Groq for images only when a vision model is configured', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_aaaaaaaaaaaaaaaaaaaa', GROQ_VISION_MODEL: 'vision-model-x', GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' });
    const net = mockProviders({ gemini: [{ status: 500 }, { status: 500 }], groq: [{ text: 'seen by groq' }] });
    const { runAIDetailed } = await load();
    const r = await runAIDetailed({ ...base, task: 'snap_read', image: IMAGE });
    expect(r.provider).toBe('groq');
    expect(r.model).toBe('vision-model-x');
  }, 15_000);

  it('skips an OpenAI model that cannot read images, but allows one that can', async () => {
    setEnv({ OPENAI_API_KEY: 'sk-aaaaaaaaaaaaaaaaaaaaaaaa', OPENAI_MODEL: 'gpt-3.5-turbo' });
    let net = mockProviders({ openai: [{ text: 'ok' }] });
    let { runAIDetailed } = await load();
    await expect(runAIDetailed({ ...base, task: 'snap_read', image: IMAGE })).rejects.toMatchObject({ code: 'AI_NO_VISION' });
    expect(net.fn).not.toHaveBeenCalled();

    setEnv({ OPENAI_API_KEY: 'sk-aaaaaaaaaaaaaaaaaaaaaaaa', OPENAI_MODEL: 'gpt-4o-mini' });
    net = mockProviders({ openai: [{ text: 'ok' }] });
    ({ runAIDetailed } = await load());
    expect((await runAIDetailed({ ...base, task: 'snap_read', image: IMAGE })).provider).toBe('openai');
  });

  it('does not use a personal Groq key for images', async () => {
    setEnv({ GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' });
    const net = mockProviders({ gemini: [{ text: 'ok' }] });
    const { runAIDetailed } = await load();
    await runAIDetailed({ ...base, task: 'snap_read', image: IMAGE, userGroqKey: 'gsk_personalkey123456' });
    expect(net.count('groq')).toBe(0);
  });
});

describe('personal keys', () => {
  it('tries the personal key first and reports that it was used', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_serverkey1234567890', GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' });
    const net = mockProviders({ groq: [{ text: 'ok' }] });
    const { runAIDetailed } = await load();
    const r = await runAIDetailed({ ...base, task: 'adaptive_tutor', userGroqKey: 'gsk_personalkey123456' });
    expect(r.usedUserKey).toBe(true);
    expect(net.calls[0].headers.Authorization).toBe('Bearer gsk_personalkey123456');
  });

  it('userKeyOnly never touches the shared keys', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_serverkey1234567890', GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' });
    const net = mockProviders({ groq: [{ status: 401 }] });
    const { runAIDetailed } = await load();
    await expect(runAIDetailed({ ...base, task: 'adaptive_tutor', userGroqKey: 'gsk_personalkey123456', userKeyOnly: true }))
      .rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
    expect(net.calls.every(c => c.headers.Authorization === 'Bearer gsk_personalkey123456')).toBe(true);
    expect(net.count('gemini')).toBe(0);
  });

  it('userKeyOnly with no usable key makes no calls at all', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_serverkey1234567890' });
    const net = mockProviders({ groq: [{ text: 'ok' }] });
    const { runAIDetailed } = await load();
    await expect(runAIDetailed({ ...base, task: 'adaptive_tutor', userKeyOnly: true })).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
    expect(net.fn).not.toHaveBeenCalled();
  });
});

describe('logging', () => {
  it('records safe metadata and never keys, prompts or provider error bodies', async () => {
    const SECRET = 'gsk_SECRETKEYSECRETKEY1234';
    setEnv({ GROQ_API_KEY: SECRET, GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB' });
    mockProviders({
      groq: [{ status: 400, body: 'echo: STUDENT-PRIVATE-NOTES and key ' + SECRET }],
      gemini: [{ text: 'ok' }],
    });
    const { runAIDetailed } = await load();
    await runAIDetailed({ system: 'sys', prompt: 'STUDENT-PRIVATE-NOTES', task: 'course_builder' });
    const all = logs.join('\n');
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain('STUDENT-PRIVATE-NOTES');
    expect(all).not.toContain('echo:');
    const line = logs.find(l => l.includes('"ok":true'))!;
    const meta = JSON.parse(line.slice(line.indexOf('{')));
    expect(meta).toMatchObject({ task: 'course_builder', ok: true, provider: 'gemini', fallbacks: 1, failures: ['bad_request'] });
    expect(typeof meta.ms).toBe('number');
    expect(typeof meta.model).toBe('string');
  });

  it('logs a failure line when everything fails', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_aaaaaaaaaaaaaaaaaaaa' });
    mockProviders({ groq: [{ status: 429 }] });
    const { runAIDetailed } = await load();
    await runAIDetailed({ ...base, task: 'course_builder' }).catch(() => {});
    expect(logs.some(l => l.includes('"ok":false') && l.includes('rate_limit'))).toBe(true);
  });
});

void chatBody;
