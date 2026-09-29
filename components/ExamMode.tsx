'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAIJSON, cn, errorMessage } from '@/lib/utils';
import { compactLearnerContext, getLearnerContext, recordEvidence } from '@/lib/adaptive';
import { Clock, Flag, RotateCcw, ShieldAlert, X } from 'lucide-react';
import {
  Button, ConfirmDialog, EmptyState, ErrorState, GeneratingPanel, OptionRow, Surface, splitOption, type OptionState,
} from '@/components/ui';

interface Props { projectId: string; userId: string; region: string; persona: string; onGoToMaterials?: () => void }

const DURATION = 45 * 60;
const STEPS = ['Reading your materials', 'Choosing questions to test what you know', 'Writing the exam', 'Finalizing'];

const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

export default function ExamMode({ projectId, userId, region, persona, onGoToMaterials }: Props) {
  const [phase, setPhase] = useState<'intro' | 'generating' | 'exam' | 'submitting' | 'results'>('intro');
  const [exam, setExam] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [analysis, setAnalysis] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [error, setError] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (phase !== 'exam') return;
    if (timeLeft <= 0) { submit(); return; }
    timerRef.current = setInterval(() => setTimeLeft(t => Math.max(0, t - 1)), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, timeLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setPhase('generating'); setError('');
    try {
      const [{ data: docs }, learner] = await Promise.all([
        supabase.from('documents').select('content').eq('project_id', projectId).eq('user_id', userId).limit(4),
        getLearnerContext(projectId, userId),
      ]);
      const context = (docs || []).map(d => d.content).join('\n\n').slice(0, 7000);
      if (!context.trim()) { setError('MATERIALS'); setPhase('intro'); return; }

      const adaptive = compactLearnerContext(learner);
      const prompt = `Create a 10-question timed exam mixing multiple_choice, true_false and concept_trap (a tricky question that catches surface-level memorization).

Context:
${context}

Learner context (evidence, not absolute truth): ${JSON.stringify(adaptive)}
Prioritize concepts that need practice while still sampling strong areas. Include concept and cognitive_level on every question.

Return JSON:
{"title": string, "questions": [{"id": string, "type": "multiple_choice"|"true_false"|"concept_trap", "question": string, "options": ["A) ...","B) ...","C) ...","D) ..."], "correct_answer": string, "explanation": string, "concept": string, "cognitive_level": string}]}`;

      const data = await callAIJSON<any>({ task: 'exam', prompt, region, persona, projectId, validationType: 'exam' });
      setExam(data); setAnswers({}); setFlagged(new Set()); setIndex(0); setAnalysis(null); setTimeLeft(DURATION);
      setPhase('exam');
    } catch (err) {
      setError(errorMessage(err, 'We could not build the exam. Please try again.'));
      setPhase('intro');
    }
  };

  const submit = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setConfirmSubmit(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase('submitting');

    const score = exam.questions.filter((q: any) => answers[q.id] === q.correct_answer).length;
    let analysisData: any = null;
    try {
      const prompt = `Analyze these exam results and identify weak concepts.
Exam: ${JSON.stringify(exam.questions.map((q: any) => ({ id: q.id, concept: q.concept, correct: q.correct_answer })))}
Answers: ${JSON.stringify(answers)}
Return JSON: {"overall_verdict": string, "weak_concepts": [string], "strong_concepts": [string], "recommendations": [string]}`;
      analysisData = await callAIJSON<any>({ task: 'exam', prompt, region, persona, projectId, validationType: 'exam_analysis' }).catch(() => null);

      await supabase.from('exam_attempts').insert({
        project_id: projectId, user_id: userId, type: 'exam',
        questions: exam.questions, answers, score, total: exam.questions.length,
        analysis: analysisData, time_taken_seconds: DURATION - timeLeft,
      });

      for (const q of exam.questions) {
        const correct = answers[q.id] === q.correct_answer;
        await recordEvidence({
          userId, projectId, concept: q.concept || 'General', sourceType: 'exam',
          interactionType: q.cognitive_level || q.type || 'assessment',
          prompt: q.question, learnerResponse: answers[q.id] || '', correctness: correct,
          difficulty: q.type === 'concept_trap' ? 'advanced' : 'intermediate',
          evidence: correct ? 'Answered correctly in a timed assessment.' : 'Answered incorrectly in a timed assessment.',
        });
      }
    } catch {
      /* the learner still gets their score even if analysis or saving partly fails */
    }
    setAnalysis({ ...(analysisData || {}), score, total: exam.questions.length });
    submittingRef.current = false;
    setPhase('results');
  };

  const retake = () => { setExam(null); setAnswers({}); setFlagged(new Set()); setIndex(0); setAnalysis(null); setTimeLeft(DURATION); setPhase('intro'); };

  const toggleFlag = (id: string) => setFlagged(f => { const n = new Set(f); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Intro ─────────────────────────────────────────────────────────────────

  if (phase === 'intro') {
    return (
      <div className="p-4">
        {error === 'MATERIALS' ? (
          <>
            <EmptyState icon={<ShieldAlert size={22} />} title="Add materials first">
              Exam mode builds questions from your notes and documents. Add some in the Materials tab, then come back.
            </EmptyState>
            {onGoToMaterials && <Button block className="mt-4" variant="quiet" onClick={onGoToMaterials}>Go to Materials</Button>}
          </>
        ) : (
          <>
            <EmptyState
              icon={<ShieldAlert size={22} />}
              title="Exam Mode"
              action={<Button onClick={generate}>Start exam</Button>}
            >
              A timed, 10-question mock exam with mixed question types, including a few tricky ones that catch surface-level memorizing.
            </EmptyState>
            {error && <div className="mt-4"><ErrorState message={error} onRetry={generate} /></div>}
          </>
        )}
      </div>
    );
  }

  if (phase === 'generating') return <div className="p-4"><GeneratingPanel title="Building your exam" steps={STEPS} /></div>;
  if (phase === 'submitting') return <div className="p-4"><GeneratingPanel title="Marking your exam" steps={['Checking your answers', 'Finding weak and strong areas', 'Saving your result']} /></div>;

  // ── Results ───────────────────────────────────────────────────────────────

  if (phase === 'results') {
    const pct = Math.round((analysis.score / analysis.total) * 100);
    const pass = pct >= 70;
    return (
      <div className="space-y-4 p-4">
        <Surface className={cn('p-6 text-center text-white', pass ? 'bg-tick' : 'bg-redpen')}>
          <p className="text-6xl font-extrabold tracking-tight">{analysis.score}<span className="text-3xl opacity-70">/{analysis.total}</span></p>
          <p className="mt-1 text-lg font-bold">{pct}%</p>
          {analysis.overall_verdict && <p className="mt-2 text-sm opacity-90">{analysis.overall_verdict}</p>}
        </Surface>

        {analysis.weak_concepts?.length > 0 && (
          <Surface className="border-redpen/30 p-4">
            <p className="mb-1.5 text-sm font-bold text-redpen">Study these next</p>
            {analysis.weak_concepts.map((c: string, i: number) => <p key={i} className="text-sm leading-relaxed">{c}</p>)}
          </Surface>
        )}
        {analysis.strong_concepts?.length > 0 && (
          <Surface className="border-tick/30 p-4">
            <p className="mb-1.5 text-sm font-bold text-tick">You have these down</p>
            {analysis.strong_concepts.map((c: string, i: number) => <p key={i} className="text-sm leading-relaxed">{c}</p>)}
          </Surface>
        )}
        {analysis.recommendations?.length > 0 && (
          <Surface className="p-4">
            <p className="mb-1.5 text-sm font-bold">Recommendations</p>
            {analysis.recommendations.map((r: string, i: number) => <p key={i} className="text-sm leading-relaxed text-muted">{r}</p>)}
          </Surface>
        )}

        <Button block onClick={retake}><RotateCcw size={16} /> Retake exam</Button>
      </div>
    );
  }

  // ── Exam ──────────────────────────────────────────────────────────────────

  const q = exam.questions[index];
  const options = q.type === 'true_false' ? ['A) True', 'B) False'] : q.options || [];
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="sticky top-14 z-30 -mx-4 flex items-center gap-3 border-b border-rule bg-chalk/95 px-4 py-2.5 backdrop-blur md:top-[6.5rem]">
        <span className={cn('flex items-center gap-1.5 font-mono text-base font-bold tabular-nums', timeLeft < 300 && 'text-redpen')}>
          <Clock size={16} className={timeLeft < 300 ? 'animate-pulse' : ''} /> {fmt(timeLeft)}
        </span>
        <button onClick={() => setShowNav(true)} className="flex-1 text-center text-sm font-semibold text-muted underline-offset-2 hover:underline">
          {answeredCount}/{exam.questions.length} answered
        </button>
        <Button size="sm" variant="dark" onClick={() => setConfirmSubmit(true)}>Submit</Button>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">Question {index + 1} of {exam.questions.length}</span>
        <button onClick={() => toggleFlag(q.id)} aria-pressed={flagged.has(q.id)} className={cn('flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold', flagged.has(q.id) ? 'bg-marker text-ink' : 'text-muted')}>
          <Flag size={14} /> {flagged.has(q.id) ? 'Flagged' : 'Flag for review'}
        </button>
      </div>

      <p className="font-read text-[1.25rem] font-semibold leading-snug">{q.question}</p>

      <div role="radiogroup" aria-label="Answer options" className="space-y-2">
        {options.map((opt: string) => {
          const { letter, text } = splitOption(opt);
          const picked = answers[q.id] === letter;
          const state: OptionState = picked ? 'selected' : 'idle';
          return <OptionRow key={letter} letter={letter} text={text} state={state} onClick={() => setAnswers(a => ({ ...a, [q.id]: letter }))} />;
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <Button variant="quiet" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>Previous</Button>
        {index === exam.questions.length - 1 ? (
          <Button variant="dark" onClick={() => setConfirmSubmit(true)}>Review & submit</Button>
        ) : (
          <Button variant="dark" onClick={() => setIndex(i => i + 1)}>Next</Button>
        )}
      </div>

      {showNav && (
        <div className="fixed inset-0 z-[70] flex items-end bg-ink/50 animate-fade" onClick={() => setShowNav(false)}>
          <div role="dialog" aria-modal="true" aria-label="Jump to question" onClick={e => e.stopPropagation()} className="pb-safe w-full animate-sheet rounded-t-3xl bg-paper p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">Questions</h2>
              <button onClick={() => setShowNav(false)} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg active:bg-chalk"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-5 gap-2 xs:grid-cols-6">
              {exam.questions.map((eq: any, i: number) => {
                const answeredQ = !!answers[eq.id];
                return (
                  <button
                    key={eq.id}
                    onClick={() => { setIndex(i); setShowNav(false); }}
                    className={cn(
                      'relative flex h-12 items-center justify-center rounded-xl border text-sm font-bold',
                      i === index ? 'border-ink bg-ink text-white' : answeredQ ? 'border-tick bg-tick-wash text-tick' : 'border-rule text-muted',
                    )}
                  >
                    {i + 1}
                    {flagged.has(eq.id) && <Flag size={10} className="absolute -right-1 -top-1 fill-marker text-marker" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit your exam?"
        body={answeredCount < exam.questions.length
          ? `You have answered ${answeredCount} of ${exam.questions.length} questions. Unanswered questions will be marked wrong.`
          : 'You will see your score and a breakdown of strong and weak areas.'}
        confirmLabel="Submit exam"
        onConfirm={submit}
        onCancel={() => setConfirmSubmit(false)}
      />
    </div>
  );
}
