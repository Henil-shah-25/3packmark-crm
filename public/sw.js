// Developster CRM Service Worker (PWA Installability)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let network handle dynamic API requests
  if (event.request.url.includes('/api/')) {
    return;
  }
});

