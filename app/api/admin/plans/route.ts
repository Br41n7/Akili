import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin-auth';
import { loadPlans, validatePlanUpdate } from '@/lib/plans-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const a = await requireAdmin(); if (!a.ok) return a.res;
  const plans = await loadPlans(supabaseAdmin);
  return NextResponse.json({ plans: [plans.free, plans.pro] });
}

/** Change a plan's price, limits, features or name. Every change is checked against fixed bounds and written to the audit log. */
export async function PUT(req: NextRequest) {
  const a = await requireAdmin(); if (!a.ok) return a.res;
  let raw: unknown; try { raw = await req.json(); } catch { return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 }); }
  const v = validatePlanUpdate(raw);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const before = (await loadPlans(supabaseAdmin))[v.value.id];
  const { id, limits, ...rest } = v.value;
  const patch = { ...rest, ...(limits ? { limits: { ...before.limits, ...limits } } : {}), updated_at: new Date().toISOString() };
  const { error } = await supabaseAdmin.from('plans').upsert({ id, name: before.name, price_kobo: before.price_kobo, features: before.features, limits: before.limits, ...patch }, { onConflict: 'id' });
  if (error) {
    console.error('[admin/plans] save failed:', error.code, error.message);
    return NextResponse.json({ error: error.code === '42P01' ? 'The plans table is missing. Run migration 0012 in Supabase.' : 'Could not save the plan.' }, { status: 500 });
  }
  await supabaseAdmin.from('plan_audit').insert({ actor_id: a.userId, action: 'plan_update', target: id, detail: { change: v.value } });
  return NextResponse.json({ plan: (await loadPlans(supabaseAdmin))[id] });
}
