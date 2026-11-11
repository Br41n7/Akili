'use client';
import { Stethoscope } from 'lucide-react';
import { useT } from '@/components/I18n';

/** The situation behind an application question, set apart from the question itself. */
export default function ScenarioCard({ text, compact = false }: { text: string; compact?: boolean }) {
  const { t } = useT();
  return (
    <figure className={`rounded-2xl border border-biro/30 bg-biro-wash ${compact ? 'p-3' : 'p-4'}`}>
      <figcaption className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-biro-dark"><Stethoscope size={14} aria-hidden /> {t('quiz.scenario')}</figcaption>
      <blockquote className={`font-read leading-relaxed ${compact ? 'text-sm' : 'text-base'}`}>{text}</blockquote>
    </figure>
  );
}
