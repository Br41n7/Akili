export function classifyLicence(shortName: string): { kind: string; ok: boolean | 'share-alike'; reason?: string };
export function checkLicence(shortName: string, opts?: { allowShareAlike?: boolean }): { allowed: boolean; kind: string; reason?: string };
export function creditLine(p: { title: string; author?: string; licence: string; sourceUrl: string }): string;
export function stripHtml(s: string): string;
