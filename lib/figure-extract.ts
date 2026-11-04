/**
 * Finding figures inside a PDF, without any rendering: pure geometry that works on the operator list pdf.js gives us.
 * The browser then renders only the boxes found here. Everything in this file is testable without a browser.
 *
 * Boxes are in "viewport" coordinates at scale 1 (points, origin top-left, y down), the same space as pdf.js text positions
 * once they are passed through the viewport transform.
 */
export interface Box { x0: number; y0: number; x1: number; y1: number }
export type Matrix = [number, number, number, number, number, number];
export interface FoundImage { box: Box; pxW: number; pxH: number; name: string }
export interface Ops { save: number; restore: number; transform: number; paintImageXObject: number; paintInlineImageXObject: number; paintFormXObjectBegin: number; paintFormXObjectEnd: number }

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** PDF matrix product: apply `m` first, then `n` (CTM' = m x CTM). */
export const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
export const applyPoint = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isMatrix = (v: unknown): v is Matrix => Array.isArray(v) && v.length === 6 && v.every(isNum);

/** Every image the page paints, with where it lands on the page. `view` is the viewport transform at scale 1. */
export function collectImageBoxes(opList: { fnArray: ArrayLike<number>; argsArray: ArrayLike<any> }, ops: Ops, view: Matrix = IDENTITY): FoundImage[] {
  const out: FoundImage[] = []; const stack: Matrix[] = []; let ctm: Matrix = view;
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]; const args = opList.argsArray[i];
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) { if (stack.length) ctm = stack.pop()!; }
    else if (fn === ops.transform) { if (isMatrix(args)) ctm = mul(args, ctm); }
    else if (fn === ops.paintFormXObjectBegin) { stack.push(ctm); if (isMatrix(args?.[0])) ctm = mul(args[0], ctm); }
    else if (fn === ops.paintFormXObjectEnd) { if (stack.length) ctm = stack.pop()!; }
    else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject) {
      const pxW = isNum(args?.[1]) ? args[1] : isNum(args?.[0]?.width) ? args[0].width : 0;
      const pxH = isNum(args?.[2]) ? args[2] : isNum(args?.[0]?.height) ? args[0].height : 0;
      const pts = [applyPoint(ctm, 0, 0), applyPoint(ctm, 1, 0), applyPoint(ctm, 0, 1), applyPoint(ctm, 1, 1)];
      const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1]);
      const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      if ([box.x0, box.y0, box.x1, box.y1].every(isNum)) out.push({ box, pxW, pxH, name: typeof args?.[0] === 'string' ? args[0] : `inline${i}` });
    }
  }
  return out;
}

export const widthOf = (b: Box) => b.x1 - b.x0; export const heightOf = (b: Box) => b.y1 - b.y0; const areaOf = (b: Box) => Math.max(0, widthOf(b)) * Math.max(0, heightOf(b));
const gap = (a: Box, b: Box) => Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1), Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/** A figure made of several pieces (tiles, a picture plus overlays) becomes one box. */
export function mergeBoxes(boxes: Box[], maxGap = 12): Box[] {
  let list = boxes.map(b => ({ ...b })); let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (gap(list[i], list[j]) <= maxGap) { list[i] = union(list[i], list[j]); list.splice(j, 1); changed = true; break outer; }
    }
  }
  return list;
}

export interface FilterRules { pageW: number; pageH: number; minPts?: number; minPixels?: number; minAreaShare?: number; maxAreaShare?: number; maxAspect?: number }
/** Keeps pictures that look like figures: big enough, not a logo or rule, not a whole scanned page. */
export function looksLikeFigure(img: FoundImage, r: FilterRules): boolean {
  const w = widthOf(img.box), h = heightOf(img.box); if (w <= 0 || h <= 0) return false;
  const share = areaOf(img.box) / (r.pageW * r.pageH);
  if (w < (r.minPts ?? 60) || h < (r.minPts ?? 60)) return false;
  if (img.pxW && img.pxH && (img.pxW < (r.minPixels ?? 120) || img.pxH < (r.minPixels ?? 120))) return false;
  if (share < (r.minAreaShare ?? 0.03) || share > (r.maxAreaShare ?? 0.85)) return false; // a page-sized picture is a scan, not a figure
  if (Math.max(w / h, h / w) > (r.maxAspect ?? 6)) return false;
  return true;
}

export interface TextItem { str: string; x: number; y: number; w: number; h: number }
/** pdf.js text items (PDF space) moved into viewport space. `y` is the top edge. */
export function textItems(items: { str?: string; transform?: number[]; width?: number; height?: number }[], view: Matrix): TextItem[] {
  const out: TextItem[] = [];
  for (const it of items) {
    if (typeof it.str !== 'string' || !it.str.trim() || !isMatrix(it.transform)) continue;
    const [x, y] = applyPoint(view, it.transform[4], it.transform[5]); const h = Math.abs(it.height || it.transform[3] || 10) || 10;
    out.push({ str: it.str, x, y: y - h, w: it.width || 0, h });
  }
  return out;
}

const CAPTION = /^\s*(fig(?:ure|\.)?|diagram|plate|chart|scheme|illustration|image|photo|table)\b/i;
/** The caption printed near a figure ("Figure 3.2 The nephron ..."), or '' when none is found. */
export function captionFor(box: Box, items: TextItem[], reach = 60): string {
  const near = items.filter(t => t.x + t.w >= box.x0 - 4 && t.x <= box.x1 + 4 && ((t.y >= box.y1 - 4 && t.y <= box.y1 + reach) || (t.y + t.h <= box.y0 + 4 && t.y + t.h >= box.y0 - 40)));
  const lines: { y: number; text: string }[] = [];
  for (const t of near.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find(l => Math.abs(l.y - t.y) < t.h * 0.6);
    if (line) line.text += ` ${t.str.trim()}`; else lines.push({ y: t.y, text: t.str.trim() });
  }
  const start = lines.findIndex(l => CAPTION.test(l.text)); if (start < 0) return '';
  const picked = [lines[start].text];
  for (let i = start + 1; i < lines.length && picked.length < 3; i++) { if (CAPTION.test(lines[i].text) || lines[i].y - lines[i - 1].y > 18) break; picked.push(lines[i].text); }
  return picked.join(' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** The same small picture on many pages (a logo, a header) is not a figure. Returns the names to ignore. */
export function repeatedNames(perPage: FoundImage[][], minPages = 3): Set<string> {
  const pages = new Map<string, Set<number>>();
  perPage.forEach((imgs, p) => imgs.forEach(i => { if (!pages.has(i.name)) pages.set(i.name, new Set()); pages.get(i.name)!.add(p); }));
  return new Set([...pages].filter(([, s]) => s.size >= minPages).map(([n]) => n));
}

/** The box to draw, a little larger than the picture, kept inside the page. */
export function padBox(b: Box, pageW: number, pageH: number, pad = 6): Box {
  return { x0: Math.max(0, b.x0 - pad), y0: Math.max(0, b.y0 - pad), x1: Math.min(pageW, b.x1 + pad), y1: Math.min(pageH, b.y1 + pad) };
}
