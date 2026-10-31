'use client';
import { useEffect, useState } from 'react';
import { capabilities, type Capabilities } from '@/lib/plan';
import { DEFAULT_PLANS, planCapabilities, type PlanRow } from '@/lib/plans-db';

export interface PlanView { caps: Capabilities; plan: PlanRow; pro: PlanRow; endsAt: string | null; loaded: boolean }

let cache: Promise<{ plan: PlanRow; plans: PlanRow[]; ends_at: string | null } | null> | null = null;
const fetchPlan = () => (cache ||= fetch('/api/plan').then(r => (r.ok ? r.json() : null)).catch(() => null));
/** Call after an admin changes a plan so the next read is fresh. */
export const resetPlanCache = () => { cache = null; };

/** The learner's plan as the server sees it. Until it loads (or if it cannot), the free defaults apply. */
export function usePlan(): PlanView {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPlan>>>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { let on = true; fetchPlan().then(d => { if (on) { setData(d); setLoaded(true); if (!d) cache = null; } }); return () => { on = false; }; }, []);
  const plan = data?.plan ?? DEFAULT_PLANS.free;
  const pro = (data?.plans as PlanRow[] | undefined)?.find(p => p.id === 'pro') ?? DEFAULT_PLANS.pro;
  return { caps: data ? planCapabilities(plan) : capabilities(), plan, pro, endsAt: data?.ends_at ?? null, loaded };
}
