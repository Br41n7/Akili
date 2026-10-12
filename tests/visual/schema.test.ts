import { describe, expect, it } from 'vitest';
import { parseVisualSpec, safeVisualSpec, validateVisualDecision, VISUAL_TYPES } from '@/lib/visual/schema';
import { getValidator } from '@/lib/ai-schemas';
import * as F from './fixtures';

const decide = (raw: any) => validateVisualDecision(raw);
const bad = (raw: any) => { const r = parseVisualSpec(raw, { forceProvenance: 'ai_generated' }); expect(r.ok).toBe(false); return r.ok ? '' : r.error; };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('valid lessons produce valid specs', () => {
  it.each([
    ['1. protein structure', F.proteinStructure, 'hierarchy'],
    ['2. peptide bond', F.peptideBond, 'molecular_structure'],
    ['3. protein synthesis', F.proteinSynthesis, 'process'],
    ['4. glycolysis', F.glycolysis, 'process'],
    ['5. brachial plexus', F.brachialPlexus, 'anatomy'],
    ['6. biceps brachii', F.bicepsBrachii, 'anatomy'],
    ['7. skin layers', F.skinLayers, 'anatomy_layers'],
    ['7b. skin to bone (deep fascia before muscle)', F.bodyWallLayers, 'anatomy_layers'],
    ['8. knee joint', F.kneeJoint, 'anatomy'],
    ['comparison', F.cellCycleCompare, 'comparison'],
    ['mechanism', F.enzymeMechanism, 'mechanism'],
    ['cycle', F.cycleExample, 'cycle'],
  ])('%s', (_name, raw, type) => {
    const d = decide(raw);
    expect(d.ok).toBe(true);
    if (d.ok && d.data.needs_visual) {
      expect(d.data.spec.visual_type).toBe(type);
      expect(d.data.spec.provenance).toBe('ai_generated');
    }
  });

  it('covers every visual type in the vocabulary with a renderer (see render.test.tsx)', () => {
    expect(VISUAL_TYPES).toContain('graph');
    expect(VISUAL_TYPES).toHaveLength(12);
  });
});

describe('9. non-visual lesson', () => {
  it('accepts needs_visual:false and carries no spec', () => {
    const d = decide({ needs_visual: false, visual_reason: 'A historical fact has no spatial structure.' });
    expect(d).toEqual({ ok: true, data: { needs_visual: false, visual_reason: 'A historical fact has no spatial structure.' } });
  });
  it('accepts the string "false" and a bare {needs_visual:false}', () => {
    expect(decide({ needs_visual: 'false' }).ok).toBe(true);
    expect(decide({ needs_visual: false }).ok).toBe(true);
  });
});

describe('10. invalid AI VisualSpec is rejected, never rendered', () => {
  it('rejects non-objects and missing required fields', () => {
    expect(decide('hello').ok).toBe(false);
    expect(decide(null).ok).toBe(false);
    expect(decide({ needs_visual: true }).ok).toBe(false);
  });
  it('rejects unknown visual types', () => {
    bad({ ...clone(F.proteinStructure), visual_type: 'hologram' });
  });
  it('rejects markup, scripts and URLs anywhere in the spec', () => {
    for (const payload of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'javascript:alert(1)', 'https://evil.example/x.png', '<iframe src="x"></iframe>', 'click onclick=steal()']) {
      const s = clone(F.proteinStructure); s.elements[0].description = payload;
      expect(bad(s)).toMatch(/markup|script|URL/i);
      const t = clone(F.proteinStructure); t.title = payload;
      bad(t);
      const u = clone(F.skinLayers); u.elements[1].attributes = [{ name: 'x', value: payload }];
      bad(u);
    }
  });
  it('rejects a spec whose only relationships point at missing elements (dangling edges are dropped, then anatomy has none)', () => {
    const s = clone(F.brachialPlexus); s.relationships = [{ from: 'roots', relation: 'proximal_to', to: 'ghost' }];
    expect(bad(s)).toMatch(/at least one relationship/);
  });
  it('rejects too-few elements, duplicate ids and over-long lists', () => {
    const one = clone(F.skinLayers); one.elements = one.elements.slice(0, 1); bad(one);
    const dup = clone(F.skinLayers); dup.elements[1].id = dup.elements[0].id; bad(dup);
    const many = clone(F.skinLayers); many.elements = Array.from({ length: 40 }, (_, i) => ({ id: `e${i}`, label: `E${i}`, description: 'x' })); bad(many);
  });
  it('rejects a chemically impossible molecule (carbon with 5 bonds)', () => {
    const m = clone(F.peptideBond);
    m.relationships.push({ from: 'c', relation: 'bonded_to', to: 'h', bond_order: 1 });
    m.relationships.push({ from: 'c', relation: 'bonded_to', to: 'r1', bond_order: 1 });
    expect(bad(m)).toMatch(/valence/);
  });
  it('requires bonds for molecules, steps for mechanisms and attributes for comparisons', () => {
    const a = clone(F.peptideBond); a.relationships = []; bad(a);
    const b = clone(F.enzymeMechanism); b.steps = []; bad(b);
    const c = clone(F.cellCycleCompare); c.elements.forEach((e: any) => delete e.attributes); bad(c);
  });
  it('rejects a spatial relationship that contradicts the diagram axes', () => {
    const s = clone(F.brachialPlexus); // top = proximal, so roots (y0) cannot be DISTAL to trunks (y2)
    s.relationships.push({ from: 'roots', relation: 'distal_to', to: 'trunks' });
    expect(bad(s)).toMatch(/contradict/);
    const k = clone(F.kneeJoint); // left = lateral; lateral meniscus is at x2 so it cannot be MEDIAL to the medial meniscus (x6)
    k.relationships.push({ from: 'lmen', relation: 'medial_to', to: 'mmen' });
    expect(bad(k)).toMatch(/contradict/);
  });
  it('repairs harmless issues instead of failing: aliases, odd ids and unknown relations', () => {
    const s = clone(F.brachialPlexus);
    s.relationships[4].relation = 'located_proximal_to';
    s.relationships.push({ from: 'roots', relation: 'dances_with', to: 'trunks' });
    s.elements[0].id = 'Roots!'; s.sequence = []; s.relationships.forEach((r: any) => { if (r.from === 'roots') r.from = 'Roots!'; if (r.to === 'roots') r.to = 'Roots!'; });
    expect(decide(s).ok).toBe(true);
  });
  it('defaults missing interaction metadata to safe capabilities and validates alternate views', () => {
    const base = clone(F.kneeJoint);
    delete base.interactions;
    const d = parseVisualSpec({ ...base, view_variants: [{ view: 'posterior', axes: { top: 'superior', bottom: 'inferior', left: 'medial', right: 'lateral' }, positions: base.elements.map((e: any) => ({ id: e.id, pos: e.pos ?? { x: 4, y: 4 } })) }] });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.data.interactions).toContain('select');
      expect(d.data.interactions).toContain('toggle_labels');
      expect(d.data.view_variants[0].view).toBe('posterior');
    }
  });
  it('rejects an alternate view with an unknown element or contradictory geometry', () => {
    const base = clone(F.kneeJoint);
    const badUnknown = { ...base, view_variants: [{ view: 'posterior', axes: { left: 'lateral', right: 'medial' }, positions: [{ id: 'ghost', pos: { x: 1, y: 1 } }] }] };
    expect(bad(badUnknown)).toMatch(/unknown element/);
    const badGeometry = { ...base, view_variants: [{ view: 'posterior', axes: { left: 'lateral', right: 'medial' }, positions: [{ id: 'lmen', pos: { x: 7, y: 5 } }, { id: 'mmen', pos: { x: 2, y: 5 } }] }] };
    expect(bad(badGeometry)).toMatch(/contradicts/);
  });

  it('re-validation guard returns null for garbage (what the renderer relies on)', () => {
    expect(safeVisualSpec(undefined)).toBeNull();
    expect(safeVisualSpec({ visual_type: 'process' })).toBeNull();
    expect(safeVisualSpec('<script>')).toBeNull();
  });
  it('ignores a model-supplied provenance of "curated"', () => {
    const s = clone(F.proteinStructure); s.provenance = 'curated';
    const d = decide(s); expect(d.ok && d.data.needs_visual && d.data.spec.provenance).toBe('ai_generated');
  });
});

describe('server validator is registered with the existing AI pipeline', () => {
  it('visual_spec validates through getValidator like every other task', () => {
    expect(getValidator('visual_spec')(F.glycolysis).ok).toBe(true);
    expect(getValidator('visual_spec')({ needs_visual: true, visual_type: 'process' }).ok).toBe(false);
  });
  it('visual_explain requires a summary', () => {
    expect(getValidator('visual_explain')({ summary: 'This shows a short sequence of steps.', parts: [{ id: 'a', text: 'x' }] }).ok).toBe(true);
    expect(getValidator('visual_explain')({ parts: [] }).ok).toBe(false);
  });
});
