// QuizMode.tsx
'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAI, safeJsonParse, cn } from '@/lib/utils';
import { HelpCircle, Loader2, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props { projectId: string; userId: string; region: string; persona: string; }

export default function QuizMode({ projectId, userId, region, persona }: Props) {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    setGenerating(true);
    setQuestions([]); setAnswers({}); setSubmitted(false);
    try {
      const { data: docs } = await supabase.from('documents').select('content').eq('project_id', projectId).eq('user_id', userId).limit(3);
      const context = docs?.map(d => d.content).join('\n\n').slice(0, 6000) || '';

      const prompt = `Generate 5 multiple choice questions about "${topic || 'the main topics'}" at ${difficulty} difficulty.
${context ? `Based on this material:\n${context}` : ''}

Return JSON: { "questions": [{ "id": string, "question": string, "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": "A"|"B"|"C"|"D", "explanation": string }] }`;

      const raw = await callAI({ task: 'quiz', prompt, region, persona, format: 'json' });
      const data = safeJsonParse(raw);
      if (!data?.questions?.length) throw new Error('No questions generated');
      setQuestions(data.questions);
    } catch (err: any) { toast.error(err.message); }
    finally { setGenerating(false); }
  };

  const submit = async () => {
    setSubmitted(true);
    const score = questions.filter(q => answers[q.id] === q.correct_answer).length;
    await supabase.from('exam_attempts').insert({
      project_id: projectId, user_id: userId, type: 'quiz',
      questions, answers, score, total: questions.length,
    });
  };

  const score = questions.filter(q => answers[q.id] === q.correct_answer).length;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="bg-white rounded-3xl p-5 space-y-3">
        <h2 className="font-black flex items-center gap-2"><HelpCircle size={18} className="text-indigo-600" /> Quiz</h2>
        <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic (optional — leave blank for general review)"
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" />
        <div className="flex gap-2">
          {['easy', 'medium', 'hard'].map(d => (
            <button key={d} onClick={() => setDifficulty(d)}
              className={cn('px-4 py-2 rounded-full text-xs font-bold capitalize', difficulty === d ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500')}>
              {d}
            </button>
          ))}
        </div>
        <button onClick={generate} disabled={generating}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2">
          {generating ? <><Loader2 size={15} className="animate-spin" /> Generating...</> : 'Generate Quiz'}
        </button>
      </div>

      {questions.map((q, i) => (
        <div key={q.id} className="bg-white rounded-3xl p-5 space-y-3">
          <p className="font-semibold text-sm">{i + 1}. {q.question}</p>
          <div className="space-y-2">
            {q.options?.map((opt: string) => {
              const letter = opt[0];
              const isSelected = answers[q.id] === letter;
              const isCorrect = submitted && letter === q.correct_answer;
              const isWrong = submitted && isSelected && !isCorrect;
              return (
                <button key={opt} disabled={submitted} onClick={() => setAnswers(p => ({ ...p, [q.id]: letter }))}
                  className={cn('w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-all flex items-center justify-between',
                    isCorrect ? 'border-emerald-500 bg-emerald-50' : isWrong ? 'border-rose-400 bg-rose-50' : isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300')}>
                  {opt}
                  {submitted && isCorrect && <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />}
                  {submitted && isWrong && <XCircle size={15} className="text-rose-500 shrink-0" />}
                </button>
              );
            })}
          </div>
          {submitted && <p className="text-xs text-gray-500">💡 {q.explanation}</p>}
        </div>
      ))}

      {questions.length > 0 && !submitted && (
        <button onClick={submit} disabled={Object.keys(answers).length < questions.length}
          className="w-full py-3.5 bg-gray-900 text-white rounded-2xl font-bold text-sm disabled:opacity-40">
          Submit ({Object.keys(answers).length}/{questions.length} answered)
        </button>
      )}

      {submitted && (
        <div className="bg-white rounded-3xl p-5 text-center space-y-3">
          <p className="text-4xl font-black text-indigo-600">{score}<span className="text-2xl text-gray-400">/{questions.length}</span></p>
          <p className="text-sm text-gray-500">{score === questions.length ? '🎉 Perfect score!' : score >= questions.length * 0.7 ? '👍 Good work!' : '📚 Keep studying!'}</p>
          <button onClick={() => { setQuestions([]); setAnswers({}); setSubmitted(false); }}
            className="flex items-center gap-2 mx-auto text-sm text-indigo-600 font-semibold hover:underline">
            <RotateCcw size={14} /> Try Again
          </button>
        </div>
      )}
    </div>
  );
}
