/**
 * "Test me": questions generated from the VisualSpec itself.
 *
 * Deterministic and free (no AI call). Every answer comes from a relationship,
 * sequence position, description or attribute that is in the spec, and every
 * distractor is checked so it cannot also be a correct answer.
 */
import { elementMap, orderedElements, spatialVerdict, type VisualElement, type VisualSpec } from './schema';
import { DIRECTION_GLOSSARY, DIRECTION_TERMS, OPPOSITE, RELATIONS, RELATION_KEYS, directionOf, type DirectionTerm, type RelationKey } from './vocab';

export type VisualQuestionKind = 'relation' | 'direction' | 'sequence' | 'description' | 'attribute' | 'term' | 'edge';

export interface VisualQuestion {
  id: string;
  kind: VisualQuestionKind;
  type: 'multiple_choice';
  question: string;
  /** "A) text" – same shape as the rest of Akili's questions. */
  options: string[];
  /** Letter only. */
  correct_answer: string;
  explanation: string;
  concept: string;
  /** Elements the question is about; used to highlight them after answering. */
  element_ids: string[];
  /** 1 = vocabulary/orientation, 2 = identify, 3 = apply/sequence. */
  level: 1 | 2 | 3;
}

const SYMMETRIC: RelationKey[] = ['bonded_to', 'articulates_with'];
const LETTERS = 'ABCD';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function make(
  base: Omit<VisualQuestion, 'options' | 'correct_answer' | 'type'>,
  correct: string, distractors: string[], rand: () => number, minWrong = 2,
): VisualQuestion | null {
  const wrong = [...new Set(distractors.filter(d => d && d !== correct))];
  if (wrong.length < minWrong) return null;
  const options = shuffle([correct, ...shuffle(wrong, rand).slice(0, 3)], rand);
  return {
    ...base, type: 'multiple_choice',
    options: options.map((o, i) => `${LETTERS[i]}) ${o}`),
    correct_answer: LETTERS[options.indexOf(correct)],
  };
}

const noun = (spec: VisualSpec) =>
  ({ process: 'step', flowchart: 'step', cycle: 'stage', timeline: 'event', hierarchy: 'level', anatomy_layers: 'layer', cross_section: 'layer', anatomy: 'structure', molecular_structure: 'component', mechanism: 'stage' } as Record<string, string>)[spec.visual_type] ?? 'item';

/**
 * Every id for which "<id> relation target" is true, so none of them can be used as a distractor.
 * Includes: symmetric relations, the inverse spatial relation (A posterior to B => B anterior to A),
 * and chains (A proximal to B, B proximal to C => A proximal to C). Conservative on purpose.
 */
function satisfiers(spec: VisualSpec, relation: RelationKey, target: string): Set<string> {
  const term = directionOf(relation);
  const inverse = term ? RELATION_KEYS.find(k => directionOf(k) === OPPOSITE[term]) : undefined;
  const preds = new Map<string, string[]>();
  const add = (from: string, to: string) => preds.set(to, [...(preds.get(to) ?? []), from]);
  for (const r of spec.relationships) {
    if (r.relation === relation) { add(r.from, r.to); if (SYMMETRIC.includes(relation)) add(r.to, r.from); }
    else if (inverse && r.relation === inverse) add(r.to, r.from);
  }
  const out = new Set<string>();
  const queue = [target];
  while (queue.length) {
    for (const p of preds.get(queue.shift()!) ?? []) if (!out.has(p)) { out.add(p); queue.push(p); }
  }
  out.delete(target);
  return out;
}

function relationQuestions(spec: VisualSpec, rand: () => number): VisualQuestion[] {
  const map = elementMap(spec);
  const out: VisualQuestion[] = [];
  const seen = new Set<string>();

  for (const r of spec.relationships) {
    const def = RELATIONS[r.relation];
    if (r.relation === 'bonded_to' && spec.visual_type !== 'molecular_structure') continue;
    const from = map.get(r.from); const to = map.get(r.to);
    if (!from || !to) continue;
    const key = `${r.relation}:${r.to}`;
    if (seen.has(key)) continue; seen.add(key);

    const correctSet = satisfiers(spec, r.relation, r.to);
    const toPos = to.pos;
    const bad = spec.elements.filter(e => {
      if (e.id === r.to || correctSet.has(e.id)) return false;
      // inverse spatial relation: "to is <rel> e" would make e a wrong answer for a different reason, still wrong -> fine.
      if (def.kind === 'spatial' && spec.axes && e.pos && toPos) {
        // don't use a distractor the geometry says could actually be correct
        return spatialVerdict(spec.axes, directionOf(r.relation)!, e.pos, toPos) !== 'ok';
      }
      return true;
    });
    const correct = from.label;
    const q = make({
      id: '', kind: 'relation', level: def.kind === 'spatial' ? 2 : 3,
      question: `Which ${noun(spec)} ${def.phrase} ${to.label}?`,
      explanation: `${from.label} ${def.phrase} ${to.label}${r.label ? ` (${r.label})` : ''}.`,
      concept: directionOf(r.relation) ? `${directionOf(r.relation)} relationships: ${spec.topic}` : spec.topic,
      element_ids: [from.id, to.id],
    }, correct, bad.map(e => e.label), rand);
    if (q) out.push(q);
  }
  return out;
}

function sequenceQuestions(spec: VisualSpec, rand: () => number): VisualQuestion[] {
  const ordered = orderedElements(spec).filter(e => spec.sequence.includes(e.id));
  if (ordered.length < 3) return [];
  const out: VisualQuestion[] = [];
  const n = noun(spec);
  const labels = ordered.map(e => e.label);
  const layered = spec.visual_type === 'anatomy_layers' || spec.visual_type === 'cross_section';
  const cyc = spec.visual_type === 'cycle';

  if (layered) {
    const first = ordered[0]; const last = ordered[ordered.length - 1];
    const a = make({ id: '', kind: 'sequence', level: 2, question: 'Which layer is closest to the surface?', explanation: `${first.label} is the most superficial layer shown.`, concept: spec.topic, element_ids: [first.id] }, first.label, labels.filter(l => l !== first.label), rand);
    const b = make({ id: '', kind: 'sequence', level: 2, question: 'Which layer lies deepest?', explanation: `${last.label} is the deepest layer shown.`, concept: spec.topic, element_ids: [last.id] }, last.label, labels.filter(l => l !== last.label), rand);
    return [a, b].filter((q): q is VisualQuestion => !!q);
  }

  if (!cyc && spec.visual_type !== 'hierarchy') {
    const f = ordered[0];
    const q = make({ id: '', kind: 'sequence', level: 2, question: `Which ${n} comes first?`, explanation: `${f.label} is the first ${n} in this diagram.`, concept: spec.topic, element_ids: [f.id] }, f.label, labels.filter(l => l !== f.label), rand);
    if (q) out.push(q);
  }
  if (spec.visual_type !== 'hierarchy') {
    const picks = shuffle(ordered.map((e, i) => i), rand).slice(0, 2);
    for (const i of picks) {
      const cur = ordered[i];
      const nextIdx = i + 1 < ordered.length ? i + 1 : cyc ? 0 : -1;
      if (nextIdx < 0) continue;
      const next = ordered[nextIdx];
      const q = make({ id: '', kind: 'sequence', level: 3, question: `Which ${n} comes immediately after ${cur.label}?`, explanation: `${next.label} follows ${cur.label}.`, concept: spec.topic, element_ids: [cur.id, next.id] }, next.label, labels.filter(l => l !== next.label && l !== cur.label), rand);
      if (q) out.push(q);
    }
  }
  return out;
}

/**
 * "How is X positioned relative to Y?" with the stated direction against its exact opposite.
 * Only the opposite is offered as a wrong answer: it is the one alternative that is certainly false
 * (unlike "anterior" vs "lateral", which a diagram with no depth axis can't rule out).
 */
function directionQuestions(spec: VisualSpec, rand: () => number): VisualQuestion[] {
  const map = elementMap(spec);
  const out: VisualQuestion[] = [];
  const seen = new Set<string>();
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
  const text = (t: DirectionTerm) => `${cap(t)}: ${DIRECTION_GLOSSARY[t].meaning}`;
  for (const r of spec.relationships) {
    const term = directionOf(r.relation);
    const from = map.get(r.from); const to = map.get(r.to);
    if (!term || !from || !to) continue;
    const key = `${r.from}|${r.to}|${term}`;
    if (seen.has(key)) continue; seen.add(key);
    const q = make({
      id: '', kind: 'direction', level: 2,
      question: `How is ${from.label} positioned relative to ${to.label}?`,
      explanation: `${from.label} ${RELATIONS[r.relation].phrase} ${to.label}. ${cap(term)} means ${DIRECTION_GLOSSARY[term].meaning}.`,
      concept: `${term} relationships: ${spec.topic}`, element_ids: [from.id, to.id],
    }, text(term), [text(OPPOSITE[term])], rand, 1);
    if (q) out.push(q);
  }
  return out;
}

const words = (s: string) => s.toLowerCase().match(/[a-z]{4,}/g) ?? [];

function describesQuestions(spec: VisualSpec, rand: () => number): VisualQuestion[] {
  const out: VisualQuestion[] = [];
  const n = noun(spec);
  for (const e of spec.elements) {
    const d = e.description;
    if (!d) continue;
    // A description that contains the label's own words gives the answer away.
    const hit = words(e.label).some(w => d.toLowerCase().includes(w));
    if (hit) continue;
    const q = make({
      id: '', kind: 'description', level: 2,
      question: `Which ${n} matches this description: "${d.replace(/\.$/, '')}"?`,
      explanation: `${e.label}: ${d}`, concept: e.label, element_ids: [e.id],
    }, e.label, spec.elements.filter(x => x.id !== e.id).map(x => x.label), rand);
    if (q) out.push(q);
  }
  return out;
}

function attributeQuestions(spec: VisualSpec, rand: () => number): VisualQuestion[] {
  const out: VisualQuestion[] = [];
  const byName = new Map<string, { el: VisualElement; value: string }[]>();
  for (const el of spec.elements) for (const a of el.attributes ?? []) {
    const k = a.name.toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), { el, value: a.value }]);
  }
  for (const [name, rows] of byName) {
    if (rows.length < 3) continue;
    const values = rows.map(r => r.value.toLowerCase());
    for (const row of rows.slice(0, 2)) {
      if (values.filter(v => v === row.value.toLowerCase()).length > 1) continue; // ambiguous value
      const q = make({
        id: '', kind: 'attribute', level: 3,
        question: `Which ${noun(spec)} has this ${name}: "${row.value.replace(/\.$/, '')}"?`,
        explanation: `${row.el.label} — ${name}: ${row.value}`, concept: `${name}: ${spec.topic}`, element_ids: [row.el.id],
      }, row.el.label, rows.filter(r => r.el.id !== row.el.id).map(r => r.el.label), rand);
      if (q) out.push(q);
    }
  }
  return out;
}

/** Orientation questions: only for terms this diagram actually uses. */
export function termQuestions(spec: VisualSpec, rand: () => number, only?: DirectionTerm[]): VisualQuestion[] {
  const used = new Set<DirectionTerm>();
  for (const r of spec.relationships) { const d = directionOf(r.relation); if (d) used.add(d); }
  for (const t of Object.values(spec.axes ?? {})) if (t) used.add(t);
  const out: VisualQuestion[] = [];
  for (const term of DIRECTION_TERMS) {
    if (!used.has(term) || (only && !only.includes(term))) continue;
    const g = DIRECTION_GLOSSARY[term];
    const others = DIRECTION_TERMS.filter(t => t !== term).map(t => DIRECTION_GLOSSARY[t].meaning);
    const q = make({ id: '', kind: 'term', level: 1, question: `What does "${term}" mean?`, explanation: `${term[0].toUpperCase()}${term.slice(1)} means ${g.meaning}. ${g.hook}`, concept: `anatomical direction: ${term}`, element_ids: [] },
      g.meaning, others.filter(m => m !== g.meaning), rand);
    if (q) out.push(q);
    // Which edge of the diagram is <term>? Uses the spec's own axes.
    const side = (['left', 'right', 'top', 'bottom'] as const).find(s => spec.axes?.[s] === term);
    if (side) {
      const e = make({ id: '', kind: 'edge', level: 1, question: `In this diagram, which edge is ${term}?`, explanation: `The ${side} of this diagram is ${term} (${g.meaning}).`, concept: `anatomical direction: ${term}`, element_ids: [] },
        side, ['left', 'right', 'top', 'bottom'].filter(s => s !== side), rand);
      if (e) out.push(e);
    }
  }
  return out;
}

export interface QuizOptions { max?: number; seed?: string; onlyTerms?: DirectionTerm[]; maxLevel?: 1 | 2 | 3; includeTerms?: boolean }

export function buildVisualQuestions(spec: VisualSpec, opts: QuizOptions = {}): VisualQuestion[] {
  const rand = rng(`${opts.seed ?? ''}|${spec.topic}|${spec.elements.map(e => e.id).join(',')}`);
  const all = [
    ...(opts.includeTerms || opts.onlyTerms ? termQuestions(spec, rand, opts.onlyTerms) : []),
    ...directionQuestions(spec, rand),
    ...relationQuestions(spec, rand),
    ...describesQuestions(spec, rand),
    ...sequenceQuestions(spec, rand),
    ...attributeQuestions(spec, rand),
  ].filter(q => (opts.maxLevel ? q.level <= opts.maxLevel : true));

  // lowest level first, otherwise shuffled so repeat attempts vary with the seed
  const sorted = shuffle(all, rand).sort((a, b) => a.level - b.level);
  const used = new Set<string>();
  return sorted.filter(q => (used.has(q.question) ? false : (used.add(q.question), true)))
    .slice(0, opts.max ?? 4)
    .map((q, i) => ({ ...q, id: `vq${i + 1}` }));
}

/**
 * Remedial ladder for a missed question (Phase 2 adaptive support):
 * vocabulary → orientation on this diagram → the original question → harder.
 */
export function buildScaffold(spec: VisualSpec, missed: VisualQuestion, seed = 'scaffold'): VisualQuestion[] {
  const rand = rng(`${seed}|${missed.id}|${spec.topic}`);
  const term = DIRECTION_TERMS.find(t => missed.concept.startsWith(`${t} relationships`));
  const steps: VisualQuestion[] = [];
  if (term) steps.push(...termQuestions(spec, rand, [term]));
  steps.push({ ...missed, id: `${missed.id}-retry` });
  return steps.map((q, i) => ({ ...q, id: q.id || `sc${i + 1}` }));
}
