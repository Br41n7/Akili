/**
 * Deterministic chemistry checks for molecular_structure specs.
 *
 * Drawings are only as trustworthy as their data, so when every atom is explicit we derive the molecular
 * formula from the bonds (filling hydrogens by standard valence) and compare it with the formula the spec
 * claims. A structure whose atoms cannot add up to its stated formula is rejected. This verifies
 * bookkeeping (atom counts, valences); it does not verify that a structure is the right molecule.
 */
import type { VisualSpec } from './schema';

type Chem = Pick<VisualSpec, 'elements' | 'relationships' | 'visual_type'>;

const VALENCE: Record<string, number[]> = { H: [1], C: [4], N: [3], O: [2], S: [2, 4, 6], P: [3, 5], F: [1], Cl: [1], Br: [1], I: [1] };

export function valenceOptions(symbol: string, charge = 0): number[] | null {
  const base = VALENCE[symbol];
  if (!base) return null;
  if (!charge) return base;
  if (symbol === 'N' || symbol === 'O') return base.map(v => v + charge);
  return null; // other charged atoms are not modelled
}

export const bondOrderOf = (r: { bond_kind?: string; bond_order?: number }): number =>
  r.bond_kind === 'hydrogen' || r.bond_kind === 'ionic' ? 0 : (r.bond_order ?? 1);

/** Sum of covalent bond orders at each atom. */
export function bondTotals(spec: Pick<VisualSpec, 'relationships'>): Map<string, number> {
  const used = new Map<string, number>();
  for (const r of spec.relationships) {
    if (r.relation !== 'bonded_to') continue;
    const o = bondOrderOf(r);
    used.set(r.from, (used.get(r.from) ?? 0) + o);
    used.set(r.to, (used.get(r.to) ?? 0) + o);
  }
  return used;
}

/** Hydrogens needed to fill each atom's valence (explicit H atoms are separate elements and already in the totals). */
export function implicitHydrogens(spec: Chem): Map<string, number> | null {
  const used = bondTotals(spec);
  const out = new Map<string, number>();
  for (const e of spec.elements) {
    if (!e.symbol) return null;
    const opts = valenceOptions(e.symbol, e.charge ?? 0);
    if (!opts) return null;
    const u = used.get(e.id) ?? 0;
    const target = opts.find(v => v >= u);
    if (target === undefined) return null; // over-bonded
    out.set(e.id, e.symbol === 'H' ? 0 : target - u);
  }
  return out;
}

export interface FormulaResult { counts: Record<string, number>; formula: string }

/** Hill notation: C, then H, then the rest alphabetically (no carbon: all alphabetical). */
export function hill(counts: Record<string, number>): string {
  const keys = Object.keys(counts).filter(k => counts[k] > 0);
  const ordered = counts.C ? ['C', ...(counts.H ? ['H'] : []), ...keys.filter(k => k !== 'C' && k !== 'H').sort()] : keys.sort();
  return ordered.map(k => `${k}${counts[k] > 1 ? counts[k] : ''}`).join('');
}

export function computeFormula(spec: Chem): FormulaResult | null {
  if (spec.visual_type !== 'molecular_structure' || spec.elements.some(e => !e.symbol)) return null;
  const imp = implicitHydrogens(spec);
  if (!imp) return null;
  const counts: Record<string, number> = {};
  for (const e of spec.elements) counts[e.symbol!] = (counts[e.symbol!] ?? 0) + 1;
  const h = [...imp.values()].reduce((a, b) => a + b, 0);
  if (h) counts.H = (counts.H ?? 0) + h;
  return { counts, formula: hill(counts) };
}

export function parseFormula(f: string): Record<string, number> | null {
  const out: Record<string, number> = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null; let consumed = 0;
  while ((m = re.exec(f))) { out[m[1]] = (out[m[1]] ?? 0) + (m[2] ? Number(m[2]) : 1); consumed += m[0].length; }
  return consumed === f.length && f.length > 0 ? out : null;
}

/** Subscript digits for display: C6H12O6 → C₆H₁₂O₆ */
export const prettyFormula = (f: string) => f.replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]);

/** Label for a drawn heteroatom with its hydrogens: O + 1 → "OH", N + 2 → "NH₂", N+ with 3 → "NH₃⁺". */
export function atomLabel(symbol: string, h: number, charge = 0): string {
  const sub = h > 1 ? '₀₁₂₃₄₅₆₇₈₉'[h] : '';
  const q = charge === 1 ? '⁺' : charge === -1 ? '⁻' : charge ? `${Math.abs(charge)}${charge > 0 ? '⁺' : '⁻'}` : '';
  return `${symbol}${h > 0 ? `H${sub}` : ''}${q}`;
}
