/**
 * Reading the learner's whole materials for quizzes, exams, study tools and Ask AI.
 * The documents table keeps a 12,000-character preview in `content` and the full text in `chunks`; these helpers
 * read the full text and pick the parts that fit the prompt: the parts that match a topic or question, or an even
 * sample across everything when there is no topic. Pure functions, no network.
 */
import { chunkSources, documentText, selectChunks, formatContext, type Chunk, type Source } from '@/lib/course-builder';

export interface RawDoc { name?: string | null; content?: string | null; chunks?: unknown }
/** Columns to select from `documents` to get the full text. */
export const DOC_COLUMNS = 'name, content, chunks';
const MAX_DOCS = 30;

export function materialSources(docs: RawDoc[] | null | undefined): Source[] {
  return (docs || []).slice(0, MAX_DOCS).map((d, i) => ({ name: (d.name || `Material ${i + 1}`).toString(), content: documentText(d) })).filter(s => s.content.trim());
}

/** The pieces picked from each equal slice of all the text, at a random place in the slice, so every part of the material can appear and repeated quizzes do not always use the same parts. */
export function spreadChunks(sources: Source[], budget: number, random: () => number = Math.random): Chunk[] {
  const chunks = chunkSources(sources); if (!chunks.length) return [];
  const total = chunks.reduce((n, c) => n + c.text.length, 0);
  if (total <= budget) return chunks;
  const avg = total / chunks.length; const want = Math.max(1, Math.floor(budget / avg));
  const step = chunks.length / want; const picked: Chunk[] = []; let used = 0;
  for (let k = 0; k < want; k++) { // one piece from each equal slice of the material, at a random place inside the slice
    const c = chunks[Math.min(chunks.length - 1, Math.floor((k + random()) * step))];
    if (picked.includes(c) || used + c.text.length > budget) continue; picked.push(c); used += c.text.length;
  }
  return picked.sort((a, b) => chunks.indexOf(a) - chunks.indexOf(b));
}
export function spreadContext(sources: Source[], budget: number, random: () => number = Math.random): string {
  const picked = spreadChunks(sources, budget, random); return picked.length ? formatContext(picked) : '';
}

/** The parts of the materials that match `query`; with a blank query, an even sample across everything. */
export function materialContext(sources: Source[], query: string, budget: number, random?: () => number): string {
  if (!sources.length) return '';
  return query.trim().length >= 3 ? formatContext(selectChunks(sources, query, budget)) : spreadContext(sources, budget, random);
}

/** Like materialContext but returns the pieces themselves, so a caller can check quotes against them and name the source. */
export function materialChunks(sources: Source[], query: string, budget: number, random?: () => number): Chunk[] {
  if (!sources.length) return [];
  return query.trim().length >= 3 ? selectChunks(sources, query, budget) : spreadChunks(sources, budget, random);
}
