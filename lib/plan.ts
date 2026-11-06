/**
 * What this deployment may do. The default is the free setup (Vercel Hobby, free Supabase, free AI tiers).
 * Paid features are switched on with environment variables only; no code changes are needed to upgrade.
 *
 *   NEXT_PUBLIC_AKILI_PLAN      free (default) | pro   - the whole paid bundle
 *   NEXT_PUBLIC_AKILI_FEATURES  comma list, e.g. "hourly_reminders,cloud_tts" - turn single features on
 *
 * These set the DEPLOYMENT's default. When accounts have a plan of their own, pass it as the second argument of
 * capabilities(): a learner on "pro" gets the paid bundle even where the deployment default is free.
 *
 * The variables are NEXT_PUBLIC_ so the browser and the server always agree. Neither holds a secret.
 * A flag only says a feature is allowed; the provider keys it needs are still separate server secrets.
 */
export type Feature = 'hourly_reminders' | 'cloud_tts' | 'image_generation' | 'video_export' | 'search_grounding' | 'long_materials' | 'deep_courses' | 'custom_tutor_style';
export const FEATURES: Feature[] = ['hourly_reminders', 'cloud_tts', 'image_generation', 'video_export', 'search_grounding', 'long_materials', 'deep_courses', 'custom_tutor_style'];

export interface Capabilities { plan: 'free' | 'pro'; has: (f: Feature) => boolean; limits: Limits }
export interface Limits { /** AI requests per day. */ dailyAi: number; /** Projects a learner may own; null = no limit. */ maxProjects: number | null; /** Figures a learner may keep saved from their materials. */ maxFigures: number; /** Largest single file a learner may upload, in MB. */ maxFileMb: number; dailyImageGenerations: number; dailyVisualPlans: number; /** How much of a learner's material a course may read (characters; about 1,800 per page). */ courseMaterialChars: number }

/** Features every learner has, including on Free. Keep in step with DEFAULT_PLANS.free in lib/plans-db.ts. */
export const FREE_FEATURES: Feature[] = ['custom_tutor_style'];
export const FREE_COURSE_CHARS = 400_000;
export const PRO_COURSE_CHARS = 1_000_000;
const FREE_LIMITS = { dailyAi: 20, maxProjects: 5 as number | null, maxFigures: 10, maxFileMb: 10, dailyImageGenerations: 0, dailyVisualPlans: 10 };
const PRO_LIMITS = { dailyAi: 200, maxProjects: null as number | null, maxFigures: 200, maxFileMb: 25, dailyImageGenerations: 20, dailyVisualPlans: 100 };

export function capabilities(env: Record<string, string | undefined> = process.env, userPlan?: string | null): Capabilities {
  const given = (userPlan || env.NEXT_PUBLIC_AKILI_PLAN || '').trim().toLowerCase();
  const plan = given === 'pro' ? 'pro' : 'free';
  const extra = new Set((env.NEXT_PUBLIC_AKILI_FEATURES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  const has = (f: Feature) => plan === 'pro' || FREE_FEATURES.includes(f) || extra.has(f);
  return { plan, has, limits: { ...(plan === 'pro' ? PRO_LIMITS : FREE_LIMITS), courseMaterialChars: has('long_materials') ? PRO_COURSE_CHARS : FREE_COURSE_CHARS } };
}
