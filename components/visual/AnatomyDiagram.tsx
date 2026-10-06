'use client';
import { anatomyGrid, gridBoxes, wrapLabel, VIEW_W } from '@/lib/visual/layout';
import { RELATIONS } from '@/lib/visual/vocab';
import { C, SvgText, ZoomFrame, labelFor, type DiagramProps } from './shared';

/**
 * Simplified educational schematic, not anatomical artwork. Structures are drawn as labelled blocks
 * placed by an order-preserving layout; the edges of the diagram show what direction they mean
 * (e.g. top = superior). Structural relationships (attaches to, innervated by…) are drawn as lines;
 * spatial ones are expressed by position and listed in the detail panel.
 */
export default function AnatomyDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels }: DiagramProps) {
  const grid = anatomyGrid(spec);
  const { boxes, height } = gridBoxes(grid);
  const box = new Map(boxes.map(b => [b.id, b]));
  const index = new Map(spec.elements.map((e, i) => [e.id, i]));
  const related = new Set<string>();
  if (selectedId) for (const r of spec.relationships) { if (r.from === selectedId) related.add(r.to); if (r.to === selectedId) related.add(r.from); }
  const axes = spec.axes ?? {};
  const edges = spec.relationships.filter(r => RELATIONS[r.relation].kind !== 'spatial' && box.has(r.from) && box.has(r.to));
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

  return (
    <ZoomFrame label="Anatomy diagram">
      {() => (
        <svg viewBox={`0 0 ${VIEW_W} ${height}`} className="h-auto w-full" role="group" aria-label={`${spec.title}${spec.view ? `, ${spec.view} view` : ''}. Simplified schematic.`}>
          {axes.top && <text x={VIEW_W / 2} y={16} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>↑ {cap(axes.top)}</text>}
          {axes.bottom && <text x={VIEW_W / 2} y={height - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>↓ {cap(axes.bottom)}</text>}
          {axes.left && <text transform={`translate(10 ${height / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>← {cap(axes.left)}</text>}
          {axes.right && <text transform={`translate(${VIEW_W - 10} ${height / 2}) rotate(90)`} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>{cap(axes.right)} →</text>}

          {edges.map((r, i) => {
            const a = box.get(r.from)!, b = box.get(r.to)!;
            const active = selectedId === r.from || selectedId === r.to;
            return <line key={i} x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={b.x + b.w / 2} y2={b.y + b.h / 2} stroke={active ? C.biro : C.rule} strokeWidth={active ? 2.5 : 1.5} strokeDasharray={r.relation === 'innervated_by' || r.relation === 'supplied_by' ? '5 4' : undefined} />;
          })}

          {boxes.map(b => {
            const el = spec.elements.find(e => e.id === b.id)!;
            const sel = selectedId === b.id, rel = related.has(b.id), hi = highlightIds.includes(b.id);
            const fill = sel ? C.biroWash : hi ? C.tickWash : rel ? C.markerWash : C.paper;
            const stroke = sel ? C.biro : hi ? C.tick : rel ? '#C9A400' : C.ink;
            const text = labelFor(el.short_label && b.w < 110 ? el.short_label : el.label, index.get(b.id)!, showLabels);
            return (
              <g key={b.id} role="button" tabIndex={0} aria-pressed={sel} aria-label={showLabels ? el.label : `Structure ${index.get(b.id)! + 1}`}
                onClick={() => onSelect(sel ? null : b.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(sel ? null : b.id)} style={{ cursor: 'pointer' }}>
                <rect x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} fill="transparent" />
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} fill={fill} stroke={stroke} strokeWidth={sel ? 3 : 2} />
                <SvgText lines={wrapLabel(text, Math.max(8, Math.floor(b.w / 7.2)), 2)} x={b.x + b.w / 2} y={b.y + b.h / 2} size={showLabels ? 13 : 18} />
              </g>
            );
          })}
        </svg>
      )}
    </ZoomFrame>
  );
}
