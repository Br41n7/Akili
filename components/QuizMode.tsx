'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAIJSON, errorMessage } from '@/lib/utils';
import { compactLearnerContext, getLearnerContext, recordEvidence } from '@/lib/adaptive';
import { summarizeAssessment } from '@/lib/local-learning';
import ConceptVisual from '@/components/visual/ConceptVisual';
import GeneratedDiagram, { type GeneratedDiagramSpec } from '@/components/GeneratedDiagram';
import { ArrowRight, Brain, ImagePlus, RotateCcw, Sparkles, X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Button, ChoiceChips, Chip, ErrorState, Field, GeneratingPanel, OptionRow, ProgressBar, SelectInput, Surface, TextInput, splitOption, type OptionState,
} from '@/components/ui';

interface Props { projectId: string; userId: string; region: string; persona: string; onGoToMaterials?: () => void }

type Phase = 'setup' | 'generating' | 'quiz' | 'results';
type Difficulty = 'easy' | 'medium' | 'hard';

const isRight = (q: any, answer?: string) =>
  q.type === 'fill_gap'
    ? (answer || '').trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase()
    : answer === q.correct_answer;

const STEPS = ['Reading your materials', 'Checking what you already know', 'Writing questions', 'Checking the answers'];

export default function QuizMode({ projectId, userId, region, persona }: Props) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [language, setLanguage] = useState('English');
  const [questionStyle, setQuestionStyle] = useState('mixed');
  const [diagram, setDiagram] = useState<{ base64: string; mimeType: string } | null>(null);
  const [generatedDiagram, setGeneratedDiagram] = useState<GeneratedDiagramSpec | null>(null);

  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  const handleDiagram = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return void toast.error('The picture must be 8MB or smaller.');
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(file);
    }).catch(() => '');
    if (!base64) return void toast.error('That picture could not be read.');
    setDiagram({ base64, mimeType: file.type });
  };

  const reset = () => {
    setQuestions([]); setAnswers({}); setIndex(0); setRevealed(false); setSummary(null); setError('');
    setPhase('setup');
  };

  const loadContext = async (limit: number, chars: number) => {
    const [{ data: docs }, learner] = await Promise.all([
      supabase.from('documents').select('content').eq('project_id', projectId).eq('user_id', userId).limit(limit),
      getLearnerContext(projectId, userId),
    ]);
    return { context: (docs || []).map(d => d.content).join('\n\n').slice(0, chars), adaptive: compactLearnerContext(learner) };
  };

  const start = async (visual: boolean) => {
    setPhase('generating'); setError(''); setQuestions([]); setAnswers({}); setIndex(0); setRevealed(false); setSummary(null);
    if (!visual) setGeneratedDiagram(null);
    try {
      if (visual) {
        const { context, adaptive } = await loadContext(2, 5000);
        const prompt = `Create ONE visual learning question about "${topic || 'the learner’s weakest relevant concept'}".
Material:
${context || 'No material supplied; use standard textbook knowledge for the learner’s level.'}
Learner context: ${JSON.stringify(adaptive)}

Return JSON only: {"diagram":{"kind":"skull|heart|cell|generic","title":string,"labels":[{"id":"I","name":string,"x":number,"y":number},{"id":"II","name":string,"x":number,"y":number},{"id":"III","name":string,"x":number,"y":number},{"id":"IV","name":string,"x":number,"y":number}],"note":string},"question":string,"options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"A","explanation":string,"concept":string,"cognitive_level":"understanding|application|transfer"}.
Use a schematic diagram, not a claim of anatomical precision. The label IDs must match the labels. Ask the learner to identify one labelled part or its function.`;
        const data = await callAIJSON<any>({ task: 'diagram_question', prompt, region, persona, projectId, validationType: 'visual_question' });
        setGeneratedDiagram(data.diagram);
        setQuestions([{ ...data, id: `visual-${Date.now()}`, type: 'diagram' }]);
      } else {
        const { context, adaptive } = await loadContext(3, 6000);
        const prompt = `Generate 5 adaptive questions about "${topic || 'the main topics'}" at ${difficulty} difficulty.
${context ? `Based on this material:\n${context}` : 'No material was supplied; use the standard syllabus for the learner’s level.'}

Language: ${language}. Write questions, options and feedback in ${language}.
Question style: ${questionStyle}.
Adaptive learner context (evidence, not absolute truth): ${JSON.stringify(adaptive)}
Prioritize weak concepts when the topic is blank. Test understanding, not sentence copying.

Supported types:
- multiple_choice: four options A-D, correct_answer is the letter
- fill_gap: a complete sentence with one blank shown as □□□; correct_answer is the missing word or phrase
- diagram: only when an image is supplied; ask about a labelled structure that is visible, and do not invent labels

Cognitive levels: recall, understanding, application, debugging, transfer.
Return JSON: { "questions": [{ "id": string, "type": "multiple_choice"|"fill_gap"|"diagram", "question": string, "options": ["A) ...","B) ...","C) ...","D) ..."], "correct_answer": string, "explanation": string, "concept": string, "cognitive_level": string }] }`;
        const data = await callAIJSON<any>({
          task: diagram ? 'diagram_question' : 'adaptive_quiz', prompt, region, persona, projectId,
          image: diagram || undefined, validationType: 'quiz',
        });
        setQuestions(data.questions);
      }
      setPhase('quiz');
    } catch (err) {
      setError(errorMessage(err, 'We could not build the quiz. Please try again.'));
      setPhase('setup');
    }
  };

  const finish = async () => {
    setPhase('results');
    setAnalyzing(true);
    const score = questions.filter(q => isRight(q, answers[q.id])).length;
    try {
      const local = summarizeAssessment(questions, answers);
      let analysis: any = {
        summary: 'Assessment summarized from your answers.',
        evidence: questions.map(q => ({ concept: q.concept || topic || 'General', correct: isRight(q, answers[q.id]), confidence: 0.6, misconception: null, note: 'Assessment evidence.' })),
        next_focus: local.next_focus,
        ready_to_advance: local.weak_concepts.length === 0,
      };

      // Ask the AI for misconception analysis only when there is real evidence of a repeated problem.
      if (local.needsAI) {
        try {
          const prompt = `Analyze this learner's quiz performance and name repeated misconceptions only where the evidence supports them.
Questions: ${JSON.stringify(questions.map(q => ({ id: q.id, concept: q.concept, cognitive_level: q.cognitive_level, question: q.question, correct_answer: q.correct_answer })))}
Answers: ${JSON.stringify(answers)}
Return JSON: { "summary": string, "evidence": [{ "concept": string, "correct": boolean, "confidence": number, "misconception": string|null, "note": string }], "next_focus": [string], "ready_to_advance": boolean }`;
          analysis = await callAIJSON<any>({ task: 'adaptive_analysis', prompt, region, persona, projectId, validationType: 'quiz_analysis' });
        } catch { /* the local summary is good enough */ }
      }
      setSummary(analysis);

      for (const q of questions) {
        const ok = isRight(q, answers[q.id]);
        const ev = analysis.evidence?.find((e: any) => e.concept?.toLowerCase() === q.concept?.toLowerCase() && e.correct === ok);
        await recordEvidence({
          userId, projectId, concept: q.concept || topic || 'General', sourceType: 'quiz',
          interactionType: q.cognitive_level || 'multiple_choice', prompt: q.question,
          learnerResponse: answers[q.id] || '', correctness: ok,
          confidence: typeof ev?.confidence === 'number' ? Math.max(0, Math.min(1, ev.confidence)) : undefined,
          difficulty, misconception: ev?.misconception || null, evidence: ev?.note || q.explanation,
        });
      }
      await supabase.from('exam_attempts').insert({ project_id: projectId, user_id: userId, type: 'quiz', questions, answers, score, total: questions.length, analysis });
    } catch {
      /* saving results must never block the learner from seeing them */
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Setup ─────────────────────────────────────────────────────────────────

  if (phase === 'generating') return <div className="p-4"><GeneratingPanel title="Building your quiz" steps={STEPS} /></div>;

  if (phase === 'setup') {
    return (
      <div className="space-y-4 p-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Practice quiz</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><Brain size={15} /> Leave the topic blank and Akili picks your weak areas.</p>
        </div>

        {error && <ErrorState message={error} onRetry={() => start(false)} />}

        <Surface className="space-y-5 p-4">
          <Field label="Topic" htmlFor="qz-topic" optional>
            <TextInput id="qz-topic" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Photosynthesis" maxLength={120} />
          </Field>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Difficulty</p>
            <ChoiceChips<Difficulty> label="Difficulty" value={difficulty} onChange={setDifficulty}
              options={[{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
          </div>

          <details className="group rounded-xl border border-rule">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">
              More options <span className="text-xs font-normal text-muted group-open:hidden">Language, style, diagram</span>
            </summary>
            <div className="space-y-4 border-t border-rule p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Language" htmlFor="qz-lang">
                  <SelectInput id="qz-lang" value={language} onChange={e => setLanguage(e.target.value)}><option>English</option><option>German</option></SelectInput>
                </Field>
                <Field label="Style" htmlFor="qz-style">
                  <SelectInput id="qz-style" value={questionStyle} onChange={e => setQuestionStyle(e.target.value)}>
                    <option value="mixed">Mixed</option><option value="fill_gap">Fill in the gap</option><option value="diagram">Diagram-based</option>
                  </SelectInput>
                </Field>
              </div>
              {diagram ? (
                <div className="flex items-center gap-3 rounded-xl bg-chalk p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:${diagram.mimeType};base64,${diagram.base64}`} alt="Attached diagram" className="h-14 w-14 rounded-lg object-cover" />
                  <span className="flex-1 text-sm font-medium">Diagram attached</span>
                  <button onClick={() => setDiagram(null)} aria-label="Remove diagram" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted active:bg-rule"><X size={18} /></button>
                </div>
              ) : (
                <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/30 text-sm font-semibold text-ink active:bg-chalk">
                  <ImagePlus size={17} /> Attach a diagram
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => handleDiagram(e.target.files?.[0])} />
                </label>
              )}
            </div>
          </details>
        </Surface>

        <Button block onClick={() => start(false)}><Sparkles size={17} /> Start quiz</Button>
        <Button block variant="quiet" onClick={() => start(true)}>One visual question instead</Button>
      </div>
    );
  }

  // ── Quiz: one question at a time ──────────────────────────────────────────

  if (phase === 'quiz') {
    const q = questions[index];
    const answer = answers[q.id];
    const last = index === questions.length - 1;
    const ok = isRight(q, answer);
    const canCheck = !!(answer && answer.trim());

    return (
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted">
            <span>Question {index + 1} of {questions.length}</span>
            <button onClick={reset} className="min-h-8 px-1 text-muted underline underline-offset-2">Quit</button>
          </div>
          <ProgressBar value={((index + (revealed ? 1 : 0)) / questions.length) * 100} label="Quiz progress" />
        </div>

        {generatedDiagram && <GeneratedDiagram spec={generatedDiagram} />}
        {diagram && !generatedDiagram && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`data:${diagram.mimeType};base64,${diagram.base64}`} alt="Diagram for this question" className="max-h-72 w-full rounded-2xl border border-rule bg-paper object-contain" />
        )}

        <div className="space-y-3">
          {q.concept && <Chip tone="biro">{q.concept}</Chip>}
          <h2 className="font-read text-[1.25rem] font-semibold leading-snug">{q.question}</h2>

          {q.type === 'fill_gap' ? (
            <div className="space-y-2">
              <TextInput
                value={answer || ''}
                disabled={revealed}
                onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                placeholder="Type your answer"
                autoCapitalize="none"
                autoComplete="off"
                aria-label="Your answer"
              />
              {revealed && !ok && <p className="text-sm font-semibold text-tick">Correct answer: {q.correct_answer}</p>}
            </div>
          ) : (
            <div role="radiogroup" aria-label="Answer options" className="space-y-2">
              {q.options?.map((opt: string) => {
                const { letter, text } = splitOption(opt);
                const picked = answer === letter;
                let state: OptionState = picked ? 'selected' : 'idle';
                if (revealed) state = letter === q.correct_answer ? (picked ? 'correct' : 'missed') : picked ? 'wrong' : 'idle';
                return <OptionRow key={letter} letter={letter} text={text} state={state} disabled={revealed} onClick={() => setAnswers(a => ({ ...a, [q.id]: letter }))} />;
              })}
            </div>
          )}

          {revealed && (
            <div role="status" className={`rounded-xl p-3.5 ${ok ? 'bg-tick-wash' : 'bg-redpen-wash'}`}>
              <p className={`text-sm font-bold ${ok ? 'text-tick' : 'text-redpen'}`}>{ok ? 'Correct' : 'Not quite'}</p>
              {q.explanation && <p className="mt-1 font-read text-base leading-relaxed text-ink">{q.explanation}</p>}
            </div>
          )}
        </div>

        <div className="pb-safe sticky bottom-[64px] -mx-4 border-t border-rule bg-chalk/95 p-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
          {!revealed ? (
            <Button block disabled={!canCheck} onClick={() => setRevealed(true)}>Check answer</Button>
          ) : last ? (
            <Button block onClick={finish}>See results <ArrowRight size={17} /></Button>
          ) : (
            <Button block onClick={() => { setIndex(i => i + 1); setRevealed(false); }}>Next question <ArrowRight size={17} /></Button>
          )}
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────

  const score = questions.filter(q => isRight(q, answers[q.id])).length;
  const missed = questions.filter(q => !isRight(q, answers[q.id]));
  const ratio = questions.length ? score / questions.length : 0;

  return (
    <div className="space-y-4 p-4">
      <Surface className="p-6 text-center">
        <p className="text-sm font-semibold text-muted">Your score</p>
        <p className="mt-1 text-6xl font-extrabold tracking-tight">{score}<span className="text-3xl text-muted">/{questions.length}</span></p>
        <p className="mt-2 text-sm text-muted">
          {ratio === 1 ? 'A perfect round.' : ratio >= 0.7 ? 'Good work. A little more on the ones you missed.' : 'Worth another look at the topics below.'}
        </p>
      </Surface>

      {analyzing ? (
        <GeneratingPanel title="Updating your learning profile" steps={['Saving your answers']} />
      ) : summary?.next_focus?.length > 0 && (
        <Surface className="border-marker bg-marker-wash p-4">
          <p className="text-sm font-bold">Focus on next</p>
          <ul className="mt-1.5 space-y-1">
            {summary.next_focus.slice(0, 3).map((x: string, i: number) => <li key={i} className="text-sm">{x}</li>)}
          </ul>
        </Surface>
      )}

      {missed.length > 0 && (
        <section aria-label="Questions to review" className="space-y-3">
          <h3 className="text-lg font-bold">Review what you missed</h3>
          {missed.map(q => (
            <Surface key={q.id} className="space-y-2 p-4">
              <p className="font-read text-base font-semibold leading-snug">{q.question}</p>
              <p className="text-sm"><span className="font-semibold text-tick">Answer: </span>{q.type === 'fill_gap' ? q.correct_answer : (q.options?.find((o: string) => o.startsWith(`${q.correct_answer})`)) || q.correct_answer)}</p>
              {q.explanation && <p className="text-sm leading-relaxed text-muted">{q.explanation}</p>}
              <ConceptVisual concept={q.concept || topic || 'this question'} text={`${q.question}\n${q.explanation || ''}`} projectId={projectId} userId={userId} region={region} persona={persona} />
            </Surface>
          ))}
        </section>
      )}

      <Button block onClick={reset}><RotateCcw size={16} /> New quiz</Button>
    </div>
  );
}
