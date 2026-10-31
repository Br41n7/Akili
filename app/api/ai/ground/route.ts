import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { planCapabilities, loadUserPlan } from '@/lib/plans-db';
import { planQuota, recordUsage } from '@/lib/ai-quota';
import { groundedSearch, groundingPrompt } from '@/lib/grounding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RATE = new Map<string, { count: number; reset: number }>();
const body = z.object({
  topic: z.string().trim().min(2).max(200),
  lessons: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  level: z.string().trim().max(120).default(''),
});
const fail = (error: string, status: number, code: string) => NextResponse.json({ error, code }, { status });

/** Web research for a course module. Off on the free setup; counts against the learner's daily AI allowance when on. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Please sign in again.', 401, 'UNAUTHENTICATED');
  const userPlan = await loadUserPlan(supabaseAdmin, user.id);
  if (!planCapabilities(userPlan.plan).has('search_grounding')) return fail('Web research is not available on this plan.', 403, 'GROUNDING_OFF');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail('Web research is not set up on this server.', 503, 'GROUNDING_NOT_CONFIGURED');

  const now = Date.now(); const r = RATE.get(user.id);
  if (r && now < r.reset) { if (r.count >= 12) return fail('Too many requests. Wait a moment.', 429, 'RATE_LIMIT'); r.count++; } else RATE.set(user.id, { count: 1, reset: now + 60_000 });

  let raw: unknown; try { raw = await req.json(); } catch { return fail('That request could not be read.', 400, 'BAD_REQUEST'); }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Invalid request.', 400, 'BAD_REQUEST');

  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabaseAdmin.from('ai_usage').select('count').eq('user_id', user.id).eq('usage_date', today).maybeSingle();
  const usedToday = usage?.count ?? 0;
  if (!planQuota({ usedToday, hasOwnKey: false, limit: userPlan.plan.limits.daily_ai }).allow) return fail(`You have used all ${userPlan.plan.limits.daily_ai} AI requests for today. They reset at midnight.`, 429, 'DAILY_LIMIT');

  try {
    const result = await groundedSearch({
      apiKey, model: process.env.GEMINI_GROUNDING_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      prompt: groundingPrompt(parsed.data.topic, parsed.data.lessons, parsed.data.level), signal: req.signal,
    });
    if (!result) return fail('No reliable web sources were found for this topic.', 404, 'NO_SOURCES');
    await recordUsage(supabaseAdmin as any, user.id, today, usedToday, userPlan.plan.limits.daily_ai);
    return NextResponse.json({ notes: result.notes, sources: result.sources });
  } catch (e) {
    console.warn('[ground] failed:', (e as Error)?.message);
    return fail('Web research is unavailable right now.', 502, 'GROUNDING_FAILED');
  }
}
