const SW_VERSION = 'v7';
const CACHE_PREFIX = 'retro-emulator-cache';
const CACHE_NAME = `${CACHE_PREFIX}-${SW_VERSION}`;

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
];

const CORE_ASSETS = [
  './cores/jsnes/jsnes.min.js',
  './cores/gameboy/gameboy.min.js',
  './cores/mgba/mgba.wasm',
  './cores/snes9x/snes9x.wasm',
];

async function cacheAssets(cache, assets) {
  await Promise.allSettled(
    assets.map(async (asset) => {
      try {
        const response = await fetch(asset, { cache: 'no-store' });
        if (response.ok) await cache.put(asset, response);
      } catch (_error) {
        // Optional emulator core may be absent in development/deploy.
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cacheAssets(cache, APP_SHELL);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );

    const cache = await caches.open(CACHE_NAME);
    await cacheAssets(cache, CORE_ASSETS);
    await self.clients.claim();

    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: SW_VERSION }));
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  const isNavigation = request.mode === 'navigate';

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (isNavigation) {
      try {
        const network = await fetch(request, { cache: 'no-store' });
        if (network.ok) cache.put(request, network.clone());
        return network;
      } catch (_error) {
        return (await cache.match(request)) || (await cache.match('./index.html'));
      }
    }

    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const network = await fetch(request);
      if (network.ok) cache.put(request, network.clone());
      return network;
    } catch (_error) {
      return cached || caches.match('./index.html');
    }
  })());
});
