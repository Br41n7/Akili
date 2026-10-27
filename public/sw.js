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

// ── Push reminders ───────────────────────────────────────────────────────────
// A notification may only open a page on this site.
function safeUrl(raw) {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/projects';
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const options = {
    body: String(data.body || '').slice(0, 200),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 40) : 'akili',
    data: { url: safeUrl(data.url) },
  };
  // Browsers require every push to show a notification.
  event.waitUntil(self.registration.showNotification(String(data.title || 'Akili').slice(0, 80), options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          return (c.navigate ? c.navigate(url) : Promise.resolve()).then(() => c.focus());
        }
      }
      return clients.openWindow(url);
    }),
  );
});

if (typeof module !== 'undefined') module.exports = { classify, safeUrl, STATIC_CACHE, OFFLINE_URL };
