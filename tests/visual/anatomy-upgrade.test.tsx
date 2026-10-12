import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import VisualRenderer from '@/components/visual/VisualRenderer';
import { depthRanks } from '@/lib/visual/depth';
import { elementFacts, buildExplanation } from '@/lib/visual/explain';
import { calloutLayout, edgePoint, polar, ringBands, wedgePath } from '@/lib/visual/layout';
import { parseVisualSpec, safeVisualSpec } from '@/lib/visual/schema';
import { summarizeDiagramEvidence } from '@/lib/visual/adaptive';
import * as F from './fixtures';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const html = (raw: unknown) => renderToStaticMarkup(<VisualRenderer visualSpec={raw} />);
const bad = (raw: any) => { const r = parseVisualSpec(raw, { forceProvenance: 'ai_generated' }); expect(r.ok).toBe(false); return r.ok ? '' : r.error; };

describe('origin / insertion roles', () => {
  it('are kept when given and inferred from a plain "origin"/"insertion" label', () => {
    const s = clone(F.bicepsBrachii);
    s.relationships.forEach((r: any) => { if (r.role) { r.label = r.role; delete r.role; } });
    const spec = safeVisualSpec(s)!;
    expect(spec.relationships.filter(r => r.role).map(r => r.role).sort()).toEqual(['insertion', 'origin']);
  });
  it('are rejected on any relation other than attaches_to', () => {
    const s = clone(F.bicepsBrachii); s.relationships.find((r: any) => r.relation === 'innervated_by').role = 'origin';
    expect(safeVisualSpec(s)!.relationships.find(r => r.relation === 'innervated_by')!.role).toBeUndefined(); // dropped in normalisation, never rendered
  });
});

describe('muscle facts: origin, insertion, action, innervation, blood supply', () => {
  const spec = safeVisualSpec(F.bicepsBrachii)!;
  it('each kind of fact is separated for styling', () => {
    const f = elementFacts(spec, 'biceps');
    expect(f.facts.map(x => x.kind)).toEqual(['origin', 'insertion', 'action', 'nerve', 'artery']);
    expect(f.facts.find(x => x.kind === 'nerve')!.value).toMatch(/Musculocutaneous/);
  });
  it('relationship roles become facts when no attribute says it', () => {
    const s = clone(F.bicepsBrachii); s.elements.find((e: any) => e.id === 'biceps').attributes = [{ name: 'Action', value: 'Flexes the elbow' }];
    const f = elementFacts(safeVisualSpec(s)!, 'biceps');
    expect(f.facts).toContainEqual({ name: 'Origin', value: 'Scapula', kind: 'origin' });
    expect(f.facts).toContainEqual({ name: 'Insertion', value: 'Radius', kind: 'insertion' });
  });
  it('renders connectors with letter badges and a key', () => {
    const out = html(F.bicepsBrachii);
    for (const t of ['Origin', 'Insertion', 'Nerve supply', 'Blood supply']) expect(out).toContain(t);
    for (const b of ['>O<', '>I<', '>N<', '>A<']) expect(out).toContain(b);
    expect(out).toContain('marker-end');                      // nerves/arteries are arrows
  });
});

describe('depth (superficial/deep, anterior/posterior)', () => {
  it('anterior view: the anterior structure is nearer', () => {
    const d = depthRanks(safeVisualSpec(F.bicepsBrachii)!);
    expect(d.ranks.get('biceps')).toBe(0); expect(d.ranks.get('humerus')).toBe(1); expect(d.max).toBe(1); expect(d.cyclic).toBe(false);
  });
  it('posterior view reverses it, and a lateral view ignores anterior/posterior', () => {
    const s = clone(F.bicepsBrachii); s.view = 'posterior';
    expect(depthRanks(safeVisualSpec(s)!).ranks.get('humerus')).toBe(0);
    s.view = 'lateral'; expect(depthRanks(safeVisualSpec(s)!).ranks.size).toBe(0);
  });
  it('superficial_to chains rank 0..n', () => {
    const d = depthRanks(safeVisualSpec(F.bodyWallLayers)!);
    expect([...'skin,sfascia,dfascia,muscle,bone'.split(',')].map(id => d.ranks.get(id))).toEqual([0, 1, 2, 3, 4]);
  });
  it('a loop is rejected', () => {
    const s = clone(F.bodyWallLayers); s.relationships.push({ from: 'bone', relation: 'superficial_to', to: 'skin' });
    expect(bad(s)).toMatch(/loop/);
  });
  it('shows a depth control and shadows only when depth relations exist', () => {
    expect(html(F.bicepsBrachii)).toContain('Depth: show structures down to');
    expect(html(F.brachialPlexus)).not.toContain('Depth: show structures down to');
    expect(html(F.bicepsBrachii)).toMatch(/Nearer[\s\S]*Deeper/);
  });
});

describe('cross-sections', () => {
  const spec = safeVisualSpec(F.midArmSection)!;
  it('accepts layers plus wedges', () => { expect(spec.elements.filter(e => e.section)).toHaveLength(2); });
  it('rejects bad placement', () => {
    const unknown = clone(F.midArmSection); unknown.elements[5].section.ring = 'nowhere'; expect(bad(unknown)).toMatch(/not a layer/);
    const overlap = clone(F.midArmSection); overlap.elements[6].section = { ring: 'muscle', angle: 40, span: 100 }; expect(bad(overlap)).toMatch(/overlap/);
    const wrap = clone(F.midArmSection); wrap.elements[5].section = { ring: 'muscle', angle: 350, span: 60 }; wrap.elements[6].section = { ring: 'muscle', angle: 20, span: 60 }; expect(bad(wrap)).toMatch(/overlap/); // overlap across 0°
    const few = clone(F.midArmSection); few.elements = few.elements.filter((e: any) => e.id === 'skin' || e.section).map((e: any) => (e.section ? { ...e, section: { ...e.section, ring: 'skin' } } : e)); few.sequence = [];
    expect(bad(few)).toMatch(/at least 2 layers/);
    expect(parseVisualSpec({ ...clone(F.midArmSection), sequence: ['skin'] }).ok).toBe(true); // a short sequence is repaired from the non-wedge elements
    const both = clone(F.midArmSection); both.elements[5].section.ring = 'biceps'; bad(both);
  });
  it('same wedge placement is only valid for cross_section', () => {
    const s = clone(F.skinLayers); s.elements[0].section = { ring: 'dermis', angle: 0, span: 30 }; expect(bad(s)).toMatch(/only valid for cross_section/);
  });
  it('wedges that merely touch are fine', () => {
    const s = clone(F.midArmSection); s.elements[5].section = { ring: 'muscle', angle: 0, span: 90 }; s.elements[6].section = { ring: 'muscle', angle: 90, span: 90 };
    expect(parseVisualSpec(s).ok).toBe(true);
  });
  it('renders rings, wedges, a tappable list and the axis meaning', () => {
    const out = html(F.midArmSection);
    expect((out.match(/<circle[^>]*r="/g) || []).length).toBeGreaterThanOrEqual(5);
    expect((out.match(/<path d="M[\d.]+ [\d.]+ A\d+ \d+ 0 [01] 1/g) || []).length).toBe(2); // the two wedges (icons also use <path>)
    expect(out).toContain('Layers and structures'); expect(out).toContain('Biceps brachii'); expect(out).toContain('in Muscle layer');
    expect(out).toContain('↑ Anterior'); expect(out).toContain('↓ Posterior');
  });
  it('explanation names the layers outside-in and the wedges', () => {
    const s = buildExplanation(spec).summary;
    expect(s).toMatch(/Skin, Subcutaneous tissue, Deep fascia, Muscle layer and Humerus/);
    expect(s).toMatch(/Biceps brachii \(in Muscle layer\)/);
  });
});

describe('geometry', () => {
  it('edgePoint lands on the box border toward the target', () => {
    const b = { x: 100, y: 100, w: 100, h: 50 };
    expect(edgePoint(b, 400, 125)).toEqual({ x: 200, y: 125 });
    expect(edgePoint(b, 150, 0)).toEqual({ x: 150, y: 100 });
    const d = edgePoint(b, 300, 225); expect(d.x).toBeLessThanOrEqual(200); expect(d.y).toBeLessThanOrEqual(150);
  });
  it('polar: 0° is up, 90° is right, 180° is down', () => {
    expect(polar(100, 100, 50, 0)).toMatchObject({ x: 100, y: 50 });
    const r = polar(100, 100, 50, 90); expect(r.x).toBeCloseTo(150); expect(r.y).toBeCloseTo(100);
    expect(polar(100, 100, 50, 180).y).toBeCloseTo(150);
  });
  it('ringBands nest outer to inner and end in a solid core', () => {
    const b = ringBands(['a', 'b', 'c', 'd'], 80);
    expect(b[0].outer).toBe(80); expect(b[3].inner).toBe(0);
    for (let i = 1; i < b.length; i++) expect(b[i].outer).toBeCloseTo(b[i - 1].inner);
  });
  it('wedgePath is a closed annular wedge, and a core wedge goes to the centre', () => {
    expect(wedgePath(180, 150, 40, 60, 0, 90)).toMatch(/^M[\d. ]+A60 60 0 0 1 [\d. ]+L[\d. ]+A40 40 0 0 0 [\d. ]+Z$/);
    expect(wedgePath(180, 150, 0, 20, 0, 90)).toMatch(/^M180 150 L/);
    expect(wedgePath(180, 150, 40, 60, 0, 200)).toContain('A60 60 0 1 1');
  });
  it('callouts never overlap and stay inside the drawing', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, anchor: { x: 200 + i, y: 150 + i * 2 } }));
    const out = calloutLayout(items, 180, 310, { gap: 36 });
    const ys = out.filter(c => c.side === 'right').map(c => c.label.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(36 - 0.001);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(20); expect(Math.max(...ys)).toBeLessThanOrEqual(290);
    expect(calloutLayout([{ id: 'l', anchor: { x: 50, y: 100 } }], 180, 310)[0].side).toBe('left');
  });
});

describe('diagram evidence on the learning profile', () => {
  it('summarises, pools direction words, and lists weak concepts', () => {
    const rows = [
      { concept: 'medial relationships: knee joint', correctness: false }, { concept: 'medial relationships: knee joint', correctness: false }, { concept: 'medial relationships: knee joint', correctness: true },
      { concept: 'anatomical direction: medial', correctness: true },
      { concept: 'Glycolysis', correctness: true }, { concept: 'Glycolysis', correctness: true },
      { concept: 'Skin', correctness: null }, { concept: '', correctness: true },
    ];
    const s = summarizeDiagramEvidence(rows as any);
    expect(s.total).toBe(6); expect(s.correct).toBe(4);
    expect(s.direction).toEqual({ total: 4, correct: 2 });
    expect(s.revisit.map(r => r.concept)).toEqual(['medial relationships: knee joint']);
    expect(summarizeDiagramEvidence([]).total).toBe(0);
  });
});

import ConceptVisual from '@/components/visual/ConceptVisual';

describe('"See it as a diagram" outside lessons', () => {
  const props = { projectId: 'p', userId: 'u', region: 'Nigeria', persona: 'friendly' };
  it('shows the action only when the missed question has science/structure content', () => {
    const sci = renderToStaticMarkup(<ConceptVisual {...props} concept="Brachial plexus" text="Which cord gives rise to the median nerve? The lateral and medial cords of the brachial plexus join to form the median nerve." />);
    expect(sci).toContain('See it as a diagram');
    expect(sci).not.toMatch(/<script|https?:\/\/(?!www\.w3\.org)/);
    expect(renderToStaticMarkup(<ConceptVisual {...props} concept="Treaty of Versailles" text={F.NON_VISUAL_LESSON.content} />)).toBe('');
  });
  it('compact mode (Ask AI) is a link-sized button with a 44px target', () => {
    expect(renderToStaticMarkup(<ConceptVisual {...props} compact concept="Glycolysis" text="Glycolysis converts glucose to pyruvate, an enzyme-catalysed pathway producing ATP and NADH." />)).toMatch(/min-h-11[^>]*>[\s\S]*See it as a diagram/);
  });
});

describe('touch targets on the upgraded diagrams', () => {
  it.each(['bicepsBrachii', 'midArmSection', 'kneeJoint', 'skinLayers', 'enzymeMechanism'])('%s: every <button> is at least 44px tall', name => {
    const out = html((F.VALID_FIXTURES as any)[name]);
    const buttons = [...out.matchAll(/<button([^>]*)>/g)].map(m => m[1]);
    expect(buttons.length).toBeGreaterThan(3);
    for (const a of buttons) expect(a, a).toMatch(/min-h-(11|12|14|16)|(?:^|\s)h-1[1-6](?:\s|$)|min-height:\s*(4[4-9]|[5-9]\d)px/);
  });
});
