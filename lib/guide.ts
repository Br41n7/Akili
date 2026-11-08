// Pure helpers for the project Home: which first steps are done, what to suggest next, and the live line on a tile.
export type GuideTab = 'materials' | 'course' | 'quiz' | 'exam';
export interface GuideState { materials: number; course: boolean; quiz: boolean; exam: boolean }
export interface HomeData extends GuideState {
  lessonsDone: number; lessonsTotal: number; examDays: number | null; lastQuiz: { s: number; t: number } | null; lastExam: { s: number; t: number } | null;
}
export interface GuideStep { id: 's1' | 's2' | 's3' | 's4'; tab: GuideTab; done: boolean }

export function guideSteps(s: GuideState): GuideStep[] {
  return [
    { id: 's1', tab: 'materials', done: s.materials > 0 },
    { id: 's2', tab: 'course', done: s.course },
    { id: 's3', tab: 'quiz', done: s.quiz },
    { id: 's4', tab: 'exam', done: s.exam },
  ];
}
/** The first step not done yet, or null when all four are. Materials always come first. */
export function nextStep(s: GuideState): GuideStep | null {
  const steps = guideSteps(s);
  if (!steps[0].done) return steps[0];
  return steps.find(x => !x.done) || null;
}

/** The grid, in order. Every tab id here must exist in the project page. */
export const HOME_GROUPS: Array<{ id: 'learn' | 'practise' | 'help' | 'track'; tabs: string[] }> = [
  { id: 'learn', tabs: ['materials', 'course', 'study', 'ask'] },
  { id: 'practise', tabs: ['quiz', 'exam', 'flashcards'] },
  { id: 'help', tabs: ['help', 'snap'] },
  { id: 'track', tabs: ['plan', 'progress', 'analysis', 'research'] },
];
export const HOME_TAB_IDS = HOME_GROUPS.flatMap(g => g.tabs);

/** Whole days from today to an exam date (YYYY-MM-DD), or null when absent, invalid or already past. */
export function daysUntil(date: string | null | undefined, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || ''); if (!m) return null;
  const a = Date.UTC(+m[1], +m[2] - 1, +m[3]); const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const d = Math.round((a - b) / 86_400_000); return d >= 0 ? d : null;
}

export type StatusLine = { key: 'home.items' | 'home.lessons' | 'home.examIn' | 'home.examToday' | 'home.score'; vars: Record<string, number> } | null;
/** The small live line under a tile, or null when there is nothing worth saying. */
export function tileStatus(tab: string, d: HomeData | null): StatusLine {
  if (!d) return null;
  switch (tab) {
    case 'materials': return d.materials > 0 ? { key: 'home.items', vars: { n: d.materials } } : null;
    case 'course': return d.lessonsTotal > 0 ? { key: 'home.lessons', vars: { done: Math.min(d.lessonsDone, d.lessonsTotal), total: d.lessonsTotal } } : null;
    case 'plan': return d.examDays === null ? null : d.examDays === 0 ? { key: 'home.examToday', vars: {} } : { key: 'home.examIn', vars: { n: d.examDays } };
    case 'quiz': return d.lastQuiz ? { key: 'home.score', vars: d.lastQuiz } : null;
    case 'exam': return d.lastExam ? { key: 'home.score', vars: d.lastExam } : null;
    default: return null;
  }
}
