/**
 * Central AI task registry (server and tests; contains no secrets).
 *
 * One entry per task. `lib/ai.ts` reads this for provider order, input type,
 * timeouts, retries and reasoning effort. The API route reads it to reject
 * tasks (and images) a task does not support.
 *
 * Provider order is a preference, not a restriction: a provider with no key,
 * or one that cannot take the input (see `providerCapabilities` in ai.ts), is
 * skipped, and the next one is tried.
 */

export type ProviderId = 'gemini' | 'groq' | 'openai' | 'deepseek';

/** What the task accepts: text only, an image is required, or an image is optional. */
export type TaskInput = 'text' | 'image' | 'either';

export interface TaskSpec {
  id: string;
  /** Ordered preference. Providers not listed are never used for this task. */
  providers: ProviderId[];
  input: TaskInput;
  /** Default validator name in `lib/ai-schemas.ts` (the caller may still pick one). */
  validation?: string;
  /** Per-attempt timeout in ms. */
  timeoutMs: number;
  /** Extra attempts on the same provider after a transient failure (server, network, empty). */
  retries: number;
  /** Long structured output: larger token budget. */
  heavy?: boolean;
  /** Short, cheap task: ask reasoning models to think less. */
  lowEffort?: boolean;
}

const GROQ_FIRST: ProviderId[] = ['groq', 'gemini', 'openai', 'deepseek'];
const GEMINI_FIRST: ProviderId[] = ['gemini', 'groq', 'openai', 'deepseek'];
const DEEPSEEK_FIRST: ProviderId[] = ['deepseek', 'groq', 'gemini', 'openai'];
const VISION: ProviderId[] = ['gemini', 'openai', 'groq'];

const BASE_MS = 45_000;
const HEAVY_MS = 75_000;
const LIGHT_MS = 30_000;

const list: TaskSpec[] = [
  // Bulk structured generation: Groq first to spare Gemini quota.
  { id: 'course_builder', providers: GROQ_FIRST, input: 'text', validation: 'course', timeoutMs: HEAVY_MS, retries: 1, heavy: true },
  { id: 'study_guide', providers: GROQ_FIRST, input: 'text', validation: 'study_guide', timeoutMs: HEAVY_MS, retries: 1, heavy: true },
  { id: 'slide_deck', providers: GROQ_FIRST, input: 'text', validation: 'slide_deck', timeoutMs: HEAVY_MS, retries: 1, heavy: true },

  // Routine text transformations: DeepSeek first when configured.
  { id: 'mnemonic', providers: DEEPSEEK_FIRST, input: 'text', validation: 'flashcard', timeoutMs: LIGHT_MS, retries: 1, lowEffort: true },
  { id: 'shortcut', providers: DEEPSEEK_FIRST, input: 'text', timeoutMs: LIGHT_MS, retries: 1, lowEffort: true },
  { id: 'study_plan', providers: DEEPSEEK_FIRST, input: 'text', timeoutMs: LIGHT_MS, retries: 1, lowEffort: true },

  // Structure and reasoning.
  { id: 'mind_map', providers: GROQ_FIRST, input: 'text', validation: 'visual_spec', timeoutMs: BASE_MS, retries: 1 },
  { id: 'knowledge_graph', providers: GROQ_FIRST, input: 'text', validation: 'visual_spec', timeoutMs: BASE_MS, retries: 1 },
  { id: 'concept_battle', providers: GEMINI_FIRST, input: 'text', timeoutMs: BASE_MS, retries: 1 },
  { id: 'confusion', providers: GEMINI_FIRST, input: 'text', timeoutMs: BASE_MS, retries: 1, lowEffort: true },
  { id: 'theory_feedback', providers: GEMINI_FIRST, input: 'text', validation: 'theory_feedback', timeoutMs: BASE_MS, retries: 1, lowEffort: true },

  // Images: only providers that can read them are ever tried.
  { id: 'snap_solve', providers: VISION, input: 'image', timeoutMs: BASE_MS, retries: 1 },
  { id: 'ocr_extraction', providers: VISION, input: 'image', timeoutMs: BASE_MS, retries: 1 },
  { id: 'diagram_question', providers: VISION, input: 'either', validation: 'visual_question', timeoutMs: BASE_MS, retries: 1 },
  { id: 'visual_explain', providers: ['gemini', 'groq', 'openai'], input: 'either', validation: 'visual_explain', timeoutMs: BASE_MS, retries: 1, lowEffort: true },
  { id: 'visual_planner', providers: ['gemini', 'groq', 'openai'], input: 'either', validation: 'visual_spec', timeoutMs: BASE_MS, retries: 1 },

  // Existing tasks, order unchanged from before the registry.
  { id: 'adaptive_tutor', providers: GEMINI_FIRST, input: 'text', timeoutMs: BASE_MS, retries: 1, lowEffort: true },
  // Custom-length quizzes (up to 30 questions) need the larger output budget.
  { id: 'adaptive_quiz', providers: GEMINI_FIRST, input: 'text', validation: 'quiz_custom', timeoutMs: HEAVY_MS, retries: 1, heavy: true },
  { id: 'adaptive_analysis', providers: GEMINI_FIRST, input: 'text', validation: 'quiz_analysis', timeoutMs: BASE_MS, retries: 1, lowEffort: true },
  { id: 'exam', providers: GEMINI_FIRST, input: 'text', validation: 'exam', timeoutMs: BASE_MS, retries: 1 },
  { id: 'exam_analysis', providers: GEMINI_FIRST, input: 'text', validation: 'exam_analysis', timeoutMs: BASE_MS, retries: 1, lowEffort: true },
  { id: 'topic_analysis', providers: GEMINI_FIRST, input: 'text', timeoutMs: BASE_MS, retries: 1, lowEffort: true },
  { id: 'research_editor', providers: GEMINI_FIRST, input: 'text', validation: 'research_edit', timeoutMs: BASE_MS, retries: 1, lowEffort: true },
  { id: 'fact', providers: GEMINI_FIRST, input: 'text', validation: 'fact', timeoutMs: BASE_MS, retries: 1, lowEffort: true },
];

export const TASKS: Readonly<Record<string, TaskSpec>> = Object.freeze(
  Object.fromEntries(list.map(t => [t.id, Object.freeze(t)])),
);

export const isKnownTask = (id: string): boolean => Object.prototype.hasOwnProperty.call(TASKS, id);

/** Used for server-internal callers that pass a task name the registry does not list. */
export const DEFAULT_TASK: TaskSpec = Object.freeze({
  id: 'default', providers: GEMINI_FIRST, input: 'either', timeoutMs: BASE_MS, retries: 1,
});

export const getTask = (id: string): TaskSpec => (isKnownTask(id) ? TASKS[id] : DEFAULT_TASK);

/** Persona ids the client may send. Anything else is rejected, not pasted into the prompt. */
export const PERSONA_IDS = ['friendly', 'strict', 'socratic', 'exam', 'research', 'planner'] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];
