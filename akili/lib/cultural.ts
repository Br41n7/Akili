export type CulturalContext = {
  country: string;
  foods: string[];
  transport: string[];
  objects: string[];
  exams: string[];
  forbidden: string[];
};

// These are broad fallbacks only. User-supplied familiar examples are always merged in.
const REGION_DEFAULTS: Record<string, CulturalContext> = {
  Nigeria: { country: 'Nigeria', foods: ['rice dishes', 'yam dishes', 'cassava dishes', 'soups', 'beans dishes'], transport: ['bus', 'tricycle', 'motorcycle', 'train'], objects: ['local currency', 'market', 'compound/home', 'power supply', 'water container'], exams: ['WAEC', 'JAMB', 'NECO', 'UTME', 'Post-UTME'], forbidden: [] },
  Ghana: { country: 'Ghana', foods: ['rice dishes', 'yam dishes', 'cassava dishes', 'stews', 'beans dishes'], transport: ['trotro', 'taxi', 'bus', 'train'], objects: ['cedi', 'market', 'compound/home', 'water container'], exams: ['WASSCE', 'BECE', 'CSSPS'], forbidden: [] },
  Kenya: { country: 'Kenya', foods: ['maize dishes', 'ugali-style meals', 'beans dishes', 'stews', 'rice dishes'], transport: ['matatu', 'boda boda', 'bus', 'train'], objects: ['shilling', 'market', 'home', 'water tank'], exams: ['KCSE', 'KCPE'], forbidden: [] },
  'South Africa': { country: 'South Africa', foods: ['maize dishes', 'stews', 'braai foods', 'bread-based meals'], transport: ['minibus taxi', 'bus', 'train'], objects: ['rand', 'township/market', 'home', 'water container'], exams: ['NSC Matric', 'IEB'], forbidden: [] },
  India: { country: 'India', foods: ['rice dishes', 'roti', 'dal', 'vegetable curries', 'regional snacks'], transport: ['auto rickshaw', 'bus', 'metro', 'train'], objects: ['rupee', 'market', 'home', 'pressure cooker'], exams: ['CBSE', 'ICSE', 'JEE', 'NEET', 'Board exams'], forbidden: [] },
  Other: { country: 'the learner’s region', foods: [], transport: [], objects: [], exams: [], forbidden: [] },
};

export function getProfile(region: string, custom?: Partial<CulturalContext>): CulturalContext {
  const base = REGION_DEFAULTS[region] || REGION_DEFAULTS.Other;
  return {
    ...base,
    ...custom,
    country: custom?.country || base.country,
    foods: Array.from(new Set([...(base.foods || []), ...(custom?.foods || [])])),
    transport: Array.from(new Set([...(base.transport || []), ...(custom?.transport || [])])),
    objects: Array.from(new Set([...(base.objects || []), ...(custom?.objects || [])])),
    exams: Array.from(new Set([...(base.exams || []), ...(custom?.exams || [])])),
    forbidden: Array.from(new Set([...(base.forbidden || []), ...(custom?.forbidden || [])])),
  };
}

export function buildCulturalBlock(region: string, custom?: Partial<CulturalContext>): string {
  const p = getProfile(region, custom);
  return `
CULTURAL GROUNDING — ADAPTIVE, NOT HARD-CODED:
The learner is in ${p.country}.
Use familiar local or regional references when they genuinely improve understanding, but do not force a cultural analogy into every answer.
Prefer examples the learner is likely to recognize. User-provided familiar examples have priority over generic defaults.
Foods/familiar items available: ${p.foods.length ? p.foods.join(', ') : 'none supplied — use broad, regionally appropriate examples without inventing specific preferences'}
Transport: ${p.transport.join(', ') || 'use broad familiar transport concepts'}
Objects/places: ${p.objects.join(', ') || 'use broad familiar everyday objects'}
Relevant exam systems: ${p.exams.join(', ') || 'do not assume a specific exam system'}
Avoid forcing unfamiliar foreign cultural references when a neutral or locally familiar example works better.
Never assume that one food, dialect, school system, or cultural practice represents everyone in the region.
`.trim();
}
