'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAIJSON, cn, errorMessage } from '@/lib/utils';
import { recordEvidence } from '@/lib/adaptive';
import LessonVisual from '@/components/visual/LessonVisual';
import { withLessonVisual, type StoredVisual } from '@/lib/visual/lesson';
import { levelOf, studySubjectText, type ProjectRecord } from '@/lib/project-context';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Circle, GraduationCap, KeyRound, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Button, ConfirmDialog, EmptyState, ErrorState, GeneratingPanel, OptionRow, ProgressBar, Prose, Skeleton, Surface, splitOption, type OptionState,
} from '@/components/ui';

interface Props {
  projectId: string; userId: string;
  region: string; persona: string; userGroqKey?: string;
  onGoToMaterials?: () => void;
}

const STEPS = [
  'Reading your materials',
  'Planning modules and lessons',
  'Writing lessons and worked examples',
  'Writing practice questions',
  'Checking everything fits together',
];

export default function CourseView({ projectId, userId, region, persona, userGroqKey, onGoToMaterials }: Props) {
  const [course, setCourse] = useState<any>(null);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [progress, setProgress] = useState<{ completed_lessons: string[] }>({ completed_lessons: [] });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [openModule, setOpenModule] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const courseRef = useRef<any>(null);
  courseRef.current = course;

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [{ data: proj }, { data: courseData, error }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
        supabase.from('courses').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (error) throw error;
      setProject(proj as ProjectRecord | null);
      if (courseData) {
        setCourse(courseData);
        setOpenModule(courseData.modules?.[0]?.id ?? null);
        const { data: prog } = await supabase.from('course_progress').select('*').eq('course_id', courseData.id).eq('user_id', userId).maybeSingle();
        if (prog) setProgress({ completed_lessons: prog.completed_lessons || [] });
      }
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [projectId, userId]);

  useEffect(() => { load(); }, [load]);

  const lessons = useMemo(() => (course?.modules || []).flatMap((m: any) => (m.lessons || []).map((l: any) => ({ ...l, moduleTitle: m.title, moduleId: m.id }))), [course]);
  const active = lessons.find((l: any) => l.id === activeId) || null;
  const activeIndex = active ? lessons.indexOf(active) : -1;
  const done = progress.completed_lessons;
  const pct = lessons.length ? Math.round((done.length / lessons.length) * 100) : 0;

  const generate = async () => {
    setConfirmRegen(false);
    setGenerating(true);
    setGenError('');
    try {
      const { data: docs } = await supabase.from('documents').select('content, name').eq('project_id', projectId).eq('user_id', userId).limit(5);
      const context = (docs || []).map(d => `[${d.name}]\n${d.content}`).join('\n\n').slice(0, 8000);
      if (!context.trim()) {
        setGenError('Add at least one document or note in Materials first. Akili builds the course from what you add.');
        return;
      }

      const secondary = project ? levelOf(project) === 'secondary' : false;
      const topic = project ? studySubjectText(project) : 'the learner’s topic';
      const prompt = `Create a structured course on "${topic}" from the study materials below.

Study materials:
${context}

Requirements:
- 3 to 5 modules, each with 2 to 4 lessons.
- Each lesson: learning objectives, ${secondary ? 'clear explanations of at least 250 words' : 'a thorough explanation of at least 350 words'} in markdown, key concepts, one worked example, common mistakes, and 3 practice questions.
- Practice questions have four options labelled "A) ", "B) ", "C) ", "D) " and correct_answer is just the letter.
- Use examples that make sense for a learner in ${region}.
- Base lessons on the materials. Do not invent details about the learner's own course or teacher.

Return JSON:
{"title": string, "description": string, "estimated_duration": string,
 "modules": [{"module_number": number, "title": string, "estimated_time": string,
  "lessons": [{"lesson_number": number, "title": string, "learning_objectives": [string], "content": "markdown", "key_concepts": [string],
   "worked_example": {"problem": string, "solution_steps": [string], "answer": string},
   "common_mistakes": [string],
   "practice_questions": [{"question": string, "concept": string, "options": ["A) ...","B) ...","C) ...","D) ..."], "correct_answer": "A", "explanation": string}]}]}]}`;

      const data = await callAIJSON<any>({ task: 'course_builder', prompt, region, persona, userGroqKey, projectId, validationType: 'course' });

      const { data: saved, error } = await supabase.from('courses').insert({
        project_id: projectId, user_id: userId,
        title: data.title, description: data.description,
        subject: project?.subject ?? null, exam_type: project?.exam_type ?? null,
        modules: data.modules,
      }).select().single();
      if (error || !saved) throw new Error('The course was written but could not be saved. Please try again.');

      setCourse(saved);
      setProgress({ completed_lessons: [] });
      setOpenModule(data.modules[0]?.id ?? null);
      setActiveId(null);
      toast.success('Your course is ready');
    } catch (err) {
      setGenError(errorMessage(err, 'Course generation failed. Please try again.'));
    } finally {
      setGenerating(false);
    }
  };

  // Visuals are cached inside the lesson JSON (no schema change). A failed save only means we plan the diagram again next time.
  const saveLessonVisual = async (lessonId: string, visual: StoredVisual) => {
    const current = courseRef.current;
    if (!current) return;
    const modules = withLessonVisual(current.modules, lessonId, visual);
    setCourse((c: any) => (c ? { ...c, modules } : c));
    await supabase.from('courses').update({ modules }).eq('id', current.id).eq('user_id', userId);
  };

  const openLesson = (id: string) => { setActiveId(id); setAnswers({}); setChecked(false); window.scrollTo({ top: 0 }); };

  const markComplete = async (lessonId: string) => {
    if (done.includes(lessonId)) return;
    const updated = [...done, lessonId];
    setProgress({ completed_lessons: updated });
    const { error } = await supabase.from('course_progress').upsert({ course_id: course.id, user_id: userId, completed_lessons: updated });
    if (error) { setProgress({ completed_lessons: done }); toast.error('Could not save your progress. Try again.'); }
  };

  const checkAnswers = async (lesson: any) => {
    setChecked(true);
    for (const q of lesson.practice_questions || []) {
      try {
        await recordEvidence({
          userId, projectId,
          concept: q.concept || lesson.key_concepts?.[0] || lesson.title,
          sourceType: 'lesson', interactionType: 'lesson_practice',
          prompt: q.question, learnerResponse: answers[q.id] || '',
          correctness: answers[q.id] === q.correct_answer, difficulty: 'developing',
          evidence: q.explanation || 'Lesson practice result',
        });
      } catch { /* progress tracking must never block the lesson */ }
    }
  };

  // ── States ────────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return <div className="space-y-3 p-4"><Skeleton className="h-36 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  }
  if (status === 'error') return <div className="p-4"><ErrorState message="Your course did not load. Check your connection and try again." onRetry={load} /></div>;

  if (generating) {
    return <div className="p-4"><GeneratingPanel title="Building your course" steps={STEPS} /></div>;
  }

  if (!course) {
    return (
      <div className="space-y-4 p-4">
        <EmptyState
          icon={<GraduationCap size={22} />}
          title="Build your course"
          action={<Button onClick={generate}><Sparkles size={17} /> Build course</Button>}
        >
          Akili reads the notes and documents in Materials and turns them into lessons, worked examples and practice questions.
        </EmptyState>
        {genError && (
          <ErrorState title="No course yet" message={genError} onRetry={genError.includes('Materials') ? undefined : generate}
          />
        )}
        {genError.includes('Materials') && onGoToMaterials && <Button variant="quiet" block onClick={onGoToMaterials}>Go to Materials</Button>}
      </div>
    );
  }

  // ── Lesson reader ─────────────────────────────────────────────────────────

  if (active) {
    const isDone = done.includes(active.id);
    const prev = lessons[activeIndex - 1];
    const next = lessons[activeIndex + 1];
    const qs: any[] = active.practice_questions || [];
    const score = qs.filter(q => answers[q.id] === q.correct_answer).length;

    return (
      <article className="space-y-6 px-4 pb-6 pt-4">
        <div>
          <button onClick={() => setActiveId(null)} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-biro hover:bg-biro-wash">
            <ArrowLeft size={16} /> Course outline
          </button>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{active.moduleTitle} · Lesson {activeIndex + 1} of {lessons.length}</p>
          <h2 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight">{active.title}</h2>
          {active.learning_objectives?.length > 0 && (
            <ul className="mt-3 space-y-1.5 rounded-xl bg-biro-wash p-3.5">
              <li className="text-xs font-bold uppercase tracking-wide text-biro-dark">By the end you can</li>
              {active.learning_objectives.map((o: string, i: number) => <li key={i} className="flex gap-2 text-sm text-ink"><Check size={16} className="mt-0.5 shrink-0 text-biro" />{o}</li>)}
            </ul>
          )}
        </div>

        <Prose>{active.content}</Prose>

        <LessonVisual
          lesson={active} projectId={projectId} userId={userId} region={region} persona={persona} userGroqKey={userGroqKey}
          level={project ? levelOf(project) : undefined} onPersist={saveLessonVisual}
        />

        {active.key_concepts?.length > 0 && (
          <Surface className="border-marker bg-marker-wash p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold"><KeyRound size={16} /> Key ideas</p>
            <div className="flex flex-wrap gap-2">
              {active.key_concepts.map((c: string, i: number) => <span key={i} className="rounded-lg bg-paper px-2.5 py-1 text-sm font-semibold">{c}</span>)}
            </div>
          </Surface>
        )}

        {active.worked_example && (
          <Surface className="p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Worked example</p>
            <p className="mt-1.5 font-read text-[1.0625rem] font-semibold leading-snug">{active.worked_example.problem}</p>
            <ol className="mt-3 space-y-2.5">
              {active.worked_example.solution_steps?.map((s: string, i: number) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                  <span className="font-read text-base leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
            {active.worked_example.answer && <p className="mt-3 rounded-lg bg-tick-wash px-3 py-2 text-sm font-bold text-tick">Answer: {active.worked_example.answer}</p>}
          </Surface>
        )}

        {active.common_mistakes?.length > 0 && (
          <Surface className="border-redpen/30 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold text-redpen"><TriangleAlert size={16} /> Watch out for</p>
            <ul className="space-y-2">
              {active.common_mistakes.map((m: string, i: number) => <li key={i} className="font-read text-base leading-relaxed">{m}</li>)}
            </ul>
          </Surface>
        )}

        {qs.length > 0 && (
          <section aria-label="Practice questions" className="space-y-5">
            <h3 className="text-lg font-bold">Check your understanding</h3>
            {qs.map((q, qi) => (
              <div key={q.id} role="radiogroup" aria-label={`Question ${qi + 1}`} className="space-y-2">
                <p className="font-read text-[1.0625rem] font-semibold leading-snug">{qi + 1}. {q.question}</p>
                {q.options?.map((opt: string) => {
                  const { letter, text } = splitOption(opt);
                  const picked = answers[q.id] === letter;
                  let state: OptionState = picked ? 'selected' : 'idle';
                  if (checked) state = letter === q.correct_answer ? (picked ? 'correct' : 'missed') : picked ? 'wrong' : 'idle';
                  return <OptionRow key={letter} letter={letter} text={text} state={state} disabled={checked} onClick={() => setAnswers(a => ({ ...a, [q.id]: letter }))} />;
                })}
                {checked && q.explanation && <p className="rounded-lg bg-chalk px-3 py-2 text-sm leading-relaxed text-muted">{q.explanation}</p>}
              </div>
            ))}
            {!checked ? (
              <Button block disabled={Object.keys(answers).length < qs.length} onClick={() => checkAnswers(active)}>Check answers</Button>
            ) : (
              <p className="rounded-xl bg-paper p-3 text-center text-sm font-bold">{score} of {qs.length} correct</p>
            )}
          </section>
        )}

        <div className="space-y-2 pt-2">
          <Button block variant={isDone ? 'quiet' : 'primary'} disabled={isDone} onClick={() => markComplete(active.id)}>
            <CheckCircle2 size={18} /> {isDone ? 'Lesson completed' : 'Mark as complete'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="quiet" disabled={!prev} onClick={() => prev && openLesson(prev.id)}><ArrowLeft size={16} /> Previous</Button>
            <Button variant="dark" disabled={!next} onClick={() => next && openLesson(next.id)}>Next <ArrowRight size={16} /></Button>
          </div>
        </div>
      </article>
    );
  }

  // ── Course outline ────────────────────────────────────────────────────────

  const firstOpen = lessons.find((l: any) => !done.includes(l.id)) || lessons[0];

  return (
    <div className="space-y-4 p-4">
      <Surface className="bg-ink p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-marker">Your course</p>
        <h2 className="mt-1 text-2xl font-extrabold leading-tight">{course.title}</h2>
        {course.description && <p className="mt-2 text-sm leading-relaxed text-white/75">{course.description}</p>}
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-white/70"><span>{done.length} of {lessons.length} lessons done</span><span>{pct}%</span></div>
          <ProgressBar value={pct} label="Course progress" className="bg-white/20 [&>div]:bg-marker" />
        </div>
        {firstOpen && (
          <Button block className="mt-4 bg-marker text-ink hover:bg-marker/90 active:bg-marker/90" onClick={() => openLesson(firstOpen.id)}>
            {done.length ? 'Continue learning' : 'Start first lesson'} <ArrowRight size={17} />
          </Button>
        )}
      </Surface>

      {genError && <ErrorState title="Course not updated" message={genError} />}

      <ul className="space-y-2">
        {(course.modules || []).map((mod: any) => {
          const open = openModule === mod.id;
          const finished = (mod.lessons || []).filter((l: any) => done.includes(l.id)).length;
          return (
            <li key={mod.id}>
              <Surface className="overflow-hidden">
                <button onClick={() => setOpenModule(open ? null : mod.id)} aria-expanded={open} className="flex min-h-16 w-full items-center gap-3 p-4 text-left active:bg-chalk">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chalk text-sm font-extrabold">{mod.module_number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-snug">{mod.title}</span>
                    <span className="block text-xs text-muted">{finished}/{mod.lessons?.length || 0} lessons{mod.estimated_time ? ` · ${mod.estimated_time}` : ''}</span>
                  </span>
                  <ChevronDown size={18} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <ul className="border-t border-rule">
                    {(mod.lessons || []).map((l: any) => (
                      <li key={l.id}>
                        <button onClick={() => openLesson(l.id)} className="flex min-h-14 w-full items-center gap-3 border-b border-rule px-4 py-2 text-left last:border-b-0 active:bg-chalk">
                          {done.includes(l.id) ? <CheckCircle2 size={20} className="shrink-0 text-tick" /> : <Circle size={20} className="shrink-0 text-rule" />}
                          <span className="flex-1 text-[15px] font-medium leading-snug">{l.lesson_number}. {l.title}</span>
                          <ArrowRight size={16} className="shrink-0 text-muted" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Surface>
            </li>
          );
        })}
      </ul>

      <Button variant="ghost" block onClick={() => setConfirmRegen(true)}><RefreshCw size={16} /> Rebuild course from my materials</Button>

      <ConfirmDialog
        open={confirmRegen}
        title="Rebuild this course?"
        body="Akili writes a new course from your current materials. Your lesson progress in the old course will not carry over."
        confirmLabel="Rebuild course"
        onConfirm={generate}
        onCancel={() => setConfirmRegen(false)}
      />
    </div>
  );
}
