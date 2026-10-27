'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, Circle, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Button, EmptyState, ErrorState, Field, MultiChips, ProgressBar, SelectInput, Skeleton, Surface, TextInput } from '@/components/ui';
import { localParts } from '@/lib/reminders';
import { addDays, estimateLessonMinutes, generatePlan, parsePlan, planStatus, shouldOfferRebuild, taskDone, type Plan, type PlanDay, type PlanLesson, type PlanTask, type WeakConcept } from '@/lib/study-plan';

interface Props { projectId: string; userId: string; onGoTo: (tab: string) => void }
const DAYS = [{ value: '0', label: 'Sun' }, { value: '1', label: 'Mon' }, { value: '2', label: 'Tue' }, { value: '3', label: 'Wed' }, { value: '4', label: 'Thu' }, { value: '5', label: 'Fri' }, { value: '6', label: 'Sat' }] as const;
const TIMES = [30, 45, 60, 90, 120, 180];
const KIND: Record<PlanDay['kind'], string> = { learn: 'Learn', catchup: 'Catch-up', revise: 'Revise', mock: 'Mock exam', eve: 'Day before', exam: 'Exam day' };

const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const todayYmd = () => localParts(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone).ymd;
const isMissingTable = (e: { code?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205');

export default function PlanView({ projectId, userId, onGoTo }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'setup'>('loading');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [lessons, setLessons] = useState<PlanLesson[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [weak, setWeak] = useState<WeakConcept[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exam, setExam] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [off, setOff] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const doneRef = useRef<string[]>([]); doneRef.current = doneIds;
  const today = todayYmd();

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [planRes, courseRes, conceptRes] = await Promise.all([
        supabase.from('study_plans').select('*').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
        supabase.from('courses').select('id, modules').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('learner_concepts').select('concept, mastery_score, exposure_count').eq('project_id', projectId).eq('user_id', userId).lt('mastery_score', 0.5).gt('exposure_count', 0).order('mastery_score', { ascending: true }).limit(10),
      ]);
      if (isMissingTable(planRes.error)) { setStatus('setup'); return; }
      if (planRes.error) throw planRes.error;
      const row = planRes.data;
      const parsed = row ? parsePlan(row.plan) : null;
      setPlan(parsed); setDoneIds(row?.done_task_ids || []);
      if (row) { setExam(row.exam_date); setMinutes(row.minutes_per_day); setOff((row.days_off || []).map(String)); }
      const mods: any[] = courseRes.data?.modules || [];
      setLessons(mods.flatMap(m => (m.lessons || []).filter((l: any) => l?.id).map((l: any) => ({ id: l.id, title: l.title || 'Lesson', module: m.title || 'Module', minutes: estimateLessonMinutes(l) }))));
      setWeak((conceptRes.data || []).map((c: any) => ({ concept: c.concept, mastery: Number(c.mastery_score) || 0 })));
      if (courseRes.data?.id) {
        const { data: prog } = await supabase.from('course_progress').select('completed_lessons').eq('course_id', courseRes.data.id).eq('user_id', userId).maybeSingle();
        setCompleted(prog?.completed_lessons || []);
      }
      setStatus('ready');
    } catch { setStatus('error'); }
  }, [projectId, userId]);
  useEffect(() => { load(); }, [load]);

  const build = async (examDate: string, mins: number, daysOff: number[], keepDone: string[]) => {
    const r = generatePlan({ today, examDate, minutesPerDay: mins, daysOff, lessons, doneLessonIds: completed, weak });
    if (!r.ok) { setFormError(r.error); return false; }
    setBusy(true);
    const { error } = await supabase.from('study_plans').upsert({ project_id: projectId, user_id: userId, exam_date: examDate, minutes_per_day: mins, days_off: daysOff, plan: r.plan, done_task_ids: keepDone, updated_at: new Date().toISOString() }, { onConflict: 'project_id,user_id' });
    setBusy(false);
    if (error) { setFormError(isMissingTable(error) ? 'The planner needs a database update first (migration 0010).' : 'Could not save your plan. Please try again.'); return false; }
    setPlan(r.plan); setDoneIds(keepDone); setEditing(false); setFormError('');
    return true;
  };

  const submit = async () => { const ok = await build(exam, minutes, off.map(Number), doneRef.current); if (ok) toast.success('Your plan is ready'); };
  const rebuild = async () => { if (!plan) return; const ok = await build(plan.examDate, plan.minutesPerDay, plan.daysOff, doneRef.current); if (ok) toast.success('Plan rebuilt from today'); };

  const toggle = async (t: PlanTask) => {
    if (t.type === 'lesson') { onGoTo('course'); return; } // finishing the lesson in the course ticks it
    const before = doneRef.current; const next = before.includes(t.id) ? before.filter(x => x !== t.id) : [...before, t.id];
    doneRef.current = next; setDoneIds(next);
    const { error } = await supabase.from('study_plans').update({ done_task_ids: next, updated_at: new Date().toISOString() }).eq('project_id', projectId).eq('user_id', userId);
    if (error) { doneRef.current = before; setDoneIds(before); toast.error('Could not save that tick. Try again.'); }
  };

  const remove = async () => {
    const { error } = await supabase.from('study_plans').delete().eq('project_id', projectId).eq('user_id', userId);
    if (error) { toast.error('Could not delete the plan.'); return; }
    setPlan(null); setDoneIds([]); setEditing(false);
  };

  if (status === 'loading') return <div className="space-y-3 p-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (status === 'error') return <div className="p-4"><ErrorState message="Your plan did not load. Check your connection and try again." onRetry={load} /></div>;
  if (status === 'setup') return <div className="p-4"><ErrorState title="Planner not set up yet" message="Run migration 0010_study_plans.sql in Supabase, then reload." /></div>;

  const form = (
    <Surface className="space-y-4 p-4">
      <Field label="Exam or test date" htmlFor="plan-exam"><TextInput id="plan-exam" type="date" min={addDays(today, 1)} value={exam} onChange={e => setExam(e.target.value)} /></Field>
      <Field label="Time you can study each day" htmlFor="plan-min">
        <SelectInput id="plan-min" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{TIMES.map(t => <option key={t} value={t}>{t < 60 ? `${t} minutes` : `${t / 60} hour${t === 60 ? '' : 's'}`}</option>)}</SelectInput>
      </Field>
      <MultiChips label="Days off" options={[...DAYS]} value={off} onChange={setOff} min={0} />
      {!lessons.length && <p className="rounded-xl bg-marker-wash p-3 text-sm">No course yet, so this plan will focus on revision and weak topics. Build your course first for a lesson-by-lesson plan.</p>}
      {formError && <p role="alert" className="text-sm font-semibold text-redpen">{formError}</p>}
      <div className="flex gap-2"><Button loading={busy} onClick={submit}><CalendarDays size={17} /> {plan ? 'Update plan' : 'Make my plan'}</Button>{plan && <Button variant="ghost" onClick={() => { setEditing(false); setFormError(''); }}>Cancel</Button>}</div>
    </Surface>
  );

  if (!plan) {
    return (
      <div className="space-y-4 p-4">
        <EmptyState icon={<CalendarDays size={22} />} title="Plan your study until the exam">Pick the date and how much time you have. Akili spreads your lessons, revision and a mock exam across the days, with spare catch-up days.</EmptyState>
        {form}
      </div>
    );
  }
  if (editing) return <div className="space-y-4 p-4">{form}</div>;

  const doneSet = new Set(doneIds), doneLessons = new Set(completed);
  const st = planStatus(plan, today, doneSet, doneLessons);
  const upcoming = plan.days.filter(d => d.date > today && d.kind !== 'exam');
  const finished = today > plan.examDate;

  return (
    <div className="space-y-4 p-4">
      <Surface className="space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">{finished ? 'Exam date has passed' : st.daysToExam === 0 ? 'Exam day' : `${st.daysToExam} day${st.daysToExam === 1 ? '' : 's'} to your exam`}</h2>
          <span className="text-sm text-muted">{dayLabel(plan.examDate)}</span>
        </div>
        <ProgressBar value={st.pct} label="Plan progress" />
        <p className="text-sm text-muted">{st.done} of {st.total} tasks done</p>
      </Surface>

      {plan.warnings.map(w => <p key={w} role="status" className="rounded-xl bg-marker-wash p-3 text-sm">{w}</p>)}

      {shouldOfferRebuild(st, plan, today) && !finished && (
        <Surface className="space-y-2 border-marker p-4">
          <p className="text-sm font-semibold">{st.overdue.length ? `${st.overdue.length} earlier tasks are not done. That is fine.` : 'Your plan has run out of days.'} Rebuild it from today and the remaining work is spread over the days left.</p>
          <Button loading={busy} onClick={rebuild}><RefreshCw size={16} /> Rebuild from today</Button>
        </Surface>
      )}

      <Surface className="space-y-3 p-4">
        <h3 className="font-bold">Today</h3>
        {st.today && st.today.tasks.length ? st.today.tasks.map(t => <TaskRow key={t.id} t={t} done={taskDone(t, doneSet, doneLessons)} onToggle={() => toggle(t)} onOpen={() => onGoTo(t.tab)} />)
          : <p className="text-sm text-muted">{finished ? 'Well done for getting this far.' : 'Nothing planned today. Rest, or open any tab to study.'}</p>}
      </Surface>

      {upcoming.length > 0 && (
        <Surface className="p-4">
          <h3 className="mb-2 font-bold">Coming up</h3>
          <ul className="divide-y divide-rule">
            {upcoming.slice(0, 14).map(d => (
              <li key={d.date} className="py-2">
                <details>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm">
                    <ChevronRight size={15} className="shrink-0" /><span className="w-24 shrink-0 font-semibold">{dayLabel(d.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{KIND[d.kind]}: {d.tasks.map(t => t.title).join(', ')}</span>
                  </summary>
                  <ul className="mt-1 space-y-1 pl-6 text-sm">{d.tasks.map(t => <li key={t.id}>{t.title} <span className="text-muted">({t.minutes} min)</span></li>)}</ul>
                </details>
              </li>
            ))}
          </ul>
          {upcoming.length > 14 && <p className="mt-2 text-xs text-muted">Showing the next 14 days.</p>}
        </Surface>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" onClick={() => setEditing(true)}>Change date or time</Button>
        <Button variant="quiet" loading={busy} onClick={rebuild}><RefreshCw size={16} /> Rebuild from today</Button>
        <Button variant="ghost" onClick={remove}><Trash2 size={16} /> Delete plan</Button>
      </div>
    </div>
  );
}

function TaskRow({ t, done, onToggle, onOpen }: { t: PlanTask; done: boolean; onToggle: () => void; onOpen: () => void }) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <div className="flex min-h-12 items-center gap-2">
      <button type="button" onClick={onToggle} aria-label={t.type === 'lesson' ? `Open ${t.title}` : `${done ? 'Untick' : 'Tick'} ${t.title}`} aria-pressed={t.type === 'lesson' ? undefined : done} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-ink/5">
        <Icon size={22} className={done ? 'text-tick' : 'text-muted'} />
      </button>
      <div className="min-w-0 flex-1"><p className={done ? 'text-sm text-muted line-through' : 'text-sm font-semibold'}>{t.title}</p><p className="text-xs text-muted">{t.minutes} min</p></div>
      <Button size="sm" variant="quiet" onClick={onOpen}>Open</Button>
    </div>
  );
}
