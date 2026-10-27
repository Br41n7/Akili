import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CourseBuildForm from '@/components/CourseBuildForm';
import { DEFAULT_OPTIONS } from '@/lib/course-builder';

describe('course build form', () => {
  const html = (over = {}) => renderToStaticMarkup(<CourseBuildForm value={{ ...DEFAULT_OPTIONS, ...over }} onChange={() => {}} onSubmit={() => {}} submitLabel="Build course" />);
  it('offers three depths, an optional goals box, and an unticked beyond-notes choice', () => {
    const h = html();
    for (const d of ['Quick', 'Standard', 'Deep']) expect(h).toContain(d);
    expect(h).toContain('What do you most want to learn?'); expect(h).toMatch(/maxlength="400"/i);
    expect(h).toContain('Add standard material my notes do not cover'); expect(h).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(h).toContain('Build course');
  });
  it('shows the chosen depth\'s hint and a ticked beyond-notes choice', () => {
    expect(html({ depth: 'deep' })).toContain('Thorough, for a whole topic');
    expect(html({ beyondNotes: true })).toMatch(/type="checkbox"[^>]*checked/);
  });
});
