/**
 * Browser-only: finds figures in a file the learner picks and turns each into a small WebP.
 * The geometry lives in lib/figure-extract.ts (tested). This file only draws and converts, so it is not unit-tested
 * and must be checked in a real browser.
 */
import { collectImageBoxes, looksLikeFigure, mergeBoxes, captionFor, padBox, repeatedNames, textItems, widthOf, heightOf, type Box, type FoundImage, type Matrix, type Ops } from '@/lib/figure-extract';
import { MAX_FIGURE_BYTES } from '@/lib/figures';

export interface Candidate { key: string; blob: Blob; url: string; page: number | null; caption: string; source: string; bytes: number }

const MAX_PAGES = 150;          // keeps a huge textbook from freezing a phone
const MAX_CANDIDATES = 60;
const MAX_SIDE = 1100;          // longest side of a saved picture, in pixels

async function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/webp', q));
    if (blob && blob.type === 'image/webp' && blob.size <= MAX_FIGURE_BYTES) return blob;
    if (blob && blob.type !== 'image/webp') break; // browser has no WebP encoder; fall through to PNG/JPEG below
  }
  for (const q of [0.8, 0.6, 0.45]) {
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= MAX_FIGURE_BYTES) return blob;
  }
  return null;
}

/** Draw an image source scaled down to MAX_SIDE and encode it small enough to keep. */
async function shrink(src: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  for (const side of [MAX_SIDE, 800, 600]) {
    const k = Math.min(1, side / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext('2d'); if (!ctx) return null;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0, c.width, c.height);
    const b = await canvasToWebp(c); if (b) return b;
  }
  return null;
}

function make(blob: Blob, source: string, page: number | null, caption: string, i: number): Candidate {
  return { key: `${source}:${page ?? 0}:${i}`, blob, url: URL.createObjectURL(blob), page, caption, source, bytes: blob.size };
}

export function releaseCandidates(list: Candidate[]) { for (const c of list) URL.revokeObjectURL(c.url); }

async function fromImageBlob(file: Blob, source: string, page: number | null, i: number, minPx = 0): Promise<Candidate | null> {
  let bmp: ImageBitmap; try { bmp = await createImageBitmap(file); } catch { return null; }
  if (minPx && (bmp.width < minPx || bmp.height < minPx)) { bmp.close(); return null; }
  const blob = await shrink(bmp, bmp.width, bmp.height); bmp.close();
  return blob ? make(blob, source, page, '', i) : null;
}

async function fromPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<Candidate[]> {
  const pdfjs: any = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const O = pdfjs.OPS;
  const ops: Ops = { save: O.save, restore: O.restore, transform: O.transform, paintImageXObject: O.paintImageXObject, paintInlineImageXObject: O.paintInlineImageXObject, paintFormXObjectBegin: O.paintFormXObjectBegin, paintFormXObjectEnd: O.paintFormXObjectEnd };
  const total = Math.min(doc.numPages, MAX_PAGES);
  const perPage: { found: FoundImage[]; w: number; h: number; view: Matrix }[] = [];
  for (let p = 1; p <= total; p++) {
    const page = await doc.getPage(p); const vp = page.getViewport({ scale: 1 });
    const found = collectImageBoxes(await page.getOperatorList(), ops, vp.transform as Matrix);
    perPage.push({ found, w: vp.width, h: vp.height, view: vp.transform as Matrix }); page.cleanup?.();
    onProgress?.(p, total * 2);
  }
  const repeated = repeatedNames(perPage.map(x => x.found));
  const out: Candidate[] = [];
  for (let p = 1; p <= total && out.length < MAX_CANDIDATES; p++) {
    onProgress?.(total + p, total * 2);
    const { found, w, h, view } = perPage[p - 1];
    const boxes = mergeBoxes(found.filter(f => !repeated.has(f.name) && looksLikeFigure(f, { pageW: w, pageH: h })).map(f => f.box));
    const kept = boxes.filter(b => widthOf(b) >= 60 && heightOf(b) >= 60);
    if (!kept.length) continue;
    const page = await doc.getPage(p);
    const text = textItems((await page.getTextContent()).items as any[], view);
    const scale = 2; const vp = page.getViewport({ scale });
    const full = document.createElement('canvas'); full.width = Math.ceil(vp.width); full.height = Math.ceil(vp.height);
    await page.render({ canvasContext: full.getContext('2d')!, viewport: vp }).promise;
    let i = 0;
    for (const b of kept) {
      if (out.length >= MAX_CANDIDATES) break;
      const pb: Box = padBox(b, w, h);
      const sx = Math.floor(pb.x0 * scale), sy = Math.floor(pb.y0 * scale), sw = Math.ceil((pb.x1 - pb.x0) * scale), sh = Math.ceil((pb.y1 - pb.y0) * scale);
      if (sw < 10 || sh < 10) continue;
      const crop = document.createElement('canvas'); crop.width = sw; crop.height = sh;
      crop.getContext('2d')!.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await shrink(crop, sw, sh); crop.width = crop.height = 0;
      if (blob) out.push(make(blob, file.name, p, captionFor(b, text), i++));
    }
    full.width = full.height = 0; page.cleanup?.();
  }
  await doc.destroy?.();
  return out;
}

const ZIP_IMAGE = /\.(png|jpe?g|webp)$/i;
async function fromZipMedia(file: File, folder: string): Promise<Candidate[]> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files).filter(n => n.startsWith(folder) && ZIP_IMAGE.test(n) && !zip.files[n].dir).sort();
  const out: Candidate[] = []; const seen = new Set<string>();
  for (const [i, n] of names.entries()) {
    if (out.length >= MAX_CANDIDATES) break;
    const raw = await zip.files[n].async('blob'); if (raw.size < 4000) continue; // tiny pictures are icons and bullets
    const sig = `${raw.size}`; if (seen.has(sig)) continue; seen.add(sig);
    const type = n.toLowerCase().endsWith('.png') ? 'image/png' : n.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const c = await fromImageBlob(new Blob([raw], { type }), file.name, null, i, 150);
    if (c) out.push(c);
  }
  return out;
}

/** Find figure candidates in a PDF, PPTX, DOCX or picture. Nothing is uploaded here. */
export async function findFigures(file: File, onProgress?: (done: number, total: number) => void): Promise<Candidate[]> {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return fromPdf(file, onProgress);
  if (name.endsWith('.pptx')) return fromZipMedia(file, 'ppt/media/');
  if (name.endsWith('.docx')) return fromZipMedia(file, 'word/media/');
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name)) { const c = await fromImageBlob(file, file.name, null, 0); return c ? [c] : []; }
  return [];
}
