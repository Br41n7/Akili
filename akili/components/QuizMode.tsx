'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAI, safeJsonParse, cn } from '@/lib/utils';
import { compactLearnerContext, getLearnerContext, recordEvidence } from '@/lib/adaptive';
import { summarizeAssessment } from '@/lib/local-learning';
import GeneratedDiagram, { type GeneratedDiagramSpec } from '@/components/GeneratedDiagram';
import { HelpCircle, Loader2, CheckCircle2, XCircle, RotateCcw, Brain, ImagePlus } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props { projectId: string; userId: string; region: string; persona: string; }

export default function QuizMode({ projectId, userId, region, persona }: Props) {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [adaptiveSummary, setAdaptiveSummary] = useState<any>(null);
  const [language, setLanguage] = useState('English');
  const [questionStyle, setQuestionStyle] = useState('mixed');
  const [diagram, setDiagram] = useState<{ base64: string; mimeType: string } | null>(null);
  const [generatedDiagram, setGeneratedDiagram] = useState<GeneratedDiagramSpec | null>(null);

  const handleDiagram = async (file?: File) => { if (!file) return; if (file.size > 8 * 1024 * 1024) return toast.error('Diagram must be 8MB or smaller'); const base64 = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(file); }); setDiagram({ base64, mimeType: file.type || 'image/png' }); };

  const generateVisualQuestion = async () => {
    setGenerating(true);
    setQuestions([]); setAnswers({}); setSubmitted(false); setAdaptiveSummary(null); setGeneratedDiagram(null);
    try {
      const [{ data: docs }, learner] = await Promise.all([
        supabase.from('documents').select('content').eq('project_id', projectId).eq('user_id', userId).limit(2),
        getLearnerContext(projectId, userId),
      ]);
      const context = docs?.map(d => d.content).join('\n\n').slice(0, 5000) || '';
      const adaptive = compactLearnerContext(learner);
      const prompt = `Create ONE visual learning question for the learner about "${topic || 'the learner’s weakest relevant concept'}".\nMaterial:\n${context || 'No material supplied; use standard textbook knowledge.'}\nLearner context: ${JSON.stringify(adaptive)}\n\nReturn JSON only: {"diagram":{"kind":"skull|heart|cell|generic","title":string,"labels":[{"id":"I","name":string,"x":number,"y":number},{"id":"II","name":string,"x":number,"y":number},{"id":"III","name":string,"x":number,"y":number},{"id":"IV","name":string,"x":number,"y":number}],"note":string},"question":string,"options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"A","explanation":string,"concept":string,"cognitive_level":"understanding|application|transfer"}.\nUse a schematic diagram, not a claim of clinical/anatomical precision. The label IDs must match the labels. Ask the learner to identify one labelled part or its function. Keep it suitable for a student.`;
      const raw = await callAI({ task: 'diagram_question', prompt, region, persona, format: 'json' });
      const data = safeJsonParse(raw);
      if (!data?.diagram?.labels?.length || !data?.question || !data?.options?.length) throw new Error('Visual question generation returned incomplete data');
      setGeneratedDiagram(data.diagram);
      setQuestions([{ id: `visual-${Date.now()}`, type: 'diagram', question: data.question, options: data.options, correct_answer: data.correct_answer, explanation: data.explanation, concept: data.concept, cognitive_level: data.cognitive_level }]);
    } catch (err: any) { toast.error(err.message || 'Could not generate visual question'); }
    finally { setGenerating(false); }
  };

  const generate = async () => {
    setGenerating(true);
    setQuestions([]); setAnswers({}); setSubmitted(false); setAdaptiveSummary(null);
    try {
      const [{ data: docs }, learner] = await Promise.all([
        supabase.from('documents').select('content').eq('project_id', projectId).eq('user_id', userId).limit(3),
        getLearnerContext(projectId, userId),
      ]);
      const context = docs?.map(d => d.content).join('\n\n').slice(0, 6000) || '';
      const adaptive = compactLearnerContext(learner);

      const prompt = `Generate 5 adaptive questions about "${topic || 'the main topics'}" at ${difficulty} difficulty.
${context ? `Based on this material:\n${context}` : ''}

Language: ${language}. If German is selected, write the question, options, feedback and any fill-in-the-gap text in natural German.
Question style: ${questionStyle}.
Adaptive learner context (use as evidence, not absolute truth): ${JSON.stringify(adaptive)}
Prioritize weak concepts when the topic is blank. Test understanding, not sentence copying.

Supported types:
- multiple_choice: four options A-D
- fill_gap: a complete sentence with one blank represented by □□□, with the learner supplying the missing word/phrase; include correct_answer as the answer text
- diagram: only when an image is supplied; ask about a labelled structure such as I, II, III, IV, V, including identification, function, relation, or clinical relevance; do not invent labels that are not visible

Cognitive levels: recall, understanding, application, debugging, transfer.
Return JSON: { "questions": [{ "id": string, "type": "multiple_choice"|"fill_gap"|"diagram", "question": string, "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct_answer": string, "explanation": string, "concept": string, "cognitive_level": string, "image_required": boolean }] }`;

      const raw = await callAI({ task: diagram ? 'diagram_question' : 'adaptive_quiz', prompt, region, persona, format: 'json', image: diagram || undefined });
      const data = safeJsonParse(raw);
      if (!data?.questions?.length) throw new Error('No questions generated');
      setQuestions(data.questions);
    } catch (err: any) { toast.error(err.message); }
    finally { setGenerating(false); }
  };

  const submit = async () => {
    setSubmitted(true);
    setAnalyzing(true);
    const score = questions.filter(q => q.type === 'fill_gap' ? answers[q.id]?.trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase() : answers[q.id] === q.correct_answer).length;

    try {
      const local = summarizeAssessment(questions, answers);
      let analysis: any = {
        summary: 'Assessment summarized locally from the learner answers.',
        evidence: questions.map((q: any) => ({ concept: q.concept || topic || 'General', correct: q.type === 'fill_gap' ? answers[q.id]?.trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase() : answers[q.id] === q.correct_answer, confidence: 0.6, misconception: null, note: 'Deterministic assessment evidence.' })),
        next_focus: local.next_focus,
        ready_to_advance: local.weak_concepts.length === 0,
      };

      // Use AI only when repeated failures provide enough evidence that a misconception analysis is useful.
      if (local.needsAI) {
        const prompt = `Analyze this learner's quiz performance and identify repeated misconceptions only where the evidence supports them.
Questions: ${JSON.stringify(questions.map(q => ({ id: q.id, concept: q.concept, cognitive_level: q.cognitive_level, question: q.question, correct_answer: q.correct_answer })))}
Answers: ${JSON.stringify(answers)}
Return JSON: { "summary": string, "evidence": [{ "concept": string, "correct": boolean, "confidence": number, "misconception": string|null, "note": string }], "next_focus": [string], "ready_to_advance": boolean }`;
        const raw = await callAI({ task: 'adaptive_analysis', prompt, region, persona, format: 'json' });
        analysis = safeJsonParse(raw) || analysis;
      }
      setAdaptiveSummary(analysis);

      for (const q of questions) {
        const evidence = analysis.evidence?.find((e: any) => e.concept?.toLowerCase() === q.concept?.toLowerCase() && e.correct === (answers[q.id] === q.correct_answer));
        await recordEvidence({
          userId,
          projectId,
          concept: q.concept || topic || 'General',
          sourceType: 'quiz',
          interactionType: q.cognitive_level || 'multiple_choice',
          prompt: q.question,
          learnerResponse: answers[q.id] || '',
          correctness: q.type === 'fill_gap' ? answers[q.id]?.trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase() : answers[q.id] === q.correct_answer,
          confidence: typeof evidence?.confidence === 'number' ? Math.max(0, Math.min(1, evidence.confidence)) : undefined,
          difficulty,
          misconception: evidence?.misconception || null,
          evidence: evidence?.note || q.explanation,
        });
      }

      await supabase.from('exam_attempts').insert({
        project_id: projectId, user_id: userId, type: 'quiz',
        questions, answers, score, total: questions.length,
        analysis: analysis,
      });
    } catch (err: any) {
      toast.error(err.message || 'Learning analysis failed');
      await supabase.from('exam_attempts').insert({
        project_id: projectId, user_id: userId, type: 'quiz',
        questions, answers, score, total: questions.length,
      });
    } finally { setAnalyzing(false); }
  };

  const score = questions.filter(q => q.type === 'fill_gap' ? answers[q.id]?.trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase() : answers[q.id] === q.correct_answer).length;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="bg-white rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-black flex items-center gap-2"><HelpCircle size={18} className="text-indigo-600" /> Adaptive Quiz</h2>
          <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full flex items-center gap-1"><Brain size={11} /> Targets your weak areas</span>
        </div>
        <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic (optional — blank uses your weak areas)"
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-500" />
        <div className="grid grid-cols-2 gap-2">
          <select value={language} onChange={e => setLanguage(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-xs"><option>English</option><option>German</option></select>
          <select value={questionStyle} onChange={e => setQuestionStyle(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-xs"><option value="mixed">Mixed questions</option><option value="fill_gap">Fill in the gap</option><option value="diagram">Diagram-based</option></select>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500 border border-dashed rounded-xl px-3 py-2 cursor-pointer"><ImagePlus size={14} /> {diagram ? 'Diagram attached' : 'Attach anatomy/other diagram (optional)'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => handleDiagram(e.target.files?.[0])} /></label>
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
          {generating ? <><Loader2 size={15} className="animate-spin" /> Generating...</> : 'Generate Adaptive Quiz'}
        </button>
        <button onClick={generateVisualQuestion} disabled={generating}
          className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2">
          {generating ? <><Loader2 size={15} className="animate-spin" /> Building visual question...</> : 'Generate AI Visual Question'}
        </button>
      </div>

      {generatedDiagram && <GeneratedDiagram spec={generatedDiagram} />}

      {diagram && <div className="bg-white rounded-3xl p-4"><p className="text-xs font-bold text-gray-500 mb-2">Attached diagram</p><img src={`data:${diagram.mimeType};base64,${diagram.base64}`} alt="Question diagram" className="max-h-80 mx-auto rounded-2xl object-contain" /></div>}

      {questions.map((q, i) => (
        <div key={q.id} className="bg-white rounded-3xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            {q.concept && <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">{q.concept}</span>}
            {q.cognitive_level && <span className="text-[10px] text-gray-400 capitalize">{q.cognitive_level}</span>}
          </div>
          <p className="font-semibold text-sm">{i + 1}. {q.question}</p>
          {q.type === 'fill_gap' ? (
            <input value={answers[q.id] || ''} disabled={submitted} onChange={e => setAnswers(p => ({ ...p, [q.id]: e.target.value }))} placeholder="Your answer" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm" />
          ) : (
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
          </div>) }
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
          {analyzing ? <p className="text-sm text-gray-500 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Updating your learning profile...</p> : (
            <>
              <p className="text-sm text-gray-500">{score === questions.length ? '🎉 Excellent evidence of understanding.' : score >= questions.length * 0.7 ? '👍 Good progress. Keep strengthening the weaker concepts.' : '📚 Let’s slow down and rebuild the weak concepts.'}</p>
              {adaptiveSummary?.next_focus?.length > 0 && (
                <div className="text-left bg-indigo-50 rounded-2xl p-4">
                  <p className="text-xs font-bold text-indigo-700 mb-1">Next focus</p>
                  {adaptiveSummary.next_focus.slice(0, 3).map((x: string, i: number) => <p key={i} className="text-xs text-indigo-600">• {x}</p>)}
                </div>
              )}
            </>
          )}
          <button onClick={() => { setQuestions([]); setAnswers({}); setSubmitted(false); setAdaptiveSummary(null); }}
            className="flex items-center gap-2 mx-auto text-sm text-indigo-600 font-semibold hover:underline">
            <RotateCcw size={14} /> Try Again
          </button>
        </div>
      )}
    </div>
  );
}
