/**
 * Quiz settings and the pure logic around them: which question types, how many questions,
 * the prompt, trimming the AI's answer to what was asked, and marking.
 * Kept free of React and Supabase so it can be tested directly.
 */

export type QuizQuestionType = 'multiple_choice' | 'fill_gap' | 'statements' | 'theory';

export const QUESTION_TYPES: { value: QuizQuestionType; label: string; hint: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice', hint: 'Four options, one correct' },
  { value: 'fill_gap', label: 'Fill in the gap', hint: 'Type the missing word' },
  { value: 'statements', label: 'Statements (I, II, III, IV)', hint: 'Decide which statements are true' },
  { value: 'theory', label: 'Theory', hint: 'Write your answer, then mark it' },
];

export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 30;
export const DEFAULT_QUESTIONS = 5;
export const COUNT_PRESETS = [5, 10, 15, 20];

/** Whole number between MIN and MAX. Anything unusable becomes the fallback. */
export function clampCount(raw: unknown, fallback = DEFAULT_QUESTIONS): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, Math.trunc(n)));
}

/** Spread `count` questions over the types as evenly as possible; earlier types get the remainder. */
export function splitCounts<T extends string>(count: number, types: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  if (!types.length) return out;
  const base = Math.floor(count / types.length);
  let extra = count % types.length;
  for (const t of types) { out[t] = base + (extra > 0 ? 1 : 0); if (extra > 0) extra--; }
  return out;
}

const TYPE_SPEC: Record<QuizQuestionType | 'diagram', string> = {
  multiple_choice: '"multiple_choice": four options labelled "A) ", "B) ", "C) ", "D) "; correct_answer is the letter only.',
  fill_gap: '"fill_gap": one complete sentence with a single blank written as □□□; correct_answer is the missing word or short phrase. If more than one answer is acceptable, separate them with " | ". Do not include options.',
  statements: '"statements": a stem, then "statements": an array of 3 or 4 short statements (the app numbers them I, II, III, IV, so do not number them yourself), then four options that combine them, such as "A) I and II only", "B) II and III only", "C) I, III and IV only", "D) I, II, III and IV". Some statements must be false. correct_answer is the letter; the explanation says which statements are true and why.',
  theory: '"theory": a question answered in two to five sentences. Give "model_answer" (a concise ideal answer) and "marking_points" (an array of 3 to 5 short points, one mark each). Do not include options.',
  diagram: '"diagram": only because an image is supplied. Ask about a labelled structure that is visible, with four options A-D. Do not invent labels.',
};

export interface QuizPromptInput {
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
  types: QuizQuestionType[];
  hasImage: boolean;
  context: string;
  adaptive: unknown;
}

export function buildQuizPrompt(i: QuizPromptInput): string {
  const types: (QuizQuestionType | 'diagram')[] = i.hasImage ? [...i.types, 'diagram'] : [...i.types];
  const split = splitCounts(i.count, types);
  const mix = types.map(t => `${split[t]} × ${t}`).join(', ');
  return `Generate exactly ${i.count} adaptive question${i.count === 1 ? '' : 's'} about "${i.topic || 'the main topics'}" at ${i.difficulty} difficulty.
${i.context ? `Based on this material:\n${i.context}` : 'No material was supplied; use the standard syllabus for the learner’s level.'}

Question mix (exactly this many of each type): ${mix}.
Allowed types and their formats:
${types.map(t => `- ${TYPE_SPEC[t]}`).join('\n')}

Adaptive learner context (evidence, not absolute truth): ${JSON.stringify(i.adaptive)}
Prioritize weak concepts when the topic is blank. Test understanding, not sentence copying. Every question needs a short explanation.
Cognitive levels: recall, understanding, application, debugging, transfer.
Return JSON: { "questions": [{ "id": string, "type": ${types.map(t => `"${t}"`).join(' | ')}, "question": string, "options"?: ["A) ...","B) ...","C) ...","D) ..."], "statements"?: [string], "correct_answer": string, "model_answer"?: string, "marking_points"?: [string], "explanation": string, "concept": string, "cognitive_level": string }] }`;
}

interface QuestionLike { type?: string; [k: string]: unknown }

/** Keep only the types that were asked for (a question's own type decides), then cap at `count`. */
export function shapeQuestions<Q extends QuestionLike>(questions: Q[], opts: { count: number; types: QuizQuestionType[]; hasImage: boolean }): Q[] {
  const allowed = new Set<string>(opts.types);
  if (opts.types.includes('multiple_choice')) allowed.add('concept_trap');
  if (opts.hasImage) allowed.add('diagram');
  return questions.filter(q => allowed.has(String(q.type))).slice(0, opts.count);
}

// ── Marking ──────────────────────────────────────────────────────────────────

export interface TheoryMark { covered: number[]; feedback?: string; ai?: boolean }
export type TheoryMarks = Record<string, TheoryMark | undefined>;

/** Lower-case, drop punctuation at the edges, collapse spaces, ignore a leading article. */
export function normalizeAnswer(s: string): string {
  return s.toLowerCase().trim().replace(/^["'“‘(\[]+|["'”’.,;:!?)\]]+$/g, '').replace(/\s+/g, ' ').replace(/^(?:a|an|the)\s+/, '').trim();
}

export function theoryFraction(q: { marking_points?: unknown }, mark?: TheoryMark): number {
  const total = Array.isArray(q.marking_points) ? q.marking_points.length : 0;
  if (!total || !mark) return 0;
  const valid = new Set(mark.covered.filter(i => Number.isInteger(i) && i >= 0 && i < total));
  return valid.size / total;
}

/** A theory answer counts as correct when at least half of its marking points are covered. */
export const THEORY_PASS = 0.5;

export function isAnswerCorrect(q: QuestionLike & { id?: string; correct_answer?: unknown }, answer?: string, marks?: TheoryMarks): boolean {
  if (q.type === 'theory') return theoryFraction(q as { marking_points?: unknown }, marks?.[String(q.id)]) >= THEORY_PASS;
  if (!answer) return false;
  if (q.type === 'fill_gap') {
    const given = normalizeAnswer(answer);
    if (!given) return false;
    return String(q.correct_answer ?? '').split(/\s*\|\s*/).some(a => normalizeAnswer(a) === given);
  }
  return answer === q.correct_answer;
}
