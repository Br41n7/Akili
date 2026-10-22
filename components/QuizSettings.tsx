'use client';
import { useEffect, useState } from 'react';
import { Field, MultiChips, TextInput } from '@/components/ui';
import { COUNT_PRESETS, MAX_QUESTIONS, MIN_QUESTIONS, QUESTION_TYPES, clampCount, type QuizQuestionType } from '@/lib/quiz-config';
import { cn } from '@/lib/utils';

/** Question types and how many questions. Shown under "More options" in the quiz setup. */
export default function QuizSettings({ types, onTypes, count, onCount }: {
  types: QuizQuestionType[]; onTypes: (t: QuizQuestionType[]) => void; count: number; onCount: (n: number) => void;
}) {
  // The box can hold half-typed text ("" or "1"); the real value only changes on a valid number.
  const [text, setText] = useState(String(count));
  useEffect(() => { setText(String(count)); }, [count]);

  const type = (v: string) => {
    setText(v.replace(/[^\d]/g, '').slice(0, 2));
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= MIN_QUESTIONS && n <= MAX_QUESTIONS) onCount(n);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Question types</p>
        <MultiChips<QuizQuestionType> label="Question types" value={types} onChange={onTypes}
          options={QUESTION_TYPES.map(t => ({ value: t.value, label: t.label }))} />
        <p className="text-xs text-muted">Choose one or more. Questions are spread across the types you pick.</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Number of questions</p>
        <div role="group" aria-label="Number of questions" className="flex flex-wrap items-center gap-2">
          {COUNT_PRESETS.map(n => (
            <button key={n} type="button" aria-pressed={count === n} onClick={() => onCount(n)}
              className={cn('min-h-11 min-w-12 rounded-xl border px-3 text-sm font-semibold transition-colors', count === n ? 'border-ink bg-ink text-white' : 'border-rule bg-paper text-ink hover:border-ink/40')}>
              {n}
            </button>
          ))}
          <div className="w-28">
            <Field label="Custom" htmlFor="qz-count">
              <TextInput id="qz-count" inputMode="numeric" value={text} onChange={e => type(e.target.value)}
                onBlur={() => { const n = clampCount(text, count); onCount(n); setText(String(n)); }}
                aria-describedby="qz-count-hint" />
            </Field>
          </div>
        </div>
        <p id="qz-count-hint" className="text-xs text-muted">Any number from {MIN_QUESTIONS} to {MAX_QUESTIONS}.</p>
      </div>
    </div>
  );
}
