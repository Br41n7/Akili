'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, Surface } from '@/components/ui';
import { useT } from '@/components/I18n';
import { HOME_GROUPS, daysUntil, nextStep, tileStatus, type HomeData } from '@/lib/guide';
import type { MessageKey } from '@/lib/i18n/messages';

const EMPTY: HomeData = { materials: 0, course: false, quiz: false, exam: false, lessonsDone: 0, lessonsTotal: 0, examDays: null, lastQuiz: null, lastExam: null };
const hideKey = (id: string) => `akili_guide_hidden_${id}`;

/** How far this learner has got. Each query fails on its own: a missing piece just shows nothing, never an error. */
function useHomeData(projectId: string, userId: string) {
  const [data, setData] = useState<HomeData | null>(null);
  useEffect(() => {
    let live = true;
    const safe = async <T,>(p: PromiseLike<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };
    (async () => {
      const count = (t: string) => supabase.from(t).select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', userId);
      const last = (type: string) => supabase.from('exam_attempts').select('score,total').eq('project_id', projectId).eq('user_id', userId).eq('type', type).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const none = { data: null, count: 0 } as any;
      const [docs, notes, course, quiz, exam, plan] = await Promise.all([
        safe(count('documents'), none), safe(count('notes'), none),
        safe(supabase.from('courses').select('id,modules').eq('project_id', projectId).eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(), none),
        safe(last('quiz'), none), safe(last('exam'), none),
        safe(supabase.from('study_plans').select('exam_date').eq('project_id', projectId).eq('user_id', userId).maybeSingle(), none),
      ]);
      let lessonsDone = 0;
      const c: any = course.data;
      const lessonsTotal = c ? (c.modules || []).reduce((n: number, m: any) => n + (m.lessons?.length || 0), 0) : 0;
      if (c?.id) { const prog: any = await safe(supabase.from('course_progress').select('completed_lessons').eq('course_id', c.id).eq('user_id', userId).maybeSingle(), none); lessonsDone = (prog.data?.completed_lessons || []).length; }
      const pair = (r: any) => (r.data && r.data.total ? { s: r.data.score ?? 0, t: r.data.total } : null);
      if (live) setData({
        materials: (docs.count || 0) + (notes.count || 0), course: !!c, quiz: !!quiz.data, exam: !!exam.data,
        lessonsDone, lessonsTotal, examDays: daysUntil(plan.data?.exam_date), lastQuiz: pair(quiz), lastExam: pair(exam),
      });
    })();
    return () => { live = false; };
  }, [projectId, userId]);
  return data;
}

/** The project's home: what to do next, then every feature as a tile, in four groups. */
export default function ProjectHome({ projectId, userId, onGoTo, tools }: {
  projectId: string; userId: string; onGoTo: (tab: string) => void;
  tools: Record<string, { label: string; icon: React.ComponentType<{ size?: number }>; desc: string }>;
}) {
  const { t } = useT();
  const data = useHomeData(projectId, userId);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem(hideKey(projectId)) === '1'); } catch { /* show it */ } }, [projectId]);
  const step = data && nextStep(data);
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      {step && !hidden && (
        <Surface className="flex items-center gap-3 border-biro/30 bg-biro-wash p-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-biro-dark">{t('guide.nextStep')}</p>
            <p className="truncate text-sm font-semibold">{t(`guide.${step.id}` as MessageKey)}</p>
          </div>
          <Button size="sm" onClick={() => onGoTo(step.tab)}>{t('guide.open')} <ArrowRight size={15} /></Button>
          <button type="button" aria-label={t('guide.hide')} className="min-h-9 px-1 text-xs text-muted underline"
            onClick={() => { try { localStorage.setItem(hideKey(projectId), '1'); } catch { /* ignore */ } setHidden(true); }}>{t('guide.hide')}</button>
        </Surface>
      )}
      {HOME_GROUPS.map(g => (
        <section key={g.id} aria-label={t(`home.${g.id}` as MessageKey)} className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{t(`home.${g.id}` as MessageKey)}</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {g.tabs.filter(id => tools[id]).map(id => {
              const T = tools[id]; const Icon = T.icon; const st = tileStatus(id, data);
              const guideDesc = `guide.f.${id}` as MessageKey; const blurb = t(guideDesc) === guideDesc ? T.desc : t(guideDesc);
              return (
                <button key={id} type="button" onClick={() => onGoTo(id)} className="flex min-h-[116px] flex-col items-start gap-1 rounded-2xl border border-rule bg-paper p-3 text-left active:bg-chalk">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-biro-wash text-biro-dark"><Icon size={18} /></span>
                  <span className="text-sm font-bold leading-tight">{T.label}</span>
                  <span className="line-clamp-2 text-xs leading-snug text-muted">{blurb}</span>
                  {st && <span className="mt-auto text-xs font-semibold text-biro-dark">{t(st.key, st.vars)}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <Link href="/faq" className="block text-center text-sm font-semibold text-biro">{t('guide.faqLink')}</Link>
    </div>
  );
}
