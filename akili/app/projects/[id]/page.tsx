'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, BookOpen, GraduationCap, HelpCircle,
  ShieldAlert, Sparkles, MessageSquare, Eye,
  BarChart3, Loader2, FileText, Zap, Brain
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

const TABS: { id: Tab; label: string; icon: any; desc: string }[] = [
  { id: 'materials', label: 'Materials', icon: FileText, desc: 'Documents & notes' },
  { id: 'course', label: 'Course', icon: GraduationCap, desc: 'AI-built lessons' },
  { id: 'analysis', label: 'Topic Analysis', icon: BarChart3, desc: 'Exam patterns' },
  { id: 'progress', label: 'Learning Profile', icon: Brain, desc: 'Your adaptive progress' },
  { id: 'quiz', label: 'Quiz', icon: HelpCircle, desc: 'Practice questions' },
  { id: 'exam', label: 'Exam Mode', icon: ShieldAlert, desc: 'Timed simulation' },
  { id: 'flashcards', label: 'Flashcards', icon: Sparkles, desc: 'Memory aids' },
  { id: 'ask', label: 'Ask AI', icon: MessageSquare, desc: 'Chat with your notes' },
  { id: 'research', label: 'Research', icon: Zap, desc: 'Originality & facts' },
];

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<Tab>('materials');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      setUser(user);

      const [{ data: proj }, { data: prof }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).eq('user_id', user.id).single(),
        supabase.from('profiles').select('*').eq('id', user.id).single(),
      ]);

      if (!proj) { router.push('/projects'); return; }
      setProject(proj);
      setProfile(prof);

      // If from PastQ, go straight to course if it exists
      if (proj.source === 'pastq') {
        const { data: course } = await supabase.from('courses').select('id').eq('project_id', projectId).single();
        if (course) setActiveTab('course');
      }

      setLoading(false);
    }
    load();
  }, [projectId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F8F8]">
      <Loader2 size={28} className="animate-spin text-indigo-600" />
    </div>
  );

  const region = profile?.region || 'Nigeria';
  const persona = profile?.persona || 'friendly';
  const userGroqKey = typeof window !== 'undefined'
    ? JSON.parse(sessionStorage.getItem('akili_keys') || '{}').groqKey
    : undefined;

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col">
      {/* Top nav */}
      <nav className="bg-white border-b border-black/8 px-4 py-3 flex items-center gap-3 sticky top-0 z-50">
        <Link href="/projects" className="p-1.5 hover:bg-gray-100 rounded-xl transition-all">
          <ArrowLeft size={17} className="text-gray-500" />
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
            <GraduationCap size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{project?.name}</p>
            <div className="flex items-center gap-1.5">
              {project?.exam_type && <span className="text-[10px] text-indigo-600 font-semibold">{project.exam_type}</span>}
              {project?.source === 'pastq' && (
                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                  <Zap size={9} /> PastQ
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Tab bar */}
      <div className="bg-white border-b border-black/8 px-4 overflow-x-auto no-scrollbar">
        <div className="flex gap-0.5 py-2 w-max">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              )}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'materials' && <Materials projectId={projectId} userId={user?.id} />}
        {activeTab === 'course' && <CourseView projectId={projectId} userId={user?.id} region={region} persona={persona} userGroqKey={userGroqKey} />}
        {activeTab === 'analysis' && <TopicAnalysis projectId={projectId} examType={project?.exam_type} />}
        {activeTab === 'progress' && <LearningProgress projectId={projectId} userId={user?.id} />}
        {activeTab === 'quiz' && <QuizMode projectId={projectId} userId={user?.id} region={region} persona={persona} />}
        {activeTab === 'exam' && <ExamMode projectId={projectId} userId={user?.id} region={region} persona={persona} />}
        {activeTab === 'flashcards' && <Flashcards projectId={projectId} userId={user?.id} region={region} />}
        {activeTab === 'ask' && <AskAI projectId={projectId} userId={user?.id} region={region} persona={persona} />}
        {activeTab === 'research' && <ResearchLab projectId={projectId} userId={user?.id} region={region} persona={persona} />}
      </div>
    </div>
  );
}
