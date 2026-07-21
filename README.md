# BerryStudio · بيري ستوديو

A bilingual (Arabic + English), installable **Progressive Web App** for fashion
pattern **drafting, grading, 3D preview, and print/export**. No build step, no
framework runtime — pure HTML/CSS/JS so it opens and runs anywhere.

![theme: Egyptian / Saudi / International](https://img.shields.io/badge/themes-3%20%C3%97%20light%2Fdark-6d5efc)

---

## Run it

Because it registers a service worker, serve it over `http://` (not `file://`):

```bash
# from the repository root
python3 -m http.server 8791
# open http://localhost:8791
```

Then use the browser's **Install app** action (or the ⬇ button in the header) to
install it. After the first load it works **fully offline**.

---

## What's implemented

| Area | Status |
|------|--------|
| Bilingual EN/AR with one-click switch + **complete RTL** | ✅ Fully working |
| 3 themes (Egyptian · Saudi · International) × Light/Dark | ✅ Fully working |
| Pattern canvas: zoom/pan, grid, rulers (cm/inch), snap | ✅ Fully working |
| Seam allowance, notches, grainlines, darts, bilingual piece labels | ✅ Fully working |
| Vector tools: Select, Pen, Line, **Arc (curved, 3-click)**, Freehand, Move, Measure | ✅ Working (draw & edit) |
| Transform tools: Rotate, Scale, Knife (split), Symmetry (mirror), Notch, Grainline | ✅ Fully working on real geometry |
| Selection **control points + handles** (drag anchors, corner scale, rotate knob) | ✅ Fully working, with snap-to-point |
| Layers: per-piece **colour picker**, **lock/unlock**, show/hide | ✅ Working (locked pieces are non-interactive) |
| **Fabric & material**: 8 material presets + adjustable fill transparency | ✅ Working (per-piece or all) |
| **Size & Grading engine** XXS→6XL, Intl/Egyptian/Saudi, Kids, Custom | ✅ Proportion-perfect, live |
| Category switcher (Women/Men/Girls/Boys) with matching avatar | ✅ Working |
| Real multi-piece patterns w/ bilingual names + explanations | ✅ 6 patterns (dress, shirt, abaya, thobe, girls' dress, boys' trousers) |
| **3D preview** — 4 distinct anatomical avatars (women/men/girl/boy), studio lighting + soft shadow, OrbitControls (orbit/zoom/pan, touch), auto-spin, walk cycle, live fabric material/colour/transparency, per-piece show/hide, size grading, loading state | ✅ Working (stylised character; drop-in GLB path for photoreal) |
| **Project menu**: New · Import (.json) · Export SVG/DXF · Save PDF · Save Project · Print | ✅ Working (real SVG, DXF, PDF & print) |
| Print & Export: A0–A4/Letter/Plotter, PDF/DXF/SVG/AI/PNG/JPEG/HPGL | ✅ SVG, DXF, PDF are native; PNG/JPEG/AI/HPGL fall back to vector |
| Fabric consumption + cost estimator + Tech Pack + BOM | ✅ Working |
| Pattern Library w/ search + "My Patterns" | ✅ Working |
| AI Pattern Generator (text + image upload → multi-piece pattern) | ✅ Working (image picker + preview; offline keyword heuristic — swap in an LLM to go live) |
| Command palette (⌘/Ctrl-K), tooltips + global Hover-Help toggle | ✅ Working |
| Onboarding, toasts, high-contrast, reduce-motion, local-first storage | ✅ Working |
| PWA manifest + service worker (offline, installable) | ✅ Working |

### Honest notes
- **AI generator** accepts a text prompt and an inspiration image (real file
  picker + preview), then maps intent to a base block with a local offline
  heuristic. Point `runAI()` in `js/app.js` at a Claude API endpoint — and pass
  `aiImage` — to make it truly generative.
- **SVG, DXF and PDF** exports are native and CAD/print-ready (the PDF is a
  hand-built, valid PDF-1.4 with vector cutting lines). PNG/JPEG/AI/HPGL still
  fall back to the vector output — the natural next integration points.
- **Projects** round-trip losslessly via `Save Project (.json)` → `Import Project`.
- **3D avatars** are high-quality *procedural stylised* characters (not photoreal
  humans — that needs sculpted, rigged GLB models an in-browser script can't
  synthesise). For photorealism, drop `avatars/women.glb`, `men.glb`, `girl.glb`,
  `boy.glb` into the repo and call `View3D.setAvatarURL("women","avatars/women.glb")`
  (per category) — the loader scales them to the live measurements automatically.
- Three.js + OrbitControls load from a CDN (via an import map) on first visit,
  then are cached for offline use.

---

## Structure

```
BerryStudio/                (repository root)
├── index.html            App shell
├── manifest.webmanifest  PWA manifest
├── sw.js                 Service worker (offline-first)
├── css/styles.css        Design system: 3 themes × light/dark, full RTL
├── js/
│   ├── i18n.js           EN + Egyptian/Saudi Arabic dictionaries
│   ├── data.js           Measurement standards + grading engine + patterns
│   ├── canvas.js         2D drafting engine (Canvas 2D)
│   ├── three-view.js     3D parametric avatar (Three.js)
│   └── app.js            Application controller (wires everything)
└── icons/                App icons (SVG + PNG 192/512)
```

## Extending

- **Add a pattern:** add a parametric entry to `PATTERNS` in `js/data.js`
  (each piece is a function of the measurement set) and list it in `LIBRARY`.
- **Add a language:** add a dictionary to `I18N` in `js/i18n.js`.
- **Tune grading:** edit `BASE`, `GRADE`, and `STANDARDS` in `js/data.js`.
