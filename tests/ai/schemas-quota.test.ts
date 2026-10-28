import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SCHEMAS, VALIDATION_TYPES, getValidator, withSchema } from '@/lib/ai-schemas';
import { TASKS, getTask, isKnownTask } from '@/lib/ai-tasks';
import { FREE_DAILY_LIMIT, planQuota, recordUsage } from '@/lib/ai-quota';

const lesson = (over: object = {}) => ({
  title: 'Photosynthesis',
  content: 'Plants turn light, water and carbon dioxide into glucose and oxygen inside chloroplasts.',
  learning_objectives: ['Define photosynthesis'],
  key_concepts: ['chlorophyll'],
  worked_example: { problem: 'Write the equation', solution_steps: ['Balance it'], answer: '6CO2 + 6H2O -> C6H12O6 + 6O2' },
  common_mistakes: ['Confusing it with respiration'],
  practice_questions: [{ type: 'multiple_choice', question: 'Where does it occur?', options: ['A) Chloroplast', 'B) Nucleus'], correct_answer: 'A', explanation: 'Chlorophyll is there.', concept: 'site' }],
  ...over,
});

describe('course schema', () => {
  const course = (modules: unknown) => ({ title: 'Biology', description: 'd', modules });

  it('accepts a complete course and keeps old-shape fields working', () => {
    const v = getValidator('course')(course([{ title: 'Energy', lessons: [lesson()] }]));
    expect(v.ok).toBe(true);
    if (v.ok) {
      const l = (v.data as any).modules[0].lessons[0];
      expect(l.id).toBe('m1-l1');
      expect(l.practice_questions[0].correct_answer).toBe('A');
    }
  });

  it('rejects a course with no usable module', () => {
    expect(getValidator('course')(course([])).ok).toBe(false);
    expect(getValidator('course')(course([{ title: 'Empty', lessons: [lesson({ content: 'too short' })] }])).ok).toBe(false);
  });

  it('accepts new optional lesson fields without dropping them', () => {
    const v = getValidator('course')(course([{ title: 'M', lessons: [lesson({ definitions: [{ term: 'x', meaning: 'y' }] })] }]));
    expect(v.ok).toBe(true);
  });
});

describe('Zod contract wrapper', () => {
  it('turns drift between normalizer and contract into a rejection with a readable reason', () => {
    const drifting = withSchema('demo', z.object({ n: z.number() }), () => ({ ok: true, data: { n: 'not a number' } }));
    const v = drifting({});
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/^demo: n /);
  });

  it('passes normalizer failures straight through', () => {
    const v = withSchema('demo', z.object({}), () => ({ ok: false, error: 'nope' }))({});
    expect(v).toEqual({ ok: false, error: 'nope' });
  });

  it('covers question sets, flashcards, facts and analyses', () => {
    expect(getValidator('quick_check')({ questions: [{ type: 'true_false', question: 'Water boils at 100C at sea level?', correct_answer: 'True', explanation: 'Yes.' }] }).ok).toBe(true);
    expect(getValidator('flashcard')({ mnemonic: 'ROY G BIV' }).ok).toBe(true);
    expect(getValidator('flashcard')({}).ok).toBe(false);
    expect(getValidator('fact')({ fact: 'x' }).ok).toBe(true);
    expect(getValidator('exam_analysis')({ overall_verdict: 'Good' }).ok).toBe(true);
    expect(getValidator('exam_analysis')({}).ok).toBe(false);
  });

  it('every schema belongs to a registered validator', () => {
    for (const name of Object.keys(SCHEMAS)) expect(VALIDATION_TYPES).toContain(name);
  });
});

describe('task registry', () => {
  it('lists every task the app calls', () => {
    const used = ['adaptive_analysis', 'adaptive_quiz', 'adaptive_tutor', 'course_builder', 'diagram_question', 'exam', 'fact', 'mnemonic', 'ocr_extraction', 'research_editor', 'topic_analysis', 'visual_explain', 'visual_planner'];
    for (const t of used) expect(isKnownTask(t), t).toBe(true);
  });

  it('only names real validators and providers, and orders have no duplicates', () => {
    for (const t of Object.values(TASKS)) {
      if (t.validation) expect(VALIDATION_TYPES, t.id).toContain(t.validation);
      expect(new Set(t.providers).size, t.id).toBe(t.providers.length);
      expect(t.timeoutMs).toBeGreaterThan(0);
      if (t.input !== 'text') expect(t.providers, t.id).not.toContain('deepseek');
    }
  });

  it('does not treat Object.prototype names as tasks', () => {
    expect(isKnownTask('constructor')).toBe(false);
    expect(isKnownTask('__proto__')).toBe(false);
    expect(getTask('nope').id).toBe('default');
  });
});

describe('daily allowance', () => {
  it('allows requests under the limit', () => {
    expect(planQuota({ usedToday: 0, hasOwnKey: false })).toEqual({ allow: true, userKeyOnly: false });
    expect(planQuota({ usedToday: FREE_DAILY_LIMIT - 1, hasOwnKey: false }).allow).toBe(true);
  });
  it('blocks at the limit without a personal key', () => {
    expect(planQuota({ usedToday: FREE_DAILY_LIMIT, hasOwnKey: false }).allow).toBe(false);
  });
  it('at the limit, a personal key restricts the request to that key instead of lifting the limit', () => {
    expect(planQuota({ usedToday: FREE_DAILY_LIMIT, hasOwnKey: true })).toEqual({ allow: true, userKeyOnly: true });
  });

  it('records usage through the atomic function', async () => {
    const rpc = vi.fn(async () => ({ data: 5, error: null }));
    const upsert = vi.fn();
    await recordUsage({ rpc, from: () => ({ upsert }) }, 'u1', '2026-10-21', 4);
    expect(rpc).toHaveBeenCalledWith('increment_ai_usage', { p_user: 'u1', p_date: '2026-10-21', p_limit: FREE_DAILY_LIMIT });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('falls back to the old upsert when the function is not installed yet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'function not found' } }));
    const upsert = vi.fn(async () => ({}));
    await recordUsage({ rpc, from: () => ({ upsert }) }, 'u1', '2026-10-21', 4);
    expect(upsert).toHaveBeenCalledWith({ user_id: 'u1', usage_date: '2026-10-21', count: 5 }, { onConflict: 'user_id,usage_date' });
  });
});
