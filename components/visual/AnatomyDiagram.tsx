'use client';
import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { depthRanks } from '@/lib/visual/depth';
import { anatomyGrid, edgePoint, gridBoxes, wrapLabel, VIEW_W } from '@/lib/visual/layout';
import { RELATIONS } from '@/lib/visual/vocab';
import type { VisualRelationship } from '@/lib/visual/schema';
import { C, SvgText, ZoomFrame, labelFor, type DiagramProps } from './shared';

// Atlas-style colour coding. Always paired with a letter badge so colour is never the only cue.
const NERVE = '#B8860B';
type EdgeKind = 'origin' | 'insertion' | 'nerve' | 'artery' | 'acts' | 'joint' | 'link';
const EDGE_STYLE: Record<EdgeKind, { color: string; badge?: string; legend: string; dash?: string; width: number }> = {
  origin: { color: C.biro, badge: 'O', legend: 'Origin', width: 3 },
  insertion: { color: C.tick, badge: 'I', legend: 'Insertion', width: 3 },
  nerve: { color: NERVE, badge: 'N', legend: 'Nerve supply', dash: '6 4', width: 2.5 },
  artery: { color: C.red, badge: 'A', legend: 'Blood supply', dash: '2 4', width: 2.5 },
  acts: { color: C.ink, legend: 'Acts on', width: 2.5 },
  joint: { color: C.ink, badge: '●', legend: 'Joint', width: 4 },
  link: { color: C.muted, legend: 'Related', width: 1.5 },
};

function edgeKind(r: VisualRelationship): EdgeKind {
  if (r.relation === 'attaches_to') return r.role === 'origin' ? 'origin' : r.role === 'insertion' ? 'insertion' : 'link';
  if (r.relation === 'innervated_by') return 'nerve';
  if (r.relation === 'supplied_by') return 'artery';
  if (r.relation === 'acts_on') return 'acts';
  if (r.relation === 'articulates_with') return 'joint';
  return 'link';
}

const depthLabel = (i: number, max: number) => (max === 1 ? ['Nearer', 'Deeper'][i] : i === 0 ? 'Nearest' : i === max ? 'Deepest' : `Level ${i + 1}`);

/**
 * Simplified educational schematic, not anatomical artwork. Structures are labelled blocks placed by an
 * order-preserving layout; the diagram edges say what each direction means. Structural relationships are
 * drawn as styled connectors (origin, insertion, nerve, artery, joint). Depth (superficial/deep or
 * anterior/posterior) is shown with a shadow plus a depth control that fades deeper structures.
 */
export default function AnatomyDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels }: DiagramProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const grid = anatomyGrid(spec);
  const { boxes, height } = gridBoxes(grid);
  const box = new Map(boxes.map(b => [b.id, b]));
  const index = new Map(spec.elements.map((e, i) => [e.id, i]));
  const related = new Set<string>();
  if (selectedId) for (const r of spec.relationships) { if (r.from === selectedId) related.add(r.to); if (r.to === selectedId) related.add(r.from); }
  const axes = spec.axes ?? {};
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

  const depth = depthRanks(spec);
  const hasDepth = !depth.cyclic && depth.ranks.size >= 2 && depth.max >= 1;
  const [limit, setLimit] = useState(depth.max);
  const shownLimit = Math.min(limit, depth.max);

  const edges = spec.relationships
    .filter(r => RELATIONS[r.relation].kind !== 'spatial' && r.relation !== 'bonded_to' && box.has(r.from) && box.has(r.to))
    .map(r => ({ r, kind: edgeKind(r) }));
  const legend = [...new Set(edges.map(e => e.kind).filter(k => k !== 'link'))];

  return (
    <div className="space-y-2.5">
      {hasDepth && (
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Depth: show structures down to…</p>
          <div className="flex gap-1.5" role="group" aria-label="Depth">
            {Array.from({ length: depth.max + 1 }, (_, i) => (
              <button key={i} type="button" aria-pressed={shownLimit === i} onClick={() => setLimit(i)}
                className={cn('min-h-11 flex-1 rounded-lg border-2 px-2 text-sm font-semibold', shownLimit === i ? 'border-biro bg-biro-wash' : 'border-rule bg-paper')}>{depthLabel(i, depth.max)}</button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Structures with a shadow lie deeper than the others{spec.view === 'anterior' ? ' (further back from this front view)' : spec.view === 'posterior' ? ' (further forward from this back view)' : ''}.</p>
        </div>
      )}

      <ZoomFrame label="Anatomy diagram">
        {() => (
          <svg viewBox={`0 0 ${VIEW_W} ${height}`} className="h-auto w-full" role="group" aria-label={`${spec.title}${spec.view ? `, ${spec.view} view` : ''}. Simplified schematic.`}>
            <defs>
              {(['nerve', 'artery', 'acts'] as const).map(k => (
                <marker key={k} id={`${uid}-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill={EDGE_STYLE[k].color} /></marker>
              ))}
            </defs>
            {axes.top && <text x={VIEW_W / 2} y={16} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>↑ {cap(axes.top)}</text>}
            {axes.bottom && <text x={VIEW_W / 2} y={height - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>↓ {cap(axes.bottom)}</text>}
            {axes.left && <text transform={`translate(10 ${height / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>← {cap(axes.left)}</text>}
            {axes.right && <text transform={`translate(${VIEW_W - 10} ${height / 2}) rotate(90)`} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>{cap(axes.right)} →</text>}

            {edges.map(({ r, kind }, i) => {
              const a = box.get(r.from)!, b = box.get(r.to)!;
              const st = EDGE_STYLE[kind];
              // Nerves and arteries run toward the structure they supply; everything else runs from → to.
              const reversed = kind === 'nerve' || kind === 'artery';
              const src = reversed ? b : a, dst = reversed ? a : b;
              const p1 = edgePoint(src, dst.x + dst.w / 2, dst.y + dst.h / 2);
              const p2 = edgePoint(dst, src.x + src.w / 2, src.y + src.h / 2);
              const active = selectedId === r.from || selectedId === r.to;
              const arrow = kind === 'nerve' || kind === 'artery' || kind === 'acts';
              const bp = kind === 'origin' || kind === 'insertion' ? p2 : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
              const ghost = hasDepth && [r.from, r.to].some(id => (depth.ranks.get(id) ?? 0) > shownLimit);
              return (
                <g key={i} opacity={ghost ? 0.2 : active || !selectedId ? 1 : 0.55}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={st.color} strokeWidth={active ? st.width + 1 : st.width} strokeDasharray={st.dash} strokeLinecap="round" markerEnd={arrow ? `url(#${uid}-${kind})` : undefined} />
                  {st.badge && (
                    <g>
                      <circle cx={bp.x} cy={bp.y} r={9} fill={C.paper} stroke={st.color} strokeWidth={2} />
                      <SvgText lines={[st.badge]} x={bp.x} y={bp.y} size={10.5} fill={st.color} />
                    </g>
                  )}
                </g>
              );
            })}

            {boxes.map(b => {
              const el = spec.elements.find(e => e.id === b.id)!;
              const sel = selectedId === b.id, rel = related.has(b.id), hi = highlightIds.includes(b.id);
              const rank = depth.ranks.get(b.id) ?? 0;
              const ghost = hasDepth && rank > shownLimit;
              const fill = sel ? C.biroWash : hi ? C.tickWash : rel ? C.markerWash : C.paper;
              const stroke = sel ? C.biro : hi ? C.tick : rel ? '#C9A400' : C.ink;
              const text = labelFor(el.short_label && b.w < 110 ? el.short_label : el.label, index.get(b.id)!, showLabels);
              return (
                <g key={b.id} role="button" tabIndex={0} aria-pressed={sel} aria-label={`${showLabels ? el.label : `Structure ${index.get(b.id)! + 1}`}${hasDepth && depth.ranks.has(b.id) ? `, depth level ${rank + 1}` : ''}`}
                  opacity={ghost ? 0.28 : 1}
                  onClick={() => onSelect(sel ? null : b.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(sel ? null : b.id)} style={{ cursor: 'pointer' }}>
                  {hasDepth && rank > 0 && !ghost && <rect x={b.x + 4} y={b.y + 4} width={b.w} height={b.h} rx={12} fill={C.rule} />}
                  <rect x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} fill="transparent" />
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} fill={fill} stroke={stroke} strokeWidth={sel ? 3 : 2} strokeDasharray={ghost ? '5 4' : undefined} />
                  <SvgText lines={wrapLabel(text, Math.max(8, Math.floor(b.w / 7.2)), 2)} x={b.x + b.w / 2} y={b.y + b.h / 2} size={showLabels ? 13 : 18} />
                </g>
              );
            })}
          </svg>
        )}
      </ZoomFrame>

      {legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-muted" aria-label="Key">
          {legend.map(k => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 bg-paper text-[10px] font-bold" style={{ borderColor: EDGE_STYLE[k].color, color: EDGE_STYLE[k].color }}>{EDGE_STYLE[k].badge ?? '→'}</span>
              {EDGE_STYLE[k].legend}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
