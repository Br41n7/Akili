// Licence rules for downloaded plates. Plain JS so the fetch script (node) and the app share one copy.
// Allowed: public domain, CC0, CC BY. Share-alike (CC BY-SA) only when the caller opts in. Never NC or ND.
const strip = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export function classifyLicence(shortName) {
  const t = strip(shortName).toLowerCase();
  if (!t) return { kind: 'unknown', ok: false, reason: 'no licence information' };
  if (/\b(nc|nd)\b|non-?commercial|no-?deriv/.test(t)) return { kind: 'restricted', ok: false, reason: 'NonCommercial or NoDerivatives' };
  if (/^(public domain|pd\b|pd-|cc0|cc-0)/.test(t) || /public domain/.test(t)) return { kind: 'public-domain', ok: true };
  if (/^cc[- ]by[- ]sa/.test(t)) return { kind: 'share-alike', ok: 'share-alike' };
  if (/^cc[- ]by\b/.test(t)) return { kind: 'attribution', ok: true };
  return { kind: 'unknown', ok: false, reason: `unrecognised licence "${strip(shortName)}"` };
}

/** Decide whether a file may be added. */
export function checkLicence(shortName, { allowShareAlike = false } = {}) {
  const c = classifyLicence(shortName);
  if (c.ok === true) return { allowed: true, kind: c.kind };
  if (c.ok === 'share-alike') return allowShareAlike ? { allowed: true, kind: c.kind } : { allowed: false, kind: c.kind, reason: 'share-alike needs an explicit decision' };
  return { allowed: false, kind: c.kind, reason: c.reason };
}

/** The credit shown under the image. */
export function creditLine({ title, author, licence, sourceUrl }) {
  const who = strip(author) || 'Unknown author';
  return `${strip(title)} - ${who}. ${strip(licence)}. Source: ${sourceUrl}`.slice(0, 400);
}
export { strip as stripHtml };
