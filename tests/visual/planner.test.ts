import { beforeEach, describe, expect, it, vi } from 'vitest';

const callAIJSON = vi.fn();
vi.mock('@/lib/utils', async orig => ({ ...(await orig<typeof import('@/lib/utils')>()), callAIJSON: (...a: unknown[]) => callAIJSON(...a) }));

import { buildPlannerPrompt, PLANNER_SYSTEM, requestLessonVisual, shouldConsiderVisual } from '@/lib/visual/planner';
import { requestAIExplanation } from '@/lib/visual/explain';
import { safeVisualSpec } from '@/lib/visual/schema';
import * as F from './fixtures';

const base = { region: 'Nigeria', projectId: '00000000-0000-4000-8000-000000000000' };
beforeEach(() => { callAIJSON.mockReset(); });

describe('visual decision gate (no AI call for non-science lessons)', () => {
  const lesson = (title: string, content: string) => shouldConsiderVisual(`${title}\n${content}`);
  it('9. a simple historical lesson never reaches the AI', () => {
    expect(lesson(F.NON_VISUAL_LESSON.title, F.NON_VISUAL_LESSON.content).consider).toBe(false);
  });
  it.each([
    ['protein structure', 'Proteins fold. The primary structure is the amino acid sequence; secondary structure includes the alpha helix.', 'biochemistry'],
    ['glycolysis', 'Glycolysis is a pathway in which glucose is converted to pyruvate, producing ATP and NADH, with an enzyme at each step.', 'biochemistry'],
    ['brachial plexus', 'The brachial plexus is a network of nerve roots, trunks, divisions and cords that innervate the muscles of the arm.', 'anatomy'],
    ['skin layers', 'The dermis lies beneath the epidermis and above the fascia. Each layer of skin has a function.', 'anatomy'],
    ['knee joint', 'The knee joint joins the femur and tibia; the patella, ligament and meniscus stabilise it.', 'anatomy'],
  ])('%s is considered', (_n, text, subject) => {
    const g = shouldConsiderVisual(text);
    expect(g.consider).toBe(true);
    expect(g.subject).toBe(subject);
  });
});

describe('planner prompt', () => {
  it('stays inside the route limits and forbids markup/URLs', () => {
    expect(PLANNER_SYSTEM.length).toBeLessThan(4000);               // route: systemInstruction max 4000
    expect(PLANNER_SYSTEM).toMatch(/No HTML, CSS, JavaScript, markdown, URLs/);
    const p = buildPlannerPrompt({ title: 'T', content: 'x'.repeat(30000) });
    expect(p.length).toBeLessThan(24000);                            // route: prompt max 24000
  });
  it('asks for a simpler visual when the learner is struggling', () => {
    const p = buildPlannerPrompt({ title: 'Knee', content: 'text', simplify: true, weakConcepts: ['medial and lateral'] });
    expect(p).toMatch(/simplest visual/); expect(p).toMatch(/medial and lateral/);
  });
});

describe('requestLessonVisual', () => {
  it('returns a validated spec when the model behaves', async () => {
    callAIJSON.mockResolvedValue(F.kneeJoint);
    const d = await requestLessonVisual({ title: 'Knee', content: 'text', ...base });
    expect(d.needs_visual).toBe(true);
    expect(callAIJSON.mock.calls[0][0]).toMatchObject({ task: 'visual_planner', validationType: 'visual_spec' });
  });
  it('passes through needs_visual:false', async () => {
    callAIJSON.mockResolvedValue({ needs_visual: false, visual_reason: 'no structure' });
    expect((await requestLessonVisual({ title: 'History', content: 'text', ...base })).needs_visual).toBe(false);
  });
  it('10. rejects an invalid spec even if the server let it through', async () => {
    callAIJSON.mockResolvedValue({ needs_visual: true, visual_type: 'process', elements: [{ id: 'a', label: '<script>x</script>' }] });
    await expect(requestLessonVisual({ title: 'x', content: 'y', ...base })).rejects.toThrow(/rejected/i);
  });
  it('11. provider failure rejects (LessonVisual then shows no diagram) instead of returning junk', async () => {
    callAIJSON.mockRejectedValue(new Error('All AI providers failed'));
    await expect(requestLessonVisual({ title: 'x', content: 'y', ...base })).rejects.toThrow();
  });
  it('provider failure during "Explain" falls back to the spec-built explanation', async () => {
    callAIJSON.mockRejectedValue(new Error('offline'));
    const ex = await requestAIExplanation(safeVisualSpec(F.skinLayers)!, base);
    expect(ex.source).toBe('spec'); expect(ex.parts).toHaveLength(3);
  });
  it('an AI explanation that invents elements is replaced by the spec-built one', async () => {
    callAIJSON.mockResolvedValue({ summary: 'The skin has a layer called the stratum fantasticum.', parts: [{ id: 'stratum', text: 'invented' }] });
    expect((await requestAIExplanation(safeVisualSpec(F.skinLayers)!, base)).source).toBe('spec');
  });
});
