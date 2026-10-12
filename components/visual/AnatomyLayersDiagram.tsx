'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { orderedElements } from '@/lib/visual/schema';
import type { DiagramProps } from './shared';

const BAND = ['#F7E1D3', '#F1CDB6', '#E8B7A0', '#D9A08A', '#C98E7B', '#B9806F'];

/** Layers listed outermost/top first. Reveal controls are enabled only when the VisualSpec declares reveal_layers. */
export default function AnatomyLayersDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels }: DiagramProps) {
  const all = orderedElements(spec);
  const [peeled, setPeeled] = useState(0);
  const items = all.slice(peeled);
  const canPeel = all.length - peeled > 2;
  const canRevealLayers = spec.interactions.includes('reveal_layers');

  return (
    <div className="space-y-3">
      <ul className="overflow-hidden rounded-xl border border-ink/70" aria-label={spec.title}>
        {items.map((el, i) => {
          const sel = selectedId === el.id;
          return (
            <li key={el.id} className="border-b border-ink/20 last:border-b-0">
              <button type="button" aria-pressed={sel} onClick={() => onSelect(sel ? null : el.id)}
                style={{ background: BAND[all.indexOf(el) % BAND.length], minHeight: 56 }}
                className={cn('flex w-full items-center gap-3 px-4 text-left transition-shadow', sel && 'ring-4 ring-inset ring-biro', highlightIds.includes(el.id) && !sel && 'ring-4 ring-inset ring-tick')}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{all.indexOf(el) + 1}</span>
                <span className="font-bold leading-snug text-ink">{showLabels ? el.label : `Layer ${all.indexOf(el) + 1}`}</span>
                {i === 0 && <span className="ml-auto text-[11px] font-bold uppercase tracking-wide text-ink/60">{peeled === 0 ? 'Surface' : 'Now outermost'}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {all.length > 2 && canRevealLayers && (
        <div className="flex gap-2">
          <button type="button" disabled={!canPeel} onClick={() => { setPeeled(p => p + 1); onSelect(null); }} className="min-h-11 flex-1 rounded-xl border border-rule bg-paper px-3 text-sm font-semibold disabled:opacity-40">Peel back a layer</button>
          <button type="button" disabled={peeled === 0} onClick={() => { setPeeled(0); onSelect(null); }} className="min-h-11 flex-1 rounded-xl border border-rule bg-paper px-3 text-sm font-semibold disabled:opacity-40">Restore all</button>
        </div>
      )}
    </div>
  );
}
