'use client';
import { useId } from 'react';
import { Button, Field, Segmented, TextArea } from '@/components/ui';
import { DEPTHS, MAX_GOALS, depthAllowed, pagesOf, type BuildOptions, type Depth } from '@/lib/course-builder';
import { Sparkles } from 'lucide-react';

export interface MaterialItem { id: string; name: string; chars: number }
interface Props { /** The learner's materials; when given, they can pick which ones to use. */ materials?: MaterialItem[]; /** Plain-words note on how much will be read. */ notice?: string; truncated?: boolean; deepAllowed?: boolean; webAvailable?: boolean; value: BuildOptions; onChange: (v: BuildOptions) => void; onSubmit: () => void; busy?: boolean; submitLabel: string }

/** The few choices that decide how big the course is and where its content may come from. */
export default function CourseBuildForm({ materials, notice, truncated, deepAllowed = true, webAvailable, value, onChange, onSubmit, busy, submitLabel }: Props) {
  const id = useId();
  const picked = new Set(value.sourceIds?.length ? value.sourceIds : (materials || []).map(m => m.id));
  const toggle = (mid: string) => {
    const next = new Set(picked); if (next.has(mid)) next.delete(mid); else next.add(mid);
    onChange({ ...value, sourceIds: next.size === (materials || []).length ? [] : [...next] });
  };
  const none = !!materials?.length && picked.size === 0;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-bold">How deep should it go?</p>
        <Segmented<Depth> label="Course depth" value={value.depth} onChange={depth => onChange({ ...value, depth })}
          options={(Object.keys(DEPTHS) as Depth[]).filter(d => depthAllowed(d, deepAllowed) || value.depth === d).map(d => ({ value: d, label: DEPTHS[d].label }))} />
        <p className="text-xs text-muted">{DEPTHS[value.depth].hint}. More material in Materials gives a bigger course.{!deepAllowed ? ' Deep courses are part of the paid plan.' : ''}</p>
      </div>
      {materials && materials.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Which materials should it use?</legend>
          <ul className="space-y-1">
            {materials.map(m => (
              <li key={m.id}><label className="flex min-h-11 items-center gap-3 rounded-xl border border-rule px-3 text-sm">
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-ink" checked={picked.has(m.id)} onChange={() => toggle(m.id)} />
                <span className="min-w-0 flex-1 truncate">{m.name}</span><span className="shrink-0 text-xs text-muted">{pagesOf(m.chars)} p</span>
              </label></li>
            ))}
          </ul>
          {notice && <p role="status" className={`text-xs ${truncated || none ? 'font-bold text-redpen' : 'text-muted'}`}>{none ? 'Choose at least one material.' : notice}</p>}
        </fieldset>
      )}
      <Field label="What do you most want to learn?" optional htmlFor={`${id}-goals`} hint="For example: cell division, and how to answer exam questions on genetics.">
        <TextArea id={`${id}-goals`} rows={3} maxLength={MAX_GOALS} value={value.goals} onChange={e => onChange({ ...value, goals: e.target.value })} placeholder="Topics you want covered" />
      </Field>
      <label className="flex min-h-11 items-start gap-3 rounded-xl border border-rule p-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-ink" checked={value.beyondNotes} onChange={e => onChange({ ...value, beyondNotes: e.target.checked })} />
        <span><span className="font-bold">Add standard material my notes do not cover</span><span className="mt-0.5 block text-muted">Off by default: the course stays inside your notes. {webAvailable ? 'When on, extra lessons are checked against web sources and link to them.' : 'When on, extra lessons are clearly marked "Beyond your notes".'}</span></span>
      </label>
      <Button block loading={busy} disabled={none} onClick={onSubmit}><Sparkles size={17} /> {submitLabel}</Button>
    </div>
  );
}
