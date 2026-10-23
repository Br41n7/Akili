'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAIJSON, errorMessage } from '@/lib/utils';
import { Copy, Lightbulb, RefreshCw, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Field, GeneratingPanel, Segmented, TextArea, TextInput } from '@/components/ui';
import { buildConfusionPrompt, buildShortcutPrompt, confusionToText, shortcutToText, type ConfusionHelp, type ShortcutSet } from '@/lib/help-tools';

interface Props { projectId: string; userId: string; region: string }
type Mode = 'confused' | 'shortcuts';
const MAX_CONTEXT = 8000;

const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success('Copied'), () => toast.error('Could not copy'));

export function ConfusionCard({ c }: { c: ConfusionHelp }) {
  const [reveal, setReveal] = useState(false);
  return (
    <article className="space-y-3 rounded-2xl border border-rule bg-paper p-4">
      {c.likely_confusion && <p className="rounded-xl bg-marker-wash p-3 text-sm"><b>What is probably going wrong: </b>{c.likely_confusion}</p>}
      <p className="font-read leading-relaxed">{c.simple_explanation}</p>
      {c.analogy && <p className="rounded-xl bg-chalk p-3 text-sm"><b>Think of it like this: </b>{c.analogy}</p>}
      <ol className="space-y-2">{c.steps.map((s, i) => <li key={i} className="flex gap-3 text-sm"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-biro text-xs font-bold text-white">{i + 1}</span><span>{s.title && <b>{s.title}. </b>}{s.text}</span></li>)}</ol>
      <div className="rounded-xl border border-tick/40 p-3 text-sm">
        <p><b>Check yourself: </b>{c.check.question}</p>
        {reveal ? <p className="mt-1 text-tick"><b>Answer: </b>{c.check.answer}</p> : <button className="mt-1 font-bold text-biro" onClick={() => setReveal(true)}>Show answer</button>}
      </div>
      {c.if_still_stuck && <p className="text-sm text-muted">{c.if_still_stuck}</p>}
    </article>
  );
}

export function ShortcutCards({ s }: { s: ShortcutSet }) {
  return (
    <div className="space-y-3">
      {s.methods.map((m, i) => (
        <article key={i} className="space-y-2 rounded-2xl border border-rule bg-paper p-4 text-sm">
          <h3 className="text-base font-bold">{m.name}</h3>
          {m.when_to_use && <p><b>Use when: </b>{m.when_to_use}</p>}
          <ol className="list-decimal space-y-1 pl-5">{m.steps.map((t, k) => <li key={k}>{t}</li>)}</ol>
          <div className="rounded-xl bg-chalk p-3">
            <p className="font-bold">Example: {m.example.problem}</p>
            {m.example.working.map((w, k) => <p key={k}>{w}</p>)}
            <p className="font-bold text-tick">Answer: {m.example.answer}</p>
          </div>
          {m.watch_out && <p className="text-redpen"><b>Watch out: </b>{m.watch_out}</p>}
        </article>
      ))}
      <p className="text-xs text-muted">Always check a shortcut on one question you can solve the long way before you rely on it in an exam.</p>
    </div>
  );
}

export function HelpTools({ projectId, userId, region }: Props) {
  const [mode, setMode] = useState<Mode>('confused');
  const [topic, setTopic] = useState('');
  const [stuck, setStuck] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confusion, setConfusion] = useState<ConfusionHelp | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutSet | null>(null);

  const loadContext = async () => {
    const { data } = await supabase.from('documents').select('name, content').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: true });
    return (data || []).map((d: any) => `## ${d.name}\n${d.content || ''}`).join('\n\n').slice(0, MAX_CONTEXT);
  };

  const run = async (next: number) => {
    const t = topic.trim(); if (!t) return;
    setBusy(true); setError('');
    try {
      const context = await loadContext();
      if (mode === 'confused') {
        const out = await callAIJSON<ConfusionHelp>({ task: 'confusion', prompt: buildConfusionPrompt({ topic: t, stuck: stuck.trim(), attempt: next, context }), region, projectId, validationType: 'confusion' });
        setConfusion(out); setAttempt(next);
      } else {
        const out = await callAIJSON<ShortcutSet>({ task: 'shortcut', prompt: buildShortcutPrompt({ topic: t, context }), region, projectId, validationType: 'shortcut' });
        setShortcuts(out);
      }
    } catch (e) { setError(errorMessage(e, 'Could not do that. Please try again.')); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="space-y-3 rounded-2xl border border-rule bg-paper p-4">
        <Segmented<Mode> label="Help type" value={mode} onChange={setMode} options={[{ value: 'confused', label: 'I am confused' }, { value: 'shortcuts', label: 'Quick methods' }]} />
        <Field label={mode === 'confused' ? 'What are you confused about?' : 'Which kind of question?'} htmlFor="help-topic">
          <TextInput id="help-topic" value={topic} onChange={e => setTopic(e.target.value)} maxLength={120} placeholder={mode === 'confused' ? 'e.g. Why does osmosis stop?' : 'e.g. Solving simultaneous equations'} />
        </Field>
        {mode === 'confused' && (
          <Field label="What exactly is not clear? (optional)" htmlFor="help-stuck">
            <TextArea id="help-stuck" rows={2} value={stuck} onChange={e => setStuck(e.target.value)} maxLength={400} placeholder="e.g. I do not get why the water moves" />
          </Field>
        )}
        <Button block loading={busy} disabled={!topic.trim()} onClick={() => run(1)}>{mode === 'confused' ? <><Lightbulb size={16} /> Explain it simply</> : <><Zap size={16} /> Show quick methods</>}</Button>
        {error && <p role="alert" className="text-sm text-redpen">{error}</p>}
      </div>

      {busy && <GeneratingPanel title={mode === 'confused' ? 'Finding the sticking point' : 'Finding reliable methods'} steps={['Reading your materials', 'Working out the best way in', 'Checking the answer']} />}

      {!busy && mode === 'confused' && confusion && (
        <div className="space-y-3">
          <ConfusionCard c={confusion} />
          <div className="flex gap-2">
            <Button variant="quiet" onClick={() => run(attempt + 1)}><RefreshCw size={16} /> Still confused? Try another way</Button>
            <Button variant="quiet" onClick={() => copy(confusionToText(confusion))} aria-label="Copy explanation"><Copy size={16} /></Button>
          </div>
        </div>
      )}
      {!busy && mode === 'shortcuts' && shortcuts && (
        <div className="space-y-3">
          <ShortcutCards s={shortcuts} />
          <Button variant="quiet" onClick={() => copy(shortcutToText(shortcuts))}><Copy size={16} /> Copy</Button>
        </div>
      )}
    </div>
  );
}

export default HelpTools;
