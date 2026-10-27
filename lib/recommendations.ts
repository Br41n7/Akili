/** "What to do next", from what the learner has actually done. Pure: rows in, ordered suggestions out. */

export interface ConceptRow { concept: string; mastery_score: number | string; exposure_count?: number | null; consecutive_incorrect?: number | null; misconception?: string | null; last_practiced_at?: string | null }
export type RecTarget = 'quiz' | 'flashcards' | 'help' | 'course' | 'materials';
export interface Recommendation { id: string; kind: 'weak' | 'refresh' | 'flashcards' | 'start'; title: string; reason: string; target: RecTarget; concept?: string }

export const WEAK_BELOW = 0.4;
export const STRONG_FROM = 0.7;
export const STALE_DAYS = 14;
export const MAX_RECS = 4;
const DAY = 86_400_000;

export function recommend(i: { concepts: ConceptRow[]; dueFlashcards: number; hasMaterials: boolean; now?: Date }): Recommendation[] {
  const now = (i.now ?? new Date()).getTime();
  const recs: Recommendation[] = [];

  if (!i.hasMaterials && i.concepts.length === 0) {
    return [{ id: 'start-materials', kind: 'start', title: 'Add your notes or past questions', reason: 'Akili builds everything from your own material, so start there.', target: 'materials' }];
  }
  if (i.concepts.length === 0) {
    return [{ id: 'start-quiz', kind: 'start', title: 'Take a short quiz', reason: 'Akili does not know your level yet. Five questions are enough to start.', target: 'quiz' }];
  }

  if (i.dueFlashcards > 0) {
    recs.push({ id: 'flashcards', kind: 'flashcards', title: `Review ${i.dueFlashcards} flashcard${i.dueFlashcards === 1 ? '' : 's'}`, reason: 'They are due now. Reviewing on time is what makes them stick.', target: 'flashcards' });
  }

  const scored = i.concepts.map(c => ({ c, m: Number(c.mastery_score) })).filter(x => Number.isFinite(x.m));
  const attempted = (c: ConceptRow) => (c.exposure_count ?? 0) > 0;

  // Weakest first; repeated misses and a known misconception weigh more than a low score alone.
  const weak = scored.filter(x => x.m < WEAK_BELOW && attempted(x.c))
    .sort((a, b) => (a.m - 0.05 * Math.min(3, a.c.consecutive_incorrect ?? 0)) - (b.m - 0.05 * Math.min(3, b.c.consecutive_incorrect ?? 0)));
  for (const { c, m } of weak.slice(0, 2)) {
    const stuck = (c.consecutive_incorrect ?? 0) >= 2 || !!c.misconception;
    recs.push({
      id: `weak-${c.concept.toLowerCase()}`, kind: 'weak', concept: c.concept,
      title: `${stuck ? 'Get unstuck on' : 'Practise'} ${c.concept}`,
      reason: c.misconception ? `A common slip here: ${c.misconception}` : `Your mastery is about ${Math.round(m * 100)}%.`,
      target: stuck ? 'help' : 'quiz',
    });
  }

  // Concepts that were learned but not touched for a while fade.
  const stale = scored.filter(x => x.m >= STRONG_FROM && x.c.last_practiced_at && now - new Date(x.c.last_practiced_at).getTime() > STALE_DAYS * DAY)
    .sort((a, b) => new Date(a.c.last_practiced_at!).getTime() - new Date(b.c.last_practiced_at!).getTime());
  if (stale[0]) {
    const days = Math.floor((now - new Date(stale[0].c.last_practiced_at!).getTime()) / DAY);
    recs.push({ id: `refresh-${stale[0].c.concept.toLowerCase()}`, kind: 'refresh', concept: stale[0].c.concept, title: `Refresh ${stale[0].c.concept}`, reason: `You knew it well, but have not practised it for ${days} days.`, target: 'quiz' });
  }

  return recs.slice(0, MAX_RECS);
}

/** Where a recommendation sends the learner: the project tab ids used by the project page. */
export const TARGET_TAB: Record<RecTarget, string> = { quiz: 'quiz', flashcards: 'flashcards', help: 'help', course: 'course', materials: 'materials' };
