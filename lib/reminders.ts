/** Push reminders: pure helpers shared by the settings screen, the API and the daily job. */

export interface LocalParts { hour: number; ymd: string }

/** The hour and calendar day in a time zone. An unknown zone falls back to Lagos, where Akili's learners are. */
export function localParts(now: Date, tz: string): LocalParts {
  const zone = isValidTimeZone(tz) ? tz : 'Africa/Lagos';
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(now).map(x => [x.type, x.value]));
  return { hour: Number(p.hour), ymd: `${p.year}-${p.month}-${p.day}` };
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

export interface ReminderProfile { reminders_enabled?: boolean | null; reminder_hour?: number | null; reminder_tz?: string | null; last_reminder_on?: string | null }

/**
 * Due when switched on and today's has not gone out. With hourly checks (paid scheduler) it also waits for the
 * learner's chosen hour; on the free setup the job runs once a day, so anyone not yet reminded today is due.
 */
export function isDue(p: ReminderProfile, now: Date, opts: { hourly?: boolean } = {}): { due: boolean; ymd: string } {
  const { hour, ymd } = localParts(now, p.reminder_tz || 'Africa/Lagos');
  const hourOk = opts.hourly ? hour === (p.reminder_hour ?? 18) : true;
  return { due: !!p.reminders_enabled && hourOk && p.last_reminder_on !== ymd, ymd };
}

export interface ReminderMessage { title: string; body: string; url: string; tag: string }
export interface ReminderSignals { dueFlashcards: number; weak?: { concept: string; projectId: string } | null; firstProjectId?: string | null }

/** What the notification says. It names a concept at most; never a score, an answer or anything private. */
export function buildReminder(s: ReminderSignals): ReminderMessage {
  const project = (id: string | null | undefined, tab: string) => (id ? `/projects/${id}?tab=${tab}` : '/projects');
  if (s.dueFlashcards > 0) {
    return { title: 'Flashcards are due', body: `${s.dueFlashcards} flashcard${s.dueFlashcards === 1 ? ' is' : 's are'} ready to review. It takes about 5 minutes.`, url: project(s.firstProjectId ?? s.weak?.projectId, 'flashcards'), tag: 'akili-daily' };
  }
  if (s.weak) {
    return { title: 'Ten minutes for Akili?', body: `${s.weak.concept} needs a little practice. A short quiz will help.`, url: project(s.weak.projectId, 'quiz'), tag: 'akili-daily' };
  }
  return { title: 'Time to study', body: 'A short session today keeps what you learned fresh.', url: project(s.firstProjectId, 'quiz'), tag: 'akili-daily' };
}

/** A notification may only open a page on this site. */
export function safeNotificationUrl(raw: unknown, fallback = '/projects'): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  return raw;
}

export interface PushSubscriptionJSONLike { endpoint: string; keys: { p256dh: string; auth: string } }

/** Checks what the browser sent before it is stored. Push endpoints are always https. */
export function parseSubscription(raw: unknown): PushSubscriptionJSONLike | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  const endpoint = o.endpoint, p256dh = o.keys?.p256dh, auth = o.keys?.auth;
  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !/^https:\/\/[^\s]+$/.test(endpoint)) return null;
  const b64 = /^[A-Za-z0-9_-]{16,200}={0,2}$/;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !b64.test(p256dh) || !b64.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export function parseReminderSettings(raw: Record<string, unknown>): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  if ('reminders_enabled' in raw) { if (typeof raw.reminders_enabled !== 'boolean') return { ok: false, error: 'reminders_enabled must be true or false' }; out.reminders_enabled = raw.reminders_enabled; }
  if ('reminder_hour' in raw) {
    const h = raw.reminder_hour;
    if (typeof h !== 'number' || !Number.isInteger(h) || h < 0 || h > 23) return { ok: false, error: 'reminder_hour must be a whole number from 0 to 23' };
    out.reminder_hour = h;
  }
  if ('reminder_tz' in raw) { if (!isValidTimeZone(raw.reminder_tz)) return { ok: false, error: 'That time zone is not recognised' }; out.reminder_tz = raw.reminder_tz; }
  return { ok: true, value: out };
}

export function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

export type SupportState = 'ok' | 'unconfigured' | 'unsupported' | 'ios_install' | 'denied' | 'no_worker';

/** Why reminders can or cannot be switched on in this browser. Checked in the order a learner would hit them. */
export function reminderSupport(e: { hasKey: boolean; hasServiceWorker: boolean; hasPush: boolean; hasNotification: boolean; isIOS: boolean; standalone: boolean; permission: string; hasRegistration: boolean }): SupportState {
  if (!e.hasKey) return 'unconfigured';
  // iPhones only allow web push for an app added to the Home Screen.
  if (e.isIOS && !e.standalone) return 'ios_install';
  if (!e.hasServiceWorker || !e.hasPush || !e.hasNotification) return 'unsupported';
  if (e.permission === 'denied') return 'denied';
  if (!e.hasRegistration) return 'no_worker';
  return 'ok';
}
