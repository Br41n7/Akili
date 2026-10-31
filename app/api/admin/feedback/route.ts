import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin-auth';
import { summarise } from '@/lib/feedback';

export const dynamic = 'force-dynamic';
const patch = z.object({ id: z.string().uuid(), status: z.enum(['new', 'read', 'done']) });

/** Latest feedback (newest first, up to 200) with a summary. Optional ?kind= and ?status= filters. */
export async function GET(req: NextRequest) {
  const a = await requireAdmin(); if (!a.ok) return a.res;
  const u = new URL(req.url); const kind = u.searchParams.get('kind'); const status = u.searchParams.get('status');
  let q = supabaseAdmin.from('feedback').select('*').order('created_at', { ascending: false }).limit(200);
  if (kind && ['general', 'bug', 'idea', 'rating'].includes(kind)) q = q.eq('kind', kind);
  if (status && ['new', 'read', 'done'].includes(status)) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ items: [], summary: summarise([]), error: error.code === '42P01' ? 'The feedback table is missing. Run migration 0013 in Supabase.' : 'Could not load feedback.' });
  const items = data || [];
  return NextResponse.json({ items, summary: summarise(items) });
}

export async function PATCH(req: NextRequest) {
  const a = await requireAdmin(); if (!a.ok) return a.res;
  let raw: unknown; try { raw = await req.json(); } catch { return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 }); }
  const p = patch.safeParse(raw); if (!p.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { error } = await supabaseAdmin.from('feedback').update({ status: p.data.status }).eq('id', p.data.id);
  if (error) return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
