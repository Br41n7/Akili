'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BarChart3, TrendingUp, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Chip, EmptyState, ErrorState, Skeleton, Surface } from '@/components/ui';

interface Props { projectId: string; examType?: string; isSecondary?: boolean }

export default function TopicAnalysis({ projectId, examType, isSecondary }: Props) {
  const [course, setCourse] = useState<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = () => {
    setStatus('loading');
    supabase.from('courses').select('topic_frequency, predicted_topics, title, subject')
      .eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error }) => { if (error) { setStatus('error'); return; } setCourse(data); setStatus('ready'); });
  };

  useEffect(load, [projectId]);

  if (status === 'loading') return <div className="space-y-3 p-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (status === 'error') return <div className="p-4"><ErrorState message="Topic analysis did not load. Check your connection and try again." onRetry={load} /></div>;

  if (!course?.topic_frequency?.length) {
    return (
      <div className="p-4">
        <EmptyState icon={<BarChart3 size={22} />} title="No topic analysis yet">
          Import a question bank from PastQ. Akili works out which topics come up most and which ones look overdue.
        </EmptyState>
      </div>
    );
  }

  const sorted = [...course.topic_frequency].sort((a: any, b: any) => b.count - a.count);
  const maxCount = Math.max(...sorted.map((t: any) => t.count));
  const totalQuestions = course.topic_frequency.reduce((a: number, t: any) => a + t.count, 0);

  return (
    <div className="space-y-4 p-4">
      <Surface className="bg-ink p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-marker">{isSecondary ? `${examType || 'Exam'} pattern analysis` : 'Question bank analysis'}</p>
        <h2 className="mt-1 text-xl font-extrabold leading-tight">{course.subject || course.title} topic frequency</h2>
        <p className="mt-1 text-sm text-white/70">Based on {totalQuestions} past questions</p>
      </Surface>

      <Surface className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold"><BarChart3 size={16} className="text-biro" /> Topic frequency</h3>
        {sorted.slice(0, 15).map((topic: any, i: number) => (
          <div key={i} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{topic.topic}</span>
              <span className="shrink-0 text-xs text-muted">{topic.count}× · {topic.percentage?.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-rule">
              <div className={cn('h-2 rounded-full', i === 0 ? 'bg-biro' : i < 3 ? 'bg-biro/70' : i < 7 ? 'bg-biro/45' : 'bg-muted/40')} style={{ width: `${(topic.count / maxCount) * 100}%` }} />
            </div>
            {topic.years?.length > 0 && <p className="text-xs text-muted">Appeared in: {[...topic.years].sort().join(', ')}</p>}
          </div>
        ))}
      </Surface>

      {course.predicted_topics?.length > 0 && (
        <Surface className="space-y-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><TrendingUp size={16} className="text-tick" /> Likely to come up</h3>
          <p className="text-xs text-muted">Topics that look overdue, based on how often they have appeared</p>
          {course.predicted_topics.map((pred: any, i: number) => (
            <div key={i} className={cn('flex items-start gap-3 rounded-xl p-3', pred.confidence === 'high' ? 'bg-tick-wash' : pred.confidence === 'medium' ? 'bg-marker-wash' : 'bg-chalk')}>
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', pred.confidence === 'high' ? 'bg-tick' : pred.confidence === 'medium' ? 'bg-marker' : 'bg-muted')} />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">{pred.topic}</p>
                {pred.reason && <p className="mt-0.5 text-xs text-muted">{pred.reason}</p>}
                <Chip tone={pred.confidence === 'high' ? 'tick' : pred.confidence === 'medium' ? 'marker' : 'neutral'} className="mt-1.5">{pred.confidence} confidence</Chip>
              </div>
            </div>
          ))}
        </Surface>
      )}

      <div className="flex items-start gap-2.5 rounded-xl bg-marker-wash p-3.5">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-ink" />
        <p className="text-xs leading-relaxed text-ink/80">These patterns should guide your study, not replace covering every topic.</p>
      </div>
    </div>
  );
}
