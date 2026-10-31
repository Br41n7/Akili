'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button, ErrorState, Field, Skeleton, Surface, TextInput } from '@/components/ui';
import { resetPlanCache } from '@/lib/use-plan';
import { FEATURES, type Feature } from '@/lib/plan';
import { type PlanRow } from '@/lib/plans-db';
import { pagesOf } from '@/lib/course-builder';
import toast from 'react-hot-toast';

const FEATURE_LABELS: Record<Feature, string> = {
  hourly_reminders: 'Hourly reminders', cloud_tts: 'Cloud voice (TTS)', image_generation: 'Image generation', video_export: 'Video export',
  search_grounding: 'Web research (search grounding)', long_materials: 'Long materials flag', deep_courses: 'Deep courses',
};
interface Sub { user_id: string; email: string; name: string; status: string; current_period_end: string | null }
const naira = (kobo: number | null) => (kobo === null ? '' : String(kobo / 100));
const api = async (url: string, method: string, body?: unknown) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || 'That did not work.'); return j;
};

function PlanEditor({ plan, onSaved }: { plan: PlanRow; onSaved: (p: PlanRow) => void }) {
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(naira(plan.price_kobo));
  const [active, setActive] = useState(plan.active);
  const [dailyAi, setDailyAi] = useState(String(plan.limits.daily_ai));
  const [pages, setPages] = useState(String(pagesOf(plan.limits.course_material_chars)));
  const [projects, setProjects] = useState(plan.limits.max_projects === null ? '' : String(plan.limits.max_projects));
  const [images, setImages] = useState(String(plan.limits.daily_image_generations));
  const [features, setFeatures] = useState<Feature[]>(plan.features);
  const [busy, setBusy] = useState(false);
  const free = plan.id === 'free';

  const save = async () => {
    const n = (s: string) => Number(s.trim());
    const priceKobo = free ? 0 : price.trim() === '' ? null : Math.round(n(price) * 100);
    if (!free && priceKobo !== null && !Number.isFinite(priceKobo)) return toast.error('Enter the price as a number, in naira.');
    const body = {
      id: plan.id, name, ...(free ? {} : { price_kobo: priceKobo, active, features }),
      limits: { daily_ai: n(dailyAi), course_material_chars: Math.round(n(pages) * 1800), max_projects: projects.trim() === '' ? null : n(projects), daily_image_generations: n(images) },
    };
    setBusy(true);
    try { const j = await api('/api/admin/plans', 'PUT', body); resetPlanCache(); onSaved(j.plan); toast.success(`${j.plan.name} plan saved.`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Surface className="space-y-4 p-4">
      <h2 className="text-base font-bold">{plan.name} plan <span className="text-xs font-normal text-muted">({plan.id})</span></h2>
      <Field label="Plan name" htmlFor={`${plan.id}-name`}><TextInput id={`${plan.id}-name`} value={name} maxLength={40} onChange={e => setName(e.target.value)} /></Field>
      {!free && <Field label="Price per month (₦)" htmlFor={`${plan.id}-price`} hint="Leave empty while the price is not decided. Changes apply to new payments only."><TextInput id={`${plan.id}-price`} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="Not set" /></Field>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="AI requests per day" htmlFor={`${plan.id}-ai`}><TextInput id={`${plan.id}-ai`} inputMode="numeric" value={dailyAi} onChange={e => setDailyAi(e.target.value)} /></Field>
        <Field label="Material pages per course" htmlFor={`${plan.id}-pages`} hint="About 1,800 characters a page."><TextInput id={`${plan.id}-pages`} inputMode="numeric" value={pages} onChange={e => setPages(e.target.value)} /></Field>
        <Field label="Max projects" htmlFor={`${plan.id}-proj`} hint="Empty = no limit."><TextInput id={`${plan.id}-proj`} inputMode="numeric" value={projects} onChange={e => setProjects(e.target.value)} placeholder="No limit" /></Field>
        <Field label="Image generations per day" htmlFor={`${plan.id}-img`}><TextInput id={`${plan.id}-img`} inputMode="numeric" value={images} onChange={e => setImages(e.target.value)} /></Field>
      </div>
      {!free && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-bold">Features in this plan</legend>
          {FEATURES.map(f => (
            <label key={f} className="flex min-h-11 items-center gap-3 rounded-xl border border-rule px-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-ink" checked={features.includes(f)} onChange={e => setFeatures(e.target.checked ? [...features, f] : features.filter(x => x !== f))} />{FEATURE_LABELS[f]}
            </label>
          ))}
          <label className="flex min-h-11 items-center gap-3 px-1 pt-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-ink" checked={active} onChange={e => setActive(e.target.checked)} />Plan is on sale and active</label>
        </fieldset>
      )}
      <Button block loading={busy} onClick={save}>Save {plan.name} plan</Button>
    </Surface>
  );
}

export default function AdminPlans() {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [email, setEmail] = useState(''); const [days, setDays] = useState('30'); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const r = await fetch('/api/admin/plans'); if (r.status === 401 || r.status === 403) return setState('denied'); if (!r.ok) throw new Error();
      setPlans((await r.json()).plans);
      const s = await fetch('/api/admin/subscriptions'); if (s.ok) setSubs((await s.json()).subscriptions || []);
      setState('ready');
    } catch { setState('error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const grant = async () => {
    setBusy(true);
    try { await api('/api/admin/subscriptions', 'POST', { email, days: Number(days) }); toast.success('Pro granted.'); setEmail(''); await load(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const revoke = async (user_id: string) => {
    try { await api('/api/admin/subscriptions', 'DELETE', { user_id }); toast.success('Pro ended.'); await load(); } catch (e) { toast.error((e as Error).message); }
  };

  if (state === 'loading') return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>;
  if (state === 'denied') return <ErrorState title="Admins only" message="Sign in with an admin account to manage plans." />;
  if (state === 'error' || !plans) return <ErrorState message="The plans did not load. If this is the first time, run migration 0012 in Supabase, then try again." onRetry={load} />;
  return (
    <div className="space-y-4">
      {plans.map(p => <PlanEditor key={p.id} plan={p} onSaved={saved => setPlans(plans.map(x => (x.id === saved.id ? saved : x)))} />)}
      <Surface className="space-y-3 p-4">
        <h2 className="text-base font-bold">Give someone Pro</h2>
        <p className="text-sm text-muted">For testers, friends and prizes, before payments are connected. Days add to any Pro time they already have.</p>
        <Field label="Learner's email" htmlFor="grant-email"><TextInput id="grant-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
        <Field label="Days" htmlFor="grant-days"><TextInput id="grant-days" inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} /></Field>
        <Button block loading={busy} disabled={!email.trim()} onClick={grant}>Grant Pro</Button>
        {subs.length > 0 && (
          <ul className="space-y-2 pt-2">
            {subs.map(s => (
              <li key={s.user_id} className="flex items-center gap-3 rounded-xl border border-rule p-3 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{s.email || s.user_id}</span>
                  <span className="text-xs text-muted">{s.status === 'active' ? `Until ${s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : 'no end date'}` : 'Ended'}</span></span>
                {s.status === 'active' && <Button variant="quiet" size="sm" onClick={() => revoke(s.user_id)}>End</Button>}
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}
