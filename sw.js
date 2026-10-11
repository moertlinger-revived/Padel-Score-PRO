const CACHE_NAME = 'padel-score-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/control.html',
    '/tablero.html',
    '/css/base.css',
    '/css/control.css',
    '/css/tablero.css',
    '/js/firebase-config.js',
    '/js/engine.js',
    '/js/store.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Ignorar peticiones a Firebase, APIs externas
    if (event.request.url.includes('firebase') || 
        event.request.url.includes('gstatic') ||
        event.request.url.includes('api.open-meteo') ||
        event.request.url.includes('ipapi.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const network = fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached);
            return cached || network;
        })
    );
});