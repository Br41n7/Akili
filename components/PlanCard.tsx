'use client';
import { Chip, Surface } from '@/components/ui';
import { usePlan } from '@/lib/use-plan';
import { pagesOf } from '@/lib/course-builder';

export const formatPrice = (kobo: number | null, currency = 'NGN') =>
  kobo === null ? 'Price coming soon' : `${currency === 'NGN' ? '₦' : currency + ' '}${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })} per month`;

/** What the learner's plan includes, and what Pro adds. There is no buy button until payments are connected. */
export default function PlanCard() {
  const { plan, pro, endsAt, loaded } = usePlan();
  const isPro = plan.id === 'pro';
  return (
    <Surface className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2"><h2 className="text-base font-bold">Your plan</h2><Chip tone={isPro ? 'tick' : 'neutral'}>{plan.name}</Chip></div>
      <ul className="space-y-1 text-sm">
        <li>{plan.limits.daily_ai} AI requests a day</li>
        <li>Courses read about {pagesOf(plan.limits.course_material_chars)} pages of your material</li>
        <li>{plan.limits.max_projects === null ? 'Unlimited projects' : `Up to ${plan.limits.max_projects} projects`}</li>
        {isPro && endsAt && <li className="text-muted">Pro until {new Date(endsAt).toLocaleDateString()}</li>}
      </ul>
      {loaded && !isPro && (
        <p className="rounded-xl bg-chalk p-3 text-sm text-muted"><span className="font-bold text-ink">{pro.name}</span>: {pro.limits.daily_ai} AI requests a day, about {pagesOf(pro.limits.course_material_chars)} pages per course, Deep courses and more. {formatPrice(pro.price_kobo, pro.currency)}. Upgrades open soon.</p>
      )}
    </Surface>
  );
}
