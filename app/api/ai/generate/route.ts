import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runAIDetailed, runAIJSON, toPublicError, AIServiceError } from '@/lib/ai';
import { getValidator, VALIDATION_TYPES } from '@/lib/ai-schemas';
import { getTask, isKnownTask, PERSONA_IDS } from '@/lib/ai-tasks';
import { FREE_DAILY_LIMIT, planQuota, recordUsage } from '@/lib/ai-quota';
import { buildCulturalBlock } from '@/lib/cultural';
import { buildProjectContext, type ProjectRecord } from '@/lib/project-context';

// Course generation can take a while. Vercel plans cap this at their own maximum.
export const maxDuration = 120;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PROMPT_CHARS = 24000;
const MAX_IMAGE_BASE64 = 8 * 1024 * 1024 * 1.4;
const RATE_STORE = new Map<string, { count: number; reset: number }>();

const PERSONAS: Record<string, string> = {
  friendly: 'Explain like a curious 12-year-old. Simple words, real examples, warm tone.',
  strict: 'Rigorous, formal, precise academic language. Depth and accuracy over simplicity.',
  socratic: 'Never give the direct answer. Guide through questions. Challenge assumptions.',
  exam: 'Focus on mark-scheme language, exam technique, and maximizing marks per question.',
  research: 'Peer-reviewer mode. Challenge assumptions. Reference principles. Be critical.',
  // Internal: JSON-only planners (diagrams). Not a tutor voice.
  planner: 'You are a precise JSON-producing planner. You do not chat.',
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
    const { task, prompt, systemInstruction, format, persona: personaInput, region, image, userGroqKey, validationType: requestedValidation, projectId } = parsed.data;

    // Only tasks in the registry run, and each task says whether it takes an image.
    if (!isKnownTask(task)) return fail('That request is not supported.', 400, 'UNKNOWN_TASK');
    const spec = getTask(task);
    if (spec.input === 'text' && image) return fail('This request does not accept an image.', 400, 'IMAGE_NOT_SUPPORTED');
    if (spec.input === 'image' && !image) return fail('Please attach an image.', 400, 'IMAGE_REQUIRED');

    // Personas are a fixed list. Anything else is treated as the default, never pasted into the prompt.
    const persona = (PERSONA_IDS as readonly string[]).includes(personaInput) ? personaInput : 'friendly';
    const validationType = requestedValidation && VALIDATION_TYPES.includes(requestedValidation) ? requestedValidation : spec.validation;

    // Daily allowance. A personal key is not trusted until a provider accepts it: once the
    // free allowance is spent, such a request may use that key only, never the shared ones.
    const hasOwnKey = !!userGroqKey?.trim();
    const today = new Date().toISOString().split('T')[0];
    const { data: usage } = await supabaseAdmin
      .from('ai_usage').select('count').eq('user_id', user.id).eq('usage_date', today).maybeSingle();
    const usedToday = usage?.count ?? 0;
    const quota = planQuota({ usedToday, hasOwnKey });
    const limitMessage = `You have used all ${FREE_DAILY_LIMIT} free AI requests for today. They reset at midnight.`;
    if (!quota.allow) return fail(limitMessage, 429, 'DAILY_LIMIT');

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

    const options = { task, prompt, system, format, image, userGroqKey, userKeyOnly: quota.userKeyOnly, signal: req.signal } as const;

    let result: string;
    let usedOwnKey = false;
    let keyRejected = false;

    try {
      if (format === 'json') {
        const out = await runAIJSON(options, getValidator(validationType));
        result = JSON.stringify(out.data);
        usedOwnKey = out.usedUserKey;
        keyRejected = out.userKeyRejected;
      } else {
        const out = await runAIDetailed(options);
        result = out.text;
        usedOwnKey = out.usedUserKey;
        keyRejected = out.userKeyRejected;
      }
    } catch (err) {
      // Allowance spent and the personal key did not work: say so, instead of "AI unavailable".
      if (quota.userKeyOnly && err instanceof AIServiceError && err.code === 'AI_NOT_CONFIGURED') {
        return fail(limitMessage, 429, 'DAILY_LIMIT');
      }
      throw err;
    }

    // Count only requests that produced an answer, and only when the shared providers answered.
    if (!usedOwnKey) await recordUsage(supabaseAdmin, user.id, today, usedToday);

    return NextResponse.json({ result, ...(keyRejected ? { keyRejected: true } : {}) });
  } catch (err) {
    if (!(err instanceof AIServiceError)) console.error('[AI Generate] unexpected error:', err);
    const pub = toPublicError(err);
    return fail(pub.message, pub.status, pub.code);
  }
}
