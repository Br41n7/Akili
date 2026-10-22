/** Mind map and knowledge graph: types, prompts, layout and export. Pure functions. */

export interface MindMap { title: string; center: string; branches: { label: string; note: string; children: { label: string; note: string }[] }[] }
export interface KnowledgeGraph { title: string; nodes: { id: string; label: string }[]; edges: { from: string; to: string; relation: string }[] }

export const MIND_LIMITS = { minBranches: 3, maxBranches: 8, maxChildren: 4 };
export const GRAPH_LIMITS = { minNodes: 4, maxNodes: 14, maxEdges: 28 };

const SOURCE = (context: string) => context
  ? `Base it only on this material:\n"""\n${context}\n"""`
  : 'No material was supplied; use the standard syllabus and leave out anything you are unsure of.';

export function buildMindMapPrompt(i: { topic: string; context: string }): string {
  return `Make a mind map${i.topic ? ` of "${i.topic}"` : ' of the main topics'}.
${SOURCE(i.context)}

Rules:
- "center" is the central idea (max 5 words).
- ${MIND_LIMITS.minBranches} to ${MIND_LIMITS.maxBranches} branches, each a main sub-topic (max 4 words), each with up to ${MIND_LIMITS.maxChildren} children (max 5 words each) and a one-line "note" that explains it.
- Labels are short noun phrases, not sentences. No duplicates.

Return JSON only:
{"title": string, "center": string, "branches": [{"label": string, "note": string, "children": [{"label": string, "note": string}]}]}`;
}

export function buildKnowledgeGraphPrompt(i: { topic: string; context: string }): string {
  return `Make a knowledge graph${i.topic ? ` of "${i.topic}"` : ' of the main concepts'}: concepts as nodes, and how they relate as labelled edges.
${SOURCE(i.context)}

Rules:
- ${GRAPH_LIMITS.minNodes} to ${GRAPH_LIMITS.maxNodes} nodes with short unique ids (n1, n2, ...) and labels of at most 4 words.
- Every node must have at least one edge. Edge "relation" is a short verb phrase such as "causes", "is part of", "requires", "produces", "is an example of".
- Edges go from the subject to the object, so the sentence "from relation to" is true. Use only facts you are sure of.

Return JSON only:
{"title": string, "nodes": [{"id": string, "label": string}], "edges": [{"from": string, "to": string, "relation": string}]}`;
}

// ── Plain-text export ────────────────────────────────────────────────────────
export function mindMapToMarkdown(m: MindMap): string {
  const out = [`# ${m.title}`, '', `**${m.center}**`, ''];
  for (const b of m.branches) {
    out.push(`- **${b.label}**${b.note ? `: ${b.note}` : ''}`);
    for (const c of b.children) out.push(`  - ${c.label}${c.note ? `: ${c.note}` : ''}`);
  }
  return out.join('\n') + '\n';
}

export function graphToMarkdown(g: KnowledgeGraph): string {
  const name = new Map(g.nodes.map(n => [n.id, n.label]));
  return [`# ${g.title}`, '', '## Concepts', ...g.nodes.map(n => `- ${n.label}`), '', '## Relationships', ...g.edges.map(e => `- ${name.get(e.from)} → *${e.relation}* → ${name.get(e.to)}`)].join('\n') + '\n';
}

// ── Layout ───────────────────────────────────────────────────────────────────
export interface Box { x: number; y: number; w: number; h: number; lines: string[] }
export interface MindLayout { width: number; height: number; center: Box; nodes: (Box & { level: 1 | 2; note: string; parent: number })[]; links: { from: { x: number; y: number }; to: { x: number; y: number } }[] }

/** Wrap to at most `maxLines` lines of about `max` characters, ending with an ellipsis if cut. */
export function wrapLabel(text: string, max = 16, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = []; let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = kept[maxLines - 1].slice(0, max - 1).replace(/\s+$/, '') + '…'; return kept; }
  return lines.map(l => (l.length > max + 4 ? l.slice(0, max + 3) + '…' : l));
}

const ROW = 56, PAD = 30, CENTER_W = 170, B_W = 150, C_W = 170, COL1 = 230, COL2 = 440;

/** Branches split over the two sides of the centre; every leaf gets its own row, so boxes never overlap. */
export function layoutMindMap(m: MindMap): MindLayout {
  const half = Math.ceil(m.branches.length / 2);
  const sides: { idx: number; dir: 1 | -1 }[][] = [
    m.branches.slice(0, half).map((_, i) => ({ idx: i, dir: 1 as const })),
    m.branches.slice(half).map((_, i) => ({ idx: half + i, dir: -1 as const })),
  ];
  const rows = (idx: number) => Math.max(1, m.branches[idx].children.length);
  const sideRows = sides.map(s => s.reduce((n, b) => n + rows(b.idx), 0));
  const height = Math.max(...sideRows, 2) * ROW + PAD * 2;
  const width = 2 * (COL2 + C_W / 2) + PAD * 2;
  const cx = width / 2, cy = height / 2;
  const nodes: MindLayout['nodes'] = []; const links: MindLayout['links'] = [];
  const center: Box = { x: cx - CENTER_W / 2, y: cy - 28, w: CENTER_W, h: 56, lines: wrapLabel(m.center, 18) };

  sides.forEach((side, si) => {
    let y = cy - (sideRows[si] * ROW) / 2;
    for (const { idx, dir } of side) {
      const b = m.branches[idx]; const n = rows(idx);
      const by = y + (n * ROW) / 2;
      const bx = cx + dir * COL1;
      const branchBox: Box = { x: bx - B_W / 2, y: by - 22, w: B_W, h: 44, lines: wrapLabel(b.label, 16) };
      const bi = nodes.push({ ...branchBox, level: 1, note: b.note, parent: -1 }) - 1;
      links.push({ from: { x: cx + dir * (CENTER_W / 2), y: cy }, to: { x: bx - dir * (B_W / 2), y: by } });
      b.children.forEach((c, ci) => {
        const cyy = y + ci * ROW + ROW / 2; const ccx = cx + dir * COL2;
        nodes.push({ x: ccx - C_W / 2, y: cyy - 20, w: C_W, h: 40, lines: wrapLabel(c.label, 19), level: 2, note: c.note, parent: bi });
        links.push({ from: { x: bx + dir * (B_W / 2), y: by }, to: { x: ccx - dir * (C_W / 2), y: cyy } });
      });
      y += n * ROW;
    }
  });
  return { width, height, center, nodes, links };
}

export interface GraphLayout { width: number; height: number; nodes: (Box & { id: string })[]; edges: { x1: number; y1: number; x2: number; y2: number; mx: number; my: number; relation: string }[] }
const NODE_W = 128, NODE_H = 44;

/** Chords of a circle cross when their end points interleave. */
function crossings(order: string[], edges: { from: string; to: string }[]): number {
  const at = new Map(order.map((id, i) => [id, i]));
  const e = edges.map(x => [at.get(x.from)!, at.get(x.to)!].sort((a, b) => a - b) as [number, number]);
  let c = 0;
  for (let i = 0; i < e.length; i++) for (let j = i + 1; j < e.length; j++) {
    const [a, b] = e[i], [x, y] = e[j];
    if (a === x || a === y || b === x || b === y) continue;
    if ((a < x && x < b) !== (a < y && y < b)) c++;
  }
  return c;
}
const chordLength = (order: string[], edges: { from: string; to: string }[]) => {
  const at = new Map(order.map((id, i) => [id, i])); const n = order.length;
  return edges.reduce((t, e) => { const d = Math.abs(at.get(e.from)! - at.get(e.to)!); return t + Math.min(d, n - d); }, 0);
};

/** Greedy pairwise swaps: fewer crossings first, then shorter edges. Deterministic, a few hundred steps at most. */
export function improveOrder(order: string[], edges: { from: string; to: string }[]): void {
  const score = () => crossings(order, edges) * 1000 + chordLength(order, edges);
  let best = score();
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
      [order[i], order[j]] = [order[j], order[i]];
      const sc = score();
      if (sc < best) { best = sc; changed = true; } else [order[i], order[j]] = [order[j], order[i]];
    }
    if (!changed) break;
  }
}

/** Where the line from a box centre towards (tx, ty) leaves the box. */
export function clipToBox(cx: number, cy: number, tx: number, ty: number, w = NODE_W, h = NODE_H, gap = 3): { x: number; y: number } {
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const k = Math.min((w / 2 + gap) / (Math.abs(dx) || 1e-9), (h / 2 + gap) / (Math.abs(dy) || 1e-9));
  return { x: cx + dx * k, y: cy + dy * k };
}

/** Nodes on a circle, ordered by breadth-first search so related ideas sit side by side. */
export function layoutGraph(g: KnowledgeGraph): GraphLayout {
  const adj = new Map<string, string[]>(g.nodes.map(n => [n.id, []]));
  g.edges.forEach(e => { adj.get(e.from)?.push(e.to); adj.get(e.to)?.push(e.from); });
  const seen = new Set<string>(); const order: string[] = [];
  const byDegree = [...g.nodes].sort((a, b) => (adj.get(b.id)!.length - adj.get(a.id)!.length));
  for (const start of byDegree) {
    if (seen.has(start.id)) continue;
    const q = [start.id]; seen.add(start.id);
    while (q.length) { const id = q.shift()!; order.push(id); for (const nb of adj.get(id)!) if (!seen.has(nb)) { seen.add(nb); q.push(nb); } }
  }
  const n = order.length;
  improveOrder(order, g.edges);
  const R = Math.max(170, n * 36);
  const width = 2 * R + NODE_W + 120, height = 2 * R + NODE_H + 120;
  const cx = width / 2, cy = height / 2;
  const label = new Map(g.nodes.map(x => [x.id, x.label]));
  const pos = new Map<string, { x: number; y: number }>();
  const nodes = order.map((id, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    pos.set(id, { x, y });
    return { id, x: x - NODE_W / 2, y: y - NODE_H / 2, w: NODE_W, h: NODE_H, lines: wrapLabel(label.get(id) || id, 17) };
  });
  // Several edges can share a node, so each label sits at a different distance along its own edge.
  const edges = g.edges.map((e, i) => {
    const a = pos.get(e.from)!, b = pos.get(e.to)!;
    const p1 = clipToBox(a.x, a.y, b.x, b.y), p2 = clipToBox(b.x, b.y, a.x, a.y);
    const t = 0.38 + 0.12 * (i % 3);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, mx: p1.x + (p2.x - p1.x) * t, my: p1.y + (p2.y - p1.y) * t, relation: e.relation };
  });
  return { width, height, nodes, edges };
}
