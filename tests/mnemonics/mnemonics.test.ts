import { describe, expect, it } from 'vitest';
import { buildMnemonicPrompt, composeExplanation, parseItems, validateMnemonic } from '@/lib/mnemonics';
import { getValidator } from '@/lib/ai-schemas';
import { getTask } from '@/lib/ai-tasks';

const good = { mnemonic: 'PMAT', explanation: 'Phases in order', breakdown: [{ letter: 'P', item: 'Prophase' }, { letter: 'M', item: 'Metaphase' }, { letter: 'A', item: 'Anaphase' }, { letter: 'T', item: 'Telophase' }] };

describe('parseItems', () => {
  it('splits, strips bullets, dedupes and caps', () => {
    expect(parseItems('1. Prophase\n- Metaphase\n• prophase\n\nAnaphase, Telophase')).toEqual(['Prophase', 'Metaphase', 'Anaphase', 'Telophase']);
    expect(parseItems(Array.from({ length: 30 }, (_, i) => `i${i}`).join('\n'))).toHaveLength(12);
    expect(parseItems('Na, K and Cl')).toEqual(['Na', 'K and Cl']);
  });
});

describe('validateMnemonic', () => {
  it('accepts a correct acronym', () => { expect(validateMnemonic(good, 'acronym').ok).toBe(true); });
  it('rejects letters that do not start their item', () => {
    const r = validateMnemonic({ ...good, breakdown: [{ letter: 'X', item: 'Prophase' }, ...good.breakdown.slice(1)] }, 'acronym');
    expect(r.ok).toBe(false);
  });
  it('rejects an acronym whose letters are not in the mnemonic', () => {
    expect(validateMnemonic({ ...good, mnemonic: 'ZZZZ' }, 'acronym').ok).toBe(false);
  });
  it('accepts a sentence acronym by first letters', () => {
    expect(validateMnemonic({ ...good, mnemonic: 'Please Make Aunty Tea' }, 'acronym').ok).toBe(true);
  });
  it('story style does not need letters in the mnemonic', () => {
    expect(validateMnemonic({ ...good, mnemonic: 'A pig met an ant on a tall hill' }, 'story').ok).toBe(true);
    expect(validateMnemonic({ mnemonic: 'x', explanation: '' }, 'story').ok).toBe(true);
  });
  it('rejects empty and non-objects', () => {
    expect(validateMnemonic({ mnemonic: ' ' }).ok).toBe(false); expect(validateMnemonic('hi').ok).toBe(false);
  });
  it('is idempotent', () => {
    const a = validateMnemonic(good, 'acronym'); expect(a.ok).toBe(true);
    if (a.ok) expect(validateMnemonic(a.data, 'acronym').ok).toBe(true);
  });
});

describe('wiring', () => {
  it('registry and server validator use the checked contract', () => {
    expect(getTask('mnemonic').validation).toBe('mnemonic');
    expect(getValidator('mnemonic')(good).ok).toBe(true);
    expect(getValidator('mnemonic')({ ...good, breakdown: [{ letter: 'Q', item: 'Prophase' }] }).ok).toBe(false);
  });
  it('prompt lists items in order and demands the breakdown', () => {
    const p = buildMnemonicPrompt({ concept: 'Mitosis', style: 'acronym', items: ['Prophase', 'Metaphase'] });
    expect(p).toMatch(/1\. Prophase\n2\. Metaphase/); expect(p).toMatch(/spell the acronym exactly/); expect(p).toMatch(/breakdown/);
    expect(buildMnemonicPrompt({ concept: 'Mitosis', style: 'story' })).toMatch(/Choose the 3 to 6/);
  });
  it('stored text carries the key', () => {
    const v = validateMnemonic(good, 'acronym'); if (!v.ok) throw 0;
    expect(composeExplanation(v.data)).toMatch(/Phases in order\n\nP = Prophase\nM = Metaphase/);
  });
});
