/* BerryStudio — service worker (offline-capable, update-friendly) */
const CACHE = "berrystudio-v55";
const ASSETS = [
  "./", "./index.html",
  "./css/styles.css",
  "./js/i18n.js", "./js/data.js", "./js/canvas.js", "./js/three-view.js", "./js/ai.js", "./js/billboard.js", "./js/library.js", "./js/girls-leotards.js", "./js/underwear-library.js", "./js/reference-patterns.js", "./js/pattern-flat.js", "./js/fancy-patterns.js", "./js/validate.js",
  "./js/ai-keystore.js", "./js/capability-probe.js", "./js/ai-providers.js", "./js/schema-validate.js", "./js/ai-spec-pipeline.js", "./js/ai-fusion.js", "./js/image-providers.js", "./js/thumbnails.js", "./js/app.js",
  "./js/vendor/pattern-spec-validate.generated.js",
  "./js/cloth-workflow-contract.js", "./js/responsive-workspace.js",
  "./js/project-revisions.js", "./js/project-review.js",
  "./js/design-brief.js", "./js/design-brief-panel.js",
  "./js/image-studio.js", "./js/image-studio-panel.js",
  "./js/multimodal-proposal.js",
  "./js/pattern-program.js", "./js/skirt-configurator.js", "./js/pattern-program-panel.js",
  "./js/construction-acceptance.js",
  "./js/construction-packet.js",
  "./js/construction-evidence-record.js",
  "./schema/pattern-spec.v1.json",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  // Unique lookbook pattern photographs (each seen once)
  "./assets/thumbnails/abaya.jpg",
  "./assets/thumbnails/b01.jpg",
  "./assets/thumbnails/b02.jpg",
  "./assets/thumbnails/b03.jpg",
  "./assets/thumbnails/b04.jpg",
  "./assets/thumbnails/b05.jpg",
  "./assets/thumbnails/b06.jpg",
  "./assets/thumbnails/b07.jpg",
  "./assets/thumbnails/b08.jpg",
  "./assets/thumbnails/b09.jpg",
  "./assets/thumbnails/b10.jpg",
  "./assets/thumbnails/b11.jpg",
  "./assets/thumbnails/b12.jpg",
  "./assets/thumbnails/b13.jpg",
  "./assets/thumbnails/b14.jpg",
  "./assets/thumbnails/b15.jpg",
  "./assets/thumbnails/b16.jpg",
  "./assets/thumbnails/b17.jpg",
  "./assets/thumbnails/b18.jpg",
  "./assets/thumbnails/b19.jpg",
  "./assets/thumbnails/b20.jpg",
  "./assets/thumbnails/b21.jpg",
  "./assets/thumbnails/b22.jpg",
  "./assets/thumbnails/b23.jpg",
  "./assets/thumbnails/b24.jpg",
  "./assets/thumbnails/bf01.jpg",
  "./assets/thumbnails/bf02.jpg",
  "./assets/thumbnails/bf03.jpg",
  "./assets/thumbnails/bf04.jpg",
  "./assets/thumbnails/bf05.jpg",
  "./assets/thumbnails/bf06.jpg",
  "./assets/thumbnails/bf07.jpg",
  "./assets/thumbnails/bf08.jpg",
  "./assets/thumbnails/bf09.jpg",
  "./assets/thumbnails/boys_trousers.jpg",
  "./assets/thumbnails/bu01.jpg",
  "./assets/thumbnails/g01.jpg",
  "./assets/thumbnails/g02.jpg",
  "./assets/thumbnails/g03.jpg",
  "./assets/thumbnails/g04.jpg",
  "./assets/thumbnails/g05.jpg",
  "./assets/thumbnails/g06.jpg",
  "./assets/thumbnails/g07.jpg",
  "./assets/thumbnails/g08.jpg",
  "./assets/thumbnails/g09.jpg",
  "./assets/thumbnails/g10.jpg",
  "./assets/thumbnails/g11.jpg",
  "./assets/thumbnails/g12.jpg",
  "./assets/thumbnails/g13.jpg",
  "./assets/thumbnails/g14.jpg",
  "./assets/thumbnails/g15.jpg",
  "./assets/thumbnails/g16.jpg",
  "./assets/thumbnails/g17.jpg",
  "./assets/thumbnails/g18.jpg",
  "./assets/thumbnails/g19.jpg",
  "./assets/thumbnails/g20.jpg",
  "./assets/thumbnails/g21.jpg",
  "./assets/thumbnails/g22.jpg",
  "./assets/thumbnails/g23.jpg",
  "./assets/thumbnails/g24.jpg",
  "./assets/thumbnails/gf01.jpg",
  "./assets/thumbnails/gf02.jpg",
  "./assets/thumbnails/gf06.jpg",
  "./assets/thumbnails/girls_dress.jpg",
  "./assets/thumbnails/gu01.jpg",
  "./assets/thumbnails/gy001.jpg",
  "./assets/thumbnails/m01.jpg",
  "./assets/thumbnails/m02.jpg",
  "./assets/thumbnails/m03.jpg",
  "./assets/thumbnails/m04.jpg",
  "./assets/thumbnails/m05.jpg",
  "./assets/thumbnails/m06.jpg",
  "./assets/thumbnails/m07.jpg",
  "./assets/thumbnails/m08.jpg",
  "./assets/thumbnails/m09.jpg",
  "./assets/thumbnails/m10.jpg",
  "./assets/thumbnails/m11.jpg",
  "./assets/thumbnails/m12.jpg",
  "./assets/thumbnails/m13.jpg",
  "./assets/thumbnails/m14.jpg",
  "./assets/thumbnails/m15.jpg",
  "./assets/thumbnails/m16.jpg",
  "./assets/thumbnails/m17.jpg",
  "./assets/thumbnails/m18.jpg",
  "./assets/thumbnails/m19.jpg",
  "./assets/thumbnails/m20.jpg",
  "./assets/thumbnails/m21.jpg",
  "./assets/thumbnails/m22.jpg",
  "./assets/thumbnails/m23.jpg",
  "./assets/thumbnails/mens_shirt.jpg",
  "./assets/thumbnails/mf01.jpg",
  "./assets/thumbnails/mf02.jpg",
  "./assets/thumbnails/mf03.jpg",
  "./assets/thumbnails/mu01.jpg",
  "./assets/thumbnails/thobe.jpg",
  "./assets/thumbnails/w01.jpg",
  "./assets/thumbnails/w02.jpg",
  "./assets/thumbnails/w03.jpg",
  "./assets/thumbnails/w04.jpg",
  "./assets/thumbnails/w05.jpg",
  "./assets/thumbnails/w06.jpg",
  "./assets/thumbnails/w07.jpg",
  "./assets/thumbnails/w08.jpg",
  "./assets/thumbnails/w09.jpg",
  "./assets/thumbnails/w10.jpg",
  "./assets/thumbnails/w11.jpg",
  "./assets/thumbnails/w12.jpg",
  "./assets/thumbnails/w13.jpg",
  "./assets/thumbnails/w14.jpg",
  "./assets/thumbnails/w15.jpg",
  "./assets/thumbnails/w16.jpg",
  "./assets/thumbnails/w17.jpg",
  "./assets/thumbnails/w18.jpg",
  "./assets/thumbnails/w19.jpg",
  "./assets/thumbnails/w20.jpg",
  "./assets/thumbnails/w21.jpg",
  "./assets/thumbnails/w22.jpg",
  "./assets/thumbnails/w23.jpg",
  "./assets/thumbnails/wb01.jpg",
  "./assets/thumbnails/wf01.jpg",
  "./assets/thumbnails/wf06.jpg",
  "./assets/thumbnails/wf08.jpg",
  "./assets/thumbnails/wf09.jpg",
  "./assets/thumbnails/wf11.jpg",
  "./assets/thumbnails/wf12.jpg",
  "./assets/thumbnails/wf16.jpg",
  "./assets/thumbnails/womens_dress.jpg",
  "./assets/thumbnails/wu01.jpg",
];
// Deliberately NOT precached: js/workers/local-model-worker.js — it's only
// ever instantiated on demand (WP-2 Routes B/C), and its own dynamic import
// of the ML runtime must never be triggered by a service-worker precache.

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
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
