'use client';
import { useState } from 'react';
import { BookMarked, Lightbulb, PenLine, Sigma } from 'lucide-react';
import TeX from '@/components/Math';
import { Button, Surface } from '@/components/ui';

interface Definition { term: string; meaning: string }
interface Formula { name?: string; latex: string; explanation?: string; variables?: { symbol: string; meaning: string }[] }
interface Exercise { prompt: string; hint?: string; solution_steps?: string[]; answer?: string }

/**
 * Definitions, formulas and exercises for a lesson. Every field is optional, so lessons saved
 * before these existed render exactly as before (this returns null when there is nothing to show).
 */
export default function LessonExtras({ lesson }: { lesson: { definitions?: Definition[]; formulas?: Formula[]; exercises?: Exercise[]; [field: string]: unknown } }) {
  const definitions = lesson.definitions?.filter(d => d?.term && d?.meaning) || [];
  const formulas = lesson.formulas?.filter(f => f?.latex) || [];
  const exercises = lesson.exercises?.filter(e => e?.prompt) || [];
  const [shown, setShown] = useState<Record<string, 'hint' | 'solution' | undefined>>({});
  if (!definitions.length && !formulas.length && !exercises.length) return null;

  return (
    <div className="space-y-6">
      {definitions.length > 0 && (
        <section aria-label="Definitions">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><BookMarked size={16} /> Definitions</h3>
          <dl className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-paper">
            {definitions.map((d, i) => (
              <div key={i} className="px-4 py-3">
                <dt className="text-sm font-bold text-biro-dark">{d.term}</dt>
                <dd className="mt-0.5 font-read text-base leading-relaxed">{d.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {formulas.length > 0 && (
        <section aria-label="Formulas" className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Sigma size={16} /> Formulas</h3>
          {formulas.map((f, i) => (
            <Surface key={i} className="p-4">
              {f.name && <p className="text-xs font-bold uppercase tracking-wide text-muted">{f.name}</p>}
              <div className="no-scrollbar mt-1 overflow-x-auto py-1 text-lg"><TeX tex={f.latex} block /></div>
              {f.explanation && <p className="mt-1 font-read text-base leading-relaxed">{f.explanation}</p>}
              {f.variables && f.variables.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-rule pt-2 text-sm">
                  {f.variables.map((v, j) => (
                    <li key={j} className="flex gap-2"><span className="min-w-8 shrink-0 font-semibold"><TeX tex={v.symbol} /></span><span className="text-muted">{v.meaning}</span></li>
                  ))}
                </ul>
              )}
            </Surface>
          ))}
        </section>
      )}

      {exercises.length > 0 && (
        <section aria-label="Exercises" className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold"><PenLine size={16} /> Try it yourself</h3>
          {exercises.map((e, i) => {
            const state = shown[i];
            const hasSolution = !!(e.answer || e.solution_steps?.length);
            return (
              <Surface key={i} className="space-y-3 p-4">
                <p className="font-read text-[1.0625rem] font-semibold leading-snug">{i + 1}. {e.prompt}</p>
                <div className="flex flex-wrap gap-2">
                  {e.hint && state !== 'solution' && <Button variant="quiet" size="sm" onClick={() => setShown(s => ({ ...s, [i]: s[i] ? undefined : 'hint' }))}><Lightbulb size={15} /> {state === 'hint' ? 'Hide hint' : 'Hint'}</Button>}
                  {hasSolution && <Button variant="quiet" size="sm" onClick={() => setShown(s => ({ ...s, [i]: s[i] === 'solution' ? undefined : 'solution' }))}>{state === 'solution' ? 'Hide solution' : 'Show solution'}</Button>}
                </div>
                {state === 'hint' && e.hint && <p className="rounded-lg bg-marker-wash px-3 py-2 text-sm">{e.hint}</p>}
                {state === 'solution' && (
                  <div className="space-y-2">
                    {e.solution_steps && e.solution_steps.length > 0 && (
                      <ol className="space-y-1.5">
                        {e.solution_steps.map((s, j) => <li key={j} className="flex gap-2.5 font-read text-base leading-relaxed"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{j + 1}</span>{s}</li>)}
                      </ol>
                    )}
                    {e.answer && <p className="rounded-lg bg-tick-wash px-3 py-2 text-sm font-bold text-tick">Answer: {e.answer}</p>}
                  </div>
                )}
              </Surface>
            );
          })}
        </section>
      )}
    </div>
  );
}
