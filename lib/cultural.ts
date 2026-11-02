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
  Uganda: { country: 'Uganda', foods: ['matooke', 'posho', 'beans dishes', 'stews'], transport: ['boda boda', 'taxi (matatu-style minibus)', 'bus'], objects: ['shilling', 'market', 'home', 'water container'], exams: ['UCE', 'UACE'], forbidden: [] },
  Tanzania: { country: 'Tanzania', foods: ['ugali', 'rice dishes', 'beans dishes', 'stews'], transport: ['daladala', 'bodaboda', 'bus', 'ferry'], objects: ['shilling', 'market', 'home', 'water container'], exams: ['CSEE', 'ACSEE'], forbidden: [] },
  Egypt: { country: 'Egypt', foods: ['bread-based meals', 'rice dishes', 'beans dishes', 'stews'], transport: ['metro', 'microbus', 'bus', 'train'], objects: ['pound', 'market', 'home'], exams: ['Thanaweya Amma'], forbidden: [] },
  Pakistan: { country: 'Pakistan', foods: ['rice dishes', 'roti', 'dal', 'curries'], transport: ['rickshaw', 'bus', 'motorcycle', 'train'], objects: ['rupee', 'market', 'home'], exams: ['Matric', 'FSc', 'MDCAT'], forbidden: [] },
  Bangladesh: { country: 'Bangladesh', foods: ['rice dishes', 'dal', 'fish dishes', 'curries'], transport: ['rickshaw', 'bus', 'launch (boat)', 'train'], objects: ['taka', 'market', 'home'], exams: ['SSC', 'HSC'], forbidden: [] },
  'United Kingdom': { country: 'the United Kingdom', foods: ['sandwiches', 'roast dinners', 'pasta dishes', 'curries'], transport: ['bus', 'train', 'underground', 'bicycle'], objects: ['pound', 'high street shop', 'home'], exams: ['GCSE', 'A-Level'], forbidden: [] },
  'United States': { country: 'the United States', foods: ['sandwiches', 'pasta dishes', 'cereal', 'pizza'], transport: ['car', 'school bus', 'subway', 'bicycle'], objects: ['dollar', 'store', 'home'], exams: ['SAT', 'ACT', 'AP'], forbidden: [] },
  Canada: { country: 'Canada', foods: ['sandwiches', 'pasta dishes', 'cereal', 'soups'], transport: ['car', 'school bus', 'subway', 'bicycle'], objects: ['dollar', 'store', 'home'], exams: ['provincial exams', 'AP', 'IB'], forbidden: [] },
  Australia: { country: 'Australia', foods: ['sandwiches', 'pasta dishes', 'barbecue', 'cereal'], transport: ['car', 'bus', 'train', 'bicycle'], objects: ['dollar', 'shop', 'home'], exams: ['HSC', 'VCE', 'ATAR'], forbidden: [] },
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

/** Countries offered at signup and in settings. "Other" always works: the tutor then uses neutral, widely familiar examples. */
export const REGION_OPTIONS: string[] = [...Object.keys(REGION_DEFAULTS).filter(r => r !== 'Other').sort((a, b) => a.localeCompare(b)), 'Other'];
