import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getValidator } from '@/lib/ai-schemas';
import { getTask } from '@/lib/ai-tasks';
import { battleToMarkdown, buildBattlePrompt, buildReadPrompt, buildSolvePrompt, checkImageFile, dataUrlToBase64, fitSize, gradeBattle, needsCareful, type Battle } from '@/lib/snap';
import { SolutionView } from '@/components/SnapSolve';
import { BattleView } from '@/components/BattleView';
import { mockProviders, setEnv } from '../ai/helpers';
import { vi } from 'vitest';

const read = (o: object = {}) => ({ question_text: 'Solve 3x + 2 = 11', diagram_description: '', subject_guess: 'Maths', legible: true, confidence: 'high', uncertain: [], ...o });
const sol = (o: object = {}) => ({ problem_type: 'Linear equation', concept: 'Solving for x', explanation: 'Isolate x.', solution_steps: ['3x = 9', 'x = 3'], final_answer: 'x = 3', shortcut_method: '', common_mistakes: ['Sign slips'], ...o });
const battle = (o: any = {}) => ({
  title: 'Mitosis vs Meiosis', concepts: ['Mitosis', 'Meiosis'],
  comparison: [1, 2, 3, 4].map(i => ({ feature: `F${i}`, concept1: `m${i}`, concept2: `n${i}` })),
  analogy: 'Photocopy vs shuffle', scenario: 'Exam question',
  rounds: [
    { statement: 'Produces two identical cells', answer: 'a', explanation: 'x' }, { statement: 'Produces four different cells', answer: 'b', explanation: 'y' },
    { statement: 'Involves DNA replication first', answer: 'both', explanation: 'z' }, { statement: 'Occurs in bacteria', answer: 'neither', explanation: 'w' },
  ], ...o,
});

describe('registry', () => {
  it('reading needs a picture; solving is text only', () => {
    expect(getTask('snap_read')).toMatchObject({ input: 'image', validation: 'snap_read' });
    expect(getTask('snap_solve')).toMatchObject({ input: 'text', validation: 'snap_solve' });
    expect(getTask('snap_read').providers[0]).toBe('gemini');
    expect(getTask('concept_battle').validation).toBe('concept_battle');
  });
});

describe('snap_read validator', () => {
  it('accepts and is idempotent', () => { const a = getValidator('snap_read')(read()); expect(a.ok).toBe(true); if (a.ok) expect(getValidator('snap_read')(a.data).ok).toBe(true); });
  it('reports an unreadable photo honestly instead of failing or guessing', () => {
    const r = getValidator('snap_read')({ question_text: '', legible: false });
    expect(r.ok && (r.data as any).legible).toBe(false);
    expect(getValidator('snap_read')({ question_text: '' }).ok).toBe(false);
  });
  it('forces a bad confidence value to medium and keeps uncertain parts', () => {
    const r = getValidator('snap_read')(read({ confidence: 'sure!', uncertain: ['exponent 2 or 3'] }));
    expect(r.ok && (r.data as any).confidence).toBe('medium'); expect(r.ok && (r.data as any).uncertain).toEqual(['exponent 2 or 3']);
  });
});

describe('snap_solve validator', () => {
  it('accepts and is idempotent', () => { const a = getValidator('snap_solve')(sol()); expect(a.ok).toBe(true); if (a.ok) expect(getValidator('snap_solve')(a.data).ok).toBe(true); });
  it('accepts explain-only (no steps, no answer) but not an empty reply', () => {
    expect(getValidator('snap_solve')(sol({ solution_steps: [], final_answer: '' })).ok).toBe(true);
    expect(getValidator('snap_solve')(sol({ solution_steps: [], explanation: '' })).ok).toBe(false);
    expect(getValidator('snap_solve')(sol({ concept: '' })).ok).toBe(false);
  });
});

describe('concept_battle validator', () => {
  it('accepts a good battle, mapping concept1/concept2 to a/b, and is idempotent', () => {
    const a = getValidator('concept_battle')(battle()); expect(a.ok).toBe(true);
    if (a.ok) { expect((a.data as any).comparison[0]).toMatchObject({ a: 'm1', b: 'n1' }); expect(getValidator('concept_battle')(a.data).ok).toBe(true); }
  });
  it('accepts a concept name as the answer', () => {
    const b = battle(); b.rounds[0].answer = 'Mitosis';
    const r = getValidator('concept_battle')(b); expect(r.ok && (r.data as any).rounds[0].answer).toBe('a');
  });
  it('rejects the same concept twice, too few rows or rounds, bad answers and one-answer rounds', () => {
    expect(getValidator('concept_battle')(battle({ concepts: ['Mitosis', 'mitosis'] })).ok).toBe(false);
    expect(getValidator('concept_battle')(battle({ comparison: battle().comparison.slice(0, 2) })).ok).toBe(false);
    expect(getValidator('concept_battle')(battle({ rounds: battle().rounds.slice(0, 2) })).ok).toBe(false);
    expect(getValidator('concept_battle')(battle({ rounds: battle().rounds.map((r: any) => ({ ...r, answer: 'maybe' })) })).ok).toBe(false);
    expect(getValidator('concept_battle')(battle({ rounds: battle().rounds.map((r: any) => ({ ...r, answer: 'a' })) })).ok).toBe(false);
  });
  it('drops duplicate statements', () => {
    const b = battle(); b.rounds.push({ ...b.rounds[0] });
    const r = getValidator('concept_battle')(b); expect(r.ok && (r.data as any).rounds).toHaveLength(4);
  });
});

describe('helpers and prompts', () => {
  it('fitSize shrinks big images, never enlarges, keeps the ratio', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1600, height: 1200 }); expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 }); expect(fitSize(0, 0).width).toBeGreaterThan(0);
  });
  it('checks files and strips data-url prefixes', () => {
    expect(checkImageFile({ type: 'application/pdf', size: 10 })).toMatch(/image/); expect(checkImageFile({ type: 'image/png', size: 40_000_000 })).toMatch(/large/); expect(checkImageFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(dataUrlToBase64('data:image/jpeg;base64,AAAA')).toBe('AAAA');
  });
  it('asks to double-check unless the read was confident and clean', () => {
    expect(needsCareful({ confidence: 'high', uncertain: [] })).toBe(false); expect(needsCareful({ confidence: 'high', uncertain: ['x'] })).toBe(true); expect(needsCareful({ confidence: 'low', uncertain: [] })).toBe(true);
  });
  it('the read prompt forbids solving; explain mode forbids the answer; solve mode demands checked arithmetic', () => {
    expect(buildReadPrompt()).toMatch(/NOT sure/); expect(buildReadPrompt()).not.toMatch(/solve it/i);
    const e = buildSolvePrompt({ question: 'q', diagram: '', mode: 'explain' }); expect(e).toMatch(/Do NOT give the answer/);
    const s = buildSolvePrompt({ question: 'q', diagram: 'a graph', mode: 'solve' }); expect(s).toMatch(/Check the arithmetic/); expect(s).toContain('a graph');
  });
  it('battle prompt names both concepts in order', () => { const p = buildBattlePrompt({ a: 'Mitosis', b: 'Meiosis', context: '' }); expect(p).toContain('["Mitosis", "Meiosis"]'); });
  it('grades and exports a battle', () => {
    const b = getValidator('concept_battle')(battle()); if (!b.ok) throw 0; const bb = b.data as unknown as Battle;
    expect(gradeBattle(bb, ['a', 'b', 'x', null])).toEqual({ correct: 2, total: 4 });
    expect(battleToMarkdown(bb)).toMatch(/\| F1 \| m1 \| n1 \|/);
  });
});

describe('views', () => {
  it('explain mode never shows the answer or the steps, even if the AI sent them', () => {
    const h = renderToStaticMarkup(React.createElement(SolutionView, { s: sol() as any, mode: 'explain' }));
    expect(h).not.toContain('x = 3'); expect(h).not.toContain('3x = 9'); expect(h).toContain('Isolate x.');
    const h2 = renderToStaticMarkup(React.createElement(SolutionView, { s: sol() as any, mode: 'solve' }));
    expect(h2).toContain('Answer: x = 3');
  });
  it('escapes hostile text', () => {
    const h = renderToStaticMarkup(React.createElement(SolutionView, { s: sol({ explanation: '<img src=x onerror=1>' }) as any, mode: 'solve' }));
    expect(h).not.toMatch(/<img/i);
  });
  it('battle opens on the comparison table with a start button', () => {
    const v = getValidator('concept_battle')(battle()); if (!v.ok) throw 0;
    const h = renderToStaticMarkup(React.createElement(BattleView, { b: v.data as any }));
    expect(h).toContain('Start the battle (4 rounds)'); expect(h).toContain('m1');
  });
});

describe('picture model selection', () => {
  const IMAGE = { base64: 'AAAA', mimeType: 'image/jpeg' as const };
  const base = { task: 'snap_read', prompt: 'read', system: '' };
  const load = async () => { vi.resetModules(); return import('@/lib/ai'); };
  it('GEMINI_VISION_MODEL applies to pictures only', async () => {
    setEnv({ GEMINI_API_KEY: 'AIzaBBBBBBBBBBBBBBBBBBBBBBBB', GEMINI_MODEL: 'text-model', GEMINI_VISION_MODEL: 'vision-pro' });
    const net = mockProviders({ gemini: [{ text: 'ok' }] });
    const { runAIDetailed } = await load();
    await runAIDetailed({ ...base, image: IMAGE } as any);
    await runAIDetailed({ task: 'adaptive_tutor', prompt: 'hi', system: '' } as any);
    expect(net.calls[0].url).toContain('vision-pro'); expect(net.calls[1].url).toContain('text-model');
  });
});
