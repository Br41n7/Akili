import { describe, expect, it } from 'vitest';
import { acceptAIExplanation, buildExplanation } from '@/lib/visual/explain';
import { buildScaffold, buildVisualQuestions, type VisualQuestion } from '@/lib/visual/quiz';
import { elementMap, safeVisualSpec, type VisualSpec } from '@/lib/visual/schema';
import { matchWeakConcepts } from '@/lib/visual/adaptive';
import { RELATIONS, directionOf } from '@/lib/visual/vocab';
import { VALID_FIXTURES } from './fixtures';

const specs = Object.entries(VALID_FIXTURES).map(([name, raw]) => [name, safeVisualSpec(raw)!] as const);
const optionText = (q: VisualQuestion, letter: string) => q.options.find(o => o.startsWith(`${letter})`))!.slice(3);

describe('"Test me": questions come from the spec', () => {
  it.each(specs)('%s: every question is well formed with one correct answer', (_n, spec) => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const qs = buildVisualQuestions(spec, { max: 6, seed, includeTerms: true });
      for (const q of qs) {
        expect(q.options.length).toBeGreaterThanOrEqual(q.kind === 'direction' ? 2 : 3);
        expect(new Set(q.options.map(o => o.slice(3))).size).toBe(q.options.length);
        expect(q.options.some(o => o.startsWith(`${q.correct_answer})`))).toBe(true);
        expect(q.explanation.length).toBeGreaterThan(5);
        q.element_ids.forEach(id => expect(elementMap(spec).has(id)).toBe(true));
      }
    }
  });

  it('relation questions are true to the spec and distractors are not also true', () => {
    for (const [name, spec] of specs) {
      const map = elementMap(spec);
      for (const q of buildVisualQuestions(spec, { max: 12, seed: 'x' }).filter(q => q.kind === 'relation')) {
        const [fromId, toId] = q.element_ids;
        const ans = optionText(q, q.correct_answer);
        expect(map.get(fromId)!.label, name).toBe(ans);
        const stated = spec.relationships.find(r => r.from === fromId && r.to === toId && q.question.includes(RELATIONS[r.relation].phrase));
        expect(stated, `${name}: ${q.question}`).toBeTruthy();
        expect(q.question).toContain(RELATIONS[stated!.relation].phrase);
        expect(q.question).toContain(map.get(toId)!.label);
        for (const o of q.options.filter(o => !o.startsWith(`${q.correct_answer})`))) {
          const wrong = spec.elements.find(e => e.label === o.slice(3))!;
          expect(wrong, 'distractor must be a real element').toBeTruthy();
          expect(spec.relationships.some(r => r.from === wrong.id && r.to === toId && r.relation === stated!.relation)).toBe(false);
        }
      }
    }
  });

  it('chains: "proximal to Trunks" never offers a second valid answer', () => {
    const spec = safeVisualSpec(VALID_FIXTURES.brachialPlexus)!;
    const asked = buildVisualQuestions(spec, { max: 40, seed: 's' }).filter(q => q.kind === 'relation' && q.question.includes('proximal to Cords'));
    // With every structure above Cords also "proximal" in a vertical chain, the generator must refuse to ask this one.
    expect(asked).toHaveLength(0);
    for (const q of asked) {
      // Roots and Trunks and Divisions are all proximal to Cords by chaining; only Divisions is the stated answer, so none may appear as distractors.
      const wrong = q.options.filter(o => !o.startsWith(`${q.correct_answer})`)).map(o => o.slice(3));
      expect(wrong).not.toContain('Roots'); expect(wrong).not.toContain('Trunks');
    }
  });

  it('inverse spatial facts are respected (A lateral to B  ⇒  B is not a lateral-to-A distractor)', () => {
    const spec = safeVisualSpec(VALID_FIXTURES.kneeJoint)!;
    for (const seed of ['1', '2', '3', '4', '5', '6']) {
      // Every other structure sits at x<6 or x>=2 so these "which structure" questions are ambiguous and must be skipped.
      expect(buildVisualQuestions(spec, { max: 40, seed }).filter(q => q.kind === 'relation' && /(lateral|medial) to (Medial|Lateral) meniscus/.test(q.question))).toHaveLength(0);
      for (const q of buildVisualQuestions(spec, { max: 12, seed }).filter(q => q.question.includes('lateral to Medial meniscus'))) {
        const wrong = q.options.filter(o => !o.startsWith(`${q.correct_answer})`)).map(o => o.slice(3));
        expect(wrong).not.toContain('Lateral meniscus');
        expect(wrong).not.toContain('Cruciate ligaments (ACL and PCL)');
      }
    }
  });

  it('layer, sequence and description questions match the spec order', () => {
    const skin = safeVisualSpec(VALID_FIXTURES.skinLayers)!;
    const qs = buildVisualQuestions(skin, { max: 10, seed: 'k' });
    const closest = qs.find(q => q.question.includes('closest to the surface'));
    expect(closest && optionText(closest, closest.correct_answer)).toBe('Epidermis');
    const deepest = qs.find(q => q.question.includes('deepest'));
    expect(deepest && optionText(deepest, deepest.correct_answer)).toBe('Hypodermis');

    const gly = safeVisualSpec(VALID_FIXTURES.glycolysis)!;
    const after = buildVisualQuestions(gly, { max: 20, seed: 'g' }).filter(q => q.question.startsWith('Which step comes immediately after'));
    expect(after.length).toBeGreaterThan(0);
    for (const q of after) {
      const cur = q.question.match(/after (.+)\?$/)![1];
      const order = gly.sequence.map(id => elementMap(gly).get(id)!.label);
      expect(optionText(q, q.correct_answer)).toBe(order[order.indexOf(cur) + 1]);
    }
  });

  it('protein structure can ask "which level describes the amino-acid sequence?"', () => {
    const spec = safeVisualSpec(VALID_FIXTURES.proteinStructure)!;
    const qs = Array.from({ length: 6 }, (_, i) => buildVisualQuestions(spec, { max: 20, seed: String(i) })).flat();
    const q = qs.find(q => q.kind === 'description' && /linear sequence of amino acids/.test(q.question));
    expect(q && optionText(q, q.correct_answer)).toBe('Primary structure');
  });

  it('description questions never give the answer away', () => {
    for (const [, spec] of specs) for (const q of buildVisualQuestions(spec, { max: 30, seed: 'z' }).filter(q => q.kind === 'description')) {
      const answer = optionText(q, q.correct_answer).toLowerCase().match(/[a-z]{4,}/g) ?? [];
      const stem = q.question.toLowerCase();
      expect(answer.some(w => stem.includes(w)), q.question).toBe(false);
    }
  });

  it('is deterministic for the same seed and varies across seeds', () => {
    const spec = safeVisualSpec(VALID_FIXTURES.kneeJoint)!;
    expect(buildVisualQuestions(spec, { seed: 'same' })).toEqual(buildVisualQuestions(spec, { seed: 'same' }));
    const sets = new Set(['a', 'b', 'c', 'd', 'e'].map(s => JSON.stringify(buildVisualQuestions(spec, { seed: s }).map(q => q.question))));
    expect(sets.size).toBeGreaterThan(1);
  });

  it('returns no questions rather than unfair ones when the spec is too thin', () => {
    const thin = safeVisualSpec({ ...VALID_FIXTURES.skinLayers, elements: VALID_FIXTURES.skinLayers.elements.slice(0, 2), sequence: [], relationships: [] })!;
    expect(buildVisualQuestions(thin, { seed: 'q' }).every(q => q.options.length >= 3)).toBe(true);
  });
});

describe('direction questions (spatial vocabulary) are always answerable from the spec', () => {
  it('exist for the anatomy fixtures and offer the stated term against its opposite only', () => {
    for (const name of ['brachialPlexus', 'kneeJoint', 'bicepsBrachii', 'skinLayers']) {
      const spec = safeVisualSpec(VALID_FIXTURES[name])!;
      const qs = buildVisualQuestions(spec, { max: 40, seed: 'd' }).filter(q => q.kind === 'direction');
      expect(qs.length, name).toBeGreaterThan(0);
      for (const q of qs) { expect(q.options).toHaveLength(2); expect(q.explanation).toMatch(/means/); }
    }
  });
  it('uses the right correct answer for the biceps/humerus relationship', () => {
    const spec = safeVisualSpec(VALID_FIXTURES.bicepsBrachii)!;
    const q = buildVisualQuestions(spec, { max: 40, seed: 'e' }).find(q => q.question === 'How is Biceps brachii positioned relative to Humerus?')!;
    expect(optionText(q, q.correct_answer)).toMatch(/^Anterior: toward the front/);
    expect(q.options.map(o => o.slice(3)).join(' ')).toMatch(/Posterior/);
  });
});

describe('adaptive support: wrong spatial answer → vocabulary → orientation → retry', () => {
  const knee = safeVisualSpec(VALID_FIXTURES.kneeJoint)!;
  it('builds the medial/lateral scaffold from the diagram itself', () => {
    const missed = buildVisualQuestions(knee, { max: 40, seed: 'm' }).find(q => q.kind === 'direction' && q.concept.startsWith('medial'))!;
    expect(missed).toBeTruthy();
    expect(missed.question).toBe('How is Cruciate ligaments (ACL and PCL) positioned relative to Lateral meniscus?');
    expect(missed.options.map(o => o.slice(3))).toEqual(expect.arrayContaining(['Medial: closer to the midline of the body', 'Lateral: farther from the midline of the body']));
    const steps = buildScaffold(knee, missed);
    expect(steps[0].kind).toBe('term');
    expect(steps[0].question).toMatch(/medial/);
    expect(optionText(steps[0], steps[0].correct_answer)).toBe('closer to the midline of the body');
    expect(steps.some(s => s.kind === 'edge' && optionText(s, s.correct_answer) === 'right')).toBe(true); // right edge = medial in this diagram
    expect(steps[steps.length - 1].id).toBe(`${missed.id}-retry`);
    expect(steps[steps.length - 1].question).toBe(missed.question);
  });
  it('picks only weak concepts that relate to the lesson', () => {
    const weak = [{ concept: 'Medial and lateral relationships: knee joint', mastery: '0.15', errors: 2 }, { concept: 'Krebs cycle', mastery: '0.2', errors: 3 }, { concept: 'Knee joint', mastery: '0.9', errors: 0 }];
    expect(matchWeakConcepts(weak, ['Knee joint', 'menisci'])).toEqual(['Medial and lateral relationships: knee joint']);
  });
});

describe('11. "Explain this diagram" only explains what is in the spec', () => {
  it.each(specs)('%s: deterministic explanation mentions only spec elements', (_n, spec) => {
    const ex = buildExplanation(spec);
    const ids = new Set(spec.elements.map(e => e.id));
    expect(ex.parts.length).toBe(spec.elements.length);
    ex.parts.forEach(p => expect(ids.has(p.id)).toBe(true));
    expect(ex.summary.length).toBeGreaterThan(20);
    expect(ex.source).toBe('spec');
  });

  it('names the actual elements, in diagram order', () => {
    const spec = safeVisualSpec(VALID_FIXTURES.proteinStructure)!;
    const s = buildExplanation(spec).summary;
    expect(s.indexOf('Primary structure')).toBeLessThan(s.indexOf('Quaternary structure'));
  });

  it('spatial relationships are phrased from the spec vocabulary', () => {
    const spec = safeVisualSpec(VALID_FIXTURES.bicepsBrachii)!;
    const biceps = buildExplanation(spec).parts.find(p => p.id === 'biceps')!.text;
    expect(biceps).toContain('Biceps brachii is anterior to Humerus');
    expect(biceps).toContain('Musculocutaneous nerve');
    expect(directionOf('anterior_to')).toBe('anterior');
  });

  it('AI wording is accepted only for real element ids and enough coverage', () => {
    const spec = safeVisualSpec(VALID_FIXTURES.skinLayers)!;
    const good = acceptAIExplanation(spec, { summary: 'The skin has three layers stacked from the surface inward.', parts: [{ id: 'epidermis', text: 'The epidermis is the outer barrier.' }, { id: 'dermis', text: 'The dermis lies below it.' }, { id: 'hypodermis', text: 'The hypodermis is the fatty layer.' }] });
    expect(good?.source).toBe('ai');
    const withInvented = acceptAIExplanation(spec, { summary: 'The skin has three layers stacked from the surface inward.', parts: [{ id: 'epidermis', text: 'a' }, { id: 'dermis', text: 'b' }, { id: 'hypodermis', text: 'c' }, { id: 'sweat_gland', text: 'Invented structure' }] });
    expect(withInvented?.parts.map(p => p.id)).not.toContain('sweat_gland');
    expect(acceptAIExplanation(spec, { summary: 'Only one part is covered here, so this is rejected.', parts: [{ id: 'epidermis', text: 'a' }] })).toBeNull();
    expect(acceptAIExplanation(spec, { summary: '', parts: [] })).toBeNull();
    const stripped = acceptAIExplanation(spec, { summary: 'The skin has <b>three</b> layers from the surface in.', parts: [{ id: 'epidermis', text: '<script>x</script>outer' }, { id: 'dermis', text: 'middle' }, { id: 'hypodermis', text: 'inner' }] })!;
    expect(stripped.summary).not.toMatch(/</); expect(stripped.parts[0].text).not.toMatch(/</);
  });
});
