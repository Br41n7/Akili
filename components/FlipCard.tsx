'use client';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A card that flips on tap or Enter/Space. Both faces sit in the same grid cell, so the card is as tall as its longer face
 * (long answers are never clipped). The face that is turned away is hidden from screen readers. With "reduce motion" on,
 * the card swaps instantly instead of turning.
 */
export default function FlipCard({ front, back, flipped, onFlip, label, tone = 'dark', className }: {
  front: ReactNode; back: ReactNode; flipped: boolean; onFlip: () => void; label: string; tone?: 'dark' | 'light'; className?: string;
}) {
  const face = 'col-start-1 row-start-1 flex min-h-[200px] flex-col items-center justify-center rounded-2xl p-5 text-center [backface-visibility:hidden]';
  return (
    <button type="button" onClick={onFlip} aria-pressed={flipped} aria-label={label} className={cn('block w-full select-none text-left [perspective:1200px]', className)}>
      <span className="grid transition-transform duration-500 ease-out [transform-style:preserve-3d] motion-reduce:duration-0" style={{ transform: flipped ? 'rotateY(180deg)' : undefined }}>
        <span aria-hidden={flipped} className={cn(face, tone === 'dark' ? 'bg-ink text-white' : 'border border-rule bg-paper text-ink')}>{front}</span>
        <span aria-hidden={!flipped} className={cn(face, 'border border-rule bg-paper text-ink')} style={{ transform: 'rotateY(180deg)' }}>{back}</span>
      </span>
    </button>
  );
}
