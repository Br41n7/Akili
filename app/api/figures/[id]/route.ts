import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { FIGURE_BUCKET, ownsPath } from '@/lib/figures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Delete one saved figure: the stored picture and its row. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  const { id } = await params;
  const { data: row } = await supabaseAdmin.from('figures').select('id, storage_path').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'That figure was not found.' }, { status: 404 });
  if (ownsPath((row as any).storage_path, user.id)) await supabaseAdmin.storage.from(FIGURE_BUCKET).remove([(row as any).storage_path]);
  const { error } = await supabaseAdmin.from('figures').delete().eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not delete that figure.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
