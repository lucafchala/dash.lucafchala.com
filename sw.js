const CACHE = 'dash-v5';
const PRECACHE = ['/', '/index.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', e => {
    /* '/' and '/index.html' sit behind the auth middleware. addAll() fetches
       with the default redirect:'follow', so while logged out it would cache
       the *login page* — fetched as redirected:true — under those keys. A
       cached redirected:true response can never satisfy a navigation request
       (browser navigations always use redirect:'manual'), so any later visit
       served from that entry fails outright with net::ERR_FAILED. Fetch each
       URL individually and only cache responses that weren't redirected, so
       a logged-out install can't poison the cache (and one bad URL doesn't
       abort the rest, unlike addAll's all-or-nothing behaviour). */
    e.waitUntil(
        caches.open(CACHE).then(cache => Promise.all(
            PRECACHE.map(url => fetch(url).then(res => {
                if (res.ok && !res.redirected) return cache.put(url, res);
            }).catch(() => {}))
        ))
    );
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

/* Stale-while-revalidate */
self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    /* data.json is public and must always be fresh; bypassing SW avoids
       stale HTML (auth redirect) being cached in place of JSON after
       a session expiry and corrupting future loads. */
    if (new URL(e.request.url).pathname === '/data.json') return;
    e.respondWith(
        caches.open(CACHE).then(cache =>
            cache.match(e.request).then(cached => {
                const network = fetch(e.request).then(res => {
                    /* Same redirected:true hazard as install() above — never
                       cache a response that came from a followed redirect. */
                    if (res && res.status === 200 && !res.redirected && res.type !== 'opaque') {
                        cache.put(e.request, res.clone());
                    }
                    return res;
                }).catch(() => cached);
                return cached || network;
            })
        )
    );
});
