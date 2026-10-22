/**
 * Validators for structured AI output.
 *
 * Each validator checks the essentials the UI depends on, repairs harmless
 * gaps (missing ids, option letters, answer format) and rejects output the UI
 * could not render. Rejected output triggers a regeneration in `runAIJSON`.
 */
import { validateMnemonic } from '@/lib/mnemonics';
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
  type: 'multiple_choice' | 'true_false' | 'fill_gap' | 'concept_trap' | 'diagram' | 'statements' | 'theory';
  question: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
  concept: string;
  cognitive_level: string;
  [key: string]: unknown;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** "I. text" for each statement, whatever labelling the model used (or none). */
export function normalizeStatements(raw: unknown): string[] {
  return strList(raw)
    .slice(0, ROMAN.length)
    .map((t, i) => `${ROMAN[i]}. ${t.replace(/^\(?(?:iv|vi|v|i{1,3}|[1-6])[\).:\-]\s+/i, '').trim()}`)
    .filter(t => t.length > 4);
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

  if (declared === 'theory' || declared === 'essay' || declared === 'short_answer') {
    const model = str(raw.model_answer) || str(raw.correct_answer) || str(raw.answer);
    if (!model) return null;
    let points = strList(raw.marking_points).slice(0, 8);
    if (!points.length) points = model.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length > 8).slice(0, 5);
    if (!points.length) points = [model];
    return { ...base, type: 'theory', correct_answer: model, model_answer: model, marking_points: points };
  }

  const options = normalizeOptions(raw.options);
  if (options.length < 2) return null;
  const letter = answerLetter(raw.correct_answer, options);
  if (!letter) return null;

  if (declared === 'statements' || declared === 'statement') {
    const statements = normalizeStatements(raw.statements);
    if (statements.length < 3) return null;
    return { ...base, type: 'statements', statements, options, correct_answer: letter };
  }

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

// ── Optional lesson extras (definitions, formulas, exercises) ──────────────────

const clip = (v: unknown, n: number) => str(v).slice(0, n);

export function normalizeDefinitions(raw: unknown): { term: string; meaning: string }[] {
  return (Array.isArray(raw) ? raw : []).filter(isObj)
    .map(d => ({ term: clip(d.term, 80), meaning: clip(d.meaning ?? d.definition, 400) }))
    .filter(d => d.term && d.meaning).slice(0, 8);
}

/** Bare TeX: strips $, $$, \( \) and \[ \] wrappers models like to add. */
export function cleanLatex(v: unknown): string {
  return str(v).replace(/^\s*(\$\$|\$|\\\(|\\\[)/, '').replace(/(\$\$|\$|\\\)|\\\])\s*$/, '').trim();
}

export function normalizeFormulas(raw: unknown): { name: string; latex: string; explanation: string; variables: { symbol: string; meaning: string }[] }[] {
  return (Array.isArray(raw) ? raw : []).filter(isObj)
    .map(f => ({
      name: clip(f.name, 100),
      latex: cleanLatex(f.latex ?? f.formula).slice(0, 300),
      explanation: clip(f.explanation, 400),
      variables: (Array.isArray(f.variables) ? f.variables : []).filter(isObj)
        .map(v => ({ symbol: clip(v.symbol, 40), meaning: clip(v.meaning, 160) }))
        .filter(v => v.symbol && v.meaning).slice(0, 10),
    }))
    .filter(f => f.latex).slice(0, 6);
}

export function normalizeExercises(raw: unknown): { prompt: string; hint: string; solution_steps: string[]; answer: string }[] {
  return (Array.isArray(raw) ? raw : []).filter(isObj)
    .map(e => ({ prompt: clip(e.prompt ?? e.question, 600), hint: clip(e.hint, 300), solution_steps: strList(e.solution_steps).slice(0, 10), answer: clip(e.answer, 400) }))
    .filter(e => e.prompt && (e.answer || e.solution_steps.length)).slice(0, 5);
}


// ── Study guide and slide deck ────────────────────────────────────────────────

export function normalizeStudyGuide(data: unknown): Validation<Obj> {
  if (!isObj(data)) return fail('expected a study guide object');
  const sections: Obj[] = [];
  (Array.isArray(data.sections) ? data.sections : []).slice(0, 12).forEach((raw: unknown) => {
    if (!isObj(raw)) return;
    const heading = clip(raw.heading ?? raw.title, 120);
    const summary = clip(raw.summary ?? raw.content, 1200);
    const key_points = strList(raw.key_points).map(p => p.slice(0, 300)).slice(0, 10);
    if (!heading || (!summary && !key_points.length)) return;
    sections.push({
      heading, summary, key_points,
      definitions: normalizeDefinitions(raw.definitions),
      formulas: normalizeFormulas(raw.formulas),
      examples: strList(raw.examples).map(e => e.slice(0, 500)).slice(0, 3),
      exam_tips: strList(raw.exam_tips).map(e => e.slice(0, 300)).slice(0, 4),
    });
  });
  if (!sections.length) return fail('the study guide needs at least one section with a heading and content');
  return ok({
    title: clip(data.title, 120) || 'Study guide',
    overview: clip(data.overview, 800),
    sections,
    quick_revision: strList(data.quick_revision).map(e => e.slice(0, 200)).slice(0, 12),
    common_mistakes: strList(data.common_mistakes).map(e => e.slice(0, 250)).slice(0, 8),
  });
}

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 20;

export function normalizeSlideDeck(data: unknown): Validation<Obj> {
  if (!isObj(data)) return fail('expected a slide deck object');
  const slides: Obj[] = [];
  (Array.isArray(data.slides) ? data.slides : []).forEach((raw: unknown) => {
    if (!isObj(raw) || slides.length >= MAX_SLIDES) return;
    const title = clip(raw.title, 100);
    const bullets = strList(raw.bullets).map(b => b.slice(0, 180)).slice(0, 6);
    if (!title || !bullets.length) return;
    slides.push({ title, bullets, speaker_notes: clip(raw.speaker_notes ?? raw.notes, 800), visual_hint: clip(raw.visual_hint, 200) });
  });
  if (slides.length < MIN_SLIDES) return fail(`the deck needs at least ${MIN_SLIDES} slides, each with a title and bullet points`);
  return ok({ title: clip(data.title, 120) || 'Slide deck', subtitle: clip(data.subtitle, 160), slides });
}


// ── Mind map and knowledge graph ──────────────────────────────────────────────

export function normalizeMindMap(data: unknown): Validation<Obj> {
  if (!isObj(data)) return fail('expected a mind map object');
  const seen = new Set<string>();
  const branches: Obj[] = [];
  (Array.isArray(data.branches) ? data.branches : []).forEach((raw: unknown) => {
    if (!isObj(raw) || branches.length >= 8) return;
    const label = clip(raw.label ?? raw.title, 60);
    if (!label || seen.has(label.toLowerCase())) return;
    seen.add(label.toLowerCase());
    const kids = new Set<string>();
    const children: Obj[] = [];
    (Array.isArray(raw.children) ? raw.children : []).forEach((c: unknown) => {
      const o = isObj(c) ? c : { label: c };
      const l = clip(o.label ?? o.title, 70);
      if (!l || kids.has(l.toLowerCase()) || children.length >= 4) return;
      kids.add(l.toLowerCase());
      children.push({ label: l, note: clip(o.note, 200) });
    });
    branches.push({ label, note: clip(raw.note, 200), children });
  });
  if (branches.length < 3) return fail('the mind map needs at least 3 distinct branches');
  const center = clip(data.center, 60) || clip(data.title, 60);
  if (!center) return fail('the mind map needs a central idea');
  return ok({ title: clip(data.title, 100) || center, center, branches });
}

export function normalizeKnowledgeGraph(data: unknown): Validation<Obj> {
  if (!isObj(data)) return fail('expected a knowledge graph object');
  const nodes: Obj[] = []; const ids = new Set<string>(); const labels = new Set<string>();
  (Array.isArray(data.nodes) ? data.nodes : []).forEach((raw: unknown) => {
    if (!isObj(raw) || nodes.length >= 14) return;
    const id = str(raw.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
    const label = clip(raw.label ?? raw.name, 60);
    if (!id || !label || ids.has(id) || labels.has(label.toLowerCase())) return;
    ids.add(id); labels.add(label.toLowerCase()); nodes.push({ id, label });
  });
  if (nodes.length < 4) return fail('the graph needs at least 4 distinct concepts');
  const edges: Obj[] = []; const pairs = new Set<string>();
  (Array.isArray(data.edges) ? data.edges : []).forEach((raw: unknown) => {
    if (!isObj(raw) || edges.length >= 28) return;
    const from = str(raw.from ?? raw.source).replace(/[^A-Za-z0-9_-]/g, '');
    const to = str(raw.to ?? raw.target).replace(/[^A-Za-z0-9_-]/g, '');
    const relation = clip(raw.relation ?? raw.label, 40);
    if (!ids.has(from) || !ids.has(to) || from === to || !relation) return;
    const key = `${from}>${to}>${relation.toLowerCase()}`;
    if (pairs.has(key)) return;
    pairs.add(key); edges.push({ from, to, relation });
  });
  if (edges.length < 3) return fail('the graph needs at least 3 valid relationships between its concepts');
  // Drop concepts nothing connects to, then require enough to remain.
  const used = new Set(edges.flatMap(e => [e.from, e.to]));
  const kept = nodes.filter(n => used.has(n.id));
  if (kept.length < 4) return fail('too few concepts are connected');
  return ok({ title: clip(data.title, 100) || 'Knowledge graph', nodes: kept, edges });
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
        definitions: normalizeDefinitions(l.definitions),
        formulas: normalizeFormulas(l.formulas),
        exercises: normalizeExercises(l.exercises),
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

const mnemonicCheck = (data: unknown): Validation<Obj> => {
  const r = validateMnemonic(data);
  return r.ok ? ok(r.data as unknown as Obj) : fail(r.error);
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

const theoryFeedback = (data: unknown): Validation<Obj> => {
  if (!isObj(data)) return fail('expected { covered, feedback }');
  const feedback = str(data.feedback);
  if (feedback.length < 5) return fail('expected written feedback');
  const covered = Array.from(new Set((Array.isArray(data.covered) ? data.covered : []).map(Number).filter(n => Number.isInteger(n) && n >= 0)));
  return ok({ covered, feedback, improvement: str(data.improvement) });
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
  // Added in Phase 1b. Optional so courses saved before then still validate.
  definitions: z.array(z.object({ term: z.string().min(1), meaning: z.string().min(1) })).optional(),
  formulas: z.array(z.object({ name: zText, latex: z.string().min(1).max(300), explanation: zText, variables: z.array(z.object({ symbol: z.string().min(1), meaning: z.string().min(1) })) })).optional(),
  exercises: z.array(z.object({ prompt: z.string().min(1), hint: zText, solution_steps: zList, answer: zText })).optional(),
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


export const StudyGuideSchema = z.object({
  title: z.string().min(1),
  overview: zText,
  sections: z.array(z.object({
    heading: z.string().min(1),
    summary: zText,
    key_points: zList,
    definitions: z.array(z.object({ term: z.string().min(1), meaning: z.string().min(1) })),
    formulas: z.array(z.object({ name: zText, latex: z.string().min(1).max(300), explanation: zText, variables: z.array(z.object({ symbol: z.string().min(1), meaning: z.string().min(1) })) })),
    examples: zList,
    exam_tips: zList,
  })).min(1).max(12),
  quick_revision: zList,
  common_mistakes: zList,
});

export const SlideDeckSchema = z.object({
  title: z.string().min(1),
  subtitle: zText,
  slides: z.array(z.object({ title: z.string().min(1), bullets: z.array(z.string().min(1)).min(1).max(6), speaker_notes: zText, visual_hint: zText })).min(3).max(20),
});


export const MindMapSchema = z.object({
  title: z.string().min(1), center: z.string().min(1),
  branches: z.array(z.object({ label: z.string().min(1), note: zText, children: z.array(z.object({ label: z.string().min(1), note: zText })).max(4) })).min(3).max(8),
});
export const KnowledgeGraphSchema = z.object({
  title: z.string().min(1),
  nodes: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(4).max(14),
  edges: z.array(z.object({ from: z.string().min(1), to: z.string().min(1), relation: z.string().min(1) })).min(3).max(28),
});

const questionsSchema = (min: number) => z.object({ questions: z.array(QuestionSchema).min(min) }).passthrough();

export const SCHEMAS: Record<string, z.ZodTypeAny> = {
  course: CourseSchema,
  quiz: questionsSchema(3),
  exam: questionsSchema(5),
  quick_check: questionsSchema(1),
  quiz_custom: questionsSchema(1),
  study_guide: StudyGuideSchema,
  slide_deck: SlideDeckSchema,
  mind_map: MindMapSchema,
  knowledge_graph: KnowledgeGraphSchema,
  theory_feedback: z.object({ covered: z.array(z.number().int().min(0)), feedback: z.string().min(5), improvement: zText }).passthrough(),
  mnemonic: z.object({ mnemonic: z.string().min(1), explanation: zText, breakdown: z.array(z.object({ letter: z.string().min(1), item: z.string().min(1) })) }),
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
  quiz_custom: questionSet(1, 'q'),
  study_guide: normalizeStudyGuide,
  slide_deck: normalizeSlideDeck,
  mind_map: normalizeMindMap,
  knowledge_graph: normalizeKnowledgeGraph,
  theory_feedback: theoryFeedback,
  flashcard,
  mnemonic: mnemonicCheck,
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
