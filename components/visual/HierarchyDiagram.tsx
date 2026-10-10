'use client';
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { orderedElements } from '@/lib/visual/schema';
import { hierarchyDepths } from '@/lib/visual/layout';
import { nodeClass, type DiagramProps } from './shared';

/** Levels (flat, arrows between) or a tree (indented with a connector rule), decided by the relationships present. */
export default function HierarchyDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels }: DiagramProps) {
  const items = orderedElements(spec);
  const { depth, isTree } = hierarchyDepths(spec);

  return (
    <ul aria-label={spec.title} className="space-y-0">
      {items.map((el, i) => {
        const sel = selectedId === el.id;
        const d = isTree ? Math.min(depth.get(el.id) ?? 0, 3) : 0;
        return (
          <li key={el.id} style={{ marginLeft: d * 16 }} className={cn(d > 0 && 'border-l-2 border-biro/30 pl-3')}>
            <button type="button" aria-pressed={sel} onClick={() => onSelect(sel ? null : el.id)} className={cn(nodeClass(sel, highlightIds.includes(el.id)), 'my-0.5')}>
              <span className="flex items-center gap-3">
                {!isTree && <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', sel ? 'bg-biro' : 'bg-ink')}>{i + 1}</span>}
                <span className="font-bold leading-snug">{showLabels ? el.label : `Level ${i + 1}`}</span>
              </span>
            </button>
            {!isTree && i < items.length - 1 && <div className="flex justify-start py-0.5 pl-[1.15rem] text-muted" aria-hidden="true"><ArrowDown size={16} /></div>}
          </li>
        );
      })}
    </ul>
  );
}
