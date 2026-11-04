'use client';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Sparkles, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, EmptyState, ErrorState, ListSkeleton, Surface } from '@/components/ui';
import { findFigures, releaseCandidates, type Candidate } from '@/lib/figure-browser';
import type { FigureExplanation } from '@/lib/figures';

interface Saved { id: string; source_name: string | null; page: number | null; caption: string | null; bytes: number; explanation: FigureExplanation | null; url: string | null }
interface Props { projectId: string }

const ACCEPT = '.pdf,.pptx,.docx,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function FiguresView({ projectId }: Props) {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [usage, setUsage] = useState({ used: 0, max: 0 });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');
  const [finding, setFinding] = useState<{ done: number; total: number } | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<Saved | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [empty, setEmpty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const candsRef = useRef<Candidate[]>([]);
  candsRef.current = cands;
  useEffect(() => () => releaseCandidates(candsRef.current), []);

  const load = async () => {
    try {
      const res = await fetch(`/api/figures?project_id=${projectId}`); const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Your figures did not load.');
      setSaved(j.figures); setUsage({ used: j.used, max: j.max }); setStatus('ready');
    } catch (e: any) { setErrorText(e?.message || 'Your figures did not load.'); setStatus('error'); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId]);

  const room = Math.max(0, usage.max - usage.used);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    releaseCandidates(cands); setCands([]); setPicked(new Set()); setEmpty(false); setFinding({ done: 0, total: 1 });
    try {
      const found = await findFigures(file, (done, total) => setFinding({ done, total }));
      setCands(found); setEmpty(found.length === 0);
      setPicked(new Set(found.slice(0, room).map(c => c.key)));
    } catch (e) { console.error('[figures] find failed', e); toast.error('That file could not be read for figures. Try another file.'); }
    finally { setFinding(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  const toggle = (key: string) => setPicked(p => { const n = new Set(p); if (n.has(key)) n.delete(key); else if (n.size < room) n.add(key); else toast.error(`Your plan has room for ${room} more.`); return n; });

  const saveSelected = async () => {
    const chosen = cands.filter(c => picked.has(c.key)); if (!chosen.length) return;
    setSaving(true); let ok = 0; let lastError = '';
    for (const c of chosen) {
      const fd = new FormData(); fd.set('file', c.blob, 'figure'); fd.set('project_id', projectId); fd.set('source_name', c.source);
      if (c.page) fd.set('page', String(c.page)); if (c.caption) fd.set('caption', c.caption);
      try { const res = await fetch('/api/figures', { method: 'POST', body: fd }); if (res.ok) ok++; else { lastError = (await res.json().catch(() => ({}))).error || ''; if (res.status === 403) break; } }
      catch { lastError = 'The connection dropped.'; break; }
    }
    setSaving(false);
    if (ok) toast.success(`Saved ${ok} figure${ok === 1 ? '' : 's'}.`);
    if (lastError) toast.error(lastError);
    releaseCandidates(cands); setCands([]); setPicked(new Set()); load();
  };

  const remove = async (f: Saved) => {
    const res = await fetch(`/api/figures/${f.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Could not delete that figure.'); return; }
    setOpen(null); setSaved(s => s.filter(x => x.id !== f.id)); setUsage(u => ({ ...u, used: Math.max(0, u.used - 1) }));
  };

  const explain = async (f: Saved, again = false) => {
    setExplaining(true);
    try {
      const res = await fetch(`/api/figures/${f.id}/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ again }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'The figure could not be explained.');
      const next = { ...f, explanation: j.explanation as FigureExplanation };
      setOpen(next); setSaved(s => s.map(x => x.id === f.id ? next : x));
    } catch (e: any) { toast.error(e?.message || 'The figure could not be explained.'); }
    finally { setExplaining(false); }
  };

  if (status === 'loading') return <div className="p-4"><ListSkeleton /></div>;
  if (status === 'error') return <div className="p-4"><ErrorState message={errorText} onRetry={load} /></div>;

  return (
    <div className="space-y-4 p-4">
      <Surface className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Figures from your materials</h2>
            <p className="text-sm text-muted">Pick a PDF, PowerPoint, Word file or photo. Akili finds its pictures and diagrams here on your device. You choose which to keep. They stay private to you.</p>
          </div>
          <span className="shrink-0 rounded-full border border-rule px-2 py-0.5 text-xs text-muted">{usage.used}/{usage.max}</span>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={e => onFile(e.target.files?.[0])} />
        <Button onClick={() => fileRef.current?.click()} disabled={!!finding || saving || room === 0}><ImagePlus size={16} /> {finding ? `Looking… ${Math.min(100, Math.round(finding.done / finding.total * 100))}%` : 'Find figures in a file'}</Button>
        {room === 0 && <p className="text-xs text-redpen">You have used all your saved figures. Delete one to add more.</p>}
        {empty && <p className="text-sm text-muted">No figures found. Diagrams drawn as lines (not pictures) and scanned pages are not detected. A photo of the diagram works.</p>}
      </Surface>

      {cands.length > 0 && (
        <Surface className="space-y-3 p-4">
          <p className="text-sm font-bold">Found {cands.length}. Choose what to keep ({picked.size}/{room} room).</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cands.map(c => (
              <button key={c.key} type="button" onClick={() => toggle(c.key)} aria-pressed={picked.has(c.key)}
                className={`overflow-hidden rounded-xl border-2 text-left ${picked.has(c.key) ? 'border-biro' : 'border-rule'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.url} alt={c.caption || 'Figure candidate'} className="h-28 w-full bg-white object-contain" />
                <span className="line-clamp-2 block px-2 py-1 text-xs text-muted">{c.page ? `p.${c.page} · ` : ''}{c.caption || 'No caption'}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={saveSelected} disabled={saving || picked.size === 0}>{saving ? 'Saving…' : `Save ${picked.size}`}</Button>
            <Button variant="ghost" onClick={() => { releaseCandidates(cands); setCands([]); setPicked(new Set()); }} disabled={saving}>Cancel</Button>
          </div>
        </Surface>
      )}

      {saved.length === 0 && !cands.length ? (
        <EmptyState title="No figures yet">Find figures in a textbook page, slide deck or photo, and Akili will explain them and quiz you on them.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {saved.map(f => (
            <button key={f.id} type="button" onClick={() => setOpen(f)} className="overflow-hidden rounded-xl border border-rule text-left">
              {f.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={f.url} alt={f.caption || 'Saved figure'} className="h-28 w-full bg-white object-contain" /> : <div className="grid h-28 place-items-center text-xs text-muted">Unavailable</div>}
              <span className="line-clamp-2 block px-2 py-1 text-xs text-muted">{f.explanation?.title || f.caption || f.source_name || 'Figure'}</span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Figure">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-paper p-4 sm:rounded-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-bold">{open.explanation?.title || 'Figure'}</h3>
              <button onClick={() => setOpen(null)} aria-label="Close" className="grid h-10 w-10 place-items-center"><X size={18} /></button>
            </div>
            {open.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={open.url} alt={open.caption || 'Figure'} className="mb-3 max-h-80 w-full rounded-lg bg-white object-contain" />}
            {open.caption && <p className="mb-3 text-xs text-muted">Caption: {open.caption}</p>}
            {!open.explanation ? (
              <Button onClick={() => explain(open)} disabled={explaining}><Sparkles size={16} /> {explaining ? 'Reading the figure…' : 'Explain this figure'}</Button>
            ) : (
              <div className="space-y-3 text-sm">
                <span className="inline-block rounded-full bg-marker/40 px-2 py-0.5 text-xs font-bold">AI-drafted. Check it against your notes.</span>
                {open.explanation.unclear && <p className="text-redpen">The picture was hard to read, so this may be incomplete.</p>}
                <p>{open.explanation.summary}</p>
                {open.explanation.labels.length > 0 && <div><h4 className="font-bold">Labels</h4><ul className="list-disc pl-5">{open.explanation.labels.map((l, i) => <li key={i}><b>{l.text}</b>{l.meaning ? `: ${l.meaning}` : ''}</li>)}</ul></div>}
                {open.explanation.key_points.length > 0 && <div><h4 className="font-bold">Key points</h4><ul className="list-disc pl-5">{open.explanation.key_points.map((k, i) => <li key={i}>{k}</li>)}</ul></div>}
                {open.explanation.questions.length > 0 && <div><h4 className="font-bold">Check yourself</h4><ol className="list-decimal space-y-3 pl-5">{open.explanation.questions.map((q, i) => (
                  <li key={i}><p>{q.question}</p><ul className="ml-1 mt-1">{q.options.map(o => <li key={o}>{o}</li>)}</ul>
                    <details className="mt-1"><summary className="cursor-pointer text-biro">Show answer</summary><p><b>{q.correct_answer}</b>. {q.explanation}</p></details></li>))}</ol></div>}
                <Button variant="ghost" onClick={() => explain(open, true)} disabled={explaining}>{explaining ? 'Working…' : 'Explain again'}</Button>
              </div>
            )}
            <div className="mt-4 border-t border-rule pt-3"><Button variant="ghost" onClick={() => remove(open)}><Trash2 size={16} /> Delete figure</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
