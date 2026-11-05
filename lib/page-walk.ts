/**
 * "Page by page" courses: the outline comes straight from the page numbers in the learner's own PDF, not from the model,
 * so every page belongs to exactly one lesson, in order, and none can be skipped.
 * Pure functions (no React, no network). PDFs uploaded since phase4h carry "[Page N]" marks; older files and notes do not.
 */
import type { Outline, OutlineLesson, OutlineModule, Source } from '@/lib/course-builder';

export interface PageText { page: number; text: string }
export interface PageRange { source: string; from: number; to: number }

const MARK = /^\[Page (\d{1,5})\]\s*$/gm;

/** The pages of one text, or [] when it has no page marks. */
export function splitPages(text: string): PageText[] {
  const out: PageText[] = []; const marks = [...String(text || '').matchAll(MARK)];
  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length; const end = i + 1 < marks.length ? marks[i + 1].index ?? text.length : text.length;
    out.push({ page: Number(m[1]), text: text.slice(start, end).trim() });
  });
  return out;
}
export const pageSources = (sources: Source[]) => sources.filter(s => splitPages(s.content).length > 0);
export const hasPageMarks = (sources: Source[]) => pageSources(sources).length > 0;

const label = (from: number, to: number) => (from === to ? `Page ${from}` : `Pages ${from}-${to}`);

export interface WalkOptions { maxPages?: number; maxChars?: number; lessonsPerModule?: number }
/** Group pages into lessons of up to a few pages (fewer when the pages are dense), and lessons into modules. null when no source has page marks. */
export function planPageWalk(sources: Source[], topic: string, o: WalkOptions = {}): Outline | null {
  const maxPages = o.maxPages ?? 3; const maxChars = o.maxChars ?? 5_500; const per = o.lessonsPerModule ?? 4;
  const withPages = pageSources(sources); if (!withPages.length) return null;
  const modules: OutlineModule[] = []; let lessonTotal = 0;
  for (const s of withPages) {
    const pages = splitPages(s.content); const lessons: (OutlineLesson & { pages: PageRange })[] = [];
    let from = pages[0].page; let to = from; let chars = 0; let count = 0;
    const flush = () => { if (count) lessons.push({ title: label(from, to), objective: `Explain ${s.name}, ${label(from, to).toLowerCase()}, one page at a time.`, pages: { source: s.name, from, to } }); };
    for (const p of pages) {
      if (count && (count >= maxPages || chars + p.text.length > maxChars)) { flush(); from = p.page; chars = 0; count = 0; }
      to = p.page; chars += p.text.length; count++;
    }
    flush();
    for (let i = 0; i < lessons.length; i += per) {
      const group = lessons.slice(i, i + per); const a = group[0].pages.from; const b = group[group.length - 1].pages.to;
      modules.push({ title: `${withPages.length > 1 ? `${s.name}: ` : ''}${label(a, b)}`, summary: `${s.name}, ${label(a, b).toLowerCase()}.`, lessons: group });
    }
    lessonTotal += lessons.length;
  }
  return { title: `${topic}: page by page`, description: 'Your material explained in order, page by page, with examples.', estimated_duration: `About ${lessonTotal * 10} minutes`, modules };
}

/** The text of the given page ranges, with the "[Page N]" marks kept so the lesson can cite them. */
export function pageContext(sources: Source[], ranges: PageRange[], budget = 14_000): string {
  const parts: string[] = []; const per = Math.max(2_000, Math.floor(budget / Math.max(1, ranges.length)));
  for (const r of ranges) {
    const s = sources.find(x => x.name === r.source); if (!s) continue;
    const body = splitPages(s.content).filter(p => p.page >= r.from && p.page <= r.to).map(p => `[Page ${p.page}]\n${p.text || '(no text on this page; it may hold only a picture)'}`).join('\n\n');
    parts.push(`[MATERIAL: ${r.source}]\n${body.slice(0, per)}`);
  }
  return parts.join('\n\n');
}

export const pagesOfLesson = (l: { pages?: PageRange } | null | undefined): PageRange | null => (l?.pages && Number.isFinite(l.pages.from) && Number.isFinite(l.pages.to) ? l.pages : null);
