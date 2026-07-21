/* BerryStudio — service worker (offline-capable, update-friendly) */
const CACHE = "berrystudio-v6";
const ASSETS = [
  "./", "./index.html",
  "./css/styles.css",
  "./js/i18n.js", "./js/data.js", "./js/canvas.js", "./js/three-view.js", "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never intercept the worker script itself — avoids stale-SW deadlocks.
  if (url.pathname.endsWith("/sw.js")) return;

  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Network-first for our own app shell/assets so updates propagate when
    // online; fall back to the cached copy when offline.
    e.respondWith(
      // Revalidate against the server so a changed file is never served stale;
      // fall back to the cached copy only when the network is unavailable.
      fetch(req, { cache: "no-cache" }).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
  } else {
    // Cache-first for third-party assets (fonts, three.js) — safe to keep.
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && res.ok && /unpkg|fonts\.(googleapis|gstatic)/.test(req.url)) {
          const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached))
    );
  }
});
