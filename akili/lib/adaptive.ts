import { supabase } from '@/lib/supabase/client';

export interface LearnerConcept {
  concept: string;
  mastery_score: number;
  confidence: number;
  exposure_count: number;
  correct_count: number;
  incorrect_count: number;
  consecutive_correct: number;
  consecutive_incorrect: number;
  difficulty_level: string;
  learning_stage: string;
  misconception?: string | null;
}

export async function getLearnerContext(projectId: string, userId: string) {
  const [{ data: concepts }, { data: evidence }] = await Promise.all([
    supabase.from('learner_concepts')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('mastery_score', { ascending: true })
      .limit(20),
    supabase.from('learning_evidence')
      .select('concept,source_type,interaction_type,correctness,misconception,evidence,created_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  return { concepts: concepts || [], evidence: evidence || [] };
}

export function compactLearnerContext(ctx: { concepts: LearnerConcept[]; evidence: any[] }) {
  const weak = ctx.concepts
    .filter(c => Number(c.mastery_score) < 0.70)
    .slice(0, 8)
    .map(c => ({
      concept: c.concept,
      mastery: Number(c.mastery_score).toFixed(2),
      stage: c.learning_stage,
      difficulty: c.difficulty_level,
      misconception: c.misconception || null,
      errors: c.incorrect_count,
    }));

  const strong = ctx.concepts
    .filter(c => Number(c.mastery_score) >= 0.70)
    .slice(0, 5)
    .map(c => ({ concept: c.concept, mastery: Number(c.mastery_score).toFixed(2) }));

  return {
    weak_concepts: weak,
    strong_concepts: strong,
    recent_evidence: ctx.evidence.slice(0, 8),
  };
}

export async function recordEvidence(args: {
  userId: string;
  projectId: string;
  concept: string;
  sourceType: 'chat' | 'quiz' | 'exam' | 'lesson' | 'practice' | 'flashcard';
  interactionType: string;
  prompt?: string;
  learnerResponse?: string;
  correctness?: boolean;
  confidence?: number;
  difficulty?: string;
  misconception?: string | null;
  evidence?: string;
}) {
  const concept = args.concept.trim();
  if (!concept) return { error: 'Concept is required' };

  const { error: evidenceError } = await supabase.from('learning_evidence').insert({
    user_id: args.userId,
    project_id: args.projectId,
    concept,
    source_type: args.sourceType,
    interaction_type: args.interactionType,
    prompt: args.prompt || null,
    learner_response: args.learnerResponse || null,
    correctness: args.correctness ?? null,
    confidence: args.confidence ?? null,
    difficulty: args.difficulty || null,
    misconception: args.misconception || null,
    evidence: args.evidence || null,
  });

  if (evidenceError) return { error: evidenceError.message };

  if (typeof args.correctness === 'boolean') {
    const { error } = await supabase.rpc('update_adaptive_concept', {
      p_user_id: args.userId,
      p_project_id: args.projectId,
      p_concept: concept,
      p_correct: args.correctness,
      p_misconception: args.misconception || null,
      p_difficulty: args.difficulty || 'foundational',
    });
    if (error) return { error: error.message };
  }

  return { error: null };
}
