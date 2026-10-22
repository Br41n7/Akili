/* Akili service worker.
 * Deliberately small and safe:
 *  - Caches only static, non-personal files (build assets, icons, the offline page).
 *  - NEVER caches /api, auth routes, Supabase calls or HTML pages (they are per-user).
 *  - Page navigations go to the network; if it is unreachable, the offline page is shown.
 * Bump VERSION to drop old caches.
 */
const VERSION = 'v1';
const STATIC_CACHE = `akili-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || /\.(?:woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);
}

// Which requests the worker may touch at all. Exported for tests.
function classify(request, origin) {
  if (request.method !== 'GET') return 'ignore';
  let url;
  try { url = new URL(request.url); } catch { return 'ignore'; }
  if (url.origin !== origin) return 'ignore';
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth')) return 'ignore';
  if (request.mode === 'navigate') return 'navigate';
  if (isStaticAsset(url)) return 'static';
  return 'ignore';
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('akili-') && k !== STATIC_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const kind = classify(event.request, self.location.origin);
  if (kind === 'ignore') return;

  if (kind === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Static: cache first, fill on miss.
  event.respondWith(
    caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(STATIC_CACHE).then(c => c.put(event.request, copy)); }
      return res;
    })),
  );
});

if (typeof module !== 'undefined') module.exports = { classify, STATIC_CACHE, OFFLINE_URL };
