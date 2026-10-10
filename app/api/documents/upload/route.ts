import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { runAI } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'docx', 'doc', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'webp'];

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Helper to extract plain text from PPTX buffer using JSZip to parse slide XMLs */
async function extractTextFromPptx(buffer: Buffer): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter(filename => /^ppt\/slides\/slide\d+\.xml$/i.test(filename));

  // Sort slide files numerically (slide1.xml, slide2.xml, etc.)
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
    const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
    return numA - numB;
  });

  const slideTexts: string[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.files[slideFiles[i]].async('text');
    // Extract text inside <a:t> tags
    const textMatches = slideXml.match(/<a:t[^>]*>(.*?)<\/a:t>/gi) || [];
    const slideContent = textMatches
      .map(match => match.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .join(' ');
    if (slideContent) {
      slideTexts.push(`--- Slide ${i + 1} ---\n${slideContent}`);
    }
  }
  return slideTexts.join('\n\n');
}

/** Reads PDF, TXT, DOCX, PPTX, or Image files and returns cleaned text in chunks. */
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
    if (!(file instanceof File) || file.size === 0) return fail('Choose a file to upload.', 400);

    const projectId = String(formData.get('project_id') || '');
    if (!projectId) return fail('Open a project before uploading.', 400);

    const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).maybeSingle();
    if (!project) return fail('That project was not found.', 404);

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return fail('Unsupported file format. Please upload PDF, Word (.docx), PowerPoint (.pptx), TXT, or Image files.', 400);
    }
    if (file.size > MAX_BYTES) return fail('That file is too large. The limit is 10MB per file.', 400);

    const { count } = await supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', user.id);
    const { data: profile } = await supabase.from('profiles').select('max_documents').eq('id', user.id).maybeSingle();
    const maxDocuments = Math.max(1, Math.min(Number(profile?.max_documents || 20), 20));
    if ((count || 0) >= maxDocuments) return fail(`You have reached the limit of ${maxDocuments} files for this project.`, 429);

    if (ext === 'doc') {
      return fail('Legacy .doc format is not supported directly. Please convert it to .docx or PDF and try again.', 422);
    }
    if (ext === 'ppt') {
      return fail('Legacy .ppt format is not supported directly. Please convert it to .pptx or PDF and try again.', 422);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (ext === 'pdf') {
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return fail('That file is not a valid PDF.', 422);
      try {
        const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
        const parsed = await pdfParse(buffer);
        text = parsed.text || '';
      } catch (err: any) {
        console.error('[upload] pdf parse failed:', err?.message);
        return fail('We could not read that PDF. It may be password-protected or damaged. Try saving it again or upload a TXT copy.', 422);
      }
    } else if (ext === 'docx') {
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        text = result.value || '';
      } catch (err: any) {
        console.error('[upload] docx parse failed:', err?.message);
        return fail('We could not read that Word document. Try saving it as PDF or TXT.', 422);
      }
    } else if (ext === 'pptx') {
      try {
        text = await extractTextFromPptx(buffer);
      } catch (err: any) {
        console.error('[upload] pptx parse failed:', err?.message);
        return fail('We could not read that PowerPoint presentation. Try saving it as PDF.', 422);
      }
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      try {
        const mimeType = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        const base64 = buffer.toString('base64');
        text = await runAI({
          task: 'ocr_extraction',
          system: 'You are an accurate OCR assistant. Extract all readable text from the provided image accurately. Do not invent details. If there are diagrams, formulas, or bullet points, format them clearly using Markdown.',
          prompt: 'Transcribe all text and key study content visible in this image.',
          image: { base64, mimeType },
        });
      } catch (err: any) {
        console.error('[upload] image OCR failed:', err?.message);
        return fail('We could not extract text from that image. Please make sure it is clear or upload a document instead.', 422);
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

    if (!text) return fail('No readable text found in this file. If this is a scan or photo, try uploading a clearer image or text version.', 422);

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
