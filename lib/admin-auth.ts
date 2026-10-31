import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Server-side admin check. The role is read from the database with the service key; nothing from the browser is trusted. */
export async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) };
  const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if ((profile as { role?: string } | null)?.role !== 'admin') return { ok: false, res: NextResponse.json({ error: 'Admins only.' }, { status: 403 }) };
  return { ok: true, userId: user.id };
}
