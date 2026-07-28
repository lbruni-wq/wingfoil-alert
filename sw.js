/* Service worker WingFoil Alert.
   Shell e API Open-Meteo: network-first con fallback cache — un deploy nuovo si
   vede alla prima riapertura dell'app, e offline si resta operativi con gli
   ultimi file e dati salvati (l'app ha anche il suo fallback in localStorage).
   Font del design system: cache-first. */

const CACHE = "wingfoil-v2";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "windlogic.js",
  "config.json",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Previsioni: rete, e solo se la rete manca la copia in cache — marcata con un
   header, altrimenti l'app riceverebbe un 200 indistinguibile da un dato fresco
   e mostrerebbe previsioni stantie senza dirlo. */
async function apiResponse(request) {
  try {
    const resp = await fetch(request);
    const copy = resp.clone();
    caches.open(CACHE).then(cache => cache.put(request, copy));
    return resp;
  } catch (e) {
    const cached = await caches.match(request);
    if (!cached) throw e;
    const headers = new Headers(cached.headers);
    headers.set("X-Wingfoil-Cache", "hit");
    return new Response(await cached.blob(), { status: 200, headers });
  }
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // Il font del design system: cache-first, così l'app installata resta
  // tipograficamente sé stessa anche offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return resp;
        })
        .catch(() => cached))
    );
    return;
  }

  if (url.hostname === "api.open-meteo.com"
      || url.hostname === "marine-api.open-meteo.com"
      || url.hostname === "geocoding-api.open-meteo.com") {
    event.respondWith(apiResponse(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(event.request).then(cached =>
        // offline su una navigazione mai vista (es. link con hash): shell.
        cached || (event.request.mode === "navigate"
          ? caches.match("index.html") : undefined)))
  );
});
