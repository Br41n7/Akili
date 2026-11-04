import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { loadUserPlan } from '@/lib/plans-db';
import { ALLOWED_EXTENSIONS, extensionOf } from '@/lib/file-types';
import { STALE_TEMP_MS, TEMP_BUCKET, startFields, tempPath } from '@/lib/large-upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (error: string, status: number, code?: string) => NextResponse.json({ error, ...(code ? { code } : {}) }, { status });
const RATE = new Map<string, { count: number; reset: number }>();

/** Deletes this learner's waiting files that were never processed (the tab was closed mid-upload). */
async function sweep(userId: string) {
  try {
    const { data } = await supabaseAdmin.storage.from(TEMP_BUCKET).list(userId, { limit: 100 });
    const old = (data || []).filter(f => f.created_at && Date.now() - new Date(f.created_at).getTime() > STALE_TEMP_MS).map(f => `${userId}/${f.name}`);
    if (old.length) await supabaseAdmin.storage.from(TEMP_BUCKET).remove(old);
  } catch { /* cleanup is best-effort */ }
}

/** Step 1 of a large upload: checks the plan and hands the browser a one-time link to put the file straight into Storage. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Please sign in again.', 401);

  const now = Date.now(); const r = RATE.get(user.id);
  if (r && now < r.reset) { if (r.count >= 30) return fail('Too many uploads. Wait a moment.', 429, 'RATE_LIMIT'); r.count++; } else RATE.set(user.id, { count: 1, reset: now + 60_000 });

  const parsed = startFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('That upload could not be read. Try again.', 400);
  const { project_id, name, size } = parsed.data;

  const ext = extensionOf({ name, type: '' } as File);
  if (!ALLOWED_EXTENSIONS.includes(ext)) return fail('Unsupported file format. Please upload PDF, Word (.docx), PowerPoint (.pptx), TXT, or Image files.', 400);
  const { data: project } = await supabase.from('projects').select('id').eq('id', project_id).eq('user_id', user.id).maybeSingle();
  if (!project) return fail('That project was not found.', 404);

  const { plan, id: planId } = await loadUserPlan(supabaseAdmin, user.id);
  if (size > plan.limits.max_file_mb * 1024 * 1024) {
    return fail(`That file is over the ${plan.limits.max_file_mb} MB limit on your ${plan.name} plan.${planId === 'free' ? ' Upgrade for larger files, or split the file.' : ''}`, 413, 'FILE_TOO_LARGE');
  }
  const { count } = await supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', project_id).eq('user_id', user.id);
  const { data: profile } = await supabase.from('profiles').select('max_documents').eq('id', user.id).maybeSingle();
  const maxDocuments = Math.max(1, Math.min(Number(profile?.max_documents || 20), 20));
  if ((count || 0) >= maxDocuments) return fail(`You have reached the limit of ${maxDocuments} files for this project.`, 429);

  await sweep(user.id);
  const path = tempPath(user.id, crypto.randomUUID(), ext);
  const { data, error } = await supabaseAdmin.storage.from(TEMP_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[upload/start]', error?.message);
    return fail(/not found/i.test(error?.message || '') ? 'Large uploads are not set up yet. Ask the site owner to run the latest database update.' : 'Could not start that upload. Please try again.', 500);
  }
  return NextResponse.json({ path, token: data.token, bucket: TEMP_BUCKET });
}
