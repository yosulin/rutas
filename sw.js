/* ============================================================
   Service worker — Rutas por el Monte
   - App shell: cache-first (rápido, funciona offline)
   - data/rutas.json y data/version.json: network-first con fallback a
     caché (así se actualizan solos cuando hay conexión, y siguen
     disponibles offline con la última versión conocida)
   - data/gpx/*.gpx y data/tracks/*.geojson (mismo origen): cache-first,
     se guardan en la runtime cache SOLO cuando el usuario abre el mapa
     de una ruta (fetch bajo demanda desde app.js), nunca precargados.
   - Mosaicos de OpenStreetMap (tile.openstreetmap.org) y Leaflet por CDN
     son de otro origen: esta service worker NO los intercepta ni los
     cachea (ver el corte por `url.origin` más abajo). El mapa base
     necesita red la primera vez que se ve cada zona; una ruta ya
     visitada puede quedar disponible offline si el navegador conservó
     esos tiles en su caché HTTP normal, pero no lo garantizamos aquí.
   ============================================================ */

const CACHE_VERSION = 'v4'; // v4: mapa embebido en el detalle + engranaje de ajustes (bump para forzar actualización)
const SHELL_CACHE = `rutas-shell-${CACHE_VERSION}`;
const DATA_CACHE = `rutas-data-${CACHE_VERSION}`;
const RUNTIME_CACHE = `rutas-runtime-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon.svg',
];

const DATA_URL_PATTERN = /\/data\/(rutas|version)\.json$/;
const TRACK_ASSET_PATTERN = /\/data\/(gpx|tracks)\//;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // datos: network-first, cae a caché si no hay red
  if (DATA_URL_PATTERN.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // GPX/GeoJSON de rutas (mismo origen): cache-first. Solo se piden cuando
  // el usuario abre el modal de mapa de una ruta concreta (fetch() bajo
  // demanda en app.js), así que nunca se precargan aquí ni en el install.
  if (TRACK_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // navegación (abrir la app directamente): intenta red, si falla sirve el shell cacheado
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // resto de assets: cache-first, con relleno a runtime cache
  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    return cached || Response.error();
  }
}
