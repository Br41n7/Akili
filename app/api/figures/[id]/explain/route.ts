import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AIServiceError, runAIJSON, toPublicError } from '@/lib/ai';
import { getValidator } from '@/lib/ai-schemas';
import { planQuota, recordUsage } from '@/lib/ai-quota';
import { loadUserPlan } from '@/lib/plans-db';
import { buildProjectContext, type ProjectRecord } from '@/lib/project-context';
import { FIGURE_BUCKET, FIGURE_SYSTEM, buildExplainPrompt, ownsPath, sniffImageType } from '@/lib/figures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RATE = new Map<string, { count: number; reset: number }>();
const fail = (error: string, status: number, code?: string, reasons?: string[]) => NextResponse.json({ error, ...(code ? { code } : {}), ...(reasons?.length ? { reasons } : {}) }, { status });

/** Explain one saved figure with a vision model. The picture is read from private storage on the server and the answer is saved, so each figure is explained once (unless asked again). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail('Please sign in again.', 401);
    const { id } = await params;

    const now = Date.now(); const r = RATE.get(user.id);
    if (r && now < r.reset) { if (r.count >= 10) return fail('Too many requests. Wait a moment.', 429, 'RATE_LIMIT'); r.count++; } else RATE.set(user.id, { count: 1, reset: now + 60_000 });
    const body = await req.json().catch(() => ({}));
    const again = body?.again === true;

    const { data: fig } = await supabaseAdmin.from('figures').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (!fig) return fail('That figure was not found.', 404);
    const row = fig as any;
    if (row.explanation && !again) return NextResponse.json({ explanation: row.explanation, cached: true });
    if (!ownsPath(row.storage_path, user.id)) return fail('That figure was not found.', 404);

    // Same daily allowance as every other AI feature, taken from the learner's plan.
    const today = new Date().toISOString().split('T')[0];
    const { data: usage } = await supabaseAdmin.from('ai_usage').select('count').eq('user_id', user.id).eq('usage_date', today).maybeSingle();
    const usedToday = (usage as any)?.count ?? 0;
    const { plan } = await loadUserPlan(supabaseAdmin, user.id);
    if (!planQuota({ usedToday, hasOwnKey: false, limit: plan.limits.daily_ai }).allow) return fail(`You have used all ${plan.limits.daily_ai} AI requests for today. They reset at midnight.`, 429, 'DAILY_LIMIT');

    const dl = await supabaseAdmin.storage.from(FIGURE_BUCKET).download(row.storage_path);
    if (dl.error || !dl.data) return fail('The picture could not be loaded. Please try again.', 502);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const type = sniffImageType(bytes); if (!type) return fail('That picture is not readable.', 422);

    const { data: project } = await supabaseAdmin.from('projects').select('*').eq('id', row.project_id).eq('user_id', user.id).maybeSingle();
    const system = [FIGURE_SYSTEM, project ? buildProjectContext(project as ProjectRecord) : ''].filter(Boolean).join('\n\n');
    const out = await runAIJSON({
      task: 'figure_explain', system, prompt: buildExplainPrompt({ caption: row.caption, source: row.source_name }), format: 'json',
      image: { mimeType: type.mime, base64: Buffer.from(bytes).toString('base64') }, signal: req.signal,
    } as any, getValidator('figure_explain'));
    const explanation = out.data as Record<string, unknown>;
    await supabaseAdmin.from('figures').update({ explanation, explained_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
    if (!out.usedUserKey) await recordUsage(supabaseAdmin as any, user.id, today, usedToday, plan.limits.daily_ai);
    return NextResponse.json({ explanation, cached: false });
  } catch (err) {
    if (!(err instanceof AIServiceError)) console.error('[figures/explain] unexpected error:', err);
    const pub = toPublicError(err);
    return fail(pub.message, pub.status, pub.code, pub.reasons);
  }
}
