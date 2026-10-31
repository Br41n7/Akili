import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { loadUserPlan } from '@/lib/plans-db';

export const dynamic = 'force-dynamic';

/** The signed-in learner's current plan and the public plan list (for the upgrade prompt). Contains no secrets. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const u = await loadUserPlan(supabaseAdmin, user.id);
  return NextResponse.json({ plan: u.plan, ends_at: u.endsAt, plans: Object.values(u.plans).filter(p => p.active) });
}
