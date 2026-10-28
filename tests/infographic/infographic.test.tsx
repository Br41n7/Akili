import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import path from 'path';
import { getValidator } from '@/lib/ai-schemas';
import { getTask } from '@/lib/ai-tasks';
import { buildInfographicPrompt, infographicText, infographicToMarkdown, SECTION_COLORS, sectionColor, splitSections, type Infographic } from '@/lib/infographic';
import { Poster } from '@/components/InfographicView';
import { matchCurated } from '@/lib/visual/curated';

const sec = (n: number, bullets = 3) => Array.from({ length: n }, (_, i) => ({ heading: `Section ${i}`, bullets: Array.from({ length: bullets }, (_, k) => ({ text: `Point ${i}.${k}`, sub: [] as string[] })) }));
const raw = (o: object = {}) => ({ title: 'Knee Joint', subtitle: 'Synovial', sections: sec(5), key_points: ['a', 'b', 'c'], extra: { title: 'Common conditions', items: ['ACL tear', 'OA'] }, ...o });

describe('registry and migration', () => {
  it('validated by name', () => { expect(getTask('infographic').validation).toBe('infographic'); });
  it('the database allows the new kind', () => {
    expect(readFileSync(path.resolve(__dirname, '../../supabase/migrations/0008_infographic_kind.sql'), 'utf8')).toMatch(/'infographic'/);
  });
});

describe('validator', () => {
  it('accepts and is idempotent', () => { const a = getValidator('infographic')(raw()); expect(a.ok).toBe(true); if (a.ok) expect(getValidator('infographic')(a.data).ok).toBe(true); });
  it('needs 3 sections that have bullets; drops empty and duplicate headings', () => {
    expect(getValidator('infographic')(raw({ sections: sec(2) })).ok).toBe(false);
    const s: any = sec(4); s[1].bullets = []; s[2].heading = 'section 0';
    expect(getValidator('infographic')(raw({ sections: s })).ok).toBe(false); // only 2 usable remain
    const r = getValidator('infographic')(raw({ sections: [...sec(4), { heading: 'Section 0', bullets: [{ text: 'dup' }] }] }));
    expect(r.ok && (r.data as any).sections).toHaveLength(4);
  });
  it('caps sections, bullets and key points, and accepts plain-string bullets', () => {
    const r: any = getValidator('infographic')(raw({ sections: sec(12, 12).map(s => ({ ...s, bullets: s.bullets.map(b => b.text) })), key_points: Array.from({ length: 12 }, (_, i) => `k${i}`) }));
    expect(r.ok).toBe(true); expect(r.data.sections).toHaveLength(8); expect(r.data.sections[0].bullets).toHaveLength(7); expect(r.data.key_points).toHaveLength(6);
  });
  it('drops an incomplete extra box instead of failing', () => {
    const r: any = getValidator('infographic')(raw({ extra: { title: 'x', items: [] } })); expect(r.ok).toBe(true); expect(r.data.extra).toBeNull();
    expect((getValidator('infographic')(raw({ extra: null })) as any).data.extra).toBeNull();
  });
  it('rejects garbage', () => { expect(getValidator('infographic')('x').ok).toBe(false); expect(getValidator('infographic')({}).ok).toBe(false); });
});

describe('layout', () => {
  const sizes = (s: ReturnType<typeof sec>, fig: boolean) => { const { left, right } = splitSections(s, fig); return { left, right }; };
  it('keeps reading order and covers every section once', () => {
    for (const n of [3, 5, 8]) for (const fig of [true, false]) {
      const { left, right } = sizes(sec(n), fig);
      expect([...left, ...right]).toEqual(Array.from({ length: n }, (_, i) => i)); expect(left.length).toBeGreaterThan(0);
    }
  });
  it('a figure pushes more sections to the left column', () => {
    expect(splitSections(sec(6), true).left.length).toBeGreaterThanOrEqual(splitSections(sec(6), false).left.length);
  });
  it('colours cycle without running out', () => { expect(sectionColor(0)).toBe(SECTION_COLORS[0]); expect(sectionColor(SECTION_COLORS.length)).toBe(SECTION_COLORS[0]); });
});

describe('poster', () => {
  const g = (o: Partial<Infographic> = {}): Infographic => (getValidator('infographic')(raw()) as any).data && { ...(getValidator('infographic')(raw()) as any).data, ...o };
  it('renders numbered sections, key points and the extra box', () => {
    const h = renderToStaticMarkup(React.createElement(Poster, { g: g() }));
    expect(h).toContain('1. Section 0'); expect(h).toContain('Key Points'); expect(h).toContain('Common conditions'); expect(h).toContain('Made with Akili');
  });
  it('shows a real diagram without its zoom controls', () => {
    const h = renderToStaticMarkup(React.createElement(Poster, { g: g({ figure: matchCurated('Knee joint', ['menisci']) }) }));
    expect(h).toContain('simplified schematic'); expect(h).not.toMatch(/Pinch or use the buttons|Zoom in/);
  });
  it('ignores an invalid figure instead of breaking', () => {
    const h = renderToStaticMarkup(React.createElement(Poster, { g: g({ figure: { visual_type: 'nonsense' } }) }));
    expect(h).toContain('1. Section 0'); expect(h).not.toContain('simplified schematic');
  });
  it('escapes hostile text', () => {
    const bad = g(); (bad.sections[0].bullets[0] as any).text = '<img src=x onerror=1>';
    expect(renderToStaticMarkup(React.createElement(Poster, { g: bad }))).not.toMatch(/<img/i);
  });
});

describe('prompt and export', () => {
  it('prompt asks for short scannable content and no invented numbers', () => {
    const p = buildInfographicPrompt({ topic: 'Shoulder joint', context: 'NOTES' });
    expect(p).toContain('Shoulder joint'); expect(p).toContain('NOTES'); expect(p).toMatch(/at most 12 words/); expect(p).toMatch(/only if you are sure/);
  });
  it('text and markdown exports include every part', () => {
    const d = (getValidator('infographic')(raw()) as any).data as Infographic;
    expect(infographicText(d)).toMatch(/Section 0[\s\S]*Point 0.0/); const md = infographicToMarkdown(d);
    expect(md).toMatch(/## 1\. Section 0/); expect(md).toMatch(/## Key points/); expect(md).toMatch(/## Common conditions/);
  });
});
