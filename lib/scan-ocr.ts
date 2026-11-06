/**
 * Scanned PDFs have pictures of pages and no text, so the server's PDF reader finds nothing. These pure helpers decide
 * whether a PDF is scanned and turn per-page OCR results into text with "[Page N]" marks (the same marks normal PDFs
 * get). Rendering pages and running OCR happen in the browser (lib/scan-browser.ts); here they are injected, so this
 * file has no browser or network code and is tested directly.
 */

/** A page counts as "has text" with at least this many characters. */
export const MIN_TEXT_CHARS = 40;
/** How many pages are looked at to decide. */
export const SAMPLE_PAGES = 6;
/** Pages read by OCR per file (the rest are left out, and the learner is told). */
export const MAX_OCR_PAGES = 120;
/** OCR results below this confidence (0-100) are treated as unreadable. */
export const MIN_CONFIDENCE = 35;

/** Which pages to sample: spread across the document, always including the first and the last. */
export function samplePages(numPages: number, n = SAMPLE_PAGES): number[] {
  if (numPages <= 0) return [];
  if (numPages <= n) return Array.from({ length: numPages }, (_, i) => i + 1);
  return Array.from(new Set(Array.from({ length: n }, (_, i) => 1 + Math.round((i * (numPages - 1)) / (n - 1)))));
}

/** Scanned when most sampled pages have almost no text. A few title pages or blank pages do not make a normal PDF "scanned". */
export function looksScanned(charsPerSampledPage: number[]): boolean {
  if (!charsPerSampledPage.length) return false;
  const empty = charsPerSampledPage.filter(c => c < MIN_TEXT_CHARS).length;
  return empty / charsPerSampledPage.length >= 0.6;
}

export interface OcrPage { page: number; text: string; confidence: number }

export const cleanOcrText = (t: string) => t.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** Text with a "[Page N]" line before each page that was readable. */
export function assemble(pages: OcrPage[]): { text: string; readable: number; unreadable: number } {
  const parts: string[] = []; let unreadable = 0;
  for (const p of pages) {
    const t = cleanOcrText(p.text);
    if (t.length < MIN_TEXT_CHARS || p.confidence < MIN_CONFIDENCE) { unreadable++; continue; }
    parts.push(`[Page ${p.page}]\n${t}`);
  }
  return { text: parts.join('\n\n'), readable: parts.length, unreadable };
}

export interface OcrRun {
  numPages: number;
  /** Draws one page (1-based) and returns whatever the recognizer accepts. */
  render: (page: number) => Promise<unknown>;
  recognize: (image: unknown) => Promise<{ text: string; confidence: number }>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  maxPages?: number;
}
export interface OcrResult { text: string; pagesRead: number; pagesTotal: number; readable: number; unreadable: number; cutShort: boolean; cancelled: boolean }

/** Reads pages one after another (one at a time keeps phone memory low). Stops early when cancelled and keeps what was read. */
export async function ocrPages(run: OcrRun): Promise<OcrResult> {
  const total = Math.min(run.numPages, run.maxPages ?? MAX_OCR_PAGES); const done: OcrPage[] = []; let cancelled = false;
  for (let p = 1; p <= total; p++) {
    if (run.signal?.aborted) { cancelled = true; break; }
    run.onProgress?.(p - 1, total);
    try { const r = await run.recognize(await run.render(p)); done.push({ page: p, text: r.text || '', confidence: r.confidence ?? 0 }); }
    catch { done.push({ page: p, text: '', confidence: 0 }); } // one bad page must not lose the rest
  }
  run.onProgress?.(done.length, total);
  const { text, readable, unreadable } = assemble(done);
  return { text, pagesRead: done.length, pagesTotal: run.numPages, readable, unreadable, cutShort: run.numPages > total, cancelled };
}

/** A sentence the learner can read about what happened. */
export function ocrNote(r: OcrResult): string {
  const bits: string[] = [];
  if (r.cutShort) bits.push(`only the first ${r.pagesRead} of ${r.pagesTotal} pages were read`);
  if (r.cancelled) bits.push(`you stopped after ${r.pagesRead} pages`);
  if (r.unreadable) bits.push(`${r.unreadable} page${r.unreadable === 1 ? ' was' : 's were'} too blurry or empty to read`);
  return bits.length ? `Scanned pages were read by text recognition: ${bits.join('; ')}. Check important formulas and numbers against the original.` : 'Scanned pages were read by text recognition. Check important formulas and numbers against the original.';
}
