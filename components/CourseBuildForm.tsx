'use client';
import { useId } from 'react';
import { Button, Field, Segmented, TextArea } from '@/components/ui';
import { DEPTHS, MAX_GOALS, type BuildOptions, type Depth } from '@/lib/course-builder';
import { Sparkles } from 'lucide-react';

interface Props { value: BuildOptions; onChange: (v: BuildOptions) => void; onSubmit: () => void; busy?: boolean; submitLabel: string }

/** The few choices that decide how big the course is and where its content may come from. */
export default function CourseBuildForm({ value, onChange, onSubmit, busy, submitLabel }: Props) {
  const id = useId();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-bold">How deep should it go?</p>
        <Segmented<Depth> label="Course depth" value={value.depth} onChange={depth => onChange({ ...value, depth })}
          options={(Object.keys(DEPTHS) as Depth[]).map(d => ({ value: d, label: DEPTHS[d].label }))} />
        <p className="text-xs text-muted">{DEPTHS[value.depth].hint}. More material in Materials gives a bigger course.</p>
      </div>
      <Field label="What do you most want to learn?" optional htmlFor={`${id}-goals`} hint="For example: cell division, and how to answer exam questions on genetics.">
        <TextArea id={`${id}-goals`} rows={3} maxLength={MAX_GOALS} value={value.goals} onChange={e => onChange({ ...value, goals: e.target.value })} placeholder="Topics you want covered" />
      </Field>
      <label className="flex min-h-11 items-start gap-3 rounded-xl border border-rule p-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-ink" checked={value.beyondNotes} onChange={e => onChange({ ...value, beyondNotes: e.target.checked })} />
        <span><span className="font-bold">Add standard material my notes do not cover</span><span className="mt-0.5 block text-muted">Off by default: the course stays inside your notes. When on, extra lessons are clearly marked "Beyond your notes".</span></span>
      </label>
      <Button block loading={busy} onClick={onSubmit}><Sparkles size={17} /> {submitLabel}</Button>
    </div>
  );
}
