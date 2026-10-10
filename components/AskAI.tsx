'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAI, callAIJSON, cn, errorMessage } from '@/lib/utils';
import ConceptVisual from '@/components/visual/ConceptVisual';
import { compactLearnerContext, getLearnerContext, recordEvidence } from '@/lib/adaptive';
import { Brain, MessageSquare, Send } from 'lucide-react';
import { Button, IconButton, OptionRow, Prose, Surface, TextArea, splitOption, type OptionState } from '@/components/ui';

interface Props { projectId: string; userId: string; region: string; persona: string; onGoToMaterials?: () => void }
interface Message { role: 'user' | 'ai'; text: string; failed?: boolean }
interface QuickQuestion { id: string; question: string; options: string[]; correct_answer: string; explanation: string; concept: string; cognitive_level: string }

export default function AskAI({ projectId, userId, region, persona, onGoToMaterials }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [noMaterials, setNoMaterials] = useState(false);
  const [practiceFor, setPracticeFor] = useState<number | null>(null);
  const [practice, setPractice] = useState<QuickQuestion[]>([]);
  const [practiceError, setPracticeError] = useState('');
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>({});
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, practice]);

  useEffect(() => {
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', userId)
      .then(({ count }) => setNoMaterials(!count));
  }, [projectId, userId]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const history = [...messages, { role: 'user' as const, text }];
    setMessages(history);
    setInput('');
    setLoading(true);

    try {
      const [{ data: docs }, learner] = await Promise.all([
        supabase.from('documents').select('content, name').eq('project_id', projectId).eq('user_id', userId).limit(4),
        getLearnerContext(projectId, userId),
      ]);
      const context = (docs || []).map(d => `[${d.name}]\n${d.content}`).join('\n\n').slice(0, 8000);
      const adaptive = compactLearnerContext(learner);
      const historyText = messages.slice(-6).map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');

      const prompt = `You are Akili, an adaptive AI tutor. Answer the student's question using the project materials and the learner context below.

Project materials:
${context || 'No materials uploaded yet. Answer from general syllabus knowledge for the learner’s level, and mention that adding materials would make answers more specific.'}

Learner context (evidence, not absolute truth): ${JSON.stringify(adaptive)}

Conversation so far:
${historyText || 'No previous conversation.'}

Student question: ${text}

Teach for understanding, not just completion. If the learner seems confused, explain the missing prerequisite or use a simpler example instead of adding more information. Do not mention internal mastery scores. Answer in markdown, using short paragraphs.`;

      const result = await callAI({ task: 'adaptive_tutor', prompt, region, persona, projectId });
      setMessages(p => [...p, { role: 'ai', text: result }]);
    } catch (err) {
      setMessages(p => [...p, { role: 'ai', text: errorMessage(err, 'Something went wrong. Please try asking again.'), failed: true }]);
    } finally {
      setLoading(false);
    }
  };

  const startQuickCheck = async (messageIndex: number) => {
    const aiMessage = messages[messageIndex];
    if (!aiMessage) return;
    const precedingUser = [...messages.slice(0, messageIndex)].reverse().find(m => m.role === 'user');
    setPracticeFor(messageIndex);
    setPractice([]); setPracticeAnswers({}); setPracticeSubmitted(false); setPracticeLoading(true); setPracticeError('');

    try {
      const learner = await getLearnerContext(projectId, userId);
      const adaptive = compactLearnerContext(learner);
      const prompt = `Create a 3-question quick understanding check based on this tutoring exchange.
Student question: ${precedingUser?.text || 'General study discussion'}
Tutor explanation: ${aiMessage.text}

Learner context: ${JSON.stringify(adaptive)}

The questions must test understanding, not copying sentences from the explanation. Progress from understanding to application/transfer. Include concept and cognitive_level for each question.
Return JSON: { "questions": [{ "id": string, "question": string, "options": ["A) ...","B) ...","C) ...","D) ..."], "correct_answer": "A"|"B"|"C"|"D", "explanation": string, "concept": string, "cognitive_level": string }] }`;
      const data = await callAIJSON<any>({ task: 'adaptive_quiz', prompt, region, persona, projectId, validationType: 'quick_check' });
      setPractice(data.questions.slice(0, 3));
    } catch (err) {
      setPracticeError(errorMessage(err, 'Could not build a quick check.'));
    } finally {
      setPracticeLoading(false);
    }
  };

  const submitQuickCheck = async () => {
    setPracticeSubmitted(true);
    for (const q of practice) {
      try {
        await recordEvidence({
          userId, projectId, concept: q.concept || 'General', sourceType: 'practice',
          interactionType: q.cognitive_level || 'quick_check', prompt: q.question,
          learnerResponse: practiceAnswers[q.id] || '', correctness: practiceAnswers[q.id] === q.correct_answer,
          difficulty: 'adaptive', evidence: q.explanation,
        });
      } catch { /* progress tracking must never block the chat */ }
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-116px)] flex-col md:min-h-[calc(100dvh-180px)]">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-biro-wash text-biro-dark"><MessageSquare size={22} /></span>
            <p className="font-bold text-ink">Ask about your materials</p>
            <p className="max-w-xs text-sm text-muted">Akili answers using what you have uploaded and adapts to what you already understand.</p>
            {noMaterials && onGoToMaterials && (
              <Button variant="quiet" size="sm" className="mt-2" onClick={onGoToMaterials}>Add materials first</Button>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[86%] space-y-1.5', msg.role === 'ai' && 'w-full')}>
              {msg.role === 'user' ? (
                <div className="rounded-2xl rounded-br-md bg-biro px-4 py-2.5 font-read text-[15px] leading-relaxed text-white">{msg.text}</div>
              ) : msg.failed ? (
                <p className="rounded-2xl rounded-bl-md bg-redpen-wash px-4 py-2.5 text-sm text-redpen">{msg.text}</p>
              ) : (
                <div className="rounded-2xl rounded-bl-md border border-rule bg-paper px-4 py-3"><Prose className="text-[15px]">{msg.text}</Prose></div>
              )}

              {msg.role === 'ai' && !msg.failed && (
                <button onClick={() => startQuickCheck(i)} className="ml-1 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-biro">
                  <Brain size={13} /> Check my understanding
                </button>
              )}
              {msg.role === 'ai' && !msg.failed && (
                <ConceptVisual compact concept={([...messages.slice(0, i)].reverse().find(m => m.role === 'user')?.text || 'this explanation').slice(0, 80)} text={msg.text} projectId={projectId} userId={userId} region={region} persona={persona} />
              )}

              {practiceFor === i && (
                <div className="space-y-2.5 pt-1">
                  {practiceLoading && <Surface className="p-3 text-sm text-muted">Building a quick check…</Surface>}
                  {practiceError && <Surface className="border-redpen/30 p-3 text-sm text-redpen">{practiceError}</Surface>}
                  {practice.map((q, qi) => (
                    <Surface key={q.id} className="space-y-2 p-3.5">
                      <p className="text-xs font-semibold text-biro">{q.concept}</p>
                      <p className="font-read text-[15px] font-semibold leading-snug">{qi + 1}. {q.question}</p>
                      {q.options.map(opt => {
                        const { letter, text } = splitOption(opt);
                        const picked = practiceAnswers[q.id] === letter;
                        let state: OptionState = picked ? 'selected' : 'idle';
                        if (practiceSubmitted) state = letter === q.correct_answer ? (picked ? 'correct' : 'missed') : picked ? 'wrong' : 'idle';
                        return <OptionRow key={letter} letter={letter} text={text} state={state} disabled={practiceSubmitted} onClick={() => setPracticeAnswers(a => ({ ...a, [q.id]: letter }))} />;
                      })}
                      {practiceSubmitted && q.explanation && <p className="text-xs leading-relaxed text-muted">{q.explanation}</p>}
                    </Surface>
                  ))}
                  {practice.length > 0 && !practiceSubmitted && (
                    <Button size="sm" block disabled={Object.keys(practiceAnswers).length < practice.length} onClick={submitQuickCheck}>Check answers</Button>
                  )}
                  {practiceSubmitted && <p className="text-xs font-semibold text-tick">Added to your learning profile.</p>}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2">
            <div className="rounded-2xl rounded-bl-md border border-rule bg-paper px-4 py-3">
              <span className="flex gap-1">
                {[0, 150, 300].map(d => <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />)}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="pb-safe sticky bottom-[64px] flex items-end gap-2 border-t border-rule bg-paper p-3 md:static">
        <TextArea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about your materials"
          rows={1}
          className="max-h-28 resize-none py-2.5"
        />
        <IconButton label="Send" onClick={send} disabled={!input.trim() || loading} className="bg-biro text-white hover:bg-biro-dark disabled:opacity-40"><Send size={18} /></IconButton>
      </div>
    </div>
  );
}
