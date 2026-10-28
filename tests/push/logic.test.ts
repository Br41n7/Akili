import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import { PERSONA_CHOICES, isChoosablePersona } from '@/lib/personas';
import { PERSONA_IDS } from '@/lib/ai-tasks';
import { recommend, STALE_DAYS } from '@/lib/recommendations';
import { buildReminder, hourLabel, isDue, isValidTimeZone, localParts, parseReminderSettings, parseSubscription, reminderSupport, safeNotificationUrl, urlBase64ToUint8Array } from '@/lib/reminders';

describe('personas', () => {
  it('every choice is a persona the AI route knows, and the internal planner is not offered', () => {
    for (const p of PERSONA_CHOICES) expect(PERSONA_IDS).toContain(p.id);
    expect(isChoosablePersona('planner')).toBe(false); expect(isChoosablePersona('<script>')).toBe(false); expect(isChoosablePersona('socratic')).toBe(true);
  });
});

describe('recommendations', () => {
  const c = (concept: string, m: number, extra: object = {}) => ({ concept, mastery_score: m, exposure_count: 3, ...extra });
  const now = new Date('2026-10-24T12:00:00Z');
  it('a new learner is sent to add material, then to a first quiz', () => {
    expect(recommend({ concepts: [], dueFlashcards: 0, hasMaterials: false, now })[0]).toMatchObject({ kind: 'start', target: 'materials' });
    expect(recommend({ concepts: [], dueFlashcards: 0, hasMaterials: true, now })[0]).toMatchObject({ kind: 'start', target: 'quiz' });
  });
  it('due flashcards come first; weakest concepts follow; strong ones are left alone', () => {
    const r = recommend({ concepts: [c('Osmosis', 0.2), c('Diffusion', 0.3), c('Cells', 0.9)], dueFlashcards: 3, hasMaterials: true, now });
    expect(r.map(x => x.kind)).toEqual(['flashcards', 'weak', 'weak']); expect(r[0].title).toBe('Review 3 flashcards'); expect(r[1].concept).toBe('Osmosis');
    expect(recommend({ concepts: [c('Cells', 0.9)], dueFlashcards: 1, hasMaterials: true, now })[0].title).toBe('Review 1 flashcard');
  });
  it('a repeated miss or known misconception sends them to Get unstuck, not just another quiz', () => {
    expect(recommend({ concepts: [c('Osmosis', 0.2, { consecutive_incorrect: 3 })], dueFlashcards: 0, hasMaterials: true, now })[0]).toMatchObject({ target: 'help', title: 'Get unstuck on Osmosis' });
    expect(recommend({ concepts: [c('Osmosis', 0.3, { misconception: 'water is pushed' })], dueFlashcards: 0, hasMaterials: true, now })[0].reason).toContain('water is pushed');
    expect(recommend({ concepts: [c('Osmosis', 0.3)], dueFlashcards: 0, hasMaterials: true, now })[0].target).toBe('quiz');
  });
  it('ignores concepts never attempted, and suggests a refresh only for strong concepts left alone for weeks', () => {
    expect(recommend({ concepts: [c('Unseen', 0.1, { exposure_count: 0 })], dueFlashcards: 0, hasMaterials: true, now })).toEqual([]);
    const old = new Date(now.getTime() - (STALE_DAYS + 3) * 86_400_000).toISOString(), fresh = new Date(now.getTime() - 86_400_000).toISOString();
    const r = recommend({ concepts: [c('Cells', 0.9, { last_practiced_at: old }), c('Atoms', 0.9, { last_practiced_at: fresh })], dueFlashcards: 0, hasMaterials: true, now });
    expect(r).toHaveLength(1); expect(r[0]).toMatchObject({ kind: 'refresh', concept: 'Cells' });
  });
  it('shows at most four, and survives bad numbers', () => {
    const many = Array.from({ length: 10 }, (_, i) => c(`C${i}`, 0.1 + i / 100));
    expect(recommend({ concepts: many, dueFlashcards: 5, hasMaterials: true, now }).length).toBeLessThanOrEqual(4);
    expect(() => recommend({ concepts: [c('X', NaN as any)], dueFlashcards: 0, hasMaterials: true, now })).not.toThrow();
  });
});

describe('reminder rules', () => {
  it('reads the hour and day in the learner\'s own time zone', () => {
    const t = new Date('2026-10-24T23:30:00Z');
    expect(localParts(t, 'Africa/Lagos')).toEqual({ hour: 0, ymd: '2026-10-25' }); // 00:30 next day in Lagos (UTC+1)
    expect(localParts(t, 'America/New_York')).toEqual({ hour: 19, ymd: '2026-10-24' });
    expect(localParts(t, 'Not/AZone')).toEqual({ hour: 0, ymd: '2026-10-25' }); // falls back to Lagos
    expect(isValidTimeZone('Africa/Lagos')).toBe(true); expect(isValidTimeZone('x'.repeat(100))).toBe(false); expect(isValidTimeZone(5)).toBe(false);
  });
  const H = { hourly: true };
  it('is due once, at the chosen hour (hourly mode), when switched on', () => {
    const t = new Date('2026-10-24T17:10:00Z'); // 18:10 in Lagos
    const p = { reminders_enabled: true, reminder_hour: 18, reminder_tz: 'Africa/Lagos', last_reminder_on: null };
    expect(isDue(p, t, H)).toEqual({ due: true, ymd: '2026-10-24' });
    expect(isDue({ ...p, last_reminder_on: '2026-10-24' }, t, H).due).toBe(false);
    expect(isDue({ ...p, reminders_enabled: false }, t, H).due).toBe(false);
    expect(isDue({ ...p, reminder_hour: 19 }, t, H).due).toBe(false);
    expect(isDue({ ...p, last_reminder_on: '2026-10-23' }, t, H).due).toBe(true);
  });
  it('the message follows what the learner needs and reveals no scores', () => {
    expect(buildReminder({ dueFlashcards: 3, firstProjectId: 'p1' })).toMatchObject({ title: 'Flashcards are due', url: '/projects/p1?tab=flashcards' });
    expect(buildReminder({ dueFlashcards: 1, firstProjectId: 'p1' }).body).toContain('1 flashcard is');
    const w = buildReminder({ dueFlashcards: 0, weak: { concept: 'Osmosis', projectId: 'p2' } });
    expect(w.body).toContain('Osmosis'); expect(w.url).toBe('/projects/p2?tab=quiz'); expect(w.body).not.toMatch(/\d+%/);
    expect(buildReminder({ dueFlashcards: 0 })).toMatchObject({ title: 'Time to study', url: '/projects' });
  });
  it('a notification may only open this site', () => {
    expect(safeNotificationUrl('/projects/x?tab=quiz')).toBe('/projects/x?tab=quiz');
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil', 'javascript:1', null, 5]) expect(safeNotificationUrl(bad)).toBe('/projects');
  });
  it('validates a browser subscription', () => {
    const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
    expect(parseSubscription(good)).toEqual(good);
    for (const bad of [null, {}, { ...good, endpoint: 'http://x.com/a' }, { ...good, endpoint: 'javascript:alert(1)' }, { ...good, keys: { p256dh: '<x>', auth: 'y' } }, { endpoint: good.endpoint }]) expect(parseSubscription(bad)).toBeNull();
  });
  it('validates reminder settings field by field', () => {
    expect(parseReminderSettings({ reminders_enabled: true, reminder_hour: 7, reminder_tz: 'Africa/Lagos', persona: 'x' })).toEqual({ ok: true, value: { reminders_enabled: true, reminder_hour: 7, reminder_tz: 'Africa/Lagos' } });
    for (const bad of [{ reminder_hour: 24 }, { reminder_hour: 1.5 }, { reminder_hour: '8' }, { reminders_enabled: 'yes' }, { reminder_tz: 'Mars/Base' }]) expect(parseReminderSettings(bad as any).ok).toBe(false);
  });
  it('explains why reminders cannot be turned on', () => {
    const ok = { hasKey: true, hasServiceWorker: true, hasPush: true, hasNotification: true, isIOS: false, standalone: false, permission: 'default', hasRegistration: true };
    expect(reminderSupport(ok)).toBe('ok'); expect(reminderSupport({ ...ok, hasKey: false })).toBe('unconfigured');
    expect(reminderSupport({ ...ok, isIOS: true })).toBe('ios_install'); expect(reminderSupport({ ...ok, isIOS: true, standalone: true })).toBe('ok');
    expect(reminderSupport({ ...ok, hasPush: false })).toBe('unsupported'); expect(reminderSupport({ ...ok, permission: 'denied' })).toBe('denied'); expect(reminderSupport({ ...ok, hasRegistration: false })).toBe('no_worker');
  });
  it('decodes a VAPID key and labels hours', () => {
    expect(urlBase64ToUint8Array('AQID')).toEqual(new Uint8Array([1, 2, 3])); expect(urlBase64ToUint8Array('-_8').length).toBe(2);
    expect(hourLabel(0)).toBe('12:00 AM'); expect(hourLabel(12)).toBe('12:00 PM'); expect(hourLabel(18)).toBe('6:00 PM');
  });
});

describe('service worker push handling', () => {
  const load = () => {
    const listeners: Record<string, (e: any) => void> = {};
    const shown: any[] = []; const opened: string[] = []; const focused: string[] = [];
    (globalThis as any).self = { addEventListener: (n: string, f: any) => { listeners[n] = f; }, location: { origin: 'https://akili.test' }, registration: { showNotification: (t: string, o: any) => { shown.push({ t, o }); return Promise.resolve(); } } };
    (globalThis as any).clients = { matchAll: async () => [], openWindow: async (u: string) => { opened.push(u); } };
    const req = createRequire(import.meta.url); const p = path.resolve(__dirname, '../../public/sw.js'); delete req.cache[p];
    const sw = req(p); return { listeners, shown, opened, focused, sw };
  };
  const wait = async (e: { p?: Promise<any> }) => { await e.p; };
  it('shows what was sent, with this site\'s icon and a safe link', async () => {
    const { listeners, shown } = load(); const e: any = { data: { json: () => ({ title: 'Flashcards are due', body: '3 ready', url: '/projects/p?tab=flashcards', tag: 'akili-daily' }) }, waitUntil(p: any) { this.p = p; } };
    listeners.push(e); await wait(e);
    expect(shown[0].t).toBe('Flashcards are due'); expect(shown[0].o).toMatchObject({ body: '3 ready', icon: '/icons/icon-192.png', data: { url: '/projects/p?tab=flashcards' } });
  });
  it('an off-site link in a push is replaced, and a broken payload still shows a notification', async () => {
    const { listeners, shown } = load();
    const a: any = { data: { json: () => ({ title: 'x', url: 'https://evil.com' }) }, waitUntil(p: any) { this.p = p; } }; listeners.push(a); await wait(a);
    expect(shown[0].o.data.url).toBe('/projects');
    const b: any = { data: { json: () => { throw new Error('bad'); }, text: () => 'plain text' }, waitUntil(p: any) { this.p = p; } }; listeners.push(b); await wait(b);
    expect(shown[1].t).toBe('Akili'); expect(shown[1].o.body).toBe('plain text');
  });
  it('clicking opens the page; a hostile stored url cannot leave the site', async () => {
    const { listeners, opened } = load();
    const click = (url: string) => { const e: any = { notification: { close() {}, data: { url } }, waitUntil(p: any) { this.p = p; } }; listeners.notificationclick(e); return e.p; };
    await click('/projects/p?tab=quiz'); await click('//evil.com'); expect(opened).toEqual(['/projects/p?tab=quiz', '/projects']);
  });
  it('still keeps the earlier rule: never caches the API', () => {
    const { sw } = load(); expect(sw.classify({ url: 'https://akili.test/api/push/cron', method: 'GET', mode: 'cors' }, 'https://akili.test')).toBe('ignore');
  });
});

import { capabilities } from '@/lib/plan';
describe('plan capabilities', () => {
  it('is free by default; paid features need the env switch', () => {
    const free = capabilities({});
    expect(free.plan).toBe('free'); expect(free.has('hourly_reminders')).toBe(false); expect(free.limits.dailyImageGenerations).toBe(0);
    expect(capabilities({ NEXT_PUBLIC_AKILI_PLAN: 'nonsense' }).plan).toBe('free');
    const pro = capabilities({ NEXT_PUBLIC_AKILI_PLAN: ' PRO ' }); expect(pro.plan).toBe('pro'); expect(pro.has('video_export')).toBe(true);
    const one = capabilities({ NEXT_PUBLIC_AKILI_FEATURES: 'Cloud_TTS, hourly_reminders' });
    expect(one.has('cloud_tts')).toBe(true); expect(one.has('image_generation')).toBe(false); expect(one.plan).toBe('free');
  });
  it('free reminders go out once a day to anyone not yet reminded; hourly waits for the chosen hour', () => {
    const t = new Date('2026-10-24T15:00:00Z'); // 16:00 in Lagos
    const p = { reminders_enabled: true, reminder_hour: 18, reminder_tz: 'Africa/Lagos', last_reminder_on: null };
    expect(isDue(p, t).due).toBe(true); expect(isDue(p, t, { hourly: true }).due).toBe(false);
    expect(isDue({ ...p, last_reminder_on: '2026-10-24' }, t).due).toBe(false);
  });
});
