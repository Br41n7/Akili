'use client';
import { useState } from 'react';
import { Swords } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { gradeBattle, type Battle } from '@/lib/snap';

const CHOICES = (b: Battle) => [
  { id: 'a', label: `Only ${b.concepts[0]}` }, { id: 'b', label: `Only ${b.concepts[1]}` }, { id: 'both', label: 'Both' }, { id: 'neither', label: 'Neither' },
] as const;

export function BattleView({ b }: { b: Battle }) {
  const [phase, setPhase] = useState<'study' | 'play' | 'result'>('study');
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<(string | null)[]>(() => b.rounds.map(() => null));

  const restart = () => { setPicks(b.rounds.map(() => null)); setI(0); setPhase('play'); };

  if (phase === 'study') return (
    <div className="space-y-3">
      <h3 className="font-read text-xl font-bold">{b.concepts[0]} <span className="text-muted">vs</span> {b.concepts[1]}</h3>
      <div className="overflow-x-auto rounded-2xl border border-rule bg-paper">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead><tr className="bg-chalk"><th className="p-3">Feature</th><th className="p-3 text-biro">{b.concepts[0]}</th><th className="p-3 text-redpen">{b.concepts[1]}</th></tr></thead>
          <tbody>{b.comparison.map((r, k) => <tr key={k} className="border-t border-rule align-top"><td className="p-3 font-bold">{r.feature}</td><td className="p-3">{r.a}</td><td className="p-3">{r.b}</td></tr>)}</tbody>
        </table>
      </div>
      {b.analogy && <p className="rounded-xl bg-chalk p-3 text-sm"><b>Analogy: </b>{b.analogy}</p>}
      {b.scenario && <p className="rounded-xl bg-marker-wash p-3 text-sm"><b>When it matters: </b>{b.scenario}</p>}
      <Button block onClick={restart}><Swords size={16} /> Start the battle ({b.rounds.length} rounds)</Button>
    </div>
  );

  if (phase === 'result') {
    const g = gradeBattle(b, picks);
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-rule bg-paper p-4 text-center" role="status">
          <p className="text-3xl font-black">{g.correct} / {g.total}</p>
          <p className="text-sm text-muted">{g.correct === g.total ? 'Flawless. You can tell them apart.' : g.correct >= g.total / 2 ? 'Good. Review the ones you missed.' : 'Study the table again, then retry.'}</p>
        </div>
        <ul className="space-y-2">{b.rounds.map((r, k) => {
          const right = picks[k] === r.answer;
          return <li key={k} className={cn('rounded-xl border p-3 text-sm', right ? 'border-tick/40 bg-tick-wash' : 'border-redpen/40 bg-redpen-wash')}>
            <p className="font-bold">{r.statement}</p>
            <p>{right ? 'Correct' : 'Not quite'}: {CHOICES(b).find(c => c.id === r.answer)?.label}. {r.explanation}</p>
          </li>;
        })}</ul>
        <div className="flex gap-2"><Button onClick={restart}>Battle again</Button><Button variant="quiet" onClick={() => setPhase('study')}>Back to the table</Button></div>
      </div>
    );
  }

  const r = b.rounds[i]; const picked = picks[i];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Round {i + 1} of {b.rounds.length}</p>
      <p className="rounded-2xl bg-ink p-5 font-read text-lg text-white">{r.statement}</p>
      <div className="grid grid-cols-2 gap-2">{CHOICES(b).map(c => {
        const on = picked === c.id, correct = picked !== null && c.id === r.answer;
        return <button key={c.id} disabled={picked !== null} onClick={() => setPicks(p => p.map((x, k) => k === i ? c.id : x))} aria-pressed={on}
          className={cn('min-h-12 rounded-xl border p-2 text-sm font-bold', correct ? 'border-tick bg-tick-wash text-tick' : on ? 'border-redpen bg-redpen-wash text-redpen' : 'border-rule bg-paper')}>{c.label}</button>;
      })}</div>
      {picked !== null && (
        <div className="space-y-2" role="status">
          <p className="text-sm"><b>{picked === r.answer ? 'Correct. ' : 'Not quite. '}</b>{r.explanation}</p>
          <Button block onClick={() => i + 1 < b.rounds.length ? setI(i + 1) : setPhase('result')}>{i + 1 < b.rounds.length ? 'Next round' : 'See result'}</Button>
        </div>
      )}
    </div>
  );
}

export default BattleView;
