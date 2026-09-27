import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const projectId = String(formData.get('project_id') || '');
    if (!projectId) return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    const { count } = await supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', user.id);
    const { data: profile } = await supabase.from('profiles').select('max_documents').eq('id', user.id).single();
    const maxDocuments = Math.max(1, Math.min(Number(profile?.max_documents || 20), 20));
    if ((count || 0) >= maxDocuments) return NextResponse.json({ error: `Upload limit reached. Maximum ${maxDocuments} study files per project.` }, { status: 429 });

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'txt'].includes(ext || '')) {
      return NextResponse.json({ error: 'Only PDF and TXT files supported' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Testing limit is 2MB per file.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (ext === 'pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      text = data.text;
    } else {
      text = buffer.toString('utf-8');
    }

    // Sanitize
    text = text
      .replace(/\(cid:\d+\)/gi, ' ')
      .replace(/[ﬁﬂﬃﬄ]/g, m => ({ ﬁ: 'fi', ﬂ: 'fl', ﬃ: 'ffi', ﬄ: 'ffl' }[m] || m))
      .replace(/[\uFFFD\uFEFF\u200B-\u200D]/g, '')
      .replace(/(\b[a-zA-Z]+)-\s*\n\s*([a-zA-Z]+\b)/g, '$1$2')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!text) {
      return NextResponse.json(
        { error: 'No readable text found. Ensure your PDF is text-searchable, not a scanned image.' },
        { status: 422 }
      );
    }

    // Chunk into ~2000 char segments
    const chunks: string[] = [];
    const paragraphs = text.split(/\n{2,}/);
    let current = '';
    for (const para of paragraphs) {
      if ((current + para).length > 2000 && current) {
        chunks.push(current.trim());
        current = para;
      } else {
        current += '\n\n' + para;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    return NextResponse.json({
      name: file.name,
      content: text.slice(0, 12000),
      chunks,
      source_type: ext,
    });
  } catch (err: any) {
    console.error('[Upload]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
