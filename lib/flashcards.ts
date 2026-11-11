/**
 * Flashcards: question cards made from the learner's own material, checked against it, plus spaced review.
 * Pure functions so every rule can be tested without a model or a database.
 *
 * Accuracy rule for question cards: the model must copy a short quote from the notes that supports each answer. A card is
 * kept only if that quote really appears in the excerpts we gave it. Cards whose quote cannot be found are dropped.
 */
import type { Chunk } from '@/lib/course-builder';

export interface QaCard { front: string; back: string; quote: string }
export interface VerifiedCard extends QaCard { source: string }
export const MIN_QUOTE_CHARS = 15;
export const MAX_QA_CARDS = 12;
export const BEYOND_NOTES = 'Beyond your notes:';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
/** Lower-case letters and digits only, single spaces. Ignores punctuation, line breaks, hyphenation marks and case. */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\[page \d+\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Where a quote comes from: the file, and the page when the text carries `[Page N]` markers. null if it is not in any excerpt. */
export function locateQuote(chunks: Chunk[], quote: string): { source: string; page?: number } | null {
  const q = normalizeText(quote);
  if (q.length < MIN_QUOTE_CHARS) return null;
  for (const c of chunks) {
    const hay = normalizeText(c.text);
    const at = hay.indexOf(q);
    if (at < 0) continue;
    // The page is the last [Page N] marker that comes before the start of the quote.
    let page: number | undefined;
    for (const m of c.text.matchAll(/\[Page (\d+)\]/g)) {
      if (normalizeText(c.text.slice(0, m.index! + m[0].length)).length <= at) page = Number(m[1]); else break;
    }
    return { source: c.source, page };
  }
  return null;
}

export function sourceLabel(loc: { source: string; page?: number }): string { return loc.page ? `${loc.source}, page ${loc.page}` : loc.source; }

/** Accepts the model's answer: { cards: [{ front, back, quote }] }. Drops incomplete and repeated questions. */
export function validateQa(data: unknown): { ok: true; cards: QaCard[] } | { ok: false; error: string } {
  const list = data && typeof data === 'object' ? (Array.isArray(data) ? data : (data as any).cards) : null;
  if (!Array.isArray(list)) return { ok: false, error: 'expected { cards: [{ front, back, quote }] }' };
  const seen = new Set<string>(); const cards: QaCard[] = [];
  for (const c of list) {
    const front = str(c?.front).slice(0, 240), back = str(c?.back).slice(0, 500), quote = str(c?.quote).slice(0, 400);
    const key = normalizeText(front);
    if (!front || !back || !quote || seen.has(key)) continue;
    seen.add(key); cards.push({ front, back, quote });
  }
  return cards.length ? { ok: true, cards: cards.slice(0, MAX_QA_CARDS) } : { ok: false, error: 'no complete cards (each needs front, back and quote)' };
}

/** Keeps only the cards whose quote is really in the excerpts. */
export function verifyQa(cards: QaCard[], chunks: Chunk[]): { kept: VerifiedCard[]; dropped: number } {
  const kept: VerifiedCard[] = [];
  for (const c of cards) { const loc = locateQuote(chunks, c.quote); if (loc) kept.push({ ...c, source: sourceLabel(loc) }); }
  return { kept, dropped: cards.length - kept.length };
}

export function buildQaPrompt(i: { topic: string; count: number; excerpts: string }): string {
  const n = Math.max(1, Math.min(MAX_QA_CARDS, Math.round(i.count)));
  return `Write up to ${n} study flashcards from the learner's notes below${i.topic.trim() ? `, about: "${i.topic.trim()}"` : ', covering the most important ideas'}.

Rules:
- Use ONLY facts stated in the notes. Do not add outside knowledge.
- "front" is one clear question or prompt that has one correct answer. Avoid yes/no questions.
- "back" is the answer, short (one to three sentences), correct according to the notes.
- "quote" is a short passage (8 to 30 words) copied EXACTLY, word for word, from the notes, that proves the answer. Do not rewrite it.
- No two cards may ask the same thing. Skip anything the notes do not state clearly.

Notes:
${i.excerpts}

Return JSON only:
{"cards": [{"front": string, "back": string, "quote": string}]}`;
}

/** What is stored in flashcards.explanation for a question card: the answer, then the source line. */
export function composeBack(c: { back: string; source: string }): string { return `${c.back}\n\nSource: ${c.source}`; }
/** Splits a stored back into the answer and its source (if any). */
export function splitSource(text: string): { body: string; source: string | null } {
  const m = /\n\s*\n?Source: ([^\n]+)\s*$/.exec(text || '');
  return m ? { body: (text || '').slice(0, m.index).trim(), source: m[1].trim() } : { body: (text || '').trim(), source: null };
}
export const isQaCard = (card: { style?: string | null }) => card.style === 'qa';
/** A mnemonic whose explanation says it goes beyond the notes should be shown with a "check this" label. */
export const isBeyondNotes = (text: string) => (text || '').trim().toLowerCase().startsWith(BEYOND_NOTES.toLowerCase());

/** When the learner listed items, the breakdown must be exactly those items, in order. Returns an error text or null. */
export function itemsMismatch(breakdown: { item: string }[], items: string[]): string | null {
  if (!items.length) return null;
  if (breakdown.length !== items.length) return `the breakdown has ${breakdown.length} items but the learner listed ${items.length}`;
  for (let i = 0; i < items.length; i++) {
    const a = normalizeText(breakdown[i].item), b = normalizeText(items[i]);
    if (a !== b && !a.includes(b) && !b.includes(a)) return `item ${i + 1} should be "${items[i]}" but is "${breakdown[i].item}"`;
  }
  return null;
}

// ── Spaced review (a simple Leitner ladder that uses the existing review_count and next_review_at columns) ──
export type Rating = 'again' | 'good' | 'easy';
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60];
export interface ReviewState { review_count: number; next_review_at: string }

export function reviewResult(count: number, rating: Rating, now = new Date()): ReviewState {
  const next = rating === 'again' ? 0 : Math.min(INTERVAL_DAYS.length - 1, Math.max(0, count) + (rating === 'easy' ? 2 : 1));
  const due = rating === 'again' ? new Date(now.getTime() + 10 * 60_000) : new Date(now.getTime() + INTERVAL_DAYS[next] * 86_400_000);
  return { review_count: next, next_review_at: due.toISOString() };
}
export const isDue = (c: { next_review_at?: string | null }, now = new Date()) => !c.next_review_at || new Date(c.next_review_at).getTime() <= now.getTime();
/** Cards due now, most overdue first. */
export function dueCards<T extends { next_review_at?: string | null }>(cards: T[], now = new Date()): T[] {
  return cards.filter(c => isDue(c, now)).sort((a, b) => new Date(a.next_review_at || 0).getTime() - new Date(b.next_review_at || 0).getTime());
}
export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** The cards to go through in one sitting: those due now (most overdue first), or all of them shuffled. */
export function buildQueue<T extends { next_review_at?: string | null }>(cards: T[], mode: 'due' | 'all', now = new Date(), random: () => number = Math.random): T[] {
  return mode === 'due' ? dueCards(cards, now) : shuffled(cards, random);
}
