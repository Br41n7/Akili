'use client';
import { cn } from '@/lib/utils';
import { nodeClass, type DiagramProps } from './shared';

/** 2 items: side-by-side table. 3–4 items: stacked cards. Both stay inside the phone width. */
export default function ComparisonDiagram({ spec, selectedId, onSelect, highlightIds = [], showLabels }: DiagramProps) {
  const items = spec.elements;
  const names: string[] = [];
  for (const e of items) for (const a of e.attributes ?? []) if (!names.some(n => n.toLowerCase() === a.name.toLowerCase())) names.push(a.name);
  const val = (id: string, name: string) => items.find(e => e.id === id)?.attributes?.find(a => a.name.toLowerCase() === name.toLowerCase())?.value ?? '—';

  if (items.length === 2) {
    return (
      <div className="overflow-hidden rounded-xl border border-rule" role="table" aria-label={spec.title}>
        <div className="grid grid-cols-[5.5rem_1fr_1fr] bg-ink text-white" role="row">
          <span className="p-2" />
          {items.map(e => (
            <button key={e.id} type="button" onClick={() => onSelect(selectedId === e.id ? null : e.id)} aria-pressed={selectedId === e.id}
              className={cn('min-h-12 p-2 text-sm font-bold', selectedId === e.id && 'bg-biro')}>{showLabels ? e.label : 'Item'}</button>
          ))}
        </div>
        {names.map(n => (
          <div key={n} className="grid grid-cols-[5.5rem_1fr_1fr] border-t border-rule text-sm" role="row">
            <span className="bg-chalk p-2 text-xs font-bold text-muted">{n}</span>
            {items.map(e => <span key={e.id} className={cn('p-2 leading-snug', selectedId === e.id && 'bg-biro-wash')}>{val(e.id, n)}</span>)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <ul className="space-y-2" aria-label={spec.title}>
      {items.map(e => {
        const sel = selectedId === e.id;
        return (
          <li key={e.id}>
            <button type="button" aria-pressed={sel} onClick={() => onSelect(sel ? null : e.id)} className={nodeClass(sel, highlightIds.includes(e.id))}>
              <span className="block font-bold">{e.label}</span>
              <dl className="mt-1 space-y-0.5 text-sm">
                {names.map(n => <div key={n} className="flex gap-2"><dt className="w-24 shrink-0 text-xs font-bold text-muted">{n}</dt><dd className="leading-snug">{val(e.id, n)}</dd></div>)}
              </dl>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
