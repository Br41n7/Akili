import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runAIDetailed, runAIJSON, toPublicError, AIServiceError } from '@/lib/ai';
import { getValidator } from '@/lib/ai-schemas';
import { buildCulturalBlock } from '@/lib/cultural';
import { buildProjectContext, type ProjectRecord } from '@/lib/project-context';

// Course generation can take a while. Vercel plans cap this at their own maximum.
export const maxDuration = 120;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FREE_DAILY_LIMIT = 20;
const MAX_PROMPT_CHARS = 24000;
const MAX_IMAGE_BASE64 = 8 * 1024 * 1024 * 1.4;
const RATE_STORE = new Map<string, { count: number; reset: number }>();

const PERSONAS: Record<string, string> = {
  friendly: 'Explain like a curious 12-year-old. Simple words, real examples, warm tone.',
  strict: 'Rigorous, formal, precise academic language. Depth and accuracy over simplicity.',
  socratic: 'Never give the direct answer. Guide through questions. Challenge assumptions.',
  exam: 'Focus on mark-scheme language, exam technique, and maximizing marks per question.',
  research: 'Peer-reviewer mode. Challenge assumptions. Reference principles. Be critical.',
};

const bodySchema = z.object({
  task: z.string().trim().min(1).max(40),
  prompt: z.string().min(1, 'Prompt is required').max(MAX_PROMPT_CHARS, `Prompt too large. Maximum ${MAX_PROMPT_CHARS} characters.`),
  systemInstruction: z.string().max(4000).optional().default(''),
  format: z.enum(['json', 'text']).optional().default('text'),
  persona: z.string().max(300).optional().default('friendly'),
  region: z.string().max(60).optional().default('Nigeria'),
  image: z.object({
    base64: z.string().max(MAX_IMAGE_BASE64, 'Image too large. Maximum 8MB.'),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  }).optional(),
  userGroqKey: z.string().max(200).optional(),
  validationType: z.string().max(40).optional(),
  projectId: z.string().uuid().optional(),
});

const fail = (message: string, status: number, code?: string) =>
  NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail('Please sign in again.', 401, 'AUTH');

    // 20 requests per minute per user
    const now = Date.now();
    const rate = RATE_STORE.get(user.id);
    if (rate && now < rate.reset) {
      if (rate.count >= 20) return fail('Too many requests. Wait a moment and try again.', 429, 'RATE_LIMIT');
      rate.count++;
    } else {
      RATE_STORE.set(user.id, { count: 1, reset: now + 60_000 });
    }

    let raw: unknown;
    try { raw = await req.json(); } catch { return fail('That request could not be read.', 400); }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Invalid request.', 400);
    const { task, prompt, systemInstruction, format, persona, region, image, userGroqKey, validationType, projectId } = parsed.data;

    // Daily allowance. Learners using their own key are not limited.
    const hasOwnKey = !!userGroqKey?.trim();
    const today = new Date().toISOString().split('T')[0];
    let usedToday = 0;
    if (!hasOwnKey) {
      const { data: usage } = await supabaseAdmin
        .from('ai_usage').select('count').eq('user_id', user.id).eq('usage_date', today).maybeSingle();
      usedToday = usage?.count ?? 0;
      if (usedToday >= FREE_DAILY_LIMIT) {
        return fail(`You have used all ${FREE_DAILY_LIMIT} free AI requests for today. They reset at midnight.`, 429, 'DAILY_LIMIT');
      }
    }

    // Project context is loaded on the server so the client cannot spoof it.
    let projectBlock = '';
    if (projectId) {
      const { data: project } = await supabaseAdmin
        .from('projects').select('*').eq('id', projectId).eq('user_id', user.id).maybeSingle();
      if (!project) return fail('That project could not be found.', 404);
      projectBlock = buildProjectContext(project as ProjectRecord);
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('region_context').eq('id', user.id).maybeSingle();

    const system = [
      PERSONAS[persona] || persona,
      projectBlock,
      buildCulturalBlock(region, (profile as any)?.region_context || {}),
      systemInstruction,
    ].filter(Boolean).join('\n\n');

    const options = { task, prompt, system, format, image, userGroqKey, signal: req.signal } as const;
    const started = Date.now();

    let result: string;
    let usedOwnKey = false;
    let keyRejected = false;

    if (format === 'json') {
      const out = await runAIJSON(options, getValidator(validationType));
      result = JSON.stringify(out.data);
      usedOwnKey = out.usedUserKey;
      keyRejected = out.userKeyRejected;
      console.info(`[ai] task=${task} ok ms=${Date.now() - started} provider=${out.provider}`);
    } else {
      const out = await runAIDetailed(options);
      result = out.text;
      usedOwnKey = out.usedUserKey;
      keyRejected = out.userKeyRejected;
      console.info(`[ai] task=${task} ok ms=${Date.now() - started} provider=${out.provider}`);
    }

    // Count only requests that produced an answer. If a learner's own key failed and we
    // answered with ours, that request counts against their allowance.
    if (!usedOwnKey) {
      await supabaseAdmin
        .from('ai_usage')
        .upsert({ user_id: user.id, usage_date: today, count: usedToday + 1 }, { onConflict: 'user_id,usage_date' });
    }

    return NextResponse.json({ result, ...(keyRejected ? { keyRejected: true } : {}) });
  } catch (err) {
    if (!(err instanceof AIServiceError)) console.error('[AI Generate] unexpected error:', err);
    const pub = toPublicError(err);
    return fail(pub.message, pub.status, pub.code);
  }
}
