'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, OptionRow, splitOption, type OptionState } from '@/components/ui';
import { RETRY_LABEL, buildLadder, buildVisualQuestions, resolveTap, type LadderQuestion, type VisualQuestion } from '@/lib/visual/quiz';
import type { VisualSpec } from '@/lib/visual/schema';

interface Props {
  spec: VisualSpec;
  /** Highlights the elements a question is about once answered. */
  onHighlight: (ids: string[]) => void;
  onAnswer?: (q: VisualQuestion, chosen: string, correct: boolean) => void;
  /** Called when the learner has missed two or more questions here. */
  onStruggle?: () => void;
  /** While a tap question is open, the diagram sends taps here instead of selecting. null = back to normal. */
  onTapMode?: (listener: ((id: string) => void) | null) => void;
  onClose: () => void;
}

/**
 * Diagram questions are built from the spec, so they always match what the learner is looking at.
 * A wrong answer inserts a short scaffold (vocabulary → orientation on this diagram) before the
 * original question comes back, then the quiz carries on at the original difficulty.
 */
export default function VisualQuiz({ spec, onHighlight, onAnswer, onStruggle, onTapMode, onClose }: Props) {
  const seed = useMemo(() => String(Date.now() % 1000), []);
  const [queue, setQueue] = useState<LadderQuestion[]>(() => buildVisualQuestions(spec, { max: 4, seed }));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [warmups, setWarmups] = useState(0);
  const [misses, setMisses] = useState(0);
  const [scaffolded, setScaffolded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [showChoices, setShowChoices] = useState(false);
  const [tappedId, setTappedId] = useState<string | null>(null);
  const tapRef = useRef<((id: string) => void) | undefined>(undefined);
  const current = queue[pos];

  // Tap questions: the diagram above becomes the answer area until the learner answers or asks for choices.
  useEffect(() => {
    const active = !!current?.tap && picked === null && !showChoices;
    onTapMode?.(active ? (id: string) => tapRef.current?.(id) : null);
    return () => onTapMode?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, picked, showChoices]);

  if (!queue.length) {
    return <div className="rounded-xl bg-chalk p-3.5 text-sm text-muted">There is not enough labelled detail in this diagram to ask a fair question yet. <button className="font-semibold text-biro underline" onClick={onClose}>Close</button></div>;
  }

  const q = queue[pos];
  const finished = pos >= queue.length;
  if (finished) {
    return (
      <div className="space-y-3 rounded-xl border border-rule bg-paper p-3.5" role="status">
        <p className="font-bold">{score.right} of {score.total} correct</p>
        {warmups > 0 && <p className="text-xs font-semibold text-muted">Plus {warmups} warm-up question{warmups === 1 ? '' : 's'} that helped you get there (not scored).</p>}
        <p className="text-sm text-muted">{score.right === score.total ? 'You can read this diagram well.' : 'Open the explanation, then try again; the questions change each time.'}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="quiet" onClick={() => { setQueue(buildVisualQuestions(spec, { max: 4, seed: String(Math.random()) })); setPos(0); setPicked(null); setShowChoices(false); setTappedId(null); setScore({ right: 0, total: 0 }); setWarmups(0); setScaffolded(new Set()); setNote(''); onHighlight([]); }}>Try again</Button>
          <Button variant="dark" onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  const answered = picked !== null;
  const labelOf = (id: string | null) => spec.elements.find(e => e.id === id)?.label ?? '';
  const record = (key: string, chosen: string, correct: boolean) => {
    setPicked(key);
    if (q.ladder) setWarmups(w => w + 1);
    else setScore(s => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
    onHighlight(q.element_ids);
    onAnswer?.(q, chosen, correct);
    if (!correct) {
      const m = misses + 1; setMisses(m);
      if (m >= 2) onStruggle?.();
    }
  };
  const choose = (letter: string) => {
    if (answered) return;
    record(letter, letter, letter === q.correct_answer);
  };
  tapRef.current = (id: string) => {
    if (answered || !q.tap) return;
    const ok = resolveTap(q, id);
    setTappedId(id);
    record(ok ? q.correct_answer : 'TAP_WRONG', labelOf(id), ok);
  };

  const next = () => {
    const wasWrong = picked !== q.correct_answer;
    let nextQueue = queue;
    let message = '';
    if (wasWrong && q.ladder?.label === RETRY_LABEL) {
      // Missed the original a second time: stop drilling, point at the explanation.
      message = 'Still tricky. Open “Explain diagram”, look at the highlighted parts, then try again later.';
      onStruggle?.();
    } else if (wasWrong && !q.ladder && !scaffolded.has(q.id) && q.level >= 2) {
      const steps = buildLadder(spec, q, seed);
      if (steps.length > 1) {
        nextQueue = [...queue.slice(0, pos + 1), ...steps, ...queue.slice(pos + 1)];
        setScaffolded(new Set(scaffolded).add(q.id));
        message = 'Let’s build up to that one in small steps.';
      }
    }
    setNote(message);
    setQueue(nextQueue); setPos(pos + 1); setPicked(null); setShowChoices(false); setTappedId(null); onHighlight([]);
  };

  return (
    <div className="space-y-3 rounded-xl border border-rule bg-paper p-3.5">
      <div className="flex items-center justify-between text-xs font-semibold text-muted">
        <span>{q.ladder ? 'Warm-up' : 'Question'} {Math.min(pos + 1, queue.length)} of {queue.length}</span>
        <button onClick={onClose} className="min-h-11 px-3 text-biro">Close</button>
      </div>
      {q.ladder && <p className="rounded-lg bg-biro-wash px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-biro-dark" role="status">Step {q.ladder.rung} of {q.ladder.of} · {q.ladder.label}</p>}
      {note && <p className="rounded-lg bg-marker-wash px-3 py-2 text-sm font-semibold" role="status">{note}</p>}
      <p className="font-read text-[1.0625rem] font-semibold leading-snug">{q.question}</p>
      {q.tap && !showChoices && !answered && (
        <div className="space-y-2 rounded-lg bg-biro-wash px-3 py-2.5" role="status">
          <p className="text-sm font-semibold">Tap your answer on the diagram above.</p>
          <button type="button" onClick={() => setShowChoices(true)} className="min-h-11 text-sm font-semibold text-biro underline">Show choices instead</button>
        </div>
      )}
      {q.tap && answered && tappedId && (
        <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${picked === q.correct_answer ? 'bg-tick-wash text-tick' : 'bg-redpen-wash text-redpen'}`} role="status">
          {picked === q.correct_answer ? `Correct: ${labelOf(tappedId)}.` : `You tapped ${labelOf(tappedId)}. The answer is ${labelOf(q.element_ids[0])}.`}
        </p>
      )}
      {(!q.tap || showChoices) && (
        <div role="radiogroup" aria-label="Answers" className="space-y-2">
          {q.options.map(opt => {
            const { letter, text } = splitOption(opt);
            const isPick = picked === letter;
            let state: OptionState = isPick ? 'selected' : 'idle';
            if (answered) state = letter === q.correct_answer ? (isPick ? 'correct' : 'missed') : isPick ? 'wrong' : 'idle';
            return <OptionRow key={letter} letter={letter} text={text} state={state} disabled={answered} onClick={() => choose(letter)} />;
          })}
        </div>
      )}
      {answered && (
        <>
          <p className="rounded-lg bg-chalk px-3 py-2 text-sm leading-relaxed">{q.explanation}</p>
          <Button block variant="dark" onClick={next}>{pos + 1 >= queue.length ? 'See result' : 'Next question'}</Button>
        </>
      )}
    </div>
  );
}
