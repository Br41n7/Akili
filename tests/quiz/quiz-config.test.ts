import { describe, expect, it } from 'vitest';
import { COUNT_PRESETS, MAX_QUESTIONS, QUESTION_TYPES, buildQuizPrompt, clampCount, isAnswerCorrect, normalizeAnswer, shapeQuestions, splitCounts, theoryFraction } from '@/lib/quiz-config';
import { toggleSelection } from '@/lib/utils';
import { getValidator } from '@/lib/ai-schemas';
import { summarizeAssessment } from '@/lib/local-learning';

describe('number of questions', () => {
  it('accepts presets and any whole number in range', () => {
    expect(COUNT_PRESETS).toEqual([5, 10, 15, 20]);
    for (const n of [1, 5, 7, 10, 13, 30]) expect(clampCount(n)).toBe(n);
    expect(clampCount('12')).toBe(12);
  });
  it('clamps and repairs bad input', () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-4)).toBe(1);
    expect(clampCount(500)).toBe(MAX_QUESTIONS);
    expect(clampCount(7.9)).toBe(7);
    expect(clampCount('')).toBe(5);
    expect(clampCount('abc', 8)).toBe(8);
    expect(clampCount(NaN)).toBe(5);
    expect(clampCount(undefined)).toBe(5);
  });
  it('splits evenly with the remainder going to the first types', () => {
    expect(splitCounts(10, ['a', 'b', 'c', 'd'])).toEqual({ a: 3, b: 3, c: 2, d: 2 });
    expect(splitCounts(5, ['a', 'b'])).toEqual({ a: 3, b: 2 });
    expect(splitCounts(1, ['a', 'b'])).toEqual({ a: 1, b: 0 });
    expect(Object.values(splitCounts(17, ['a', 'b', 'c'])).reduce((x, y) => x + y, 0)).toBe(17);
  });
});

describe('question types', () => {
  it('offers the four types and nothing about languages', () => {
    expect(QUESTION_TYPES.map(t => t.value)).toEqual(['multiple_choice', 'fill_gap', 'statements', 'theory']);
  });
  it('never lets the last selected type be removed, and keeps a stable order', () => {
    const all = ['a', 'b', 'c'];
    expect(toggleSelection(all, ['a'], 'a')).toEqual(['a']);
    expect(toggleSelection(all, ['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleSelection(all, ['c'], 'a')).toEqual(['a', 'c']);
  });
});

describe('quiz prompt', () => {
  const base = { topic: 'Photosynthesis', difficulty: 'medium' as const, context: 'notes', adaptive: {}, hasImage: false };

  it('asks for exactly the chosen count and the chosen mix', () => {
    const p = buildQuizPrompt({ ...base, count: 10, types: ['multiple_choice', 'fill_gap', 'statements', 'theory'] });
    expect(p).toContain('exactly 10 adaptive questions');
    expect(p).toContain('3 × multiple_choice, 3 × fill_gap, 2 × statements, 2 × theory');
  });
  it('uses the singular for one question', () => {
    expect(buildQuizPrompt({ ...base, count: 1, types: ['theory'] })).toContain('exactly 1 adaptive question about');
  });
  it('describes only the selected types', () => {
    const p = buildQuizPrompt({ ...base, count: 5, types: ['fill_gap'] });
    expect(p).toContain('"fill_gap"');
    expect(p).not.toContain('"statements": a stem');
    expect(p).not.toContain('"theory": a question');
  });
  it('describes statement questions as I, II, III, IV combinations', () => {
    const p = buildQuizPrompt({ ...base, count: 4, types: ['statements'] });
    expect(p).toMatch(/I and II only/);
    expect(p).toMatch(/3 or 4 short statements/);
  });
  it('adds diagram questions only when an image is attached', () => {
    expect(buildQuizPrompt({ ...base, count: 5, types: ['multiple_choice'] })).not.toContain('"diagram"');
    expect(buildQuizPrompt({ ...base, count: 5, types: ['multiple_choice'], hasImage: true })).toContain('× diagram');
  });
  it('has no language instruction', () => {
    const p = buildQuizPrompt({ ...base, count: 5, types: ['multiple_choice'] });
    expect(p).not.toMatch(/German|Language:/i);
  });
});

describe('trimming the AI answer to the request', () => {
  const qs = [{ type: 'multiple_choice' }, { type: 'fill_gap' }, { type: 'theory' }, { type: 'true_false' }, { type: 'concept_trap' }, { type: 'statements' }];
  it('drops types that were not chosen', () => {
    expect(shapeQuestions(qs, { count: 30, types: ['fill_gap', 'theory'], hasImage: false }).map(q => q.type)).toEqual(['fill_gap', 'theory']);
  });
  it('treats concept traps as multiple choice', () => {
    expect(shapeQuestions(qs, { count: 30, types: ['multiple_choice'], hasImage: false }).map(q => q.type)).toEqual(['multiple_choice', 'concept_trap']);
  });
  it('caps at the requested count', () => {
    expect(shapeQuestions(Array(12).fill({ type: 'fill_gap' }), { count: 7, types: ['fill_gap'], hasImage: false })).toHaveLength(7);
  });
  it('keeps diagram questions only with an image', () => {
    expect(shapeQuestions([{ type: 'diagram' }], { count: 5, types: ['fill_gap'], hasImage: false })).toHaveLength(0);
    expect(shapeQuestions([{ type: 'diagram' }], { count: 5, types: ['fill_gap'], hasImage: true })).toHaveLength(1);
  });
});

describe('marking', () => {
  it('fill in the gap ignores case, spacing, edge punctuation and a leading article', () => {
    const q = { id: 'q', type: 'fill_gap', correct_answer: 'the Mitochondria' };
    for (const a of ['mitochondria', '  Mitochondria. ', 'THE MITOCHONDRIA', '"mitochondria"']) expect(isAnswerCorrect(q, a), a).toBe(true);
    expect(isAnswerCorrect(q, 'mitochondrion')).toBe(false);
    expect(isAnswerCorrect(q, '')).toBe(false);
    expect(isAnswerCorrect(q, undefined)).toBe(false);
  });
  it('fill in the gap accepts alternatives separated by |', () => {
    const q = { id: 'q', type: 'fill_gap', correct_answer: 'sodium chloride | table salt | NaCl' };
    expect(isAnswerCorrect(q, 'Table salt')).toBe(true);
    expect(isAnswerCorrect(q, 'nacl')).toBe(true);
    expect(isAnswerCorrect(q, 'sugar')).toBe(false);
  });
  it('multiple choice and statements compare the letter', () => {
    expect(isAnswerCorrect({ id: 'q', type: 'statements', correct_answer: 'C' }, 'C')).toBe(true);
    expect(isAnswerCorrect({ id: 'q', type: 'multiple_choice', correct_answer: 'C' }, 'c')).toBe(false);
  });
  it('theory is correct when half or more of the points are covered', () => {
    const q = { id: 't', type: 'theory', marking_points: ['a', 'b', 'c', 'd'] };
    expect(isAnswerCorrect(q, 'text', { t: { covered: [0] } })).toBe(false);
    expect(isAnswerCorrect(q, 'text', { t: { covered: [0, 3] } })).toBe(true);
    expect(isAnswerCorrect(q, 'text', {})).toBe(false);
  });
  it('theory ignores out-of-range or repeated point numbers', () => {
    const q = { marking_points: ['a', 'b'] };
    expect(theoryFraction(q, { covered: [0, 0, 7, -1] })).toBe(0.5);
    expect(theoryFraction({ marking_points: [] }, { covered: [0] })).toBe(0);
  });
  it('local summary uses the same rules, including theory marks', () => {
    const questions = [
      { id: '1', type: 'fill_gap', correct_answer: 'Osmosis', concept: 'transport' },
      { id: '2', type: 'theory', marking_points: ['x', 'y'], concept: 'transport' },
    ];
    const r = summarizeAssessment(questions, { '1': ' osmosis. ', '2': 'long answer' }, { '2': { covered: [0, 1] } });
    expect(r.weak_concepts).toEqual([]);
    expect(summarizeAssessment(questions, { '1': 'x', '2': 'y' }, {}).weak_concepts).toEqual(['transport']);
  });
  it('normalizeAnswer is stable', () => {
    expect(normalizeAnswer('  An  Apple!! ')).toBe('apple');
  });
});

describe('validators for the new question types', () => {
  const v = getValidator('quiz_custom');
  const statements = { type: 'statements', question: 'Consider these statements about enzymes.', statements: ['Enzymes are proteins', 'Enzymes are used up', '1) Enzymes lower activation energy'], options: ['A) I only', 'B) I and III only', 'C) II only', 'D) I, II and III'], correct_answer: 'B', explanation: 'I and III are true.', concept: 'enzymes' };
  const theory = { type: 'theory', question: 'Explain osmosis.', model_answer: 'Water moves across a membrane. It moves from low to high solute concentration. No energy is needed.', marking_points: ['water moves', 'semi-permeable membrane', 'no energy'], explanation: 'Core idea.', concept: 'osmosis' };

  it('accepts any number of questions from 1', () => {
    expect(v({ questions: [theory] }).ok).toBe(true);
  });
  it('numbers statements I, II, III, IV and strips labels the model added', () => {
    const r = v({ questions: [statements] });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data as any).questions[0].statements).toEqual(['I. Enzymes are proteins', 'II. Enzymes are used up', 'III. Enzymes lower activation energy']);
  });
  it('rejects statements questions with fewer than three statements or a bad answer', () => {
    expect(v({ questions: [{ ...statements, statements: ['only one'] }] }).ok).toBe(false);
    expect(v({ questions: [{ ...statements, correct_answer: 'Z' }] }).ok).toBe(false);
  });
  it('keeps theory model answer and marking points, and derives points when missing', () => {
    const r: any = v({ questions: [theory, { ...theory, marking_points: undefined }] });
    expect(r.ok).toBe(true);
    expect(r.data.questions[0].marking_points).toHaveLength(3);
    expect(r.data.questions[0].model_answer).toMatch(/Water moves/);
    expect(r.data.questions[1].marking_points.length).toBeGreaterThanOrEqual(2);
  });
  it('rejects theory with no answer', () => {
    expect(v({ questions: [{ type: 'theory', question: 'Explain osmosis.' }] }).ok).toBe(false);
  });
  it('still validates the original quiz types', () => {
    expect(v({ questions: [{ type: 'fill_gap', question: 'Water boils at □□□ °C.', correct_answer: '100', explanation: 'x', concept: 'c' }] }).ok).toBe(true);
  });
  it('validates theory feedback and ignores bad indexes', () => {
    const f = getValidator('theory_feedback');
    const r: any = f({ covered: [0, '2', 'x', -1, 1.5, 0], feedback: 'You covered the main idea.' });
    expect(r.ok).toBe(true);
    expect(r.data.covered).toEqual([0, 2]);
    expect(f({ covered: [0] }).ok).toBe(false);
  });
});
