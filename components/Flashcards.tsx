'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAIJSON, errorMessage } from '@/lib/utils';
import { Copy, Plus, RotateCcw, Shuffle, Sparkles, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, ChoiceChips, Chip, ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, Segmented, TextArea, TextInput } from '@/components/ui';
import FlipCard from '@/components/FlipCard';
import { useT } from '@/components/I18n';
import { MNEMONIC_STYLES, buildMnemonicPrompt, composeExplanation, parseItems, validateMnemonic, type MnemonicStyle } from '@/lib/mnemonics';
import {
  buildQaPrompt, buildQueue, composeBack, dueCards, isBeyondNotes, isQaCard, itemsMismatch, normalizeText, reviewResult, shuffled, splitSource, validateQa, verifyQa, type Rating,
} from '@/lib/flashcards';
import { DOC_COLUMNS, materialChunks, materialSources } from '@/lib/material-context';
import { formatContext } from '@/lib/course-builder';

interface Props { projectId: string; userId: string; region: string }
type View = 'study' | 'make' | 'all';
type Kind = 'notes' | 'mnemonic';
const QA_BUDGET = 7000, NOTES_BUDGET = 4000;
const COUNTS = [5, 8, 12];

export function Flashcards({ projectId, userId, region }: Props) {
  const { t } = useT();
  const [cards, setCards] = useState<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [view, setView] = useState<View>('study');
  const [kind, setKind] = useState<Kind>('notes');
  const [concept, setConcept] = useState('');
  const [style, setStyle] = useState<MnemonicStyle>('story');
  const [itemsText, setItemsText] = useState('');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genNote, setGenNote] = useState('');
  const [toDelete, setToDelete] = useState<any>(null);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  // A study session: the cards to go through, where we are, and whether the current one is turned over.
  const [queue, setQueue] = useState<any[] | null>(null);
  const [pos, setPos] = useState(0);
  const [turned, setTurned] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const chosen = useRef(false);

  const load = () => {
    setStatus('loading');
    supabase.from('flashcards').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setStatus('error'); return; }
        setCards(data || []); setStatus('ready');
        if (!chosen.current) { chosen.current = true; if (!(data || []).length) setView('make'); } // an empty deck opens on "make"
      });
  };
  useEffect(load, [projectId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const due = useMemo(() => dueCards(cards), [cards]);
  const loadSources = async () => {
    const { data } = await supabase.from('documents').select(DOC_COLUMNS).eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: true }).limit(30);
    return materialSources(data as any);
  };
  const saveRows = async (rows: object[]) => {
    const { data, error } = await supabase.from('flashcards').insert(rows).select();
    if (error || !data) throw new Error(t('fc.saveError'));
    return data as any[];
  };

  const makeFromNotes = async () => {
    const sources = await loadSources();
    if (!sources.length) throw new Error(t('fc.noNotes'));
    const chunks = materialChunks(sources, topic, QA_BUDGET);
    const prompt = buildQaPrompt({ topic, count, excerpts: formatContext(chunks) });
    let result: ReturnType<typeof verifyQa> | null = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      const data = await callAIJSON<any>({ task: 'flashcard_qa', prompt, region, projectId, validationType: 'flashcard_qa' });
      const v = validateQa(data); if (!v.ok) continue;
      const r = verifyQa(v.cards, chunks); if (r.kept.length) result = { ...r, dropped: r.dropped };
    }
    if (!result) throw new Error(t('fc.noneVerified'));
    const have = new Set(cards.filter(isQaCard).map(c => normalizeText(c.mnemonic || '')));
    const fresh = result.kept.filter(c => !have.has(normalizeText(c.front)));
    if (!fresh.length) throw new Error(t('fc.noneVerified'));
    const rows = fresh.map(c => ({ project_id: projectId, user_id: userId, concept: topic.trim() || c.source.split(', page')[0], style: 'qa', mnemonic: c.front, explanation: composeBack(c) }));
    const saved = await saveRows(rows);
    setCards(p => [...saved, ...p]); setTopic('');
    toast.success(t('fc.made', { n: saved.length }));
    setGenNote(result.dropped ? t('fc.dropped', { n: result.dropped }) : '');
    setView('study');
  };

  const makeMnemonic = async () => {
    const term = concept.trim(); if (!term) return;
    const items = parseItems(itemsText);
    const sources = await loadSources();
    const notes = sources.length ? formatContext(materialChunks(sources, `${term} ${items.join(' ')}`, NOTES_BUDGET)) : '';
    const prompt = buildMnemonicPrompt({ concept: term, style, items, notes });
    // The letters must match the items, and the items must be the ones the learner listed. One retry with the reason.
    let made: ReturnType<typeof validateMnemonic> = { ok: false, error: '' };
    for (let attempt = 0; attempt < 2 && !made.ok; attempt++) {
      const data = await callAIJSON<any>({ task: 'mnemonic', prompt: attempt ? `${prompt}\n\nYour last answer was rejected: ${made.ok ? '' : made.error}. Fix it.` : prompt, region, projectId, validationType: 'mnemonic' });
      made = validateMnemonic(data, style);
      if (made.ok) { const bad = itemsMismatch(made.data.breakdown, items); if (bad) made = { ok: false, error: bad }; }
    }
    if (!made.ok) throw new Error(t('fc.mnemonicFail'));
    const [card] = await saveRows([{ project_id: projectId, user_id: userId, concept: term, style, mnemonic: made.data.mnemonic, explanation: composeExplanation(made.data) }]);
    setCards(p => [card, ...p]); setConcept(''); setItemsText('');
    toast.success(t('fc.made', { n: 1 }));
    setView('all');
  };

  const generate = async () => {
    setGenerating(true); setGenError(''); setGenNote('');
    try { await (kind === 'notes' ? makeFromNotes() : makeMnemonic()); }
    catch (err) { setGenError(errorMessage(err, t('fc.saveError'))); }
    finally { setGenerating(false); }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from('flashcards').delete().eq('id', toDelete.id);
    if (error) { toast.error(t('fc.saveError')); return; }
    setCards(p => p.filter(c => c.id !== toDelete.id)); setToDelete(null);
  };

  // ── Study session ──
  const begin = (mode: 'due' | 'all') => { setQueue(buildQueue(cards, mode)); setPos(0); setTurned(false); setReviewed(0); };
  const current = queue && queue[pos];
  const finished = !!queue && pos >= queue.length;
  const rate = useCallback((rating: Rating) => {
    if (!queue || !queue[pos]) return;
    const card = queue[pos]; const next = reviewResult(card.review_count || 0, rating);
    setCards(p => p.map(c => (c.id === card.id ? { ...c, ...next } : c))); // the card updates at once; saving happens behind it
    supabase.from('flashcards').update(next).eq('id', card.id).then(({ error }) => { if (error) toast.error(t('fc.saveError')); });
    setReviewed(n => n + 1); setTurned(false); setPos(p => p + 1);
  }, [queue, pos, t]);
  useEffect(() => {
    if (view !== 'study' || !current) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setTurned(v => !v); }
      else if (turned && e.key === '1') rate('again'); else if (turned && e.key === '2') rate('good'); else if (turned && e.key === '3') rate('easy');
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [view, current, turned, rate]);

  const faces = (card: any) => {
    const qa = isQaCard(card); const { body, source } = splitSource(card.explanation || '');
    const beyond = !qa && isBeyondNotes(card.explanation || '');
    return {
      front: qa
        ? <><span className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">{t('fc.question')}</span><span className="font-read text-lg font-bold leading-snug">{card.mnemonic}</span></>
        : <span className="font-read text-lg font-bold leading-snug">{card.mnemonic}</span>,
      back: (
        <>
          <span className="mb-1 text-xs font-bold text-biro">{qa ? t('fc.answer') : card.concept}</span>
          <span className="whitespace-pre-line font-read text-sm leading-relaxed">{qa ? body : (card.explanation || '')}</span>
          {qa && source && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-biro-wash px-2.5 py-0.5 text-xs font-semibold text-biro-dark">{t('fc.fromYourNotes')}: {source}</span>}
          {beyond && <span className="mt-2 inline-flex rounded-full bg-redpen-wash px-2.5 py-0.5 text-xs font-semibold text-redpen">{t('fc.beyond')}</span>}
        </>
      ),
    };
  };
  const copy = (card: any) => navigator.clipboard?.writeText(`${card.mnemonic}\n\n${card.explanation}`).then(() => toast.success(t('fc.copied')), () => toast.error(t('fc.saveError')));

  const viewOptions: { value: View; label: string }[] = [
    { value: 'study', label: `${t('fc.study')}${due.length ? ` (${due.length})` : ''}` }, { value: 'make', label: t('fc.make') }, { value: 'all', label: `${t('fc.all')} (${cards.length})` },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <Segmented<View> label={t('fc.view')} options={viewOptions} value={view} onChange={v => { setView(v); chosen.current = true; }} />
      {status === 'loading' && <ListSkeleton rows={2} />}
      {status === 'error' && <ErrorState message={t('fc.loadError')} onRetry={load} />}

      {status === 'ready' && view === 'make' && (
        <div className="space-y-3 rounded-2xl border border-rule bg-paper p-4">
          <ChoiceChips<Kind> label={t('fc.mode')} options={[{ value: 'notes', label: t('fc.fromNotes') }, { value: 'mnemonic', label: t('fc.mnemonic') }]} value={kind} onChange={setKind} />
          {kind === 'notes' ? (
            <>
              <p className="text-sm text-muted">{t('fc.qaHint')}</p>
              <Field label={t('fc.topic')} htmlFor="fc-topic"><TextInput id="fc-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder={t('fc.topicPh')} maxLength={120} onKeyDown={e => e.key === 'Enter' && !generating && generate()} /></Field>
              <ChoiceChips<string> label={t('fc.howMany')} options={COUNTS.map(n => ({ value: String(n), label: String(n) }))} value={String(count)} onChange={v => setCount(Number(v))} />
              <Button block loading={generating} onClick={generate}><Sparkles size={16} /> {t('fc.makeQa')}</Button>
            </>
          ) : (
            <>
              <Field label={t('fc.concept')} htmlFor="fc-concept"><TextInput id="fc-concept" value={concept} onChange={e => setConcept(e.target.value)} placeholder="e.g. Order of mitosis" maxLength={120} onKeyDown={e => e.key === 'Enter' && !generating && generate()} /></Field>
              <Field label={t('fc.items')} htmlFor="fc-items"><TextArea id="fc-items" rows={3} value={itemsText} onChange={e => setItemsText(e.target.value)} placeholder={'Prophase\nMetaphase\nAnaphase\nTelophase'} maxLength={600} /></Field>
              <ChoiceChips<MnemonicStyle> label={t('fc.style')} options={MNEMONIC_STYLES as any} value={style} onChange={setStyle} />
              <Button block disabled={!concept.trim()} loading={generating} onClick={generate}><Plus size={16} /> {t('fc.create')}</Button>
            </>
          )}
          {genError && <p role="alert" className="text-sm text-redpen">{genError}</p>}
        </div>
      )}

      {status === 'ready' && view !== 'make' && cards.length === 0 && (
        <EmptyState icon={<Sparkles size={22} />} title={t('fc.empty')}>{t('fc.emptyBody')}</EmptyState>
      )}

      {status === 'ready' && view === 'study' && cards.length > 0 && (
        <div className="space-y-3">
          {genNote && <p className="text-sm text-muted">{genNote}</p>}
          {!queue || finished ? (
            <div className="space-y-3 rounded-2xl border border-rule bg-paper p-5 text-center">
              {finished && <><h2 className="text-lg font-bold">{t('fc.done')}</h2><p className="text-sm text-muted">{t('fc.doneBody', { n: reviewed })}</p></>}
              {!finished && <p className="text-sm text-muted">{due.length ? t('fc.dueN', { n: due.length }) : t('fc.noneDue')}</p>}
              <div className="flex flex-wrap justify-center gap-2">
                {due.length > 0 && <Button onClick={() => begin('due')}>{t('fc.startDue')}</Button>}
                <Button variant={due.length ? 'quiet' : 'primary'} onClick={() => begin('all')}><RotateCcw size={16} /> {finished ? t('fc.studyAgain') : t('fc.practiseAll')}</Button>
              </div>
            </div>
          ) : current && (
            <>
              <div className="flex items-center justify-between text-sm text-muted">
                <span>{t('fc.progress', { i: pos + 1, n: queue.length })}</span>
                <button type="button" className="inline-flex min-h-9 items-center gap-1 px-1 font-semibold" onClick={() => { setQueue(q => (q ? [...q.slice(0, pos), ...shuffled(q.slice(pos))] : q)); setTurned(false); }}><Shuffle size={14} /> {t('fc.shuffle')}</button>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-chalk" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={pos}><div className="h-full bg-biro transition-all" style={{ width: `${(pos / queue.length) * 100}%` }} /></div>
              <FlipCard key={current.id} {...faces(current)} flipped={turned} onFlip={() => setTurned(v => !v)} label={turned ? `${current.concept}: ${current.explanation}` : `${current.mnemonic}. ${t('fc.flipHint')}`} />
              {turned ? (
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="quiet" onClick={() => rate('again')}>{t('fc.again')}</Button>
                  <Button onClick={() => rate('good')}>{t('fc.good')}</Button>
                  <Button variant="quiet" onClick={() => rate('easy')}>{t('fc.easy')}</Button>
                </div>
              ) : <p className="text-center text-sm text-muted">{t('fc.flipHint')}</p>}
            </>
          )}
        </div>
      )}

      {status === 'ready' && view === 'all' && cards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map(card => {
            const f = faces(card);
            return (
              <div key={card.id} className="space-y-1.5">
                <FlipCard {...f} flipped={!!flipped[card.id]} onFlip={() => setFlipped(p => ({ ...p, [card.id]: !p[card.id] }))} label={flipped[card.id] ? `${card.concept}: ${card.explanation}` : `${card.mnemonic}. ${t('fc.flipHint')}`} />
                <div className="flex items-center justify-between px-1">
                  {isQaCard(card) ? <Chip tone="biro">{t('fc.question')}</Chip> : <span />}
                  <span className="flex gap-1">
                    <button type="button" aria-label={t('fc.copy')} onClick={() => copy(card)} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted active:bg-chalk"><Copy size={15} /></button>
                    <button type="button" aria-label={t('common.delete')} onClick={() => setToDelete(card)} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-redpen active:bg-redpen-wash"><Trash2 size={15} /></button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog open={!!toDelete} title={t('fc.deleteQ')} confirmLabel={t('common.delete')} danger onConfirm={confirmDelete} onCancel={() => setToDelete(null)} />
    </div>
  );
}

export default Flashcards;
