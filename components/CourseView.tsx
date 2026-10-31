'use client';
import { addLesson, saveCompletedLessons } from '@/lib/course-progress';
import { usePlan } from '@/lib/use-plan';
import { pagesOf } from '@/lib/course-builder';
import { dbErrorNote, dbSafe } from '@/lib/text-safe';
import CourseBuildForm from '@/components/CourseBuildForm';
import {
  DEFAULT_OPTIONS, DEPTHS, cleanGoals, fillModule, isPending, modulePrompt, nextPendingIndex, outlineContext, outlineOf, outlinePrompt, pendingModules,
  applyBudget, coverageNotice, depthAllowed, attachSources, balancedChunks, groundingRequest, retryTransient, selectContext, sizeFor, totalChars, type BuildOptions, type LearnerScope, type Research, type Source,
} from '@/lib/course-builder';
import LessonExtras from '@/components/LessonExtras';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAIJSON, cn, errorMessage } from '@/lib/utils';
import { recordEvidence } from '@/lib/adaptive';
import LessonVisual from '@/components/visual/LessonVisual';
import { withLessonVisual, type StoredVisual } from '@/lib/visual/lesson';
import { levelOf, studySubjectText, type ProjectRecord } from '@/lib/project-context';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Circle, GraduationCap, KeyRound, Plus, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Button, EmptyState, ErrorState, GeneratingPanel, OptionRow, ProgressBar, Prose, Skeleton, Surface, TextInput, splitOption, type OptionState,
} from '@/components/ui';

interface Props {
  projectId: string; userId: string;
  region: string; persona: string; userGroqKey?: string;
  onGoToMaterials?: () => void;
}

const STEPS = [
  'Reading your materials',
  'Planning modules and lessons',
  'Saving your course outline',
];

export default function CourseView({ projectId, userId, region, persona, userGroqKey, onGoToMaterials }: Props) {
  const [course, setCourse] = useState<any>(null);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [progress, setProgress] = useState<{ completed_lessons: string[] }>({ completed_lessons: [] });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [showRebuild, setShowRebuild] = useState(false);
  const [opts, setOpts] = useState<BuildOptions>(DEFAULT_OPTIONS);
  const [buildingIdx, setBuildingIdx] = useState<number | null>(null);
  const [addTopic, setAddTopic] = useState('');
  const [addBeyond, setAddBeyond] = useState(false);
  const busyRef = useRef(false);
  const { caps, pro } = usePlan(); const webOn = caps.has('search_grounding');
  const deepOn = caps.has('deep_courses'); const budget = caps.limits.courseMaterialChars;
  const [library, setLibrary] = useState<Source[]>([]);
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
        // A progress problem must never hide the course itself.
        const { data: prog, error: progErr } = await supabase.from('course_progress').select('*').eq('course_id', courseData.id).eq('user_id', userId).maybeSingle();
        if (progErr) toast.error('Could not load your saved progress. Your lessons are still here.');
        else if (prog) setProgress({ completed_lessons: prog.completed_lessons || [] });
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

  /** Every material the learner has, with ids. Selection and the plan's reading limit are applied by `usable`. */
  const loadSources = async (): Promise<Source[]> => {
    const [{ data: docs }, { data: notes }] = await Promise.all([
      supabase.from('documents').select('content, name').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      supabase.from('notes').select('content, title').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    ]);
    return [
      ...(docs || []).map((d: any, i: number) => ({ id: `d${i}:${d.name || ''}`, name: d.name || 'Document', content: d.content || '' })),
      ...(notes || []).map((n: any, i: number) => ({ id: `n${i}:${n.title || ''}`, name: n.title || 'Student note', content: n.content || '' })),
    ].filter(x => x.content.trim());
  };
  const usable = (all: Source[], ids?: string[]) => applyBudget(ids?.length ? all.filter(s => s.id && ids.includes(s.id)) : all, budget);
  useEffect(() => { if (status === 'ready') loadSources().then(setLibrary).catch(() => {}); }, [status, showRebuild, course?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const materials = useMemo(() => library.map(s => ({ id: s.id as string, name: s.name, chars: s.content.length })), [library]);
  const cover = useMemo(() => usable(library, opts.sourceIds).coverage, [library, opts.sourceIds, budget]); // eslint-disable-line react-hooks/exhaustive-deps
  const notice = coverageNotice(cover, { upgradePages: caps.plan === 'pro' ? 0 : pagesOf(pro.limits.course_material_chars) });
  const scope = (): LearnerScope => ({
    topic: project ? studySubjectText(project) : 'the learner’s topic', secondary: project ? levelOf(project) === 'secondary' : false,
    classLevel: String(project?.class_level || project?.study_year || ''), region,
  });
  // A busy AI service is retried twice after short waits before the learner is told.
  const ai = (task: 'course_outline' | 'course_module', prompt: string) => retryTransient(() => callAIJSON<any>({ task, prompt, region, persona, userGroqKey, projectId, validationType: task }));

  /** Write one pending module and save it. Everything already saved stays saved if this one fails. */
  const buildModule = async (index: number) => {
    const current = courseRef.current; const m = current?.modules?.[index];
    if (!current || !m || !isPending(m)) return;
    const bopts: BuildOptions = { depth: opts.depth, goals: m.build_opts?.goals || '', beyondNotes: !!m.build_opts?.beyondNotes, web: !!m.build_opts?.web, sourceIds: m.build_opts?.sourceIds };
    const sources = usable(await loadSources(), bopts.sourceIds).sources;
    const query = `${m.title} ${(m.outline || []).map((l: any) => `${l.title} ${l.objective}`).join(' ')}`;
    // Web research is optional: if it is off, fails or finds nothing, the module is written without it.
    let research: Research | null = null;
    if (bopts.beyondNotes && bopts.web) {
      try {
        const r = await fetch('/api/ai/ground', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(groundingRequest(scope(), outlineOf(m))) });
        if (r.ok) { const j = await r.json(); if (typeof j?.notes === 'string' && Array.isArray(j?.sources)) research = { notes: j.notes, sources: j.sources }; }
      } catch { /* continue without web research */ }
    }
    // Lessons are requested a few at a time: smaller answers are faster, less likely to be cut off, and kinder to free-tier limits.
    const outline = outlineOf(m); const titles = current.modules.map((x: any) => x.title); const context = selectContext(sources, query);
    const parts = outline.lessons.length ? balancedChunks(outline.lessons.length, 2) : [null];
    const written: any[] = [];
    for (const part of parts) {
      const data = await ai('course_module', modulePrompt(scope(), bopts, titles, outline, m.module_number, context, research, part ? { lessons: outline.lessons.slice(part.start, part.start + part.count), startNumber: part.start + 1 } : undefined));
      written.push(...data.lessons);
    }
    const latest = courseRef.current; // lesson visuals may have been saved meanwhile
    const modules = dbSafe(fillModule(latest.modules, index, attachSources(written, research)));
    const { error } = await supabase.from('courses').update({ modules }).eq('id', latest.id).eq('user_id', userId);
    if (error) { console.error('[course] save failed', error.code, error.message); throw new Error(`The module was written but could not be saved. Please try again.${dbErrorNote(error)}`); }
    courseRef.current = { ...latest, modules }; setCourse(courseRef.current);
  };

  const buildFrom = async (start = 0) => {
    if (busyRef.current) return;
    busyRef.current = true; setGenError('');
    try {
      for (let i = nextPendingIndex(courseRef.current?.modules || [], start); i >= 0; i = nextPendingIndex(courseRef.current?.modules || [], i + 1)) {
        setBuildingIdx(i);
        try { await buildModule(i); }
        catch (err) {
          const why = (err as { reasons?: string[] })?.reasons?.length ? ` (${(err as { reasons: string[] }).reasons.join('; ')})` : '';
          setGenError(`Module ${i + 1} could not be written. ${errorMessage(err, 'Please try again.')}${why} Your other modules are saved.`); break;
        }
        if (nextPendingIndex(courseRef.current?.modules || [], i + 1) >= 0) await new Promise(r => setTimeout(r, 1_500)); // a short pause between modules keeps free-tier limits happy
      }
    } finally { busyRef.current = false; setBuildingIdx(null); }
  };

  const generate = async () => {
    if (busyRef.current) return;
    setShowRebuild(false); setGenerating(true); setGenError('');
    try {
      const { sources, coverage } = usable(await loadSources(), opts.sourceIds);
      if (!sources.length) { setGenError('Add at least one document or note in Materials first. Akili builds the course from what you add.'); return; }
      const clean = { ...opts, depth: depthAllowed(opts.depth, deepOn) ? opts.depth : 'standard' as const, goals: cleanGoals(opts.goals), web: webOn };
      const size = sizeFor(clean.depth, totalChars(sources), !!clean.goals);
      if (coverage.truncated) toast(coverageNotice(coverage, { upgradePages: caps.plan === 'pro' ? 0 : pagesOf(pro.limits.course_material_chars) }), { duration: 9000 });
      const outline = await ai('course_outline', outlinePrompt(scope(), clean, outlineContext(sources), size));
      const modules = pendingModules(outline, clean);
      const { data: saved, error } = await supabase.from('courses').insert({
        project_id: projectId, user_id: userId, title: outline.title, description: outline.description,
        subject: project?.subject ?? null, exam_type: project?.exam_type ?? null, modules: dbSafe(modules),
      }).select().single();
      if (error || !saved) throw new Error('The outline was written but could not be saved. Please try again.');
      courseRef.current = saved; setCourse(saved); setProgress({ completed_lessons: [] }); setOpenModule(saved.modules[0]?.id ?? null); setActiveId(null);
      setGenerating(false);
      toast.success('Outline ready. Writing your lessons now.');
      await buildFrom(0);
    } catch (err) {
      setGenError(errorMessage(err, 'Course generation failed. Please try again.'));
    } finally {
      setGenerating(false);
    }
  };

  const addModule = async () => {
    const current = courseRef.current; if (!current || busyRef.current) return;
    setGenError(''); busyRef.current = true; setBuildingIdx(-1);
    try {
      const prevIds = [...current.modules].reverse().find((m: any) => m.source_ids?.length || m.build_opts?.sourceIds?.length);
      const ids = prevIds?.source_ids || prevIds?.build_opts?.sourceIds;
      const sources = usable(await loadSources(), ids).sources;
      const o: BuildOptions = { depth: opts.depth, goals: cleanGoals(addTopic), beyondNotes: addBeyond, web: webOn, sourceIds: ids };
      const existing = current.modules.map((m: any) => m.title);
      const context = o.goals ? selectContext(sources, o.goals, 12_000) : outlineContext(sources);
      const outline = await ai('course_outline', outlinePrompt(scope(), o, context, { modules: 1, lessonsPer: DEPTHS[opts.depth].lessonsPer }, existing));
      const fresh = pendingModules(outline, o, current.modules.length).slice(0, 1);
      const modules = [...current.modules, ...fresh];
      const { error } = await supabase.from('courses').update({ modules: dbSafe(modules) }).eq('id', current.id).eq('user_id', userId);
      if (error) throw new Error(`Could not save the new module. Please try again.${dbErrorNote(error)}`);
      courseRef.current = { ...current, modules }; setCourse(courseRef.current); setOpenModule(fresh[0].id); setAddTopic('');
    } catch (err) { setGenError(errorMessage(err, 'Could not add a module. Please try again.')); busyRef.current = false; setBuildingIdx(null); return; }
    busyRef.current = false; setBuildingIdx(null);
    await buildFrom(Math.max(0, (courseRef.current?.modules?.length || 1) - 1));
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

  // Lessons are saved one after another from the latest list, so two quick taps can never overwrite each other.
  const doneRef = useRef<string[]>([]);
  doneRef.current = progress.completed_lessons;
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const markComplete = (lessonId: string) => {
    if (doneRef.current.includes(lessonId)) return;
    const before = doneRef.current;
    const updated = addLesson(before, lessonId);
    doneRef.current = updated;
    setProgress({ completed_lessons: updated });
    saveQueue.current = saveQueue.current.then(async () => {
      const ok = await saveCompletedLessons(supabase, course.id, userId, updated);
      if (!ok) { doneRef.current = before; setProgress({ completed_lessons: before }); toast.error('Could not save your progress. Check your connection and try again.'); }
    });
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
        <EmptyState icon={<GraduationCap size={22} />} title="Build your course">
          Akili reads the notes and documents in Materials and turns them into lessons, worked examples and practice questions. It writes an outline first, then each module.
        </EmptyState>
        <Surface className="p-4"><CourseBuildForm materials={materials} notice={notice} truncated={cover.truncated} deepAllowed={deepOn} webAvailable={webOn} value={opts} onChange={setOpts} onSubmit={generate} submitLabel="Build course" /></Surface>
        {genError && <ErrorState title="No course yet" message={genError} onRetry={genError.includes('Materials') ? undefined : generate} />}
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

        {active.origin === 'beyond_notes' && <p className="rounded-xl bg-marker-wash p-3 text-sm font-semibold">Beyond your notes: this lesson adds standard material your notes do not cover. Check it against your textbook or teacher.</p>}
        {active.origin === 'web' && <p className="rounded-xl bg-marker-wash p-3 text-sm font-semibold">From the web: sources are listed at the end of this lesson.</p>}

        <Prose>{active.content}</Prose>

        {Array.isArray(active.sources) && active.sources.length > 0 && (
          <Surface className="p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Sources</p>
            <ul className="space-y-1.5 text-sm">{active.sources.map((src: any, i: number) => <li key={i}><a href={src.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-biro underline">{src.title}</a></li>)}</ul>
          </Surface>
        )}

        <LessonVisual
          lesson={active} projectId={projectId} userId={userId} region={region} persona={persona} userGroqKey={userGroqKey}
          level={project ? levelOf(project) : undefined} onPersist={saveLessonVisual}
        />

        <LessonExtras lesson={active} />

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
          if (isPending(mod)) {
            const idx = (course.modules || []).indexOf(mod); const writing = buildingIdx === idx;
            return (
              <li key={mod.id}>
                <Surface className="p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chalk text-sm font-extrabold">{mod.module_number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold leading-snug">{mod.title}</span>
                      <span className="block text-xs text-muted">{writing ? 'Writing this module now' : 'Not written yet'}</span>
                    </span>
                    {writing ? <RefreshCw size={18} className="shrink-0 animate-spin text-muted" aria-label="Writing" /> : <Button size="sm" variant="quiet" disabled={buildingIdx !== null} onClick={() => buildFrom(idx)}>Write</Button>}
                  </div>
                  {(mod.outline || []).length > 0 && <ul className="mt-3 space-y-1 border-t border-rule pt-3 text-sm text-muted">{mod.outline.map((l: any, i: number) => <li key={i}>{i + 1}. {l.title}</li>)}</ul>}
                </Surface>
              </li>
            );
          }
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

      {buildingIdx === null && (course.modules || []).length < 12 && (
        <Surface className="space-y-3 p-4">
          <p className="flex items-center gap-2 font-bold"><Plus size={17} /> Add more to this course</p>
          <TextInput aria-label="Topic to add" value={addTopic} maxLength={400} onChange={e => setAddTopic(e.target.value)} placeholder="A topic to add (optional)" />
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-ink" checked={addBeyond} onChange={e => setAddBeyond(e.target.checked)} /> It may go beyond my notes{webOn ? ' (checked against the web, with sources)' : ' (marked clearly)'}</label>
          <Button variant="quiet" block onClick={addModule}>Add a module</Button>
        </Surface>
      )}

      {buildingIdx === null && (showRebuild ? (
        <Surface className="space-y-3 p-4">
          <p className="text-sm font-semibold">Rebuilding writes a new course from your current materials. Lesson progress in the old course will not carry over.</p>
          <CourseBuildForm materials={materials} notice={notice} truncated={cover.truncated} deepAllowed={deepOn} webAvailable={webOn} value={opts} onChange={setOpts} onSubmit={generate} submitLabel="Rebuild course" />
          <Button variant="ghost" block onClick={() => setShowRebuild(false)}>Cancel</Button>
        </Surface>
      ) : <Button variant="ghost" block onClick={() => setShowRebuild(true)}><RefreshCw size={16} /> Rebuild course from my materials</Button>)}
    </div>
  );
}
