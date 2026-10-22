/** Mnemonics: prompt, checks and the text we store. Pure, so it can be tested without a model. */

export const MNEMONIC_STYLES = [
  { value: 'story', label: 'Story' },
  { value: 'acronym', label: 'Acronym' },
  { value: 'funny', label: 'Funny' },
  { value: 'academic', label: 'Academic' },
  { value: 'african-themed', label: 'African' },
] as const;
export type MnemonicStyle = (typeof MNEMONIC_STYLES)[number]['value'];

export const MAX_ITEMS = 12;

export interface Mnemonic { mnemonic: string; explanation: string; breakdown: { letter: string; item: string }[] }

/** One item per line (or comma separated), trimmed, de-duplicated, capped. */
export function parseItems(raw: string): string[] {
  const seen = new Set<string>();
  return raw.split(/\n|;|,(?=\s*\S)/).map(s => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(s => {
    const k = s.toLowerCase();
    if (!s || seen.has(k)) return false;
    seen.add(k); return true;
  }).map(s => s.slice(0, 80)).slice(0, MAX_ITEMS);
}

const GUIDE: Record<MnemonicStyle, string> = {
  story: 'A short, vivid story (2 to 4 sentences) in which each thing to remember is a memorable character or event, in the right order.',
  acronym: 'A pronounceable acronym or a short sentence whose first letters give the items in order (for example PMAT). Every letter must be the first letter of the item it stands for.',
  funny: 'A silly, surprising line or image that sticks. Humour must help recall, not replace the facts.',
  academic: 'A clean, formal memory aid: a grouping, a pattern or a short rhyme that a lecturer could put on a slide.',
  'african-themed': 'Use familiar West African images (markets, food, music, football, transport, proverbs) as the memory hooks. Keep it respectful and never stereotype.',
};

export function buildMnemonicPrompt(i: { concept: string; style: MnemonicStyle; items?: string[] }): string {
  const items = (i.items || []).slice(0, MAX_ITEMS);
  const acro = i.style === 'acronym';
  return `Create a ${i.style} mnemonic to remember: "${i.concept}".
${items.length ? `The items to remember, in this order:\n${items.map((t, n) => `${n + 1}. ${t}`).join('\n')}\nUse ALL of them, in this order, and add nothing else.` : 'Choose the 3 to 6 most important parts of this concept to remember. Use only accurate, standard content; if you are unsure of a fact, leave it out.'}

Style: ${GUIDE[i.style]}

Rules:
- The mnemonic must be short enough to say in one breath or two.
- "explanation" says what each part of the mnemonic stands for, in order, and states the facts correctly.
- "breakdown" lists, in order, the first letter of each item and the item it stands for.${acro ? ' For an acronym the letters, joined in order, must spell the acronym exactly.' : ''}

Return JSON only:
{"mnemonic": string, "explanation": string, "breakdown": [{"letter": string, "item": string}]}`;
}

const strOf = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Server and client validator. Idempotent: its output passes it again. */
export function validateMnemonic(data: unknown, style?: MnemonicStyle): { ok: true; data: Mnemonic } | { ok: false; error: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'expected { mnemonic, explanation, breakdown }' };
  const d = data as Record<string, unknown>;
  const mnemonic = strOf(d.mnemonic).slice(0, 400);
  if (!mnemonic) return { ok: false, error: 'the mnemonic is empty' };
  const breakdown = (Array.isArray(d.breakdown) ? d.breakdown : []).flatMap((b: unknown) => {
    if (!b || typeof b !== 'object') return [];
    const o = b as Record<string, unknown>;
    const item = strOf(o.item).slice(0, 120);
    const letter = (strOf(o.letter) || item).charAt(0).toUpperCase();
    return item ? [{ letter, item }] : [];
  }).slice(0, MAX_ITEMS);
  // Each letter must really begin its item; otherwise the model is wrong about its own acronym.
  const bad = breakdown.find(b => b.item.replace(/^[^A-Za-z0-9]+/, '').charAt(0).toUpperCase() !== b.letter);
  if (bad) return { ok: false, error: `"${bad.letter}" does not start "${bad.item}"` };
  if (style === 'acronym') {
    if (breakdown.length < 2) return { ok: false, error: 'an acronym needs at least two letters in the breakdown' };
    const spelled = breakdown.map(b => b.letter).join('');
    const word = mnemonic.toUpperCase().replace(/[^A-Z]/g, '');
    if (!word.includes(spelled) && !mnemonic.split(/\s+/).map(w => w.charAt(0).toUpperCase()).join('').includes(spelled)) {
      return { ok: false, error: `the letters ${spelled} are not in the mnemonic "${mnemonic}"` };
    }
  }
  return { ok: true, data: { mnemonic, explanation: strOf(d.explanation).slice(0, 1200), breakdown } };
}

/** What is stored in flashcards.explanation: the explanation, then the letter-by-letter key. */
export function composeExplanation(m: Mnemonic): string {
  const key = m.breakdown.map(b => `${b.letter} = ${b.item}`).join('\n');
  return [m.explanation, key].filter(Boolean).join('\n\n');
}
