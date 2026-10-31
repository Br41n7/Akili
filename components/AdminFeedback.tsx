'use client';
import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Chip, EmptyState, ErrorState, Segmented, Skeleton, Surface } from '@/components/ui';
import type { FeedbackItem, FeedbackSummary } from '@/lib/feedback';

type Filter = 'all' | 'new' | 'bug' | 'idea' | 'rating';
export default function AdminFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([]); const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading'); const [note, setNote] = useState(''); const [filter, setFilter] = useState<Filter>('all');
  const load = useCallback(async () => {
    setState('loading');
    try {
      const q = filter === 'new' ? '?status=new' : filter === 'all' ? '' : `?kind=${filter}`;
      const r = await fetch(`/api/admin/feedback${q}`); if (r.status === 401 || r.status === 403) return setState('denied'); if (!r.ok) throw new Error();
      const j = await r.json(); setItems(j.items || []); setSummary(j.summary); setNote(j.error || ''); setState('ready');
    } catch { setState('error'); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  const mark = async (id: string, status: 'new' | 'read' | 'done') => {
    setItems(items.map(i => (i.id === id ? { ...i, status } : i)));
    await fetch('/api/admin/feedback', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) }).catch(() => {});
  };
  if (state === 'denied') return <ErrorState title="Admins only" message="Sign in with an admin account to read feedback." />;
  if (state === 'error') return <ErrorState message="Feedback did not load." onRetry={load} />;
  return (
    <div className="space-y-4">
      {summary && (
        <Surface className="space-y-2 p-4">
          <p className="text-sm"><span className="font-bold">{summary.total}</span> shown · <span className="font-bold">{summary.newCount}</span> new{summary.averageRating !== null && <> · average rating <span className="font-bold">{summary.averageRating}</span> from {summary.ratingCount}</>}</p>
          {summary.byContext.length > 0 && <ul className="flex flex-wrap gap-2">{summary.byContext.map(c => <li key={c.context}><Chip>{c.context}: {c.count}{c.average !== null ? ` · ${c.average}★` : ''}</Chip></li>)}</ul>}
        </Surface>
      )}
      <Segmented<Filter> label="Filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'new', label: 'New' }, { value: 'bug', label: 'Problems' }, { value: 'idea', label: 'Ideas' }, { value: 'rating', label: 'Ratings' }]} />
      {note && <p className="text-sm text-redpen">{note}</p>}
      {state === 'loading' && <Skeleton className="h-32 w-full" />}
      {state === 'ready' && !items.length && !note && <EmptyState title="No feedback yet">When learners send feedback or rate a lesson, it shows up here.</EmptyState>}
      {state === 'ready' && items.map(i => (
        <Surface key={i.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={i.kind === 'bug' ? 'red' : i.kind === 'idea' ? 'biro' : 'neutral'}>{i.kind}</Chip>
            {i.rating !== null && <span className="inline-flex items-center gap-0.5 text-sm font-bold"><Star size={14} className="fill-marker text-marker" />{i.rating}</span>}
            <span className="text-xs text-muted">{i.context}{i.plan_id ? ` · ${i.plan_id}` : ''} · {new Date(i.created_at).toLocaleString()}</span>
          </div>
          {i.message && <p className="whitespace-pre-wrap text-sm">{i.message}</p>}
          {(i.page || i.ref) && <p className="truncate text-xs text-muted">{[i.page, i.ref].filter(Boolean).join(' · ')}</p>}
          <div className="flex gap-2">{(['new', 'read', 'done'] as const).map(s => <button key={s} onClick={() => mark(i.id, s)} aria-pressed={i.status === s} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${i.status === s ? 'bg-ink text-white' : 'bg-chalk text-muted'}`}>{s}</button>)}</div>
        </Surface>
      ))}
    </div>
  );
}
