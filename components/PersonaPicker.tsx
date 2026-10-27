'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { PERSONA_CHOICES, isChoosablePersona, type ChoosablePersona } from '@/lib/personas';

/** How the tutor talks. Saved at once; every AI feature reads it from the learner's profile. */
export default function PersonaPicker({ initial }: { initial?: string | null }) {
  const [value, setValue] = useState<ChoosablePersona>(isChoosablePersona(initial) ? initial : 'friendly');
  const [saving, setSaving] = useState(false);

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
    </div>
  );
}
