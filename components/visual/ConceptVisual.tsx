'use client';
import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { matchCurated } from '@/lib/visual/curated';
import { recordVisualAnswer } from '@/lib/visual/adaptive';
import { requestLessonVisual, shouldConsiderVisual } from '@/lib/visual/planner';
import type { VisualSpec } from '@/lib/visual/schema';
import VisualRenderer from './VisualRenderer';

interface Props {
  concept: string;
  /** What the learner just read or missed: question, answer and explanation, or a tutor reply. */
  text: string;
  projectId: string; userId: string; region: string; persona: string; userGroqKey?: string;
  /** Small text link (inside chat) instead of a full-width button. */
  compact?: boolean;
}

/**
 * "See it as a diagram" for places that have no lesson: a missed quiz or exam question, or an Ask AI answer.
 * Nothing is requested until the learner taps, the result is not stored, and the button only appears when the
 * text actually has science/structure content. The diagram is planned as the simplest one that teaches the idea.
 */
export default function ConceptVisual({ concept, text, projectId, userId, region, persona, userGroqKey, compact }: Props) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'none' | 'failed'>('idle');
  const [spec, setSpec] = useState<VisualSpec | null>(null);
  const [error, setError] = useState('');
  const [simplifying, setSimplifying] = useState(false);

  const curated = matchCurated(concept);
  if (!curated && !shouldConsiderVisual(`${concept}\n${text}`).consider) return null;

  const run = async () => {
    if (curated) { setSpec(curated); setPhase('ready'); return; } // built-in: no AI request
    setPhase('loading'); setError('');
    try {
      const d = await requestLessonVisual({
        title: concept, content: text, simplify: true, weakConcepts: [concept],
        subjectHint: shouldConsiderVisual(`${concept}\n${text}`).subject, region, projectId, userGroqKey,
      });
      if (d.needs_visual) { setSpec(d.spec); setPhase('ready'); } else setPhase('none');
    } catch (e) { setError(errorMessage(e, 'Could not prepare a diagram.')); setPhase('failed'); }
  };

  if (phase === 'ready' && spec) {
    return (
      <VisualRenderer
        visualSpec={spec}
        ai={{ projectId, region, persona, userGroqKey }}
        onAnswer={(question, chosen, correct) => { void recordVisualAnswer({ userId, projectId, spec, question, chosen, correct }); }}
        simplifying={simplifying}
        onSimplify={async () => {
          if (simplifying) return;
          setSimplifying(true);
          try {
            const d = await requestLessonVisual({
              title: concept, content: text, simplify: true, weakConcepts: [concept],
              subjectHint: shouldConsiderVisual(`${concept}\n${text}`).subject, region, projectId, userGroqKey,
            });
            if (d.needs_visual) { setSpec(d.spec); setPhase('ready'); }
          } catch { /* keep the current concept visual */ }
          setSimplifying(false);
        }}
      />
    );
  }
  if (phase === 'loading') return <div aria-busy="true" aria-label="Preparing a diagram"><Skeleton className="h-28 w-full" /></div>;
  if (phase === 'none') return <p className="text-xs text-muted" role="status">A diagram would not add much here; the explanation covers it.</p>;
  if (phase === 'failed') {
    return (
      <p className="text-xs text-muted" role="status">
        No diagram this time. <button type="button" onClick={run} className="min-h-11 font-semibold text-biro underline">Try again</button>
      </p>
    );
  }
  return compact ? (
    <button type="button" onClick={run} className="ml-1 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-biro"><ImageIcon size={13} /> See it as a diagram</button>
  ) : (
    <Button variant="quiet" block onClick={run}><ImageIcon size={16} /> See it as a diagram</Button>
  );
}
