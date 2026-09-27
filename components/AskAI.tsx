'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { callAI, safeJsonParse, cn } from '@/lib/utils';
import { compactLearnerContext, getLearnerContext, recordEvidence } from '@/lib/adaptive';
import { MessageSquare, Send, Loader2, Bot, Brain, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props { projectId: string; userId: string; region: string; persona: string; }
interface Message { role: 'user' | 'ai'; text: string; }
interface QuickQuestion { id: string; question: string; options: string[]; correct_answer: string; explanation: string; concept: string; cognitive_level: string; }

export default function AskAI({ projectId, userId, region, persona }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [practiceFor, setPracticeFor] = useState<number | null>(null);
  const [practice, setPractice] = useState<QuickQuestion[]>([]);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>({});
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, practice]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    const nextMessages = [...messages, { role: 'user' as const, text: userMsg }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const [{ data: docs }, learner] = await Promise.all([
        supabase.from('documents').select('content, name').eq('project_id', projectId).eq('user_id', userId).limit(4),
        getLearnerContext(projectId, userId),
      ]);
      const context = docs?.map(d => `[${d.name}]\n${d.content}`).join('\n\n').slice(0, 8000) || '';
      const adaptive = compactLearnerContext(learner);
      const historyText = messages.slice(-6).map(m => `${m.role === 'user' ? 'Student' : 'AI'}: ${m.text}`).join('\n');

      const prompt = `You are Akili, an adaptive AI tutor. Answer the student's question using the project materials while considering the learner context below.

Project Materials:
${context || 'No materials uploaded yet.'}

Learner context (evidence, not absolute truth):
${JSON.stringify(adaptive)}

Conversation so far:
${historyText || 'No previous conversation.'}

Student question: ${userMsg}

Teach for understanding, not just completion. If the learner appears confused, explain the missing prerequisite or use a simpler example instead of dumping more information. Do not mention internal mastery scores. Answer clearly and concisely. If the answer isn't in the materials, say so but still help.`;

      const result = await callAI({ task: 'adaptive_tutor', prompt, region, persona, format: 'text' });
      setMessages(p => [...p, { role: 'ai', text: result }]);
    } catch (err: any) {
      toast.error(err.message || 'AI request failed');
      setMessages(p => [...p, { role: 'ai', text: 'Sorry, something went wrong. Please try again.' }]);
    } finally { setLoading(false); }
  };

  const startQuickCheck = async (messageIndex: number) => {
    const aiMessage = messages[messageIndex];
    if (!aiMessage) return;
    const precedingUser = [...messages.slice(0, messageIndex)].reverse().find(m => m.role === 'user');
    setPracticeFor(messageIndex);
    setPractice([]); setPracticeAnswers({}); setPracticeSubmitted(false); setPracticeLoading(true);

    try {
      const learner = await getLearnerContext(projectId, userId);
      const adaptive = compactLearnerContext(learner);
      const prompt = `Create a 3-question quick understanding check based on this tutoring exchange.
Student question: ${precedingUser?.text || 'General study discussion'}
Tutor explanation: ${aiMessage.text}

Learner context: ${JSON.stringify(adaptive)}

The questions must test understanding rather than copying sentences from the explanation. Progress from understanding to application/transfer. Include concept and cognitive_level for each question.
Return JSON: { "questions": [{ "id": string, "question": string, "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "A"|"B"|"C"|"D", "explanation": string, "concept": string, "cognitive_level": string }] }`;
      const raw = await callAI({ task: 'adaptive_quiz', prompt, region, persona, format: 'json' });
      const data = safeJsonParse(raw);
      if (!data?.questions?.length) throw new Error('Could not generate a quick check');
      setPractice(data.questions.slice(0, 3));
    } catch (err: any) { toast.error(err.message || 'Could not generate practice'); setPracticeFor(null); }
    finally { setPracticeLoading(false); }
  };

  const submitQuickCheck = async () => {
    setPracticeSubmitted(true);
    for (const q of practice) {
      await recordEvidence({
        userId,
        projectId,
        concept: q.concept || 'General',
        sourceType: 'practice',
        interactionType: q.cognitive_level || 'quick_check',
        prompt: q.question,
        learnerResponse: practiceAnswers[q.id] || '',
        correctness: practiceAnswers[q.id] === q.correct_answer,
        difficulty: 'adaptive',
        evidence: q.explanation,
      });
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-120px)]">
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-2 py-12">
            <div className="w-14 h-14 bg-indigo-100 rounded-3xl flex items-center justify-center"><MessageSquare size={24} className="text-indigo-500" /></div>
            <p className="font-semibold">Ask anything about your materials</p>
            <p className="text-sm">I'll teach with your materials and adapt to what you understand</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'ai' && <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center shrink-0 mr-2 mt-1"><Bot size={14} className="text-indigo-600" /></div>}
            <div className="max-w-[84%]">
              <div className={cn('px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap', msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white border border-black/5 text-gray-800 rounded-bl-sm')}>
                {msg.text}
              </div>
              {msg.role === 'ai' && i > 0 && (
                <button onClick={() => startQuickCheck(i)} className="mt-1.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 px-1">
                  <Brain size={12} /> Check my understanding
                </button>
              )}
              {practiceFor === i && (
                <div className="mt-3 w-full space-y-2">
                  {practiceLoading && <div className="bg-white border rounded-2xl p-4 text-xs text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Building a quick check...</div>}
                  {practice.map((q, qi) => (
                    <div key={q.id} className="bg-white border border-indigo-100 rounded-2xl p-4 space-y-2">
                      <div className="flex gap-2 items-center"><span className="text-[10px] font-bold text-indigo-600">{q.concept}</span><span className="text-[10px] text-gray-400">{q.cognitive_level}</span></div>
                      <p className="text-xs font-semibold">{qi + 1}. {q.question}</p>
                      {q.options.map(opt => {
                        const letter = opt[0]; const selected = practiceAnswers[q.id] === letter; const correct = practiceSubmitted && letter === q.correct_answer; const wrong = practiceSubmitted && selected && !correct;
                        return <button key={opt} disabled={practiceSubmitted} onClick={() => setPracticeAnswers(p => ({ ...p, [q.id]: letter }))}
                          className={cn('w-full text-left px-3 py-2 rounded-xl border text-xs', correct ? 'border-emerald-500 bg-emerald-50' : wrong ? 'border-rose-400 bg-rose-50' : selected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200')}>
                          <span className="flex justify-between">{opt}{correct && <CheckCircle2 size={13} className="text-emerald-600" />}{wrong && <XCircle size={13} className="text-rose-500" />}</span>
                        </button>;
                      })}
                      {practiceSubmitted && <p className="text-[11px] text-gray-500">💡 {q.explanation}</p>}
                    </div>
                  ))}
                  {practice.length > 0 && !practiceSubmitted && <button onClick={submitQuickCheck} disabled={Object.keys(practiceAnswers).length < practice.length} className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold disabled:opacity-40">Submit quick check</button>}
                  {practiceSubmitted && <p className="text-[11px] text-indigo-600 font-semibold">Your answers have been added to your learning profile.</p>}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="flex items-center gap-2"><div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center"><Bot size={14} className="text-indigo-600" /></div><div className="bg-white border border-black/5 px-4 py-3 rounded-2xl rounded-bl-sm"><div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div></div></div>}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 bg-white border-t border-black/8 flex items-end gap-2">
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about your materials... (Enter to send)" rows={1} className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-indigo-500 max-h-28" />
        <button onClick={send} disabled={!input.trim() || loading} className="w-11 h-11 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-2xl flex items-center justify-center shrink-0 transition-all"><Send size={16} /></button>
      </div>
    </div>
  );
}
