/**
 * Connects visual learning to Akili's existing learner model
 * (lib/adaptive.ts: learner_concepts / learning_evidence). No new tables.
 *
 * - Evidence from diagram questions is recorded with the existing recordEvidence().
 * - Weak concepts already stored decide whether a lesson gets a simpler diagram.
 */
import { compactLearnerContext, getLearnerContext, recordEvidence } from '@/lib/adaptive';
import type { VisualQuestion } from './quiz';
import type { VisualSpec } from './schema';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Pure: which of the learner's weak concepts relate to this lesson? */
export function matchWeakConcepts(
  weak: { concept: string; mastery: string | number; errors?: number }[],
  lessonTerms: string[],
): string[] {
  const terms = lessonTerms.map(norm).filter(t => t.length >= 3);
  return weak
    .filter(w => Number(w.mastery) < 0.5 || (w.errors ?? 0) >= 2)
    .map(w => w.concept)
    .filter(c => { const n = norm(c); return terms.some(t => n.includes(t) || t.includes(n)); });
}

export async function weakConceptsForLesson(projectId: string, userId: string, lessonTerms: string[]): Promise<string[]> {
  try {
    const ctx = compactLearnerContext(await getLearnerContext(projectId, userId));
    return matchWeakConcepts(ctx.weak_concepts, lessonTerms).slice(0, 4);
  } catch {
    return []; // adaptive signals are optional
  }
}

export async function recordVisualAnswer(args: { userId: string; projectId: string; spec: VisualSpec; question: VisualQuestion; chosen: string; correct: boolean }) {
  const { userId, projectId, spec, question, chosen, correct } = args;
  try {
    await recordEvidence({
      userId, projectId,
      concept: question.concept || spec.topic,
      sourceType: 'practice', interactionType: 'diagram_question',
      prompt: question.question, learnerResponse: chosen, correctness: correct,
      difficulty: question.level === 1 ? 'foundational' : question.level === 2 ? 'developing' : 'intermediate',
      evidence: `Diagram: ${spec.title}. ${question.explanation}`,
    });
  } catch { /* progress tracking must never block the lesson */ }
}
