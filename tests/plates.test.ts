import { describe, expect, it } from 'vitest';
import { checkLicence, classifyLicence, creditLine } from '@/lib/plate-licence.mjs';
import { isVerified, validateManifest } from '@/lib/plates';

const plate = (over: object = {}) => ({ id: 'back-muscles', title: 'Gray409', discipline: 'anatomy', topic: 'Back', file: '/plates/back-muscles.png', width: 1200, height: 900, author: 'Henry Gray', licence: 'Public domain', licenceKind: 'public-domain', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Gray409.png', credit: 'x', labels: [{ text: 'Trapezius', x: 0.4, y: 0.3, side: 'left', reviewed: true }], ...over });

describe('licence rules', () => {
  it('allows public domain, CC0 and CC BY; holds share-alike back; refuses NC, ND and unknown', () => {
    for (const ok of ['Public domain', 'PD-old-70', 'CC0', 'CC BY 4.0', 'CC BY 2.5', '<a href="x">CC BY 3.0</a>']) expect(checkLicence(ok).allowed, ok).toBe(true);
    expect(checkLicence('CC BY-SA 4.0').allowed).toBe(false); expect(checkLicence('CC BY-SA 4.0', { allowShareAlike: true }).allowed).toBe(true);
    for (const no of ['CC BY-NC 4.0', 'CC BY-ND 3.0', 'CC BY-NC-SA 4.0', 'All rights reserved', '', 'Fair use']) expect(checkLicence(no, { allowShareAlike: true }).allowed, no).toBe(false);
    expect(classifyLicence(undefined as any).kind).toBe('unknown');
  });
  it('builds a credit line and strips markup', () => {
    expect(creditLine({ title: 'Gray409.png', author: '<a>Henry Gray</a>', licence: 'Public domain', sourceUrl: 'https://x.org/f' })).toBe('Gray409.png - Henry Gray. Public domain. Source: https://x.org/f');
    expect(creditLine({ title: 'a', licence: 'CC BY 4.0', sourceUrl: 'https://x.org' })).toContain('Unknown author');
  });
});

describe('manifest validation', () => {
  it('accepts a complete plate and an empty list', () => {
    expect(validateManifest({ version: 1, plates: [plate()] }).ok).toBe(true); expect(validateManifest({ version: 1, plates: [] }).ok).toBe(true);
  });
  it('rejects bad shape, licences, files, coordinates and duplicates, naming each problem', () => {
    expect(validateManifest(null).ok).toBe(false);
    const bad = validateManifest({ version: 1, plates: [plate({ licence: 'CC BY-NC 4.0' }), plate({ id: 'b2', file: 'https://evil.com/x.png' }), plate({ id: 'b3', labels: [{ text: 'T', x: 1.5, y: 0.1, side: 'up', reviewed: 'yes' }] }), plate({ id: 'b3' }), plate({ id: 'b4', sourceUrl: 'http://x.org' }), plate({ id: 'b5', credit: '' })] });
    expect(bad.ok).toBe(false); const e = (bad as any).errors.join('\n');
    for (const needle of ['licence not allowed', 'file must live under /plates/', 'x and y must be 0-1', 'side must be', 'reviewed must be', 'duplicate id', 'sourceUrl must be https', 'missing credit']) expect(e).toContain(needle);
  });
  it('a plate is verified only when every label has been checked by a person', () => {
    expect(isVerified(plate() as any)).toBe(true);
    expect(isVerified(plate({ labels: [{ text: 'A', x: 0, y: 0, side: 'left', reviewed: true }, { text: 'B', x: 0, y: 0, side: 'left', reviewed: false }] }) as any)).toBe(false);
    expect(isVerified(plate({ labels: [] }) as any)).toBe(false);
  });
});
