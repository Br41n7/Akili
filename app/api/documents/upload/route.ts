import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { loadUserPlan } from '@/lib/plans-db';
import { ALLOWED_EXTENSIONS, extensionOf } from '@/lib/file-types';
import { ParseError, parseDocument } from '@/lib/document-parse';
import { DIRECT_THRESHOLD_BYTES, TEMP_BUCKET, finishFields, ownsTempPath } from '@/lib/large-upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * Reads PDF, TXT, DOCX, PPTX or image files and returns cleaned text in chunks.
 * Two ways in: a multipart file (small files), or JSON {project_id, storage_path, name} for a large file the browser
 * already put in the temporary bucket (it is read here and always deleted afterwards).
 */
export async function POST(req: NextRequest) {
  let tempToDelete: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail('Please sign in again.', 401);

    let name: string; let ext: string; let projectId: string; let mime: string | undefined; let buffer: Buffer; let size: number;
    const isJson = (req.headers.get('content-type') || '').includes('application/json');

    if (isJson) {
      const f = finishFields.safeParse(await req.json().catch(() => null));
      if (!f.success) return fail('That upload could not be read. Try again.', 400);
      projectId = f.data.project_id; name = f.data.name;
      if (!ownsTempPath(f.data.storage_path, user.id)) return fail('That upload was not found. Please try again.', 404);
      tempToDelete = f.data.storage_path;
      ext = extensionOf({ name, type: '' } as File);
      const dl = await supabaseAdmin.storage.from(TEMP_BUCKET).download(f.data.storage_path);
      if (dl.error || !dl.data) return fail('That upload did not arrive. Please try again.', 404);
      buffer = Buffer.from(await dl.data.arrayBuffer()); size = buffer.length;
    } else {
      let formData: FormData;
      try { formData = await req.formData(); } catch { return fail('That upload could not be read. Try again.', 400); }
      const file = formData.get('file');
      if (!(file instanceof File) || file.size === 0) return fail('Choose a file to upload.', 400);
      projectId = String(formData.get('project_id') || '');
      name = file.name; ext = extensionOf(file); mime = file.type || undefined; size = file.size;
      buffer = Buffer.from(await file.arrayBuffer());
      if (size > DIRECT_THRESHOLD_BYTES + 512 * 1024) return fail('That file is too large to send this way. Please try again.', 413);
    }
    if (!projectId) return fail('Open a project before uploading.', 400);

    const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).maybeSingle();
    if (!project) return fail('That project was not found.', 404);
    if (!ALLOWED_EXTENSIONS.includes(ext)) return fail('Unsupported file format. Please upload PDF, Word (.docx), PowerPoint (.pptx), TXT, or Image files.', 400);

    // The size limit comes from the learner's plan, checked on the bytes the server actually holds.
    const { plan } = await loadUserPlan(supabaseAdmin, user.id);
    if (size > plan.limits.max_file_mb * 1024 * 1024) return fail(`That file is over the ${plan.limits.max_file_mb} MB limit on your ${plan.name} plan.`, 413);

    const { count } = await supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', user.id);
    const { data: profile } = await supabase.from('profiles').select('max_documents').eq('id', user.id).maybeSingle();
    const maxDocuments = Math.max(1, Math.min(Number(profile?.max_documents || 20), 20));
    if ((count || 0) >= maxDocuments) return fail(`You have reached the limit of ${maxDocuments} files for this project.`, 429);

    const { content, chunks } = await parseDocument(buffer, ext, mime);
    return NextResponse.json({ name, content, chunks, source_type: ext });
  } catch (err: any) {
    if (err instanceof ParseError) return fail(err.message, err.status);
    console.error('[upload]', err?.message);
    return fail('The upload failed on our side. Please try again.', 500);
  } finally {
    if (tempToDelete) { try { await supabaseAdmin.storage.from(TEMP_BUCKET).remove([tempToDelete]); } catch { /* swept later */ } }
  }
}
