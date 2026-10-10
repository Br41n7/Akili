/**
 * Connects visual learning to Akili's existing learner model
 * (lib/adaptive.ts: learner_concepts / learning_evidence). No new tables.
 *
 * - Evidence from diagram questions is recorded with the existing recordEvidence().
 * - Weak concepts already stored decide whether a lesson gets a simpler diagram.
 */
import { compactLearnerContext, getLearnerContext, recordEvidence } from '@/lib/adaptive';
import { supabase } from '@/lib/supabase';
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

// ── Learning-profile summary ────────────────────────────────────────────────

export interface DiagramEvidenceRow { concept: string; correctness: boolean | null; created_at?: string }
export interface DiagramConceptStat { concept: string; total: number; correct: number }
export interface DiagramEvidenceSummary {
  total: number;
  correct: number;
  /** Direction vocabulary (medial, proximal…) pooled together, since it transfers between diagrams. */
  direction: { total: number; correct: number };
  /** Concepts answered at least twice with under 60% correct, weakest first. */
  revisit: DiagramConceptStat[];
}

export function summarizeDiagramEvidence(rows: DiagramEvidenceRow[]): DiagramEvidenceSummary {
  const per = new Map<string, DiagramConceptStat>();
  const out: DiagramEvidenceSummary = { total: 0, correct: 0, direction: { total: 0, correct: 0 }, revisit: [] };
  for (const r of rows) {
    if (typeof r.correctness !== 'boolean' || !r.concept) continue;
    out.total++; if (r.correctness) out.correct++;
    if (/^anatomical direction:| relationships:/i.test(r.concept)) { out.direction.total++; if (r.correctness) out.direction.correct++; }
    const s = per.get(r.concept) ?? { concept: r.concept, total: 0, correct: 0 };
    s.total++; if (r.correctness) s.correct++;
    per.set(r.concept, s);
  }
  out.revisit = [...per.values()]
    .filter(s => s.total >= 2 && s.correct / s.total < 0.6)
    .sort((a, b) => a.correct / a.total - b.correct / b.total || b.total - a.total)
    .slice(0, 4);
  return out;
}

export async function loadDiagramEvidence(projectId: string, userId: string): Promise<DiagramEvidenceSummary> {
  const { data } = await supabase.from('learning_evidence').select('concept,correctness,created_at')
    .eq('project_id', projectId).eq('user_id', userId).eq('interaction_type', 'diagram_question')
    .order('created_at', { ascending: false }).limit(200);
  return summarizeDiagramEvidence((data as DiagramEvidenceRow[]) || []);
}
