/* Service worker : met l'interface en cache pour un usage hors ligne.
 * Le planning lui-même est gardé dans le localStorage par l'application.
 * Changer VERSION à chaque mise en ligne d'une nouvelle version du code. */
const VERSION = 'edt-v4';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/models/ScheduleModel.js',
  './js/views/ScheduleView.js',
  './js/controllers/ScheduleController.js',
  './js/models/RoomsModel.js',
  './js/views/RoomsView.js',
  './js/controllers/RoomsController.js',
  './js/utils/changes.js',
  './js/utils/rooms.js',
  './js/services/IcsService.js',
  './js/services/StorageService.js',
  './js/utils/dates.js',
  './js/utils/icsParser.js',
  './js/utils/layout.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Interface : réseau d'abord pour avoir la dernière version, cache si hors ligne.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((cached) => cached ?? caches.match('./index.html'))),
  );
});
