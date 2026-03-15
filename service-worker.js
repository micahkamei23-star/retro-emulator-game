const CACHE_NAME = 'retro-emulator-cache-v4';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/main.js',
  './js/controller.js',
  './js/emulator-loader.js',
  './js/storage.js',
  './js/emulators/core-interface.js',
  './js/emulators/script-loader.js',
  './js/emulators/nes-core.js',
  './js/emulators/gb-core.js',
  './js/emulators/wasm-core.js',
  './service-worker.js',
  './cores/jsnes/jsnes.min.js',
  './cores/gameboy/gameboy.min.js',
  './cores/mgba/mgba.wasm',
  './cores/snes9x/snes9x.wasm',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(
      APP_SHELL.map(async (asset) => {
        try {
          const response = await fetch(asset);
          if (response.ok) {
            await cache.put(asset, response);
          }
        } catch (_error) {
          // Optional core asset may not be present during local development.
        }
      }),
    );
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key !== CACHE_NAME)
      .map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cached || caches.match('./index.html'));

      return cached || networkFetch;
    }),
  );
});
