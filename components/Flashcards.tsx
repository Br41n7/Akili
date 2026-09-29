'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAIJSON, cn, errorMessage } from '@/lib/utils';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, ChoiceChips, ConfirmDialog, EmptyState, ErrorState, Field, ListSkeleton, TextInput } from '@/components/ui';

interface Props { projectId: string; userId: string; region: string }

const STYLES = [
  { value: 'story', label: 'Story' },
  { value: 'acronym', label: 'Acronym' },
  { value: 'funny', label: 'Funny' },
  { value: 'academic', label: 'Academic' },
  { value: 'african-themed', label: 'African' },
] as const;
type Style = (typeof STYLES)[number]['value'];

export function Flashcards({ projectId, userId, region }: Props) {
  const [cards, setCards] = useState<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [concept, setConcept] = useState('');
  const [style, setStyle] = useState<Style>('story');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [toDelete, setToDelete] = useState<any>(null);

  const load = () => {
    setStatus('loading');
    supabase.from('flashcards').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) { setStatus('error'); return; } setCards(data || []); setStatus('ready'); });
  };

  useEffect(load, [projectId, userId]);

  const generate = async () => {
    const term = concept.trim();
    if (!term) return;
    setGenerating(true); setGenError('');
    try {
      const prompt = `Create a ${style} mnemonic to remember: "${term}".
Return JSON: { "mnemonic": string, "explanation": string, "type": "${style}" }`;
      const data = await callAIJSON<any>({ task: 'mnemonic', prompt, region, projectId, validationType: 'flashcard' });

      const { data: card, error } = await supabase.from('flashcards')
        .insert({ project_id: projectId, user_id: userId, concept: term, style, mnemonic: data.mnemonic, explanation: data.explanation })
        .select().single();
      if (error || !card) throw new Error('The flashcard was made but could not be saved. Please try again.');

      setCards(p => [card, ...p]);
      setConcept('');
      toast.success('Flashcard created');
    } catch (err) {
      setGenError(errorMessage(err, 'Could not create that flashcard. Please try again.'));
    } finally {
      setGenerating(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from('flashcards').delete().eq('id', toDelete.id);
    if (error) { toast.error('Could not delete the flashcard.'); return; }
    setCards(p => p.filter(c => c.id !== toDelete.id));
    setToDelete(null);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="space-y-3 rounded-2xl border border-rule bg-paper p-4">
        <h2 className="flex items-center gap-2 font-bold"><Sparkles size={18} className="text-biro" /> New flashcard</h2>
        <Field label="Concept to remember" htmlFor="fc-concept">
          <TextInput id="fc-concept" value={concept} onChange={e => setConcept(e.target.value)} placeholder="e.g. Order of mitosis" maxLength={120} onKeyDown={e => e.key === 'Enter' && generate()} />
        </Field>
        <ChoiceChips<Style> label="Mnemonic style" options={STYLES as any} value={style} onChange={setStyle} />
        <Button block disabled={!concept.trim()} loading={generating} onClick={generate}><Plus size={16} /> Create flashcard</Button>
        {genError && <p role="alert" className="text-sm text-redpen">{genError}</p>}
      </div>

      {status === 'loading' && <ListSkeleton rows={2} />}
      {status === 'error' && <ErrorState message="Your flashcards did not load. Check your connection and try again." onRetry={load} />}

      {status === 'ready' && cards.length === 0 && (
        <EmptyState icon={<Sparkles size={22} />} title="No flashcards yet">Add a concept above and Akili writes a memory aid for it.</EmptyState>
      )}

      {status === 'ready' && cards.length > 0 && (
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
          {cards.map(card => {
            const isFlipped = !!flipped[card.id];
            return (
              <button
                key={card.id}
                onClick={() => setFlipped(p => ({ ...p, [card.id]: !p[card.id] }))}
                aria-label={isFlipped ? `${card.concept}: ${card.explanation}` : `${card.mnemonic}. Tap to reveal`}
                className="relative h-44 [perspective:1000px]"
              >
                <div className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: isFlipped ? 'rotateY(180deg)' : undefined }}>
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-ink p-4 text-center [backface-visibility:hidden]">
                    <p className="font-read text-lg font-bold leading-snug text-white">{card.mnemonic}</p>
                    <p className="mt-2 text-xs text-white/60">Tap to reveal</p>
                  </div>
                  <div className={cn('absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-rule bg-paper p-4 text-center [backface-visibility:hidden]')} style={{ transform: 'rotateY(180deg)' }}>
                    <p className="mb-1.5 text-xs font-bold text-biro">{card.concept}</p>
                    <p className="font-read text-sm leading-relaxed text-ink">{card.explanation}</p>
                    <span
                      role="button"
                      aria-label="Delete flashcard"
                      onClick={e => { e.stopPropagation(); setToDelete(card); }}
                      className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-redpen active:bg-redpen-wash"
                    >
                      <Trash2 size={15} />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this flashcard?"
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

export default Flashcards;
