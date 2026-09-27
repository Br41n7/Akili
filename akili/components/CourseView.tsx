'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { callAI, safeJsonParse, cn } from '@/lib/utils';
import { recordEvidence } from '@/lib/adaptive';
import { GraduationCap, ChevronDown, ChevronRight, CheckCircle2, Circle, BookOpen, Play, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';

interface Props {
  projectId: string; userId: string;
  region: string; persona: string; userGroqKey?: string;
}

export default function CourseView({ projectId, userId, region, persona, userGroqKey }: Props) {
  const [course, setCourse] = useState<any>(null);
  const [progress, setProgress] = useState<any>({ completed_lessons: [] });
  const [generating, setGenerating] = useState(false);
  const [activeLesson, setActiveLesson] = useState<any>(null);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [quizAnswer, setQuizAnswer] = useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: courseData } = await supabase.from('courses').select('*').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).single();
      let progressData: any = null;
      if (courseData) {
        const { data } = await supabase.from('course_progress').select('*').eq('course_id', courseData.id).eq('user_id', userId).single();
        progressData = data;
      }
      if (courseData) { setCourse(courseData); setExpandedModule(courseData.modules?.[0]?.id); }
      if (progressData) setProgress(progressData);
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [projectId, userId]);

  const generateCourse = async () => {
    setGenerating(true);
    try {
      // Get project documents as context
      const { data: docs } = await supabase.from('documents').select('content, name')
        .eq('project_id', projectId).eq('user_id', userId).limit(5);

      const context = docs?.map(d => `[${d.name}]\n${d.content}`).join('\n\n').slice(0, 8000) || '';
      if (!context) { toast.error('Add study materials first before generating a course'); setGenerating(false); return; }

      const { data: project } = await supabase.from('projects').select('name, subject, exam_type').eq('id', projectId).single();

      const prompt = `Create a comprehensive learning course for ${project?.subject || 'the learner’s topic'} from the following study materials. The learning context is ${project?.exam_type || 'university/self-study/general learning'}. Format it like a Coursera/Udemy course with detailed, educational lessons.

Study Materials:
${context}

Requirements:
- Minimum 3 modules, each with 2-4 lessons
- Each lesson: min 300 words of content in markdown, learning objectives, worked example, common mistakes, 3 practice questions
- Use culturally relevant examples
- Structure content for the learner's stated learning context; do not assume an exam unless an exam context is explicitly supplied

Return JSON:
{
  "title": string,
  "description": string,
  "estimated_duration": string,
  "modules": [{
    "id": string,
    "module_number": number,
    "title": string,
    "estimated_time": string,
    "lessons": [{
      "id": string,
      "lesson_number": number,
      "title": string,
      "learning_objectives": [string],
      "content": "detailed markdown",
      "key_concepts": [string],
      "worked_example": { "problem": string, "solution_steps": [string], "answer": string },
      "common_mistakes": [string],
      "practice_questions": [{
        "id": string, "question": string, "concept": string,
        "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
        "correct_answer": "A",
        "explanation": string
      }]
    }]
  }]
}`;

      const raw = await callAI({ task: 'course_builder', prompt, region, persona, format: 'json', userGroqKey });
      const data = safeJsonParse(raw);
      if (!data?.modules?.length) throw new Error('Course generation returned empty data');

      const { data: saved } = await supabase.from('courses').insert({
        project_id: projectId, user_id: userId,
        title: data.title, description: data.description,
        subject: project?.subject, exam_type: project?.exam_type,
        modules: data.modules,
      }).select().single();

      if (saved) {
        setCourse(saved);
        setExpandedModule(data.modules[0]?.id);
        toast.success('Course generated!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Course generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const markComplete = async (lessonId: string) => {
    const completed = progress.completed_lessons || [];
    if (completed.includes(lessonId)) return;
    const updated = [...completed, lessonId];

    await supabase.from('course_progress').upsert({
      course_id: course.id, user_id: userId,
      completed_lessons: updated,
    });
    setProgress((p: any) => ({ ...p, completed_lessons: updated }));
  };

  const totalLessons = course?.modules?.reduce((acc: number, m: any) => acc + (m.lessons?.length || 0), 0) || 0;
  const completedCount = progress.completed_lessons?.length || 0;
  const completionPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-600" /></div>;

  if (!course) return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-3xl p-10 text-center space-y-4">
        <div className="w-14 h-14 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto">
          <GraduationCap size={26} className="text-indigo-600" />
        </div>
        <h2 className="text-xl font-black">Generate Your Course</h2>
        <p className="text-sm text-gray-500">AI will read your uploaded materials and build a structured course with lessons, examples, and practice questions.</p>
        <p className="text-xs text-amber-600 bg-amber-50 px-4 py-2 rounded-xl">Upload study materials first in the Materials tab</p>
        <button onClick={generateCourse} disabled={generating}
          className="flex items-center gap-2 mx-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-8 py-3.5 rounded-2xl font-bold text-sm">
          {generating ? <><Loader2 size={16} className="animate-spin" /> Building course...</> : <><Sparkles size={16} /> Generate Course</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Sidebar — modules */}
      <div className="w-72 bg-white border-r border-black/8 overflow-y-auto no-scrollbar shrink-0 hidden md:block">
        <div className="p-4 border-b border-black/8">
          <p className="font-black text-sm">{course.title}</p>
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{completedCount}/{totalLessons} lessons</span>
              <span>{completionPct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-1.5 bg-indigo-600 rounded-full transition-all" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        </div>

        <div className="p-2 space-y-1">
          {course.modules?.map((mod: any) => (
            <div key={mod.id}>
              <button onClick={() => setExpandedModule(expandedModule === mod.id ? null : mod.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 rounded-xl transition-all">
                <span className="text-[10px] font-black text-gray-400 w-5">{mod.module_number}</span>
                <span className="text-xs font-bold flex-1 text-left">{mod.title}</span>
                {expandedModule === mod.id ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
              </button>
              {expandedModule === mod.id && (
                <div className="ml-4 space-y-0.5">
                  {mod.lessons?.map((lesson: any) => {
                    const done = progress.completed_lessons?.includes(lesson.id);
                    const isActive = activeLesson?.id === lesson.id;
                    return (
                      <button key={lesson.id}
                        onClick={() => { setActiveLesson(lesson); setQuizSubmitted(false); setQuizAnswer({}); }}
                        className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all',
                          isActive ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50')}>
                        {done
                          ? <CheckCircle2 size={14} className="text-indigo-600 shrink-0" />
                          : <Circle size={14} className="text-gray-300 shrink-0" />}
                        <span className="text-xs truncate">{lesson.lesson_number}. {lesson.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-black/8">
          <button onClick={generateCourse} disabled={generating}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
            <RefreshCw size={12} /> Regenerate Course
          </button>
        </div>
      </div>

      {/* Main lesson view */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!activeLesson ? (
          <div className="p-6 max-w-2xl mx-auto space-y-4">
            <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl p-8 text-white">
              <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2">Your Course</p>
              <h1 className="text-2xl font-black mb-2">{course.title}</h1>
              <p className="text-indigo-200 text-sm">{course.description}</p>
              <div className="flex items-center gap-4 mt-4 text-xs text-indigo-200">
                <span>📚 {totalLessons} lessons</span>
                <span>⏱ {course.estimated_duration}</span>
                <span>✅ {completionPct}% complete</span>
              </div>
            </div>
            <p className="text-sm text-gray-500 text-center">Select a lesson from the sidebar to begin</p>
          </div>
        ) : (
          <div className="p-6 max-w-3xl mx-auto space-y-6">
            <div>
              <p className="text-xs text-indigo-600 font-semibold mb-1">{activeLesson.title}</p>
              <div className="flex gap-2 flex-wrap">
                {activeLesson.learning_objectives?.map((obj: string, i: number) => (
                  <span key={i} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">{obj}</span>
                ))}
              </div>
            </div>

            {/* Lesson content */}
            <div className="bg-white rounded-3xl p-6 prose prose-sm max-w-none">
              <ReactMarkdown>{activeLesson.content}</ReactMarkdown>
            </div>

            {/* Key concepts */}
            {activeLesson.key_concepts?.length > 0 && (
              <div className="bg-indigo-50 rounded-3xl p-5">
                <p className="font-bold text-sm mb-2">🔑 Key Concepts</p>
                <div className="flex flex-wrap gap-2">
                  {activeLesson.key_concepts.map((c: string, i: number) => (
                    <span key={i} className="bg-white text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full border border-indigo-200">{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Worked example */}
            {activeLesson.worked_example && (
              <div className="bg-amber-50 rounded-3xl p-5 space-y-3">
                <p className="font-bold text-sm">📐 Worked Example</p>
                <p className="text-sm font-semibold">{activeLesson.worked_example.problem}</p>
                <div className="space-y-1">
                  {activeLesson.worked_example.solution_steps?.map((step: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">{i + 1}</span>
                      {step}
                    </div>
                  ))}
                </div>
                <p className="text-sm font-black text-amber-700">Answer: {activeLesson.worked_example.answer}</p>
              </div>
            )}

            {/* Common mistakes */}
            {activeLesson.common_mistakes?.length > 0 && (
              <div className="bg-rose-50 rounded-3xl p-5">
                <p className="font-bold text-sm mb-2">⚠️ Common Mistakes</p>
                <ul className="space-y-1">
                  {activeLesson.common_mistakes.map((m: string, i: number) => (
                    <li key={i} className="text-sm text-rose-700 flex gap-2"><span>•</span>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Practice questions */}
            {activeLesson.practice_questions?.length > 0 && (
              <div className="bg-white rounded-3xl p-5 space-y-4">
                <p className="font-bold text-sm">🎯 Practice Questions</p>
                {activeLesson.practice_questions.map((q: any, qi: number) => (
                  <div key={q.id} className="space-y-2">
                    <p className="text-sm font-semibold">{qi + 1}. {q.question}</p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {q.options?.map((opt: string) => {
                        const letter = opt[0];
                        const selected = quizAnswer[q.id] === letter;
                        const correct = quizSubmitted && letter === q.correct_answer;
                        const wrong = quizSubmitted && selected && letter !== q.correct_answer;
                        return (
                          <button key={opt} disabled={quizSubmitted}
                            onClick={() => setQuizAnswer(p => ({ ...p, [q.id]: letter }))}
                            className={cn('text-left px-3 py-2 rounded-xl text-sm border transition-all',
                              correct ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                              wrong ? 'border-rose-400 bg-rose-50 text-rose-700' :
                              selected ? 'border-indigo-500 bg-indigo-50' :
                              'border-gray-200 hover:border-indigo-300')}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {quizSubmitted && q.explanation && (
                      <p className="text-xs text-gray-500 pl-1">💡 {q.explanation}</p>
                    )}
                  </div>
                ))}

                {!quizSubmitted ? (
                  <button onClick={async () => {
                    setQuizSubmitted(true);
                    for (const q of activeLesson.practice_questions) {
                      const correct = quizAnswer[q.id] === q.correct_answer;
                      await recordEvidence({
                        userId, projectId,
                        concept: q.concept || activeLesson.key_concepts?.[0] || activeLesson.title,
                        sourceType: 'lesson',
                        interactionType: 'lesson_practice',
                        prompt: q.question,
                        learnerResponse: quizAnswer[q.id] || '',
                        correctness: correct,
                        difficulty: 'developing',
                        evidence: q.explanation || 'Lesson practice result',
                      });
                    }
                  }} disabled={Object.keys(quizAnswer).length < activeLesson.practice_questions.length}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-bold">
                    Check Answers
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold text-indigo-600">
                      {activeLesson.practice_questions.filter((q: any) => quizAnswer[q.id] === q.correct_answer).length}/{activeLesson.practice_questions.length} correct
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Complete button */}
            <button onClick={() => markComplete(activeLesson.id)}
              disabled={progress.completed_lessons?.includes(activeLesson.id)}
              className={cn('w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
                progress.completed_lessons?.includes(activeLesson.id)
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white')}>
              <CheckCircle2 size={16} />
              {progress.completed_lessons?.includes(activeLesson.id) ? 'Lesson Completed ✓' : 'Mark as Complete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
