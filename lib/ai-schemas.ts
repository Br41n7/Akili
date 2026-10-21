/**
 * Validators for structured AI output.
 *
 * Each validator checks the essentials the UI depends on, repairs harmless
 * gaps (missing ids, option letters, answer format) and rejects output the UI
 * could not render. Rejected output triggers a regeneration in `runAIJSON`.
 */
import { z } from 'zod';
import type { Validation } from '@/lib/ai';
import { validateVisualDecision } from '@/lib/visual/schema';

type Obj = Record<string, any>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const ok = <T,>(data: T): Validation<T> => ({ ok: true, data });
const fail = (error: string): Validation<never> => ({ ok: false, error });

const LETTERS = 'ABCDEFGH';

/** "A) text" for every option, adding letters when the model left them off. */
function normalizeOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(str)
    .filter(Boolean)
    .slice(0, 6)
    .map((opt, i) => {
      const m = opt.match(/^\(?([A-Fa-f])[\).:\-]\s*([\s\S]*)$/);
      return m ? `${m[1].toUpperCase()}) ${m[2].trim()}` : `${LETTERS[i]}) ${opt}`;
    });
}

function answerLetter(answer: unknown, options: string[]): string | null {
  const a = str(answer);
  if (!a) return null;
  const direct = a.match(/^\(?([A-Fa-f])(?:[\).:\-]|\s|$)/);
  if (direct && options.some(o => o.startsWith(`${direct[1].toUpperCase()})`))) return direct[1].toUpperCase();
  const byText = options.find(o => o.slice(3).trim().toLowerCase() === a.toLowerCase());
  return byText ? byText[0] : null;
}

export interface NormalizedQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'fill_gap' | 'concept_trap' | 'diagram';
  question: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
  concept: string;
  cognitive_level: string;
  [key: string]: unknown;
}

function normalizeQuestion(raw: unknown, index: number): NormalizedQuestion | null {
  if (!isObj(raw)) return null;
  const question = str(raw.question);
  if (!question) return null;

  const declared = str(raw.type).toLowerCase();
  const base = {
    id: '',
    question,
    explanation: str(raw.explanation),
    concept: str(raw.concept),
    cognitive_level: str(raw.cognitive_level),
  };

  if (declared === 'fill_gap' || declared === 'fill_in_the_gap') {
    const answer = str(raw.correct_answer);
    return answer ? { ...base, type: 'fill_gap', correct_answer: answer } : null;
  }

  if (declared === 'true_false' || declared === 'true/false') {
    const value = str(raw.correct_answer).toLowerCase();
    const letter = /^(a|true|t)\b/.test(value) ? 'A' : /^(b|false|f)\b/.test(value) ? 'B' : '';
    return letter ? { ...base, type: 'true_false', options: ['A) True', 'B) False'], correct_answer: letter } : null;
  }

  const options = normalizeOptions(raw.options);
  if (options.length < 2) return null;
  const letter = answerLetter(raw.correct_answer, options);
  if (!letter) return null;

  const type = declared === 'concept_trap' || declared === 'diagram' ? declared : 'multiple_choice';
  return { ...base, type: type as NormalizedQuestion['type'], options, correct_answer: letter };
}

function normalizeQuestions(raw: unknown, idPrefix: string): NormalizedQuestion[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: NormalizedQuestion[] = [];
  list.forEach((item, i) => {
    const q = normalizeQuestion(item, i);
    if (!q) return;
    let id = isObj(item) ? str(item.id) : '';
    if (!id || seen.has(id)) id = `${idPrefix}${out.length + 1}`;
    seen.add(id);
    out.push({ ...q, id });
  });
  return out;
}

const questionSet = (min: number, prefix: string) => (data: unknown): Validation<{ questions: NormalizedQuestion[]; [k: string]: unknown }> => {
  const root = Array.isArray(data) ? { questions: data } : data;
  if (!isObj(root)) return fail('expected an object with a questions array');
  const questions = normalizeQuestions(root.questions, prefix);
  if (questions.length < min) return fail(`needs at least ${min} complete questions with valid answers, got ${questions.length}`);
  return ok({ ...root, title: str(root.title), questions });
};

// ─────────────────────────────────────────────────────────────────────────────
// Course
// ─────────────────────────────────────────────────────────────────────────────

function normalizeCourse(data: unknown): Validation<Obj> {
  if (!isObj(data)) return fail('expected a course object');
  const rawModules = Array.isArray(data.modules) ? data.modules : [];
  const modules: Obj[] = [];

  rawModules.forEach((m: unknown) => {
    if (!isObj(m)) return;
    const moduleId = `m${modules.length + 1}`;
    const lessons: Obj[] = [];
    (Array.isArray(m.lessons) ? m.lessons : []).forEach((l: unknown) => {
      if (!isObj(l)) return;
      const content = str(l.content);
      const title = str(l.title);
      if (!title || content.length < 40) return;
      const worked = isObj(l.worked_example) ? l.worked_example : null;
      lessons.push({
        id: `${moduleId}-l${lessons.length + 1}`,
        lesson_number: lessons.length + 1,
        title,
        learning_objectives: strList(l.learning_objectives),
        content,
        key_concepts: strList(l.key_concepts),
        worked_example: worked && str(worked.problem)
          ? { problem: str(worked.problem), solution_steps: strList(worked.solution_steps), answer: str(worked.answer) }
          : null,
        common_mistakes: strList(l.common_mistakes),
        practice_questions: normalizeQuestions(l.practice_questions, 'pq'),
      });
    });
    if (!lessons.length) return;
    modules.push({
      id: moduleId,
      module_number: modules.length + 1,
      title: str(m.title) || `Module ${modules.length + 1}`,
      estimated_time: str(m.estimated_time),
      lessons,
    });
  });

  if (!modules.length) return fail('the course needs at least one module with a full lesson (title and content)');
  return ok({
    ...data,
    title: str(data.title) || 'Your course',
    description: str(data.description),
    estimated_duration: str(data.estimated_duration),
    modules,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Smaller shapes
// ─────────────────────────────────────────────────────────────────────────────

const flashcard = (data: unknown): Validation<Obj> => {
  if (!isObj(data) || !str(data.mnemonic)) return fail('expected { mnemonic, explanation }');
  return ok({ mnemonic: str(data.mnemonic), explanation: str(data.explanation) });
};

const visualQuestion = (data: unknown): Validation<Obj> => {
  if (!isObj(data) || !isObj(data.diagram)) return fail('expected a diagram object');
  const labels = (Array.isArray(data.diagram.labels) ? data.diagram.labels : [])
    .filter((l: unknown) => isObj(l) && str((l as Obj).id) && str((l as Obj).name));
  if (!labels.length) return fail('the diagram needs labels');
  const allowedKinds = new Set(['skull', 'heart', 'cell', 'amino_acid', 'generic']);
  if (!allowedKinds.has(str(data.diagram.kind))) return fail('the diagram kind is not supported');
  const q = normalizeQuestion({ ...data, type: 'multiple_choice' }, 0);
  if (!q) return fail('the visual question needs a question, options and a valid answer');
  return ok({ ...data, diagram: { ...data.diagram, labels }, ...q });
};

const visualExplain = (data: unknown): Validation<Obj> => {
  if (!isObj(data) || str(data.summary).length < 10) return fail('expected { summary, parts: [{ id, text }] }');
  const parts = (Array.isArray(data.parts) ? data.parts : [])
    .filter((p: unknown) => isObj(p) && str((p as Obj).id) && str((p as Obj).text))
    .map((p: Obj) => ({ id: str(p.id), text: str(p.text) }));
  return ok({ summary: str(data.summary), parts });
};

const fact = (data: unknown): Validation<Obj> => {
  if (!isObj(data) || !str(data.fact)) return fail('expected { type, title, fact }');
  return ok({ type: str(data.type), title: str(data.title), fact: str(data.fact) });
};

const researchEdit = (data: unknown): Validation<Obj> => {
  if (!isObj(data) || str(data.text).length < 10) return fail('expected { text, changes }');
  return ok({ text: str(data.text), changes: strList(data.changes) });
};

const quizAnalysis = (data: unknown): Validation<Obj> => {
  if (!isObj(data)) return fail('expected an analysis object');
  return ok({
    summary: str(data.summary),
    evidence: Array.isArray(data.evidence) ? data.evidence.filter(isObj) : [],
    next_focus: strList(data.next_focus),
    ready_to_advance: !!data.ready_to_advance,
  });
};

const examAnalysis = (data: unknown): Validation<Obj> => {
  if (!isObj(data)) return fail('expected an analysis object');
  const verdict = str(data.overall_verdict);
  if (!verdict) return fail('expected overall_verdict');
  return ok({
    overall_verdict: verdict,
    weak_concepts: strList(data.weak_concepts),
    strong_concepts: strList(data.strong_concepts),
    recommendations: strList(data.recommendations),
  });
};

const anyJSON = (data: unknown): Validation<unknown> =>
  data !== null && typeof data === 'object' ? ok(data) : fail('expected a JSON object or array');

// ─────────────────────────────────────────────────────────────────────────────
// Zod contracts
//
// The normalizers above repair harmless gaps. These schemas then state what the
// UI may rely on, so a drift between the two shows up as a rejected output (and
// a regeneration) rather than a broken screen.
// ─────────────────────────────────────────────────────────────────────────────

const zText = z.string();
const zList = z.array(z.string());

export const QuestionSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  question: z.string().min(1),
  options: zList.optional(),
  correct_answer: z.string().min(1),
  explanation: zText,
  concept: zText,
  cognitive_level: zText,
}).passthrough();

export const LessonSchema = z.object({
  id: z.string().min(1),
  lesson_number: z.number().int().positive(),
  title: z.string().min(1),
  content: z.string().min(40),
  learning_objectives: zList,
  key_concepts: zList,
  common_mistakes: zList,
  worked_example: z.object({ problem: z.string().min(1), solution_steps: zList, answer: zText }).nullable(),
  practice_questions: z.array(QuestionSchema),
}).passthrough();

export const CourseSchema = z.object({
  title: z.string().min(1),
  description: zText,
  estimated_duration: zText,
  modules: z.array(z.object({
    id: z.string().min(1),
    module_number: z.number().int().positive(),
    title: z.string().min(1),
    estimated_time: zText,
    lessons: z.array(LessonSchema).min(1),
  }).passthrough()).min(1),
}).passthrough();

const questionsSchema = (min: number) => z.object({ questions: z.array(QuestionSchema).min(min) }).passthrough();

export const SCHEMAS: Record<string, z.ZodTypeAny> = {
  course: CourseSchema,
  quiz: questionsSchema(3),
  exam: questionsSchema(5),
  quick_check: questionsSchema(1),
  flashcard: z.object({ mnemonic: z.string().min(1), explanation: zText }).passthrough(),
  visual_explain: z.object({ summary: z.string().min(10), parts: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })) }).passthrough(),
  fact: z.object({ type: zText, title: zText, fact: z.string().min(1) }).passthrough(),
  research_edit: z.object({ text: z.string().min(10), changes: zList }).passthrough(),
  quiz_analysis: z.object({ summary: zText, evidence: z.array(z.unknown()), next_focus: zList, ready_to_advance: z.boolean() }).passthrough(),
  exam_analysis: z.object({ overall_verdict: z.string().min(1), weak_concepts: zList, strong_concepts: zList, recommendations: zList }).passthrough(),
};

/** Run the normalizer, then hold its output to the Zod contract. */
export function withSchema(name: string, schema: z.ZodTypeAny, normalize: (data: unknown) => Validation<unknown>) {
  return (data: unknown): Validation<unknown> => {
    const v = normalize(data);
    if (!v.ok) return v;
    const parsed = schema.safeParse(v.data);
    if (parsed.success) return v;
    const issue = parsed.error.issues[0];
    return fail(`${name}: ${issue?.path.join('.') || 'value'} ${issue?.message || 'is invalid'}`);
  };
}

const RAW_VALIDATORS: Record<string, (data: unknown) => Validation<unknown>> = {
  course: normalizeCourse,
  quiz: questionSet(3, 'q'),
  exam: questionSet(5, 'q'),
  quick_check: questionSet(1, 'q'),
  flashcard,
  visual_question: visualQuestion,
  visual_spec: validateVisualDecision,
  visual_explain: visualExplain,
  fact,
  research_edit: researchEdit,
  quiz_analysis: quizAnalysis,
  exam_analysis: examAnalysis,
};

const VALIDATORS: Record<string, (data: unknown) => Validation<unknown>> = Object.fromEntries(
  Object.entries(RAW_VALIDATORS).map(([name, fn]) => [name, SCHEMAS[name] ? withSchema(name, SCHEMAS[name], fn) : fn]),
);

export const VALIDATION_TYPES = Object.keys(VALIDATORS);

export function getValidator(type?: string): (data: unknown) => Validation<unknown> {
  return (type && VALIDATORS[type]) || anyJSON;
}
