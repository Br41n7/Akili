/**
 * Curated library: built-in diagrams for core topics. When a lesson title (or one of its key concepts)
 * matches an alias, Akili uses the built-in spec: no AI request, and the same content every time.
 *
 * REVIEW WORKFLOW: every entry starts with reviewed: false and displays "awaiting review". After a subject
 * expert has checked an entry against a textbook, set reviewed: true. The UI then says "reviewed". Nothing in
 * this file is verified by the code, only by the person who flips the flag.
 */
import * as D from './curated-data';
import { parseVisualSpec, type VisualSpec } from './schema';

export interface CuratedEntry {
  id: string;
  /** Matched as whole words inside the lesson title, or equal to a key concept. Keep specific: "biceps brachii", not "biceps". */
  aliases: string[];
  spec: Record<string, unknown>;
  reviewed: boolean;
}

export const CURATED: CuratedEntry[] = [
  { id: 'protein-structure', aliases: ['protein structure', 'levels of protein structure', 'structure of proteins'], spec: D.proteinStructure, reviewed: false },
  { id: 'peptide-bond', aliases: ['peptide bond', 'peptide bonds', 'peptide bond formation'], spec: D.peptideBond, reviewed: false },
  { id: 'protein-synthesis', aliases: ['protein synthesis', 'transcription and translation'], spec: D.proteinSynthesis, reviewed: false },
  { id: 'glycolysis', aliases: ['glycolysis'], spec: D.glycolysis, reviewed: false },
  { id: 'dna-vs-rna', aliases: ['dna vs rna', 'dna versus rna', 'dna and rna', 'difference between dna and rna'], spec: D.cellCycleCompare, reviewed: false },
  { id: 'enzyme-catalysis', aliases: ['enzyme catalysis', 'enzyme mechanism', 'enzyme substrate complex', 'how enzymes work'], spec: D.enzymeMechanism, reviewed: false },
  { id: 'cross-bridge-cycle', aliases: ['cross bridge cycle', 'crossbridge cycle'], spec: D.cycleExample, reviewed: false },
  { id: 'brachial-plexus', aliases: ['brachial plexus'], spec: D.brachialPlexus, reviewed: false },
  { id: 'biceps-brachii', aliases: ['biceps brachii'], spec: D.bicepsBrachii, reviewed: false },
  { id: 'skin-layers', aliases: ['layers of the skin', 'skin layers', 'structure of the skin'], spec: D.skinLayers, reviewed: false },
  { id: 'skin-to-bone', aliases: ['layers from skin to bone', 'skin to bone'], spec: D.bodyWallLayers, reviewed: false },
  { id: 'knee-joint', aliases: ['knee joint', 'knee anatomy', 'anatomy of the knee'], spec: D.kneeJoint, reviewed: false },
  { id: 'mid-arm-section', aliases: ['mid arm cross section', 'cross section of the arm', 'arm cross section'], spec: D.midArmSection, reviewed: false },
];

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

export function curatedSpec(entry: CuratedEntry): VisualSpec | null {
  const r = parseVisualSpec({ ...entry.spec, provenance: entry.reviewed ? 'curated_reviewed' : 'curated' });
  return r.ok ? r.data : null;
}

/** Exact-ish match on the lesson title or a key concept. Returns null when nothing matches. */
export function matchCurated(title: string, keyConcepts: string[] = []): VisualSpec | null {
  const t = norm(title);
  const concepts = keyConcepts.map(norm);
  for (const e of CURATED) {
    const hit = e.aliases.map(norm).some(a => t.includes(a) || concepts.some(c => c === a));
    if (hit) return curatedSpec(e);
  }
  return null;
}
