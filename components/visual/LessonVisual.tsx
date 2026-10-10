'use client';
import { useEffect, useRef, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/utils';
import { matchCurated } from '@/lib/visual/curated';
import { readStoredVisual, type StoredVisual } from '@/lib/visual/lesson';
import { requestLessonVisual, shouldConsiderVisual } from '@/lib/visual/planner';
import { recordVisualAnswer, weakConceptsForLesson } from '@/lib/visual/adaptive';
import VisualRenderer from './VisualRenderer';

interface Props {
  lesson: any;
  projectId: string; userId: string; region: string; persona: string; userGroqKey?: string; level?: string;
  /** Saves the result into the lesson (courses.modules). Failure to save is not an error for the learner. */
  onPersist: (lessonId: string, visual: StoredVisual) => void | Promise<void>;
}

// Set NEXT_PUBLIC_AKILI_AUTO_VISUALS=false to ask learners before spending an AI request.
const AUTO = process.env.NEXT_PUBLIC_AKILI_AUTO_VISUALS !== 'false';

/**
 * Sits between the lesson explanation and the rest of the lesson. Renders nothing at all unless a
 * valid diagram exists, so lessons without a visual, and any failure here, look exactly like before.
 */
export default function LessonVisual({ lesson, projectId, userId, region, persona, userGroqKey, level, onPersist }: Props) {
  const stored = readStoredVisual(lesson);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [error, setError] = useState('');
  const [simplifying, setSimplifying] = useState(false);
  const attempted = useRef<string | null>(null);

  const gate = shouldConsiderVisual(`${lesson.title}\n${(lesson.key_concepts || []).join(' ')}\n${lesson.content || ''}`);
  // A built-in diagram for a core topic beats an AI request: free, identical every time, flagged for review.
  const curated = stored?.status === 'ready' ? null : matchCurated(lesson.title, lesson.key_concepts || []);
  const eligible = !stored && !curated && gate.consider;

  const plan = async (simplify = false) => {
    const weak = await weakConceptsForLesson(projectId, userId, [lesson.title, ...(lesson.key_concepts || [])]);
    const decision = await requestLessonVisual({
      title: lesson.title, content: lesson.content || '', objectives: lesson.learning_objectives, keyConcepts: lesson.key_concepts,
      level, subjectHint: gate.subject, simplify: simplify || weak.length > 0, weakConcepts: weak,
      region, projectId, userGroqKey,
    });
    const created_at = new Date().toISOString();
    await onPersist(lesson.id, decision.needs_visual
      ? { status: 'ready', spec: decision.spec, created_at, simplified: simplify || weak.length > 0 }
      : { status: 'none', reason: decision.visual_reason, created_at });
  };

  const run = async () => {
    setPhase('loading'); setError('');
    try { await plan(); setPhase('idle'); }
    catch (e) { setError(errorMessage(e, 'Could not prepare a diagram.')); setPhase('failed'); }
  };

  useEffect(() => {
    if (!curated || attempted.current === lesson.id) return;
    attempted.current = lesson.id;
    void onPersist(lesson.id, { status: 'ready', spec: curated, created_at: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, !!curated]);

  useEffect(() => {
    if (!AUTO || !eligible || attempted.current === lesson.id) return;
    attempted.current = lesson.id;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, eligible]);

  const shown = stored?.status === 'ready' ? stored.spec : curated;
  if (shown) {
    return (
      <VisualRenderer
        visualSpec={shown}
        ai={{ projectId, region, persona, userGroqKey }}
        onAnswer={(question, chosen, correct) => { void recordVisualAnswer({ userId, projectId, spec: shown, question, chosen, correct }); }}
        simplifying={simplifying}
        onSimplify={async () => {
          setSimplifying(true);
          try {
            const d = await requestLessonVisual({ title: lesson.title, content: lesson.content || '', objectives: lesson.learning_objectives, keyConcepts: lesson.key_concepts, level, subjectHint: gate.subject, simplify: true, weakConcepts: [shown.topic], region, projectId, userGroqKey });
            if (d.needs_visual) await onPersist(lesson.id, { status: 'ready', spec: d.spec, created_at: new Date().toISOString(), simplified: true });
          } catch { /* keep the current diagram */ }
          setSimplifying(false);
        }}
      />
    );
  }

  if (!eligible) return null;
  if (phase === 'loading') return <div aria-busy="true" aria-label="Preparing a diagram"><Skeleton className="h-40 w-full" /></div>;
  if (phase === 'failed') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-chalk p-3 text-sm text-muted" role="status">
        <span>No diagram this time. The lesson is unaffected.</span>
        <Button variant="quiet" onClick={run}>Try again</Button>
      </div>
    );
  }
  if (!AUTO) return <Button variant="quiet" block onClick={run}><ImageIcon size={17} /> Show a diagram for this lesson</Button>;
  return null;
}
