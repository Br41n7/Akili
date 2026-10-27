#!/usr/bin/env node
// Run on YOUR computer (Node 18+), not on Vercel. Needs internet access to commons.wikimedia.org.
//   node scripts/plates.mjs search "Gray's Anatomy back muscles"   -> list candidates with licences
//   node scripts/plates.mjs fetch                                  -> download every pick in data/plates/plates.json
// A pick is { id, discipline, topic, title: "File:Name.png" }. Add --share-alike to allow CC BY-SA files.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { checkLicence, creditLine, stripHtml } from '../lib/plate-licence.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'AkiliPlateFetcher/1.0 (educational app; contact: set-your-email-here)';
const args = process.argv.slice(2); const cmd = args[0]; const allowShareAlike = args.includes('--share-alike');
const MANIFEST = path.resolve('data/plates/plates.json'); const OUT = path.resolve('public/plates'); const WIDTH = 1200;

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Commons answered ${r.status}`);
  return r.json();
}
async function info(titles) {
  const j = await api({ action: 'query', titles, prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: String(WIDTH) });
  return Object.values(j.query?.pages || {}).map(p => {
    const ii = p.imageinfo?.[0]; const md = ii?.extmetadata || {};
    return ii && { title: p.title, url: ii.thumburl || ii.url, width: ii.thumbwidth || ii.width, height: ii.thumbheight || ii.height, mime: ii.mime,
      licence: stripHtml(md.LicenseShortName?.value), author: stripHtml(md.Artist?.value), sourceUrl: ii.descriptionurl };
  }).filter(Boolean);
}

if (cmd === 'search' && args[1]) {
  const j = await api({ action: 'query', list: 'search', srsearch: args[1], srnamespace: '6', srlimit: '12' });
  const titles = (j.query?.search || []).map(s => s.title);
  if (!titles.length) { console.log('No files found.'); process.exit(0); }
  for (const f of await info(titles.join('|'))) {
    const c = checkLicence(f.licence, { allowShareAlike });
    console.log(`${c.allowed ? 'OK ' : 'NO '} ${f.title}\n     licence: ${f.licence || '(none)'}${c.allowed ? '' : `  [${c.reason}]`}\n     by: ${f.author || '(unknown)'}\n     ${f.sourceUrl}\n`);
  }
} else if (cmd === 'fetch') {
  const m = JSON.parse(await readFile(MANIFEST, 'utf8')); await mkdir(OUT, { recursive: true });
  const plates = m.plates.filter(p => !m.picks.some(k => k.id === p.id));
  for (const pick of m.picks) {
    const [f] = await info(pick.title);
    if (!f) { console.log(`SKIP ${pick.id}: not found on Commons`); continue; }
    const c = checkLicence(f.licence, { allowShareAlike });
    if (!c.allowed) { console.log(`SKIP ${pick.id}: ${c.reason} (${f.licence || 'no licence'})`); continue; }
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.mime || '')) { console.log(`SKIP ${pick.id}: unsupported type ${f.mime}`); continue; }
    const ext = f.mime === 'image/jpeg' ? 'jpg' : f.mime === 'image/svg+xml' ? 'svg' : f.mime.split('/')[1];
    const r = await fetch(f.url, { headers: { 'User-Agent': UA } }); if (!r.ok) { console.log(`SKIP ${pick.id}: download ${r.status}`); continue; }
    const file = `${pick.id}.${ext}`; await writeFile(path.join(OUT, file), Buffer.from(await r.arrayBuffer()));
    const existing = m.plates.find(p => p.id === pick.id);
    plates.push({ id: pick.id, title: f.title.replace(/^File:/, ''), discipline: pick.discipline, topic: pick.topic, file: `/plates/${file}`, width: f.width, height: f.height,
      author: f.author || 'Unknown author', licence: f.licence, licenceKind: c.kind, sourceUrl: f.sourceUrl,
      credit: creditLine({ title: f.title.replace(/^File:/, ''), author: f.author, licence: f.licence, sourceUrl: f.sourceUrl }), labels: existing?.labels || [] });
    console.log(`OK   ${pick.id}  (${f.licence})`);
  }
  await writeFile(MANIFEST, JSON.stringify({ ...m, plates }, null, 2) + '\n');
  console.log('\nNow open the manifest, check every credit, and add labels (they start as unreviewed drafts).');
} else {
  console.log('Usage:\n  node scripts/plates.mjs search "<term>" [--share-alike]\n  node scripts/plates.mjs fetch [--share-alike]');
}
