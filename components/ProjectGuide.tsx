'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, Surface } from '@/components/ui';
import { useT } from '@/components/I18n';
import { FEATURE_TABS, guideSteps, nextStep, type GuideState } from '@/lib/guide';
import type { MessageKey } from '@/lib/i18n/messages';

const EMPTY: GuideState = { materials: 0, course: false, quiz: false, exam: false };

/** Reads how far this learner has got in the project. Failures are silent: the guide just shows nothing done. */
export function useGuideState(projectId: string, userId: string, refreshKey?: unknown) {
  const [state, setState] = useState<GuideState | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const q = (t: string) => supabase.from(t).select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', userId);
        const [docs, notes, course, quiz, exam] = await Promise.all([
          q('documents'), q('notes'),
          supabase.from('courses').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
          q('exam_attempts').eq('type', 'quiz'), q('exam_attempts').eq('type', 'exam'),
        ]);
        if (live) setState({ materials: (docs.count || 0) + (notes.count || 0), course: (course.count || 0) > 0, quiz: (quiz.count || 0) > 0, exam: (exam.count || 0) > 0 });
      } catch { if (live) setState(EMPTY); }
    })();
    return () => { live = false; };
  }, [projectId, userId, refreshKey]);
  return state;
}

const hideKey = (projectId: string) => `akili_guide_hidden_${projectId}`;

/** A small "next step" card for the top of Materials and Course. Hides itself when done or dismissed. */
export function NextStepCard({ projectId, userId, onGoTo }: { projectId: string; userId: string; onGoTo: (tab: string) => void }) {
  const { t } = useT();
  const state = useGuideState(projectId, userId);
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(hideKey(projectId)) === '1'); } catch { setHidden(false); } }, [projectId]);
  const step = state && nextStep(state);
  if (!step || hidden) return null;
  return (
    <Surface className="mx-4 mt-4 flex items-center gap-3 border-biro/30 bg-biro-wash p-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wide text-biro-dark">{t('guide.nextStep')}</p>
        <p className="truncate text-sm font-semibold">{t(`guide.${step.id}` as MessageKey)}</p>
      </div>
      <Button size="sm" onClick={() => onGoTo(step.tab)}>{t('guide.open')} <ArrowRight size={15} /></Button>
      <button type="button" aria-label={t('guide.hide')} className="min-h-9 px-1 text-xs text-muted underline"
        onClick={() => { try { localStorage.setItem(hideKey(projectId), '1'); } catch { /* ignore */ } setHidden(true); }}>{t('guide.hide')}</button>
    </Surface>
  );
}

/** The full "Start here" tab: first steps with ticks, then every tool in one line. */
export default function ProjectGuide({ projectId, userId, onGoTo, tools }: {
  projectId: string; userId: string; onGoTo: (tab: string) => void;
  tools: Record<string, { label: string; icon: React.ComponentType<{ size?: number }> }>;
}) {
  const { t } = useT();
  const state = useGuideState(projectId, userId);
  const steps = guideSteps(state || EMPTY);
  const allDone = !!state && steps.every(s => s.done);
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h2 className="text-2xl font-extrabold tracking-tight">{t('guide.title')}</h2>
      <section aria-label={t('guide.stepsTitle')} className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{t('guide.stepsTitle')}</h3>
        {allDone && <p className="text-sm text-tick">{t('guide.allDone')}</p>}
        {steps.map(s => (
          <Surface key={s.id} className="flex items-center gap-3 p-3">
            {s.done ? <CheckCircle2 size={22} className="shrink-0 text-tick" aria-label={t('guide.done')} /> : <Circle size={22} className="shrink-0 text-muted" />}
            <div className="min-w-0 flex-1"><p className="text-sm font-bold">{t(`guide.${s.id}` as MessageKey)}</p><p className="text-sm text-muted">{t(`guide.${s.id}d` as MessageKey)}</p></div>
            <Button size="sm" variant={s.done ? 'quiet' : 'primary'} onClick={() => onGoTo(s.tab)}>{t('guide.open')}</Button>
          </Surface>
        ))}
      </section>
      <section aria-label={t('guide.toolsTitle')} className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{t('guide.toolsTitle')}</h3>
        {FEATURE_TABS.filter(id => tools[id]).map(id => {
          const T = tools[id]; const Icon = T.icon;
          return (
            <button key={id} type="button" onClick={() => onGoTo(id)} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-rule bg-paper p-3 text-left active:bg-chalk">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-biro-wash text-biro-dark"><Icon size={19} /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{T.label}</span><span className="block text-sm text-muted">{t(`guide.f.${id}` as MessageKey)}</span></span>
              <ArrowRight size={16} className="shrink-0 text-muted" />
            </button>
          );
        })}
      </section>
      <Link href="/faq" className="block text-center text-sm font-semibold text-biro">{t('guide.faqLink')}</Link>
    </div>
  );
}
