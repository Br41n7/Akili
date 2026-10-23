import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getValidator } from '@/lib/ai-schemas';
import { getTask } from '@/lib/ai-tasks';
import { buildConfusionPrompt, buildShortcutPrompt, confusionToText, shortcutToText } from '@/lib/help-tools';
import { ConfusionCard, ShortcutCards } from '@/components/HelpTools';

const conf = () => ({ likely_confusion: 'You think water is pushed.', simple_explanation: 'Water moves from a dilute to a concentrated solution through a membrane.', analogy: 'Like a crowd moving toward a loud market.',
  steps: [{ title: 'Spot the membrane', text: 'Only water passes.' }, { title: 'Compare', text: 'Find the side with more solute.' }], check: { question: 'Which way does water move?', answer: 'Toward more solute.' }, if_still_stuck: 'Draw both sides.' });
const sc = () => ({ topic: 'Simultaneous equations', methods: [{ name: 'Elimination', when_to_use: 'Two linear equations', steps: ['Match coefficients', 'Subtract'], example: { problem: 'x+y=5, x-y=1', working: ['Add: 2x=6', 'x=3'], answer: 'x=3, y=2' }, watch_out: 'Sign slips' }] });

describe('registry', () => {
  it('validated by name', () => { expect(getTask('confusion').validation).toBe('confusion'); expect(getTask('shortcut').validation).toBe('shortcut'); });
});
describe('confusion validator', () => {
  it('accepts and is idempotent', () => { const a = getValidator('confusion')(conf()); expect(a.ok).toBe(true); if (a.ok) expect(getValidator('confusion')(a.data).ok).toBe(true); });
  it('rejects a missing explanation, too few steps or no self-check', () => {
    expect(getValidator('confusion')({ ...conf(), simple_explanation: 'short' }).ok).toBe(false);
    expect(getValidator('confusion')({ ...conf(), steps: [{ text: 'one' }] }).ok).toBe(false);
    expect(getValidator('confusion')({ ...conf(), check: { question: 'q' } }).ok).toBe(false);
    expect(getValidator('confusion')('x').ok).toBe(false);
  });
});
describe('shortcut validator', () => {
  it('accepts and is idempotent', () => { const a = getValidator('shortcut')(sc()); expect(a.ok).toBe(true); if (a.ok) expect(getValidator('shortcut')(a.data).ok).toBe(true); });
  it('drops a method with no worked answer and rejects when none remain', () => {
    const bad: any = sc(); bad.methods[0].example.answer = '';
    expect(getValidator('shortcut')(bad).ok).toBe(false);
    const two: any = sc(); two.methods.push({ ...sc().methods[0], name: 'No example', example: { problem: 'p', working: [], answer: '' } });
    const r = getValidator('shortcut')(two); expect(r.ok && (r.data as any).methods).toHaveLength(1);
  });
  it('caps at 3 methods', () => { const m: any = sc(); m.methods = Array.from({ length: 6 }, (_, i) => ({ ...sc().methods[0], name: `M${i}` })); const r = getValidator('shortcut')(m); expect(r.ok && (r.data as any).methods).toHaveLength(3); });
});
describe('prompts', () => {
  it('a retry asks for a different angle', () => {
    expect(buildConfusionPrompt({ topic: 'Osmosis', stuck: '', attempt: 1, context: '' })).not.toMatch(/DIFFERENT/);
    expect(buildConfusionPrompt({ topic: 'Osmosis', stuck: 'why', attempt: 3, context: '' })).toMatch(/explanation number 3[\s\S]*DIFFERENT/);
  });
  it('carries the material and asks for checked examples', () => {
    expect(buildConfusionPrompt({ topic: 't', stuck: '', context: 'MATERIAL' })).toContain('MATERIAL');
    expect(buildShortcutPrompt({ topic: 'Surds', context: '' })).toMatch(/does NOT apply[\s\S]*checked/);
  });
  it('text export includes the answer', () => { expect(confusionToText(conf() as any)).toMatch(/Answer: Toward more solute/); expect(shortcutToText(sc() as any)).toMatch(/Answer: x=3, y=2/); });
});
describe('views', () => {
  it('render and escape', () => {
    const c: any = conf(); c.analogy = '<img src=x onerror=1>';
    const h = renderToStaticMarkup(React.createElement(ConfusionCard, { c })); expect(h).toContain('Show answer'); expect(h).not.toMatch(/<img/i); expect(h).not.toContain('Toward more solute');
    const s = renderToStaticMarkup(React.createElement(ShortcutCards, { s: sc() as any })); expect(s).toContain('Elimination'); expect(s).toContain('x=3, y=2');
  });
});
