/**
 * Study planner: turns an exam date, daily time, the course's lessons and weak concepts into dated tasks.
 * Pure arithmetic. No AI, no network, no cost, and the same input always gives the same plan.
 *
 * Shape of a plan, working backwards from the exam:
 *   exam day            light look at flashcards
 *   eve (last study day) light recap
 *   revision days       ~20% of the days (2 to 7): weak concepts first, module recaps, mock exam(s)
 *   learning days       lessons in course order; every 6th day is a catch-up day with no new material
 */
export type TaskType = 'lesson' | 'weak' | 'revise' | 'flashcards' | 'mock' | 'exam';
export type TaskTab = 'course' | 'quiz' | 'flashcards' | 'exam' | 'help';
export type DayKind = 'learn' | 'catchup' | 'revise' | 'mock' | 'eve' | 'exam';

export interface PlanTask { id: string; type: TaskType; title: string; minutes: number; tab: TaskTab; lessonId?: string; concept?: string }
export interface PlanDay { date: string; kind: DayKind; tasks: PlanTask[] }
export interface Plan {
  version: 1; examDate: string; createdOn: string; minutesPerDay: number; daysOff: number[];
  days: PlanDay[]; warnings: string[]; neededMinutesPerDay?: number;
}
export interface PlanLesson { id: string; title: string; module: string; minutes: number }
export interface WeakConcept { concept: string; mastery: number }
export interface PlanInput {
  today: string; examDate: string; minutesPerDay: number; daysOff: number[];
  lessons: PlanLesson[]; doneLessonIds: string[]; weak: WeakConcept[];
}

export const MIN_MINUTES = 15;
export const MAX_MINUTES = 480;
export const MAX_DAYS_AHEAD = 400;
const FLASH_MIN = 10;

// ── Dates (all as YYYY-MM-DD strings, so no time zone surprises) ─────────────
const YMD = /^\d{4}-\d{2}-\d{2}$/;
export function isYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !YMD.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function addDays(ymd: string, n: number): string { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function diffDays(a: string, b: string): number { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000); }
export const weekday = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

/** A lesson takes about as long as reading it plus a short practice, between 15 and 45 minutes. */
export function estimateLessonMinutes(lesson: { content?: unknown; practice_questions?: unknown[] } | null | undefined): number {
  const words = typeof lesson?.content === 'string' ? lesson.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const practice = Array.isArray(lesson?.practice_questions) ? lesson!.practice_questions!.length * 2 : 4;
  return Math.min(45, Math.max(15, Math.round(words / 150) * 5 + 10 + practice));
}

export function validatePlanInput(i: Partial<PlanInput>): string | null {
  if (!isYmd(i.today) || !isYmd(i.examDate)) return 'Choose a valid exam date.';
  const ahead = diffDays(i.today, i.examDate);
  if (ahead < 1) return 'The exam date must be after today.';
  if (ahead > MAX_DAYS_AHEAD) return 'Pick an exam date within the next 13 months.';
  if (typeof i.minutesPerDay !== 'number' || !Number.isFinite(i.minutesPerDay) || i.minutesPerDay < MIN_MINUTES || i.minutesPerDay > MAX_MINUTES) return `Study time must be between ${MIN_MINUTES} and ${MAX_MINUTES} minutes a day.`;
  if (!Array.isArray(i.daysOff) || i.daysOff.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return 'Days off are not valid.';
  return null;
}

const pad = (n: number) => String(n);
const task = (date: string, idx: number, t: Omit<PlanTask, 'id'>): PlanTask => ({ id: `${date}:${t.type}:${pad(idx)}`, ...t });

export function generatePlan(input: PlanInput): { ok: true; plan: Plan } | { ok: false; error: string } {
  const bad = validatePlanInput(input); if (bad) return { ok: false, error: bad };
  const { today, examDate, minutesPerDay } = input;
  const daysOff = [...new Set(input.daysOff)].sort();
  const warnings: string[] = [];

  const studyDates: string[] = [];
  for (let d = today; d < examDate; d = addDays(d, 1)) if (!daysOff.includes(weekday(d))) studyDates.push(d);
  if (!studyDates.length) return { ok: false, error: 'Every day before the exam is a day off. Free up at least one study day.' };

  const done = new Set(input.doneLessonIds);
  const remaining = input.lessons.filter(l => !done.has(l.id));
  const weak = [...input.weak].filter(w => w.concept).sort((a, b) => a.mastery - b.mastery);

  const days: PlanDay[] = [];
  const n = studyDates.length;
  const eveDate = studyDates[n - 1];
  const rest = studyDates.slice(0, n - 1); // learning + revision days
  const m = rest.length;

  let R = 0;
  if (m > 0) {
    if (!remaining.length) R = m;
    else if (m <= 2) R = Math.min(1, m - 1); // almost no time: learn first, one revision day at most
    else R = Math.min(m - 1, Math.min(7, Math.max(2, Math.ceil(m * 0.2))));
  }
  const learnDates = rest.slice(0, m - R);
  const reviseDates = rest.slice(m - R);

  // ── Learning phase ──
  const catchupIdx = new Set<number>();
  learnDates.forEach((_, i) => { if ((i + 1) % 6 === 0 && i < learnDates.length - 1) catchupIdx.add(i); });
  const lessonDates = learnDates.filter((_, i) => !catchupIdx.has(i));
  const lessonMinutes = remaining.reduce((s, l) => s + l.minutes, 0);

  if (remaining.length && !lessonDates.length) {
    // Only the eve is left to learn on. Put everything on that one day and say so.
    warnings.push('There is almost no time before the exam. All remaining lessons are on one day.');
  }
  const learnSlots = lessonDates.length ? lessonDates : [eveDate];
  const needed = Math.ceil(lessonMinutes / learnSlots.length);
  const budget = Math.max(minutesPerDay, Math.ceil(needed * 1.1));
  let neededMinutesPerDay: number | undefined;
  if (remaining.length && needed > minutesPerDay) {
    neededMinutesPerDay = needed;
    warnings.push(`The remaining lessons need about ${needed} minutes a day before the exam, more than the ${minutesPerDay} you set. Days are longer to fit them; adding study days or time would ease it.`);
  }

  let cursor = 0;
  const lessonDay = new Map<string, PlanTask[]>();
  learnSlots.forEach((date, di) => {
    const tasks: PlanTask[] = []; let used = 0;
    const last = di === learnSlots.length - 1;
    while (cursor < remaining.length && (last || tasks.length === 0 || used + remaining[cursor].minutes <= budget)) {
      const l = remaining[cursor++];
      tasks.push(task(date, tasks.length, { type: 'lesson', title: `${l.title}`, minutes: l.minutes, tab: 'course', lessonId: l.id })); used += l.minutes;
    }
    if (tasks.length && di > 0 && used + FLASH_MIN <= budget) tasks.push(task(date, tasks.length, { type: 'flashcards', title: 'Review your flashcards', minutes: FLASH_MIN, tab: 'flashcards' }));
    lessonDay.set(date, tasks);
  });

  learnDates.forEach((date, i) => {
    if (catchupIdx.has(i)) days.push({ date, kind: 'catchup', tasks: [task(date, 0, { type: 'revise', title: 'Catch-up day: finish any lessons you missed', minutes: Math.min(minutesPerDay, 45), tab: 'course' }), task(date, 1, { type: 'flashcards', title: 'Review your flashcards', minutes: FLASH_MIN, tab: 'flashcards' })] });
    else days.push({ date, kind: 'learn', tasks: lessonDay.get(date) || [] });
  });

  // ── Revision phase ──
  const modules: { name: string; firstLessonId: string }[] = [];
  for (const l of input.lessons) if (!modules.some(x => x.name === l.module)) modules.push({ name: l.module, firstLessonId: l.id });
  const mockAt = new Set<number>();
  if (n >= 6 && R >= 1) mockAt.add(R >= 2 ? R - 2 : 0);
  if (R >= 6) mockAt.add(Math.floor(R / 2));
  reviseDates.forEach((date, i) => {
    if (mockAt.has(i)) { days.push({ date, kind: 'mock', tasks: [task(date, 0, { type: 'mock', title: 'Timed mock exam, then review what you missed', minutes: Math.min(minutesPerDay, 90), tab: 'exam' })] }); return; }
    const tasks: PlanTask[] = []; let used = 0;
    const add = (t: Omit<PlanTask, 'id'>) => { if (!tasks.length || used + t.minutes <= minutesPerDay) { tasks.push(task(date, tasks.length, t)); used += t.minutes; } };
    if (weak.length) { const w = weak[i % weak.length]; add({ type: 'weak', title: `Practise: ${w.concept}`, minutes: 20, tab: w.mastery < 0.25 ? 'help' : 'quiz', concept: w.concept }); }
    if (modules.length) { const mo = modules[i % modules.length]; add({ type: 'revise', title: `Recap: ${mo.name}`, minutes: 20, tab: 'course', lessonId: mo.firstLessonId }); }
    add({ type: 'flashcards', title: 'Review your flashcards', minutes: FLASH_MIN, tab: 'flashcards' });
    days.push({ date, kind: 'revise', tasks });
  });

  // ── Eve and exam day ──
  const eveTasks: PlanTask[] = [];
  const eveLessons = !lessonDates.length ? lessonDay.get(eveDate) || [] : [];
  eveTasks.push(...eveLessons);
  eveTasks.push(task(eveDate, eveTasks.length, { type: 'flashcards', title: 'A light recap of your flashcards, then rest early', minutes: 15, tab: 'flashcards' }));
  if (weak.length) eveTasks.push(task(eveDate, eveTasks.length, { type: 'weak', title: `One last look: ${weak[0].concept}`, minutes: 15, tab: 'quiz', concept: weak[0].concept }));
  days.push({ date: eveDate, kind: 'eve', tasks: eveTasks });
  days.push({ date: examDate, kind: 'exam', tasks: [task(examDate, 0, { type: 'exam', title: 'Exam day: a quick look at your flashcards, then go and do well', minutes: 10, tab: 'flashcards' })] });

  days.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ok: true, plan: { version: 1, examDate, createdOn: today, minutesPerDay, daysOff, days, warnings, ...(neededMinutesPerDay ? { neededMinutesPerDay } : {}) } };
}

// ── Reading a plan ──────────────────────────────────────────────────────────
export const taskDone = (t: PlanTask, doneIds: ReadonlySet<string>, completedLessons: ReadonlySet<string>) =>
  t.type === 'lesson' && t.lessonId ? completedLessons.has(t.lessonId) || doneIds.has(t.id) : doneIds.has(t.id);

export interface PlanStatus { daysToExam: number; today: PlanDay | null; overdue: PlanTask[]; done: number; total: number; pct: number }
export function planStatus(plan: Plan, today: string, doneIds: ReadonlySet<string>, completedLessons: ReadonlySet<string>): PlanStatus {
  let done = 0, total = 0; const overdue: PlanTask[] = [];
  for (const d of plan.days) for (const t of d.tasks) {
    if (t.type === 'exam') continue;
    total++; const isDone = taskDone(t, doneIds, completedLessons);
    if (isDone) done++; else if (d.date < today) overdue.push(t);
  }
  return { daysToExam: Math.max(0, diffDays(today, plan.examDate)), today: plan.days.find(d => d.date === today) || null, overdue, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** One tap to rebuild is offered when several tasks were missed or the plan has run out. */
export const shouldOfferRebuild = (s: PlanStatus, plan: Plan, today: string) => s.overdue.length >= 3 || (today > plan.createdOn && today < plan.examDate && !plan.days.some(d => d.date >= today));

/** What the daily reminder should say when a plan exists. Never includes scores. */
export function planReminderText(day: PlanDay | null | undefined): { title: string; body: string } | null {
  const tasks = (day?.tasks || []).filter(t => t.type !== 'exam');
  if (!tasks.length) return null;
  const names = tasks.slice(0, 2).map(t => t.type === 'flashcards' ? 'flashcards' : t.title.replace(/^(Practise|Recap|One last look): /, ''));
  const more = tasks.length > 2 ? ` and ${tasks.length - 2} more` : '';
  return { title: "Today's study plan", body: `${names.join(', ')}${more}. About ${tasks.reduce((s, t) => s + t.minutes, 0)} minutes.` };
}

/** Defensive parse of a stored plan (it lives in JSONB). */
export function parsePlan(raw: unknown): Plan | null {
  const p = raw as any;
  if (!p || p.version !== 1 || !isYmd(p.examDate) || !isYmd(p.createdOn) || !Array.isArray(p.days)) return null;
  for (const d of p.days) {
    if (!isYmd(d?.date) || !Array.isArray(d.tasks)) return null;
    for (const t of d.tasks) if (typeof t?.id !== 'string' || typeof t.title !== 'string' || typeof t.minutes !== 'number') return null;
  }
  return { ...p, warnings: Array.isArray(p.warnings) ? p.warnings : [], daysOff: Array.isArray(p.daysOff) ? p.daysOff : [] } as Plan;
}
