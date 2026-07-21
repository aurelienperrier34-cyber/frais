const CACHE = 'frais-v47';
const ASSETS = ['./', './index.html', './styles.css', './field-tests.css', './live-map.css', './data-status.css', './time.css', './navigation.css', './map-fix.css', './app.js', './route-recovery.js', './field-tests.js', './live-map.js', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg'];

self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
