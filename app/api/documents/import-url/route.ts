import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    let text = '';
    let title = 'Imported Page';
    let source_type = 'url';

    if (url.includes('docs.google.com/document/d/')) {
      const docId = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
      if (!docId) return NextResponse.json({ error: 'Invalid Google Docs URL' }, { status: 400 });

      const res = await fetch(`https://docs.google.com/document/d/${docId}/export?format=txt`);
      if (!res.ok) {
        return NextResponse.json({
          error: 'Could not access Google Doc. Make sure sharing is set to "Anyone with the link can view".'
        }, { status: 422 });
      }
      text = await res.text();
      if (text.includes('<!DOCTYPE html>')) {
        return NextResponse.json({ error: 'Google Doc is not publicly accessible.' }, { status: 422 });
      }
      title = `Google Doc (${docId.slice(0, 8)}...)`;
      source_type = 'gdoc';
    } else {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return NextResponse.json({ error: `Failed to fetch URL: ${res.status}` }, { status: 422 });
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();
      // Strip HTML tags
      text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    if (!text || text.length < 50) {
      return NextResponse.json({ error: 'Not enough readable text found on this page.' }, { status: 422 });
    }

    return NextResponse.json({ title, content: text.slice(0, 12000), source_type });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
