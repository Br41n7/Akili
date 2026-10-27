import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isChoosablePersona } from '@/lib/personas';
import { parseReminderSettings } from '@/lib/reminders';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const today = new Date().toISOString().split('T')[0];
  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').eq('id', user.id).single(),
    supabaseAdmin.from('ai_usage').select('count').eq('user_id', user.id).eq('usage_date', today).single(),
  ]);

  return NextResponse.json({ ...profile, ai_calls_today: usage?.count ?? 0, ai_limit: 20 });
}

export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 }); }
  const allowed = ['region', 'persona', 'custom_agent_prompt', 'preferred_model'];
  const update: Record<string, unknown> = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  // A tutor style must be one that exists; reminder settings are checked field by field.
  if ('persona' in update && !isChoosablePersona(update.persona)) return NextResponse.json({ error: 'That tutor style does not exist.' }, { status: 400 });
  const reminders = parseReminderSettings(body);
  if (!reminders.ok) return NextResponse.json({ error: reminders.error }, { status: 400 });
  Object.assign(update, reminders.value);
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('profiles').update(update).eq('id', user.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
