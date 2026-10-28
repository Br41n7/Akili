import { describe, expect, it } from 'vitest';
import { addDays, diffDays, estimateLessonMinutes, generatePlan, isYmd, parsePlan, planReminderText, planStatus, shouldOfferRebuild, validatePlanInput, weekday, type PlanInput } from '@/lib/study-plan';

const lessons = (n: number, minutes = 25) => Array.from({ length: n }, (_, i) => ({ id: `l${i + 1}`, title: `Lesson ${i + 1}`, module: `Module ${Math.floor(i / 3) + 1}`, minutes }));
const base = (over: Partial<PlanInput> = {}): PlanInput => ({ today: '2026-10-26', examDate: '2026-11-23', minutesPerDay: 60, daysOff: [], lessons: lessons(9), doneLessonIds: [], weak: [{ concept: 'Osmosis', mastery: 0.2 }, { concept: 'Cells', mastery: 0.35 }], ...over });
const gen = (over: Partial<PlanInput> = {}) => { const r = generatePlan(base(over)); if (!r.ok) throw new Error(r.error); return r.plan; };
const lessonTasks = (p: ReturnType<typeof gen>) => p.days.flatMap(d => d.tasks).filter(t => t.type === 'lesson');

describe('dates', () => {
  it('validates, adds and compares plain dates', () => {
    expect(isYmd('2026-02-30')).toBe(false); expect(isYmd('2026-10-26')).toBe(true); expect(isYmd(5)).toBe(false);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02'); expect(diffDays('2026-10-26', '2026-11-23')).toBe(28); expect(weekday('2026-10-26')).toBe(1);
  });
  it('estimates lesson length within 15 to 45 minutes', () => {
    expect(estimateLessonMinutes({ content: 'word '.repeat(300), practice_questions: [1, 2, 3] })).toBe(26);
    expect(estimateLessonMinutes(null)).toBeGreaterThanOrEqual(15); expect(estimateLessonMinutes({ content: 'x '.repeat(20000) })).toBe(45);
  });
});

describe('input checks', () => {
  it('rejects bad dates, past exams, silly times and days off', () => {
    expect(validatePlanInput(base({ examDate: '2026-10-26' }))).toContain('after today');
    expect(validatePlanInput(base({ examDate: 'soon' as any }))).toContain('valid exam date');
    expect(validatePlanInput(base({ examDate: '2028-01-01' }))).toContain('13 months');
    expect(validatePlanInput(base({ minutesPerDay: 5 }))).toContain('minutes a day');
    expect(validatePlanInput(base({ daysOff: [7] }))).toContain('Days off');
    expect(validatePlanInput(base())).toBeNull();
  });
  it('says so when every day is a day off', () => {
    const r = generatePlan(base({ examDate: '2026-10-28', daysOff: [0, 1, 2, 3, 4, 5, 6] })); expect(r.ok).toBe(false);
  });
});

describe('plan shape', () => {
  it('schedules every remaining lesson once, in course order, before the revision days', () => {
    const p = gen(); const ls = lessonTasks(p);
    expect(ls.map(t => t.lessonId)).toEqual(lessons(9).map(l => l.id));
    const lastLesson = p.days.filter(d => d.tasks.some(t => t.type === 'lesson')).pop()!.date;
    expect(p.days.filter(d => d.kind === 'revise' || d.kind === 'mock').every(d => d.date > lastLesson)).toBe(true);
  });
  it('ends with an eve recap and an exam day, with no new lessons on the last two days', () => {
    const p = gen(); const [eve, exam] = p.days.slice(-2);
    expect(eve.kind).toBe('eve'); expect(exam).toMatchObject({ kind: 'exam', date: '2026-11-23' }); expect(eve.date).toBe('2026-11-22');
    expect(exam.tasks.some(t => t.type === 'lesson')).toBe(false);
  });
  it('leaves finished lessons out, and goes straight to revision when everything is done', () => {
    const p = gen({ doneLessonIds: lessons(9).map(l => l.id) });
    expect(lessonTasks(p)).toHaveLength(0); expect(p.days.some(d => d.kind === 'revise' || d.kind === 'mock')).toBe(true);
    expect(lessonTasks(gen({ doneLessonIds: ['l1', 'l2'] })).map(t => t.lessonId)).not.toContain('l1');
  });
  it('skips days off completely and never plans a day before today', () => {
    const p = gen({ daysOff: [0, 6] });
    for (const d of p.days.filter(d => d.kind !== 'exam')) expect([0, 6]).not.toContain(weekday(d.date));
    expect(p.days.every(d => d.date >= '2026-10-26' && d.date <= '2026-11-23')).toBe(true);
  });
  it('puts weak concepts first in revision and sends the weakest to Get unstuck', () => {
    const p = gen(); const weakTasks = p.days.flatMap(d => d.tasks).filter(t => t.type === 'weak' && t.concept);
    expect(weakTasks.some(t => t.concept === 'Osmosis' && t.tab === 'help')).toBe(true); expect(weakTasks.some(t => t.concept === 'Cells' && t.tab === 'quiz')).toBe(true);
  });
  it('adds a catch-up day every sixth learning day, and at least one mock exam on a long plan', () => {
    const p = gen({ examDate: '2026-12-26', lessons: lessons(30) });
    expect(p.days.filter(d => d.kind === 'catchup').length).toBeGreaterThanOrEqual(2); expect(p.days.filter(d => d.kind === 'mock').length).toBeGreaterThanOrEqual(1);
    expect(p.days.filter(d => d.kind === 'catchup').every(d => !d.tasks.some(t => t.type === 'lesson'))).toBe(true);
  });
  it('keeps each day within the time set, except when the lessons cannot fit, and then says so', () => {
    const p = gen(); for (const d of p.days) if (d.kind === 'learn' && d.tasks.filter(t => t.type === 'lesson').length > 1) expect(d.tasks.reduce((s, t) => s + t.minutes, 0)).toBeLessThanOrEqual(60 + 25);
    const tight = gen({ examDate: '2026-11-02', lessons: lessons(12, 40), minutesPerDay: 30 });
    expect(tight.neededMinutesPerDay).toBeGreaterThan(30); expect(tight.warnings.join(' ')).toContain('minutes a day'); expect(lessonTasks(tight)).toHaveLength(12);
  });
  it('copes with exams tomorrow, in two days, and with no lessons or weak concepts', () => {
    const tomorrow = gen({ examDate: '2026-10-27' }); expect(tomorrow.days.map(d => d.kind)).toEqual(['eve', 'exam']); expect(lessonTasks(tomorrow)).toHaveLength(9);
    expect(tomorrow.warnings.join(' ')).toContain('almost no time'); expect(tomorrow.neededMinutesPerDay).toBeGreaterThan(60);
    const two = gen({ examDate: '2026-10-28' }); expect(lessonTasks(two)).toHaveLength(9); expect(two.days.at(-1)!.kind).toBe('exam');
    const empty = gen({ lessons: [], weak: [] }); expect(empty.days.every(d => d.tasks.length > 0)).toBe(true);
  });
  it('is deterministic and gives every task a unique id', () => {
    expect(JSON.stringify(gen())).toBe(JSON.stringify(gen()));
    const ids = gen({ examDate: '2026-12-26', lessons: lessons(30) }).days.flatMap(d => d.tasks.map(t => t.id)); expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('reading a plan', () => {
  it('counts progress, lessons finished in the course count automatically, and flags missed tasks', () => {
    const p = gen(); const day3 = addDays('2026-10-26', 3);
    const s0 = planStatus(p, '2026-10-26', new Set(), new Set()); expect(s0.pct).toBe(0); expect(s0.daysToExam).toBe(28); expect(s0.today?.date).toBe('2026-10-26');
    const s1 = planStatus(p, '2026-10-26', new Set(), new Set(['l1', 'l2'])); expect(s1.done).toBe(2);
    const late = planStatus(p, day3, new Set(), new Set()); expect(late.overdue.length).toBeGreaterThanOrEqual(3); expect(shouldOfferRebuild(late, p, day3)).toBe(true);
    expect(shouldOfferRebuild(s0, p, '2026-10-26')).toBe(false);
  });
  it('writes a short reminder from the day\'s tasks, without scores', () => {
    const p = gen(); const day = p.days[0]; const r = planReminderText(day)!;
    expect(r.title).toBe("Today's study plan"); expect(r.body).toMatch(/minutes\.$/); expect(r.body).not.toMatch(/%/);
    expect(planReminderText(null)).toBeNull(); expect(planReminderText(p.days.at(-1))).toBeNull();
  });
  it('parses a stored plan and rejects damaged ones', () => {
    const p = gen(); expect(parsePlan(JSON.parse(JSON.stringify(p)))?.days).toHaveLength(p.days.length);
    for (const bad of [null, {}, { ...p, version: 2 }, { ...p, examDate: 'x' }, { ...p, days: [{ date: '2026-10-26', tasks: [{ id: 1 }] }] }]) expect(parsePlan(bad)).toBeNull();
  });
});
