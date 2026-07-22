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
| Vector tools: Select, Pen, Line, **Arc (curved, 3-click)**, Freehand, **Filled Shape (closed polygon)**, Move, Measure | ✅ Working (draw & edit) |
| Transform tools: Rotate, Scale, Knife (split), Symmetry (mirror), Notch, Grainline | ✅ Fully working on real geometry |
| **Undo / Redo buttons** on the stage toolbar (above the canvas), synced with Layers & 3D | ✅ Working |
| Selection **control points + handles** (drag anchors, corner scale, rotate knob) | ✅ Fully working, with snap-to-point |
| Layers: **add / delete / rename (EN+AR)**, per-layer **properties** (colour, own fill opacity), **lock/unlock**, show/hide | ✅ Working (locked pieces are non-interactive) |
| **Text tool** — place formatted labels (size, bold, italic, colour), drag to move, double-click to edit; included in SVG export & project files | ✅ Working |
| **Help** — ? button with quick start, all tools explained, keyboard shortcuts (bilingual) | ✅ Working |
| **Fabric & material**: 8 material presets + adjustable fill transparency | ✅ Working (per-piece or all) |
| **Size & Grading engine** XXS→6XL, Intl/Egyptian/Saudi, Kids, Custom | ✅ Proportion-perfect, live |
| Category switcher (Women/Men/Girls/Boys) with matching avatar | ✅ Working |
| Real multi-piece patterns w/ bilingual names + explanations | ✅ 6 patterns (dress, shirt, abaya, thobe, girls' dress, boys' trousers) |
| **3D preview** — 4 distinct anatomical avatars (women/men/girl/boy), studio lighting + soft shadow, OrbitControls (orbit/zoom/pan, touch), auto-spin, walk cycle, live fabric material/colour/transparency, per-piece show/hide, size grading, loading state | ✅ Working (stylised character; drop-in GLB path for photoreal) |
| **Project menu**: New · Import (.json) · Export SVG/DXF · Save PDF · Save Project · Print | ✅ Working (real SVG, DXF, PDF & print) |
| Print & Export: A0–A4/Letter/Plotter, PDF/DXF/SVG/AI/PNG/JPEG/HPGL | ✅ SVG, DXF, PDF are native; PNG/JPEG/AI/HPGL fall back to vector |
| Fabric consumption + cost estimator + Tech Pack + BOM | ✅ Working |
| **Pattern Summary export** — one-page bilingual print sheet: size table, a labelled dimensioned diagram per piece, and a construction note (Export pane, Project menu, ⌘K) | ✅ Working |
| **Pattern Library — 100 pre-designed patterns, 25 per category** (Women/Men/Girls/Boys), category filter chips + search + "My Patterns" | ✅ Working — every entry is a real, gradable multi-piece garment |
| AI Pattern Generator — visible "thinking" stages, robust local image analysis (neckline/hem/flare/colour from a real photo, not just a clean product shot), a wider construction vocabulary (necklines, hem shapes, wrap closures), and a "Detected" attributes panel so you can see the image/prompt actually mattered | ✅ Working (offline heuristic; swap in an LLM endpoint to go fully generative) |
| Command palette (⌘/Ctrl-K), tooltips + global Hover-Help toggle | ✅ Working |
| Onboarding, toasts, high-contrast, reduce-motion, local-first storage | ✅ Working |
| PWA manifest + service worker (offline, installable) | ✅ Working |

### Honest notes
- **AI generator** (`js/ai.js`) segments the uploaded photo with a
  border-adaptive threshold + largest-contiguous-run-per-row scan (robust to
  background clutter, not just clean product shots on white), then reads
  neckline shape from an actual **neckline-gap detection** (a V/scoop neck
  shows as a break of skin/background between two shoulder lobes in a worn
  photo — a pointed silhouette edge doesn't, and treating it as one was the
  earlier bug), hem shape from the bottom profile, and colour from small
  patches at the torso/hem centroids rather than a global average. Construction
  vocabulary now includes neckline (V/round/boat/off-shoulder/halter/collar),
  hem shape (straight/curved/high-low/asymmetric) and wrap closures — so two
  different photos produce genuinely different pattern pieces, not just
  resized copies of the same template. Attributes left unspecified by both the
  prompt and the image are chosen by a deterministic hash of the input (same
  input → same result, but different prompts/images land on different
  choices) instead of always defaulting the same way. Generation runs through
  a visible multi-stage sequence (analysing → silhouette/hem → drafting) and
  ends with a "Detected" chip panel — Type, Length, Flare, Sleeve, Neckline,
  Hem, Colour — so you can see exactly what was read from your input. It's
  still a heuristic, not real computer vision, and will misread low-contrast
  or very busy photos; point `endpoint` (Settings → AI endpoint) at a
  Claude-vision proxy to replace it with true image understanding.
- **SVG, DXF and PDF** exports are native and CAD/print-ready (the PDF is a
  hand-built, valid PDF-1.4 with vector cutting lines). PNG/JPEG/AI/HPGL still
  fall back to the vector output — the natural next integration points.
- **Projects** round-trip losslessly via `Save Project (.json)` → `Import Project`.
- **3D avatars** are high-quality *procedural stylised* characters (not photoreal
  humans — that needs sculpted, rigged GLB models an in-browser script can't
  synthesise). For photorealism, open **Settings → 3D avatar models (GLB)** and
  paste a model URL per category (e.g. a Ready Player Me link ending in `.glb`) —
  no code needed. The loader auto-scales the model to the live measurements and
  falls back to the built-in body if the URL fails. Local files work too: drop
  them in the repo (e.g. `avatars/women.glb`) and paste that relative path.
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
│   ├── ai.js             Image/prompt → style params + parametric garment builder
│   ├── library.js        100-pattern catalog (25/category), built on ai.js's builder
│   └── app.js            Application controller (wires everything)
└── icons/                App icons (SVG + PNG 192/512)
```

## Extending

- **Add a hand-crafted pattern:** add a parametric entry to `PATTERNS` in
  `js/data.js` (each piece is a function of the measurement set) and list it
  in `LIBRARY`.
- **Add a library pattern:** add one `entry(id, category, nameEn, nameAr, style)`
  line to the matching catalog array in `js/library.js` — `style` is the same
  `{type, lengthF, flareF, fitF, sleeveLenF, sleeveWideF}` shape the AI
  generator uses, so geometry comes for free from `AIGen.build()`.
- **Add a language:** add a dictionary to `I18N` in `js/i18n.js`.
- **Tune grading:** edit `BASE`, `GRADE`, and `STANDARDS` in `js/data.js`.
