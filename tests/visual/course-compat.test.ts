import { describe, expect, it } from 'vitest';
import { getValidator } from '@/lib/ai-schemas';
import { readStoredVisual, withLessonVisual } from '@/lib/visual/lesson';
import { safeVisualSpec } from '@/lib/visual/schema';
import * as F from './fixtures';

const lesson = (n: number) => ({ title: `Lesson ${n}`, learning_objectives: ['Understand it'], content: 'x'.repeat(60), key_concepts: ['a'], worked_example: { problem: 'p', solution_steps: ['s'], answer: 'a' }, common_mistakes: [], practice_questions: [{ question: 'Q?', concept: 'c', options: ['A) 1', 'B) 2', 'C) 3', 'D) 4'], correct_answer: 'B', explanation: 'e' }] });
const course = { title: 'Biochem', description: 'd', modules: [{ module_number: 1, title: 'M1', lessons: [lesson(1), lesson(2)] }] };

describe('existing Generate Course is untouched', () => {
  it('the course validator still accepts and normalises a course with no visuals', () => {
    const r = getValidator('course')(course);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const lessons = (r.data as any).modules[0].lessons;
      expect(lessons.map((l: any) => l.id)).toEqual(['m1-l1', 'm1-l2']);
      expect(lessons[0].practice_questions[0].correct_answer).toBe('B');
      expect('visual' in lessons[0]).toBe(false);
    }
  });
  it('other validators still work', () => {
    expect(getValidator('quiz')({ questions: [1, 2, 3].map(i => ({ question: `Q${i}`, options: ['A) a', 'B) b'], correct_answer: 'A' })) }).ok).toBe(true);
    expect(getValidator('does_not_exist')({ a: 1 }).ok).toBe(true);
  });
});

describe('visuals cached inside lesson JSON (no schema change)', () => {
  const modules = (getValidator('course')(course) as any).data.modules;
  const spec = safeVisualSpec(F.skinLayers)!;
  it('courses and lessons without a visual read as "nothing stored"', () => {
    expect(readStoredVisual(modules[0].lessons[0])).toBeNull();
    expect(readStoredVisual(undefined)).toBeNull();
    expect(readStoredVisual({ visual: 'junk' })).toBeNull();
  });
  it('stores a visual on one lesson without touching the others or the questions', () => {
    const next = withLessonVisual(modules, 'm1-l1', { status: 'ready', spec, created_at: 'now' });
    expect(readStoredVisual(next[0].lessons[0])?.status).toBe('ready');
    expect(next[0].lessons[1]).toEqual(modules[0].lessons[1]);
    expect(next[0].lessons[0].practice_questions).toEqual(modules[0].lessons[0].practice_questions);
    expect(modules[0].lessons[0].visual).toBeUndefined(); // input not mutated
  });
  it('remembers "no visual needed" and can clear it', () => {
    const none = withLessonVisual(modules, 'm1-l2', { status: 'none', reason: 'text only', created_at: 'now' });
    expect(readStoredVisual(none[0].lessons[1])).toMatchObject({ status: 'none', reason: 'text only' });
    expect(withLessonVisual(none, 'm1-l2', null)[0].lessons[1].visual).toBeUndefined();
  });
  it('a tampered or stale stored spec is ignored, not rendered', () => {
    const bad = withLessonVisual(modules, 'm1-l1', { status: 'ready', spec: { ...spec, elements: [{ id: 'a', label: '<script>' } as any] }, created_at: 'now' });
    expect(readStoredVisual(bad[0].lessons[0])).toBeNull();
  });
});
