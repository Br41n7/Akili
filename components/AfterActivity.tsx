'use client';
import { ArrowRight } from 'lucide-react';
import { Button, Surface } from '@/components/ui';

/** A short "what next" prompt shown after a quiz, exam or lesson. Renders nothing when navigation is not available. */
export default function AfterActivity({ message, actions, onGoTo }: {
  message: string; actions: Array<{ label: string; tab: string }>; onGoTo?: (tab: string) => void;
}) {
  if (!onGoTo) return null;
  return (
    <Surface className="space-y-2 border-biro/30 bg-biro-wash p-3.5">
      <p className="text-sm font-semibold">{message}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => <Button key={a.tab} size="sm" variant={i === 0 ? 'primary' : 'quiet'} onClick={() => onGoTo(a.tab)}>{a.label} <ArrowRight size={14} /></Button>)}
      </div>
    </Surface>
  );
}
