import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { googleFileId, parsePublicUrl, safeFetch } from '@/lib/safe-url';
import { htmlTitle, htmlToText } from '@/lib/text-safe';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let parsed: URL;
    try { parsed = parsePublicUrl(body?.url); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }

    let text = '';
    let title = 'Imported Page';
    let source_type = 'url';
    const limits = { maxBytes: 2_000_000, timeoutMs: 10_000 };

    const docId = googleFileId(parsed, 'document');
    const presId = googleFileId(parsed, 'presentation');
    if (parsed.hostname.toLowerCase() === 'docs.google.com' && (docId || presId)) {
      const kind = docId ? 'Google Doc' : 'Google Slides';
      const id = (docId || presId) as string;
      // The address is rebuilt from the validated id, so only docs.google.com export links are ever requested.
      const exportUrl = docId ? `https://docs.google.com/document/d/${id}/export?format=txt` : `https://docs.google.com/presentation/d/${id}/export/txt`;
      const res = await safeFetch(exportUrl, limits);
      if (res.status < 200 || res.status >= 300) {
        return NextResponse.json({ error: `Could not access ${kind}. Make sure sharing is set to "Anyone with the link can view".` }, { status: 422 });
      }
      text = res.body;
      if (/<!doctype html/i.test(text.slice(0, 200))) {
        return NextResponse.json({ error: `${kind} is not publicly accessible. Set sharing permissions to "Anyone with the link can view".` }, { status: 422 });
      }
      title = `${kind} (${id.slice(0, 8)}...)`;
      source_type = docId ? 'gdoc' : 'gslides';
    } else if (parsed.hostname.toLowerCase() === 'docs.google.com') {
      return NextResponse.json({ error: 'Invalid Google Docs or Slides URL' }, { status: 400 });
    } else {
      const res = await safeFetch(parsed.toString(), limits);
      if (res.status < 200 || res.status >= 300) return NextResponse.json({ error: `Failed to fetch URL: ${res.status}` }, { status: 422 });
      const type = res.contentType.toLowerCase();
      if (type && !type.includes('text/') && !type.includes('xhtml') && !type.includes('xml')) return NextResponse.json({ error: 'That address is not a web page or text file.' }, { status: 422 });
      title = htmlTitle(res.body) || title;
      text = type.includes('text/plain') ? res.body : htmlToText(res.body);
    }

    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    if (!text || text.length < 30) {
      return NextResponse.json({ error: 'Not enough readable text found on this page.' }, { status: 422 });
    }

    return NextResponse.json({ title, content: text.slice(0, 12000), source_type });
  } catch (err: any) {
    return NextResponse.json({ error: err?.code === 'ETIMEDOUT' ? 'The page took too long to respond.' : 'Could not read that page. Check the address and try again.' }, { status: 500 });
  }
}
