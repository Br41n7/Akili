/**
 * Daily free AI allowance.
 *
 * A personal key is never trusted up front: a made-up key must not buy unlimited
 * use of the shared providers. When the allowance is spent, a learner with a key
 * is restricted to that key only (`userKeyOnly`), so the shared keys are never touched.
 */

/** 20 a day unless AI_FREE_DAILY_LIMIT says otherwise (server-side env; raise it for paid plans). */
const fromEnv = Math.floor(Number(process.env.AI_FREE_DAILY_LIMIT));
export const FREE_DAILY_LIMIT = Number.isFinite(fromEnv) && fromEnv > 0 ? Math.min(fromEnv, 1000) : 20;

export interface QuotaPlan {
  allow: boolean;
  /** Only the learner's own key may be used for this request. */
  userKeyOnly: boolean;
}

export function planQuota(args: { usedToday: number; hasOwnKey: boolean; limit?: number }): QuotaPlan {
  const limit = args.limit ?? FREE_DAILY_LIMIT;
  if (args.usedToday < limit) return { allow: true, userKeyOnly: false };
  return args.hasOwnKey ? { allow: true, userKeyOnly: true } : { allow: false, userKeyOnly: false };
}

/** The slice of the Supabase admin client this needs, so tests can fake it. */
export interface UsageStore {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  from(table: string): any;
}

/**
 * Count one answered request against the learner's allowance, atomically.
 * Uses `increment_ai_usage` (migration 0006). If that function is not installed yet,
 * falls back to the older read-then-write upsert so the app keeps working.
 */
export async function recordUsage(store: UsageStore, userId: string, date: string, usedToday: number, limit = FREE_DAILY_LIMIT): Promise<void> {
  const { error } = await store.rpc('increment_ai_usage', { p_user: userId, p_date: date, p_limit: limit });
  if (!error) return;
  console.warn('[ai] increment_ai_usage unavailable; apply migration 0006. Using the non-atomic fallback.');
  await store.from('ai_usage').upsert({ user_id: userId, usage_date: date, count: usedToday + 1 }, { onConflict: 'user_id,usage_date' });
}
