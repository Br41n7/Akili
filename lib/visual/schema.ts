/**
 * VisualSpec: the structured description of a diagram.
 *
 * The model returns JSON only. Nothing here is ever rendered as HTML, and the
 * renderer decides every pixel, so a spec can describe *what* to draw but
 * cannot carry markup, scripts, URLs or styling.
 *
 * Validation has three layers:
 *   1. Safety scan   – rejects markup/URL/script-looking strings outright.
 *   2. Schema (zod)  – shape, lengths, closed vocabularies, repaired aliases.
 *   3. Consistency   – references resolve, per-type requirements hold, spatial
 *                      relations agree with the diagram axes, molecular
 *                      valences are possible.
 *
 * This module is safe to import on both server and client.
 */
import { z } from 'zod';
import { depthRanks } from './depth';
import { DIRECTION_TERMS, OPPOSITE, RELATIONS, RELATION_KEYS, canonicalRelation, directionOf, type DirectionTerm } from './vocab';

export type Validation<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Vocabularies ────────────────────────────────────────────────────────────

/** Add a type here, then add a renderer in components/visual/VisualRenderer.tsx. */
export const VISUAL_TYPES = [
  'molecular_structure', 'process', 'cycle', 'anatomy', 'anatomy_layers', 'hierarchy',
  'comparison', 'flowchart', 'mechanism', 'cross_section', 'graph', 'timeline',
] as const;
export type VisualType = (typeof VISUAL_TYPES)[number];

export const SUBJECTS = ['anatomy', 'biochemistry', 'physiology', 'prosthetics_orthotics', 'biomechanics', 'other'] as const;
export type VisualSubject = (typeof SUBJECTS)[number];

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export const VIEWS = ['anterior', 'posterior', 'lateral', 'medial', 'superior', 'inferior', 'sagittal', 'coronal', 'transverse', 'schematic'] as const;
export const ELEMENT_KINDS = [
  'structure', 'molecule', 'atom', 'group', 'step', 'stage', 'layer', 'level', 'item',
  'enzyme', 'substance', 'event', 'decision', 'start', 'end',
] as const;
export const INTERACTIONS = ['select', 'step_through', 'toggle_labels', 'reveal_layers'] as const;

export const BOND_KINDS = ['covalent', 'ionic', 'hydrogen', 'peptide'] as const;
export const ATTACHMENT_ROLES = ['origin', 'insertion'] as const;

export const LIMITS = { elements: 24, relationships: 60, steps: 12, points: 24 } as const;

const SEQUENCE_TYPES: VisualType[] = ['process', 'cycle', 'flowchart', 'timeline', 'hierarchy', 'anatomy_layers', 'cross_section', 'mechanism'];

// ── Text hygiene ────────────────────────────────────────────────────────────

const clean = (s: string) =>
  s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/<\/?[a-z][^>]*>/gi, '').replace(/\s+/g, ' ').trim();
const txt = (max: number) => z.string().transform(clean).pipe(z.string().min(1).max(max));

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

const UNSAFE = /\b(?:https?|ftp|file):\/\/|javascript:|vbscript:|data:\s*text\/|<\s*(?:script|iframe|object|embed|img|svg|style|link|meta)\b|\bon[a-z]+\s*=/i;

function findUnsafe(value: unknown, depth = 0): string | null {
  if (depth > 8) return null;
  if (typeof value === 'string') return UNSAFE.test(value) ? value.slice(0, 40) : null;
  if (Array.isArray(value)) {
    for (const v of value) { const hit = findUnsafe(v, depth + 1); if (hit) return hit; }
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) { const hit = findUnsafe(v, depth + 1); if (hit) return hit; }
  }
  return null;
}

// ── Schema ──────────────────────────────────────────────────────────────────

const Id = z.string().regex(/^[a-z0-9_]{1,40}$/, 'ids must be lowercase letters, digits or underscores');
const Dir = z.enum(DIRECTION_TERMS);

const Pos = z.object({ x: z.number().int().min(0).max(8), y: z.number().int().min(0).max(10) });

const VIEW_VARIANT_SCHEMA = z.object({
  view: z.enum(VIEWS),
  axes: z.object({ left: Dir.optional(), right: Dir.optional(), top: Dir.optional(), bottom: Dir.optional() }).optional(),
  positions: z.array(z.object({ id: Id, pos: Pos })).max(24).default([]),
});

const ElementSchema = z.object({
  id: Id,
  label: txt(60),
  short_label: txt(16).optional(),
  kind: z.enum(ELEMENT_KINDS).optional(),
  description: txt(400).optional(),
  role: txt(300).optional(),
  when: txt(40).optional(),
  pos: Pos.optional(),
  symbol: z.string().regex(/^[A-Z][a-z]?$/).optional(),
  charge: z.number().int().min(-3).max(3).optional(),
  attributes: z.array(z.object({ name: txt(30), value: txt(220) })).max(8).optional(),
  /** cross_section only: place this structure inside a layer as a wedge. angle 0 = top, clockwise. */
  section: z.object({ ring: Id, angle: z.number().int().min(0).max(359), span: z.number().int().min(10).max(180) }).optional(),
});

const RelationshipSchema = z.object({
  from: Id,
  to: Id,
  relation: z.enum(RELATION_KEYS),
  label: txt(60).optional(),
  bond_order: z.number().int().min(1).max(3).optional(),
  bond_kind: z.enum(BOND_KINDS).optional(),
  /** attaches_to only: which end of a muscle this is. `from` is the muscle, `to` the bone. */
  role: z.enum(ATTACHMENT_ROLES).optional(),
});

const StepSchema = z.object({
  title: txt(60),
  text: txt(300),
  elements: z.array(Id).max(8).default([]),
});

const GraphSchema = z.object({
  kind: z.enum(['line', 'bar']).default('line'),
  x_label: txt(40),
  y_label: txt(40),
  points: z.array(z.object({ label: txt(24), y: z.number().finite() })).min(2).max(LIMITS.points),
});

export const VisualSpecSchema = z.object({
  visual_type: z.enum(VISUAL_TYPES),
  visual_reason: txt(300).optional(),
  subject: z.enum(SUBJECTS).default('other'),
  topic: txt(80),
  title: txt(80),
  learning_goal: txt(240),
  difficulty: z.enum(DIFFICULTIES).default('beginner'),
  view: z.enum(VIEWS).optional(),
  /** What each screen edge means, e.g. { top: 'superior', left: 'lateral' }. Used to verify spatial relations. */
  axes: z.object({ left: Dir.optional(), right: Dir.optional(), top: Dir.optional(), bottom: Dir.optional() }).optional(),
  elements: z.array(ElementSchema).max(LIMITS.elements).default([]),
  relationships: z.array(RelationshipSchema).max(LIMITS.relationships).default([]),
  /** Order of elements: steps, layers (outer→inner / top→bottom), levels, timeline. */
  sequence: z.array(Id).max(LIMITS.elements).default([]),
  steps: z.array(StepSchema).max(LIMITS.steps).default([]),
  graph: GraphSchema.optional(),
  interactions: z.array(z.enum(INTERACTIONS)).max(4).default(['select']),
  view_variants: z.array(VIEW_VARIANT_SCHEMA).max(6).default([]),
  /** Set by code, never trusted from the model. */
  provenance: z.enum(['ai_generated', 'curated', 'curated_reviewed']).default('ai_generated'),
  caveat: txt(200).optional(),
}).superRefine((spec, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const ids = new Set<string>();
  for (const el of spec.elements) {
    if (ids.has(el.id)) issue(`duplicate element id "${el.id}"`);
    ids.add(el.id);
  }
  const byId = new Map(spec.elements.map(e => [e.id, e]));

  for (const r of spec.relationships) {
    if (!ids.has(r.from) || !ids.has(r.to)) issue(`relationship ${r.from} → ${r.to} refers to an element that does not exist`);
    if (r.from === r.to) issue(`relationship from "${r.from}" to itself`);
  }
  const seenSeq = new Set<string>();
  for (const id of spec.sequence) {
    if (!ids.has(id)) issue(`sequence refers to unknown element "${id}"`);
    if (seenSeq.has(id)) issue(`sequence repeats "${id}"`);
    seenSeq.add(id);
  }
  spec.steps.forEach((s, i) => s.elements.forEach(id => { if (!ids.has(id)) issue(`step ${i + 1} refers to unknown element "${id}"`); }));
  const variantViews = new Set<string>();
  for (const v of spec.view_variants) {
    if (variantViews.has(v.view)) issue(`view variant "${v.view}" is duplicated`);
    variantViews.add(v.view);
    const variantIds = new Set<string>();
    for (const p of v.positions) {
      if (!ids.has(p.id)) issue(`view variant "${v.view}" refers to unknown element "${p.id}"`);
      if (variantIds.has(p.id)) issue(`view variant "${v.view}" repeats "${p.id}"`);
      variantIds.add(p.id);
    }
    if (v.axes) {
      for (const r of spec.relationships) {
        const def = RELATIONS[r.relation];
        if (def.kind !== 'spatial') continue;
        const a = variantIds.has(r.from) ? v.positions.find(x => x.id === r.from)?.pos : byId.get(r.from)?.pos;
        const b = variantIds.has(r.to) ? v.positions.find(x => x.id === r.to)?.pos : byId.get(r.to)?.pos;
        if (!a || !b) continue;
        const verdict = spatialVerdict(v.axes, directionOf(r.relation)!, a, b);
        if (verdict === 'contradiction') issue(`view variant "${v.view}" contradicts "${r.from}" ${def.phrase} "${r.to}"`);
      }
    }
  }

  // Depth relations must not loop (A in front of B in front of A).
  if (depthRanks(spec).cyclic) issue('depth relations (superficial/deep or anterior/posterior) form a loop');
  for (const r of spec.relationships) if (r.role && r.relation !== 'attaches_to') issue(`role "${r.role}" is only valid on attaches_to`);

  // Cross-section wedges
  const wedges = spec.elements.filter(e => e.section);
  if (wedges.length && spec.visual_type !== 'cross_section') issue('"section" placement is only valid for cross_section visuals');
  if (spec.visual_type === 'cross_section') {
    if (spec.sequence.length < 2) issue('a cross_section needs at least 2 layers listed in sequence (outer to inner)');
    const layerIds = new Set(spec.sequence);
    const spans = new Map<string, [number, number, string][]>();
    for (const w of wedges) {
      if (layerIds.has(w.id)) issue(`"${w.id}" cannot be both a layer and a wedge`);
      if (!layerIds.has(w.section!.ring)) issue(`"${w.id}" is placed in "${w.section!.ring}", which is not a layer in sequence`);
      spans.set(w.section!.ring, [...(spans.get(w.section!.ring) ?? []), [w.section!.angle, w.section!.span, w.id]]);
    }
    for (const [ring, list] of spans) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const [a1, s1, id1] = list[i], [a2, s2, id2] = list[j];
        const d = Math.abs(((a1 - a2 + 540) % 360) - 180); // circular distance between centres
        if (d < (s1 + s2) / 2) issue(`"${id1}" and "${id2}" overlap inside "${ring}"`);
      }
    }
  }

  // Per-type requirements
  const n = spec.elements.length;
  const t = spec.visual_type;
  if (t === 'graph') {
    if (!spec.graph) issue('a graph visual needs a graph block with points');
  } else if (n < 2) {
    issue(`${t} needs at least 2 elements`);
  }
  if (t === 'cycle' && n < 3) issue('a cycle needs at least 3 elements');
  if (t === 'anatomy' && spec.relationships.length < 1) issue('an anatomy visual needs at least one relationship between structures');
  if (t === 'molecular_structure' && !spec.relationships.some(r => r.relation === 'bonded_to')) issue('a molecular structure needs bonded_to relationships');
  if (t === 'mechanism' && spec.steps.length < 2) issue('a mechanism needs at least 2 steps');
  if (t === 'comparison' && !spec.elements.some(e => (e.attributes?.length ?? 0) > 0)) issue('a comparison needs attributes on its elements');
  if (t === 'comparison' && n > 4) issue('a comparison supports at most 4 items so it stays readable on a phone');

  // Molecular valence: reject structures that cannot exist.
  if (t === 'molecular_structure') {
    const MAX: Record<string, number> = { H: 1, C: 4, N: 3, O: 2, S: 6, P: 5, F: 1, Cl: 1, Br: 1, I: 1 };
    const used = new Map<string, number>();
    for (const r of spec.relationships) {
      if (r.relation !== 'bonded_to') continue;
      const order = r.bond_kind === 'hydrogen' || r.bond_kind === 'ionic' ? 0 : (r.bond_order ?? 1);
      used.set(r.from, (used.get(r.from) ?? 0) + order);
      used.set(r.to, (used.get(r.to) ?? 0) + order);
    }
    for (const el of spec.elements) {
      if (!el.symbol) continue;
      const cap = (MAX[el.symbol] ?? 8) + ((el.charge ?? 0) > 0 && (el.symbol === 'N' || el.symbol === 'O') ? 1 : 0);
      if ((used.get(el.id) ?? 0) > cap) issue(`atom "${el.label}" (${el.symbol}) has more bonds than its valence allows`);
    }
  }

  // Spatial relations must agree with the declared axes and positions.
  if (spec.axes) {
    for (const r of spec.relationships) {
      const def = RELATIONS[r.relation];
      if (def.kind !== 'spatial') continue;
      const a = byId.get(r.from)?.pos; const b = byId.get(r.to)?.pos;
      if (!a || !b) continue;
      const verdict = spatialVerdict(spec.axes, directionOf(r.relation)!, a, b);
      if (verdict === 'contradiction') {
        issue(`"${r.from}" ${def.phrase} "${r.to}", but their positions contradict the diagram axes`);
      }
    }
  }
});

export type VisualSpec = z.infer<typeof VisualSpecSchema>;
export type VisualElement = VisualSpec['elements'][number];
export type VisualRelationship = VisualSpec['relationships'][number];

type Axes = NonNullable<VisualSpec['axes']>;
type Side = keyof Axes;

function sideOf(axes: Axes, term: DirectionTerm): Side | null {
  for (const side of ['left', 'right', 'top', 'bottom'] as Side[]) if (axes[side] === term) return side;
  return null;
}

/** Is "from is `term` of to" consistent with where the two sit on screen? */
export function spatialVerdict(axes: Axes, term: DirectionTerm, from: { x: number; y: number }, to: { x: number; y: number }): 'ok' | 'contradiction' | 'unknown' {
  let side = sideOf(axes, term);
  let flip = false;
  if (!side) { side = sideOf(axes, OPPOSITE[term]); flip = true; }
  if (!side) return 'unknown';
  const delta = side === 'left' || side === 'right' ? from.x - to.x : from.y - to.y;
  if (delta === 0) return 'unknown';
  const towardLowEdge = side === 'left' || side === 'top';
  const fromIsTowardEdge = towardLowEdge ? delta < 0 : delta > 0;
  return (flip ? !fromIsTowardEdge : fromIsTowardEdge) ? 'ok' : 'contradiction';
}

// ── Normalisation (repair, never invent) ────────────────────────────────────

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

const TYPE_ALIASES: Record<string, VisualType> = {
  structure: 'molecular_structure', molecule: 'molecular_structure', molecular: 'molecular_structure',
  pathway: 'process', metabolic_pathway: 'process', sequence: 'process',
  layers: 'anatomy_layers', anatomical_layers: 'anatomy_layers', tissue_layers: 'anatomy_layers',
  anatomical: 'anatomy', relationship: 'anatomy', tree: 'hierarchy', levels: 'hierarchy',
  compare: 'comparison', table: 'comparison', flow: 'flowchart', chart: 'graph', crosssection: 'cross_section',
};
const SUBJECT_ALIASES: Record<string, VisualSubject> = {
  anatomy_and_physiology: 'anatomy', human_anatomy: 'anatomy', biochem: 'biochemistry', molecular_biology: 'biochemistry',
  physio: 'physiology', p_and_o: 'prosthetics_orthotics', prosthetics: 'prosthetics_orthotics', orthotics: 'prosthetics_orthotics',
  prosthetics_and_orthotics: 'prosthetics_orthotics', kinesiology: 'biomechanics',
};
const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/[\s-]+/g, '_') : v);

export function normalizeRawSpec(raw: Obj, opts: { forceProvenance?: 'ai_generated' } = {}): Obj {
  const out: Obj = { ...raw };

  const vt = lower(out.visual_type) as string;
  out.visual_type = TYPE_ALIASES[vt] ?? vt;
  const sj = lower(out.subject) as string;
  out.subject = (SUBJECTS as readonly string[]).includes(sj) ? sj : (SUBJECT_ALIASES[sj] ?? 'other');
  const df = lower(out.difficulty) as string;
  out.difficulty = (DIFFICULTIES as readonly string[]).includes(df) ? df : 'beginner';
  if (typeof out.view === 'string') {
    const v = lower(out.view) as string;
    out.view = (VIEWS as readonly string[]).includes(v) ? v : undefined;
  }

  const elements = (Array.isArray(out.elements) ? out.elements : []).filter(isObj).map((e: Obj) => ({
    ...e,
    id: slug(String(e.id ?? e.label ?? '')),
    kind: typeof e.kind === 'string' && (ELEMENT_KINDS as readonly string[]).includes(lower(e.kind) as string) ? lower(e.kind) : undefined,
    section: isObj(e.section) && Number.isFinite(Number(e.section.angle)) && Number.isFinite(Number(e.section.span))
      ? { ring: slug(String(e.section.ring ?? '')), angle: ((Math.round(Number(e.section.angle)) % 360) + 360) % 360, span: Math.min(180, Math.max(10, Math.round(Number(e.section.span)))) } : undefined,
    pos: isObj(e.pos) && Number.isFinite(Number(e.pos.x)) && Number.isFinite(Number(e.pos.y))
      ? { x: Math.round(Number(e.pos.x)), y: Math.round(Number(e.pos.y)) } : undefined,
  }));
  out.elements = elements;

  const known = new Set(elements.map((e: Obj) => e.id));
  out.relationships = (Array.isArray(out.relationships) ? out.relationships : []).filter(isObj).flatMap((r: Obj) => {
    const relation = canonicalRelation(r.relation);
    if (!relation) return [];
    const from = slug(String(r.from ?? '')); const to = slug(String(r.to ?? ''));
    if (!known.has(from) || !known.has(to)) return []; // drop dangling edges instead of failing the whole visual
    const bond_kind = typeof r.bond_kind === 'string' && (BOND_KINDS as readonly string[]).includes(lower(r.bond_kind) as string) ? lower(r.bond_kind) : undefined;
    const order = Number(r.bond_order);
    const rawRole = lower(r.role) as string;
    const labelRole = typeof r.label === 'string' ? (lower(r.label) as string) : '';
    const role = relation === 'attaches_to' ? ((ATTACHMENT_ROLES as readonly string[]).includes(rawRole) ? rawRole : (ATTACHMENT_ROLES as readonly string[]).includes(labelRole) ? labelRole : undefined) : undefined;
    return [{ from, to, relation, label: r.label, bond_kind, bond_order: Number.isInteger(order) ? order : undefined, role }];
  });

  const seq = (Array.isArray(out.sequence) ? out.sequence : []).map((s: unknown) => slug(String(s))).filter((s: string) => known.has(s));
  out.sequence = [...new Set<string>(seq)];
  if (SEQUENCE_TYPES.includes(out.visual_type) && out.sequence.length < 2) out.sequence = elements.filter((e: Obj) => !e.section).map((e: Obj) => e.id);

  out.steps = (Array.isArray(out.steps) ? out.steps : []).filter(isObj).map((s: Obj) => ({
    ...s,
    elements: (Array.isArray(s.elements) ? s.elements : []).map((x: unknown) => slug(String(x))).filter((x: string) => known.has(x)),
  }));

  if (isObj(out.axes)) {
    const axes: Obj = {};
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const v = lower(out.axes[side]) as string;
      if ((DIRECTION_TERMS as readonly string[]).includes(v)) axes[side] = v;
    }
    out.axes = Object.keys(axes).length ? axes : undefined;
  } else out.axes = undefined;

  const hadInteractions = Array.isArray(out.interactions);
  out.interactions = (Array.isArray(out.interactions) ? out.interactions : [])
    .map(lower).filter((i: unknown) => (INTERACTIONS as readonly unknown[]).includes(i));
  if (!hadInteractions) {
    out.interactions = ['select'];
    if (['anatomy', 'anatomy_layers', 'cross_section', 'molecular_structure', 'hierarchy', 'process'].includes(out.visual_type)) out.interactions.push('toggle_labels');
    if (out.visual_type === 'anatomy_layers') out.interactions.push('reveal_layers');
    if (out.visual_type === 'mechanism') out.interactions.push('step_through');
  }

  out.view_variants = (Array.isArray(out.view_variants) ? out.view_variants : []).filter(isObj).flatMap((v: Obj) => {
    const view = lower(v.view) as string;
    if (!(VIEWS as readonly string[]).includes(view)) return [];
    const positions = (Array.isArray(v.positions) ? v.positions : []).filter(isObj).flatMap((x: Obj) => {
      const id = slug(String(x.id ?? ''));
      const pos = isObj(x.pos) ? { x: Math.round(Number(x.pos.x)), y: Math.round(Number(x.pos.y)) } : null;
      return id && pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? [{ id, pos }] : [];
    });
    const axesRaw = isObj(v.axes) ? v.axes : {};
    const axes: Obj = {};
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const term = lower(axesRaw[side]) as string;
      if ((DIRECTION_TERMS as readonly string[]).includes(term)) axes[side] = term;
    }
    return [{ view, ...(Object.keys(axes).length ? { axes } : {}), positions }];
  });

  if (opts.forceProvenance) out.provenance = opts.forceProvenance;
  else if (out.provenance !== 'curated' && out.provenance !== 'curated_reviewed') out.provenance = 'ai_generated';
  return out;
}

// ── Public entry points ─────────────────────────────────────────────────────

/** Validate one spec. Used for model output (forceProvenance) and again before every render. */
export function parseVisualSpec(raw: unknown, opts: { forceProvenance?: 'ai_generated' } = {}): Validation<VisualSpec> {
  if (!isObj(raw)) return { ok: false, error: 'expected a JSON object' };
  const unsafe = findUnsafe(raw);
  if (unsafe) return { ok: false, error: `contains markup, script or URL content ("${unsafe}"). Use plain text only.` };
  const parsed = VisualSpecSchema.safeParse(normalizeRawSpec(raw, opts));
  if (parsed.success) return { ok: true, data: parsed.data };
  const msg = parsed.error.issues.slice(0, 4).map(i => `${i.path.join('.') || 'spec'}: ${i.message}`).join('; ');
  return { ok: false, error: msg };
}

export type VisualDecision =
  | { needs_visual: false; visual_reason?: string }
  | { needs_visual: true; visual_reason?: string; spec: VisualSpec };

/** Validator for the `visual_spec` AI task (registered in lib/ai-schemas.ts). */
export function validateVisualDecision(data: unknown): Validation<VisualDecision> {
  if (!isObj(data)) return { ok: false, error: 'expected a JSON object with needs_visual' };
  const needs = data.needs_visual === true || data.needs_visual === 'true';
  const reason = typeof data.visual_reason === 'string' ? clean(data.visual_reason).slice(0, 300) : undefined;
  if (!needs) return { ok: true, data: { needs_visual: false, ...(reason ? { visual_reason: reason } : {}) } };
  const { needs_visual: _drop, ...rest } = data;
  const spec = parseVisualSpec(rest, { forceProvenance: 'ai_generated' });
  if (!spec.ok) return { ok: false, error: spec.error };
  return { ok: true, data: { needs_visual: true, visual_reason: spec.data.visual_reason, spec: spec.data } };
}

/** Render-time guard: anything stored or received is re-validated. Returns null when unusable. */
export function safeVisualSpec(raw: unknown): VisualSpec | null {
  const r = parseVisualSpec(raw);
  return r.ok ? r.data : null;
}

export function elementMap(spec: VisualSpec): Map<string, VisualElement> {
  return new Map(spec.elements.map(e => [e.id, e]));
}

/** Elements in display order: `sequence` first, anything not in it after. */
export function applyViewVariant(spec: VisualSpec, view: VisualSpec['view']): VisualSpec {
  if (!view || view === spec.view) return spec;
  const variant = spec.view_variants.find(v => v.view === view);
  if (!variant) return spec;
  const pos = new Map(variant.positions.map(p => [p.id, p.pos]));
  return {
    ...spec,
    view,
    ...(variant.axes ? { axes: variant.axes } : {}),
    elements: spec.elements.map(el => pos.has(el.id) ? { ...el, pos: pos.get(el.id) } : el),
  };
}

export function availableViews(spec: VisualSpec): NonNullable<VisualSpec['view']>[] {
  return [spec.view, ...spec.view_variants.map(v => v.view)].filter((v, i, a): v is NonNullable<VisualSpec['view']> => !!v && a.indexOf(v) === i);
}

export function orderedElements(spec: VisualSpec): VisualElement[] {
  const map = elementMap(spec);
  const seq = spec.sequence.map(id => map.get(id)).filter((e): e is VisualElement => !!e);
  const rest = spec.elements.filter(e => !spec.sequence.includes(e.id));
  return [...seq, ...rest];
}
