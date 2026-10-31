import { FEATURES, capabilities, type Capabilities, type Feature } from './plan';
import { FREE_DAILY_LIMIT } from './ai-quota';

/**
 * Plans as DATA (migration 0012). An admin edits prices, limits and features in the app; the code only reads them.
 * If the plans tables are missing or unreachable, the built-in defaults below apply, so the app never breaks.
 * Nothing here is server-only, so the browser builds its view of a plan with the same code the server enforces with.
 */
export type PlanId = 'free' | 'pro';
export interface PlanLimits {
  daily_ai: number; course_material_chars: number; max_projects: number | null; daily_image_generations: number; daily_visual_plans: number;
}
export interface PlanRow { id: PlanId; name: string; price_kobo: number | null; currency: string; interval: 'month'; active: boolean; features: Feature[]; limits: PlanLimits }
export interface SubscriptionRow { user_id: string; plan_id: string; status: string; current_period_end: string | null; source?: string }

export const DEFAULT_PLANS: Record<PlanId, PlanRow> = {
  free: { id: 'free', name: 'Free', price_kobo: 0, currency: 'NGN', interval: 'month', active: true, features: [],
    limits: { daily_ai: FREE_DAILY_LIMIT, course_material_chars: 30_000, max_projects: 5, daily_image_generations: 0, daily_visual_plans: 10 } },
  pro: { id: 'pro', name: 'Pro', price_kobo: null, currency: 'NGN', interval: 'month', active: true, features: [...FEATURES],
    limits: { daily_ai: 200, course_material_chars: 150_000, max_projects: null, daily_image_generations: 20, daily_visual_plans: 100 } },
};

// Bounds an admin may set. Keeps a typo (an extra zero, a negative) from breaking the app or the bill.
export const LIMIT_BOUNDS: Record<keyof PlanLimits, { min: number; max: number; nullable?: boolean }> = {
  daily_ai: { min: 1, max: 100_000 }, course_material_chars: { min: 5_000, max: 1_000_000 }, max_projects: { min: 1, max: 100_000, nullable: true },
  daily_image_generations: { min: 0, max: 10_000 }, daily_visual_plans: { min: 0, max: 10_000 },
};
export const MAX_PRICE_KOBO = 100_000_00; // 100,000 naira

const isFeature = (f: unknown): f is Feature => typeof f === 'string' && (FEATURES as string[]).includes(f);
const intIn = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback);

/** A database row (jsonb is untrusted shape) becomes a complete, valid plan; missing or bad parts fall back to the defaults. */
export function normalisePlan(row: any, id: PlanId): PlanRow {
  const d = DEFAULT_PLANS[id]; const l = row?.limits && typeof row.limits === 'object' ? row.limits : {};
  const limits = {} as PlanLimits;
  for (const k of Object.keys(LIMIT_BOUNDS) as (keyof PlanLimits)[]) {
    const b = LIMIT_BOUNDS[k];
    if (b.nullable && l[k] === null) (limits as any)[k] = null;
    else (limits as any)[k] = intIn(l[k], b.min, b.max, d.limits[k] as number);
  }
  const price = row?.price_kobo === null ? null : typeof row?.price_kobo === 'number' && Number.isInteger(row.price_kobo) && row.price_kobo >= 0 ? row.price_kobo : d.price_kobo;
  return {
    id, name: typeof row?.name === 'string' && row.name.trim() ? row.name.trim().slice(0, 40) : d.name,
    price_kobo: id === 'free' ? 0 : price, currency: typeof row?.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : d.currency, interval: 'month',
    active: id === 'free' ? true : row?.active !== false, features: Array.isArray(row?.features) ? Array.from(new Set(row.features.filter(isFeature))) : d.features, limits,
  };
}

/** Which plan a learner is on right now: pro only while an active subscription has not ended. */
export function activePlanId(sub: SubscriptionRow | null | undefined, now: Date = new Date()): PlanId {
  if (!sub || sub.plan_id !== 'pro' || sub.status !== 'active') return 'free';
  if (sub.current_period_end) { const end = Date.parse(sub.current_period_end); if (!Number.isFinite(end) || end <= now.getTime()) return 'free'; }
  return 'pro';
}

/**
 * What a plan allows, in the shape the app already uses. The deployment switches in lib/plan.ts
 * (NEXT_PUBLIC_AKILI_PLAN / _FEATURES) can only ADD to a plan, never take away: handy for a launch promotion.
 */
export function planCapabilities(plan: PlanRow, env: Record<string, string | undefined> = process.env): Capabilities {
  const envCaps = capabilities(env);
  const has = (f: Feature) => plan.features.includes(f) || envCaps.has(f);
  const base = envCaps.plan === 'pro';
  const more = (a: number, b: number) => (base ? Math.max(a, b) : a);
  const maxProjects = base ? null : plan.limits.max_projects;
  return {
    plan: plan.id === 'pro' || base ? 'pro' : 'free', has,
    limits: {
      dailyAi: more(plan.limits.daily_ai, envCaps.limits.dailyAi), maxProjects,
      dailyImageGenerations: more(plan.limits.daily_image_generations, envCaps.limits.dailyImageGenerations),
      dailyVisualPlans: more(plan.limits.daily_visual_plans, envCaps.limits.dailyVisualPlans),
      courseMaterialChars: envCaps.has('long_materials') ? Math.max(plan.limits.course_material_chars, envCaps.limits.courseMaterialChars) : more(plan.limits.course_material_chars, envCaps.limits.courseMaterialChars),
    },
  };
}

/** The slice of a Supabase client used here, so tests can fake it. */
export interface PlanStore { from(table: string): any }

export async function loadPlans(store: PlanStore): Promise<Record<PlanId, PlanRow>> {
  const out = { free: DEFAULT_PLANS.free, pro: DEFAULT_PLANS.pro };
  try {
    const { data, error } = await store.from('plans').select('*');
    if (error || !Array.isArray(data)) return out;
    for (const r of data) if (r?.id === 'free' || r?.id === 'pro') out[r.id as PlanId] = normalisePlan(r, r.id);
  } catch { /* tables not created yet: defaults apply */ }
  return out;
}

export interface UserPlan { id: PlanId; plan: PlanRow; plans: Record<PlanId, PlanRow>; endsAt: string | null }
/** Looks the learner up. Any failure means "free", never an error: a billing hiccup must not lock anyone out. */
export async function loadUserPlan(store: PlanStore, userId: string, now: Date = new Date()): Promise<UserPlan> {
  const plans = await loadPlans(store);
  let sub: SubscriptionRow | null = null;
  try { const { data } = await store.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(); sub = (data as SubscriptionRow) || null; } catch { /* no table yet */ }
  const id = activePlanId(sub, now);
  const planRow = id === 'pro' && !plans.pro.active ? plans.free : plans[id];
  return { id: planRow.id, plan: planRow, plans, endsAt: id === 'pro' ? sub?.current_period_end ?? null : null };
}

// ── Admin edits ───────────────────────────────────────────────────────────────
export type PlanUpdate = { id: PlanId; name?: string; price_kobo?: number | null; active?: boolean; features?: Feature[]; limits?: Partial<PlanLimits> };
export function validatePlanUpdate(input: any): { ok: true; value: PlanUpdate } | { ok: false; error: string } {
  if (!input || (input.id !== 'free' && input.id !== 'pro')) return { ok: false, error: 'Unknown plan.' };
  const v: PlanUpdate = { id: input.id };
  if (input.name !== undefined) { if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 40) return { ok: false, error: 'The plan name must be 1 to 40 characters.' }; v.name = input.name.trim(); }
  if (input.price_kobo !== undefined) {
    if (input.id === 'free') { if (input.price_kobo !== 0 && input.price_kobo !== null) return { ok: false, error: 'The Free plan has no price.' }; }
    else if (input.price_kobo !== null && !(Number.isInteger(input.price_kobo) && input.price_kobo >= 0 && input.price_kobo <= MAX_PRICE_KOBO)) return { ok: false, error: 'The price must be a whole number of kobo between 0 and ₦100,000, or empty.' };
    else v.price_kobo = input.price_kobo;
  }
  if (input.active !== undefined) { if (typeof input.active !== 'boolean') return { ok: false, error: 'Active must be true or false.' }; if (input.id === 'free' && !input.active) return { ok: false, error: 'The Free plan cannot be turned off.' }; v.active = input.active; }
  if (input.features !== undefined) { if (!Array.isArray(input.features) || !input.features.every(isFeature)) return { ok: false, error: 'Unknown feature.' }; if (input.id === 'free' && input.features.length) return { ok: false, error: 'Features belong to paid plans.' }; v.features = Array.from(new Set(input.features)) as Feature[]; }
  if (input.limits !== undefined) {
    if (!input.limits || typeof input.limits !== 'object') return { ok: false, error: 'Limits are not valid.' };
    const lim: Partial<PlanLimits> = {};
    for (const [k, val] of Object.entries(input.limits)) {
      const b = LIMIT_BOUNDS[k as keyof PlanLimits]; if (!b) return { ok: false, error: `Unknown limit: ${k}.` };
      if (val === null && b.nullable) { (lim as any)[k] = null; continue; }
      if (typeof val !== 'number' || !Number.isInteger(val) || val < b.min || val > b.max) return { ok: false, error: `${k.replace(/_/g, ' ')} must be a whole number from ${b.min} to ${b.max}${b.nullable ? ', or empty for no limit' : ''}.` };
      (lim as any)[k] = val;
    }
    v.limits = lim;
  }
  return { ok: true, value: v };
}
