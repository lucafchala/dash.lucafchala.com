const CACHE = 'dash-v5';
const PRECACHE = [
    '/manifest.json', '/icon.svg',
    '/fonts/cormorant-garamond-latin.woff2', '/fonts/cormorant-garamond-italic-latin.woff2', '/fonts/jetbrains-mono-latin.woff2',
];

/* '/' is deliberately not precached: while logged out the middleware 302s it
   to /login, and a followed redirect cached under '/' can never satisfy a
   later navigation (browsers treat redirected responses as network errors
   for navigations), which surfaced as a permanent net::ERR_FAILED. */
self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {}));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

function cacheable(res) {
    return res && res.ok && res.type === 'basic' && !res.redirected;
}

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    /* Cross-origin (GitHub, status, paste) and anything auth- or data-bearing
       always goes to the network; stale copies there cause stale SHAs and 409s. */
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/') || url.pathname === '/data.json' || url.pathname === '/login' || url.pathname === '/logout') return;

    /* Navigations: network first so a deploy is picked up on the next load
       (the app shell generates files for other repos — running last week's
       generators would push last week's output). Offline falls back to the
       last good shell. */
    if (req.mode === 'navigate') {
        e.respondWith(
            fetch(req).then(res => {
                if (cacheable(res) && url.pathname === '/') {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put('/', copy));
                }
                return res;
            }).catch(() => caches.match('/').then(r => r || Response.error()))
        );
        return;
    }

    e.respondWith(
        caches.open(CACHE).then(cache =>
            cache.match(req).then(cached => {
                const network = fetch(req).then(res => {
                    if (cacheable(res)) cache.put(req, res.clone());
                    return res;
                }).catch(() => cached || Response.error());
                return cached || network;
            })
        )
    );
});
