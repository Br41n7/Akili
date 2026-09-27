'use client';
import { useState } from 'react';
import { callAI, cn, safeJsonParse } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { Sparkles, Wand2, Copy, Check, Lightbulb } from 'lucide-react';
import toast from 'react-hot-toast';

function deterministicCleanup(text: string) {
  let out = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  out = out.replace(/^(In conclusion|In today's world|It is important to note that|As we all know)[,:]?\s*/gim, '');
  const sentences = out.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const sentence of sentences) {
    const key = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 8).join(' ');
    if (key && seen.has(key)) continue;
    if (key) seen.add(key); unique.push(sentence);
  }
  return unique.join(' ').replace(/\s+([,.!?;:])/g, '$1');
}

export default function ResearchLab({ projectId, userId, region, persona }: { projectId: string; userId: string; region: string; persona: string }) {
  const [text, setText] = useState('');
  const [cleaned, setCleaned] = useState('');
  const [editing, setEditing] = useState(false);
  const [fact, setFact] = useState<any>(null);
  const [factLoading, setFactLoading] = useState(false);

  const analyze = () => {
    if (!text.trim()) return toast.error('Paste some text first');
    setCleaned(deterministicCleanup(text));
    toast.success('Local cleanup complete — no AI tokens used');
  };

  const rewrite = async () => {
    const source = cleaned || text;
    if (!source.trim()) return toast.error('Paste some text first');
    setEditing(true);
    try {
      const raw = await callAI({ task: 'research_editor', region, persona, format: 'json', prompt: `Rewrite this learner-provided research draft into clear, natural, original study prose while preserving the author's actual claims and meaning. Do not invent citations, facts, or sources. Do not try to evade plagiarism or AI detectors. Remove filler, repetitive headings, generic AI-sounding transitions, and unnecessary verbosity. Keep technical terms accurate. Return JSON {"text": string, "changes": [string]}.\n\nDraft:\n${source.slice(0, 18000)}` });
      const data = safeJsonParse(raw); if (!data?.text) throw new Error('Editor returned invalid output');
      setCleaned(data.text); toast.success('Originality-focused rewrite ready');
    } catch (e: any) { toast.error(e.message || 'Rewrite failed'); }
    finally { setEditing(false); }
  };

  const generateFact = async () => {
    setFactLoading(true);
    try {
      const topic = text.trim().slice(0, 120) || 'a useful university or secondary-school study topic';
      const raw = await callAI({ task: 'fact', region, persona, format: 'json', prompt: `Generate one genuinely useful, verifiable learning fact related to this topic: ${topic}. Pick one type: short history, scientific fact, important person, important date, real-life application, name/term origin, or a short memorable fact/story. Keep it under 80 words. Do not invent statistics. Return JSON {"type": string, "title": string, "fact": string}.` });
      const data = safeJsonParse(raw); if (!data?.fact) throw new Error('Could not generate fact');
      setFact(data);
      await supabase.from('ai_facts').insert({ user_id: userId, project_id: projectId, topic, fact_type: data.type || 'fact', content: data.fact });
    } catch (e: any) { toast.error(e.message || 'Fact generation failed'); }
    finally { setFactLoading(false); }
  };

  return <div className="p-4 max-w-3xl mx-auto space-y-4">
    <div className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-3xl p-6"><p className="text-xs uppercase tracking-wider font-bold opacity-70">Research workspace</p><h2 className="text-2xl font-black mt-1">Think, edit, verify</h2><p className="text-sm text-indigo-100 mt-2">Local cleanup handles simple formatting first. AI is used only when you ask for deeper editing or a generated fact.</p></div>
    <section className="bg-white rounded-3xl p-5 space-y-3">
      <div><p className="font-bold text-sm">Originality editor</p><p className="text-xs text-gray-500 mt-1">Paste your own draft or notes. Akili can remove filler and repetitive AI-style phrasing, then help you express your own ideas naturally. It is not a plagiarism/AI-detector bypass.</p></div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={9} placeholder="Paste your research notes or draft here..." className="w-full rounded-2xl border border-gray-200 p-4 text-sm resize-y focus:outline-none focus:border-indigo-500" />
      <div className="flex flex-wrap gap-2"><button onClick={analyze} className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold"><Wand2 size={14} className="inline mr-1" /> Local cleanup</button><button onClick={rewrite} disabled={editing || !text.trim()} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">{editing ? 'Editing...' : 'AI originality edit'}</button></div>
      {cleaned && <div className="rounded-2xl bg-gray-50 p-4"><div className="flex justify-between gap-2 mb-2"><p className="text-xs font-bold text-gray-500">Result</p><button onClick={() => navigator.clipboard.writeText(cleaned)} className="text-xs text-indigo-600 font-bold"><Copy size={12} className="inline mr-1" />Copy</button></div><p className="text-sm whitespace-pre-wrap leading-relaxed">{cleaned}</p></div>}
    </section>
    <section className="bg-white rounded-3xl p-5 space-y-3"><div><p className="font-bold text-sm">Generate a fact</p><p className="text-xs text-gray-500 mt-1">A small memory hook: history, science, person, date, application, terminology, or a memorable story.</p></div><button onClick={generateFact} disabled={factLoading} className="px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold disabled:opacity-50"><Lightbulb size={14} className="inline mr-1" />{factLoading ? 'Generating...' : 'Give me a fact'}</button>{fact && <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4"><p className="text-[10px] uppercase font-bold text-amber-700">{fact.type}</p><p className="font-black mt-1">{fact.title}</p><p className="text-sm text-gray-700 mt-2">{fact.fact}</p></div>}</section>
  </div>;
}
