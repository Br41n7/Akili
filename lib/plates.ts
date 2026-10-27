import { checkLicence } from './plate-licence.mjs';

/** A downloaded base image with its licence, and where each labelled structure sits on it. */
export type Discipline = 'anatomy' | 'physiology' | 'biochemistry';
export interface PlateLabel {
  /** The structure's name as taught. */
  text: string;
  /** Where the leader line points, as fractions of the image (0-1). */
  x: number; y: number;
  /** Which side the label sits on. */
  side: 'left' | 'right';
  /** True once a person has checked the anchor on the image. Unreviewed anchors are drafts. */
  reviewed: boolean;
}
export interface Plate {
  id: string; title: string; discipline: Discipline; topic: string;
  file: string; width: number; height: number;
  author: string; licence: string; licenceKind: string; sourceUrl: string; credit: string;
  labels: PlateLabel[];
}
export interface PlateManifest { version: 1; plates: Plate[] }

const ID = /^[a-z0-9][a-z0-9-]{1,60}$/;
const frac = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const DISCIPLINES: Discipline[] = ['anatomy', 'physiology', 'biochemistry'];

/** Reject anything a student could be shown without a clear licence, a credit, or sane coordinates. */
export function validateManifest(raw: unknown, opts: { allowShareAlike?: boolean } = {}): { ok: true; manifest: PlateManifest } | { ok: false; errors: string[] } {
  const errors: string[] = []; const m = raw as any;
  if (!m || m.version !== 1 || !Array.isArray(m.plates)) return { ok: false, errors: ['manifest must be {version: 1, plates: []}'] };
  const seen = new Set<string>();
  m.plates.forEach((p: any, i: number) => {
    const at = `plates[${i}]${p?.id ? ` (${p.id})` : ''}`;
    if (typeof p?.id !== 'string' || !ID.test(p.id)) errors.push(`${at}: bad id`); else if (seen.has(p.id)) errors.push(`${at}: duplicate id`); else seen.add(p.id);
    if (!DISCIPLINES.includes(p?.discipline)) errors.push(`${at}: bad discipline`);
    for (const k of ['title', 'topic', 'author', 'licence', 'sourceUrl', 'credit']) if (typeof p?.[k] !== 'string' || !p[k].trim()) errors.push(`${at}: missing ${k}`);
    if (typeof p?.file !== 'string' || !/^\/plates\/[a-z0-9._-]+\.(png|jpg|jpeg|webp|svg)$/i.test(p.file)) errors.push(`${at}: file must live under /plates/`);
    if (typeof p?.sourceUrl === 'string' && !/^https:\/\//.test(p.sourceUrl)) errors.push(`${at}: sourceUrl must be https`);
    if (typeof p?.licence === 'string') { const c = checkLicence(p.licence, opts); if (!c.allowed) errors.push(`${at}: licence not allowed (${c.reason})`); }
    if (!(p?.width > 0) || !(p?.height > 0)) errors.push(`${at}: bad size`);
    if (!Array.isArray(p?.labels)) errors.push(`${at}: labels must be a list`);
    else p.labels.forEach((l: any, j: number) => {
      if (typeof l?.text !== 'string' || !l.text.trim() || l.text.length > 60) errors.push(`${at}.labels[${j}]: bad text`);
      if (!frac(l?.x) || !frac(l?.y)) errors.push(`${at}.labels[${j}]: x and y must be 0-1`);
      if (l?.side !== 'left' && l?.side !== 'right') errors.push(`${at}.labels[${j}]: side must be left or right`);
      if (typeof l?.reviewed !== 'boolean') errors.push(`${at}.labels[${j}]: reviewed must be true or false`);
    });
  });
  return errors.length ? { ok: false, errors } : { ok: true, manifest: m as PlateManifest };
}

/** Only plates a person has fully checked count as verified. */
export const isVerified = (p: Plate) => p.labels.length > 0 && p.labels.every(l => l.reviewed);
