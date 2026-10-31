import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { HOURLY_LIMIT, feedbackSchema, toRow } from '@/lib/feedback';
import { loadUserPlan } from '@/lib/plans-db';

export const dynamic = 'force-dynamic';

/** Save one piece of feedback from the signed-in learner. Validated, cleaned to plain text, and rate limited. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  let raw: unknown; try { raw = await req.json(); } catch { return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 }); }
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Check your feedback and try again.' }, { status: 400 });

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await supabaseAdmin.from('feedback').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
  if ((count ?? 0) >= HOURLY_LIMIT) return NextResponse.json({ error: 'You have sent a lot of feedback this hour. Thank you. Please try again later.' }, { status: 429 });

  const { id: planId } = await loadUserPlan(supabaseAdmin, user.id);
  const { error } = await supabaseAdmin.from('feedback').insert(toRow(parsed.data, user.id, planId));
  if (error) {
    console.error('[feedback] save failed:', error.code, error.message);
    return NextResponse.json({ error: error.code === '42P01' ? 'Feedback is not set up yet. Ask the site owner to run the latest database update.' : 'We could not save your feedback. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
