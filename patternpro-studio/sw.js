/* PatternPro Studio — service worker (offline-first) */
const CACHE = "patternpro-v2";
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
  // Cache-first for our assets, network fallback; runtime-cache CDN (fonts, three.js).
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok && (req.url.startsWith(self.location.origin) || /unpkg|fonts\.(googleapis|gstatic)/.test(req.url))) {
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
