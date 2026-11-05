import Link from 'next/link';
import { Download, ExternalLink, FolderOpen } from 'lucide-react';
import { Chip, Surface, buttonClasses } from '@/components/ui';
import { cn } from '@/lib/utils';
import { formatPrice, yearsLabel, type BankState, type LibraryBank } from '@/lib/pastq-library';

interface Props { bank: LibraryBank; state: BankState; buyHref: string; projectId?: string | null }

/** One question bank: what it is, what it costs, and the single thing the learner can do next. */
export default function PastqBankCard({ bank, state, buyHref, projectId }: Props) {
  const meta = [bank.exam_type, yearsLabel(bank), bank.question_count ? `${bank.question_count} questions` : '', bank.school || '', bank.country || ''].filter(Boolean).join(' · ');
  return (
    <Surface className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold leading-snug">{bank.title}</h3>
          <p className="text-sm text-muted">{bank.subject}</p>
          <p className="mt-0.5 text-xs text-muted">{meta}</p>
        </div>
        <div className="shrink-0">
          {state === 'imported' ? <Chip tone="tick">In your projects</Chip> : state === 'owned' ? <Chip tone="tick">You own this</Chip> : <span className={cn('rounded-full border px-2 py-0.5 text-xs font-bold', state === 'free' ? 'border-tick/40 text-tick' : 'border-rule text-ink')}>{formatPrice(bank.price)}</span>}
        </div>
      </div>
      {bank.description && <p className="line-clamp-2 text-sm text-ink/80">{bank.description}</p>}
      {state === 'imported' && projectId ? (
        <Link href={`/projects/${projectId}`} className={buttonClasses('quiet')}><FolderOpen size={16} /> Open project</Link>
      ) : state === 'paid' ? (
        <div className="space-y-1">
          <a href={buyHref} target="_blank" rel="noopener noreferrer" className={buttonClasses('primary')}><ExternalLink size={16} /> Buy on PastQ</a>
          <p className="text-xs text-muted">You pay on PastQ. Come back here afterwards and this will change to Import.</p>
        </div>
      ) : (
        <Link href={`/import?bank=${encodeURIComponent(bank.id)}`} className={buttonClasses('primary')}><Download size={16} /> Import into Akili</Link>
      )}
    </Surface>
  );
}
