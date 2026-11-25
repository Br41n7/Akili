/**
 * Puts pictures from the learner's own files into the lesson section that explains them.
 * Pure text logic (no browser, no network) so it can be tested. A lesson cites its sources like "(Bio.pdf, page 12)".
 * A picture saved from page 12 of Bio.pdf is shown under the section that cites that page. A page with several pictures
 * hands them out in reading order to the sections that cite it, so each part of a multi-picture page lands beside the
 * paragraph about it. Pictures are whole images as found in the file: Akili does not cut one picture into pieces.
 */
export interface LessonFigure { id: string; source_name: string | null; page: number | null; caption: string | null; url: string | null; created_at?: string; explanation?: any }
export interface Section { heading: string; markdown: string; figures: LessonFigure[] }
export interface Placed { sections: Section[]; rest: LessonFigure[] }

export const MAX_PER_SECTION = 3;
export const MAX_PER_LESSON = 8;
export const MAX_SPAN = 6; // "pages 3-40" is not expanded into 38 pages

const EXT = 'pdf|docx?|pptx?|txt|png|jpe?g|webp';
const base = (n: string) => n.toLowerCase().replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]+/g, '');
export const sameFile = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return false; const x = base(a), y = base(b); return !!x && x === y;
};

/** Splits markdown at headings. Code fences are never split. Empty pieces are dropped. */
export function splitSections(md: string): { heading: string; markdown: string }[] {
  const out: { heading: string; lines: string[] }[] = [{ heading: '', lines: [] }]; let fence = false;
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && /^#{1,4}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) out.push({ heading: h[1].replace(/[*_`]/g, '').trim(), lines: [line] }); else out[out.length - 1].lines.push(line);
  }
  return out.map(s => ({ heading: s.heading, markdown: s.lines.join('\n') })).filter(s => s.markdown.trim());
}

const PIECE = new RegExp(`^\\s*(.+?\\.(?:${EXT}))\\s*(?:,\\s*(?:pages?|pp?\\.)\\s*(\\d+(?:\\s*(?:[-–—,&]|and)\\s*\\d+)*))?\\s*$`, 'i');

/** Files and pages cited in round brackets like "(Bio.pdf, page 12)", "(Bio.pdf, pages 3-5)" or "(A.pdf, page 2; B.pptx)". */
export function citations(text: string): { file: string; pages: number[] }[] {
  const out: { file: string; pages: number[] }[] = [];
  for (const group of text.matchAll(/\(([^()\n]{3,200})\)/g)) {
    for (const piece of group[1].split(';')) {
      const m = PIECE.exec(piece); if (!m) continue;
      const pages: number[] = [];
      if (m[2]) {
        for (const part of m[2].split(/\s*(?:,|&|\band\b)\s*/i)) {
          const r = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(part.trim());
          if (r) { const x = +r[1], y = +r[2]; if (y >= x && y - x < MAX_SPAN) for (let n = x; n <= y; n++) pages.push(n); else pages.push(x); }
          else { const n = parseInt(part, 10); if (n > 0) pages.push(n); }
        }
      }
      out.push({ file: m[1].trim().replace(/^[*_`"'“”]+|[*_`"'“”]+$/g, ''), pages });
    }
  }
  return out;
}

export function placeFigures(markdown: string, figures: LessonFigure[]): Placed {
  const parts = splitSections(markdown);
  const sections: Section[] = parts.map(p => ({ ...p, figures: [] }));
  const usable = figures.filter(f => f.url).slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const used = new Set<string>(); let total = 0;
  const take = (sec: Section, f: LessonFigure) => { sec.figures.push(f); used.add(f.id); total++; };

  // pages first: hand out each page's pictures in reading order to the sections that cite that page
  const lastCiting = new Map<string, Section>(); // `file|page` -> last section citing it
  for (const sec of sections) {
    for (const c of citations(sec.markdown)) for (const pg of c.pages) {
      const queue = usable.filter(f => f.page === pg && sameFile(f.source_name, c.file) && !used.has(f.id));
      if (queue.length && sec.figures.length < MAX_PER_SECTION && total < MAX_PER_LESSON) take(sec, queue[0]);
      lastCiting.set(`${base(c.file)}|${pg}`, sec);
    }
  }
  // pictures of a cited page that nobody was handed (more pictures than citing sections) go with the last section citing it
  for (const [key, sec] of lastCiting) {
    const [b, pg] = key.split('|');
    for (const f of usable.filter(f => f.page === +pg && base(f.source_name || '') === b && !used.has(f.id))) {
      if (sec.figures.length < MAX_PER_SECTION && total < MAX_PER_LESSON) take(sec, f);
    }
  }
  // pictures with no page number (PowerPoint, Word, photos): shown after the lesson if the lesson cites that file
  const citedFiles = new Set(citations(markdown).map(c => base(c.file)));
  const rest: LessonFigure[] = [];
  for (const f of usable) {
    if (used.has(f.id) || f.page != null || !citedFiles.has(base(f.source_name || ''))) continue;
    if (rest.length < MAX_PER_SECTION && total < MAX_PER_LESSON) { rest.push(f); used.add(f.id); total++; }
  }
  return { sections, rest };
}

/** The line printed under a picture. */
export function figureCaption(f: Pick<LessonFigure, 'source_name' | 'page' | 'caption'>): string {
  const where = f.source_name ? `${f.source_name}${f.page ? `, page ${f.page}` : ''}` : '';
  return [where && `Figure from ${where}`, f.caption].filter(Boolean).join(' · ') || 'Figure from your materials';
}
