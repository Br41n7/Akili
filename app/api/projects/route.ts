import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createProjectSchema, toProjectRow } from '@/lib/project-context';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { loadUserPlan } from '@/lib/plans-db';

export const dynamic = 'force-dynamic';

/** Create a project. Validation depends on the education level. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 });
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fields[key] ||= issue.message;
    }
    return NextResponse.json({ error: Object.values(fields)[0] || 'Check the form and try again.', fields }, { status: 400 });
  }

  // How many projects the learner's plan allows (set by an admin; empty means no limit).
  const { plan } = await loadUserPlan(supabaseAdmin, user.id);
  if (plan.limits.max_projects !== null) {
    const { count } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    if ((count ?? 0) >= plan.limits.max_projects) {
      return NextResponse.json({ error: `Your ${plan.name} plan allows ${plan.limits.max_projects} projects. Delete one or upgrade to add more.`, code: 'PLAN_LIMIT' }, { status: 403 });
    }
  }

  const { data, error } = await supabase.from('projects').insert(toProjectRow(parsed.data, user.id)).select().single();
  if (error || !data) {
    console.error('[projects] insert failed:', error?.code, error?.message);
    // 42703 = undefined column: the project-context migration has not been run yet.
    const message = error?.code === '42703'
      ? 'Project setup is not finished on the server. Ask the site owner to run the latest database update.'
      : 'We could not create the project. Please try again.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
