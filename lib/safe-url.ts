import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

/**
 * Safe server-side fetching of a URL a learner typed in. Defends against server-side request forgery (SSRF):
 *  - only http/https, default ports, no credentials in the URL;
 *  - the host name is resolved by US and every address must be public; the connection then uses that same check,
 *    so a name that changes its answer between the check and the connection (DNS rebinding) cannot reach an internal host;
 *  - redirects are followed by hand, with the same checks on every hop;
 *  - hard limits on time, redirects and size.
 */
export class UnsafeUrlError extends Error { constructor(message: string) { super(message); this.name = 'UnsafeUrlError'; } }

function ipv4ToInt(ip: string): number | null {
  const p = ip.split('.'); if (p.length !== 4) return null;
  let n = 0; for (const x of p) { if (!/^\d{1,3}$/.test(x)) return null; const v = Number(x); if (v > 255) return null; n = n * 256 + v; }
  return n;
}
const inV4 = (n: number, base: string, bits: number) => { const b = ipv4ToInt(base)!; const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0; return ((n & mask) >>> 0) === ((b & mask) >>> 0); };
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

/** True for loopback, private, link-local (including cloud metadata 169.254.169.254), multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  let ip = address.trim().replace(/^\[|\]$/g, '');
  const zone = ip.indexOf('%'); if (zone >= 0) ip = ip.slice(0, zone);
  if (net.isIPv4(ip)) { const n = ipv4ToInt(ip); return n === null || BLOCKED_V4.some(([b, bits]) => inV4(n, b, bits)); }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (mapped) return isPrivateAddress(mapped[1]);
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) { const a = parseInt(mappedHex[1], 16), b = parseInt(mappedHex[2], 16); return isPrivateAddress(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`); }
    if (lower === '::' || lower === '::1') return true;
    const first = parseInt(lower.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true;   // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true;   // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true;   // ff00::/8 multicast
    if (lower.startsWith('64:ff9b:') || lower.startsWith('2001:db8') || lower.startsWith('2002:') || lower.startsWith('::')) return true; // NAT64, docs, 6to4, compat
    return false;
  }
  return true; // not an IP at all
}

/** Validates the shape of a URL (no network). Throws UnsafeUrlError with a learner-safe message. */
export function parsePublicUrl(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2000) throw new UnsafeUrlError('Enter a valid web address.');
  let u: URL; try { u = new URL(raw.trim()); } catch { throw new UnsafeUrlError('Enter a valid web address.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UnsafeUrlError('Only http and https addresses can be imported.');
  if (u.username || u.password) throw new UnsafeUrlError('Addresses with a username or password are not allowed.');
  if (u.port && u.port !== '80' && u.port !== '443') throw new UnsafeUrlError('Only standard web ports are allowed.');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || (!host.includes('.') && !net.isIP(host))) throw new UnsafeUrlError('That address is not a public website.');
  if (net.isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError('That address is not a public website.');
  return u;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;
/** DNS lookup that refuses non-public answers. Used by the socket itself, so the checked address is the connected address. */
export function publicLookup(hostname: string, options: dns.LookupOptions | number | undefined, cb: LookupCb) {
  const opts: dns.LookupOptions = typeof options === 'object' && options ? options : { family: typeof options === 'number' ? options : 0 };
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 0);
    const list = (addresses as dns.LookupAddress[]) || [];
    if (!list.length || list.some(a => isPrivateAddress(a.address))) return cb(Object.assign(new Error('That address is not a public website.'), { code: 'EUNSAFE' }) as NodeJS.ErrnoException, '', 0);
    if (opts.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

export interface SafeFetchResult { status: number; url: string; contentType: string; body: string }
export interface SafeFetchOptions { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; headers?: Record<string, string>; /** tests only */ lookup?: typeof publicLookup }

function once(u: URL, o: Required<Pick<SafeFetchOptions, 'maxBytes' | 'timeoutMs'>> & Pick<SafeFetchOptions, 'headers' | 'lookup'>): Promise<SafeFetchResult & { location?: string }> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || undefined, path: `${u.pathname}${u.search}`, method: 'GET',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; AkiliImporter/1.0)', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1', 'accept-encoding': 'identity', ...o.headers },
      lookup: (o.lookup || publicLookup) as never, timeout: o.timeoutMs,
    }, res => {
      const status = res.statusCode || 0; const contentType = String(res.headers['content-type'] || '');
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); return resolve({ status, url: u.toString(), contentType, body: '', location: String(res.headers.location) }); }
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (c: Buffer) => { size += c.length; if (size > o.maxBytes) { chunks.push(c.subarray(0, c.length - (size - o.maxBytes))); res.destroy(); } else chunks.push(c); });
      const finish = () => resolve({ status, url: u.toString(), contentType, body: Buffer.concat(chunks).toString('utf8') });
      res.on('end', finish); res.on('close', finish); res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('The page took too long to respond.'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end();
  });
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const o = { maxBytes: options.maxBytes ?? 2_000_000, timeoutMs: options.timeoutMs ?? 10_000, headers: options.headers, lookup: options.lookup };
  let u = parsePublicUrl(rawUrl);
  for (let hop = 0; hop <= (options.maxRedirects ?? 4); hop++) {
    let r;
    try { r = await once(u, o); }
    catch (e) { if ((e as { code?: string })?.code === 'EUNSAFE') throw new UnsafeUrlError('That address is not a public website.'); throw e; }
    if (!r.location) return r;
    u = parsePublicUrl(new URL(r.location, u).toString()); // every hop is checked again
  }
  throw new UnsafeUrlError('That address redirects too many times.');
}

/** Google Docs/Slides export URLs are built from an id we validated, never from the typed address. */
export function googleFileId(u: URL, kind: 'document' | 'presentation'): string | null {
  if (u.hostname.toLowerCase() !== 'docs.google.com') return null;
  const m = u.pathname.match(new RegExp(`^/${kind}/d/([A-Za-z0-9_-]{10,100})(?:/|$)`));
  return m ? m[1] : null;
}
