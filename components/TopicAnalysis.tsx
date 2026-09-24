'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BarChart3, TrendingUp, AlertTriangle, Lightbulb, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { projectId: string; examType?: string; }

export default function TopicAnalysis({ projectId, examType }: Props) {
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('courses').select('topic_frequency, predicted_topics, title, subject')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => { setCourse(data); setLoading(false); });
  }, [projectId]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-indigo-600" />
    </div>
  );

  if (!course?.topic_frequency?.length) return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-3xl p-10 text-center space-y-3">
        <BarChart3 size={32} className="mx-auto text-gray-300" />
        <p className="font-bold text-gray-500">No Topic Analysis Yet</p>
        <p className="text-sm text-gray-400">
          Import a question bank from PastQ — AI automatically analyses which topics appear most often and predicts what's likely to come next.
        </p>
      </div>
    </div>
  );

  const maxCount = Math.max(...(course.topic_frequency || []).map((t: any) => t.count));

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">
          {examType || 'Exam'} Pattern Analysis
        </p>
        <h2 className="text-xl font-black">{course.subject} Topic Frequency</h2>
        <p className="text-indigo-200 text-xs mt-1">
          Based on {course.topic_frequency.reduce((a: number, t: any) => a + t.count, 0)} past questions
        </p>
      </div>

      {/* Topic frequency bars */}
      <div className="bg-white rounded-3xl p-5 space-y-3">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <BarChart3 size={16} className="text-indigo-600" /> Topic Frequency
        </h3>
        {(course.topic_frequency || [])
          .sort((a: any, b: any) => b.count - a.count)
          .slice(0, 15)
          .map((topic: any, i: number) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium truncate flex-1 mr-2">{topic.topic}</span>
                <span className="text-gray-400 shrink-0">
                  {topic.count}x · {topic.percentage?.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-2 rounded-full transition-all',
                    i === 0 ? 'bg-indigo-600' :
                    i < 3 ? 'bg-indigo-400' :
                    i < 7 ? 'bg-violet-400' : 'bg-gray-300'
                  )}
                  style={{ width: `${(topic.count / maxCount) * 100}%` }}
                />
              </div>
              {topic.years?.length > 0 && (
                <p className="text-[10px] text-gray-400">
                  Appeared in: {topic.years.sort().join(', ')}
                </p>
              )}
            </div>
          ))}
      </div>

      {/* Exam predictions */}
      {course.predicted_topics?.length > 0 && (
        <div className="bg-white rounded-3xl p-5 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" /> Exam Predictions
          </h3>
          <p className="text-xs text-gray-400">
            Topics overdue based on historical patterns — likely to appear soon
          </p>
          {course.predicted_topics.map((pred: any, i: number) => (
            <div key={i} className={cn(
              'p-3 rounded-2xl flex items-start gap-3',
              pred.confidence === 'high' ? 'bg-emerald-50' :
              pred.confidence === 'medium' ? 'bg-amber-50' : 'bg-gray-50'
            )}>
              <div className={cn(
                'w-2 h-2 rounded-full mt-1.5 shrink-0',
                pred.confidence === 'high' ? 'bg-emerald-500' :
                pred.confidence === 'medium' ? 'bg-amber-500' : 'bg-gray-400'
              )} />
              <div>
                <p className="font-semibold text-sm">{pred.topic}</p>
                <p className="text-xs text-gray-500 mt-0.5">{pred.reason}</p>
                <span className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block',
                  pred.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
                  pred.confidence === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                )}>
                  {pred.confidence} confidence
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-amber-50 rounded-3xl p-4 flex items-start gap-3">
        <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          These predictions are based on historical exam patterns and should guide — not replace — thorough study of all topics.
        </p>
      </div>
    </div>
  );
}
