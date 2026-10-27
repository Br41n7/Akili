'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { recommend, TARGET_TAB, type ConceptRow, type Recommendation } from '@/lib/recommendations';
import { Skeleton, Surface } from '@/components/ui';

interface Props { projectId: string; userId: string; concepts: ConceptRow[]; onGoTo?: (tab: string) => void }

/** Suggestions from the learner's own results, flashcards that are due, and whether any material exists yet. */
export function RecommendationsList({ recs, onGoTo }: { recs: Recommendation[]; onGoTo?: (tab: string) => void }) {
  return (
    <ul className="space-y-2">
      {recs.map(r => (
        <li key={r.id}>
          <button type="button" disabled={!onGoTo} onClick={() => onGoTo?.(TARGET_TAB[r.target])}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-rule bg-paper p-3 text-left active:bg-chalk">
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{r.title}</span><span className="block text-xs text-muted">{r.reason}</span></span>
            {onGoTo && <ArrowRight size={16} className="shrink-0 text-biro" aria-hidden />}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function RecommendationsCard({ projectId, userId, concepts, onGoTo }: Props) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [{ count: due }, { count: docs }] = await Promise.all([
        supabase.from('flashcards').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', userId).lte('next_review_at', new Date().toISOString()),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', userId),
      ]);
      if (live) setRecs(recommend({ concepts, dueFlashcards: due ?? 0, hasMaterials: (docs ?? 0) > 0 }));
    })().catch(() => live && setRecs(recommend({ concepts, dueFlashcards: 0, hasMaterials: true })));
    return () => { live = false; };
  }, [projectId, userId, concepts]);

  if (!recs) return <Skeleton className="h-24 w-full" />;
  if (!recs.length) return null;
  return (
    <Surface className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-base font-bold"><Sparkles size={17} className="text-biro" /> Suggested next</h2>
      <RecommendationsList recs={recs} onGoTo={onGoTo} />
    </Surface>
  );
}
