import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getValidator } from '@/lib/ai-schemas';
import { getTask } from '@/lib/ai-tasks';
import { clipToBox, graphToMarkdown, improveOrder, layoutGraph, layoutMindMap, mindMapToMarkdown, wrapLabel, type Box, type KnowledgeGraph, type MindMap } from '@/lib/concept-maps';
import { KnowledgeGraphView, MindMapView } from '@/components/ConceptMapView';

const mm = (nb = 6, kids = 4): MindMap => ({ title: 'Cells', center: 'The cell', branches: Array.from({ length: nb }, (_, i) => ({ label: `Branch ${i}`, note: `note ${i}`, children: Array.from({ length: kids }, (_, k) => ({ label: `Child ${i}.${k}`, note: '' })) })) });
const kg = (n = 8): KnowledgeGraph => ({ title: 'Respiration', nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `Concept ${i}` })), edges: Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, relation: 'leads to' })) });
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('registry', () => {
  it('uses dedicated validators', () => {
    expect(getTask('mind_map').validation).toBe('mind_map'); expect(getTask('knowledge_graph').validation).toBe('knowledge_graph');
  });
});

describe('mind map validator', () => {
  it('accepts, trims and de-duplicates', () => {
    const raw: any = mm(10, 8); raw.branches[1].label = 'branch 0';
    const r = getValidator('mind_map')(raw); expect(r.ok).toBe(true);
    if (r.ok) { const d: any = r.data; expect(d.branches.length).toBe(8); expect(d.branches.every((b: any) => b.children.length <= 4)).toBe(true); expect(new Set(d.branches.map((b: any) => b.label.toLowerCase())).size).toBe(d.branches.length); }
  });
  it('rejects too few branches and garbage', () => {
    expect(getValidator('mind_map')(mm(2)).ok).toBe(false); expect(getValidator('mind_map')('x').ok).toBe(false);
  });
  it('is idempotent', () => { const a = getValidator('mind_map')(mm()); if (!a.ok) throw 0; expect(getValidator('mind_map')(a.data).ok).toBe(true); });
});

describe('knowledge graph validator', () => {
  it('accepts a connected graph and is idempotent', () => {
    const a = getValidator('knowledge_graph')(kg()); expect(a.ok).toBe(true); if (a.ok) expect(getValidator('knowledge_graph')(a.data).ok).toBe(true);
  });
  it('drops dangling edges, self loops and duplicates', () => {
    const g: any = kg(); g.edges.push({ from: 'n0', to: 'ghost', relation: 'x' }, { from: 'n1', to: 'n1', relation: 'x' }, { ...g.edges[0] });
    const r = getValidator('knowledge_graph')(g); expect(r.ok).toBe(true); if (r.ok) expect((r.data as any).edges).toHaveLength(7);
  });
  it('drops unconnected nodes and rejects when too few remain', () => {
    const g: any = kg(6); g.nodes.push({ id: 'lonely', label: 'Lonely' });
    const r = getValidator('knowledge_graph')(g); expect(r.ok && (r.data as any).nodes.some((n: any) => n.id === 'lonely')).toBe(false);
    expect(getValidator('knowledge_graph')({ ...kg(5), edges: [{ from: 'n0', to: 'n1', relation: 'a' }] }).ok).toBe(false);
  });
});

describe('layout', () => {
  it.each([[3, 0], [6, 4], [8, 4], [7, 1]])('mind map with %i branches / %i children never overlaps and stays inside', (nb, kids) => {
    const L = layoutMindMap(mm(nb, kids)); const all: Box[] = [L.center, ...L.nodes];
    for (let i = 0; i < all.length; i++) {
      expect(all[i].x).toBeGreaterThanOrEqual(0); expect(all[i].x + all[i].w).toBeLessThanOrEqual(L.width);
      expect(all[i].y).toBeGreaterThanOrEqual(0); expect(all[i].y + all[i].h).toBeLessThanOrEqual(L.height);
      for (let j = i + 1; j < all.length; j++) expect(overlap(all[i], all[j])).toBe(false);
    }
  });
  it.each([4, 9, 14])('graph with %i nodes never overlaps and stays inside', n => {
    const L = layoutGraph(kg(n)); expect(L.nodes).toHaveLength(n);
    for (let i = 0; i < n; i++) { expect(L.nodes[i].x).toBeGreaterThanOrEqual(0); expect(L.nodes[i].x + L.nodes[i].w).toBeLessThanOrEqual(L.width); for (let j = i + 1; j < n; j++) expect(overlap(L.nodes[i], L.nodes[j])).toBe(false); }
  });
  it('graph layout places every node once even when disconnected', () => {
    const g = kg(6); g.edges = [{ from: 'n0', to: 'n1', relation: 'a' }, { from: 'n2', to: 'n3', relation: 'b' }];
    expect(new Set(layoutGraph(g).nodes.map(n => n.id)).size).toBe(6);
  });
  it('wraps and truncates labels', () => {
    expect(wrapLabel('Photosynthesis in green plants and algae today', 16).length).toBeLessThanOrEqual(2);
    expect(wrapLabel('Photosynthesis in green plants and algae today', 16).at(-1)).toMatch(/…$/);
    expect(wrapLabel('Short')).toEqual(['Short']);
  });
});

describe('graph readability', () => {
  const cross = (o: string[], es: { from: string; to: string }[]) => { const at = new Map(o.map((id, i) => [id, i])); const e = es.map(x => [at.get(x.from)!, at.get(x.to)!].sort((a, b) => a - b)); let c = 0; for (let i = 0; i < e.length; i++) for (let j = i + 1; j < e.length; j++) { const [a, b] = e[i], [x, y] = e[j]; if (a === x || a === y || b === x || b === y) continue; if ((a < x && x < b) !== (a < y && y < b)) c++; } return c; };
  it('swap search removes crossings a bad order has', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `n${i}`);
    const es = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]].map(([a, b]) => ({ from: `n${a}`, to: `n${b}` }));
    const bad = ['n0', 'n4', 'n1', 'n5', 'n2', 'n6', 'n3', 'n7'];
    const before = cross(bad, es); expect(before).toBeGreaterThan(3);
    const o = [...bad]; improveOrder(o, es);
    expect(cross(o, es)).toBe(0); expect([...o].sort()).toEqual(ids);
  });
  it('arrow ends sit on the box border, not the centre', () => {
    const p = clipToBox(100, 100, 300, 100); expect(p.x).toBeGreaterThan(100 + 60); expect(p.x).toBeLessThan(100 + 70); expect(p.y).toBe(100);
    const q = clipToBox(100, 100, 100, 400); expect(q.y).toBeGreaterThan(100 + 22);
    expect(clipToBox(5, 5, 5, 5)).toEqual({ x: 5, y: 5 });
  });
});

describe('render and export', () => {
  it('renders SVG and escapes hostile text', () => {
    const m = mm(3, 1); m.branches[0].label = '<script>alert(1)</script>';
    const h = renderToStaticMarkup(React.createElement(MindMapView, { m }));
    expect(h).toContain('<svg'); expect(h).not.toMatch(/<script/i);
    const g = kg(4); g.nodes[0].label = '<img src=x onerror=1>';
    const k = renderToStaticMarkup(React.createElement(KnowledgeGraphView, { g }));
    expect(k).toContain('leads to'); expect(k).not.toMatch(/<img/i);
  });
  it('exports readable markdown', () => {
    expect(mindMapToMarkdown(mm(3, 1))).toMatch(/- \*\*Branch 0\*\*: note 0\n {2}- Child 0.0/);
    expect(graphToMarkdown(kg(4))).toMatch(/Concept 0 → \*leads to\* → Concept 1/);
  });
});
