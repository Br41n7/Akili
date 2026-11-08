// Pure helpers for the "Start here" guide: which first steps are done, and what to suggest next.
export type GuideTab = 'materials' | 'course' | 'quiz' | 'exam';
export interface GuideState { materials: number; course: boolean; quiz: boolean; exam: boolean }
export interface GuideStep { id: 's1' | 's2' | 's3' | 's4'; tab: GuideTab; done: boolean }

export function guideSteps(s: GuideState): GuideStep[] {
  return [
    { id: 's1', tab: 'materials', done: s.materials > 0 },
    { id: 's2', tab: 'course', done: s.course },
    { id: 's3', tab: 'quiz', done: s.quiz },
    { id: 's4', tab: 'exam', done: s.exam },
  ];
}
/** The first step not done yet, or null when all four are. A step is never offered before materials exist. */
export function nextStep(s: GuideState): GuideStep | null {
  const steps = guideSteps(s);
  if (!steps[0].done) return steps[0];
  return steps.find(x => !x.done) || null;
}
export const FEATURE_TABS = ['ask', 'flashcards', 'snap', 'help', 'plan', 'study', 'analysis', 'progress', 'research'] as const;
export type FeatureTab = (typeof FEATURE_TABS)[number];
