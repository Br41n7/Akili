import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyBudget, coverageNotice, depthAllowed, pagesOf, totalChars, DEFAULT_OPTIONS } from '@/lib/course-builder';
import { capabilities, FREE_COURSE_CHARS, PRO_COURSE_CHARS } from '@/lib/plan';
import CourseBuildForm from '@/components/CourseBuildForm';

const src = (name: string, n: number) => ({ id: name, name, content: ('Sentence about cells. ').repeat(Math.ceil(n / 22)).slice(0, n) });

describe('plan limits', () => {
  it('free reads 30k chars, pro 150k, long_materials flag raises it alone', () => {
    expect(capabilities({}).limits.courseMaterialChars).toBe(FREE_COURSE_CHARS);
    expect(capabilities({ NEXT_PUBLIC_AKILI_PLAN: 'pro' }).limits.courseMaterialChars).toBe(PRO_COURSE_CHARS);
    const c = capabilities({ NEXT_PUBLIC_AKILI_FEATURES: 'long_materials' });
    expect(c.limits.courseMaterialChars).toBe(PRO_COURSE_CHARS); expect(c.has('deep_courses')).toBe(false);
  });
  it('a per-user plan overrides the deployment default', () => {
    expect(capabilities({}, 'pro').plan).toBe('pro');
    expect(capabilities({ NEXT_PUBLIC_AKILI_PLAN: 'pro' }, 'free').plan).toBe('free');
  });
  it('deep depth is gated', () => { expect(depthAllowed('deep', false)).toBe(false); expect(depthAllowed('standard', false)).toBe(true); expect(depthAllowed('deep', true)).toBe(true); });
});

describe('applyBudget', () => {
  it('keeps everything when it fits', () => {
    const r = applyBudget([src('a', 1000), src('b', 2000)], 5000);
    expect(r.coverage.truncated).toBe(false); expect(totalChars(r.sources)).toBe(3000);
  });
  it('shares the budget so a huge file cannot push out a small one', () => {
    const r = applyBudget([src('big', 100_000), src('small', 2_000)], 20_000);
    expect(r.coverage.truncated).toBe(true);
    expect(r.sources.find(s => s.name === 'small')!.content.length).toBe(2_000);
    expect(totalChars(r.sources)).toBeLessThanOrEqual(20_000);
    expect(r.coverage.items.find(i => i.name === 'big')!.usedChars).toBeGreaterThan(15_000);
  });
  it('cuts at a sentence end and ignores empty files', () => {
    const r = applyBudget([src('a', 5000), { id: 'e', name: 'empty', content: '  ' }], 1000);
    expect(r.sources).toHaveLength(1); expect(r.sources[0].content.endsWith('.')).toBe(true);
  });
  it('notice names what was cut and mentions the upgrade only when asked', () => {
    const { coverage } = applyBudget([src('Notes.pdf', 90_000)], 30_000);
    const n = coverageNotice(coverage, { upgradePages: 83 });
    expect(n).toContain('Notes.pdf'); expect(n).toContain('83');
    expect(coverageNotice(coverage)).not.toContain('paid plan');
    expect(coverageNotice(applyBudget([src('a', 100)], 1000).coverage)).toContain('all of your selected material');
    expect(pagesOf(1800)).toBe(1);
  });
});

describe('CourseBuildForm materials', () => {
  const base = { value: DEFAULT_OPTIONS, onChange: () => {}, onSubmit: () => {}, submitLabel: 'Build' };
  it('lists materials with page sizes and shows the notice', () => {
    const html = renderToStaticMarkup(<CourseBuildForm {...base} materials={[{ id: 'a', name: 'Biology.pdf', chars: 36_000 }]} notice="Akili reads 17 of 50 pages" truncated />);
    expect(html).toContain('Biology.pdf'); expect(html).toContain('20 p'); expect(html).toContain('17 of 50');
  });
  it('hides Deep on free and disables build when nothing is selected', () => {
    const html = renderToStaticMarkup(<CourseBuildForm {...base} deepAllowed={false} />);
    expect(html).not.toContain('>Deep<'); expect(html).toContain('paid plan');
  });
});
