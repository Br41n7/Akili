/**
 * Project model shared by the browser, the API routes and the AI context.
 *
 * A project is either:
 *  - "university": a course (or self-study topic) at a university/college, or
 *  - "secondary": a Secondary / O-Level subject, usually tied to an exam board.
 *
 * Creating a project only needs a name. The course/subject and the other details
 * are optional, and study materials can be added at any time.
 */
import { z } from 'zod';

export type EducationLevel = 'university' | 'secondary';
export type StudyGoal = 'exam_prep' | 'coursework' | 'self_study';

export interface ProjectRecord {
  id?: string;
  name: string;
  description?: string | null;
  education_level?: EducationLevel | null;
  subject?: string | null;
  exam_type?: string | null;
  exam_board?: string | null;
  class_level?: string | null;
  institution?: string | null;
  department?: string | null;
  course_code?: string | null;
  study_year?: string | null;
  study_goal?: StudyGoal | null;
  source?: string | null;
  created_at?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Options shown in the form
// ─────────────────────────────────────────────────────────────────────────────

export const EDUCATION_LEVELS: { value: EducationLevel; label: string; hint: string }[] = [
  { value: 'secondary', label: 'Secondary / O-Level', hint: 'WAEC, NECO, JAMB, KCSE and school exams' },
  { value: 'university', label: 'University', hint: 'A course, module or topic you are studying' },
];

export const EXAM_BOARDS: { value: string; label: string }[] = [
  { value: 'WAEC', label: 'WAEC (WASSCE)' },
  { value: 'NECO', label: 'NECO (SSCE)' },
  { value: 'JAMB', label: 'JAMB (UTME)' },
  { value: 'GCE', label: 'GCE / O-Level' },
  { value: 'IGCSE', label: 'Cambridge IGCSE' },
  { value: 'KCSE', label: 'KCSE' },
  { value: 'SCHOOL', label: 'School exam / not sure' },
];

export const SECONDARY_CLASSES = [
  'JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3',
  'Form 1', 'Form 2', 'Form 3', 'Form 4', 'Resitting / private candidate',
];

export const SECONDARY_SUBJECTS = [
  'Mathematics', 'English Language', 'Biology', 'Chemistry', 'Physics', 'Further Mathematics',
  'Economics', 'Government', 'Literature-in-English', 'Geography', 'History',
  'Christian Religious Studies', 'Islamic Studies', 'Agricultural Science', 'Commerce',
  'Financial Accounting', 'Civic Education', 'Computer Studies', 'Technical Drawing',
  'Food and Nutrition', 'French', 'Yoruba', 'Igbo', 'Hausa',
];

export const UNIVERSITY_YEARS = [
  'Year 1 (100 level)', 'Year 2 (200 level)', 'Year 3 (300 level)', 'Year 4 (400 level)',
  'Year 5 (500 level)', 'Year 6 (600 level)', 'Postgraduate',
];

export const STUDY_GOALS: Record<EducationLevel, { value: StudyGoal; label: string }[]> = {
  secondary: [
    { value: 'exam_prep', label: 'Prepare for the exam' },
    { value: 'coursework', label: 'Keep up with class' },
    { value: 'self_study', label: 'Learn it from scratch' },
  ],
  university: [
    { value: 'exam_prep', label: 'Prepare for a test or exam' },
    { value: 'coursework', label: 'Keep up with lectures' },
    { value: 'self_study', label: 'Learn it on my own' },
  ],
};

export const OTHER = 'Other';

// ─────────────────────────────────────────────────────────────────────────────
// Validation (used by the API and the form)
// ─────────────────────────────────────────────────────────────────────────────

const text = (max: number) => z.string().trim().max(max);
/** Optional text: empty strings become undefined so they are stored as NULL. */
const optionalText = (max: number) =>
  z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? undefined : v), text(max).optional());

const baseShape = {
  name: text(80).min(1, 'Give your project a name'),
  description: optionalText(300),
  study_goal: z.enum(['exam_prep', 'coursework', 'self_study']).optional(),
};

export const secondaryProjectSchema = z.object({
  ...baseShape,
  education_level: z.literal('secondary'),
  subject: optionalText(80), // the subject, optional: the project name is used when it is empty
  exam_board: z.enum(['WAEC', 'NECO', 'JAMB', 'GCE', 'IGCSE', 'KCSE', 'SCHOOL']).optional(),
  class_level: optionalText(40),
});

export const universityProjectSchema = z.object({
  ...baseShape,
  education_level: z.literal('university'),
  subject: optionalText(80), // the course title, optional
  course_code: optionalText(20),
  institution: optionalText(80),
  department: optionalText(80),
  study_year: optionalText(40),
});

export const createProjectSchema = z.discriminatedUnion('education_level', [secondaryProjectSchema, universityProjectSchema]);
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Columns written to the `projects` table. Fields that do not apply are left out. */
export function toProjectRow(input: CreateProjectInput, userId: string): Record<string, unknown> {
  const common = {
    user_id: userId,
    name: input.name,
    description: input.description ?? null,
    education_level: input.education_level,
    study_goal: input.study_goal ?? null,
    source: 'manual' as const,
  };
  if (input.education_level === 'secondary') {
    return {
      ...common,
      subject: input.subject ?? null,
      exam_board: input.exam_board ?? 'SCHOOL',
      exam_type: input.exam_board ?? 'SCHOOL', // kept in sync for older code and PastQ imports
      class_level: input.class_level ?? null,
    };
  }
  return {
    ...common,
    subject: input.subject ?? null,
    exam_type: 'UNIVERSITY',
    course_code: input.course_code ?? null,
    institution: input.institution ?? null,
    department: input.department ?? null,
    study_year: input.study_year ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading projects (including ones created before education_level existed)
// ─────────────────────────────────────────────────────────────────────────────

const SECONDARY_EXAM_TYPES = new Set(['WAEC', 'WASSCE', 'NECO', 'JAMB', 'UTME', 'POST-UTME', 'KCSE', 'BECE', 'GCE', 'IGCSE']);

export function levelOf(p: Pick<ProjectRecord, 'education_level' | 'exam_type'>): EducationLevel {
  if (p.education_level === 'secondary' || p.education_level === 'university') return p.education_level;
  return SECONDARY_EXAM_TYPES.has((p.exam_type || '').toUpperCase()) ? 'secondary' : 'university';
}

export function examBoardLabel(value?: string | null): string {
  if (!value) return '';
  const upper = value.toUpperCase();
  const found = EXAM_BOARDS.find(b => b.value === upper);
  if (found) return found.value === 'SCHOOL' ? 'School exam' : found.label;
  return value;
}

/** Short chips for cards and headers, e.g. ["WAEC (WASSCE)", "SS 3"] or ["200 level"]. */
export function projectChips(p: ProjectRecord): string[] {
  if (levelOf(p) === 'secondary') {
    return [examBoardLabel(p.exam_board || p.exam_type), p.class_level || ''].filter(Boolean);
  }
  return [p.course_code || '', p.study_year || '', p.institution || ''].filter(Boolean);
}

/** One-line subtitle, e.g. "Biology" or "Human Anatomy". */
export function projectSubject(p: ProjectRecord): string {
  return (p.subject || '').trim();
}

export function levelLabel(p: ProjectRecord): string {
  return levelOf(p) === 'secondary' ? 'Secondary / O-Level' : 'University';
}

// ─────────────────────────────────────────────────────────────────────────────
// AI context
// ─────────────────────────────────────────────────────────────────────────────

const GOAL_TEXT: Record<StudyGoal, string> = {
  exam_prep: 'preparing for an upcoming exam or test',
  coursework: 'keeping up with ongoing classes or lectures',
  self_study: 'learning the material independently',
};

/**
 * The learner block added to every AI request for a project.
 * It keeps university learners from getting O-Level/exam-board framing,
 * and secondary learners from getting university-level depth.
 */
export function buildProjectContext(p: ProjectRecord): string {
  const goal = p.study_goal ? `Their goal: ${GOAL_TEXT[p.study_goal]}.` : '';

  if (levelOf(p) === 'university') {
    const details = [
      p.subject ? `Course: ${p.subject}${p.course_code ? ` (${p.course_code})` : ''}` : p.course_code ? `Course code: ${p.course_code}` : '',
      p.department ? `Department: ${p.department}` : '',
      p.institution ? `Institution: ${p.institution}` : '',
      p.study_year ? `Year: ${p.study_year}` : '',
    ].filter(Boolean);

    return [
      'LEARNER LEVEL — UNIVERSITY',
      `The learner is a university student working on the project "${p.name}".`,
      details.length ? details.join('. ') + '.' : '',
      goal,
      'Teach at undergraduate level for their year: use correct technical terminology, explain reasoning and mechanisms, and build on prerequisite knowledge instead of restarting from secondary-school basics.',
      'Do NOT frame content around WAEC, NECO, JAMB, KCSE or any secondary-school exam board, and do not use secondary-school mark schemes.',
      'When writing assessment questions, use the style of university tests: conceptual and applied multiple-choice, short-answer and problem-based questions that match the uploaded course material.',
      'Treat the learner\'s uploaded materials as the syllabus. If they do not cover something, say so instead of inventing course-specific details.',
    ].filter(Boolean).join('\n');
  }

  const board = examBoardLabel(p.exam_board || p.exam_type);
  const boardKnown = !!board && board !== 'School exam';
  const details = [
    p.subject ? `Subject: ${p.subject}` : '',
    board ? `Exam: ${board}` : '',
    p.class_level ? `Class: ${p.class_level}` : '',
  ].filter(Boolean);

  return [
    'LEARNER LEVEL — SECONDARY / O-LEVEL',
    `The learner is a secondary-school student working on the project "${p.name}".`,
    details.length ? details.join('. ') + '.' : '',
    goal,
    'Explain at secondary-school level: plain language, short steps, worked examples, and the units and terminology used in that syllabus. Do not assume university-level background.',
    boardKnown
      ? `Follow the ${board} syllabus and question style: objective questions with four options (A–D) and theory questions with marking-scheme wording. Point out the exam technique that earns marks.`
      : 'Follow the standard secondary-school syllabus for the subject, in the style of school examinations.',
    'Treat the learner\'s uploaded materials as the main source; add only widely taught syllabus content.',
  ].filter(Boolean).join('\n');
}

/** Used in prompts that need a plain description of what is being studied. */
export function studySubjectText(p: ProjectRecord): string {
  const subject = p.subject?.trim();
  if (levelOf(p) === 'secondary') {
    const board = examBoardLabel(p.exam_board || p.exam_type);
    return [board && board !== 'School exam' ? board : '', subject || p.name].filter(Boolean).join(' ');
  }
  return subject || p.name;
}
