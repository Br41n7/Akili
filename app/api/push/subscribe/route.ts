import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { parseSubscription } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_DEVICES = 5;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Please sign in again.', 401);

  let body: any; try { body = await req.json(); } catch { return fail('That request could not be read.', 400); }
  const sub = parseSubscription(body?.subscription);
  if (!sub) return fail('That notification subscription is not valid.', 400);

  // The same browser may be used by two accounts; the endpoint then belongs to whoever subscribed last.
  const { error } = await supabaseAdmin.from('push_subscriptions').upsert({
    user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
    user_agent: (req.headers.get('user-agent') || '').slice(0, 200), failure_count: 0,
  }, { onConflict: 'endpoint' });
  if (error) return fail('Could not save the subscription. Please try again.', 500);

  // Keep the newest few devices only.
  const { data: all } = await supabaseAdmin.from('push_subscriptions').select('id, created_at').eq('user_id', user.id).order('created_at', { ascending: false });
  const extra = (all || []).slice(MAX_DEVICES);
  for (const row of extra) await supabaseAdmin.from('push_subscriptions').delete().eq('id', row.id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Please sign in again.', 401);
  let body: any; try { body = await req.json(); } catch { return fail('That request could not be read.', 400); }
  if (typeof body?.endpoint !== 'string') return fail('endpoint required', 400);
  await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', body.endpoint);
  return NextResponse.json({ ok: true });
}
