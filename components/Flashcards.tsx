// ─── Flashcards ───────────────────────────────────────────────────────────────
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { callAI, safeJsonParse, cn } from '@/lib/utils';
import { Sparkles, Loader2, RotateCcw, Plus, Trash2, BarChart3, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react';
import toast from 'react-hot-toast';

// ─────────────────────────────────────────────────────────────────────────────
export function Flashcards({ projectId, userId, region }: { projectId: string; userId: string; region: string }) {
  const [cards, setCards] = useState<any[]>([]);
  const [concept, setConcept] = useState('');
  const [style, setStyle] = useState('story');
  const [generating, setGenerating] = useState(false);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const STYLES = [
    { id: 'story', label: 'Story' },
    { id: 'acronym', label: 'Acronym' },
    { id: 'funny', label: 'Funny' },
    { id: 'academic', label: 'Academic' },
    { id: 'african-themed', label: 'African 🌍' },
  ];

  useEffect(() => {
    supabase.from('flashcards').select('*').eq('project_id', projectId).eq('user_id', userId)
      .order('created_at', { ascending: false }).then(({ data }) => setCards(data || []));
  }, [projectId, userId]);

  const generate = async () => {
    if (!concept.trim()) return;
    setGenerating(true);
    try {
      const prompt = `Create a ${style} mnemonic to remember: "${concept}".
Return JSON: { "mnemonic": string, "explanation": string }`;
      const raw = await callAI({ task: 'mnemonic', prompt, region, format: 'json' });
      const data = safeJsonParse(raw);
      if (!data?.mnemonic) throw new Error('Generation failed');

      const { data: card } = await supabase.from('flashcards').insert({
        project_id: projectId, user_id: userId,
        concept: concept.trim(), style,
        mnemonic: data.mnemonic, explanation: data.explanation,
      }).select().single();

      if (card) { setCards(p => [card, ...p]); setConcept(''); }
      toast.success('Flashcard created!');
    } catch (err: any) { toast.error(err.message); }
    finally { setGenerating(false); }
  };

  const deleteCard = async (id: string) => {
    await supabase.from('flashcards').delete().eq('id', id);
    setCards(p => p.filter(c => c.id !== id));
  };

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="bg-white rounded-3xl p-5 space-y-3">
        <h2 className="font-black flex items-center gap-2"><Sparkles size={18} className="text-indigo-600" /> Flashcards</h2>
        <input value={concept} onChange={e => setConcept(e.target.value)} placeholder="What concept do you want to remember?"
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" />
        <div className="flex gap-2 flex-wrap">
          {STYLES.map(s => (
            <button key={s.id} onClick={() => setStyle(s.id)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-bold transition-all', style === s.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500')}>
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={generate} disabled={!concept.trim() || generating}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2">
          {generating ? <><Loader2 size={15} className="animate-spin" /> Creating...</> : <><Plus size={15} /> Create Card</>}
        </button>
      </div>

      <div className="grid gap-4">
        {cards.map(card => (
          <div key={card.id}
            onClick={() => setFlipped(p => ({ ...p, [card.id]: !p[card.id] }))}
            className="relative h-40 cursor-pointer">
            <div className="absolute inset-0 transition-all duration-500"
              style={{ transformStyle: 'preserve-3d', transform: flipped[card.id] ? 'rotateY(180deg)' : '' }}>
              {/* Front */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl flex flex-col items-center justify-center p-5 text-center"
                style={{ backfaceVisibility: 'hidden' }}>
                <p className="text-white font-black text-lg">{card.mnemonic}</p>
                <p className="text-indigo-200 text-xs mt-2">Tap to reveal</p>
              </div>
              {/* Back */}
              <div className="absolute inset-0 bg-white border border-black/5 rounded-3xl flex flex-col items-center justify-center p-5 text-center"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <p className="text-xs font-bold text-indigo-600 mb-2">{card.concept}</p>
                <p className="text-sm text-gray-600">{card.explanation}</p>
                <button onClick={e => { e.stopPropagation(); deleteCard(card.id); }}
                  className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-rose-500 transition-all">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {cards.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">No flashcards yet — create your first one above</p>}
      </div>
    </div>
  );
}

export default Flashcards;

// ─────────────────────────────────────────────────────────────────────────────
// AskAI — in separate file
// ─────────────────────────────────────────────────────────────────────────────
