import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import manifest from '@/app/manifest';

const require = createRequire(import.meta.url);
const root = path.resolve(__dirname, '../..');
// public/sw.js is CommonJS-compatible for testing; self/caches are not touched at import except addEventListener.
(globalThis as any).self = { addEventListener: () => {}, location: { origin: 'https://akili.test' } };
const { classify } = require(path.join(root, 'public/sw.js'));

const O = 'https://akili.test';
const req = (url: string, init: { method?: string; mode?: string } = {}) => ({ url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' });

describe('manifest', () => {
  const m = manifest();
  it('is installable', () => {
    expect(m.display).toBe('standalone'); expect(m.start_url).toBe('/'); expect(m.name && m.short_name).toBeTruthy();
    const sizes = (m.icons || []).map(i => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']));
  });
  it('every referenced icon file exists', () => {
    for (const i of m.icons || []) expect(existsSync(path.join(root, 'public', i.src))).toBe(true);
    expect(existsSync(path.join(root, 'public/offline.html'))).toBe(true);
    expect(existsSync(path.join(root, 'public/icons/apple-touch-icon.png'))).toBe(true);
  });
});

describe('service worker request rules', () => {
  it('never touches the API, auth, other origins or non-GET', () => {
    expect(classify(req(`${O}/api/ai/generate`), O)).toBe('ignore');
    expect(classify(req(`${O}/auth/login`, { mode: 'navigate' }), O)).toBe('ignore');
    expect(classify(req('https://abc.supabase.co/rest/v1/projects'), O)).toBe('ignore');
    expect(classify(req(`${O}/icons/icon-192.png`, { method: 'POST' }), O)).toBe('ignore');
  });
  it('page navigations go to the network (offline page on failure), never cached', () => {
    expect(classify(req(`${O}/projects/123`, { mode: 'navigate' }), O)).toBe('navigate');
  });
  it('caches only static assets', () => {
    expect(classify(req(`${O}/_next/static/chunks/a.js`), O)).toBe('static');
    expect(classify(req(`${O}/icons/icon-512.png`), O)).toBe('static');
    expect(classify(req(`${O}/projects/123`), O)).toBe('ignore');
  });
  it('the source never caches api routes or html pages', () => {
    const src = readFileSync(path.join(root, 'public/sw.js'), 'utf8');
    expect(src).toMatch(/\/api\//);
    expect(src).not.toMatch(/put\(event\.request[^)]*\)[\s\S]{0,0}navigate/);
  });
});
