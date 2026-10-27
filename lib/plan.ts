/**
 * What this deployment may do. The default is the free setup (Vercel Hobby, free Supabase, free AI tiers).
 * Paid features are switched on with environment variables only; no code changes are needed to upgrade.
 *
 *   NEXT_PUBLIC_AKILI_PLAN      free (default) | pro   - the whole paid bundle
 *   NEXT_PUBLIC_AKILI_FEATURES  comma list, e.g. "hourly_reminders,cloud_tts" - turn single features on
 *
 * The variables are NEXT_PUBLIC_ so the browser and the server always agree. Neither holds a secret.
 * A flag only says a feature is allowed; the provider keys it needs are still separate server secrets.
 */
export type Feature = 'hourly_reminders' | 'cloud_tts' | 'image_generation' | 'video_export';
export const FEATURES: Feature[] = ['hourly_reminders', 'cloud_tts', 'image_generation', 'video_export'];

export interface Capabilities { plan: 'free' | 'pro'; has: (f: Feature) => boolean; limits: Limits }
export interface Limits { dailyImageGenerations: number; dailyVisualPlans: number }

const FREE_LIMITS: Limits = { dailyImageGenerations: 0, dailyVisualPlans: 10 };
const PRO_LIMITS: Limits = { dailyImageGenerations: 20, dailyVisualPlans: 100 };

export function capabilities(env: Record<string, string | undefined> = process.env): Capabilities {
  const plan = (env.NEXT_PUBLIC_AKILI_PLAN || '').trim().toLowerCase() === 'pro' ? 'pro' : 'free';
  const extra = new Set((env.NEXT_PUBLIC_AKILI_FEATURES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  return {
    plan,
    has: (f: Feature) => plan === 'pro' || extra.has(f),
    limits: plan === 'pro' ? PRO_LIMITS : FREE_LIMITS,
  };
}
