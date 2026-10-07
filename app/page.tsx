'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ArrowRight, BarChart3, BookOpen, FileUp, GraduationCap, HelpCircle, MessageSquare, RotateCcw, School, ShieldAlert, Sparkles } from 'lucide-react';
import { Chip, OptionRow, PageSpinner, Wordmark, buttonClasses, type OptionState } from '@/components/ui';
import { cn } from '@/lib/utils';

const PASTQ_URL = process.env.NEXT_PUBLIC_PASTQ_URL || 'https://pastq.co';

/* ───────────────────────── Hero demo: one real question, answered on the page ───────────────────────── */

const SAMPLE = {
  stem: 'Which part of the cell releases energy from glucose?',
  options: [
    { letter: 'A', text: 'Nucleus' },
    { letter: 'B', text: 'Mitochondrion' },
    { letter: 'C', text: 'Ribosome' },
    { letter: 'D', text: 'Vacuole' },
  ],
  correct: 'B',
  why: 'Respiration happens in the mitochondria. That is why muscle cells, which use a lot of energy, contain so many of them.',
};

function SampleQuestion() {
  const [picked, setPicked] = useState<string | null>(null);

  const stateOf = (letter: string): OptionState => {
    if (!picked) return 'idle';
    if (letter === SAMPLE.correct) return picked === letter ? 'correct' : 'missed';
    return letter === picked ? 'wrong' : 'idle';
  };

  return (
    <div className="rounded-3xl border border-rule bg-paper p-4 shadow-[0_2px_0_0_#DCE0E9] sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip tone="marker">Secondary</Chip>
        <Chip>WAEC Biology</Chip>
      </div>
      <p className="font-read text-[1.1875rem] leading-snug text-ink">{SAMPLE.stem}</p>

      <div role="radiogroup" aria-label="Answer options" className="mt-4 space-y-2">
        {SAMPLE.options.map(o => (
          <OptionRow key={o.letter} letter={o.letter} text={o.text} state={stateOf(o.letter)} disabled={!!picked} onClick={() => setPicked(o.letter)} />
        ))}
      </div>

      <div aria-live="polite" className="mt-4 min-h-[5.5rem]">
        {picked ? (
          <div className="rounded-xl bg-marker-wash p-3.5">
            <p className="text-sm font-bold text-ink">{picked === SAMPLE.correct ? 'Correct.' : `Not quite. The answer is ${SAMPLE.correct}.`}</p>
            <p className="mt-1 font-read text-[15px] leading-relaxed text-ink-soft">{SAMPLE.why}</p>
            <button type="button" onClick={() => setPicked(null)} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-biro">
              <RotateCcw size={14} /> Try again
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Tap an answer. Your own questions are written from your own notes.</p>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Content ───────────────────────── */

const STEPS = [
  { icon: FileUp, title: 'Add your notes', body: 'Name the project and the course. Upload a PDF or TXT now, or add materials later when you have them.' },
  { icon: BookOpen, title: 'Study the course', body: 'Akili turns your materials into short lessons, with examples drawn from everyday life where you live.' },
  { icon: HelpCircle, title: 'Test yourself', body: 'Practice quizzes keep returning to what you get wrong. Mock exams are timed and marked at the end.' },
];

const FEATURES = [
  { icon: BookOpen, title: 'Lessons from your notes', body: 'Your materials are the syllabus. Akili does not invent course details your notes do not cover.' },
  { icon: HelpCircle, title: 'Quizzes that adapt', body: 'Questions get harder where you are strong and come back where you slip.' },
  { icon: ShieldAlert, title: 'Timed mock exams', body: 'Sit a full paper under exam conditions, then see which concepts cost you marks.' },
  { icon: MessageSquare, title: 'Ask your notes', body: 'Ask a question and get an answer based on what you uploaded, in plain language.' },
  { icon: BarChart3, title: 'Topic analysis', body: 'Import past questions to see which topics come up most and where to spend your time.' },
  { icon: Sparkles, title: 'Memory aids from home', body: 'Mnemonics built from things you know, like jollof rice, danfo routes and market prices.' },
];

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="max-w-xl">
      <h2 className="text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-4xl">{children}</h2>
      {sub && <p className="mt-3 text-base leading-relaxed text-muted sm:text-lg">{sub}</p>}
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/projects');
      else setChecking(false);
    });
  }, [router]);

  if (checking) return <PageSpinner label="Loading Akili" />;

  return (
    <div className="min-h-dvh bg-chalk">
      {/* Top bar */}
      <header className="pt-safe sticky top-0 z-40 border-b border-rule bg-chalk/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Akili home"><Wordmark /></Link>
          <nav aria-label="Account" className="flex items-center gap-1">
            <Link href="/auth/login" className={cn(buttonClasses('ghost', 'sm'))}>Sign in</Link>
            <Link href="/auth/signup" className={cn(buttonClasses('primary', 'sm'))}>Start free</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pb-24">
          <div>
            <h1 className="text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
              Study from your own notes, not someone else’s.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
              Add your PDFs and class notes. Akili builds lessons, quizzes and timed mock exams for WAEC, NECO, JAMB, KCSE or your university course.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/auth/signup" className={cn(buttonClasses('primary'), 'sm:px-7')}>
                Create a free project <ArrowRight size={18} />
              </Link>
              <Link href="/auth/login" className={buttonClasses('quiet')}>I already have an account</Link>
            </div>
            <p className="mt-4 text-sm text-muted">Free while we test. PDF and TXT files up to 2 MB.</p>
          </div>

          <SampleQuestion />
        </section>

        {/* How it works: a real sequence */}
        <section className="border-y border-rule bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <SectionTitle sub="Setting up takes a minute. You only need a name and a course.">From notes to exam practice in three steps</SectionTitle>
            <ol className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4 sm:block">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-marker text-lg font-extrabold text-ink" aria-hidden="true">{i + 1}</span>
                  <div className="sm:mt-4">
                    <h3 className="text-lg font-bold">{s.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What you get */}
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <SectionTitle>Everything you need to revise, in one place</SectionTitle>
          <ul className="mt-8 divide-y divide-rule border-y border-rule">
            {FEATURES.map(f => (
              <li key={f.title} className="grid gap-1.5 py-5 sm:grid-cols-[18rem_1fr] sm:gap-8">
                <h3 className="flex items-center gap-3 text-base font-bold">
                  <f.icon size={19} className="shrink-0 text-biro" aria-hidden="true" />
                  {f.title}
                </h3>
                <p className="pl-8 text-[15px] leading-relaxed text-muted sm:pl-0">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Two levels */}
        <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
          <SectionTitle sub="Akili adjusts the depth, wording and question style to your level.">Made for school and for campus</SectionTitle>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl bg-marker-wash p-6 sm:p-8">
              <School size={26} className="text-ink" aria-hidden="true" />
              <h3 className="mt-4 text-xl font-bold">Secondary and O-Level</h3>
              <p className="mt-2 font-read text-[1.0625rem] leading-relaxed text-ink-soft">
                Plain language, worked examples and objective questions with options A to D, in the style of your exam board.
              </p>
            </div>
            <div className="rounded-3xl bg-biro-wash p-6 sm:p-8">
              <GraduationCap size={26} className="text-biro-dark" aria-hidden="true" />
              <h3 className="mt-4 text-xl font-bold">University</h3>
              <p className="mt-2 font-read text-[1.0625rem] leading-relaxed text-ink-soft">
                Correct terminology and reasoning at undergraduate level, built on your lecture notes and course handouts.
              </p>
            </div>
          </div>
        </section>

        {/* PastQ */}
        <section className="bg-tick text-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between md:py-14">
            <div className="max-w-xl">
              <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">Bought a question bank on PastQ?</h2>
              <p className="mt-2 text-base leading-relaxed text-white/85">PastQ is for examination question banks. Choose a bank on PastQ, then use its <strong>Import to Akili</strong> action to bring a purchased bank into your study workspace.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a href={PASTQ_URL} target="_blank" rel="noopener noreferrer" className={cn(buttonClasses('dark'))}>Open PastQ</a>
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="bg-ink text-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <h2 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">Your next exam is closer than you think.</h2>
            <p className="mt-4 max-w-lg text-lg text-white/75">Start a project with just a name and a course. Add your notes whenever you have them.</p>
            <Link href="/auth/signup" className={cn(buttonClasses('primary'), 'mt-7 bg-marker text-ink hover:bg-marker/90 active:bg-marker/90')}>
              Create a free project <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-paper">
        <div className="pb-safe mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Wordmark className="text-base" />
          <p>© {new Date().getFullYear()} Akili. A study copilot for secondary school and university learners.</p>
        </div>
      </footer>
    </div>
  );
}
