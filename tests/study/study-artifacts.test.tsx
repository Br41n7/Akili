import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { getValidator, VALIDATION_TYPES } from '@/lib/ai-schemas';
import { getTask } from '@/lib/ai-tasks';
import { buildSlideDeckPrompt, buildStudyGuidePrompt, clampSlides, deckToMarkdown, fileNameFor, guideToMarkdown } from '@/lib/study-artifacts';
import { DeckView, GuideView } from '@/components/StudyTools';

const guide = () => ({
  title: 'Forces', overview: 'Newton basics',
  sections: [{ heading: 'Newton 2', summary: 'Force changes motion.', key_points: ['F = ma'], definitions: [{ term: 'Force', meaning: 'a push or pull' }],
    formulas: [{ name: 'Second law', latex: 'F = ma', explanation: 'Force equals mass times acceleration', variables: [{ symbol: 'm', meaning: 'mass' }] }], examples: ['Pushing a trolley'], exam_tips: ['Show units'] }],
  quick_revision: ['F = ma'], common_mistakes: ['Mixing mass and weight'],
});
const deck = (n = 4) => ({ title: 'Cells', subtitle: 'Intro', slides: Array.from({ length: n }, (_, i) => ({ title: `Slide ${i}`, bullets: ['a', 'b', 'c'], speaker_notes: 'notes', visual_hint: '' })) });

describe('registry', () => {
  it('study tasks are validated by name', () => {
    expect(getTask('study_guide').validation).toBe('study_guide');
    expect(getTask('slide_deck').validation).toBe('slide_deck');
    expect(VALIDATION_TYPES).toContain('study_guide');
    expect(VALIDATION_TYPES).toContain('slide_deck');
  });
});

describe('study guide validator', () => {
  it('accepts a good guide', () => { expect(getValidator('study_guide')(guide()).ok).toBe(true); });
  it('rejects non-objects and guides with no usable section', () => {
    expect(getValidator('study_guide')('x').ok).toBe(false);
    expect(getValidator('study_guide')({ title: 't', sections: [] }).ok).toBe(false);
    expect(getValidator('study_guide')({ title: 't', sections: [{ heading: '' }] }).ok).toBe(false);
  });
  it('is idempotent (server output passes the client again)', () => {
    const a = getValidator('study_guide')(guide()); expect(a.ok).toBe(true);
    if (a.ok) expect(getValidator('study_guide')(a.data).ok).toBe(true);
  });
});

describe('slide deck validator', () => {
  it('accepts a good deck and caps at 20', () => {
    expect(getValidator('slide_deck')(deck()).ok).toBe(true);
    const r = getValidator('slide_deck')(deck(30));
    expect(r.ok && (r.data as any).slides.length).toBe(20);
  });
  it('rejects fewer than 3 usable slides', () => {
    expect(getValidator('slide_deck')(deck(2)).ok).toBe(false);
    expect(getValidator('slide_deck')({ title: 't', slides: [{ title: 'x', bullets: [] }, { title: 'y' }, 1] }).ok).toBe(false);
  });
  it('is idempotent', () => {
    const a = getValidator('slide_deck')(deck()); expect(a.ok).toBe(true);
    if (a.ok) expect(getValidator('slide_deck')(a.data).ok).toBe(true);
  });
});

describe('prompts and export', () => {
  it('clamps slide counts', () => {
    expect(clampSlides(1)).toBe(3); expect(clampSlides(99)).toBe(20); expect(clampSlides('abc')).toBe(8); expect(clampSlides('12')).toBe(12);
  });
  it('prompts carry the topic, material and count', () => {
    expect(buildSlideDeckPrompt({ topic: 'Cells', context: 'MATERIAL', count: 12 })).toMatch(/Exactly 12 slides[\s\S]*MATERIAL|MATERIAL[\s\S]*Exactly 12/);
    const g = buildStudyGuidePrompt({ topic: 'Forces', context: '' });
    expect(g).toContain('Forces'); expect(g).toMatch(/No material was supplied/);
  });
  it('markdown export includes every part', () => {
    const md = guideToMarkdown(getValidator('study_guide')(guide()) .ok ? guide() as any : null);
    expect(md).toMatch(/# Forces/); expect(md).toMatch(/\$\$F = ma\$\$/); expect(md).toMatch(/Common mistakes/); expect(md).toMatch(/Quick revision/);
    const dm = deckToMarkdown(deck() as any);
    expect(dm).toMatch(/## Slide 1: Slide 0/); expect(dm).toMatch(/> notes/);
  });
  it('file names are safe', () => { expect(fileNameFor('../Forces & Motion!')).toBe('forces-motion.md'); expect(fileNameFor('???')).toBe('akili.md'); });
});

describe('viewers', () => {
  it('render a guide without raw markup injection', () => {
    const g: any = guide(); g.sections[0].key_points = ['<img src=x onerror=alert(1)>'];
    const html = renderToStaticMarkup(React.createElement(GuideView, { g }));
    expect(html).toContain('Newton 2'); expect(html).not.toMatch(/<img/i);
  });
  it('render the first slide of a deck', () => {
    const html = renderToStaticMarkup(React.createElement(DeckView, { d: deck() as any }));
    expect(html).toContain('Slide 1 of 4'); expect(html).toContain('Slide 0');
  });
});
