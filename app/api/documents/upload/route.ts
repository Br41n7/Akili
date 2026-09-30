import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 2 * 1024 * 1024;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Reads a PDF or TXT file and returns its cleaned text in chunks. The client saves the result. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail('Please sign in again.', 401);

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return fail('That upload could not be read. Try again.', 400);
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return fail('Choose a PDF or TXT file to upload.', 400);

    const projectId = String(formData.get('project_id') || '');
    if (!projectId) return fail('Open a project before uploading.', 400);

    const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).maybeSingle();
    if (!project) return fail('That project was not found.', 404);

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'txt'].includes(ext || '')) return fail('Only PDF and TXT files are supported.', 400);
    if (file.size > MAX_BYTES) return fail('That file is too large. The limit is 2MB per file.', 400);

    const { count } = await supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', user.id);
    const { data: profile } = await supabase.from('profiles').select('max_documents').eq('id', user.id).maybeSingle();
    const maxDocuments = Math.max(1, Math.min(Number(profile?.max_documents || 20), 20));
    if ((count || 0) >= maxDocuments) return fail(`You have reached the limit of ${maxDocuments} files for this project.`, 429);

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (ext === 'pdf') {
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return fail('That file is not a valid PDF.', 422);
      try {
        // Import the parser itself: the package root runs a debug routine that fails in serverless builds.
        const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
        const parsed = await pdfParse(buffer);
        text = parsed.text || '';
      } catch (err: any) {
        console.error('[upload] pdf parse failed:', err?.message);
        return fail('We could not read that PDF. It may be password-protected or damaged. Try saving it again or upload a TXT copy.', 422);
      }
    } else {
      text = buffer.toString('utf-8');
    }

    text = text
      .replace(/\(cid:\d+\)/gi, ' ')
      .replace(/[ﬁﬂﬃﬄ]/g, m => ({ ﬁ: 'fi', ﬂ: 'fl', ﬃ: 'ffi', ﬄ: 'ffl' }[m] || m))
      .replace(/[\uFFFD\uFEFF\u200B-\u200D]/g, '')
      .replace(/\u0000/g, '')
      .replace(/(\b[a-zA-Z]+)-\s*\n\s*([a-zA-Z]+\b)/g, '$1$2')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!text) return fail('No readable text found. If this PDF is a scan or photo, upload a text version instead.', 422);

    const chunks: string[] = [];
    let current = '';
    for (const para of text.split(/\n{2,}/)) {
      if ((current + para).length > 2000 && current) {
        chunks.push(current.trim());
        current = para;
      } else {
        current += '\n\n' + para;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    return NextResponse.json({ name: file.name, content: text.slice(0, 12000), chunks, source_type: ext });
  } catch (err: any) {
    console.error('[upload]', err?.message);
    return fail('The upload failed on our side. Please try again.', 500);
  }
}
