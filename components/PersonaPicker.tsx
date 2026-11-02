'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';
import { Button, TextArea } from '@/components/ui';
import { usePlan } from '@/lib/use-plan';
import { CUSTOM_PERSONA_ID, CUSTOM_STYLE_MAX, CUSTOM_STYLE_MIN, PERSONA_CHOICES, isChoosablePersona, type ChoosablePersona } from '@/lib/personas';

/** How the tutor talks. Saved at once; every AI feature reads it from the learner's profile. */
export default function PersonaPicker({ initial, initialStyle }: { initial?: string | null; initialStyle?: string | null }) {
  const { caps, pro } = usePlan();
  const canCustom = caps.has('custom_tutor_style');
  const [value, setValue] = useState<ChoosablePersona | typeof CUSTOM_PERSONA_ID>(isChoosablePersona(initial) ? initial : initial === CUSTOM_PERSONA_ID && initialStyle ? CUSTOM_PERSONA_ID : 'friendly');
  const [saving, setSaving] = useState(false);
  const [style, setStyle] = useState(initialStyle || '');
  const [savedStyle, setSavedStyle] = useState(initialStyle || '');

  const saveCustom = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/profiles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: CUSTOM_PERSONA_ID, custom_tutor_style: style }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Could not save. Please try again.');
      setValue(CUSTOM_PERSONA_ID); setSavedStyle(j.custom_tutor_style || style.trim()); toast.success('Your tutor style is saved');
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const pick = async (id: ChoosablePersona) => {
    if (id === value || saving) return;
    const before = value; setValue(id); setSaving(true);
    try {
      const res = await fetch('/api/profiles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: id }) });
      if (!res.ok) throw new Error();
      toast.success('Tutor style saved');
    } catch { setValue(before); toast.error('Could not save. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div role="radiogroup" aria-label="Tutor style" className="space-y-2">
      {PERSONA_CHOICES.map(p => {
        const on = p.id === value;
        return (
          <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => pick(p.id)}
            className={cn('w-full rounded-2xl border-2 p-3.5 text-left transition-colors', on ? 'border-biro bg-biro-wash' : 'border-rule bg-paper active:bg-chalk')}>
            <span className="flex items-center justify-between gap-2"><span className="font-bold">{p.label}</span>{on && <Check size={18} className="text-biro" aria-hidden />}</span>
            <span className="block text-sm text-muted">{p.blurb}</span>
            <span className="mt-1.5 block rounded-lg bg-chalk px-2.5 py-1.5 text-xs italic text-ink/80">“{p.sample}”</span>
          </button>
        );
      })}
      {!canCustom ? (
        <div className="rounded-2xl border-2 border-dashed border-rule bg-paper p-3.5">
          <span className="flex items-center gap-2 font-bold"><Lock size={16} aria-hidden /> Your own style <span className="rounded-md bg-marker-wash px-2 py-0.5 text-xs">{pro.name}</span></span>
          <span className="block text-sm text-muted">Describe exactly how you want to be taught, for example “explain like a football commentator”. Available on the {pro.name} plan.</span>
        </div>
      ) : (
        <div className={cn('space-y-2 rounded-2xl border-2 p-3.5', value === CUSTOM_PERSONA_ID ? 'border-biro bg-biro-wash' : 'border-rule bg-paper')}>
          <span className="flex items-center justify-between gap-2"><span className="font-bold">Your own style</span>{value === CUSTOM_PERSONA_ID && <Check size={18} className="text-biro" aria-hidden />}</span>
          <TextArea aria-label="Describe your tutor style" rows={3} maxLength={CUSTOM_STYLE_MAX} value={style} onChange={e => setStyle(e.target.value)} placeholder="For example: explain like a football commentator, short sentences, and end with one question." />
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted">{style.length}/{CUSTOM_STYLE_MAX}. Changes tone and examples only, never the facts.</span>
            <Button size="sm" loading={saving} disabled={style.trim().length < CUSTOM_STYLE_MIN || (value === CUSTOM_PERSONA_ID && style.trim() === savedStyle)} onClick={saveCustom}>{value === CUSTOM_PERSONA_ID ? 'Update' : 'Use this style'}</Button></div>
        </div>
      )}
    </div>
  );
}
