/* BerryStudio — service worker (offline-capable, update-friendly) */
const CACHE = "berrystudio-v27";
const ASSETS = [
  "./", "./index.html",
  "./css/styles.css",
  "./js/i18n.js", "./js/data.js", "./js/canvas.js", "./js/three-view.js", "./js/ai.js", "./js/billboard.js", "./js/library.js", "./js/fancy-patterns.js", "./js/validate.js",
  "./js/ai-keystore.js", "./js/capability-probe.js", "./js/ai-providers.js", "./js/schema-validate.js", "./js/ai-spec-pipeline.js", "./js/ai-fusion.js", "./js/image-providers.js", "./js/app.js",
  "./js/vendor/pattern-spec-validate.generated.js",
  "./schema/pattern-spec.v1.json",
  "./manifest.webmanifest",
  "./icons/icon.svg",
];
// Deliberately NOT precached: js/workers/local-model-worker.js — it's only
// ever instantiated on demand (WP-2 Routes B/C), and its own dynamic import
// of the ML runtime must never be triggered by a service-worker precache.

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
