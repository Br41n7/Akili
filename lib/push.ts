import webpush from 'web-push';
import type { ReminderMessage } from '@/lib/reminders';

/** Server-only. VAPID keys identify this app to the browsers' push services. */
let configured = false;
export function pushConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@akili.app', pub, priv);
    configured = true;
  }
  return true;
}

export type SendResult = 'ok' | 'gone' | 'failed';

/** 404 and 410 mean the browser has dropped the subscription for good; anything else may be temporary. */
export async function sendPush(sub: { endpoint: string; p256dh: string; auth: string }, message: ReminderMessage): Promise<SendResult> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), { TTL: 6 * 3600, urgency: 'normal' });
    return 'ok';
  } catch (err: any) {
    const status = err?.statusCode;
    if (status === 404 || status === 410) return 'gone';
    console.warn('[push] send failed:', status || err?.message);
    return 'failed';
  }
}
