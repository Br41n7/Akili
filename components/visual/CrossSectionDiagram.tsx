'use client';
import { cn } from '@/lib/utils';
import { elementMap } from '@/lib/visual/schema';
import { calloutLayout, polar, ringBands, wedgePath, wrapLabel } from '@/lib/visual/layout';
import { C, SvgText, ZoomFrame, type DiagramProps } from './shared';

const FILL = ['#F7E1D3', '#EBC3AE', '#E4B4A0', '#D8A58F', '#C9917F'];
const WEDGE = ['#B9D3F2', '#F4C7A1', '#CDE7C4', '#E3C4EC', '#F3E19B'];
const CX = 180, CY = 150, R = 80;
const H = 310;

/**
 * Concentric layers (outermost first) with wedge-shaped structures placed inside a layer by angle
 * (0° = top, clockwise). Labels sit in the margins on leader lines so they stay readable on a phone;
 * the same items are listed underneath as large tap targets.
 */
export default function CrossSectionDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels }: DiagramProps) {
  const map = elementMap(spec);
  const layers = spec.sequence.map(id => map.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
  const wedges = spec.elements.filter(e => e.section && map.has(e.section.ring));
  const bands = ringBands(layers.map(l => l.id), R);
  const band = new Map(bands.map(b => [b.id, b]));
  const num = new Map([...layers, ...wedges].map((e, i) => [e.id, i + 1]));
  const axes = spec.axes ?? {};

  // Leader-line anchors: a layer is pointed at along 55° (right) / 305° (left) alternating; wedges at their own centre.
  const anchors = [
    ...layers.map((l, i) => { const b = band.get(l.id)!; return { id: l.id, anchor: polar(CX, CY, i === layers.length - 1 ? 8 : (b.outer + b.inner) / 2, i % 2 === 0 ? 125 : 235) }; }),
    ...wedges.map(w => { const b = band.get(w.section!.ring)!; return { id: w.id, anchor: polar(CX, CY, (b.outer + b.inner) / 2, w.section!.angle) }; }),
  ];
  const callouts = calloutLayout(anchors, CX, H, { leftX: 8, rightX: 352, gap: 36 });
  const labelOf = (id: string) => (showLabels ? (map.get(id)!.short_label || map.get(id)!.label) : String(num.get(id)));

  const pick = (id: string) => onSelect(selectedId === id ? null : id);
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

  return (
    <div className="space-y-3">
      <ZoomFrame label="Cross-section">
        {() => (
          <svg viewBox={`0 0 360 ${H}`} className="h-auto w-full" role="group" aria-label={`${spec.title}: cross-section with ${layers.length} layers. Simplified schematic.`}>
            {layers.map((l, i) => {
              const b = band.get(l.id)!; const sel = selectedId === l.id; const hi = highlightIds.includes(l.id);
              return (
                <g key={l.id} role="button" tabIndex={0} aria-pressed={sel} aria-label={showLabels ? l.label : `Layer ${num.get(l.id)}`} onClick={() => pick(l.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && pick(l.id)} style={{ cursor: 'pointer' }}>
                  <circle cx={CX} cy={CY} r={b.outer} fill={FILL[i % FILL.length]} stroke={sel ? C.biro : hi ? C.tick : C.ink} strokeWidth={sel ? 4 : 1.5} />
                </g>
              );
            })}
            {wedges.map((w, i) => {
              const b = band.get(w.section!.ring)!; const sel = selectedId === w.id; const hi = highlightIds.includes(w.id);
              const inset = 3;
              return (
                <g key={w.id} role="button" tabIndex={0} aria-pressed={sel} aria-label={showLabels ? w.label : `Structure ${num.get(w.id)}`} onClick={() => pick(w.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && pick(w.id)} style={{ cursor: 'pointer' }}>
                  <path d={wedgePath(CX, CY, b.inner + inset, b.outer - inset, w.section!.angle, Math.max(8, w.section!.span - 4))} fill={WEDGE[i % WEDGE.length]} stroke={sel ? C.biro : hi ? C.tick : C.ink} strokeWidth={sel ? 3.5 : 1.5} />
                </g>
              );
            })}
            {callouts.map(c => {
              const sel = selectedId === c.id;
              const lines = wrapLabel(labelOf(c.id), 11, 3);
              const tx = c.side === 'left' ? c.label.x : c.label.x;
              const lineEnd = { x: c.side === 'left' ? 78 : 282, y: c.label.y };
              return (
                <g key={c.id} onClick={() => pick(c.id)} style={{ cursor: 'pointer' }}>
                  <polyline points={`${c.anchor.x},${c.anchor.y} ${lineEnd.x},${lineEnd.y}`} fill="none" stroke={sel ? C.biro : C.muted} strokeWidth={sel ? 2 : 1.2} />
                  <circle cx={c.anchor.x} cy={c.anchor.y} r={2.8} fill={sel ? C.biro : C.ink} />
                  <rect x={c.side === 'left' ? 4 : 282} y={c.label.y - 17} width={74} height={34} fill="transparent" />
                  <text textAnchor={c.side === 'left' ? 'start' : 'end'} x={tx} fontSize={11} fontWeight={700} fill={sel ? C.biro : C.ink} style={{ userSelect: 'none' }}>
                    {lines.map((ln, k) => <tspan key={k} x={tx} y={c.label.y - ((lines.length - 1) * 6.5) + k * 13 + 4}>{ln}</tspan>)}
                  </text>
                </g>
              );
            })}
            <SvgText lines={[axes.top ? `↑ ${cap(axes.top)}` : '']} x={CX} y={CY - R - 12} size={11} fill={C.muted} />
            <SvgText lines={[axes.bottom ? `↓ ${cap(axes.bottom)}` : '']} x={CX} y={CY + R + 14} size={11} fill={C.muted} />
          </svg>
        )}
      </ZoomFrame>

      {(axes.left || axes.right) && (
        <p className="text-center text-xs font-semibold text-muted">{axes.left && <>Left of the circle = {axes.left}. </>}{axes.right && <>Right of the circle = {axes.right}.</>}</p>
      )}

      <ol className="space-y-1.5" aria-label="Layers and structures">
        {[...layers, ...wedges].map(e => (
          <li key={e.id}>
            <button type="button" aria-pressed={selectedId === e.id} onClick={() => pick(e.id)}
              className={cn('min-h-12 w-full rounded-xl border-2 px-3 py-2 text-left font-bold', selectedId === e.id ? 'border-biro bg-biro-wash' : highlightIds.includes(e.id) ? 'border-tick bg-tick-wash' : 'border-rule bg-paper')}>
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-white">{num.get(e.id)}</span>
              {showLabels ? e.label : '•••'}
              {e.section && <span className="ml-2 text-xs font-semibold text-muted">in {map.get(e.section.ring)?.label}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
