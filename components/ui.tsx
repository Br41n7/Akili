'use client';
import { useEffect, useRef, useState, type ComponentPropsWithRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Brand
// ─────────────────────────────────────────────────────────────────────────────

/** An answer bubble, half shaded: the mark you make on a JAMB answer sheet. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="#fff" stroke="#16204A" strokeWidth="2.5" />
      <path d="M16 3a13 13 0 0 1 0 26z" fill="#16204A" />
      <rect x="4" y="25" width="24" height="4" rx="2" fill="#F5D547" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-extrabold tracking-tight text-ink text-xl', className)}>
      <LogoMark />
      Akili
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Buttons and links
// ─────────────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'dark' | 'quiet' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'sm';

export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false) =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors select-none',
    'disabled:opacity-45 disabled:cursor-not-allowed',
    size === 'md' ? 'min-h-12 px-5 text-[15px]' : 'min-h-10 px-3.5 text-sm',
    block && 'w-full',
    variant === 'primary' && 'bg-biro text-white hover:bg-biro-dark active:bg-biro-dark',
    variant === 'dark' && 'bg-ink text-white hover:bg-ink-soft active:bg-ink-soft',
    variant === 'quiet' && 'bg-paper text-ink border border-rule hover:border-ink/40 active:bg-chalk',
    variant === 'ghost' && 'text-ink hover:bg-ink/5 active:bg-ink/10',
    variant === 'danger' && 'bg-redpen text-white hover:opacity-90',
  );

interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
}

export function Button({ variant, size, block, loading, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size, block), className)}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cn('inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink hover:bg-ink/5 active:bg-ink/10 disabled:opacity-40', className)}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Surfaces
// ─────────────────────────────────────────────────────────────────────────────

export function Surface({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('rounded-2xl border border-rule bg-paper', className)}>
      {children}
    </div>
  );
}

type ChipTone = 'neutral' | 'ink' | 'biro' | 'marker' | 'tick' | 'red';
export function Chip({ tone = 'neutral', className, children }: { tone?: ChipTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold leading-5',
        tone === 'neutral' && 'bg-chalk text-muted',
        tone === 'ink' && 'bg-ink text-white',
        tone === 'biro' && 'bg-biro-wash text-biro-dark',
        tone === 'marker' && 'bg-marker-wash text-ink',
        tone === 'tick' && 'bg-tick-wash text-tick',
        tone === 'red' && 'bg-redpen-wash text-redpen',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value, label, className }: { value: number; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-rule', className)}
    >
      <div className="h-full rounded-full bg-biro transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form fields (16px text so phones do not zoom on focus)
// ─────────────────────────────────────────────────────────────────────────────

const fieldClasses =
  'w-full min-h-12 rounded-xl border border-rule bg-paper px-4 text-base text-ink placeholder:text-muted/70 focus:border-biro focus:outline-none focus:ring-2 focus:ring-biro/20 disabled:bg-chalk';

export function Field({ label, hint, error, htmlFor, optional, children }: { label: string; hint?: string; error?: string; htmlFor: string; optional?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-sm font-semibold text-ink">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-muted">Optional</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs font-medium text-redpen">{error}</p>}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(fieldClasses, className)} />;
}

export function SelectInput({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(fieldClasses, 'appearance-none bg-[length:16px] bg-[right_1rem_center] bg-no-repeat pr-10', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235B6480' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(fieldClasses, 'py-3 leading-relaxed', className)} />;
}

/** Choice chips for short lists (class, goal, difficulty). Single select. */
export function ChoiceChips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T | ''; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(o => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors',
              selected ? 'border-ink bg-ink text-white' : 'border-rule bg-paper text-ink hover:border-ink/40',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal switcher for sections inside a tab. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {options.map(o => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative min-h-11 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors',
              selected ? 'bg-ink text-white' : 'bg-paper text-ink border border-rule hover:border-ink/40',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Answer options: the OMR bubble
// ─────────────────────────────────────────────────────────────────────────────

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'missed';

export function OptionRow({ letter, text, state = 'idle', disabled, onClick }: { letter: string; text: string; state?: OptionState; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={state === 'selected' || state === 'correct' || state === 'wrong'}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors min-h-[52px]',
        state === 'idle' && 'border-rule bg-paper hover:border-ink/40 active:bg-chalk',
        state === 'selected' && 'border-ink bg-ink/[0.04]',
        state === 'correct' && 'border-tick bg-tick-wash',
        state === 'wrong' && 'border-redpen bg-redpen-wash',
        state === 'missed' && 'border-tick border-dashed bg-paper',
        disabled && 'cursor-default',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors',
          state === 'idle' && 'border-ink/60 text-ink/70',
          state === 'selected' && 'border-ink bg-ink text-white',
          state === 'correct' && 'border-tick bg-tick text-white',
          state === 'wrong' && 'border-redpen bg-redpen text-white',
          state === 'missed' && 'border-tick text-tick',
        )}
      >
        {state === 'correct' ? <Check size={16} strokeWidth={3} /> : state === 'wrong' ? <X size={16} strokeWidth={3} /> : letter}
      </span>
      <span className="font-read text-[1.0625rem] leading-snug text-ink">{text}</span>
      {state === 'correct' && <span className="sr-only">Correct answer</span>}
      {state === 'wrong' && <span className="sr-only">Your answer, incorrect</span>}
    </button>
  );
}

/** Split "B) Some text" into the letter and the text. */
export function splitOption(opt: string): { letter: string; text: string } {
  const m = opt.match(/^([A-Fa-f])[\).:\-]\s*([\s\S]*)$/);
  return m ? { letter: m[1].toUpperCase(), text: m[2] } : { letter: opt.charAt(0).toUpperCase(), text: opt.slice(2).trim() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading, empty and error states
// ─────────────────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-lg bg-rule/70', className)} />;
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Surface key={i} className="space-y-3 p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </Surface>
      ))}
    </div>
  );
}

export function PageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
      <Loader2 size={26} className="animate-spin text-biro" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink/25 bg-paper/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-marker-wash text-ink">{icon}</div>}
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'That did not work', message, onRetry, retryLabel = 'Try again' }: { title?: string; message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-redpen/30 border-l-4 border-l-redpen bg-paper p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-redpen" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">{title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">{message}</p>
          {onRetry && (
            <Button variant="quiet" size="sm" className="mt-3" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Shown while the AI works (often 10 to 60 seconds on a phone connection).
 * Rotates through what is happening and admits when it is taking a while.
 */
export function GeneratingPanel({ title, steps, className }: { title: string; steps: string[]; className?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const step = steps[Math.min(Math.floor(elapsed / 6), steps.length - 1)];
  return (
    <Surface role="status" aria-live="polite" className={cn('p-5', className)}>
      <p className="font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{step}</p>
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-rule">
        <div className="absolute inset-y-0 w-1/3 rounded-full bg-marker animate-slide" />
      </div>
      {elapsed >= 25 && <p className="mt-3 text-xs text-muted">Still working. Longer materials take a little more time.</p>}
    </Surface>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialog (bottom sheet on phones, centred on larger screens)
// ─────────────────────────────────────────────────────────────────────────────

export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel = 'Cancel', danger, busy, onConfirm, onCancel }: {
  open: boolean; title: string; body?: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 animate-fade sm:items-center" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={e => e.stopPropagation()}
        className="pb-safe w-full max-w-md animate-sheet rounded-t-3xl bg-paper p-5 sm:rounded-3xl"
      >
        <h2 id="dialog-title" className="text-lg font-bold text-ink">{title}</h2>
        {body && <div className="mt-1.5 text-sm leading-relaxed text-muted">{body}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="quiet" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading text
// ─────────────────────────────────────────────────────────────────────────────

export function Prose({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('prose-akili', className)}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
