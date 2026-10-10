import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import VisualRenderer from '@/components/visual/VisualRenderer';
import { CURATED, curatedSpec, matchCurated } from '@/lib/visual/curated';
import { buildVisualQuestions } from '@/lib/visual/quiz';
import { parseVisualSpec } from '@/lib/visual/schema';

describe('curated library', () => {
  it.each(CURATED.map(e => [e.id, e] as const))('%s is a valid spec with questions and no markup', (_id, entry) => {
    const spec = curatedSpec(entry);
    expect(spec).not.toBeNull();
    expect(spec!.provenance).toBe('curated');
    expect(buildVisualQuestions(spec!, { max: 4, seed: 'c', includeTerms: true }).length).toBeGreaterThan(0);
  });

  it('nothing ships as reviewed unless a human flipped the flag', () => {
    expect(CURATED.every(e => e.reviewed === false)).toBe(true);
  });

  it('aliases are unique across entries, so a title can never match two diagrams', () => {
    const seen = new Map<string, string>();
    for (const e of CURATED) for (const a of e.aliases) { expect(seen.get(a), `${a} is in ${seen.get(a)} and ${e.id}`).toBeUndefined(); seen.set(a, e.id); }
    for (const e of CURATED) {
      const others = CURATED.filter(o => o.id !== e.id);
      for (const a of e.aliases) for (const o of others) expect(matchCurated(a) && curatedSpec(o) && matchCurated(a)!.topic === curatedSpec(o)!.topic, `${a} also matches ${o.id}`).toBe(false);
    }
  });

  describe('matching is exact, not fuzzy', () => {
    it.each([
      ['Brachial Plexus: roots to branches', 'brachial plexus'],
      ['Glycolysis and the TCA cycle', 'glycolysis'],
      ['The Knee Joint', 'knee joint'],
      ['Levels of Protein Structure', 'protein structure'],
      ['Peptide bonds', 'peptide bond'],
      ['Layers of the Skin', 'layers of the skin'],
      ['Biceps brachii', 'biceps brachii'],
    ])('%s matches', (title, topic) => { expect(matchCurated(title)?.topic).toBe(topic); });

    it.each([['Biceps femoris'], ['Triceps brachii'], ['Brachial artery'], ['Protein digestion'], ['The Treaty of Versailles'], ['Knee replacement surgery planning'], ['']])('%s does not match', title => {
      expect(matchCurated(title)).toBeNull();
    });
    it('a key concept equal to an alias matches even if the title does not', () => {
      expect(matchCurated('Introduction to nerves', ['Brachial plexus'])?.topic).toBe('brachial plexus');
      expect(matchCurated('Introduction to nerves', ['plexus of everything'])).toBeNull();
    });
  });

  it('is labelled honestly in the UI', () => {
    const entry = CURATED.find(e => e.id === 'knee-joint')!;
    const awaiting = renderToStaticMarkup(<VisualRenderer visualSpec={curatedSpec(entry)} />);
    expect(awaiting).toContain('Built-in schematic · awaiting review');
    expect(awaiting).not.toContain('AI-made');
    expect(awaiting).not.toMatch(/·\s*reviewed/);
    const reviewed = renderToStaticMarkup(<VisualRenderer visualSpec={curatedSpec({ ...entry, reviewed: true })} />);
    expect(reviewed).toContain('Built-in schematic · reviewed');
  });

  it('a model can never claim curated status', () => {
    for (const claim of ['curated', 'curated_reviewed']) {
      const r = parseVisualSpec({ ...CURATED[0].spec, provenance: claim }, { forceProvenance: 'ai_generated' });
      expect(r.ok && r.data.provenance).toBe('ai_generated');
    }
  });
});
