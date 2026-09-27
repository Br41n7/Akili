'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { callAI, safeJsonParse, cn } from '@/lib/utils';
import { compactLearnerContext, getLearnerContext, recordEvidence } from '@/lib/adaptive';
import { ShieldAlert, Loader2, Clock, CheckCircle2, XCircle, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props { projectId: string; userId: string; region: string; persona: string; }

const DURATION = 45 * 60; // 45 minutes in seconds

export default function ExamMode({ projectId, userId, region, persona }: Props) {
  const [exam, setExam] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [analysis, setAnalysis] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [started, setStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (started && timeLeft > 0) {
      timerRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0) {
      handleSubmit();
    }
    return () => clearInterval(timerRef.current);
  }, [started, timeLeft]);

  const generate = async () => {
    setGenerating(true);
    try {
      const [{ data: docs }, learner] = await Promise.all([
        supabase.from('documents').select('content').eq('project_id', projectId).eq('user_id', userId).limit(4),
        getLearnerContext(projectId, userId),
      ]);
      const context = docs?.map(d => d.content).join('\n\n').slice(0, 7000) || '';
      if (!context) { toast.error('Add study materials first'); setGenerating(false); return; }
      const adaptive = compactLearnerContext(learner);

      const prompt = `Create a 10-question adaptive exam mixing: multiple_choice, true_false, concept_trap (tricky question testing deep understanding).
Context: ${context}

Learner context (evidence, not absolute truth): ${JSON.stringify(adaptive)}
Prioritize concepts that need practice while still sampling strong areas. Include concept and cognitive_level on every question.

Return JSON: { "title": string, "questions": [{ "id": string, "type": "multiple_choice"|"true_false"|"concept_trap", "question": string, "options": ["A) ...", "B) ...","C) ...","D) ..."], "correct_answer": string, "explanation": string, "concept": string, "cognitive_level": string }] }`;

      const raw = await callAI({ task: 'exam', prompt, region, persona, format: 'json' });
      const data = safeJsonParse(raw);
      if (!data?.questions?.length) throw new Error('Exam generation failed');
      setExam(data);
    } catch (err: any) { toast.error(err.message); }
    finally { setGenerating(false); }
  };

  const handleSubmit = async () => {
    clearInterval(timerRef.current);
    setStarted(false);
    setAnalyzing(true);

    const score = exam.questions.filter((q: any) => answers[q.id] === q.correct_answer).length;

    try {
      const prompt = `Analyze these exam results and identify weak concepts.
Exam: ${JSON.stringify(exam.questions.map((q: any) => ({ id: q.id, concept: q.concept, correct: q.correct_answer })))}
Answers: ${JSON.stringify(answers)}

Return JSON: { "score": ${score}, "total": ${exam.questions.length}, "weak_concepts": [string], "strong_concepts": [string], "recommendations": [string], "overall_verdict": string }`;

      const raw = await callAI({ task: 'exam', prompt, region, persona, format: 'json' });
      const analysisData = safeJsonParse(raw);

      await supabase.from('exam_attempts').insert({
        project_id: projectId, user_id: userId, type: 'exam',
        questions: exam.questions, answers, score, total: exam.questions.length,
        analysis: analysisData, time_taken_seconds: DURATION - timeLeft,
      });

      // Feed per-question evidence into the adaptive learner model.
      for (const q of exam.questions) {
        const correct = answers[q.id] === q.correct_answer;
        await recordEvidence({
          userId,
          projectId,
          concept: q.concept || 'General',
          sourceType: 'exam',
          interactionType: q.cognitive_level || q.type || 'assessment',
          prompt: q.question,
          learnerResponse: answers[q.id] || '',
          correctness: correct,
          difficulty: q.type === 'concept_trap' ? 'advanced' : 'intermediate',
          evidence: correct ? 'Answered correctly in a timed assessment.' : 'Answered incorrectly in a timed assessment.',
        });
      }

      setAnalysis({ ...analysisData, score, total: exam.questions.length });
    } catch (err: any) { toast.error('Analysis failed'); }
    finally { setAnalyzing(false); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const pct = exam ? Math.round((Object.keys(answers).length / exam.questions.length) * 100) : 0;

  if (analysis) return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className={cn('rounded-3xl p-6 text-white text-center', analysis.score / analysis.total >= 0.7 ? 'bg-gradient-to-br from-indigo-500 to-violet-600' : 'bg-gradient-to-br from-rose-500 to-orange-500')}>
        <p className="text-5xl font-black">{analysis.score}<span className="text-2xl opacity-70">/{analysis.total}</span></p>
        <p className="mt-1 font-semibold">{Math.round((analysis.score / analysis.total) * 100)}%</p>
        <p className="text-sm opacity-80 mt-2">{analysis.overall_verdict}</p>
      </div>

      {analysis.weak_concepts?.length > 0 && (
        <div className="bg-rose-50 rounded-3xl p-5">
          <p className="font-bold text-sm text-rose-700 mb-2">⚠️ Weak Areas — Study These</p>
          {analysis.weak_concepts.map((c: string, i: number) => <p key={i} className="text-sm text-rose-600">• {c}</p>)}
        </div>
      )}
      {analysis.strong_concepts?.length > 0 && (
        <div className="bg-emerald-50 rounded-3xl p-5">
          <p className="font-bold text-sm text-emerald-700 mb-2">✅ Strong Areas</p>
          {analysis.strong_concepts.map((c: string, i: number) => <p key={i} className="text-sm text-emerald-600">• {c}</p>)}
        </div>
      )}
      {analysis.recommendations?.length > 0 && (
        <div className="bg-white rounded-3xl p-5">
          <p className="font-bold text-sm mb-2">📋 Recommendations</p>
          {analysis.recommendations.map((r: string, i: number) => <p key={i} className="text-sm text-gray-600 mb-1">• {r}</p>)}
        </div>
      )}
      <button onClick={() => { setExam(null); setAnswers({}); setAnalysis(null); setTimeLeft(DURATION); }}
        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-sm">
        Retake Exam
      </button>
    </div>
  );

  if (!exam) return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="bg-white rounded-3xl p-8 text-center space-y-4">
        <div className="w-14 h-14 bg-amber-100 rounded-3xl flex items-center justify-center mx-auto">
          <ShieldAlert size={26} className="text-amber-600" />
        </div>
        <h2 className="text-xl font-black">Exam Mode</h2>
        <p className="text-sm text-gray-500">A timed 45-minute exam simulation with mixed question types including concept traps designed to catch surface-level memorization.</p>
        <button onClick={generate} disabled={generating}
          className="flex items-center gap-2 mx-auto bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-8 py-3.5 rounded-2xl font-bold text-sm">
          {generating ? <><Loader2 size={16} className="animate-spin" /> Building exam...</> : '🚀 Start Exam'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      {/* Timer bar */}
      <div className="bg-white rounded-2xl p-4 flex items-center justify-between sticky top-0 z-10 border border-black/5">
        <div className="flex items-center gap-2">
          <Clock size={16} className={cn(timeLeft < 300 ? 'text-rose-500 animate-pulse' : 'text-gray-400')} />
          <span className={cn('font-black text-lg', timeLeft < 300 ? 'text-rose-500' : '')}>{fmt(timeLeft)}</span>
        </div>
        <div className="text-sm text-gray-400">{Object.keys(answers).length}/{exam.questions.length} answered</div>
        {!started ? (
          <button onClick={() => setStarted(true)} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-bold">Start Timer</button>
        ) : (
          <button onClick={handleSubmit} disabled={analyzing}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : 'Submit'}
          </button>
        )}
      </div>

      {exam.questions.map((q: any, i: number) => (
        <div key={q.id} className="bg-white rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{q.type?.replace('_', ' ')}</span>
            {q.concept && <span className="text-[10px] text-indigo-500">{q.concept}</span>}
          </div>
          <p className="font-semibold text-sm">{i + 1}. {q.question}</p>
          <div className="space-y-2">
            {(q.type === 'true_false' ? ['A) True', 'B) False'] : q.options || []).map((opt: string) => {
              const letter = opt[0];
              return (
                <button key={opt} onClick={() => setAnswers(p => ({ ...p, [q.id]: letter }))}
                  className={cn('w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-all',
                    answers[q.id] === letter ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300')}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
