import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import VisualRenderer from '@/components/visual/VisualRenderer';
import { atomLabel, computeFormula, hill, implicitHydrogens, parseFormula, prettyFormula } from '@/lib/visual/chem';
import { dashStrokes, moleculeLayout, shortenSegment, wedgePoints, VIEW_W } from '@/lib/visual/layout';
import { buildVisualQuestions } from '@/lib/visual/quiz';
import { CURATED, curatedSpec } from '@/lib/visual/curated';
import { parseVisualSpec, safeVisualSpec } from '@/lib/visual/schema';
import * as F from './fixtures';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const html = (raw: unknown) => renderToStaticMarkup(<VisualRenderer visualSpec={raw} />);
const bad = (raw: any) => { const r = parseVisualSpec(raw, { forceProvenance: 'ai_generated' }); expect(r.ok).toBe(false); return r.ok ? '' : r.error; };
const MOLS = { betaGlucose: F.betaGlucose, lAlanine: F.lAlanine, palmiticAcid: F.palmiticAcid, adenosineMonophosphate: F.adenosineMonophosphate } as Record<string, any>;
const at = (spec: any, id: string) => spec.elements.find((e: any) => e.id === id).at;

describe('formula is derived from the bonds, never trusted', () => {
  it.each([['betaGlucose', 'C6H12O6'], ['lAlanine', 'C3H7NO2'], ['palmiticAcid', 'C16H32O2'], ['adenosineMonophosphate', 'C10H14N5O7P']])('%s derives %s', (name, formula) => {
    const spec = safeVisualSpec(MOLS[name])!;
    expect(spec.formula).toBe(formula);
    expect(computeFormula(spec)!.formula).toBe(formula);
  });
  it('hydrogens are filled by valence: ring N has none, NH2 has two, ring O none, OH one', () => {
    const h = implicitHydrogens(safeVisualSpec(F.adenosineMonophosphate)!)!;
    expect([h.get('n1'), h.get('n6'), h.get('n9'), h.get('o4p'), h.get('o2p'), h.get('c2'), h.get('c8'), h.get('p')]).toEqual([0, 2, 0, 0, 1, 1, 1, 0]);
  });
  it('Hill order and parsing', () => {
    expect(hill({ C: 2, H: 6, O: 1 })).toBe('C2H6O');
    expect(hill({ H: 2, O: 1 })).toBe('H2O');
    expect(hill({ O: 7, P: 1, N: 5, C: 10, H: 14 })).toBe('C10H14N5O7P');
    expect(parseFormula('C6H12O6')).toEqual({ C: 6, H: 12, O: 6 });
    expect(parseFormula('c6')).toBeNull(); expect(parseFormula('')).toBeNull(); expect(parseFormula('C6H12O6x')).toBeNull();
    expect(prettyFormula('C6H12O6')).toBe('C₆H₁₂O₆');
  });
  it('labels heteroatoms with their hydrogens', () => {
    expect(atomLabel('O', 1)).toBe('OH'); expect(atomLabel('N', 2)).toBe('NH₂'); expect(atomLabel('N', 3, 1)).toBe('NH₃⁺');
    expect(atomLabel('O', 0)).toBe('O'); expect(atomLabel('O', 0, -1)).toBe('O⁻'); expect(atomLabel('P', 0)).toBe('P');
  });
  it('rejects a wrong formula, a missing atom, impossible bonding and a formula where atoms are not explicit', () => {
    const wrong = clone(F.betaGlucose); wrong.formula = 'C6H12O5'; expect(bad(wrong)).toMatch(/does not match the structure drawn \(C6H12O6\)/);
    const missing = clone(F.betaGlucose); missing.elements = missing.elements.filter((e: any) => e.id !== 'o6'); missing.relationships = missing.relationships.filter((r: any) => r.to !== 'o6' && r.from !== 'o6'); bad(missing);
    const over = clone(F.betaGlucose); over.relationships.push({ from: 'c1', relation: 'bonded_to', to: 'c3' }); bad(over);
    const group = clone(F.peptideBond); group.formula = 'C4H8N2O2'; expect(bad(group)).toMatch(/every atom is explicit/);
    const notMol = clone(F.skinLayers); notMol.formula = 'H2O'; bad(notMol);
    const garbage = clone(F.betaGlucose); garbage.formula = 'six carbons'; bad(garbage);
  });
  it('accepts a subscript formula by normalising it', () => {
    const s = clone(F.betaGlucose); s.formula = 'C₆H₁₂O₆'; expect(parseVisualSpec(s).ok).toBe(true);
  });
  it('skeletal needs coordinates for every atom; bond_style only on bonds', () => {
    const s = clone(F.betaGlucose); delete s.elements[0].at; expect(bad(s)).toMatch(/needs an "at" coordinate/);
    const t = clone(F.skinLayers); t.display = 'skeletal'; bad(t);
    const u = clone(F.bicepsBrachii); u.relationships[0].bond_style = 'wedge'; // dropped in normalisation (not a bond)
    expect(safeVisualSpec(u)!.relationships[0].bond_style).toBeUndefined();
  });
});

describe('stereochemistry in the data matches the textbook', () => {
  it('β-D-glucopyranose Haworth: C1 OH up, C2 down, C3 up, C4 down, C5 CH2OH up (up = smaller y)', () => {
    const g = F.betaGlucose; const y = (id: string) => at(g, id).y;
    expect(y('o1')).toBeLessThan(y('c1')); expect(y('o2')).toBeGreaterThan(y('c2')); expect(y('o3')).toBeLessThan(y('c3'));
    expect(y('o4')).toBeGreaterThan(y('c4')); expect(y('c6')).toBeLessThan(y('c5'));
    // beta: the anomeric OH is on the same face as C6 (both up)
    expect(Math.sign(y('o1') - y('c1'))).toBe(Math.sign(y('c6') - y('c5')));
    expect(F.betaGlucose.relationships.find((r: any) => r.from === 'c3' && r.to === 'c2').bond_style).toBe('bold');
  });
  it('the ring is closed by exactly six bonds among C1-C5 and O5', () => {
    const ring = ['c1', 'c2', 'c3', 'c4', 'c5', 'o5'];
    const bonds = F.betaGlucose.relationships.filter((r: any) => ring.includes(r.from) && ring.includes(r.to));
    expect(bonds).toHaveLength(6);
  });
  it('L-alanine is (S): N → COOH → CH3 runs counter-clockwise with the H implied behind the page', () => {
    const a = F.lAlanine; const P = (id: string) => at(a, id);
    const [n, c, m] = [P('n'), P('cc'), P('cb')];
    const cross = (c.x - n.x) * (m.y - c.y) - (c.y - n.y) * (m.x - c.x); // y grows downward, so negative = counter-clockwise on screen
    expect(cross).toBeLessThan(0);
    expect(a.relationships.find((r: any) => r.to === 'cb').bond_style).toBe('wedge');
  });
  it('AMP: adenine ring bonds all have similar length (a sane drawing)', () => {
    const spec = F.adenosineMonophosphate; const ring = ['c5', 'c6', 'n1', 'c2', 'n3', 'c4', 'n7', 'c8', 'n9'];
    const lens = spec.relationships.filter((r: any) => ring.includes(r.from) && ring.includes(r.to)).map((r: any) => Math.hypot(at(spec, r.from).x - at(spec, r.to).x, at(spec, r.from).y - at(spec, r.to).y));
    const mean = lens.reduce((a: number, b: number) => a + b) / lens.length;
    for (const l of lens) expect(Math.abs(l - mean) / mean).toBeLessThan(0.12);
  });
});

describe('skeletal layout and bond geometry', () => {
  it.each(Object.keys(MOLS))('%s fits the phone width with no two atoms on top of each other', name => {
    const spec = safeVisualSpec(MOLS[name])!; const { points, height } = moleculeLayout(spec);
    expect(height).toBeGreaterThan(0);
    for (const p of points) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(VIEW_W); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(height); }
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y), `${name}: ${points[i].id}/${points[j].id}`).toBeGreaterThan(14);
  });
  it('shortenSegment leaves room for labels and never inverts a short bond', () => {
    const s = shortenSegment({ x: 0, y: 0 }, { x: 40, y: 0 }, 11, 11);
    expect(s.a.x).toBeCloseTo(11); expect(s.b.x).toBeCloseTo(29);
    const tiny = shortenSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 11, 11); expect(tiny.b.x).toBeGreaterThan(tiny.a.x);
  });
  it('wedge is a triangle narrow at the start; dashes widen toward the end', () => {
    const pts = wedgePoints({ x: 0, y: 0 }, { x: 40, y: 0 }, 8).split(' '); expect(pts).toHaveLength(3); expect(pts[0]).toBe('0,0');
    const d = dashStrokes({ x: 0, y: 0 }, { x: 40, y: 0 }); const widths = d.map(l => Math.abs(l.y2 - l.y1));
    expect(widths).toHaveLength(6); for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1]);
  });
});

describe('skeletal rendering', () => {
  it('draws labelled heteroatoms with hydrogens, the formula, a wedge, and a heavy front edge', () => {
    const glu = html(F.betaGlucose);
    expect(glu).toContain('C₆H₁₂O₆'); expect(glu).toContain('>OH<'); expect(glu).toContain('>O<');
    expect(glu).toMatch(/stroke-width="5.5"/);
    expect((glu.match(/>OH</g) || []).length).toBe(5);
    const ala = html(F.lAlanine);
    expect(ala).toContain('<polygon'); expect(ala).toContain('NH₂'); expect(ala).toContain('C₃H₇NO₂');
    expect(ala).toContain('Neutral form shown');
    const amp = html(F.adenosineMonophosphate);
    expect(amp).toContain('NH₂'); expect(amp).toContain('>P<'); expect((amp.match(/>OH</g) || []).length).toBe(4);
  });
  it('a hashed bond draws six short strokes', () => {
    const s = clone(F.lAlanine); s.relationships.find((r: any) => r.to === 'cb').bond_style = 'dash';
    const out = html(s); expect(out).not.toContain('<polygon');
    expect((out.match(/<g stroke="[^"]+" stroke-width="1.8"/g) || []).length).toBe(1);
  });
  it('carbons are small dots, with numbers only while labels are shown', () => {
    const out = html(F.betaGlucose);
    expect((out.match(/<circle[^>]*r="2.6"/g) || []).length).toBe(6);
    expect(out).toContain('Hide labels to test yourself');
  });
});

describe('molecule questions are computed from the verified structure', () => {
  it.each([['betaGlucose', 'C₆H₁₂O₆'], ['lAlanine', 'C₃H₇NO₂'], ['palmiticAcid', 'C₁₆H₃₂O₂'], ['adenosineMonophosphate', 'C₁₀H₁₄N₅O₇P']])('%s formula question', (name, pretty) => {
    const spec = safeVisualSpec(MOLS[name])!;
    const q = buildVisualQuestions(spec, { max: 60, seed: 'f' }).find(q => q.kind === 'formula')!;
    expect(q).toBeTruthy();
    const opts = q.options.map(o => o.slice(3));
    expect(opts[q.options.findIndex(o => o.startsWith(`${q.correct_answer})`))]).toBe(pretty);
    expect(new Set(opts).size).toBe(opts.length);
    for (const o of opts) expect(parseFormula(o.replace(/[₀-₉]/g, d => String(d.charCodeAt(0) - 0x2080)))).not.toBeNull();
  });
  it('atom counts are right', () => {
    const want: Record<string, Record<string, string>> = { betaGlucose: { carbon: '6', oxygen: '6' }, palmiticAcid: { carbon: '16', oxygen: '2' }, adenosineMonophosphate: { nitrogen: '5', carbon: '10', oxygen: '7' }, lAlanine: { carbon: '3', nitrogen: '1', oxygen: '2' } };
    for (const [name, byEl] of Object.entries(want)) {
      const spec = safeVisualSpec(MOLS[name])!;
      const qs = [...Array(6)].flatMap((_, i) => buildVisualQuestions(spec, { max: 60, seed: String(i) }).filter(q => q.kind === 'count'));
      expect(qs.length, name).toBeGreaterThan(0);
      for (const q of qs) {
        const el = q.question.match(/How many (\w+) atoms/)![1];
        expect(q.options.find(o => o.startsWith(`${q.correct_answer})`))!.slice(3), `${name} ${el}`).toBe(byEl[el]);
      }
    }
  });
  it('no formula questions for molecules with functional-group nodes', () => {
    expect(buildVisualQuestions(safeVisualSpec(F.peptideBond)!, { max: 60, seed: 'p' }).some(q => q.kind === 'formula' || q.kind === 'count')).toBe(false);
  });
});

describe('gait cycle and action potential', () => {
  const gait = safeVisualSpec(F.gaitCycle)!;
  it('phases are contiguous from 0% to 100% with the stance/swing boundary at 60%', () => {
    const ranges = gait.sequence.map(id => gait.elements.find(e => e.id === id)!.when!.replace('%', '').split('-').map(Number));
    expect(ranges[0]).toEqual([0]);                       // initial contact is the instant at 0%
    for (let i = 2; i < ranges.length; i++) expect(ranges[i][0]).toBe(ranges[i - 1][1]);
    expect(ranges[1][0]).toBe(0); expect(ranges[ranges.length - 1][1]).toBe(100);
    expect(ranges[4][1]).toBe(60);                        // pre-swing ends where swing begins
    expect(gait.sequence).toEqual(['ic', 'lr', 'ms', 'ts', 'ps', 'is', 'mw', 'tw']);
    expect(html(F.gaitCycle)).toContain('0-10%');
  });
  it('the action potential curve has the right shape', () => {
    const pts = safeVisualSpec(F.actionPotential)!.graph!.points.map(p => p.y);
    const [rest, thr, peak, under, rest2] = pts;
    expect(thr).toBeGreaterThan(rest); expect(peak).toBeGreaterThan(thr); expect(peak).toBeGreaterThan(0);
    expect(under).toBeLessThan(rest); expect(rest2).toBe(rest);
    const out = html(F.actionPotential); expect(out).toContain('<polyline'); expect(out).toContain('Schematic values');
  });
  it('graphs expose their stages as tap targets', () => {
    expect(html(F.actionPotential)).toContain('aria-label="Stages"');
  });
});

describe('curated library now includes the Phase 3 entries', () => {
  it('has 19 entries, all valid, none reviewed, aliases still unique', () => {
    expect(CURATED).toHaveLength(19);
    for (const e of CURATED) { expect(curatedSpec(e), e.id).not.toBeNull(); expect(e.reviewed).toBe(false); }
    expect(new Set(CURATED.flatMap(e => e.aliases)).size).toBe(CURATED.flatMap(e => e.aliases).length);
  });
});
