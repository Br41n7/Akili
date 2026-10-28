import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { RESET_SENT_MESSAGE, recoveryLinkError, safeRedirect, validateNewPassword } from '@/lib/auth-flow';
import { isFreeBank, resolveAccess } from '@/lib/pastq-access';

const root = path.resolve(__dirname, '../..');
const U = '11111111-1111-4111-8111-111111111111';
const FREE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', PAID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', DRAFT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('forgot password pages exist (the 404)', () => {
  it('the link on the login page has a page behind it', () => {
    const login = readFileSync(path.join(root, 'app/auth/login/page.tsx'), 'utf8');
    const href = /href="(\/auth\/[a-z-]+)"[^>]*>\s*Forgot password/.exec(login)?.[1];
    expect(href).toBe('/auth/reset');
    expect(existsSync(path.join(root, 'app', href!, 'page.tsx'))).toBe(true);
  });
  it('the reset email lands on a real page', () => {
    const reset = readFileSync(path.join(root, 'app/auth/reset/page.tsx'), 'utf8');
    const target = /\/auth\/update-password/.exec(reset);
    expect(target).toBeTruthy();
    expect(existsSync(path.join(root, 'app/auth/update-password/page.tsx'))).toBe(true);
  });
  it('login honours the redirect it is given, signup no longer needs a payment reference', () => {
    expect(readFileSync(path.join(root, 'app/auth/login/page.tsx'), 'utf8')).toMatch(/safeRedirect\(searchParams\.get\('redirect'\)\)/);
    expect(readFileSync(path.join(root, 'app/auth/signup/page.tsx'), 'utf8')).toMatch(/if \(form\.bank_id\) \{/);
  });
});

describe('auth helpers', () => {
  it('safeRedirect allows only same-site paths', () => {
    expect(safeRedirect('/import?bank=abc&ref=')).toBe('/import?bank=abc&ref=');
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined, 'projects', '/\u0000x']) expect(safeRedirect(bad as any)).toBe('/projects');
  });
  it('validates a new password', () => {
    expect(validateNewPassword('short', 'short')).toMatch(/at least 8/);
    expect(validateNewPassword('longenough1', 'different1')).toMatch(/do not match/);
    expect(validateNewPassword('longenough1', 'longenough1')).toBeNull();
  });
  it('reads expired and invalid link errors from query or hash', () => {
    expect(recoveryLinkError('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toMatch(/expired/);
    expect(recoveryLinkError('?error=server_error', '')).toMatch(/not valid/);
    expect(recoveryLinkError('?code=abc', '')).toBeNull();
  });
  it('the reset confirmation does not reveal whether an account exists', () => { expect(RESET_SENT_MESSAGE).toMatch(/^If an account exists/); });
});

describe('access rules', () => {
  const bank = (o: object = {}) => ({ id: 'b', price: 0, status: 'live', ...o });
  it('free live banks are open to any signed-in user', () => { expect(resolveAccess(bank(), null)).toEqual({ ok: true, kind: 'free' }); expect(resolveAccess(bank({ status: 'approved' }), null).ok).toBe(true); });
  it('paid banks need a purchase', () => { const r = resolveAccess(bank({ price: 150000 }), null); expect(r).toMatchObject({ ok: false, code: 'NOT_PURCHASED' }); expect(resolveAccess(bank({ price: 150000 }), { id: 'p' })).toEqual({ ok: true, kind: 'purchased' }); });
  it('unpublished banks are closed, but a past purchase is still honoured', () => {
    expect(resolveAccess(bank({ status: 'pending' }), null)).toMatchObject({ ok: false, code: 'BANK_UNAVAILABLE' });
    expect(resolveAccess(bank({ status: 'rejected', price: 5000 }), { id: 'p' }).ok).toBe(true);
  });
  it('price "0", null and 0 all count as free', () => { expect(isFreeBank({ id: 'x', price: '0' })).toBe(true); expect(isFreeBank({ id: 'x', price: null })).toBe(true); expect(isFreeBank({ id: 'x', price: 1 })).toBe(false); });
});

// ── Route, with a small in-memory database ──────────────────────────────────
type Row = Record<string, any>;
let db: Record<string, Row[]>; let authed: { id: string } | null; let inserts: { table: string; row: Row }[]; let updates: { table: string; patch: Row; filters: [string, unknown][] }[];
const ai = { runAIWithRetry: vi.fn() };

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: authed } }) } }) }));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from(table: string) {
      const filters: [string, unknown][] = []; let patch: Row | null = null; let insertRow: Row | null = null;
      const rows = () => (db[table] || []).filter(r => filters.every(([c, v]) => r[c] === v));
      const b: any = {
        select: () => b, order: () => b, limit: () => b,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return patch ? Promise.resolve({ error: null }).then(r => { updates.push({ table, patch: patch!, filters: [...filters] }); return r; }) : b; },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => (insertRow ? { data: insertRow, error: null } : { data: rows()[0] ?? null, error: null }),
        insert: (row: Row) => { insertRow = { id: `new-${table}`, ...row }; inserts.push({ table, row: insertRow }); (db[table] ||= []).push(insertRow); return b; },
        update: (p: Row) => { patch = p; return b; },
        then: (res: any) => res({ data: rows(), error: null }),
      };
      return b;
    },
  },
}));
vi.mock('@/lib/ai', async () => { const a = await vi.importActual<typeof import('@/lib/ai')>('@/lib/ai'); return { ...a, runAIWithRetry: (...x: unknown[]) => ai.runAIWithRetry(...x) }; });

const questions = (bank: string) => [1, 2].map(n => ({ id: `q${n}`, bank_id: bank, question_number: n, question_text: `Q ${n}`, option_a: 'a', option_b: 'b', correct_answer: 'A' }));

async function post(bank_id: string) {
  vi.resetModules();
  const { POST } = await import('@/app/api/import-pastq/route');
  const res = await POST(new NextRequest('http://localhost/api/import-pastq', { method: 'POST', body: JSON.stringify({ bank_id }) }));
  return { status: res.status, json: await res.json() };
}
async function get(bank_id: string) {
  vi.resetModules();
  const { GET } = await import('@/app/api/import-pastq/route');
  const res = await GET(new NextRequest(`http://localhost/api/import-pastq?bank_id=${bank_id}`));
  return res.json();
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {});
  authed = { id: U }; inserts = []; updates = [];
  db = {
    question_banks: [
      { id: FREE, title: 'Free WAEC Maths', subject: 'Mathematics', exam_type: 'WAEC', price: 0, status: 'live' },
      { id: PAID, title: 'Paid JAMB Physics', subject: 'Physics', exam_type: 'JAMB', price: 200000, status: 'live' },
      { id: DRAFT, title: 'Draft', subject: 'Chemistry', exam_type: 'NECO', price: 0, status: 'pending' },
    ],
    questions: [...questions(FREE), ...questions(PAID), ...questions(DRAFT)],
    purchases: [], projects: [], documents: [], courses: [], profiles: [{ id: U, region: 'Nigeria', region_context: {} }],
  };
  ai.runAIWithRetry.mockReset().mockResolvedValue('{"title":"T","description":"d","modules":[],"topic_frequency":[],"predicted_topics":[],"top_topics":[]}');
});

describe('import route', () => {
  it('imports a FREE bank with no purchase (the reported failure)', async () => {
    const r = await post(FREE);
    expect(r.status).toBe(200); expect(r.json.success).toBe(true); expect(r.json.access).toBe('free');
    expect(inserts.find(i => i.table === 'projects')?.row).toMatchObject({ user_id: U, source: 'pastq', source_bank_id: FREE });
    expect(inserts.some(i => i.table === 'documents')).toBe(true);
    expect(updates.some(u => u.table === 'purchases')).toBe(false);
  });
  it('a second request for the same free bank reopens the project instead of duplicating it', async () => {
    await post(FREE);
    const again = await post(FREE);
    expect(again.json.already_imported).toBe(true);
    expect(inserts.filter(i => i.table === 'projects')).toHaveLength(1);
    expect(await get(FREE)).toMatchObject({ imported: true, free: true });
  });
  it('refuses a PAID bank with no purchase, with a code the page can explain', async () => {
    const r = await post(PAID);
    expect(r.status).toBe(403); expect(r.json.code).toBe('NOT_PURCHASED'); expect(inserts).toHaveLength(0);
  });
  it('still imports a paid bank once purchased, and marks the purchase', async () => {
    db.purchases.push({ id: 'p1', user_id: U, bank_id: PAID, paystack_status: 'success', imported_to_akili: false });
    const r = await post(PAID);
    expect(r.status).toBe(200); expect(r.json.access).toBe('purchased');
    expect(updates.find(u => u.table === 'purchases')?.patch).toMatchObject({ imported_to_akili: true });
  });
  it("another user's purchase does not unlock it", async () => {
    db.purchases.push({ id: 'p1', user_id: 'someone-else', bank_id: PAID, paystack_status: 'success' });
    expect((await post(PAID)).status).toBe(403);
  });
  it('rejects unpublished banks, missing banks, empty banks and signed-out users', async () => {
    expect((await post(DRAFT)).json.code).toBe('BANK_UNAVAILABLE');
    expect((await post('dddddddd-dddd-4ddd-8ddd-dddddddddddd')).status).toBe(404);
    db.questions = []; expect((await post(FREE)).json.code).toBe('BANK_EMPTY');
    authed = null; expect((await post(FREE)).status).toBe(401);
  });
  it('a failed AI step does not fail the import (questions are still saved)', async () => {
    ai.runAIWithRetry.mockRejectedValue(new Error('providers down'));
    const r = await post(FREE);
    expect(r.status).toBe(200); expect(r.json.course_generated).toBe(false); expect(inserts.some(i => i.table === 'documents')).toBe(true);
  });
  it('an unexpected failure returns a clean message, not internals', async () => {
    db.profiles = { filter: () => { throw new Error('boom: secret internals'); } } as any;
    const r = await post(FREE);
    expect(r.status).toBe(500); expect(r.json.code).toBe('IMPORT_FAILED'); expect(JSON.stringify(r.json)).not.toMatch(/boom|secret/);
  });
  it('declares a long enough time limit for the two AI steps', () => {
    expect(readFileSync(path.join(root, 'app/api/import-pastq/route.ts'), 'utf8')).toMatch(/export const maxDuration = 120/);
  });
});
