import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDb } from './fakedb';

let db: ReturnType<typeof makeDb>;
let user: { id: string } | null = { id: 'u1' };
const sendPush = vi.fn();
let configured = true;

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => db.client.from(t) } }));
vi.mock('@/lib/push', () => ({ pushConfigured: () => configured, sendPush: (...a: any[]) => sendPush(...a) }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }));

const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
const post = (url: string, body: any, headers: Record<string, string> = {}) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_AKILI_FEATURES;
  vi.resetModules(); sendPush.mockReset(); configured = true; user = { id: 'u1' }; process.env.CRON_SECRET = 'secret';
  db = makeDb({ study_plans: [], push_subscriptions: [], profiles: [], flashcards: [], learner_concepts: [], projects: [] });
});

describe('subscribe route', () => {
  it('rejects anonymous and malformed, stores a good one, then removes it', async () => {
    const { POST, DELETE } = await import('@/app/api/push/subscribe/route');
    user = null; expect((await POST(post('http://x/api/push/subscribe', { subscription: sub }) as any)).status).toBe(401);
    user = { id: 'u1' };
    expect((await POST(post('http://x/api/push/subscribe', { subscription: { endpoint: 'http://bad' } }) as any)).status).toBe(400);
    expect((await POST(post('http://x/api/push/subscribe', { subscription: sub }) as any)).status).toBe(200);
    expect(db.tables.push_subscriptions).toHaveLength(1);
    expect((await POST(post('http://x/api/push/subscribe', { subscription: sub }) as any)).status).toBe(200);
    expect(db.tables.push_subscriptions).toHaveLength(1); // upsert, not duplicate
    const del = new Request('http://x/api/push/subscribe', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    expect((await DELETE(del as any)).status).toBe(200); expect(db.tables.push_subscriptions).toHaveLength(0);
  });
});

describe('cron route', () => {
  const call = async (headers: Record<string, string> = {}) => {
    const { GET } = await import('@/app/api/push/cron/route');
    return GET(new Request('http://x/api/push/cron', { headers }) as any);
  };
  const lagos18 = () => { process.env.NEXT_PUBLIC_AKILI_FEATURES = 'hourly_reminders'; vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T17:10:00Z')); };
  const seed = () => {
    db.tables.profiles.push({ id: 'u1', reminders_enabled: true, reminder_hour: 18, reminder_tz: 'Africa/Lagos', last_reminder_on: null });
    db.tables.push_subscriptions.push({ id: 's1', user_id: 'u1', ...{ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    db.tables.projects.push({ id: 'p1', user_id: 'u1', created_at: '2026-10-01' });
  };

  it('uses today\'s study plan in the message when one exists, and the normal reminder when the plan is done', async () => {
    const { generatePlan } = await import('@/lib/study-plan');
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T15:00:00Z')); seed(); sendPush.mockResolvedValue('ok');
    const r = generatePlan({ today: '2026-10-24', examDate: '2026-11-20', minutesPerDay: 60, daysOff: [], lessons: [{ id: 'l1', title: 'Cell structure', module: 'M1', minutes: 25 }], doneLessonIds: [], weak: [] });
    if (!r.ok) throw new Error(r.error);
    db.tables.study_plans.push({ user_id: 'u1', project_id: 'p9', exam_date: '2026-11-20', plan: r.plan, done_task_ids: [] });
    await call({ authorization: 'Bearer secret' });
    expect(sendPush.mock.calls[0][1]).toMatchObject({ title: "Today's study plan", url: '/projects/p9?tab=plan' }); expect(sendPush.mock.calls[0][1].body).toContain('Cell structure');
    // everything for today already ticked: falls back to the usual reminder
    db.tables.profiles[0].last_reminder_on = null; sendPush.mockClear();
    db.tables.study_plans[0].done_task_ids = r.plan.days.find(d => d.date === '2026-10-24')!.tasks.map(t => t.id);
    await call({ authorization: 'Bearer secret' });
    expect(sendPush.mock.calls[0][1].title).not.toBe("Today's study plan"); vi.useRealTimers();
  });
  it('is closed without the secret, and unconfigured servers say so', async () => {
    expect((await call()).status).toBe(401); expect((await call({ authorization: 'Bearer nope' })).status).toBe(401);
    delete process.env.CRON_SECRET; expect((await call({ authorization: 'Bearer x' })).status).toBe(503);
  });
  it('free setup: the daily run reminds anyone due, whatever their chosen hour', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T15:00:00Z')); seed(); sendPush.mockResolvedValue('ok');
    await call({ authorization: 'Bearer secret' }); expect(sendPush).toHaveBeenCalledTimes(1); vi.useRealTimers();
  });
  it('paid hourly setup: only at the chosen hour', async () => {
    process.env.NEXT_PUBLIC_AKILI_FEATURES = 'hourly_reminders';
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T15:00:00Z')); seed(); sendPush.mockResolvedValue('ok');
    await call({ authorization: 'Bearer secret' }); expect(sendPush).not.toHaveBeenCalled(); delete process.env.NEXT_PUBLIC_AKILI_FEATURES; vi.useRealTimers();
  });
  it('sends once at the chosen hour and marks the day only after delivery', async () => {
    lagos18(); seed(); sendPush.mockResolvedValue('ok');
    const r = await call({ authorization: 'Bearer secret' }); expect(r.status).toBe(200);
    expect(sendPush).toHaveBeenCalledTimes(1); expect(db.tables.profiles[0].last_reminder_on).toBe('2026-10-24');
    sendPush.mockClear(); await call({ authorization: 'Bearer secret' }); expect(sendPush).not.toHaveBeenCalled(); // already sent today
    vi.useRealTimers();
  });
  it('skips other hours (hourly), a failed send does not use up the day, and a gone device is deleted', async () => {
    process.env.NEXT_PUBLIC_AKILI_FEATURES = 'hourly_reminders';
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T10:00:00Z')); seed(); sendPush.mockResolvedValue('ok');
    await call({ authorization: 'Bearer secret' }); expect(sendPush).not.toHaveBeenCalled();
    vi.setSystemTime(new Date('2026-10-24T17:10:00Z')); sendPush.mockResolvedValue('failed');
    await call({ authorization: 'Bearer secret' }); expect(db.tables.profiles[0].last_reminder_on).toBeNull();
    sendPush.mockResolvedValue('gone'); await call({ authorization: 'Bearer secret' });
    expect(db.tables.push_subscriptions).toHaveLength(0); expect(db.tables.profiles[0].last_reminder_on).toBeNull();
    vi.useRealTimers();
  });
});

describe('test route', () => {
  it('needs a login, configuration and a device; then sends and rate-limits', async () => {
    const { POST } = await import('@/app/api/push/test/route'); const go = () => POST();
    user = null; expect((await go()).status).toBe(401); user = { id: 'u1' };
    configured = false; expect((await go()).status).toBe(503); configured = true;
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T10:00:00Z'));
    expect((await go()).status).toBe(404); vi.setSystemTime(new Date('2026-10-25T10:01:00Z'));
    db.tables.push_subscriptions.push({ id: 's1', user_id: 'u1', endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
    sendPush.mockResolvedValue('ok'); expect((await go()).status).toBe(200);
    expect((await go()).status).toBe(429); vi.useRealTimers();
  });
});
