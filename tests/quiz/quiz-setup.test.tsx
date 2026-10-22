import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(() => {}, { error: () => {} }) }));

import QuizMode from '@/components/QuizMode';

const html = () => renderToStaticMarkup(<QuizMode projectId="p" userId="u" region="Nigeria" persona="friendly" />);

describe('quiz setup screen', () => {
  it('keeps the settings under "More options"', () => {
    const h = html();
    expect(h).toContain('More options');
    expect(h).toContain('<details');
    // Collapsed summary tells the learner what is selected without opening it.
    expect(h).toContain('5 questions');
    expect(h).toContain('Multiple choice, Fill in the gap');
  });

  it('offers all four question types', () => {
    const h = html();
    for (const label of ['Multiple choice', 'Fill in the gap', 'Statements (I, II, III, IV)', 'Theory']) expect(h).toContain(label);
  });

  it('offers preset counts and a custom box that accepts any number from 1 to 30', () => {
    const h = html();
    for (const n of [5, 10, 15, 20]) expect(h).toMatch(new RegExp(`aria-pressed="(true|false)"[^>]*>${n}</button>`));
    expect(h).toContain('id="qz-count"');
    expect(h).toContain('Any number from 1 to 30');
  });

  it('has no language option', () => {
    expect(html()).not.toMatch(/german|english|deutsch|language/i);
  });
});
