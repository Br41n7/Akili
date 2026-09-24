export const PROFILES: Record<string, {
  country: string; foods: string[]; transport: string[];
  objects: string[]; exams: string[]; forbidden: string[];
}> = {
  Nigeria: {
    country: 'Nigeria',
    foods: ['Jollof rice', 'Eba', 'Garri', 'Suya', 'Puff puff', 'Akara', 'Moin moin', 'Pepper soup'],
    transport: ['Danfo bus', 'Keke Napep', 'Okada', 'BRT bus', 'Bolt ride'],
    objects: ['Generator', 'NEPA light', 'Naira', 'Kerosene stove', 'Zinc roof', 'Compound house', 'Buka'],
    exams: ['WAEC', 'JAMB', 'NECO', 'UTME', 'Post-UTME'],
    forbidden: ['pizza','hot dog','basement','yard sale','yellow school bus','snow','Thanksgiving','dollar bill','401k','Subway sandwich'],
  },
  Ghana: {
    country: 'Ghana',
    foods: ['Waakye', 'Banku', 'Kenkey', 'Fufu', 'Kelewele', 'Bofrot'],
    transport: ['Trotro', 'Keke', 'Shared taxi', 'Metro Mass bus'],
    objects: ['Cedi notes', 'Chop bar', 'Compound house', 'Sachet water', 'Fan milk'],
    exams: ['WASSCE', 'BECE', 'CSSPS'],
    forbidden: ['pizza','hot dog','basement','snow','yellow school bus','Thanksgiving'],
  },
  Kenya: {
    country: 'Kenya',
    foods: ['Ugali', 'Sukuma wiki', 'Nyama choma', 'Mandazi', 'Pilau', 'Githeri'],
    transport: ['Matatu', 'Boda boda', 'Tuk-tuk', 'SGR train'],
    objects: ['Jiko stove', 'Sufuria', 'M-Pesa', 'Water tank', 'Mabati roof'],
    exams: ['KCSE', 'KCPE'],
    forbidden: ['pizza','hot dog','basement','snow','Thanksgiving'],
  },
  'South Africa': {
    country: 'South Africa',
    foods: ['Pap', 'Boerewors', 'Braai', 'Bunny chow', 'Biltong', 'Chakalaka'],
    transport: ['Minibus taxi', 'Metrorail', 'Gautrain', 'Bakkie'],
    objects: ['Rand notes', 'Eskom load shedding', 'Spaza shop', 'RDP house', 'Braai stand'],
    exams: ['NSC Matric', 'IEB'],
    forbidden: ['pizza','hot dog','basement','Thanksgiving','school bus (yellow)'],
  },
  India: {
    country: 'India',
    foods: ['Roti', 'Biryani', 'Samosa', 'Idli', 'Masala chai', 'Dosa', 'Dal'],
    transport: ['Auto rickshaw', 'Local train', 'Metro', 'Two-wheeler'],
    objects: ['Pressure cooker', 'Steel tumbler', 'Rupee notes', 'Inverter', 'Kirana store'],
    exams: ['CBSE', 'ICSE', 'JEE', 'NEET', 'Board exams'],
    forbidden: ['pizza','basement','snow (for most regions)','Thanksgiving','yellow school bus'],
  },
};

export function getProfile(region: string) {
  return PROFILES[region] || PROFILES['Nigeria'];
}

export function buildCulturalBlock(region: string): string {
  const p = getProfile(region);
  return `
CULTURAL GROUNDING — MANDATORY:
Student is in ${p.country}. Use ONLY these familiar references in all analogies and examples:
  Foods: ${p.foods.join(', ')}
  Transport: ${p.transport.join(', ')}
  Objects: ${p.objects.join(', ')}
  Exam system: ${p.exams.join(', ')}
FORBIDDEN — never use as analogies: ${p.forbidden.join(', ')}
If no specific local analogy fits, use universal concepts: water, fire, the sun, a seed growing, weight of a stone.
`.trim();
}
