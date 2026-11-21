const CACHE_NAME = 'silence-cache-v66';
const APP_FILES = ['./', './index.html', './style.css', './game.js', './monster-model.js', './manifest.json', './icon.svg', './silence-app-icon.svg', './icon-192.png', './icon-512.png', './install.html'];

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
  if (url.origin !== self.location.origin || request.method !== 'GET') return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('./index.html');
      throw error;
    }
  })());
});