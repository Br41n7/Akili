import { z } from 'zod';
import { plainText } from '@/lib/text-safe';

export const KINDS = ['general', 'bug', 'idea', 'rating'] as const;
export type FeedbackKind = (typeof KINDS)[number];
export const CONTEXTS = ['app', 'lesson', 'quiz', 'course', 'planner', 'ask_ai', 'other'] as const;
export const MAX_MESSAGE = 2000;
export const HOURLY_LIMIT = 8; // feedback items per learner per hour

export const feedbackSchema = z.object({
  kind: z.enum(KINDS),
  rating: z.number().int().min(1).max(5).optional(),
  message: z.string().max(5000).optional(),
  context: z.enum(CONTEXTS).default('app'),
  ref: z.string().trim().max(100).regex(/^[A-Za-z0-9_.:-]*$/, 'Bad reference').optional(),
  page: z.string().trim().max(200).optional(),
}).superRefine((v, ctx) => {
  const text = plainText(v.message || '');
  if (v.kind === 'rating' && v.rating === undefined) ctx.addIssue({ code: 'custom', message: 'Choose a rating.' });
  if (v.kind !== 'rating' && text.length < 3) ctx.addIssue({ code: 'custom', message: 'Tell us a little more (at least a few words).' });
});

/** Clean values ready to store: plain text only, bounded, with the page reduced to its path (no query string or ids in the text). */
export function toRow(input: z.infer<typeof feedbackSchema>, userId: string, planId: string) {
  const message = plainText(input.message || '').replace(/\s+/g, ' ').slice(0, MAX_MESSAGE) || null;
  const page = (input.page || '').split('?')[0].split('#')[0].slice(0, 200) || null;
  return { user_id: userId, kind: input.kind, rating: input.kind === 'rating' ? input.rating! : (input.rating ?? null), message, context: input.context, ref: input.ref || null, page, plan_id: planId };
}

export interface FeedbackItem { id: string; kind: FeedbackKind; rating: number | null; message: string | null; context: string; ref: string | null; page: string | null; plan_id: string | null; status: string; created_at: string }
export interface FeedbackSummary { total: number; newCount: number; averageRating: number | null; ratingCount: number; byContext: { context: string; count: number; average: number | null }[] }

export function summarise(items: Pick<FeedbackItem, 'rating' | 'context' | 'status'>[]): FeedbackSummary {
  const rated = items.filter(i => typeof i.rating === 'number') as { rating: number; context: string }[];
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const contexts = Array.from(new Set(items.map(i => i.context)));
  return {
    total: items.length, newCount: items.filter(i => i.status === 'new').length, averageRating: avg(rated.map(r => r.rating)), ratingCount: rated.length,
    byContext: contexts.map(c => ({ context: c, count: items.filter(i => i.context === c).length, average: avg(rated.filter(r => r.context === c).map(r => r.rating)) })).sort((a, b) => b.count - a.count),
  };
}
