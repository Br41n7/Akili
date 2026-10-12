/**
 * "Explain this diagram".
 *
 * Two layers, both grounded in the VisualSpec:
 *   1. buildExplanation()   – deterministic, zero AI cost, can only mention what is in the spec.
 *   2. requestAIExplanation() – the model re-words it for a beginner. Its output is accepted only
 *      if it is keyed to real element ids and covers most of the diagram; otherwise we fall back to (1).
 */
import { callAIJSON } from '@/lib/utils';
import { elementMap, orderedElements, type VisualSpec } from './schema';
import { describeRelation } from './vocab';

export interface ExplanationPart { id: string; text: string }
export interface Explanation {
  summary: string;
  parts: ExplanationPart[];
  source: 'spec' | 'ai';
}

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

export type FactKind = 'origin' | 'insertion' | 'action' | 'nerve' | 'artery' | 'other';
export interface ElementFacts {
  intro: string[];
  facts: { name: string; value: string; kind: FactKind }[];
  relations: string[];
}

const FACT_KIND: Record<string, FactKind> = {
  origin: 'origin', insertion: 'insertion', action: 'action', actions: 'action',
  innervation: 'nerve', 'nerve supply': 'nerve', 'blood supply': 'artery',
};

/** Everything the spec says about one element, split so the UI can give each kind of fact its own style. */
export function elementFacts(spec: VisualSpec, id: string): ElementFacts {
  const map = elementMap(spec);
  const el = map.get(id);
  if (!el) return { intro: [], facts: [], relations: [] };
  const intro = [el.description, el.role].filter(Boolean).map(t => sentence(t as string));
  const facts = (el.attributes ?? []).map(a => ({ name: a.name, value: a.value, kind: FACT_KIND[a.name.toLowerCase()] ?? 'other' as FactKind }));
  const has = (k: FactKind) => facts.some(f => f.kind === k);
  const relations: string[] = [];
  for (const r of spec.relationships) {
    if (r.relation === 'bonded_to') continue; // too noisy to read aloud; the picture shows bonds
    if (r.from !== id && r.to !== id) continue;
    const from = map.get(r.from), to = map.get(r.to);
    if (!from || !to) continue;
    // origin/insertion recorded on the relationship become facts of the muscle if the attributes don't already say so
    if (r.role && r.from === id && !has(r.role)) facts.push({ name: r.role === 'origin' ? 'Origin' : 'Insertion', value: to.label, kind: r.role });
    relations.push(sentence(`${describeRelation(r.relation, from.label, to.label)}${r.role ? ` (${r.role})` : ''}`));
  }
  return { intro, facts, relations };
}

/** Everything the spec says about one element, as plain sentences. */
export function partsForElement(spec: VisualSpec, id: string): string[] {
  const f = elementFacts(spec, id);
  return [...f.intro, ...f.facts.map(x => sentence(`${x.name}: ${x.value}`)), ...f.relations];
}

function summaryFor(spec: VisualSpec): string {
  const map = elementMap(spec);
  const ordered = orderedElements(spec);
  const names = ordered.map(e => e.label);
  switch (spec.visual_type) {
    case 'process': case 'flowchart': case 'timeline': case 'mechanism':
      return `This diagram shows ${spec.topic} as a sequence. It starts with ${names[0]} and ends with ${names[names.length - 1]}, passing through ${names.length} stages in total: ${list(names)}.`;
    case 'cycle':
      return `This diagram shows ${spec.topic} as a cycle with ${names.length} stages: ${list(names)}. After ${names[names.length - 1]}, the cycle returns to ${names[0]}.`;
    case 'hierarchy':
      return `This diagram breaks ${spec.topic} into ${names.length} parts or levels: ${list(names)}.`;
    case 'anatomy_layers':
      return `This diagram shows the layers of ${spec.topic}, listed from the surface inward: ${list(names)}.`;
    case 'cross_section': {
      const layers = spec.sequence.map(id => map.get(id)?.label).filter(Boolean) as string[];
      const inside = spec.elements.filter(e => e.section).map(e => `${e.label} (in ${map.get(e.section!.ring)?.label})`);
      return `This is a simplified cross-section of ${spec.topic}. Its layers, from the outside in, are ${list(layers)}.${inside.length ? ` Inside them it also shows ${list(inside)}.` : ''}`;
    }
    case 'anatomy':
      return `This is a simplified schematic of ${spec.topic}${spec.view && spec.view !== 'schematic' ? `, shown from the ${spec.view} view` : ''}. It labels ${names.length} structures: ${list(names)}.`;
    case 'molecular_structure':
      return `This diagram shows the structure of ${spec.topic}, made of ${list(names)}.`;
    case 'comparison':
      return `This diagram compares ${list(names)}.`;
    case 'graph':
      return `This graph shows ${spec.graph ? `${spec.graph.y_label} against ${spec.graph.x_label}` : spec.topic}.`;
    default:
      return `This diagram shows ${spec.topic}.`;
  }
}

export function buildExplanation(spec: VisualSpec): Explanation {
  const parts = orderedElements(spec)
    .map(e => ({ id: e.id, text: `${e.label}. ${partsForElement(spec, e.id).join(' ')}`.trim() }))
    .filter(p => p.text.length > 0);
  const summary = [summaryFor(spec), spec.caveat].filter(Boolean).join(' ');
  return { summary, parts, source: 'spec' };
}

// ── AI-worded explanation, constrained to the spec ──────────────────────────

export function buildExplainPrompt(spec: VisualSpec): string {
  const facts = {
    topic: spec.topic, type: spec.visual_type, view: spec.view,
    elements: orderedElements(spec).map(e => ({ id: e.id, label: e.label, description: e.description, role: e.role, attributes: e.attributes })),
    relationships: spec.relationships.map(r => ({ from: r.from, relation: r.relation, to: r.to })),
    steps: spec.steps,
  };
  return `Explain this diagram to a beginner. The diagram contains ONLY the elements below.

${JSON.stringify(facts)}

Rules:
- Refer only to elements and relationships listed above, by their labels. Do not add structures, steps, molecules, numbers or facts that are not listed.
- Walk through them in diagram order using plain language. Define any technical term the first time you use it.
- "summary" is 2 to 3 sentences. "parts" has one entry per element id, each 1 to 2 sentences.

Return JSON: {"summary": string, "parts": [{"id": element id, "text": string}]}`;
}

/** Keep only parts for real elements, one per element; null if too little of the diagram is covered. */
export function acceptAIExplanation(spec: VisualSpec, raw: { summary?: unknown; parts?: unknown }): Explanation | null {
  const known = elementMap(spec);
  const seen = new Set<string>();
  const parts: ExplanationPart[] = [];
  for (const p of Array.isArray(raw.parts) ? raw.parts : []) {
    const id = typeof p?.id === 'string' ? p.id : '';
    const text = typeof p?.text === 'string' ? p.text.replace(/<[^>]*>/g, '').trim() : '';
    if (!known.has(id) || seen.has(id) || !text) continue;
    seen.add(id);
    parts.push({ id, text: text.slice(0, 600) });
  }
  const summary = typeof raw.summary === 'string' ? raw.summary.replace(/<[^>]*>/g, '').trim().slice(0, 700) : '';
  if (!summary || parts.length < Math.ceil(spec.elements.length * 0.6)) return null;
  return { summary, parts, source: 'ai' };
}

export async function requestAIExplanation(spec: VisualSpec, ctx: { region: string; projectId: string; persona?: string; userGroqKey?: string }): Promise<Explanation> {
  try {
    const raw = await callAIJSON<any>({
      task: 'visual_explain',
      prompt: buildExplainPrompt(spec),
      persona: ctx.persona || 'friendly',
      region: ctx.region, projectId: ctx.projectId, userGroqKey: ctx.userGroqKey,
      validationType: 'visual_explain',
    });
    return acceptAIExplanation(spec, raw) ?? buildExplanation(spec);
  } catch {
    return buildExplanation(spec); // explanation must never fail just because a provider did
  }
}

