'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAIJSON, errorMessage, formatDate } from '@/lib/utils';
import { BookOpen, ChevronLeft, ChevronRight, Download, Presentation, Trash2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, ChoiceChips, ConfirmDialog, EmptyState, ErrorState, Field, GeneratingPanel, ListSkeleton, Prose, Segmented, TextInput } from '@/components/ui';
import TeX from '@/components/Math';
import {
  DEFAULT_SLIDES, SLIDE_PRESETS, buildSlideDeckPrompt, buildStudyGuidePrompt, clampSlides, deckToMarkdown, fileNameFor, guideToMarkdown,
  type ArtifactKind, type SlideDeck, type StoredArtifact, type StudyGuide,
} from '@/lib/study-artifacts';

interface Props { projectId: string; userId: string; region: string; onGoToMaterials?: () => void }

const MAX_CONTEXT = 14000;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GuideView({ g }: { g: StudyGuide }) {
  return (
    <article className="space-y-5">
      <header><h3 className="font-read text-xl font-bold">{g.title}</h3>{g.overview && <p className="mt-1 text-sm text-muted">{g.overview}</p>}</header>
      {g.sections.map((s, i) => (
        <section key={i} className="space-y-2 rounded-2xl border border-rule bg-paper p-4">
          <h4 className="font-bold">{s.heading}</h4>
          {s.summary && <Prose>{s.summary}</Prose>}
          {s.key_points.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{s.key_points.map((p, k) => <li key={k}>{p}</li>)}</ul>}
          {s.definitions.length > 0 && <dl className="space-y-1 text-sm">{s.definitions.map((d, k) => <div key={k}><dt className="inline font-bold">{d.term}: </dt><dd className="inline">{d.meaning}</dd></div>)}</dl>}
          {s.formulas.map((f, k) => (
            <div key={k} className="rounded-xl bg-chalk p-3 text-sm">
              {f.name && <p className="font-bold">{f.name}</p>}
              <TeX tex={f.latex} block />
              {f.explanation && <p className="text-muted">{f.explanation}</p>}
            </div>
          ))}
          {s.examples.length > 0 && <div className="text-sm"><p className="font-bold">Examples</p><ul className="list-disc pl-5">{s.examples.map((e, k) => <li key={k}>{e}</li>)}</ul></div>}
          {s.exam_tips.length > 0 && <div className="rounded-xl border border-marker/40 bg-marker/10 p-3 text-sm"><p className="font-bold">Exam tips</p><ul className="list-disc pl-5">{s.exam_tips.map((e, k) => <li key={k}>{e}</li>)}</ul></div>}
        </section>
      ))}
      {g.common_mistakes.length > 0 && <section className="rounded-2xl border border-redpen/30 p-4 text-sm"><h4 className="font-bold text-redpen">Common mistakes</h4><ul className="list-disc pl-5">{g.common_mistakes.map((e, k) => <li key={k}>{e}</li>)}</ul></section>}
      {g.quick_revision.length > 0 && <section className="rounded-2xl border border-tick/40 p-4 text-sm"><h4 className="font-bold">Quick revision</h4><ul className="list-disc pl-5">{g.quick_revision.map((e, k) => <li key={k}>{e}</li>)}</ul></section>}
    </article>
  );
}

export function DeckView({ d }: { d: SlideDeck }) {
  const [i, setI] = useState(0);
  const [notes, setNotes] = useState(false);
  const last = d.slides.length - 1;
  const go = (n: number) => setI(Math.min(last, Math.max(0, n)));
  const s = d.slides[i];
  return (
    <div className="space-y-3" tabIndex={0} onKeyDown={e => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); }}>
      <div className="flex min-h-[260px] flex-col justify-center rounded-2xl bg-ink p-6 text-white" aria-live="polite">
        {i === 0 && d.subtitle && <p className="mb-1 text-xs uppercase tracking-wide text-white/60">{d.title} · {d.subtitle}</p>}
        <h3 className="font-read text-2xl font-bold">{s.title}</h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">{s.bullets.map((b, k) => <li key={k}>{b}</li>)}</ul>
        {s.visual_hint && <p className="mt-4 text-xs italic text-white/60">Visual idea: {s.visual_hint}</p>}
      </div>
      <div className="flex items-center justify-between">
        <Button variant="quiet" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide"><ChevronLeft size={16} /></Button>
        <span className="text-sm text-muted">Slide {i + 1} of {d.slides.length}</span>
        <Button variant="quiet" onClick={() => go(i + 1)} disabled={i === last} aria-label="Next slide"><ChevronRight size={16} /></Button>
      </div>
      {s.speaker_notes && (
        <div>
          <button className="text-sm font-bold text-biro" onClick={() => setNotes(n => !n)} aria-expanded={notes}>{notes ? 'Hide' : 'Show'} speaker notes</button>
          {notes && <p className="mt-1 text-sm">{s.speaker_notes}</p>}
        </div>
      )}
    </div>
  );
}

export function StudyTools({ projectId, userId, region, onGoToMaterials }: Props) {
  const [kind, setKind] = useState<ArtifactKind>('study_guide');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(DEFAULT_SLIDES);
  const [items, setItems] = useState<StoredArtifact[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<StoredArtifact | null>(null);

  const load = () => {
    setStatus('loading');
    supabase.from('study_artifacts').select('id, kind, title, content, created_at')
      .eq('project_id', projectId).eq('user_id', userId).in('kind', ['study_guide', 'slide_deck']).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) { setStatus('error'); return; } setItems((data || []) as StoredArtifact[]); setStatus('ready'); });
  };
  useEffect(load, [projectId, userId]);

  const loadContext = async (): Promise<string> => {
    const { data } = await supabase.from('documents').select('name, content').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: true });
    let text = (data || []).map((d: any) => `## ${d.name}\n${d.content || ''}`).join('\n\n');
    if (text.length > MAX_CONTEXT) text = text.slice(0, MAX_CONTEXT);
    return text;
  };

  const generate = async () => {
    setGenerating(true); setGenError('');
    try {
      const context = await loadContext();
      const t = topic.trim();
      const prompt = kind === 'study_guide' ? buildStudyGuidePrompt({ topic: t, context }) : buildSlideDeckPrompt({ topic: t, context, count: clampSlides(count) });
      const content = await callAIJSON<StudyGuide | SlideDeck>({ task: kind, prompt, region, projectId, validationType: kind, persona: 'friendly' });
      const { data: row, error } = await supabase.from('study_artifacts')
        .insert({ project_id: projectId, user_id: userId, kind, title: content.title, content })
        .select('id, kind, title, content, created_at').single();
      if (error || !row) throw new Error('It was made but could not be saved. Please try again.');
      setItems(p => [row as StoredArtifact, ...p]);
      setOpenId((row as StoredArtifact).id);
      toast.success(kind === 'study_guide' ? 'Study guide ready' : 'Slide deck ready');
    } catch (err) {
      setGenError(errorMessage(err, 'Could not generate that. Please try again.'));
    } finally { setGenerating(false); }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from('study_artifacts').delete().eq('id', toDelete.id);
    if (error) { toast.error('Could not delete it.'); return; }
    setItems(p => p.filter(x => x.id !== toDelete.id));
    if (openId === toDelete.id) setOpenId(null);
    setToDelete(null);
  };

  const open = items.find(x => x.id === openId) || null;
  const shown = items.filter(x => x.kind === kind);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="space-y-3 rounded-2xl border border-rule bg-paper p-4">
        <Segmented<ArtifactKind> label="What to make" value={kind} onChange={k => { setKind(k); setOpenId(null); }} options={[{ value: 'study_guide', label: 'Study guide' }, { value: 'slide_deck', label: 'Slides' }]} />
        <Field label="Topic (optional)" htmlFor="st-topic">
          <TextInput id="st-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Leave blank to cover all your materials" maxLength={120} />
        </Field>
        {kind === 'slide_deck' && (
          <ChoiceChips<string> label="Number of slides" value={String(count)} onChange={v => setCount(clampSlides(v))} options={SLIDE_PRESETS.map(n => ({ value: String(n), label: String(n) }))} />
        )}
        <Button block loading={generating} onClick={generate}><Sparkles size={16} /> {kind === 'study_guide' ? 'Generate study guide' : 'Generate slides'}</Button>
        {genError && <p role="alert" className="text-sm text-redpen">{genError}</p>}
        {onGoToMaterials && <button className="text-xs text-muted underline" onClick={onGoToMaterials}>Add or change materials</button>}
      </div>

      {generating && <GeneratingPanel title={kind === 'study_guide' ? 'Writing your study guide' : 'Building your slides'} steps={['Reading your materials', 'Organising the key ideas', 'Writing it out', 'Checking the result']} />}

      {open && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button className="text-sm font-bold text-biro" onClick={() => setOpenId(null)}>Close</button>
            <Button variant="quiet" onClick={() => download(fileNameFor(open.title), open.kind === 'study_guide' ? guideToMarkdown(open.content as StudyGuide) : deckToMarkdown(open.content as SlideDeck))}><Download size={16} /> Download</Button>
          </div>
          {open.kind === 'study_guide' ? <GuideView g={open.content as StudyGuide} /> : <DeckView d={open.content as SlideDeck} />}
        </div>
      )}

      {!open && status === 'loading' && <ListSkeleton rows={2} />}
      {!open && status === 'error' && <ErrorState message="Your saved study material did not load." onRetry={load} />}
      {!open && status === 'ready' && shown.length === 0 && (
        <EmptyState icon={kind === 'study_guide' ? <BookOpen size={22} /> : <Presentation size={22} />} title={kind === 'study_guide' ? 'No study guides yet' : 'No slide decks yet'}>
          Generate one above. It is saved here so you can come back to it.
        </EmptyState>
      )}
      {!open && status === 'ready' && shown.map(x => (
        <div key={x.id} className="flex items-center gap-2 rounded-2xl border border-rule bg-paper p-3">
          <button className="min-w-0 flex-1 text-left" onClick={() => setOpenId(x.id)}>
            <p className="truncate font-bold">{x.title}</p>
            <p className="text-xs text-muted">{formatDate(x.created_at)}{x.kind === 'slide_deck' ? ` · ${(x.content as SlideDeck).slides.length} slides` : ''}</p>
          </button>
          <button aria-label={`Delete ${x.title}`} onClick={() => setToDelete(x)} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-redpen"><Trash2 size={16} /></button>
        </div>
      ))}

      <ConfirmDialog open={!!toDelete} title="Delete this?" confirmLabel="Delete" danger onConfirm={confirmDelete} onCancel={() => setToDelete(null)} />
    </div>
  );
}

export default StudyTools;
