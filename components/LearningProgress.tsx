'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Brain, CheckCircle2, Target, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { projectId: string; userId: string; }

export default function LearningProgress({ projectId, userId }: Props) {
  const [concepts, setConcepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('learner_concepts').select('*').eq('project_id', projectId).eq('user_id', userId).order('mastery_score', { ascending: true });
    setConcepts(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId, userId]);

  const weak = concepts.filter(c => Number(c.mastery_score) < 0.70).slice(0, 6);
  const strong = concepts.filter(c => Number(c.mastery_score) >= 0.70).slice(0, 6);
  const focus = weak[0];

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-600" /></div>;

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <div><p className="text-xs font-bold uppercase tracking-wider opacity-70">Adaptive learning</p><h2 className="text-2xl font-black mt-1">What Akili thinks you should work on</h2></div>
          <Brain size={30} className="opacity-80" />
        </div>
        <p className="text-sm text-indigo-100 mt-3">These are estimates based on your answers and practice evidence, not a measure of intelligence.</p>
      </div>

      {focus ? (
        <div className="bg-white rounded-3xl p-5 border border-indigo-100">
          <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold"><Target size={15} /> CURRENT FOCUS</div>
          <p className="text-xl font-black mt-2">{focus.concept}</p>
          <p className="text-sm text-gray-500 mt-1">{focus.misconception ? `Possible confusion: ${focus.misconception}` : 'More practice will help Akili understand your level here.'}</p>
          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.round(Number(focus.mastery_score) * 100)}%` }} /></div>
        </div>
      ) : (
        <div className="bg-emerald-50 rounded-3xl p-5 text-emerald-700"><p className="font-bold">No major weak area detected yet.</p><p className="text-sm mt-1">Keep practicing so Akili can gather stronger evidence.</p></div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white rounded-3xl p-5">
          <div className="flex items-center gap-2 font-bold text-sm text-rose-700 mb-3"><Target size={15} /> Needs practice</div>
          {weak.length === 0 ? <p className="text-sm text-gray-400">Nothing flagged yet.</p> : weak.map(c => (
            <div key={c.id} className="py-3 border-b last:border-0 border-gray-100">
              <div className="flex justify-between gap-2"><span className="text-sm font-semibold">{c.concept}</span><span className="text-xs text-gray-400 capitalize">{c.learning_stage}</span></div>
              <p className="text-[11px] text-gray-400 mt-1">{c.correct_count} correct · {c.incorrect_count} incorrect</p>
            </div>
          ))}
        </section>
        <section className="bg-white rounded-3xl p-5">
          <div className="flex items-center gap-2 font-bold text-sm text-emerald-700 mb-3"><CheckCircle2 size={15} /> Strong evidence</div>
          {strong.length === 0 ? <p className="text-sm text-gray-400">Keep practicing to build evidence.</p> : strong.map(c => (
            <div key={c.id} className="py-3 border-b last:border-0 border-gray-100">
              <div className="flex justify-between gap-2"><span className="text-sm font-semibold">{c.concept}</span><span className="text-xs text-gray-400">{Math.round(Number(c.mastery_score) * 100)}%</span></div>
              <p className="text-[11px] text-gray-400 mt-1">{c.learning_stage}</p>
            </div>
          ))}
        </section>
      </div>

      <button onClick={load} className={cn('w-full py-3 bg-white border border-gray-200 rounded-2xl text-sm font-bold text-gray-600 flex items-center justify-center gap-2 hover:border-indigo-300')}><RefreshCw size={14} /> Refresh learning profile</button>
    </div>
  );
}
