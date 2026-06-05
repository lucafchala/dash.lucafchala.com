const CACHE = 'dash-v1';
const PRECACHE = ['/', '/index.html', '/data.json', '/manifest.json', '/icon.svg'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
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
    e.respondWith(
        caches.open(CACHE).then(cache =>
            cache.match(e.request).then(cached => {
                const network = fetch(e.request).then(res => {
                    if (res && res.status === 200 && res.type !== 'opaque') {
                        cache.put(e.request, res.clone());
                    }
                    return res;
                }).catch(() => cached);
                return cached || network;
            })
        )
    );
});
