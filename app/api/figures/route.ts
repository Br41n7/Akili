import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { loadUserPlan } from '@/lib/plans-db';
import { figuresEnabled, FIGURE_BUCKET, MAX_FIGURE_BYTES, SIGNED_URL_SECONDS, cleanCaption, sniffImageType, storagePath, uploadFields } from '@/lib/figures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE = new Map<string, { count: number; reset: number }>();
const fail = (error: string, status: number, code?: string) => NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

/** The learner's saved figures for one project, with short-lived links to the pictures. */
export async function GET(req: NextRequest) {
  if (!figuresEnabled()) return NextResponse.json({ error: 'Figures are switched off for now.' }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Please sign in again.', 401);
  const projectId = new URL(req.url).searchParams.get('project_id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return fail('Open a project first.', 400);

  const { data: rows, error } = await supabaseAdmin.from('figures').select('*').eq('user_id', user.id).eq('project_id', projectId).order('created_at', { ascending: false }).limit(200);
  if (error) return fail(error.code === '42P01' ? 'Figures are not set up yet. Ask the site owner to run the latest database update.' : 'Your figures did not load.', 500);
  const list = rows || [];
  const urls = new Map<string, string>();
  if (list.length) {
    const { data: signed } = await supabaseAdmin.storage.from(FIGURE_BUCKET).createSignedUrls(list.map((r: any) => r.storage_path), SIGNED_URL_SECONDS);
    for (const s of signed || []) if (s?.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const { count } = await supabaseAdmin.from('figures').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  const { plan } = await loadUserPlan(supabaseAdmin, user.id);
  return NextResponse.json({
    used: count ?? list.length, max: plan.limits.max_figures,
    figures: list.map((r: any) => ({ id: r.id, source_name: r.source_name, page: r.page, caption: r.caption, bytes: r.bytes, explanation: r.explanation, url: urls.get(r.storage_path) || null, created_at: r.created_at })),
  });
}

/** Save one picture the learner chose. Checks the plan limit, the real file type and the size on the server. */
export async function POST(req: NextRequest) {
  if (!figuresEnabled()) return NextResponse.json({ error: 'Figures are switched off for now.' }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('Please sign in again.', 401);

  const now = Date.now(); const r = RATE.get(user.id);
  if (r && now < r.reset) { if (r.count >= 40) return fail('Too many uploads. Wait a moment.', 429, 'RATE_LIMIT'); r.count++; } else RATE.set(user.id, { count: 1, reset: now + 60_000 });

  let form: FormData; try { form = await req.formData(); } catch { return fail('That upload could not be read.', 400); }
  const fields = uploadFields.safeParse({ project_id: form.get('project_id'), source_name: form.get('source_name') ?? undefined, page: form.get('page') || undefined, caption: form.get('caption') ?? undefined });
  if (!fields.success) return fail('Open a project before saving a figure.', 400);
  const file = form.get('file');
  if (!(file instanceof Blob)) return fail('Choose a picture.', 400);
  if (file.size === 0 || file.size > MAX_FIGURE_BYTES) return fail('That picture is too large. Figures are kept small (under 450 KB).', 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return fail('Only PNG, JPEG or WebP pictures can be saved.', 400);

  const { data: project } = await supabaseAdmin.from('projects').select('id').eq('id', fields.data.project_id).eq('user_id', user.id).maybeSingle();
  if (!project) return fail('That project was not found.', 404);

  const { plan, id: planId } = await loadUserPlan(supabaseAdmin, user.id);
  const { count } = await supabaseAdmin.from('figures').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
  if ((count ?? 0) >= plan.limits.max_figures) {
    return fail(`Your ${plan.name} plan keeps up to ${plan.limits.max_figures} figures. Delete one${planId === 'free' ? ' or upgrade' : ''} to save more.`, 403, 'PLAN_LIMIT');
  }

  const id = crypto.randomUUID(); const path = storagePath(user.id, fields.data.project_id, id, type.ext);
  const up = await supabaseAdmin.storage.from(FIGURE_BUCKET).upload(path, bytes, { contentType: type.mime, upsert: false });
  if (up.error) { console.error('[figures] upload failed:', up.error.message); return fail('The picture could not be saved. Please try again.', 500); }
  const { error } = await supabaseAdmin.from('figures').insert({
    id, user_id: user.id, project_id: fields.data.project_id, storage_path: path, source_name: fields.data.source_name?.slice(0, 120) || null,
    page: fields.data.page ?? null, caption: cleanCaption(fields.data.caption), bytes: bytes.length,
  });
  if (error) {
    await supabaseAdmin.storage.from(FIGURE_BUCKET).remove([path]); // never leave a stored picture with no row
    console.error('[figures] insert failed:', error.code, error.message);
    return fail(error.code === '42P01' ? 'Figures are not set up yet. Ask the site owner to run the latest database update.' : 'The picture could not be saved. Please try again.', 500);
  }
  return NextResponse.json({ id }, { status: 201 });
}
