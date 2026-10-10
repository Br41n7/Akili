'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Brain, CheckCircle2, RefreshCw, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import { loadDiagramEvidence, type DiagramEvidenceSummary } from '@/lib/visual/adaptive';
import { Button, EmptyState, ErrorState, Field, ProgressBar, Skeleton, Surface, TextInput } from '@/components/ui';

interface Props { projectId: string; userId: string }

const splitList = (v: string) => v.split(',').map(x => x.trim()).filter(Boolean);

export default function LearningProgress({ projectId, userId }: Props) {
  const [concepts, setConcepts] = useState<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [context, setContext] = useState({ foods: '', transport: '', objects: '' });
  const [savingContext, setSavingContext] = useState(false);
  const [diagram, setDiagram] = useState<DiagramEvidenceSummary | null>(null);

  const load = async () => {
    setStatus('loading');
    const { data, error } = await supabase.from('learner_concepts').select('*').eq('project_id', projectId).eq('user_id', userId).order('mastery_score', { ascending: true });
    if (error) { setStatus('error'); return; }
    setConcepts(data || []);
    setStatus('ready');
    loadDiagramEvidence(projectId, userId).then(setDiagram).catch(() => setDiagram(null));
  };

  useEffect(() => {
    load();
    supabase.from('profiles').select('region_context').eq('id', userId).maybeSingle().then(({ data }) => {
      const c = data?.region_context || {};
      setContext({ foods: (c.foods || []).join(', '), transport: (c.transport || []).join(', '), objects: (c.objects || []).join(', ') });
    });
  }, [projectId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveContext = async () => {
    setSavingContext(true);
    const region_context = { foods: splitList(context.foods), transport: splitList(context.transport), objects: splitList(context.objects) };
    const { error } = await supabase.from('profiles').update({ region_context }).eq('id', userId);
    setSavingContext(false);
    if (error) toast.error('Could not save. Please try again.');
    else toast.success('Saved');
  };

  if (status === 'loading') return <div className="space-y-3 p-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (status === 'error') return <div className="p-4"><ErrorState message="Your learning profile did not load. Check your connection and try again." onRetry={load} /></div>;

  const weak = concepts.filter(c => Number(c.mastery_score) < 0.7).slice(0, 6);
  const strong = concepts.filter(c => Number(c.mastery_score) >= 0.7).slice(0, 6);
  const focus = weak[0];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <Surface className="bg-ink p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-marker">Adaptive learning</p>
            <h2 className="mt-1 text-xl font-extrabold leading-tight">What to work on next</h2>
          </div>
          <Brain size={26} className="shrink-0 opacity-70" />
        </div>
        <p className="mt-2.5 text-sm leading-relaxed text-white/70">Estimated from your answers and practice, not a measure of how smart you are.</p>
      </Surface>

      {focus ? (
        <Surface className="border-biro/30 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-biro-dark"><Target size={14} /> Current focus</p>
          <p className="mt-1.5 text-xl font-extrabold leading-tight">{focus.concept}</p>
          <p className="mt-1 text-sm text-muted">{focus.misconception ? `Possible confusion: ${focus.misconception}` : 'More practice will sharpen this estimate.'}</p>
          <ProgressBar value={Number(focus.mastery_score) * 100} label={`${focus.concept} mastery`} className="mt-3" />
        </Surface>
      ) : concepts.length === 0 ? (
        <EmptyState icon={<Brain size={22} />} title="Nothing to show yet">Take a quiz or exam and your learning profile will build up here.</EmptyState>
      ) : (
        <Surface className="border-tick/30 bg-tick-wash p-4">
          <p className="font-bold text-tick">No weak areas standing out yet</p>
          <p className="mt-1 text-sm text-ink/70">Keep practicing so Akili can gather stronger evidence.</p>
        </Surface>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Surface className="p-4">
          <p className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-redpen"><Target size={14} /> Needs practice</p>
          {weak.length === 0 ? <p className="text-sm text-muted">Nothing flagged yet.</p> : weak.map(c => (
            <div key={c.id} className="border-b border-rule py-2.5 last:border-0">
              <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold">{c.concept}</span><span className="shrink-0 text-xs capitalize text-muted">{c.learning_stage}</span></div>
              <p className="mt-0.5 text-xs text-muted">{c.correct_count} correct · {c.incorrect_count} incorrect</p>
            </div>
          ))}
        </Surface>
        <Surface className="p-4">
          <p className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-tick"><CheckCircle2 size={14} /> Strong evidence</p>
          {strong.length === 0 ? <p className="text-sm text-muted">Keep practicing to build evidence.</p> : strong.map(c => (
            <div key={c.id} className="border-b border-rule py-2.5 last:border-0">
              <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold">{c.concept}</span><span className="shrink-0 text-xs text-muted">{Math.round(Number(c.mastery_score) * 100)}%</span></div>
              <p className="mt-0.5 text-xs capitalize text-muted">{c.learning_stage}</p>
            </div>
          ))}
        </Surface>
      </div>

      {diagram && diagram.total > 0 && (
        <Surface className="p-4">
          <p className="mb-1 text-sm font-bold">Diagram practice</p>
          <p className="text-sm text-muted">{diagram.correct} of {diagram.total} diagram questions correct.</p>
          {diagram.direction.total > 0 && (
            <p className="mt-1 text-sm text-muted">Direction words (medial, proximal…): {diagram.direction.correct} of {diagram.direction.total}.</p>
          )}
          {diagram.revisit.length > 0 && (
            <div className="mt-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-redpen">Worth another look</p>
              {diagram.revisit.map(r => (
                <div key={r.concept} className="flex items-baseline justify-between gap-2 border-b border-rule py-2 last:border-0">
                  <span className="text-sm font-semibold">{r.concept}</span><span className="shrink-0 text-xs text-muted">{r.correct} of {r.total}</span>
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      <Surface className="space-y-3 p-4">
        <div>
          <p className="text-sm font-bold">Your familiar context</p>
          <p className="mt-0.5 text-xs text-muted">Add foods, transport or everyday things you recognize, so examples feel familiar. Separate items with commas.</p>
        </div>
        {(['foods', 'transport', 'objects'] as const).map(k => (
          <Field key={k} label={k[0].toUpperCase() + k.slice(1)} htmlFor={`ctx-${k}`} optional>
            <TextInput id={`ctx-${k}`} value={context[k]} onChange={e => setContext(c => ({ ...c, [k]: e.target.value }))} placeholder="e.g. item 1, item 2" />
          </Field>
        ))}
        <Button loading={savingContext} onClick={saveContext}>Save</Button>
      </Surface>

      <Button variant="quiet" block onClick={load}><RefreshCw size={15} /> Refresh learning profile</Button>
    </div>
  );
}
