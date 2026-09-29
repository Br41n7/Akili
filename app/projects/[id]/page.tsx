'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, BarChart3, Brain, FileText, GraduationCap, HelpCircle, MessageSquare,
  MoreHorizontal, ShieldAlert, Sparkles, X, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Chip, ErrorState, IconButton, Skeleton } from '@/components/ui';
import { levelLabel, levelOf, projectChips, projectSubject, type ProjectRecord } from '@/lib/project-context';
import CourseView from '@/components/CourseView';
import QuizMode from '@/components/QuizMode';
import ExamMode from '@/components/ExamMode';
import Flashcards from '@/components/Flashcards';
import AskAI from '@/components/AskAI';
import TopicAnalysis from '@/components/TopicAnalysis';
import Materials from '@/components/Materials';
import LearningProgress from '@/components/LearningProgress';
import ResearchLab from '@/components/ResearchLab';

type Tab = 'materials' | 'course' | 'quiz' | 'exam' | 'flashcards' | 'ask' | 'analysis' | 'progress' | 'research';

interface TabDef { id: Tab; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; desc: string }

const TABS: TabDef[] = [
  { id: 'materials', label: 'Materials', icon: FileText, desc: 'Notes and documents' },
  { id: 'course', label: 'Course', icon: GraduationCap, desc: 'Lessons built from your materials' },
  { id: 'quiz', label: 'Quiz', icon: HelpCircle, desc: 'Practice that adapts to you' },
  { id: 'exam', label: 'Exam', icon: ShieldAlert, desc: 'Timed mock exam' },
  { id: 'ask', label: 'Ask AI', icon: MessageSquare, desc: 'Ask questions about your notes' },
  { id: 'flashcards', label: 'Flashcards', icon: Sparkles, desc: 'Memory aids' },
  { id: 'analysis', label: 'Topic analysis', icon: BarChart3, desc: 'What comes up most' },
  { id: 'progress', label: 'Progress', icon: Brain, desc: 'Strong and weak concepts' },
  { id: 'research', label: 'Research', icon: Zap, desc: 'Editing and facts' },
];

/** The four tabs on the phone bottom bar. Everything else lives under "More". */
const PRIMARY: Tab[] = ['materials', 'course', 'quiz', 'exam'];

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('materials');
  const [moreOpen, setMoreOpen] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [userGroqKey, setUserGroqKey] = useState<string | undefined>();

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { router.push('/auth/login'); return; }
      setUser(u);

      const [{ data: proj, error }, { data: prof }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).eq('user_id', u.id).maybeSingle(),
        supabase.from('profiles').select('*').eq('id', u.id).maybeSingle(),
      ]);
      if (error) throw error;
      if (!proj) { router.push('/projects'); return; }
      setProject(proj as ProjectRecord);
      setProfile(prof);

      // Land on the course when there is one already (PastQ imports, or a course built earlier).
      const { data: course } = await supabase.from('courses').select('id').eq('project_id', projectId).limit(1).maybeSingle();
      if (course) setTab('course');
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [projectId, router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    try { setUserGroqKey(JSON.parse(sessionStorage.getItem('akili_keys') || '{}').groqKey || undefined); } catch { /* ignore */ }
  }, []);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  if (status === 'loading') {
    return (
      <div className="min-h-dvh">
        <div className="border-b border-rule bg-paper px-4 py-3"><Skeleton className="h-6 w-2/3" /></div>
        <div className="mx-auto max-w-3xl space-y-3 p-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
      </div>
    );
  }

  if (status === 'error' || !project || !user) {
    return (
      <div className="mx-auto max-w-md p-4 pt-10">
        <ErrorState title="This project did not open" message="Check your connection, then try again." onRetry={load} />
        <Link href="/projects" className="mt-4 block text-center text-sm font-semibold text-biro">Back to projects</Link>
      </div>
    );
  }

  const region = profile?.region || 'Nigeria';
  const persona = profile?.persona || 'friendly';
  const isPrimary = PRIMARY.includes(tab);
  const active = TABS.find(t => t.id === tab)!;
  const chips = projectChips(project);
  const subject = projectSubject(project);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe sticky top-0 z-40 border-b border-rule bg-paper">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-2">
          <Link href="/projects" aria-label="Back to projects" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-ink/5 active:bg-ink/10">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-bold leading-tight">{project.name}</h1>
            <p className="truncate text-xs text-muted">
              {[subject && subject !== project.name ? subject : '', ...chips].filter(Boolean).join(' · ') || levelLabel(project)}
            </p>
          </div>
          <Chip tone={levelOf(project) === 'secondary' ? 'marker' : 'biro'} className="mr-2 hidden xs:inline-flex sm:inline-flex">{levelLabel(project)}</Chip>
        </div>

        {/* Tablet and desktop: every tab in one row */}
        <nav aria-label="Project sections" className="no-scrollbar mx-auto hidden max-w-3xl gap-1 overflow-x-auto px-3 pb-2 md:flex">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn('flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold', tab === t.id ? 'bg-ink text-white' : 'text-ink hover:bg-ink/5')}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </nav>

        {/* Phone: name the section when it lives under "More" */}
        {!isPrimary && (
          <div className="mx-auto flex max-w-3xl items-center gap-2 border-t border-rule px-4 py-2 md:hidden">
            <active.icon size={16} />
            <span className="text-sm font-bold">{active.label}</span>
            <span className="truncate text-xs text-muted">{active.desc}</span>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 pb-28 md:pb-10">
        {tab === 'materials' && <Materials projectId={projectId} userId={user.id} />}
        {tab === 'course' && <CourseView projectId={projectId} userId={user.id} region={region} persona={persona} userGroqKey={userGroqKey} onGoToMaterials={() => setTab('materials')} />}
        {tab === 'analysis' && <TopicAnalysis projectId={projectId} examType={project.exam_board || project.exam_type || undefined} isSecondary={levelOf(project) === 'secondary'} />}
        {tab === 'progress' && <LearningProgress projectId={projectId} userId={user.id} />}
        {tab === 'quiz' && <QuizMode projectId={projectId} userId={user.id} region={region} persona={persona} onGoToMaterials={() => setTab('materials')} />}
        {tab === 'exam' && <ExamMode projectId={projectId} userId={user.id} region={region} persona={persona} onGoToMaterials={() => setTab('materials')} />}
        {tab === 'flashcards' && <Flashcards projectId={projectId} userId={user.id} region={region} />}
        {tab === 'ask' && <AskAI projectId={projectId} userId={user.id} region={region} persona={persona} onGoToMaterials={() => setTab('materials')} />}
        {tab === 'research' && <ResearchLab projectId={projectId} userId={user.id} region={region} persona={persona} />}
      </main>

      {/* Phone: bottom bar */}
      <nav aria-label="Project sections" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper md:hidden">
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {PRIMARY.map(id => {
            const t = TABS.find(x => x.id === id)!;
            const on = tab === id;
            return (
              <li key={id}>
                <button onClick={() => setTab(id)} aria-current={on ? 'page' : undefined} className="flex min-h-[58px] w-full flex-col items-center justify-center gap-0.5">
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', on && 'bg-marker')}>
                    <t.icon size={20} strokeWidth={on ? 2.5 : 2} />
                  </span>
                  <span className={cn('text-[11px]', on ? 'font-bold text-ink' : 'font-medium text-muted')}>{t.label}</span>
                </button>
              </li>
            );
          })}
          <li>
            <button onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className="flex min-h-[58px] w-full flex-col items-center justify-center gap-0.5">
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', !isPrimary && 'bg-marker')}>
                <MoreHorizontal size={20} strokeWidth={!isPrimary ? 2.5 : 2} />
              </span>
              <span className={cn('text-[11px]', !isPrimary ? 'font-bold text-ink' : 'font-medium text-muted')}>More</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] flex items-end bg-ink/50 animate-fade md:hidden" onClick={() => setMoreOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="More sections" onClick={e => e.stopPropagation()} className="pb-safe w-full animate-sheet rounded-t-3xl bg-paper p-3">
            <div className="flex items-center justify-between px-2 pb-1 pt-1">
              <h2 className="text-base font-bold">More</h2>
              <IconButton label="Close" onClick={() => setMoreOpen(false)}><X size={20} /></IconButton>
            </div>
            <ul>
              {TABS.filter(t => !PRIMARY.includes(t.id)).map(t => (
                <li key={t.id}>
                  <button onClick={() => { setTab(t.id); setMoreOpen(false); }} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left active:bg-chalk">
                    <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', tab === t.id ? 'bg-marker' : 'bg-chalk')}><t.icon size={19} /></span>
                    <span>
                      <span className="block text-[15px] font-semibold">{t.label}</span>
                      <span className="block text-xs text-muted">{t.desc}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
