'use client';
import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Prose } from '@/components/ui';
import { figureCaption, placeFigures, type LessonFigure } from '@/lib/lesson-figures';
import type { FigureExplanation } from '@/lib/figures';

// One fetch per project is shared by every lesson. Links last an hour on the server, so reuse them for 20 minutes.
const cache = new Map<string, { at: number; list: Promise<LessonFigure[]> }>();
export function forgetLessonFigures(projectId?: string) { if (projectId) cache.delete(projectId); else cache.clear(); }
function fetchFigures(projectId: string): Promise<LessonFigure[]> {
  const hit = cache.get(projectId);
  if (hit && Date.now() - hit.at < 20 * 60_000) return hit.list;
  const list = fetch(`/api/figures?project_id=${projectId}`).then(r => (r.ok ? r.json() : { figures: [] })).then(j => (Array.isArray(j.figures) ? j.figures as LessonFigure[] : [])).catch(() => []);
  cache.set(projectId, { at: Date.now(), list });
  return list;
}

function FigureCard({ fig, part }: { fig: LessonFigure; part?: string }) {
  const [explanation, setExplanation] = useState<FigureExplanation | null>(fig.explanation || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const explain = async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/figures/${fig.id}/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ again: false }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'The figure could not be explained.');
      setExplanation(j.explanation);
    } catch (e: any) { setErr(e?.message || 'The figure could not be explained.'); } finally { setBusy(false); }
  };
  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-rule bg-paper" data-testid="lesson-figure">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fig.url!} alt={fig.caption || figureCaption(fig)} loading="lazy" className="max-h-96 w-full bg-white object-contain" />
      <figcaption className="space-y-1.5 px-3 py-2.5 text-xs text-muted">
        {part && <p className="font-bold uppercase tracking-wide text-biro-dark">Shown with: {part}</p>}
        <p>{figureCaption(fig)}</p>
        {!explanation ? (
          <button type="button" onClick={explain} disabled={busy} className="inline-flex min-h-8 items-center gap-1 font-semibold text-biro disabled:opacity-60"><Sparkles size={13} /> {busy ? 'Reading the figure…' : 'Explain this part'}</button>
        ) : (
          <div className="space-y-1.5 text-sm text-ink">
            <p className="text-xs font-bold text-muted">AI-drafted from the picture. Check it against your notes.</p>
            <p>{explanation.summary}</p>
            {explanation.labels?.length > 0 && <ul className="list-disc pl-5">{explanation.labels.slice(0, 10).map((l, i) => <li key={i}><b>{l.text}</b>{l.meaning ? `: ${l.meaning}` : ''}</li>)}</ul>}
          </div>
        )}
        {err && <p className="text-redpen">{err}</p>}
      </figcaption>
    </figure>
  );
}

/** The lesson text, with the learner's own pictures placed under the section that cites them. Falls back to plain text. */
export default function LessonBody({ content, projectId }: { content: string; projectId: string }) {
  const [figs, setFigs] = useState<LessonFigure[]>([]);
  useEffect(() => { let alive = true; fetchFigures(projectId).then(l => { if (alive) setFigs(l); }); return () => { alive = false; }; }, [projectId]);
  const placed = useMemo(() => (figs.length ? placeFigures(content, figs) : null), [content, figs]);
  if (!placed || (!placed.rest.length && !placed.sections.some(s => s.figures.length))) return <Prose>{content}</Prose>;
  return (
    <div>
      {placed.sections.map((s, i) => (
        <div key={i}>
          <Prose>{s.markdown}</Prose>
          {s.figures.map(f => <FigureCard key={f.id} fig={f} part={s.heading || undefined} />)}
        </div>
      ))}
      {placed.rest.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Pictures from your files</p>
          {placed.rest.map(f => <FigureCard key={f.id} fig={f} />)}
        </div>
      )}
    </div>
  );
}
