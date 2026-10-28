import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TeX, { renderTeX } from '@/components/Math';
import LessonExtras from '@/components/LessonExtras';
import QuizSettings from '@/components/QuizSettings';
import { Prose } from '@/components/ui';
import { cleanLatex, getValidator, normalizeDefinitions, normalizeExercises, normalizeFormulas } from '@/lib/ai-schemas';

const lesson = (extra: object = {}) => ({
  title: 'Motion', content: 'Velocity is the rate of change of displacement over time, measured in metres per second.',
  learning_objectives: ['Use v = u + at'], key_concepts: ['velocity'], worked_example: null, common_mistakes: [],
  practice_questions: [], ...extra,
});
const course = (l: object) => ({ title: 'Physics', modules: [{ title: 'Kinematics', lessons: [l] }] });

describe('Phase 1b: lesson extras in the schema', () => {
  it('courses saved before this change still validate (no extras at all)', () => {
    expect(getValidator('course')(course(lesson())).ok).toBe(true);
  });
  it('new lessons always carry the three arrays', () => {
    const r: any = getValidator('course')(course(lesson()));
    expect(r.data.modules[0].lessons[0]).toMatchObject({ definitions: [], formulas: [], exercises: [] });
  });
  it('keeps well-formed definitions, formulas and exercises', () => {
    const r: any = getValidator('course')(course(lesson({
      definitions: [{ term: 'Velocity', meaning: 'Speed in a direction' }],
      formulas: [{ name: 'First equation of motion', latex: '$$v = u + at$$', explanation: 'Final velocity', variables: [{ symbol: 'v', meaning: 'final velocity' }] }],
      exercises: [{ prompt: 'A car accelerates at 2 m/s² for 5 s from rest. Find v.', hint: 'u = 0', solution_steps: ['v = 0 + 2 × 5'], answer: '10 m/s' }],
    })));
    expect(r.ok).toBe(true);
    const l = r.data.modules[0].lessons[0];
    expect(l.definitions).toHaveLength(1);
    expect(l.formulas[0].latex).toBe('v = u + at');
    expect(l.exercises[0].answer).toBe('10 m/s');
  });
  it('drops malformed entries instead of failing the whole course', () => {
    expect(normalizeDefinitions([{ term: 'x' }, { meaning: 'y' }, 'str', null, { term: 'ok', meaning: 'fine' }])).toHaveLength(1);
    expect(normalizeFormulas([{ name: 'no tex' }, { latex: '   ' }, { latex: 'a=b' }])).toHaveLength(1);
    expect(normalizeExercises([{ prompt: 'no solution' }, { prompt: 'p', answer: 'a' }])).toHaveLength(1);
    expect(normalizeFormulas('nope')).toEqual([]);
  });
  it('caps list sizes and text length', () => {
    expect(normalizeDefinitions(Array.from({ length: 20 }, (_, i) => ({ term: `t${i}`, meaning: 'm' })))).toHaveLength(8);
    expect(normalizeFormulas([{ latex: 'x'.repeat(1000) }])[0].latex).toHaveLength(300);
  });
  it('strips TeX delimiters models add', () => {
    expect(cleanLatex('$E = mc^2$')).toBe('E = mc^2');
    expect(cleanLatex('$$E = mc^2$$')).toBe('E = mc^2');
    expect(cleanLatex('\\(a+b\\)')).toBe('a+b');
    expect(cleanLatex('\\[a+b\\]')).toBe('a+b');
    expect(cleanLatex('a + b')).toBe('a + b');
  });
});

describe('math rendering', () => {
  it('renders TeX with KaTeX', () => {
    const html = renderToStaticMarkup(<TeX tex="x^2 + y^2 = z^2" block />);
    expect(html).toContain('katex');
    expect(html).toContain('katex-display');
  });
  it('shows broken TeX as text instead of throwing', () => {
    expect(() => renderTeX('\\frac{1}{')).not.toThrow();
    expect(renderTeX('\\frac{1}{')).toContain('katex');
  });
  it('does not let TeX run scripts or load URLs', () => {
    const html = renderTeX('\\href{javascript:alert(1)}{click} \\includegraphics{http://evil.test/x.png} \\htmlClass{x}{y}');
    expect(html).not.toMatch(/<a\s/i);
    expect(html).not.toMatch(/<img/i);
    // The TeX source is kept as inert text in the MathML annotation, so check attributes, not the whole string.
    expect(html).not.toMatch(/(?:href|src|xlink:href|action)\s*=\s*["']?\s*javascript:/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });
  it('renders $$ math in lesson prose but leaves prices alone', () => {
    const html = renderToStaticMarkup(<Prose>{'Speed is\n\n$$v = d / t$$\n\nIt costs $5 and $10 in total.'}</Prose>);
    expect(html).toContain('katex');
    expect(html).toContain('costs $5 and $10 in total');
  });
});

describe('LessonExtras', () => {
  it('renders nothing for a lesson saved before extras existed', () => {
    expect(renderToStaticMarkup(<LessonExtras lesson={lesson()} />)).toBe('');
    expect(renderToStaticMarkup(<LessonExtras lesson={{ definitions: [], formulas: [], exercises: [] }} />)).toBe('');
  });
  it('shows definitions, formulas with variables, and exercises with hint and solution controls', () => {
    const html = renderToStaticMarkup(<LessonExtras lesson={{
      definitions: [{ term: 'Velocity', meaning: 'Speed in a direction' }],
      formulas: [{ name: 'Equation', latex: 'v = u + at', explanation: 'Final velocity', variables: [{ symbol: 'v', meaning: 'final velocity' }] }],
      exercises: [{ prompt: 'Find v.', hint: 'Start at rest', solution_steps: ['v = 0 + 10'], answer: '10 m/s' }],
    }} />);
    expect(html).toContain('Definitions');
    expect(html).toContain('Velocity');
    expect(html).toContain('katex');
    expect(html).toContain('final velocity');
    expect(html).toContain('Try it yourself');
    expect(html).toContain('Hint');
    expect(html).toContain('Show solution');
    expect(html).not.toContain('10 m/s'); // the answer stays hidden until asked for
  });
  it('skips entries with missing fields rather than crashing', () => {
    const html = renderToStaticMarkup(<LessonExtras lesson={{ definitions: [{ term: '', meaning: 'x' }] as any, formulas: [{ latex: '' }] as any, exercises: [{ prompt: '' }] as any }} />);
    expect(html).toBe('');
  });
});

describe('quiz settings UI', () => {
  const html = (over: object = {}) => renderToStaticMarkup(<QuizSettings types={['multiple_choice', 'fill_gap']} onTypes={() => {}} count={10} onCount={() => {}} {...over} />);
  it('shows the four question types and the count controls', () => {
    const h = html();
    for (const label of ['Multiple choice', 'Fill in the gap', 'Statements (I, II, III, IV)', 'Theory']) expect(h).toContain(label);
    for (const n of [5, 10, 15, 20]) expect(h).toContain(`>${n}<`);
    expect(h).toContain('Custom');
    expect(h).toContain('1 to 30');
  });
  it('marks selected types and the selected preset as pressed', () => {
    const h = html();
    expect((h.match(/aria-pressed="true"/g) || []).length).toBe(3); // two types + the preset 10
  });
  it('has no language option', () => {
    expect(html()).not.toMatch(/German|Language/i);
  });
});

describe('QuizMode setup screen', () => {
  it('has no language picker, and the quiz options sit under "More options"', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
    const { default: QuizMode } = await import('@/components/QuizMode');
    const h = renderToStaticMarkup(<QuizMode projectId="p" userId="u" region="Nigeria" persona="friendly" />);
    expect(h).not.toMatch(/German|Language/i);
    expect(h).toContain('More options');
    expect(h).toContain('Question types');
    expect(h).toContain('Number of questions');
    expect(h).toContain('5 questions');
    expect(h.indexOf('More options')).toBeLessThan(h.indexOf('Question types'));
  });
});
