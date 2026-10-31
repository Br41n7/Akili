import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
const grant = z.object({ email: z.string().trim().toLowerCase().email().max(200), days: z.number().int().min(1).max(3650) });
const revoke = z.object({ user_id: z.string().uuid() });

/** Recent Pro subscriptions, with the learner's email. */
export async function GET() {
  const a = await requireAdmin(); if (!a.ok) return a.res;
  const { data: subs, error } = await supabaseAdmin.from('subscriptions').select('*').eq('plan_id', 'pro').order('updated_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ subscriptions: [], error: error.code === '42P01' ? 'The plans tables are missing. Run migration 0012 in Supabase.' : 'Could not load subscriptions.' });
  const out = [];
  for (const s of subs || []) {
    const { data: p } = await supabaseAdmin.from('profiles').select('email, full_name').eq('id', s.user_id).maybeSingle();
    out.push({ user_id: s.user_id, email: (p as any)?.email ?? '', name: (p as any)?.full_name ?? '', status: s.status, current_period_end: s.current_period_end, source: s.source });
  }
  return NextResponse.json({ subscriptions: out });
}

/** Give a learner Pro for a number of days. Adds to any time they still have. */
export async function POST(req: NextRequest) {
  const a = await requireAdmin(); if (!a.ok) return a.res;
  let raw: unknown; try { raw = await req.json(); } catch { return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 }); }
  const p = grant.safeParse(raw); if (!p.success) return NextResponse.json({ error: 'Enter a valid email and a number of days from 1 to 3650.' }, { status: 400 });
  const { data: profile } = await supabaseAdmin.from('profiles').select('id, email').eq('email', p.data.email).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'No learner with that email has signed up.' }, { status: 404 });
  const uid = (profile as any).id as string;
  const { data: existing } = await supabaseAdmin.from('subscriptions').select('*').eq('user_id', uid).maybeSingle();
  const now = Date.now(); const cur = (existing as any)?.status === 'active' && (existing as any)?.plan_id === 'pro' && (existing as any)?.current_period_end ? Date.parse((existing as any).current_period_end) : 0;
  const end = new Date(Math.max(now, Number.isFinite(cur) ? cur : 0) + p.data.days * 86_400_000).toISOString();
  const { error } = await supabaseAdmin.from('subscriptions').upsert({ user_id: uid, plan_id: 'pro', status: 'active', current_period_end: end, source: 'admin', updated_by: a.userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: error.code === '42P01' ? 'The plans tables are missing. Run migration 0012 in Supabase.' : 'Could not grant Pro.' }, { status: 500 });
  await supabaseAdmin.from('plan_audit').insert({ actor_id: a.userId, action: 'grant_pro', target: uid, detail: { days: p.data.days, until: end } });
  return NextResponse.json({ user_id: uid, current_period_end: end });
}

/** End a learner's Pro now. */
export async function DELETE(req: NextRequest) {
  const a = await requireAdmin(); if (!a.ok) return a.res;
  let raw: unknown; try { raw = await req.json(); } catch { return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 }); }
  const p = revoke.safeParse(raw); if (!p.success) return NextResponse.json({ error: 'Unknown learner.' }, { status: 400 });
  const { error } = await supabaseAdmin.from('subscriptions').update({ status: 'cancelled', current_period_end: new Date().toISOString(), updated_by: a.userId, updated_at: new Date().toISOString() }).eq('user_id', p.data.user_id);
  if (error) return NextResponse.json({ error: 'Could not end Pro.' }, { status: 500 });
  await supabaseAdmin.from('plan_audit').insert({ actor_id: a.userId, action: 'revoke_pro', target: p.data.user_id, detail: {} });
  return NextResponse.json({ ok: true });
}
