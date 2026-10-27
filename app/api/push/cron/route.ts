import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { pushConfigured, sendPush } from '@/lib/push';
import { capabilities } from '@/lib/plan';
import { parsePlan, planReminderText } from '@/lib/study-plan';
import { buildReminder, isDue, type ReminderSignals } from '@/lib/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH = 500;
const CHUNK = 10;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.headers.get('x-cron-secret') || '';
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function signalsFor(userId: string, nowIso: string): Promise<ReminderSignals> {
  const [{ count }, { data: weak }, { data: project }] = await Promise.all([
    supabaseAdmin.from('flashcards').select('id', { count: 'exact', head: true }).eq('user_id', userId).lte('next_review_at', nowIso),
    supabaseAdmin.from('learner_concepts').select('concept, project_id').eq('user_id', userId).lt('mastery_score', 0.4).gt('exposure_count', 0).order('mastery_score', { ascending: true }).limit(1),
    supabaseAdmin.from('projects').select('id').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
  ]);
  const w = weak?.[0];
  return { dueFlashcards: count ?? 0, weak: w ? { concept: String(w.concept).slice(0, 60), projectId: w.project_id } : null, firstProjectId: project?.[0]?.id ?? null };
}

/** When the learner has a study plan with something left to do today, the reminder says what it is. */
async function planMessage(userId: string, ymd: string): Promise<{ title: string; body: string; url: string; tag: string } | null> {
  try {
    const { data } = await supabaseAdmin.from('study_plans').select('project_id, plan, done_task_ids').eq('user_id', userId).gte('exam_date', ymd).order('exam_date', { ascending: true }).limit(3);
    for (const row of data || []) {
      const plan = parsePlan(row.plan); const day = plan?.days.find(x => x.date === ymd);
      if (!plan || !day) continue;
      const done = new Set<string>(row.done_task_ids || []);
      const text = planReminderText({ ...day, tasks: day.tasks.filter(t => !done.has(t.id)) });
      if (text) return { ...text, url: `/projects/${row.project_id}?tab=plan`, tag: 'akili-daily' };
    }
  } catch { /* no plan, or the planner table is not there yet: use the normal reminder */ }
  return null;
}

async function run(req: NextRequest) {
  // Called by a scheduler, never by a browser. Without the secret nothing runs.
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'The reminder job is not configured.' }, { status: 503 });
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: 'Push keys are not configured.' }, { status: 503 });

  const now = new Date();
  const hourly = capabilities().has('hourly_reminders');
  const { data: profiles, error } = await supabaseAdmin.from('profiles')
    .select('id, reminder_hour, reminder_tz, last_reminder_on, reminders_enabled').eq('reminders_enabled', true).limit(BATCH);
  if (error) return NextResponse.json({ error: 'Could not read reminder settings.' }, { status: 500 });

  const due = (profiles || []).map(p => ({ p, d: isDue(p, now, { hourly }) })).filter(x => x.d.due);
  const summary = { checked: profiles?.length ?? 0, due: due.length, notified: 0, devices: 0, removed: 0, skipped: 0 };

  for (let i = 0; i < due.length; i += CHUNK) {
    await Promise.all(due.slice(i, i + CHUNK).map(async ({ p, d }) => {
      try {
        const { data: subs } = await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', p.id);
        if (!subs?.length) { summary.skipped++; return; }
        const message = (await planMessage(p.id, d.ymd)) ?? buildReminder(await signalsFor(p.id, now.toISOString()));
        let ok = 0;
        for (const s of subs) {
          const r = await sendPush(s, message);
          if (r === 'ok') { ok++; await supabaseAdmin.from('push_subscriptions').update({ last_success_at: now.toISOString(), failure_count: 0 }).eq('id', s.id); }
          else if (r === 'gone') { summary.removed++; await supabaseAdmin.from('push_subscriptions').delete().eq('id', s.id); }
        }
        summary.devices += ok;
        // Only a delivered reminder uses up today's; a failed one may be tried again if the job runs again this hour.
        if (ok) { summary.notified++; await supabaseAdmin.from('profiles').update({ last_reminder_on: d.ymd }).eq('id', p.id); }
      } catch (e) { console.warn('[reminders] user failed:', (e as Error)?.message); summary.skipped++; }
    }));
  }
  return NextResponse.json(summary);
}

export const GET = run;
export const POST = run;
