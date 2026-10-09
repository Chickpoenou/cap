const CACHE_NAME = 'cap-shell-v5';
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './cap.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (cles) {
        return Promise.all(cles.filter(function (cle) {
          return cle.startsWith('cap-shell-') && cle !== CACHE_NAME;
        }).map(function (cle) { return caches.delete(cle); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  /* Fichiers de l'application (page, script, style) : le réseau
     d'abord pour recevoir les mises à jour, la copie en cache
     seulement hors ligne. Ainsi, oublier de changer CACHE_NAME
     ne bloque plus les téléphones sur une ancienne version. */
  const estFichierApplication = event.request.mode === 'navigate' ||
    ['script', 'style', 'manifest'].includes(event.request.destination);
  if (estFichierApplication) {
    event.respondWith(
      fetch(event.request).then(function (reponse) {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copie); });
        }
        return reponse;
      }).catch(function () {
        return caches.match(event.request).then(function (reponseEnCache) {
          if (reponseEnCache) return reponseEnCache;
          if (event.request.mode === 'navigate') return caches.match('./index.html');
          throw new Error('Ressource indisponible hors ligne.');
        });
      })
    );
    return;
  }

  /* Autres fichiers (icône...) : la copie en cache d'abord. */
  event.respondWith(
    caches.match(event.request).then(function (reponseEnCache) {
      if (reponseEnCache) return reponseEnCache;
      return fetch(event.request).then(function (reponse) {
        if (reponse.ok && event.request.destination !== 'document') {
          const copie = reponse.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copie); });
        }
        return reponse;
      }).catch(function () {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('Ressource indisponible hors ligne.');
      });
    })
  );
});
