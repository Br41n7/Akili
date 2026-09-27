'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { GraduationCap, Zap, BookOpen, BarChart3, ChevronRight, Loader2, MessageSquare, Sparkles } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/projects');
      else setChecking(false);
    });
  }, []);

  if (checking) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-indigo-600" />
    </div>
  );

  const FEATURES = [
    { icon: GraduationCap, title: 'AI Course Builder', desc: 'Upload your notes or import from PastQ — AI builds a full Coursera-style course from them', color: 'bg-indigo-100 text-indigo-600' },
    { icon: BarChart3, title: 'Topic Analysis', desc: 'See which exam topics appear most. Know exactly where to focus your time', color: 'bg-violet-100 text-violet-600' },
    { icon: Zap, title: 'PastQ Integration', desc: 'Buy past questions on PastQ, import in one click, AI turns them into a study system', color: 'bg-green-100 text-green-600' },
    { icon: MessageSquare, title: 'Ask Your Notes', desc: 'Chat directly with your uploaded materials. Get answers in your language', color: 'bg-amber-100 text-amber-600' },
    { icon: Sparkles, title: 'Cultural Mnemonics', desc: 'Memory aids built from things you actually know — jollof rice, danfo, keke napep', color: 'bg-rose-100 text-rose-600' },
    { icon: BookOpen, title: 'Exam Simulation', desc: 'Timed WAEC/JAMB-style exam with post-exam weak concept analysis', color: 'bg-emerald-100 text-emerald-600' },
  ];

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="bg-white border-b border-black/8 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
            <GraduationCap size={17} className="text-white" />
          </div>
          <span className="font-black text-lg">Akili</span>
        </div>
        <div className="flex items-center gap-3">
          <a href={process.env.NEXT_PUBLIC_PASTQ_URL || 'https://pastq.co'}
            target="_blank" rel="noopener noreferrer"
            className="text-sm text-green-600 font-semibold hover:underline hidden md:inline">
            PastQ →
          </a>
          <Link href="/auth/login" className="text-sm text-gray-600 font-medium">Sign in</Link>
          <Link href="/auth/signup" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-white px-6 py-20 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full text-sm font-semibold">
            🌍 Built for secondary-school, university and lifelong learners — WAEC, JAMB, KCSE & more
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight">
            Study smarter,<br />
            <span className="text-indigo-600">not harder</span>
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            Upload your notes, import PastQ question banks, and let AI build a complete course, quiz, and exam system tailored to your environment.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup" className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-bold text-lg inline-flex items-center gap-2 transition-all">
              Start for Free <ChevronRight size={20} />
            </Link>
            <a href={process.env.NEXT_PUBLIC_PASTQ_URL || 'https://pastq.co'}
              target="_blank" rel="noopener noreferrer"
              className="bg-green-50 hover:bg-green-100 text-green-700 px-8 py-4 rounded-2xl font-bold text-lg inline-flex items-center gap-2 transition-all">
              <Zap size={18} /> Get Past Questions on PastQ
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 bg-[#F8F8F8]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-3">Everything in one place</h2>
          <p className="text-gray-500 text-center mb-10 text-sm">No more switching between apps. Upload once, study everything.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white rounded-3xl p-5 border border-black/5">
                <div className={`w-10 h-10 ${f.color} rounded-2xl flex items-center justify-center mb-3`}>
                  <f.icon size={20} />
                </div>
                <h3 className="font-bold mb-1 text-sm">{f.title}</h3>
                <p className="text-gray-500 text-xs">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PastQ bridge section */}
      <section className="px-6 py-16 bg-gradient-to-br from-indigo-600 to-violet-700 text-white text-center">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
              <GraduationCap size={18} className="text-white" />
            </div>
            <span className="text-2xl font-black">PastQ</span>
            <span className="text-indigo-300 text-2xl">+</span>
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <GraduationCap size={18} className="text-indigo-600" />
            </div>
            <span className="text-2xl font-black">Akili</span>
          </div>
          <h2 className="text-3xl font-black">Buy questions, get a full course</h2>
          <p className="text-indigo-200">
            Purchase any question bank on PastQ. Click "Import to Akili". In 60 seconds, AI analyses 10 years of exam patterns, predicts what's coming next, and builds you a complete structured course.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href={process.env.NEXT_PUBLIC_PASTQ_URL || 'https://pastq.co'}
              target="_blank" rel="noopener noreferrer"
              className="bg-green-500 hover:bg-green-400 text-white px-6 py-3.5 rounded-2xl font-bold text-sm inline-flex items-center gap-2 transition-all">
              Browse PastQ Banks <ChevronRight size={16} />
            </a>
            <Link href="/auth/signup"
              className="bg-white/10 hover:bg-white/20 text-white px-6 py-3.5 rounded-2xl font-bold text-sm transition-all">
              Create Akili Account
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-black/8 px-6 py-8 text-center">
        <p className="text-sm text-gray-400">© {new Date().getFullYear()} Akili. AI study copilot for secondary-school, university and lifelong learners.</p>
      </footer>
    </div>
  );
}
