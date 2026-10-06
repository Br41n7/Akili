'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { orderedElements } from '@/lib/visual/schema';
import { C, SvgText, labelFor, type DiagramProps } from './shared';

const BAND = ['#F7E1D3', '#F1CDB6', '#E8B7A0', '#D9A08A', '#C98E7B', '#B9806F'];
const RING = ['#F7E1D3', '#EBC3AE', '#DDA892', '#CE9480', '#BF8272'];

/**
 * Layers listed outermost/top first. Tap a layer to select it (the detail panel explains it and names its
 * neighbours). `rings` draws the same layers concentrically for cross-sections.
 */
export default function AnatomyLayersDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels, variant = 'stack' }: DiagramProps & { variant?: 'stack' | 'rings' }) {
  const all = orderedElements(spec);
  const [peeled, setPeeled] = useState(0);
  const items = all.slice(peeled);
  const canPeel = all.length - peeled > 2;

  return (
    <div className="space-y-3">
      {variant === 'rings' ? (
        <svg viewBox="0 0 360 330" className="h-auto w-full" role="group" aria-label={`${spec.title}: concentric layers`}>
          {items.map((el, i) => {
            const n = items.length; const R = 150 - (i * 120) / Math.max(1, n - 1 + 0.5);
            const sel = selectedId === el.id;
            return (
              <g key={el.id} onClick={() => onSelect(sel ? null : el.id)} style={{ cursor: 'pointer' }} role="button" tabIndex={0} aria-pressed={sel} aria-label={labelFor(el.label, all.indexOf(el), showLabels)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSelect(sel ? null : el.id)}>
                <circle cx={180} cy={165} r={R} fill={RING[i % RING.length]} stroke={sel ? C.biro : highlightIds.includes(el.id) ? C.tick : C.ink} strokeWidth={sel ? 4 : 1.5} />
              </g>
            );
          })}
          {items.map((el, i) => {
            const n = items.length; const R = 150 - (i * 120) / Math.max(1, n - 1 + 0.5);
            const R2 = i + 1 < n ? 150 - ((i + 1) * 120) / Math.max(1, n - 1 + 0.5) : 0;
            return <SvgText key={el.id} lines={[`${all.indexOf(el) + 1}`]} x={180} y={165 - (R + R2) / 2} size={14} />;
          })}
        </svg>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-ink/70" aria-label={spec.title}>
          {items.map((el, i) => {
            const sel = selectedId === el.id;
            return (
              <li key={el.id} className="border-b border-ink/20 last:border-b-0">
                <button type="button" aria-pressed={sel} onClick={() => onSelect(sel ? null : el.id)}
                  style={{ background: BAND[(all.indexOf(el)) % BAND.length], minHeight: 56 }}
                  className={cn('flex w-full items-center gap-3 px-4 text-left transition-shadow', sel && 'ring-4 ring-inset ring-biro', highlightIds.includes(el.id) && !sel && 'ring-4 ring-inset ring-tick')}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{all.indexOf(el) + 1}</span>
                  <span className="font-bold leading-snug text-ink">{showLabels ? el.label : `Layer ${all.indexOf(el) + 1}`}</span>
                  {i === 0 && <span className="ml-auto text-[11px] font-bold uppercase tracking-wide text-ink/60">{peeled === 0 ? 'Surface' : 'Now outermost'}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {variant === 'rings' && (
        <ol className="space-y-1.5">
          {items.map(el => (
            <li key={el.id}>
              <button type="button" aria-pressed={selectedId === el.id} onClick={() => onSelect(selectedId === el.id ? null : el.id)} className={cn('min-h-11 w-full rounded-xl border-2 px-3 py-2 text-left font-bold', selectedId === el.id ? 'border-biro bg-biro-wash' : 'border-rule bg-paper')}>
                {all.indexOf(el) + 1}. {showLabels ? el.label : '•••'}
              </button>
            </li>
          ))}
        </ol>
      )}
      {all.length > 2 && (
        <div className="flex gap-2">
          <button type="button" disabled={!canPeel} onClick={() => { setPeeled(p => p + 1); onSelect(null); }} className="min-h-11 flex-1 rounded-xl border border-rule bg-paper px-3 text-sm font-semibold disabled:opacity-40">Peel back a layer</button>
          <button type="button" disabled={peeled === 0} onClick={() => { setPeeled(0); onSelect(null); }} className="min-h-11 flex-1 rounded-xl border border-rule bg-paper px-3 text-sm font-semibold disabled:opacity-40">Restore all</button>
        </div>
      )}
    </div>
  );
}
