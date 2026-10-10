/**
 * Depth ("nearer to the viewer") from superficial/deep and anterior/posterior relations.
 *
 * A flat diagram can't draw "in front of", so the renderer shows depth with a shadow and a depth
 * control. The ranking is derived only from relations the spec states:
 *   superficial_to / deep_to       always count
 *   anterior_to / posterior_to     count only when the view is anterior or posterior (otherwise the
 *                                  axis is left/right or up/down and is drawn by position instead)
 */
import type { VisualSpec } from './schema';

type Input = Pick<VisualSpec, 'relationships' | 'view'>;

/** [nearer, farther] pairs. */
export function nearerEdges(spec: Input): [string, string][] {
  const out: [string, string][] = [];
  for (const r of spec.relationships) {
    if (r.relation === 'superficial_to') out.push([r.from, r.to]);
    else if (r.relation === 'deep_to') out.push([r.to, r.from]);
    else if (r.relation === 'anterior_to' && spec.view === 'anterior') out.push([r.from, r.to]);
    else if (r.relation === 'anterior_to' && spec.view === 'posterior') out.push([r.to, r.from]);
    else if (r.relation === 'posterior_to' && spec.view === 'anterior') out.push([r.to, r.from]);
    else if (r.relation === 'posterior_to' && spec.view === 'posterior') out.push([r.from, r.to]);
  }
  return out;
}

export interface DepthResult { ranks: Map<string, number>; max: number; cyclic: boolean }

/** Longest-path layering: rank 0 is nearest. Only elements that appear in a depth relation get a rank. */
export function depthRanks(spec: Input): DepthResult {
  const edges = nearerEdges(spec);
  const preds = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const [a, b] of edges) { nodes.add(a); nodes.add(b); preds.set(b, [...(preds.get(b) ?? []), a]); }

  const ranks = new Map<string, number>();
  const state = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done
  let cyclic = false;
  const visit = (n: string): number => {
    if (state.get(n) === 2) return ranks.get(n)!;
    if (state.get(n) === 1) { cyclic = true; return 0; }
    state.set(n, 1);
    const r = Math.max(-1, ...(preds.get(n) ?? []).map(visit)) + 1;
    state.set(n, 2); ranks.set(n, r);
    return r;
  };
  nodes.forEach(n => visit(n));
  if (cyclic) return { ranks: new Map(), max: 0, cyclic: true };
  return { ranks, max: Math.max(0, ...ranks.values()), cyclic: false };
}
