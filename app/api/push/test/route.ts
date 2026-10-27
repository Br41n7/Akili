import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { pushConfigured, sendPush } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LAST = new Map<string, number>();
const fail = (error: string, status: number, code?: string) => NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

/** "Send me a test": proves the whole path works on this device. One a half-minute per learner. */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Please sign in again.', 401);
  if (!pushConfigured()) return fail('Reminders are not set up on this server yet.', 503, 'PUSH_NOT_CONFIGURED');

  const now = Date.now();
  if (now - (LAST.get(user.id) ?? 0) < 30_000) return fail('Wait a few seconds before sending another test.', 429);
  LAST.set(user.id, now);

  const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', user.id);
  if (!subs?.length) return fail('This device is not subscribed yet. Turn reminders on first.', 404, 'NO_SUBSCRIPTION');

  let sent = 0;
  for (const s of subs) {
    const r = await sendPush(s, { title: 'Akili reminders are on', body: 'This is a test. You will get a short nudge like this at your chosen time.', url: '/projects', tag: 'akili-test' });
    if (r === 'ok') sent++;
    if (r === 'gone') await supabaseAdmin.from('push_subscriptions').delete().eq('id', s.id);
  }
  return sent ? NextResponse.json({ ok: true, sent }) : fail('The notification could not be delivered. Turn reminders off and on again.', 502, 'DELIVERY_FAILED');
}
