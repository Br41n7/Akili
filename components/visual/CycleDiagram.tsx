'use client';
import { cn } from '@/lib/utils';
import { orderedElements } from '@/lib/visual/schema';
import { wrapLabel } from '@/lib/visual/layout';
import { C, SvgText, nodeClass, type DiagramProps } from './shared';

/** Numbered nodes on a ring (SVG) + a tappable list underneath so labels stay readable on narrow screens. */
export default function CycleDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels }: DiagramProps) {
  const items = orderedElements(spec);
  const n = items.length;
  const cx = 180, cy = 170, R = 112, r = 22;
  const pt = (i: number) => { const a = (-Math.PI / 2) + (2 * Math.PI * i) / n; return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }; };

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 360 340" className="h-auto w-full" role="img" aria-label={`${spec.title}: a cycle of ${n} stages`}>
        <defs>
          <marker id="cyc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={C.muted} /></marker>
        </defs>
        {items.map((_, i) => {
          const a = pt(i), b = pt((i + 1) % n);
          const da = Math.atan2(b.y - a.y, b.x - a.x);
          return <line key={i} x1={a.x + Math.cos(da) * (r + 2)} y1={a.y + Math.sin(da) * (r + 2)} x2={b.x - Math.cos(da) * (r + 8)} y2={b.y - Math.sin(da) * (r + 8)} stroke={C.muted} strokeWidth={2} markerEnd="url(#cyc-arrow)" />;
        })}
        {items.map((el, i) => {
          const p = pt(i); const sel = selectedId === el.id; const hi = highlightIds.includes(el.id);
          return (
            <g key={el.id} onClick={() => onSelect(sel ? null : el.id)} style={{ cursor: 'pointer' }} role="button" aria-pressed={sel} aria-label={`Stage ${i + 1}: ${el.label}`} tabIndex={0}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(sel ? null : el.id)}>
              <circle cx={p.x} cy={p.y} r={26} fill="transparent" />
              <circle cx={p.x} cy={p.y} r={r} fill={sel ? C.biro : hi ? C.tick : C.ink} stroke={sel ? C.marker : 'none'} strokeWidth={3} />
              <SvgText lines={[String(i + 1)]} x={p.x} y={p.y} size={15} fill="#fff" />
            </g>
          );
        })}
        <SvgText lines={wrapLabel(spec.topic, 18, 2)} x={cx} y={cy} size={13} fill={C.muted} />
      </svg>
      <ol className="space-y-1.5">
        {items.map((el, i) => (
          <li key={el.id}>
            <button type="button" aria-pressed={selectedId === el.id} onClick={() => onSelect(selectedId === el.id ? null : el.id)} className={cn(nodeClass(selectedId === el.id, highlightIds.includes(el.id)), 'min-h-11 py-2')}>
              <span className="font-bold">{i + 1}. </span>{showLabels ? el.label : '•••'}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
