const CACHE_NAME = 'silence-cache-v93';
const APP_FILES = ['./', './index.html', './style.css', './game.js', './monster-model.js', './environment-assets.js', './manifest.json', './icon.svg', './silence-app-icon.svg', './icon-192.png', './icon-512.png', './install.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('silence-cache-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // CC0 GLB 환경 모델은 최초 온라인 로드 후 별도 캐시에 보관해 재방문 시 재다운로드를 줄인다.
  if (url.origin === 'https://tevy.dev' && (url.pathname.startsWith('/models/') || url.pathname.startsWith('/materials/')) && (url.pathname.endsWith('.glb') || url.pathname.endsWith('.ktx2')) && request.method === 'GET') {
    event.respondWith((async () => {
      const assetCache = await caches.open('silence-assets-v1');
      const cachedAsset = await assetCache.match(request);
      if (cachedAsset) return cachedAsset;
      const response = await fetch(request);
      if (response && response.ok && response.type !== 'opaque') {
        await assetCache.put(request, response.clone());
      }
      return response;
    })());
    return;
  }

  if (url.origin !== self.location.origin || request.method !== 'GET') return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('./index.html');
      throw error;
    }
  })());
});