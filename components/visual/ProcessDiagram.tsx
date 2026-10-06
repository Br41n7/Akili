'use client';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { orderedElements } from '@/lib/visual/schema';
import { RELATIONS } from '@/lib/visual/vocab';
import { nodeClass, type DiagramProps } from './shared';

/** process, timeline and (via FlowchartDiagram) flowchart: a vertical sequence that reads well on a phone. */
export default function ProcessDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels, variant = 'process' }: DiagramProps & { variant?: 'process' | 'timeline' | 'flowchart' }) {
  const items = orderedElements(spec);
  const edge = (fromId: string, toId: string) => spec.relationships.find(r => r.from === fromId && r.to === toId);

  return (
    <ol className="space-y-0" aria-label={spec.title}>
      {items.map((el, i) => {
        const next = items[i + 1];
        const rel = next ? edge(el.id, next.id) : undefined;
        const selected = selectedId === el.id;
        const decision = el.kind === 'decision';
        return (
          <li key={el.id}>
            <button
              type="button" aria-pressed={selected} onClick={() => onSelect(selected ? null : el.id)}
              className={cn(nodeClass(selected, highlightIds.includes(el.id)), decision && 'border-dashed')}
            >
              <span className="flex items-start gap-3">
                <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', selected ? 'bg-biro text-white' : 'bg-ink text-white')}>
                  {variant === 'timeline' && el.when ? '●' : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  {variant === 'timeline' && el.when && <span className="block text-xs font-bold uppercase tracking-wide text-biro-dark">{el.when}</span>}
                  <span className="block font-bold leading-snug">{showLabels ? el.label : `Step ${i + 1}`}</span>
                  {decision && <span className="text-xs font-semibold text-muted">Decision point</span>}
                </span>
              </span>
            </button>
            {next && (
              <div className="flex items-center gap-2 py-1 pl-[1.15rem] text-muted" aria-hidden="true">
                <ArrowDown size={18} />
                {rel && <span className="text-xs font-semibold">{rel.label || RELATIONS[rel.relation].phrase.replace(/^is /, '')}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
