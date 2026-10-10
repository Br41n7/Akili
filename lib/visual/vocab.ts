/**
 * Closed vocabularies for the Visual Learning Engine.
 *
 * The model may only choose from these lists. Anything else is rejected (or
 * mapped through the alias table), so the renderer never has to guess what a
 * relation means and the quiz/explain code can phrase it deterministically.
 */

export const DIRECTION_TERMS = [
  'anterior', 'posterior', 'medial', 'lateral', 'superior', 'inferior',
  'proximal', 'distal', 'superficial', 'deep',
] as const;
export type DirectionTerm = (typeof DIRECTION_TERMS)[number];

export const OPPOSITE: Record<DirectionTerm, DirectionTerm> = {
  anterior: 'posterior', posterior: 'anterior',
  medial: 'lateral', lateral: 'medial',
  superior: 'inferior', inferior: 'superior',
  proximal: 'distal', distal: 'proximal',
  superficial: 'deep', deep: 'superficial',
};

/** Standard definitions. Written by hand so teaching these terms never depends on the model. */
export const DIRECTION_GLOSSARY: Record<DirectionTerm, { meaning: string; hook: string }> = {
  anterior: { meaning: 'toward the front of the body', hook: 'Think of the front of your chest.' },
  posterior: { meaning: 'toward the back of the body', hook: 'Think of your back.' },
  medial: { meaning: 'closer to the midline of the body', hook: 'The midline runs down the middle of the body, between your eyes and through your navel.' },
  lateral: { meaning: 'farther from the midline of the body', hook: 'Lateral means toward the side, away from the middle.' },
  superior: { meaning: 'toward the head (higher up)', hook: 'Superior is above.' },
  inferior: { meaning: 'toward the feet (lower down)', hook: 'Inferior is below.' },
  proximal: { meaning: 'closer to the trunk or to the point where a limb attaches', hook: 'On the arm, the shoulder end is proximal.' },
  distal: { meaning: 'farther from the trunk or from the point where a limb attaches', hook: 'On the arm, the fingertip end is distal.' },
  superficial: { meaning: 'closer to the surface of the body', hook: 'Skin is the most superficial layer.' },
  deep: { meaning: 'farther from the surface of the body', hook: 'Bone lies deep to the muscle that covers it.' },
};

export type RelationKind = 'spatial' | 'structural' | 'flow' | 'chemical';

export interface RelationDef {
  kind: RelationKind;
  /** Used as: "{from} {phrase} {to}". */
  phrase: string;
  /** For spatial relations, the direction term the relation expresses. */
  direction?: DirectionTerm;
}

export const RELATIONS = {
  // spatial
  anterior_to: { kind: 'spatial', phrase: 'is anterior to', direction: 'anterior' },
  posterior_to: { kind: 'spatial', phrase: 'is posterior to', direction: 'posterior' },
  medial_to: { kind: 'spatial', phrase: 'is medial to', direction: 'medial' },
  lateral_to: { kind: 'spatial', phrase: 'is lateral to', direction: 'lateral' },
  superior_to: { kind: 'spatial', phrase: 'is superior to', direction: 'superior' },
  inferior_to: { kind: 'spatial', phrase: 'is inferior to', direction: 'inferior' },
  proximal_to: { kind: 'spatial', phrase: 'is proximal to', direction: 'proximal' },
  distal_to: { kind: 'spatial', phrase: 'is distal to', direction: 'distal' },
  superficial_to: { kind: 'spatial', phrase: 'is superficial to', direction: 'superficial' },
  deep_to: { kind: 'spatial', phrase: 'is deep to', direction: 'deep' },
  // structural
  attaches_to: { kind: 'structural', phrase: 'attaches to' },
  articulates_with: { kind: 'structural', phrase: 'articulates with' },
  part_of: { kind: 'structural', phrase: 'is part of' },
  contains: { kind: 'structural', phrase: 'contains' },
  surrounds: { kind: 'structural', phrase: 'surrounds' },
  stabilizes: { kind: 'structural', phrase: 'stabilizes' },
  acts_on: { kind: 'structural', phrase: 'acts on' },
  innervated_by: { kind: 'structural', phrase: 'is innervated by' },
  supplied_by: { kind: 'structural', phrase: 'is supplied with blood by' },
  gives_rise_to: { kind: 'structural', phrase: 'gives rise to' },
  // flow / causal
  leads_to: { kind: 'flow', phrase: 'leads to' },
  produces: { kind: 'flow', phrase: 'produces' },
  converts_to: { kind: 'flow', phrase: 'is converted to' },
  catalyzes: { kind: 'flow', phrase: 'catalyzes' },
  activates: { kind: 'flow', phrase: 'activates' },
  inhibits: { kind: 'flow', phrase: 'inhibits' },
  binds: { kind: 'flow', phrase: 'binds' },
  requires: { kind: 'flow', phrase: 'requires' },
  // chemical
  bonded_to: { kind: 'chemical', phrase: 'is bonded to' },
} as const satisfies Record<string, RelationDef>;

export type RelationKey = keyof typeof RELATIONS;
export const RELATION_KEYS = Object.keys(RELATIONS) as [RelationKey, ...RelationKey[]];

/** Alias → canonical. Applied before validation so near-misses are repaired, not rejected. */
const RELATION_ALIASES: Record<string, RelationKey> = {
  located_anterior_to: 'anterior_to', located_posterior_to: 'posterior_to',
  located_medial_to: 'medial_to', located_lateral_to: 'lateral_to',
  located_superior_to: 'superior_to', located_inferior_to: 'inferior_to',
  located_proximal_to: 'proximal_to', located_distal_to: 'distal_to',
  located_superficial_to: 'superficial_to', located_deep_to: 'deep_to',
  anterior: 'anterior_to', posterior: 'posterior_to', medial: 'medial_to', lateral: 'lateral_to',
  superior: 'superior_to', inferior: 'inferior_to', proximal: 'proximal_to', distal: 'distal_to',
  superficial: 'superficial_to', deep: 'deep_to',
  attached_to: 'attaches_to', inserts_on: 'attaches_to', originates_from: 'attaches_to',
  articulates: 'articulates_with', joins: 'articulates_with',
  innervated: 'innervated_by', innervates: 'innervated_by',
  supplied: 'supplied_by', blood_supply: 'supplied_by',
  branches_to: 'gives_rise_to', branches_into: 'gives_rise_to', divides_into: 'gives_rise_to',
  next: 'leads_to', then: 'leads_to', precedes: 'leads_to', causes: 'leads_to', results_in: 'leads_to',
  becomes: 'converts_to', converted_to: 'converts_to', is_converted_to: 'converts_to',
  stimulates: 'activates', blocks: 'inhibits', covalent_bond: 'bonded_to', bonds_to: 'bonded_to', bond: 'bonded_to',
};

export function canonicalRelation(raw: unknown): RelationKey | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key in RELATIONS) return key as RelationKey;
  return RELATION_ALIASES[key] ?? null;
}

/** "{from} {phrase} {to}" with the labels supplied by the caller. */
export function describeRelation(relation: RelationKey, fromLabel: string, toLabel: string): string {
  return `${fromLabel} ${RELATIONS[relation].phrase} ${toLabel}`;
}

/** Direction a spatial relation expresses (undefined for non-spatial relations). */
export function directionOf(relation: RelationKey): DirectionTerm | undefined {
  return (RELATIONS[relation] as RelationDef).direction;
}
