import { infographicText, type Infographic } from '@/lib/infographic';
import { matchCurated } from '@/lib/visual/curated';
import { requestLessonVisual, shouldConsiderVisual } from '@/lib/visual/planner';

/**
 * A figure for the poster: a built-in diagram when the topic has one (free and identical every time),
 * otherwise one AI-planned diagram, but only for topics that suit a diagram. Never throws: the
 * infographic is useful without a figure, and the caller shows `note` when one was expected.
 */
export async function findFigure(g: Infographic, ctx: { projectId: string; region: string; userGroqKey?: string }): Promise<{ figure: unknown | null; note: string }> {
  const headings = g.sections.map(s => s.heading);
  const curated = matchCurated(g.title, headings);
  if (curated) return { figure: curated, note: '' };
  const text = infographicText(g);
  const gate = shouldConsiderVisual(text);
  if (!gate.consider) return { figure: null, note: '' };
  try {
    const d = await requestLessonVisual({ title: g.title, content: text, keyConcepts: headings, subjectHint: gate.subject, region: ctx.region, projectId: ctx.projectId, userGroqKey: ctx.userGroqKey });
    return d.needs_visual ? { figure: d.spec, note: '' } : { figure: null, note: '' };
  } catch {
    return { figure: null, note: 'The infographic was made, but a figure could not be drawn for it.' };
  }
}
