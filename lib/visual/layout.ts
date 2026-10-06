/**
 * Pure layout maths for the SVG diagrams. No React, so it is unit-testable.
 *
 * Key property for anatomy: layout is ORDER-PRESERVING. If the spec says A is
 * above B, A is never drawn below B, so a diagram can't visually contradict
 * its own spatial relationships.
 */
import { orderedElements, type VisualSpec } from './schema';

export const VIEW_W = 360;

/** Map sorted unique values to at most `max` buckets, preserving order. */
export function bucket(values: number[], max: number): Map<number, number> {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  const out = new Map<number, number>();
  uniq.forEach((v, i) => out.set(v, uniq.length <= max ? i : Math.min(max - 1, Math.floor((i * max) / uniq.length))));
  return out;
}

export interface GridNode { id: string; col: number; row: number }
export interface GridLayout { nodes: GridNode[]; cols: number; rows: number }

export function anatomyGrid(spec: VisualSpec, maxCols = 3): GridLayout {
  const els = spec.elements;
  const allPos = els.length > 0 && els.every(e => e.pos);
  const cells = new Map<string, GridNode>();
  const taken = new Set<string>();
  const place = (id: string, col: number, row: number) => {
    let r = row;
    while (taken.has(`${col},${r}`)) r++;
    taken.add(`${col},${r}`);
    cells.set(id, { id, col, row: r });
  };

  if (allPos) {
    const cx = bucket(els.map(e => e.pos!.x), maxCols);
    const cy = bucket(els.map(e => e.pos!.y), 7);
    [...els]
      .sort((a, b) => cy.get(a.pos!.y)! - cy.get(b.pos!.y)! || a.pos!.y - b.pos!.y || a.pos!.x - b.pos!.x)
      .forEach(e => place(e.id, cx.get(e.pos!.x)!, cy.get(e.pos!.y)!));
  } else {
    const cols = Math.min(maxCols, 2);
    orderedElements(spec).forEach((e, i) => place(e.id, i % cols, Math.floor(i / cols)));
  }
  const nodes = [...cells.values()];
  return { nodes, cols: Math.max(...nodes.map(n => n.col)) + 1, rows: Math.max(...nodes.map(n => n.row)) + 1 };
}

export interface Box { id: string; x: number; y: number; w: number; h: number }

export function gridBoxes(layout: GridLayout, opts: { padX?: number; padTop?: number; gap?: number; rowH?: number; nodeH?: number } = {}): { boxes: Box[]; height: number } {
  const { padX = 16, padTop = 34, gap = 12, rowH = 76, nodeH = 52 } = opts;
  const w = Math.min(160, (VIEW_W - padX * 2 - gap * (layout.cols - 1)) / layout.cols);
  const total = w * layout.cols + gap * (layout.cols - 1);
  const left = (VIEW_W - total) / 2;
  const boxes = layout.nodes.map(n => ({ id: n.id, x: left + n.col * (w + gap), y: padTop + n.row * rowH, w, h: nodeH }));
  return { boxes, height: padTop * 2 + (layout.rows - 1) * rowH + nodeH - 8 };
}

/** Split a label into at most `lines` lines of roughly `maxChars` characters. */
export function wrapLabel(label: string, maxChars: number, lines = 2): string[] {
  const words = label.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const head = out.slice(0, lines - 1);
    const tail = out.slice(lines - 1).join(' ');
    return [...head, tail.length > maxChars ? tail.slice(0, maxChars - 1) + '…' : tail];
  }
  return out;
}

// ── Molecules ───────────────────────────────────────────────────────────────

export interface Point { id: string; x: number; y: number }

export function moleculeLayout(spec: VisualSpec): { points: Point[]; height: number } {
  const els = spec.elements;
  const allPos = els.every(e => e.pos);
  const pad = 36;
  if (allPos && els.length) {
    const xs = els.map(e => e.pos!.x); const ys = els.map(e => e.pos!.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const s = Math.min(72, (VIEW_W - pad * 2) / Math.max(1, maxX - minX), 460 / Math.max(1, maxY - minY));
    const w = (maxX - minX) * s;
    const points = els.map(e => ({ id: e.id, x: (VIEW_W - w) / 2 + (e.pos!.x - minX) * s, y: pad + (e.pos!.y - minY) * s }));
    return { points, height: pad * 2 + (maxY - minY) * s };
  }
  // No coordinates: breadth-first layers from the first element, along bond/relationship edges.
  const adj = new Map<string, string[]>(els.map(e => [e.id, []]));
  for (const r of spec.relationships) { adj.get(r.from)?.push(r.to); adj.get(r.to)?.push(r.from); }
  const depth = new Map<string, number>();
  for (const root of orderedElements(spec).map(e => e.id)) {
    if (depth.has(root)) continue;
    depth.set(root, [...depth.values()].reduce((a, b) => Math.max(a, b), -1) + 1);
    const q = [root];
    while (q.length) {
      const cur = q.shift()!;
      for (const nx of adj.get(cur) ?? []) if (!depth.has(nx)) { depth.set(nx, depth.get(cur)! + 1); q.push(nx); }
    }
  }
  const layers = new Map<number, string[]>();
  for (const e of els) layers.set(depth.get(e.id)!, [...(layers.get(depth.get(e.id)!) ?? []), e.id]);
  const rowH = 84;
  const points: Point[] = [];
  [...layers.entries()].sort((a, b) => a[0] - b[0]).forEach(([d, ids], row) => {
    ids.forEach((id, i) => points.push({ id, x: ((i + 1) * VIEW_W) / (ids.length + 1), y: pad + row * rowH }));
    void d;
  });
  return { points, height: pad * 2 + (layers.size - 1) * rowH };
}

// ── Hierarchy ───────────────────────────────────────────────────────────────

export function hierarchyDepths(spec: VisualSpec): { depth: Map<string, number>; isTree: boolean } {
  const parent = new Map<string, string>();
  for (const r of spec.relationships) {
    if (r.relation === 'gives_rise_to' || r.relation === 'contains') parent.set(r.to, r.from);
    else if (r.relation === 'part_of') parent.set(r.from, r.to);
  }
  const depth = new Map<string, number>();
  const resolve = (id: string, guard = 0): number => {
    if (depth.has(id)) return depth.get(id)!;
    const p = parent.get(id);
    const d = p && guard < 12 ? resolve(p, guard + 1) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  spec.elements.forEach(e => resolve(e.id));
  return { depth, isTree: parent.size > 0 };
}
