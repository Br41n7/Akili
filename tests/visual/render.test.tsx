import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import VisualRenderer, { SUPPORTED_VISUAL_TYPES } from '@/components/visual/VisualRenderer';
import { VISUAL_TYPES, safeVisualSpec } from '@/lib/visual/schema';
import { anatomyGrid, gridBoxes, moleculeLayout, hierarchyDepths, VIEW_W, wrapLabel } from '@/lib/visual/layout';
import * as F from './fixtures';

const html = (raw: unknown) => renderToStaticMarkup(<VisualRenderer visualSpec={raw} />);
const sample = { ...F.VALID_FIXTURES };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('renderer covers the vocabulary', () => {
  it('every VisualType has a component', () => { expect([...SUPPORTED_VISUAL_TYPES].sort()).toEqual([...VISUAL_TYPES].sort()); });
  it.each(Object.entries(sample))('%s renders its title, labels and the two lesson actions', (_n, raw) => {
    const out = html(raw);
    expect(out).toContain(raw.title);
    expect(out).toContain('Explain diagram');
    expect(out).toContain('Test me');
    expect(out).toContain('AI-made schematic');          // not presented as authoritative
    const first = raw.elements[0].label.replace(/&/g, '&amp;');
    expect(out.includes(first) || out.includes((raw.elements[0].short_label ?? '').replace(/&/g, '&amp;'))).toBe(true);
  });
  it('graph visuals render from their data', () => {
    const out = html({ visual_type: 'graph', subject: 'physiology', topic: 'action potential', title: 'Membrane potential', learning_goal: 'Read the curve', graph: { kind: 'line', x_label: 'Time (ms)', y_label: 'Potential (mV)', points: [{ label: '0', y: -70 }, { label: '1', y: 30 }, { label: '2', y: -80 }] }, elements: [], relationships: [] });
    expect(out).toContain('Time (ms)'); expect(out).toContain('<polyline');
  });
});

describe('invalid specs never break the lesson (render nothing)', () => {
  it.each([[undefined], [null], ['not a spec'], [{}], [{ visual_type: 'process' }], [{ ...F.skinLayers, visual_type: 'hologram' }]])('%j → empty', raw => {
    expect(html(raw)).toBe('');
  });
});

describe('security: model text is data, never markup', () => {
  it('a spec carrying markup is refused before it can render', () => {
    const evil = clone(F.skinLayers); evil.elements[0].label = '<img src=x onerror=alert(1)>';
    expect(html(evil)).toBe('');
    const url = clone(F.skinLayers); url.elements[1].description = 'see https://evil.example/payload';
    expect(html(url)).toBe('');
  });
  it('rendered output contains no script, iframe, handlers or external URLs', () => {
    for (const raw of Object.values(sample)) {
      const out = html(raw).replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ''); // the SVG namespace is not a network request
      expect(out).not.toMatch(/<script|<iframe|<object|<embed|javascript:|\son[a-z]+=|https?:\/\//i);
    }
  });
  it('ordinary text with angle brackets or ampersands is escaped, not interpreted', () => {
    const s = clone(F.skinLayers); s.elements[0].description = 'Thin layer; 5 < 10 & more';
    // '<' followed by a space is not a tag; the cleaner leaves it and React escapes it.
    const out = html(s);
    expect(out).not.toContain('5 < 10');
  });
});

describe('12. mobile rendering', () => {
  it.each(Object.entries(sample))('%s: no fixed pixel widths that force horizontal scroll', (_n, raw) => {
    const out = html(raw);
    expect(out).not.toMatch(/min-w-\[\d+/);
    expect(out).not.toMatch(/style="[^"]*(?<!max-)width:\s*\d{3,}px/);
    for (const m of out.matchAll(/<svg[^>]*viewBox="0 0 (\d+)/g)) expect(Number(m[1])).toBeLessThanOrEqual(360);
    for (const m of out.matchAll(/<svg[^>]*role="(?:group|img)"[^>]*class="([^"]*)"|<svg[^>]*class="([^"]*)"[^>]*role="(?:group|img)"/g)) expect(m[1] ?? m[2]).toContain('w-full');
  });
  it('interactive controls are at least 44px (min-h-11/12 or larger)', () => {
    const out = html(F.skinLayers);
    const buttons = [...out.matchAll(/<button([^>]*)>/g)].map(m => m[1]);
    expect(buttons.length).toBeGreaterThan(3);
    for (const attrs of buttons) expect(attrs, attrs).toMatch(/min-h-(11|12|14|16)|min-height:\s*(4[4-9]|[5-9]\d)px/);
  });
  it('nothing needs hover: no hover-only reveal classes', () => {
    for (const raw of Object.values(sample)) expect(html(raw)).not.toMatch(/group-hover|opacity-0 hover|invisible hover/);
  });
  it('anatomy layout fits the phone width and never overlaps boxes', () => {
    for (const name of ['brachialPlexus', 'bicepsBrachii', 'kneeJoint']) {
      const spec = safeVisualSpec(sample[name])!;
      const { boxes, height } = gridBoxes(anatomyGrid(spec));
      expect(height).toBeGreaterThan(0);
      for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(VIEW_W); expect(b.w).toBeGreaterThanOrEqual(90); }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${name}: ${a.id}/${b.id}`).toBe(false);
      }
    }
  });
  it('anatomy layout preserves vertical order from the spec (never contradicts "superior to")', () => {
    const spec = safeVisualSpec(sample.kneeJoint)!;
    const { boxes } = gridBoxes(anatomyGrid(spec)); const y = new Map(boxes.map(b => [b.id, b.y]));
    expect(y.get('femur')!).toBeLessThan(y.get('patella')!); expect(y.get('patella')!).toBeLessThan(y.get('tibia')!);
    const x = new Map(boxes.map(b => [b.id, b.x]));
    expect(x.get('lmen')!).toBeLessThan(x.get('cruciates')!); expect(x.get('cruciates')!).toBeLessThan(x.get('mmen')!); // lateral on the left, as the axes say
  });
  it('molecule layout stays inside the viewBox, with and without coordinates', () => {
    const withPos = safeVisualSpec(sample.peptideBond)!;
    const a = moleculeLayout(withPos); a.points.forEach(p => { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(VIEW_W); });
    const noPos = clone(F.peptideBond); noPos.elements.forEach((e: any) => delete e.pos);
    const b = moleculeLayout(safeVisualSpec(noPos)!); expect(b.points).toHaveLength(8); b.points.forEach(p => expect(p.x).toBeLessThanOrEqual(VIEW_W));
  });
  it('labels wrap instead of overflowing', () => {
    expect(wrapLabel('Cruciate ligaments (ACL and PCL)', 14, 2).every(l => l.length <= 18)).toBe(true);
    expect(wrapLabel('Short', 14)).toEqual(['Short']);
  });
  it('hierarchy: levels are flat, true trees indent', () => {
    expect(hierarchyDepths(safeVisualSpec(sample.proteinStructure)!).isTree).toBe(false);
    const tree = hierarchyDepths(safeVisualSpec(sample.brachialPlexus)!);
    expect(tree.isTree).toBe(true); expect(tree.depth.get('branches')).toBe(4);
  });
});
