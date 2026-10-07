import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { YoutubeTranscript } from 'youtube-transcript';


function extractYouTubeId(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname === 'youtube.com' || u.hostname === 'www.youtube.com' || u.hostname === 'm.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const match = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
      return match?.[1] || null;
    }
  } catch { /* handled by caller */ }
  return null;
}

function isYouTubeUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'youtu.be' || host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com';
  } catch { return false; }
}

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
        return NextResponse.json({ error: 'Google Doc is not publicly accessible. Set sharing permissions to "Anyone with the link can view".' }, { status: 422 });
      }
      title = `Google Doc (${docId.slice(0, 8)}...)`;
      source_type = 'gdoc';
    } else if (url.includes('docs.google.com/presentation/d/')) {
      const presId = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
      if (!presId) return NextResponse.json({ error: 'Invalid Google Slides URL' }, { status: 400 });

      const res = await fetch(`https://docs.google.com/presentation/d/${presId}/export/txt`);
      if (!res.ok) {
        return NextResponse.json({
          error: 'Could not access Google Slides presentation. Make sure sharing is set to "Anyone with the link can view".'
        }, { status: 422 });
      }
      text = await res.text();
      if (text.includes('<!DOCTYPE html>')) {
        return NextResponse.json({ error: 'Google Slides is not publicly accessible. Set sharing permissions to "Anyone with the link can view".' }, { status: 422 });
      }
      title = `Google Slides (${presId.slice(0, 8)}...)`;
      source_type = 'gslides';
    } else if (isYouTubeUrl(url)) {
      const videoId = extractYouTubeId(url);
      if (!videoId) return NextResponse.json({ error: 'That YouTube link is not valid.' }, { status: 400 });

      try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        text = transcript.map((item: { text: string }) => item.text).join(' ');
        title = `YouTube lesson (${videoId})`;
        source_type = 'youtube';
      } catch (err: any) {
        console.error('[import-url] youtube transcript failed:', err?.message);
        return NextResponse.json({
          error: 'Akili found the YouTube video, but could not access a usable transcript. Try another educational video or upload the notes/slides instead.'
        }, { status: 422 });
      }
    } else {
      let parsedUrl: URL;
      try { parsedUrl = new URL(url); } catch { return NextResponse.json({ error: 'Enter a valid http or https link.' }, { status: 400 }); }
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) return NextResponse.json({ error: 'Only http and https links are supported.' }, { status: 400 });

      const res = await fetch(parsedUrl.toString(), { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Akili/1.0)' } });
      if (!res.ok) return NextResponse.json({ error: `Akili could not read that page (HTTP ${res.status}).` }, { status: 422 });
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();
      text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    if (!text || text.length < 30) {
      return NextResponse.json({ error: 'Not enough readable text found on this page.' }, { status: 422 });
    }

    return NextResponse.json({ title, content: text.slice(0, 12000), source_type });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
