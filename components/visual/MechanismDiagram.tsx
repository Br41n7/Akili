'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { elementMap } from '@/lib/visual/schema';
import type { DiagramProps } from './shared';

/** Step-through mechanism: one step at a time, with the elements taking part shown as tappable chips. */
export default function MechanismDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels }: DiagramProps) {
  const [step, setStep] = useState(0);
  const map = elementMap(spec);
  const s = spec.steps[Math.min(step, spec.steps.length - 1)];
  const total = spec.steps.length;
  const canStep = spec.interactions.includes('step_through');
  const active = new Set(s.elements);

  return (
    <div className="space-y-3">
      {canStep && (
      <div className="flex flex-wrap items-center justify-center" role="tablist" aria-label="Steps">
        {spec.steps.map((st, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === step} aria-label={`Step ${i + 1}: ${st.title}`} onClick={() => setStep(i)}
            className="flex h-11 min-w-11 items-center justify-center"><span className={cn('block h-2.5 rounded-full transition-all', i === step ? 'w-8 bg-biro' : i < step ? 'w-2.5 bg-ink' : 'w-2.5 bg-rule')} /></button>
        ))}
      </div>
      )}
      <div className="rounded-xl border-2 border-biro bg-biro-wash p-3.5">
        <p className="text-xs font-bold uppercase tracking-wide text-biro-dark">Step {step + 1} of {total}</p>
        <p className="mt-0.5 font-bold leading-snug">{s.title}</p>
        <p className="mt-1.5 font-read text-base leading-relaxed">{s.text}</p>
        {s.elements.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {s.elements.map(id => {
              const e = map.get(id); if (!e) return null;
              const sel = selectedId === id;
              return <button key={id} type="button" aria-pressed={sel} onClick={() => onSelect(sel ? null : id)} className={cn('min-h-11 rounded-lg border-2 px-3 text-sm font-bold', sel ? 'border-biro bg-paper' : 'border-ink/20 bg-paper')}>{showLabels ? e.label : '?'}</button>;
            })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="All participants">
        {spec.elements.map(e => (
          <button key={e.id} type="button" onClick={() => onSelect(selectedId === e.id ? null : e.id)} aria-pressed={selectedId === e.id}
            className={cn('min-h-11 rounded-lg px-3 text-xs font-semibold', active.has(e.id) ? 'bg-ink text-white' : highlightIds.includes(e.id) ? 'bg-tick-wash text-tick' : 'bg-chalk text-muted')}>
            {showLabels ? (e.short_label || e.label) : '•'}
          </button>
        ))}
      </div>
      {canStep && <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-rule bg-paper font-semibold disabled:opacity-40"><ChevronLeft size={18} /> Back</button>
        <button type="button" disabled={step >= total - 1} onClick={() => setStep(step + 1)} className="flex min-h-12 items-center justify-center gap-1 rounded-xl bg-ink font-semibold text-white disabled:opacity-40">Next <ChevronRight size={18} /></button>
      </div>}
    </div>
  );
}
