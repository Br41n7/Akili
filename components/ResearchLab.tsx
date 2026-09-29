'use client';
import { useState } from 'react';
import { callAIJSON, errorMessage } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { Check, Copy, Lightbulb, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, ErrorState, Surface, TextArea } from '@/components/ui';

interface Props { projectId: string; userId: string; region: string; persona: string }

function deterministicCleanup(text: string) {
  let out = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  out = out.replace(/^(In conclusion|In today's world|It is important to note that|As we all know)[,:]?\s*/gim, '');
  const sentences = out.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const sentence of sentences) {
    const key = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 8).join(' ');
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    unique.push(sentence);
  }
  return unique.join(' ').replace(/\s+([,.!?;:])/g, '$1');
}

export default function ResearchLab({ projectId, userId, region, persona }: Props) {
  const [text, setText] = useState('');
  const [cleaned, setCleaned] = useState('');
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');
  const [copied, setCopied] = useState(false);
  const [fact, setFact] = useState<any>(null);
  const [factLoading, setFactLoading] = useState(false);
  const [factError, setFactError] = useState('');

  const analyze = () => {
    if (!text.trim()) return void toast.error('Paste some text first.');
    setCleaned(deterministicCleanup(text));
    toast.success('Local cleanup complete — no AI used');
  };

  const rewrite = async () => {
    const source = cleaned || text;
    if (!source.trim()) return void toast.error('Paste some text first.');
    setEditing(true); setEditError('');
    try {
      const prompt = `Rewrite this learner-provided research draft into clear, natural, original study prose while preserving the author's actual claims and meaning. Do not invent citations, facts, or sources. Do not try to evade plagiarism or AI detectors. Remove filler, repetitive headings, generic AI-sounding transitions, and unnecessary verbosity. Keep technical terms accurate. Return JSON {"text": string, "changes": [string]}.

Draft:
${source.slice(0, 18000)}`;
      const data = await callAIJSON<any>({ task: 'research_editor', region, persona, projectId, validationType: 'research_edit', prompt });
      setCleaned(data.text);
      toast.success('Rewrite ready');
    } catch (err) {
      setEditError(errorMessage(err, 'The rewrite failed. Please try again.'));
    } finally {
      setEditing(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(cleaned); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error('Could not copy. Select and copy the text manually.'); }
  };

  const generateFact = async () => {
    setFactLoading(true); setFactError('');
    try {
      const topic = text.trim().slice(0, 120) || 'a useful study topic';
      const prompt = `Generate one genuinely useful, verifiable learning fact related to this topic: ${topic}. Pick one type: short history, scientific fact, important person, important date, real-life application, name/term origin, or a short memorable fact/story. Keep it under 80 words. Do not invent statistics. Return JSON {"type": string, "title": string, "fact": string}.`;
      const data = await callAIJSON<any>({ task: 'fact', region, persona, projectId, validationType: 'fact', prompt });
      setFact(data);
      await supabase.from('ai_facts').insert({ user_id: userId, project_id: projectId, topic, fact_type: data.type || 'fact', content: data.fact });
    } catch (err) {
      setFactError(errorMessage(err, 'Could not generate a fact. Please try again.'));
    } finally {
      setFactLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <Surface className="bg-ink p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-marker">Research workspace</p>
        <h2 className="mt-1 text-xl font-extrabold leading-tight">Think, edit, verify</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">Local cleanup handles simple formatting for free. AI is used only when you ask for a deeper edit or a fact.</p>
      </Surface>

      <Surface className="space-y-3 p-4">
        <div>
          <p className="text-sm font-bold">Originality editor</p>
          <p className="mt-0.5 text-xs text-muted">Paste your own draft. Akili removes filler and AI-sounding phrasing and helps you say it in your own words. It is not a plagiarism or AI-detector bypass.</p>
        </div>
        <TextArea value={text} onChange={e => setText(e.target.value)} rows={8} placeholder="Paste your research notes or draft here" className="resize-y py-3" />
        <div className="flex flex-wrap gap-2">
          <Button variant="dark" size="sm" onClick={analyze}><Wand2 size={14} /> Local cleanup</Button>
          <Button size="sm" loading={editing} disabled={!text.trim()} onClick={rewrite}>AI originality edit</Button>
        </div>
        {editError && <ErrorState message={editError} onRetry={rewrite} />}
        {cleaned && (
          <div className="rounded-xl bg-chalk p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-muted">Result</p>
              <button onClick={copy} className="flex items-center gap-1 text-xs font-bold text-biro">
                {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
              </button>
            </div>
            <p className="whitespace-pre-wrap font-read text-[15px] leading-relaxed">{cleaned}</p>
          </div>
        )}
      </Surface>

      <Surface className="space-y-3 p-4">
        <div>
          <p className="text-sm font-bold">Generate a fact</p>
          <p className="mt-0.5 text-xs text-muted">A small memory hook: history, science, a person, a date, an application, or a term's origin.</p>
        </div>
        <Button size="sm" loading={factLoading} onClick={generateFact}><Lightbulb size={14} /> Give me a fact</Button>
        {factError && <ErrorState message={factError} onRetry={generateFact} />}
        {fact && (
          <div className="rounded-xl border border-marker bg-marker-wash p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink/60">{fact.type}</p>
            <p className="mt-1 font-bold">{fact.title}</p>
            <p className="mt-1.5 font-read text-[15px] leading-relaxed">{fact.fact}</p>
          </div>
        )}
      </Surface>
    </div>
  );
}
