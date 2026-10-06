'use client';
import { useMemo, useState } from 'react';
import { Button, OptionRow, splitOption, type OptionState } from '@/components/ui';
import { buildScaffold, buildVisualQuestions, type VisualQuestion } from '@/lib/visual/quiz';
import type { VisualSpec } from '@/lib/visual/schema';

interface Props {
  spec: VisualSpec;
  /** Highlights the elements a question is about once answered. */
  onHighlight: (ids: string[]) => void;
  onAnswer?: (q: VisualQuestion, chosen: string, correct: boolean) => void;
  /** Called when the learner has missed two or more questions here. */
  onStruggle?: () => void;
  onClose: () => void;
}

/**
 * Diagram questions are built from the spec, so they always match what the learner is looking at.
 * A wrong answer inserts a short scaffold (vocabulary → orientation on this diagram) before the
 * original question comes back, then the quiz carries on at the original difficulty.
 */
export default function VisualQuiz({ spec, onHighlight, onAnswer, onStruggle, onClose }: Props) {
  const seed = useMemo(() => String(Date.now() % 1000), []);
  const [queue, setQueue] = useState<VisualQuestion[]>(() => buildVisualQuestions(spec, { max: 4, seed }));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [misses, setMisses] = useState(0);
  const [scaffolded, setScaffolded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');

  if (!queue.length) {
    return <div className="rounded-xl bg-chalk p-3.5 text-sm text-muted">There is not enough labelled detail in this diagram to ask a fair question yet. <button className="font-semibold text-biro underline" onClick={onClose}>Close</button></div>;
  }

  const q = queue[pos];
  const finished = pos >= queue.length;
  if (finished) {
    return (
      <div className="space-y-3 rounded-xl border border-rule bg-paper p-3.5" role="status">
        <p className="font-bold">{score.right} of {score.total} correct</p>
        <p className="text-sm text-muted">{score.right === score.total ? 'You can read this diagram well.' : 'Open the explanation, then try again; the questions change each time.'}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="quiet" onClick={() => { setQueue(buildVisualQuestions(spec, { max: 4, seed: String(Math.random()) })); setPos(0); setPicked(null); setScore({ right: 0, total: 0 }); setNote(''); onHighlight([]); }}>Try again</Button>
          <Button variant="dark" onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  const answered = picked !== null;
  const choose = (letter: string) => {
    if (answered) return;
    const correct = letter === q.correct_answer;
    setPicked(letter);
    setScore(s => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
    onHighlight(q.element_ids);
    onAnswer?.(q, letter, correct);
    if (!correct) {
      const m = misses + 1; setMisses(m);
      if (m >= 2) onStruggle?.();
    }
  };

  const next = () => {
    const wasWrong = picked !== q.correct_answer;
    let nextQueue = queue;
    // First miss on a relation/sequence question: teach the vocabulary on this diagram, then retry it.
    if (wasWrong && !scaffolded.has(q.id) && !q.id.endsWith('-retry') && q.level >= 2) {
      const steps = buildScaffold(spec, q, seed);
      if (steps.length > 1) {
        nextQueue = [...queue.slice(0, pos + 1), ...steps, ...queue.slice(pos + 1)];
        setScaffolded(new Set(scaffolded).add(q.id));
        setNote('Let us check the basics first, then come back to that one.');
      }
    } else setNote('');
    setQueue(nextQueue); setPos(pos + 1); setPicked(null); onHighlight([]);
  };

  return (
    <div className="space-y-3 rounded-xl border border-rule bg-paper p-3.5">
      <div className="flex items-center justify-between text-xs font-semibold text-muted">
        <span>Question {Math.min(pos + 1, queue.length)} of {queue.length}</span>
        <button onClick={onClose} className="min-h-9 px-2 text-biro">Close</button>
      </div>
      {note && <p className="rounded-lg bg-marker-wash px-3 py-2 text-sm font-semibold" role="status">{note}</p>}
      <p className="font-read text-[1.0625rem] font-semibold leading-snug">{q.question}</p>
      <div role="radiogroup" aria-label="Answers" className="space-y-2">
        {q.options.map(opt => {
          const { letter, text } = splitOption(opt);
          const isPick = picked === letter;
          let state: OptionState = isPick ? 'selected' : 'idle';
          if (answered) state = letter === q.correct_answer ? (isPick ? 'correct' : 'missed') : isPick ? 'wrong' : 'idle';
          return <OptionRow key={letter} letter={letter} text={text} state={state} disabled={answered} onClick={() => choose(letter)} />;
        })}
      </div>
      {answered && (
        <>
          <p className="rounded-lg bg-chalk px-3 py-2 text-sm leading-relaxed">{q.explanation}</p>
          <Button block variant="dark" onClick={next}>{pos + 1 >= queue.length ? 'See result' : 'Next question'}</Button>
        </>
      )}
    </div>
  );
}
