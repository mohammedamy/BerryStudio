/* ============================================================
   BerryStudio — application controller.
   Wires i18n, themes, RTL, panels, grading, 3D, export, etc.
   ============================================================ */
import { I18N } from './i18n.js';
import { PATTERNS, LIBRARY, computeMeasurements, SIZES, SIZE_STEP, KIDS_AGES } from './data.js';
import { Canvas } from './canvas.js';
import { View3D } from './three-view.js';
import { AIGen } from './ai.js';
import { Billboard } from './billboard.js';
import './library.js'; // side-effect only — populates PATTERNS/LIBRARY, exports nothing
import './girls-leotards.js'; // side-effect only — adds the 100-pattern Girls' Gymnastics Leotards collection
import { FancyGen } from './fancy-patterns.js';
import { PatternValidator } from './validate.js';
import { AIProviders, AI_PROVIDER_IDS, getProvider, loadLocalModelFromFile, restoreLocalModelFromCache, runOnnxTestInference, loadSegmentationModel, runSegmentationOn } from './ai-providers.js';
import { getModelFileMeta, clearModelFile } from './workers/model-file-cache.js';
import { KeyStore } from './ai-keystore.js';
import { probeCapabilities } from './capability-probe.js';
import { generateFromSpec, provenanceMapFromSpec } from './ai-spec-pipeline.js';
import { fuseStyle, mergeProvenance } from './ai-fusion.js';
import { ImageProviders, IMAGE_PROVIDER_IDS } from './image-providers.js';
import { MEAS_KEYS, renderMeasureFields } from './measure-form.js';
import { consumeBodyFormHandoff } from './body-handoff.js';
import { nest as nestTruePolygon, cancelNest } from './nesting.js';
import { stepForSize, resolveGradedPieces } from './grading.js';
import { pivotDart, slashAndSpread, transferDart } from './darts.js';
import { seamPointAtFraction } from './geometry.js';
import { SelfHostedSync, GoogleDriveSync, OneDriveSync } from './cloud-sync.js';

(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

  // ---------------- persisted state ----------------
  const DEF = {
    lang: "en", theme: "intl", mode: "light",
    category: "women", size: "M", standard: "intl",
    kids: null, custom: {}, unitsCm: true,
    hoverHelp: true, highContrast: false, reduceMotion: false, cloudSync: false,
    onboarded: false, mine: [], aiEndpoint: "", aiImageEndpoint: "", fabric3d: "cotton", showMeasDiagram: false,
    // BerryStudio-Upgrade-Plan WP-1: provider layer config. Non-secret only —
    // API keys never live here, see js/ai-keystore.js. aiProviderCfg/
    // aiImageProviderCfg are keyed by provider id: { baseUrl?, model?, visionModel? }.
    aiProvider: "proxy", aiProviderCfg: null, aiKeyPersist: false,
    aiImageProvider: "proxy", aiImageProviderCfg: null,
    lastMarkerYards: null, lastMarkerWidth: null,
    builderKind: null,
    // WP-20: waistTech/sleeveTech pick a real technique (pleat/gather/tuck),
    // not just an intensity — waistIntensity/sleeveIntensity (light/full)
    // apply to whichever technique is selected. "none" on either keeps
    // AIGen.build()'s output byte-identical to before this option existed.
    builderOpts: { length:"medium", flare:"regular", fit:"regular", sleeve:"short", waistTech:"none", waistIntensity:"light", sleeveTech:"none", sleeveIntensity:"light" }, builderCustom: {},
    // Guided Prompt Builder (AI pane): structured fields that assemble into
    // a precise, unambiguous free-text prompt instead of asking the user to
    // write one from scratch — the concrete fix for "the AI prompt is too
    // vague to draft anything specific from". "any" means "let the AI/local
    // heuristic decide" (the field is simply omitted from the built
    // sentence) — everything defaults to "any" except garment type, which
    // needs some starting value; a user who touches nothing gets exactly
    // today's plain-text-prompt behaviour.
    aiGuided: { type:"dress", fit:"any", flare:"any", length:"any", neckline:"any", sleeve:"any", hem:"any", closure:"none", notes:"" },
    avatarGLB: { women: "", men: "", girls: "", boys: "" },
    // BerryStudio-Upgrade-Plan WP-5: "iframe" (cross-document, the original
    // engine) or "embedded" (cloth-lab's lib build mounted directly into
    // this page, sharing React/three.js via the import map — see
    // setView()'s clothlab branch and mountClothLabEmbedded() below). As of
    // WP-36 (v2.0), "embedded" is the default for new installs — newer and
    // measurably faster (no cross-document postMessage bridge), gated on
    // the dedicated e2e coverage below passing and no regression in the
    // blank-canvas bug class the Honest notes describe fighting twice.
    // `state = Object.assign({}, DEF, savedRaw)` means this only changes
    // behavior for a `savedRaw` with no `clothLabEngine` key at all — an
    // existing user's browser already has this key baked into its saved
    // "pps" blob from any previous save() call, so their choice (explicit
    // or not) is unconditionally preserved. "iframe" remains fully
    // selectable and functional as a fallback via Settings.
    clothLabEngine: "embedded",
    // WP-13: industrial per-point grading. Keyed by pattern id -> piece
    // key -> outline-index -> {dx,dy} (cm per size step). Purely additive
    // — a pattern with no authored rules here grades exactly as before.
    gradeRules: {}, gradeRulesPiece: null,
    // WP-18: optional cloud sync. `cloudSync` itself predates this pass (a
    // dormant Settings toggle with no behaviour behind it) — these three
    // fields are new. Endpoint URL and OAuth client IDs are not secrets
    // (client IDs are public identifiers by design) so they live in normal
    // state; the self-hosted endpoint's bearer token and Drive/OneDrive
    // access tokens never do — see js/cloud-sync.js.
    syncTarget: "endpoint", syncEndpointUrl: "", syncGoogleClientId: "", syncMicrosoftClientId: "",
    costCurrency: "USD",
  };
  const savedRaw = JSON.parse(localStorage.getItem("pps") || "{}");
  const state = Object.assign({}, DEF, savedRaw);
  // WP-17: honour the OS-level reduced-motion preference by default, but only
  // on a first-ever visit — once a user has explicitly set the in-app toggle
  // (savedRaw already has the key), that explicit choice always wins.
  if (!("reduceMotion" in savedRaw) && typeof matchMedia === "function") {
    try { state.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* matchMedia unavailable */ }
  }
  const save = () => localStorage.setItem("pps", JSON.stringify(state));
  const T = k => (I18N[state.lang][k] ?? I18N.en[k] ?? k);
  const L = o => (o ? (o[state.lang] ?? o.en) : "");

  const PALETTE = ["#6d5efc", "#00c2a8", "#ff5d8f", "#e2a52b", "#4c8dff", "#c1492e"];
  // Cost estimator currency: fixed approximate rates, not a live FX feed —
  // SAR is an accurate long-standing peg (3.75), EGP floats and is a rough
  // approximation flagged to the user in the UI rather than presented as exact.
  const CURRENCIES = {
    USD: { symbol: "$", rate: 1, label: "USD" },
    SAR: { symbol: "ر.س", rate: 3.75, label: "SAR" },
    EGP: { symbol: "ج.م", rate: 49, label: "EGP" },
  };
  // Bundled avatar GLBs (repo-relative, per README's own "drop them in the
  // repo e.g. avatars/women.glb" convention) — static, unrigged single-mesh
  // exports. Fine for 3D Preview (js/three-view.js just loads+scales, no
  // skeleton needed); in 3D Cloth Lab, pose variants won't animate them
  // since there's no skeleton to rotate — they'll still display, just
  // static, exactly as an unposed/A-pose model would. Labels are EN/AR
  // i18n keys (avatarModel_<id>), not raw strings, to stay bilingual.
  const BUNDLED_AVATARS = {
    men: [
      { id: "man", file: "avatars/man.glb" },
      { id: "fatman", file: "avatars/fatman.glb" },
    ],
    women: [
      { id: "woman2", file: "avatars/woman2.glb" },
    ],
    boys: [
      { id: "boy", file: "avatars/boy.glb" },
      { id: "boy2", file: "avatars/boy2.glb" },
    ],
    girls: [
      { id: "girl", file: "avatars/girl.glb" },
      { id: "girl2", file: "avatars/girl2.glb" },
      { id: "girl3", file: "avatars/girl3.glb" },
    ],
  };
  let aiImage = null;   // data-URL of the uploaded AI inspiration image
  // AI Fashion Billboard — up to 2 source clothing photos, the generated
  // editorial "billboard" photo, and the pattern-drawing image derived from it
  let bbImages = [null, null];
  let bbBillboard = null;
  let bbPattern = null;
  // 3D Cloth Lab bridge — whether the iframe's own message listener has
  // confirmed it's mounted (see wire()'s "clothlab:ready" handler), and a
  // hash of the last payload actually sent, so revisiting the tab with an
  // unchanged pattern doesn't force a jarring cloth-sim restart for nothing.
  let clothLabReady = false;
  let lastClothLabPayloadJSON = null;

  // ---------------- ICONS (inline SVG) ----------------
  const IC = {
    logo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l4-3 5 4 5-4 4 3-3 5v10H6V11z"/></svg>',
    select:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l7 17 2-7 7-2z"/></svg>',
    pen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18"/><path d="M2 2l7.5 7.5"/></svg>',
    line:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/></svg>',
    arc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 19a15 15 0 0 1 16-14"/></svg>',
    free:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3 1 4-4 7-4s3 4 6 2 4-6 5-6"/></svg>',
    symmetry:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18"/><path d="M8 7l-4 5 4 5"/><path d="M16 7l4 5-4 5"/></svg>',
    knife:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l7-7"/><path d="M14 4l6 6-4 1-3-3z"/></svg>',
    move:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/></svg>',
    rotate:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
    scale:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7"/><path d="M3 3l7 7"/><rect x="10" y="10" width="11" height="11" rx="1"/></svg>',
    measure:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16L16 2l6 6L8 22z"/><path d="M7 11l2 2M11 7l2 2M15 11l2 2"/></svg>',
    seam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1" stroke-dasharray="2 2"/></svg>',
    notch:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l4 8H8z"/><path d="M4 21h16"/></svg>',
    addpoint:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18L18 6"/><circle cx="11" cy="12" r="3.4"/><path d="M11 10.2v3.6M9.2 12h3.6"/></svg>',
    grain:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M8 6l4-3 4 3M8 18l4 3 4-3"/></svg>',
    undo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>',
    redo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/></svg>',
    grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>',
    magnet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 3h4v4H6zM14 3h4v4h-4z"/></svg>',
    cube:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M3 7l9 5 9-5"/></svg>',
    cloudUp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1-1-7.9A5 5 0 0 1 16 8a4.5 4.5 0 0 1 1 8.9"/><path d="M12 21v-7M9 17l3-3 3 3"/></svg>',
    cloudDown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1-1-7.9A5 5 0 0 1 16 8a4.5 4.5 0 0 1 1 8.9"/><path d="M12 13v7M9 17l3 3 3-3"/></svg>',
    layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2l10 6-10 6L2 8z"/><path d="M2 12l10 6 10-6M2 16l10 6 10-6"/></svg>',
    cmd:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/></svg>',
    palette:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-1 1-2s0-2 1-2h2a4 4 0 0 0 4-4c0-5-4-8-8-8z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="11" r="1"/></svg>',
    globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>',
    moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
    gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.6.1-1z"/></svg>',
    download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
    newdoc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/></svg>',
    importf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><path d="M12 3v12M8 11l4 4 4-4"/></svg>',
    pdf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h1a1 1 0 0 1 0 2h-1zM8.5 13v4"/></svg>',
    printer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="13" width="12" height="8" rx="1"/></svg>',
    image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></svg>',
    folder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    unlock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
    drop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
    text:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7V5h14v2M12 5v14M9 19h6"/></svg>',
    polyfill:'<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><path d="M12 2l8 6-3 10H7L4 8z" fill-opacity="0.28"/></svg>',
    trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    dots:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    question:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.8 2.8 0 1 1 4.3 2.4c-.9.6-1.5 1.1-1.5 2.1"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>',
    ruler:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18"/></svg>',
    spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18 9l-4.2 1.3L12 15l-1.8-4.7L6 9l4.2-1.3z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
    eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeoff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 4.2A10 10 0 0 1 12 4c6 0 10 8 10 8a18 18 0 0 1-3 3.9M6.6 6.6A18 18 0 0 0 2 12s4 8 10 8a10 10 0 0 0 3-.5"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>',
    shirt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M8 2l4 3 4-3 5 4-3 4v11H6V10L3 6z"/></svg>',
    dress:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M9 2l3 3 3-3 2 5-3 3 4 12H6l4-12-3-3z"/></svg>',
    skirtIcon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M9 3h6l1 4h-8z"/><path d="M8 7h8l3 13H5z"/></svg>',
    trousersIcon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M7 2h10l1 8-1 2 1 10h-4l-1-11-1 11H8L9 12l-1-2z"/></svg>',
    point:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg>',
    conline:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 18L18 6"/><circle cx="6" cy="18" r="2.2" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="2.2" fill="currentColor" stroke="none"/></svg>',
    conarc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19a15 15 0 0 1 15-15"/><circle cx="5" cy="19" r="2.1" fill="currentColor" stroke="none"/><circle cx="20" cy="4" r="2.1" fill="currentColor" stroke="none"/></svg>',
    circleTool:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
    promote:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 9l4-4 8 1 4 6-2 9H7z" stroke-dasharray="2.5 2"/><path d="M8.5 12.5l2.2 2.2 4.8-4.8"/></svg>',
    calib:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 12h16M4 12v-3M20 12v-3M9 12v-3M15 12v-3"/></svg>',
    lasso:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3C7 3 3 6.5 3 11c0 3 2.5 5 6 5 1.8 0 3-1 3-2.3S10.8 12 9.5 12" stroke-dasharray="2.4 2.2"/><circle cx="17" cy="15" r="3.4"/></svg>',
    curve:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 18C4 10 20 14 20 6"/><path d="M4 18l4.5-4.5M20 6l-4.5 4.5" stroke-dasharray="1.6 1.6"/><circle cx="4" cy="18" r="1.7" fill="currentColor" stroke="none"/><circle cx="20" cy="6" r="1.7" fill="currentColor" stroke="none"/></svg>',
  };

  // Library thumbnails: real, full-colour illustrations (not currentColor-themed
  // like IC above) so every garment TYPE reads distinctly at a glance in the grid.
  // No <defs>/gradients — many copies of the same SVG string land in the DOM at
  // once and duplicate ids would collide, so depth comes from flat layered fills.
  const LIB_ICONS = {
    shirt:'<svg viewBox="0 0 24 24"><path d="M8 2l4 3 4-3 5 4-3 4v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V10L3 6z" fill="#4d7fc4"/><path d="M8 2l1.6 3.6L12 8l2.4-2.4L16 2l-1 2.2-3 2.4-3-2.4z" fill="#eef3fb"/><circle cx="12" cy="10" r=".7" fill="#254170"/><circle cx="12" cy="13.4" r=".7" fill="#254170"/><circle cx="12" cy="16.8" r=".7" fill="#254170"/></svg>',
    top:'<svg viewBox="0 0 24 24"><path d="M8.4 3l3.6 2.4L15.6 3l4.4 3.6-2.6 3-1 12.4H7.6l-1-12.4-2.6-3z" fill="#3f9b8c"/><path d="M8.4 3l3.6 2.4L15.6 3l1 1.6-4.6 3.4-4.6-3.4z" fill="#d9f0ec"/></svg>',
    dress:'<svg viewBox="0 0 24 24"><path d="M9 2l3 3 3-3 2 5-3 3 4 12H7l4-12-3-3z" fill="#ea6f93"/><path d="M9 2l3 3 3-3 1 2.4-4 3.6-4-3.6z" fill="#fbdce6"/><path d="M8.6 13h6.8" stroke="#c1436a" stroke-width="1.1" stroke-linecap="round"/></svg>',
    gown:'<svg viewBox="0 0 24 24"><path d="M9 2l3 2.6 3-2.6 2 4.6-2.6 2.6 5 13.8H6.6l5-13.8L9 6.6z" fill="#7a4aa8"/><path d="M9 2l3 2.6 3-2.6 1 2.4-4 3.4-4-3.4z" fill="#e7d6f5"/><path d="M8 15.4h8" stroke="#d8b23e" stroke-width="1.1"/><path d="M12 15.4v9" stroke="#5e3583" stroke-width=".8" stroke-dasharray="1.4 1.4"/></svg>',
    robe:'<svg viewBox="0 0 24 24"><path d="M9 2h6l1.6 3-2.6 2 1 15H8l1-15-2.6-2z" fill="#cf9a3e"/><path d="M9 2h6l.8 1.6H8.2z" fill="#f2ddb0"/><path d="M6 8l2-3M18 8l-2-3" stroke="#b07f2e" stroke-width="1.2" stroke-linecap="round" fill="none"/><path d="M12 6v16" stroke="#a9781f" stroke-width=".8"/></svg>',
    jacket:'<svg viewBox="0 0 24 24"><path d="M9 2L6 4 4 8l2 2v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10l2-2-2-4-3-2-3 2.6z" fill="#2e3d5c"/><path d="M9 2l3 2.6L15 2l1.4 1-4.4 6-4.4-6z" fill="#4a5d82"/><circle cx="10.6" cy="14" r=".6" fill="#d9b54c"/><circle cx="10.6" cy="17" r=".6" fill="#d9b54c"/></svg>',
    coat:'<svg viewBox="0 0 24 24"><path d="M9 2L6 4 4 8l2 2v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10l2-2-2-4-3-2-3 2.6z" fill="#a9662f"/><path d="M9 2l3 2.6L15 2l1.4 1-4.4 6-4.4-6z" fill="#c98a4c"/><path d="M6 15h12" stroke="#7a4c22" stroke-width="1.2"/><circle cx="10" cy="12" r=".55" fill="#5c3a1e"/><circle cx="14" cy="12" r=".55" fill="#5c3a1e"/><circle cx="10" cy="19" r=".55" fill="#5c3a1e"/><circle cx="14" cy="19" r=".55" fill="#5c3a1e"/></svg>',
    suit:'<svg viewBox="0 0 24 24"><path d="M9 2L6 4 4 8l2 2v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10l2-2-2-4-3-2-3 2.6z" fill="#3c3f46"/><path d="M9 2l1.6 2.4L9.4 20H8V10L6 8l1-3z" fill="#f2f2f2"/><path d="M15 2l-1.6 2.4L14.6 20H16V10l2-2-1-3z" fill="#f2f2f2"/><path d="M11 4.6l1 2 1-2-1-1.6z" fill="#7c2432"/><path d="M11.4 6.2h1.2l-.4 6-.4 0z" fill="#7c2432"/></svg>',
    trousers:'<svg viewBox="0 0 24 24"><path d="M6 2h12l.6 8-1 2 .8 12h-4l-1-11-1 11H8l.8-12-1-2z" fill="#3c5f95"/><path d="M6 2h12l.3 3.6H5.7z" fill="#294570"/><path d="M12 4v6" stroke="#294570" stroke-width="1"/></svg>',
    skirt:'<svg viewBox="0 0 24 24"><path d="M9 3h6l1 4h-8z" fill="#3c5f95"/><path d="M8 7h8l3 13H5z" fill="#e8a33e"/><path d="M12 7v13" stroke="#c1811f" stroke-width=".8" stroke-dasharray="1.4 1.4"/></svg>',
    leotard:'<svg viewBox="0 0 24 24"><path d="M9 2l3 2 3-2 2 4-2 2v6l2 8h-4l-1-7-1 7H7l2-8V8L7 6z" fill="#b23e78"/><path d="M9 2l3 2 3-2 .8 1.8L12 6.4 8.2 3.8z" fill="#f6d4e3"/><path d="M8.6 12.4h6.8" stroke="#7c2a54" stroke-width="1" stroke-linecap="round"/></svg>',
  };

  // ---------------- TOOLS ----------------
  const TOOLS = [
    { id:"select", i:"select" }, { id:"lasso", i:"lasso" }, { id:"pen", i:"pen" }, { id:"line", i:"line" },
    { id:"arc", i:"arc" }, { id:"free", i:"free" }, { id:"polygon", i:"polyfill" }, { id:"symmetry", i:"symmetry" },
    { id:"knife", i:"knife" }, "sep",
    { id:"point", i:"point" }, { id:"conline", i:"conline" }, { id:"conarc", i:"conarc" },
    { id:"circle", i:"circleTool" }, { id:"promote", i:"promote" }, "sep",
    { id:"move", i:"move" }, { id:"rotate", i:"rotate" },
    { id:"scale", i:"scale" }, { id:"measure", i:"measure" }, { id:"text", i:"text" }, "sep",
    { id:"seam", i:"seam", toggle:"seam" }, { id:"notch", i:"notch" }, { id:"addpoint", i:"addpoint" }, { id:"curve", i:"curve" }, { id:"grain", i:"grain" },
  ];

  // ================= RENDER SHELL =================
  function buildToolRail() {
    const rail = $("#toolrail"); rail.innerHTML = "";
    TOOLS.forEach(tl => {
      if (tl === "sep") { rail.appendChild(el("div","tool-sep")); return; }
      const b = el("button", "tool", IC[tl.i]);
      b.dataset.tool = tl.id;
      tip(b, T("t_"+tl.id), T("tt_"+tl.id));
      b.onclick = () => {
        if (tl.toggle) { const v = !Canvas.getOpt(tl.toggle); Canvas.setOpt(tl.toggle, v); b.classList.toggle("active", v); toast(T("t_"+tl.id)); return; }
        setTool(tl.id);
      };
      if (tl.id === state.tool) b.classList.add("active");
      if (tl.toggle && Canvas.getOpt(tl.toggle)) b.classList.add("active");
      rail.appendChild(b);
    });
  }
  function setTool(id) {
    state.tool = id; Canvas.setTool(id);
    $$("#toolrail .tool").forEach(b => b.classList.toggle("active", b.dataset.tool === id && !TOOLS.find(t=>t!=="sep"&&t.id===b.dataset.tool)?.toggle));
    toast(T("t_"+id));
  }

  // ---- right rail panes ----
  // Rail panes in a task-flow order: get a base → fit it → edit → output.
  const PANES = ["library","ai","builder","size","measure","layers","export"];
  const PANE_ICON = { size:IC.scale, measure:IC.measure, layers:IC.layers, library:IC.shirt, ai:IC.spark, builder:IC.ruler, export:IC.download };
  function buildRail() {
    const tabs = $("#railTabs"); tabs.innerHTML = "";
    PANES.forEach(p => {
      const b = el("button", state.pane===p?"active":"", `${PANE_ICON[p]||""}<span>${T("tab_"+p)}</span>`);
      b.dataset.pane = p; b.onclick = () => showPane(p);
      tabs.appendChild(b);
    });
    renderSizePane(); renderMeasurePane(); renderLayersPane(); renderLibraryPane(); renderAIPane(); renderBuilderPane(); renderExportPane();
    showPane(state.pane || "size");
  }
  function showPane(p) {
    state.pane = p;
    $$("#railTabs button").forEach(b => b.classList.toggle("active", b.dataset.pane === p));
    $$(".rail-pane").forEach(x => x.classList.toggle("active", x.dataset.pane === p));
    $("#rightRail").classList.remove("collapsed");
  }

  // SIZE PANE
  function renderSizePane() {
    const c = $(".rail-pane[data-pane=size]"); c.innerHTML = "";
    c.appendChild(el("div","section-title",IC.ruler+T("sizeGrading")));
    // standard select
    const f1 = el("div","field",`<label>${T("standard")}</label>`);
    const sel = el("select","select");
    [["intl",T("std_intl")],["egypt",T("std_egypt")],["saudi",T("std_saudi")]].forEach(([v,n])=>{const o=el("option",null,n);o.value=v;if(state.standard===v)o.selected=true;sel.appendChild(o);});
    sel.onchange=()=>{state.standard=sel.value;grade();}; f1.appendChild(sel); c.appendChild(f1);
    // size grid
    c.appendChild(el("div","section-title",null)).textContent=T("sizeRange");
    const grid = el("div","size-grid");
    SIZES.forEach(s=>{const b=el("button","size-btn"+(state.size===s&&!state.kids?" active":""),s);b.onclick=()=>{state.size=s;state.kids=null;grade();renderSizePane();};grid.appendChild(b);});
    c.appendChild(grid);
    // kids
    c.appendChild(el("div","section-title",null)).textContent=T("kidsMode");
    const kg = el("div","size-grid");
    KIDS_AGES.forEach(a=>{const b=el("button","size-btn"+(state.kids===a.id?" active":""),L(a.label));b.onclick=()=>{state.kids=state.kids===a.id?null:a.id;grade();renderSizePane();};kg.appendChild(b);});
    c.appendChild(kg);
    // auto grade
    const bg = el("button","big-btn",IC.spark+T("autoGrade")); bg.style.marginTop="16px"; bg.onclick=()=>{grade();toast(T("graded")+" · "+(state.kids?L(KIDS_AGES.find(a=>a.id===state.kids).label):state.size));}; c.appendChild(bg);
    c.appendChild(el("div","help-note",`${T("gradedTo")}: <b id="gradeLbl"></b>`)).style.marginTop="12px";
    updateGradeLbl();
    renderGradeRulesSection(c);
  }
  function updateGradeLbl(){ const l=$("#gradeLbl"); if(l) l.textContent = state.kids ? L(KIDS_AGES.find(a=>a.id===state.kids).label) : state.size; }

  // WP-13: industrial per-point grading — an optional override table on
  // top of the uniform formula grade above. See js/grading.js for the
  // resolution rule (base-at-M + dx/dy*step for a ruled point, formula
  // otherwise). Scoped to the currently loaded pattern's pieces; kids
  // mode has no step to grade against, so the section hides there.
  function renderGradeRulesSection(c){
    if(!state.loaded || state.kids) return;
    const pieces = Canvas.getPieces(); if(!pieces.length) return;
    const patternId = state.loaded, pattern = PATTERNS[patternId];
    c.appendChild(el("div","section-title",IC.layers+T("gradeRulesTitle")));
    c.appendChild(el("div","help-note",T("gradeRulesHint")));

    const selKey = pieces.some(p=>p.key===state.gradeRulesPiece) ? state.gradeRulesPiece : pieces[0].key;
    state.gradeRulesPiece = selKey;
    const pf = el("div","field"); pf.style.marginTop="10px"; pf.innerHTML=`<label>${T("gradeRulesPiece")}</label>`;
    const pSel = el("select","select");
    pieces.forEach(p=>{ const o=el("option",null,L(p.name)); o.value=p.key; if(p.key===selKey) o.selected=true; pSel.appendChild(o); });
    pSel.onchange=()=>{ state.gradeRulesPiece=pSel.value; save(); renderSizePane(); };
    pf.appendChild(pSel); c.appendChild(pf);

    const baseOpts = {category:state.category,size:"M",standard:state.standard,kids:null,custom:state.custom};
    const basePiece = pattern.pieces(computeMeasurements(baseOpts)).find(p=>p.key===selKey);
    if(!basePiece) return;
    const rulesForPattern = state.gradeRules[patternId] || {};
    const rulesForPiece = rulesForPattern[selKey] || {};

    const head = el("div","row"); head.style.cssText="display:flex;gap:6px;padding:4px 0;font-size:11px;font-weight:700;color:var(--ink-2)";
    head.appendChild(el("span",null,"#")).style.flex="0 0 30%";
    head.appendChild(el("span",null,T("gradeRulesDx"))).style.flex="1";
    head.appendChild(el("span",null,T("gradeRulesDy"))).style.flex="1";
    c.appendChild(head);

    const table = el("div"); table.style.cssText="max-height:240px;overflow:auto";
    basePiece.outline.forEach((pt,i)=>{
      const r = rulesForPiece[i] || {};
      const row = el("div","row"); row.style.cssText="display:flex;gap:6px;align-items:center;padding:5px 0;border-bottom:1px solid var(--line-2)";
      const lbl = el("span",null,`${i} <small style="color:var(--ink-2)">(${pt[0].toFixed(1)},${pt[1].toFixed(1)})</small>`);
      lbl.style.cssText="flex:0 0 30%;font-size:11.5px"; lbl.innerHTML=`${i} <small style="color:var(--ink-2)">(${pt[0].toFixed(1)},${pt[1].toFixed(1)})</small>`;
      const dxI = el("input","input"); dxI.type="number"; dxI.step="0.1"; dxI.value=r.dx||0; dxI.style.flex="1";
      const dyI = el("input","input"); dyI.type="number"; dyI.step="0.1"; dyI.value=r.dy||0; dyI.style.flex="1";
      const commit=()=>{
        const dx=+dxI.value||0, dy=+dyI.value||0;
        if(!state.gradeRules[patternId]) state.gradeRules[patternId]={};
        if(!state.gradeRules[patternId][selKey]) state.gradeRules[patternId][selKey]={};
        if(dx===0 && dy===0) delete state.gradeRules[patternId][selKey][i];
        else state.gradeRules[patternId][selKey][i]={dx,dy};
        if(!Object.keys(state.gradeRules[patternId][selKey]).length) delete state.gradeRules[patternId][selKey];
        grade();
      };
      dxI.onchange=commit; dyI.onchange=commit;
      row.appendChild(lbl); row.appendChild(dxI); row.appendChild(dyI);
      table.appendChild(row);
    });
    c.appendChild(table);

    const nestBtn = el("button","big-btn ghost",IC.layers+T("gradeNestPreview")); nestBtn.style.marginTop="10px";
    nestBtn.onclick=()=>openGradeNestModal(selKey);
    c.appendChild(nestBtn);

    const expBtn = el("button","big-btn ghost",T("gradeRulesExport")); expBtn.style.marginTop="8px";
    expBtn.onclick=()=>download(`berrystudio-grade-rules-${patternId}.json`,"application/json",JSON.stringify(state.gradeRules[patternId]||{},null,2));
    c.appendChild(expBtn);
    const impInput = el("input"); impInput.type="file"; impInput.accept="application/json"; impInput.style.display="none";
    impInput.onchange=()=>{
      const f=impInput.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=()=>{
        try{ state.gradeRules[patternId]=JSON.parse(r.result); grade(); renderSizePane(); toast(T("gradeRulesImported")); }
        catch(e){ toast(T("invalidFormula")); }
      };
      r.readAsText(f);
    };
    const impBtn = el("button","big-btn ghost",T("gradeRulesImport")); impBtn.style.marginTop="8px"; impBtn.onclick=()=>impInput.click();
    c.appendChild(impBtn); c.appendChild(impInput);
  }

  // Overlay `sizesToShow` outlines of one piece at a shared alignment
  // point (outline[0]) with a distinct color per size — the standard
  // "grade nest" visual every patternmaker expects, letting authored
  // gradeRules be checked visually for a plausible size progression.
  function drawGradeNest(canvas, outlinesBySize){
    const ctx = canvas.getContext("2d"); const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    const aligned = outlinesBySize.map(({size,outline})=>{
      if(!outline || !outline.length) return {size, outline:[]};
      const [ax,ay]=outline[0];
      return {size, outline: outline.map(([x,y])=>[x-ax,y-ay])};
    });
    const allPts = aligned.flatMap(a=>a.outline);
    if(!allPts.length) return;
    const xs=allPts.map(p=>p[0]), ys=allPts.map(p=>p[1]);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const w=Math.max(maxX-minX,1), h=Math.max(maxY-minY,1);
    const scale = Math.min((W-40)/w, (H-40)/h);
    ctx.save(); ctx.translate(20-minX*scale, 20-minY*scale);
    aligned.forEach((a,i)=>{
      if(!a.outline.length) return;
      const c = PALETTE[i%PALETTE.length];
      ctx.strokeStyle=c; ctx.fillStyle=c+"1f"; ctx.lineWidth=1.6;
      ctx.beginPath();
      a.outline.forEach(([x,y],j)=>{ const px=x*scale, py=y*scale; j===0?ctx.moveTo(px,py):ctx.lineTo(px,py); });
      ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    ctx.restore();
    ctx.font="11px Inter, sans-serif"; ctx.textBaseline="top";
    aligned.forEach((a,i)=>{
      const c = PALETTE[i%PALETTE.length];
      ctx.fillStyle=c; ctx.fillRect(10, 10+i*16, 10,10);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--ink").trim()||"#1a1a1a";
      ctx.fillText(a.size, 24, 9+i*16);
    });
  }
  function openGradeNestModal(pieceKey){
    if(!state.loaded) return;
    const pattern = PATTERNS[state.loaded];
    const sizesToShow = ["S","M","L","XL"];
    const opts = {category:state.category,standard:state.standard,kids:null,custom:state.custom};
    const outlinesBySize = sizesToShow.map(size=>{
      const ps = resolveGradedPieces(pattern, {...opts,size}, computeMeasurements, state.gradeRules[state.loaded]);
      const piece = ps.find(p=>p.key===pieceKey);
      return {size, outline: piece ? piece.outline : []};
    });
    openModal(T("gradeNestTitle"), "", true);
    const body = $("#genericModal .modal-body"); body.innerHTML="";
    body.appendChild(el("div","help-note",T("gradeNestHint")));
    const canvas = el("canvas"); canvas.width=560; canvas.height=420;
    canvas.style.cssText="width:100%;height:auto;margin-top:12px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2)";
    body.appendChild(canvas);
    drawGradeNest(canvas, outlinesBySize);
  }

  // MEASURE PANE — the numeric fields + reference diagram themselves live in
  // js/measure-form.js (shared with the standalone BodyForm page, WP-10).
  function renderMeasurePane() {
    const c = $(".rail-pane[data-pane=measure]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.measure+T("customMeas")));
    c.appendChild(el("div","help-note",T("liveUpdate")));

    const fieldsWrap = el("div"); c.appendChild(fieldsWrap);
    renderMeasureFields(fieldsWrap, {
      measurements: currentMeas(), T, icon: IC.measure,
      showDiagram: state.showMeasDiagram,
      onToggleDiagram: (v)=>{ state.showMeasDiagram=v; save(); },
      onFieldChange: (k,v)=>{ state.custom[k]=v; grade(); },
    });

    const b=el("button","big-btn",IC.check+T("applyMeas")); b.style.marginTop="14px"; b.onclick=()=>{grade();toast(T("graded"));}; c.appendChild(b);
    const r=el("button","big-btn ghost",T("cancel")); r.style.marginTop="8px"; r.onclick=()=>{state.custom={};grade();renderMeasurePane();}; c.appendChild(r);

    // Custom Variables — named formulas usable in any construction point's X/Y.
    c.appendChild(el("div","section-title",IC.measure+T("varsTitle")));
    c.appendChild(el("div","help-note",T("varsHint")));
    const vbox = el("div"); vbox.style.marginTop="10px";
    const vars = Canvas.getVariables();
    const names = Object.keys(vars);
    if (!names.length) vbox.appendChild(el("div","help-note",T("varsNone")));
    names.forEach(name=>{
      const row = el("div","row",`<label style="flex:0 0 34%;font-size:12.5px;font-weight:600">${escAttr(name)}</label>`);
      row.style.cssText="display:flex;gap:6px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line-2)";
      const inp = el("input","input"); inp.type="text"; inp.value=vars[name]; inp.style.flex="1";
      inp.onchange=()=>{ try{ Canvas.setVariable(name, inp.value.trim()); } catch(e){ toast(T("invalidFormula")); inp.value=vars[name]; } };
      const del = el("button","tbtn",IC.trash); del.style.cssText="width:30px;height:30px;flex:0 0 auto";
      del.onclick=()=>{ Canvas.removeVariable(name); renderMeasurePane(); };
      row.appendChild(inp); row.appendChild(del); vbox.appendChild(row);
    });
    c.appendChild(vbox);
    const vAdd = el("div","row"); vAdd.style.cssText="display:flex;margin-top:8px;gap:6px";
    const vName = el("input","input"); vName.placeholder=T("varName"); vName.style.flex="1";
    const vForm = el("input","input"); vForm.placeholder=T("varFormula"); vForm.style.flex="1";
    vAdd.appendChild(vName); vAdd.appendChild(vForm); c.appendChild(vAdd);
    const vBtn = el("button","big-btn ghost",T("varAdd")); vBtn.style.marginTop="8px";
    vBtn.onclick=()=>{
      const name=vName.value.trim(); if(!name) return;
      try{ Canvas.setVariable(name, vForm.value.trim()); renderMeasurePane(); }
      catch(e){ toast(T("invalidFormula")); }
    };
    c.appendChild(vBtn);
  }

  // LAYERS PANE
  const FABRICS = [
    { key:"cotton",  color:"#e7dcc4" }, { key:"denim",   color:"#3f5f86" },
    { key:"silk",    color:"#e6a8bd" }, { key:"linen",   color:"#cbbb98" },
    { key:"wool",    color:"#8a7a63" }, { key:"satin",   color:"#a878d6" },
    { key:"leather", color:"#6f4526" }, { key:"chiffon", color:"#bfe0da" },
  ];
  const rgbToHex = (c) => {
    if(!c) return "#6d5efc";
    if(c[0]==="#") return c.length===4 ? "#"+[...c.slice(1)].map(x=>x+x).join("") : c;
    const m=/(\d+)\D+(\d+)\D+(\d+)/.exec(c);
    return m ? "#"+[m[1],m[2],m[3]].map(v=>(+v).toString(16).padStart(2,"0")).join("") : "#6d5efc";
  };
  function applyFabric(color, matKey){
    const pieces=Canvas.getPieces(); if(!pieces.length){ toast(T("empty2d")); return; }
    const sel=Canvas.getSelected();
    if(sel>=0){ Canvas.setColor(sel,color); if(matKey) Canvas.setMaterial(sel,matKey); }
    else{ pieces.forEach((_,i)=>Canvas.setColor(i,color)); if(matKey){ state.fabric3d=matKey; save(); } }
    sync3DFabric();
    renderLayersPane();
  }
  // Per-layer properties popover: rename (EN/AR), colour, own opacity, delete.
  function openLayerProps(i, anchor){
    closeAnyMenu();
    const p = Canvas.getPieces()[i]; if(!p) return;
    const m = el("div","menu layer-props");
    const curOp = Math.round((p.opacity!=null ? p.opacity : Canvas.getOpt("fillOpacity"))*100);
    m.innerHTML = `
      <div class="field"><label>${T("nameEn")}</label><input class="input lp-en" dir="ltr" value="${escAttr(p.name.en)}"></div>
      <div class="field"><label>${T("nameAr")}</label><input class="input lp-ar" dir="rtl" value="${escAttr(p.name.ar)}"></div>
      <div class="field"><label>${T("pieceColor")}</label><input class="lp-col" type="color" value="${rgbToHex(p.color)}" style="width:100%;height:34px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2)"></div>
      <div class="field"><label>${T("pieceMaterial")}</label>
        <select class="lp-mat" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--panel-2)">
          <option value="">${T("pieceMaterialDefault")}</option>
          ${FABRICS.map(f=>`<option value="${f.key}"${p.material===f.key?" selected":""}>${T("fab_"+f.key)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>${T("opacityLbl")} · <b class="lp-opv">${curOp}%</b></label><input class="range lp-op" type="range" min="4" max="90" value="${curOp}"></div>
      <div class="menu-sep"></div>
      ${(p.darts && p.darts.length) ? `<button class="menu-item lp-darts">${IC.layers}<span>${T("editDarts")}</span></button>` : ""}
      <button class="menu-item lp-del" style="color:var(--danger)">${IC.trash}<span>${T("removeLayer")}</span></button>`;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
    m.style.top = Math.min(r.bottom+6, innerHeight-mr.height-8)+"px";
    if(document.documentElement.dir==="rtl") m.style.left = Math.max(8, r.left-mr.width+r.width)+"px";
    else m.style.left = Math.max(8, Math.min(r.left, innerWidth-mr.width-8))+"px";
    requestAnimationFrame(()=>m.classList.add("show"));
    const q = s => m.querySelector(s);
    q(".lp-en").onchange = () => { Canvas.renamePiece(i,{en:q(".lp-en").value.trim()||p.name.en}); renderLayersPane(); };
    q(".lp-ar").onchange = () => { Canvas.renamePiece(i,{ar:q(".lp-ar").value.trim()||p.name.ar}); renderLayersPane(); };
    q(".lp-col").oninput = () => { Canvas.setColor(i,q(".lp-col").value); sync3DFabric(); renderLayersPane(); };
    q(".lp-mat").onchange = () => { Canvas.setMaterial(i,q(".lp-mat").value||null); sync3DFabric(); };
    q(".lp-op").oninput = () => { const v=+q(".lp-op").value; q(".lp-opv").textContent=v+"%"; Canvas.setPieceProps(i,{opacity:v/100}); };
    q(".lp-del").onclick = () => { Canvas.removePiece(i); closeAnyMenu(); sync3DVisibility(); renderLayersPane(); toast("✓ "+T("removeLayer")); };
    if(q(".lp-darts")) q(".lp-darts").onclick = () => { closeAnyMenu(); openDartEditorModal(i); };
    setTimeout(()=>document.addEventListener("pointerdown",onDocDown),0);
  }

  // WP-14: dart manipulation — pivotDart/transferDart preserve intake
  // (fabric removed), slashAndSpread deliberately adds it. Scoped here to
  // a modal over the selected piece's own darts, committing each change
  // via Canvas.setPieceProps(i, {darts}) (a plain Object.assign onto the
  // piece, same mechanism opacity/color use) rather than a full
  // interactive canvas drag-tool — see js/darts.js for the pure,
  // independently-tested math this wraps.
  // `presetPivot` (WP-19, optional): {dartIndex,x,y} — set right after a
  // "pick on canvas" click reopens this modal, so that one dart's pivot
  // fields show the picked point instead of resetting to the apex default.
  function openDartEditorModal(pieceIdx, presetPivot){
    Canvas.cancelPick(); // modal is (re)open — any still-armed pick from a previous call is stale
    const p = Canvas.getPieces()[pieceIdx]; if(!p || !p.darts || !p.darts.length) return;
    openModal(T("editDarts"), "", true);
    const body = $("#genericModal .modal-body"); body.innerHTML="";
    body.appendChild(el("div","help-note",T("editDartsHint")));

    p.darts.forEach((dart, di) => {
      const sec = el("div","field"); sec.style.marginTop="14px";
      sec.innerHTML = `<label>${T("dart")} ${di+1}</label>`;
      body.appendChild(sec);

      const row1 = el("div","row"); row1.style.cssText="display:flex;gap:8px;align-items:center;margin-top:6px";
      const pivotInp = el("input","input"); pivotInp.type="number"; pivotInp.step="1"; pivotInp.value="0"; pivotInp.style.flex="1";
      const pivotBtn = el("button","big-btn ghost",T("dartPivotApply")); pivotBtn.style.flex="0 0 auto";
      row1.appendChild(el("span",null,T("dartPivotDeg")+":")); row1.appendChild(pivotInp); row1.appendChild(pivotBtn);
      body.appendChild(row1);
      pivotBtn.onclick = () => {
        const deg = +pivotInp.value || 0;
        const newDarts = p.darts.map((d,i)=> i===di ? pivotDart(d, deg*Math.PI/180) : d);
        Canvas.setPieceProps(pieceIdx, {darts:newDarts});
        toast(T("dartUpdated")); openDartEditorModal(pieceIdx);
      };

      const row2 = el("div","row"); row2.style.cssText="display:flex;gap:8px;align-items:center;margin-top:8px";
      const spreadInp = el("input","input"); spreadInp.type="number"; spreadInp.step="0.5"; spreadInp.value="0"; spreadInp.style.flex="1";
      const spreadBtn = el("button","big-btn ghost",T("dartSpreadApply")); spreadBtn.style.flex="0 0 auto";
      row2.appendChild(el("span",null,T("dartSpreadCm")+":")); row2.appendChild(spreadInp); row2.appendChild(spreadBtn);
      body.appendChild(row2);
      spreadBtn.onclick = () => {
        const cm = +spreadInp.value || 0;
        const newDarts = p.darts.map((d,i)=> i===di ? slashAndSpread(d, cm) : d);
        Canvas.setPieceProps(pieceIdx, {darts:newDarts});
        toast(T("dartUpdated")); openDartEditorModal(pieceIdx);
      };

      // Real "dart transfer": swing the WHOLE dart (apex included) around an
      // external pivot — typically an anatomical reference like the bust
      // point — rather than the dart's own apex (that's pivotDart above).
      // Pivot X/Y default to the dart's own apex so applying with 0° is a
      // visible no-op; moving the pivot away from the apex is what actually
      // makes this "transfer" rather than "pivot".
      const [apex] = dart;
      const preset = (presetPivot && presetPivot.dartIndex===di) ? presetPivot : null;
      const row3 = el("div","row"); row3.style.cssText="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap";
      const pivotX = el("input","input"); pivotX.type="number"; pivotX.step="0.1"; pivotX.value=(preset?preset.x:apex[0]).toFixed(1); pivotX.style.cssText="flex:1;min-width:60px";
      const pivotY = el("input","input"); pivotY.type="number"; pivotY.step="0.1"; pivotY.value=(preset?preset.y:apex[1]).toFixed(1); pivotY.style.cssText="flex:1;min-width:60px";
      const transferDeg = el("input","input"); transferDeg.type="number"; transferDeg.step="1"; transferDeg.value=String((preset&&preset.deg!=null)?preset.deg:0); transferDeg.style.cssText="flex:1;min-width:60px";
      const transferBtn = el("button","big-btn ghost",T("dartTransferApply")); transferBtn.style.flex="0 0 auto";
      // WP-19: pick the pivot on canvas instead of typing coordinates you'd
      // have to already know — the whole point of transferring around an
      // external pivot is usually a point you can SEE (e.g. the bust
      // point), not one you've measured. Closes the modal so the real
      // canvas underneath is clickable, arms a one-shot pick, then reopens
      // this same modal with that dart's pivot fields pre-filled.
      const pickBtn = el("button","big-btn ghost",T("dartPivotPick")); pickBtn.style.flex="0 0 auto"; pickBtn.type="button";
      row3.appendChild(el("span",null,T("dartTransferPivot")+":"));
      row3.appendChild(pivotX); row3.appendChild(pivotY); row3.appendChild(pickBtn);
      row3.appendChild(el("span",null,T("dartPivotDeg")+":"));
      row3.appendChild(transferDeg); row3.appendChild(transferBtn);
      body.appendChild(row3);
      pickBtn.onclick = () => {
        const deg = +transferDeg.value || 0;
        closeModal("#genericModal");
        toast(T("dartPivotPickHint"));
        Canvas.armPick(({x,y}) => openDartEditorModal(pieceIdx, {dartIndex:di, x, y, deg}));
      };
      transferBtn.onclick = () => {
        const px = +pivotX.value, py = +pivotY.value;
        const deg = +transferDeg.value || 0;
        if (!isFinite(px) || !isFinite(py)) return;
        const newDarts = p.darts.map((d,i)=> i===di ? transferDart(d, [px,py], deg*Math.PI/180) : d);
        Canvas.setPieceProps(pieceIdx, {darts:newDarts});
        toast(T("dartUpdated")); openDartEditorModal(pieceIdx);
      };
    });
  }

  function renderLayersPane() {
    const c = $(".rail-pane[data-pane=layers]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.layers+T("layersPanel")));
    // add-layer is always available (even on an empty canvas)
    const addB = el("button","big-btn ghost",IC.layers+T("addLayer"));
    addB.style.marginBottom="10px";
    addB.onclick=()=>{ Canvas.addPiece({ en:I18N.en.newLayer, ar:I18N.ar.newLayer }); hideEmpty(); renderLayersPane(); toast("✓ "+T("newLayer")); };
    c.appendChild(addB);
    const pieces = Canvas.getPieces();
    if(!pieces.length){ c.appendChild(el("div","help-note",T("empty2d"))); return; }
    const sel = Canvas.getSelected();
    const multiSel = Canvas.getMultiSelection();  // Shift+click / Lasso group — highlighted the same as a plain single selection
    pieces.forEach((p,i)=>{
      const row = el("div","layer"+(p.locked?" locked":"")+((i===sel||multiSel.includes(i))?" active":""));
      // colour swatch — opens a native colour picker
      const sw = el("label","swatch"); sw.style.background=p.color; sw.title=T("pieceColor");
      const ci = el("input"); ci.type="color"; ci.value=rgbToHex(p.color);
      ci.style.cssText="position:absolute;width:0;height:0;opacity:0;pointer-events:none";
      ci.oninput=()=>{ Canvas.setColor(i,ci.value); sw.style.background=ci.value; sync3DFabric(); };
      sw.appendChild(ci); row.appendChild(sw);
      const nameEl = el("span","lname",`${L(p.name)}<small>${p.name[state.lang==="ar"?"en":"ar"]}</small>`);
      nameEl.ondblclick=(e)=>{ e.stopPropagation(); openLayerProps(i, row); };
      row.appendChild(nameEl);
      const props = el("button", null, IC.dots); props.title=T("layerProps");
      props.onclick=(e)=>{ e.stopPropagation(); openLayerProps(i, props); };
      row.appendChild(props);
      const lock = el("button", null, p.locked?IC.lock:IC.unlock); lock.title=T(p.locked?"unlock":"lock");
      if(p.locked) lock.style.color="var(--brand)";
      lock.onclick=(e)=>{ e.stopPropagation(); Canvas.toggleLock(i); renderLayersPane(); };
      row.appendChild(lock);
      const eye = el("button", null, p.visible?IC.eye:IC.eyeoff);
      eye.onclick=(e)=>{ e.stopPropagation(); Canvas.toggleVisible(i); sync3DVisibility(); renderLayersPane(); };
      row.appendChild(eye);
      row.onclick=(e)=>{ if(e.target.closest("button")||e.target.closest(".swatch"))return;
        if(!p.locked){ Canvas.selectPiece(i); showPieceInfo(p); renderLayersPane(); } };
      c.appendChild(row);
    });

    // Fabric & material
    c.appendChild(el("div","section-title",IC.drop+T("fabricSection")));
    c.appendChild(el("div","help-note", sel>=0 ? L(pieces[sel].name) : T("applyAll")));
    const grid=el("div","mat-grid"); grid.style.marginTop="8px";
    FABRICS.forEach(f=>{ const m=el("button","mat"+(state.fabric3d===f.key?" active":""),`<span>${T("fab_"+f.key)}</span>`);
      m.style.background=f.color; m.onclick=()=>applyFabric(f.color, f.key); grid.appendChild(m); });
    c.appendChild(grid);

    // Fabric transparency
    const tr=el("div","field"); tr.style.marginTop="14px";
    tr.innerHTML=`<label>${T("transparency")} · <b id="opVal">${Math.round(Canvas.getOpt("fillOpacity")*100)}%</b></label>`;
    const sl=el("input","range"); sl.type="range"; sl.min="4"; sl.max="70"; sl.value=Math.round(Canvas.getOpt("fillOpacity")*100);
    sl.oninput=()=>{ Canvas.setOpt("fillOpacity",+sl.value/100); const v=$("#opVal"); if(v)v.textContent=sl.value+"%"; sync3DFabric(); };
    tr.appendChild(sl); c.appendChild(tr);
  }

  // LIBRARY PANE
  function renderLibraryPane() {
    const c = $(".rail-pane[data-pane=library]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.shirt+T("libraryTitle")+` <small style="font-weight:600;color:var(--ink-2);margin-inline-start:4px">(${LIBRARY.length})</small>`));
    const sb = el("div","field",`<div style="position:relative"><span style="position:absolute;inset-inline-start:10px;top:9px;color:var(--ink-2)">${IC.search}</span></div>`);
    const inp = el("input","input"); inp.placeholder=T("searchLib"); inp.style.paddingInlineStart="34px"; sb.firstChild.appendChild(inp); c.appendChild(sb);
    // category quick-filter — defaults to the active working category, with an "All" option
    let libCat = state.category;
    const catSeg = el("div","seg"); catSeg.style.cssText="margin-bottom:10px;flex-wrap:wrap";
    const catOpts = [["all",T("allCat")],["women",T("women")],["men",T("men")],["girls",T("girls")],["boys",T("boys")]];
    catOpts.forEach(([val,label])=>{ const b=el("button",val===libCat?"active":"",label); b.onclick=()=>{ libCat=val; [...catSeg.children].forEach(x=>x.classList.toggle("active",x===b)); draw(inp.value); }; catSeg.appendChild(b); });
    c.appendChild(catSeg);
    const grid = el("div","lib-grid");
    const draw = (filter="") => {
      grid.innerHTML="";
      LIBRARY.filter(x=>{
        if(libCat!=="all" && x.cat!==libCat) return false;
        const p=PATTERNS[x.id]; return L(p.name).toLowerCase().includes(filter.toLowerCase());
      }).forEach(x=>{
          const p=PATTERNS[x.id];
          const card=el("div","lib-card");
          card.appendChild(el("div","lib-thumb", LIB_ICONS[x.type] || (x.cat==="men"?LIB_ICONS.shirt:LIB_ICONS.dress)));
          card.appendChild(el("div","lib-meta",`<div class="t">${L(p.name)}</div><div class="s">${L(x.tag)} · ${T(x.cat)}</div>`));
          card.onclick=()=>loadPattern(x.id);
          grid.appendChild(card);
        });
      // my patterns
      state.mine.forEach((mp,idx)=>{ const card=el("div","lib-card"); card.appendChild(el("div","lib-thumb",LIB_ICONS.dress)); card.appendChild(el("div","lib-meta",`<div class="t">${mp.name}</div><div class="s">★ ${T("saveMine").split(" ")[0]}</div>`)); card.onclick=()=>{Canvas.setPattern(mp.pieces,PALETTE);afterLoad(mp.name);}; grid.appendChild(card); });
      if(!grid.children.length) grid.appendChild(el("div","help-note",T("noResults")));
    };
    inp.oninput=()=>draw(inp.value); draw();
    c.appendChild(grid);
    const b=el("button","big-btn ghost",T("saveMine")); b.style.marginTop="14px";
    b.onclick=()=>{ const pieces=Canvas.getPieces(); if(!pieces.length){toast(T("empty2d"));return;} state.mine.push({name:(state.loaded?L(PATTERNS[state.loaded].name):"Custom")+" ✎",pieces:JSON.parse(JSON.stringify(pieces))}); save(); renderLibraryPane(); toast(T("saved")); };
    c.appendChild(b);
  }

  // ---- Guided Prompt Builder (AI pane) ----
  // The free-text prompt box above is exactly as reliable as what the user
  // happens to type into it — a one-word prompt ("dress") gives both the
  // local regex heuristic (js/ai.js's deriveStyle()) and an LLM provider
  // (js/ai-spec-pipeline.js) almost nothing to work with, which is the root
  // of "the generated pattern is generic". This builder assembles a precise
  // sentence from structured choices instead, using the EXACT canonical
  // English phrases deriveStyle()'s own regexes already match (and the
  // schema/pattern-spec.v1.json enum values the LLM path expects) — so a
  // guided build is reliably specific for BOTH generation paths, not just
  // whichever one happens to be configured. The assembled sentence is
  // always built in this canonical English vocabulary regardless of the
  // active UI language (state.lang): it's what feeds the local regex
  // fallback (English tokens are its most complete coverage — see
  // deriveStyle()'s own regexes) as well as the LLM, which reads English or
  // Arabic prompts equally well either way. Only the FORM LABELS the user
  // sees are localized (T()/i18n), not the text this produces.
  const AI_GUIDED_WORDS = {
    fit:      { fitted:"fitted", regular:"regular fit", relaxed:"relaxed" },
    flare:    { slim:"pencil silhouette", regular:"regular silhouette", full:"a-line silhouette" },
    length:   { short:"mini length", medium:"regular length", long:"maxi length" },
    neckline: { v:"v-neck", round:"round neck", boat:"boat neck", offshoulder:"off-shoulder neckline", halter:"halter neckline", collar:"collar", mock:"mock neck" },
    sleeve:   { sleeveless:"sleeveless", short:"short sleeves", threeQuarter:"three-quarter sleeves", long:"long sleeves" },
    hem:      { straight:"straight hem", curved:"curved hem", highlow:"high-low hem", asymmetric:"asymmetric hem" },
    closure:  { wrap:"wrap closure", zip:"zip closure", button:"button closure", tie:"tie closure" },
  };
  function buildGuidedPrompt(o){
    const type = o.type || "dress";
    const fitW = AI_GUIDED_WORDS.fit[o.fit], flareW = AI_GUIDED_WORDS.flare[o.flare];
    const lead = ["a", fitW, flareW, type].filter(Boolean).join(" ");
    const bits = [lead, AI_GUIDED_WORDS.length[o.length], AI_GUIDED_WORDS.neckline[o.neckline],
      AI_GUIDED_WORDS.sleeve[o.sleeve], AI_GUIDED_WORDS.hem[o.hem], AI_GUIDED_WORDS.closure[o.closure]].filter(Boolean);
    let sentence = bits.join(", ") + ".";
    if(o.notes && o.notes.trim()) sentence += " " + o.notes.trim();
    return sentence;
  }
  // Segmented-button row, same visual language as renderBuilderPane()'s own
  // segRow — `opts` includes "any"/"none" as an explicit "let the AI/local
  // heuristic decide" choice (skips the clause entirely in buildGuidedPrompt).
  function guidedSegRow(container, label, key, opts, labelFn){
    const wrap=el("div","set-row"); wrap.style.marginTop="10px"; wrap.style.flexWrap="wrap"; wrap.style.alignItems="flex-start";
    wrap.innerHTML=`<span class="sl">${label}</span>`;
    // Quick Draft Builder's own .seg rows never carry more than 3 short
    // options — fine as a single nowrap line. Several of these guided rows
    // (neckline in particular, 8 options) don't fit that assumption, so
    // this wraps onto multiple lines instead of silently overflowing/
    // clipping past the sidebar's edge (the global .seg CSS is untouched,
    // this is scoped to just these rows).
    const seg=el("div","seg"); seg.style.flexWrap="wrap"; seg.style.rowGap="4px";
    opts.forEach(o=>{
      const b=el("button", state.aiGuided[key]===o?"active":"", labelFn(o));
      b.onclick=()=>{ state.aiGuided[key]=o; save(); renderAIPane(); };
      seg.appendChild(b);
    });
    wrap.appendChild(seg); container.appendChild(wrap);
  }
  function renderGuidedPromptBuilder(ta){
    const box=el("div","field"); box.style.marginTop="4px";
    box.appendChild(el("div","section-title",IC.ruler+T("aiGuidedTitle")));
    box.appendChild(el("div","help-note",T("aiGuidedDesc")));

    const g = state.aiGuided;

    const typeGrid=el("div","opt-grid"); typeGrid.style.margin="8px 0 4px";
    AIGEN_KINDS.forEach(k=>{
      const o=el("div","opt"+(g.type===k?" active":""), T("kind_"+k));
      o.onclick=()=>{ g.type=k; save(); renderAIPane(); };
      typeGrid.appendChild(o);
    });
    box.appendChild(typeGrid);

    guidedSegRow(box, T("builderFit"), "fit", ["any","fitted","regular","relaxed"], o=>o==="any"?T("opt_any"):T("opt_"+o));
    guidedSegRow(box, T("builderFlare"), "flare", ["any","slim","regular","full"], o=>o==="any"?T("opt_any"):T("opt_"+o));
    guidedSegRow(box, T("builderLength"), "length", ["any","short","medium","long"], o=>o==="any"?T("opt_any"):T("opt_"+o));
    guidedSegRow(box, T("aiGuidedNeckline"), "neckline",
      ["any","v","round","boat","offshoulder","halter","collar","mock"],
      o=>o==="any"?T("opt_any"):T("opt_neck"+o[0].toUpperCase()+o.slice(1)));
    guidedSegRow(box, T("builderSleeve"), "sleeve", ["any","sleeveless","short","threeQuarter","long"],
      o=>o==="any"?T("opt_any"):o==="threeQuarter"?T("opt_threeQuarter"):T("opt_"+o));
    guidedSegRow(box, T("aiGuidedHem"), "hem", ["any","straight","curved","highlow","asymmetric"],
      o=>o==="any"?T("opt_any"):T("opt_hem"+o[0].toUpperCase()+o.slice(1)));
    guidedSegRow(box, T("aiGuidedClosure"), "closure", ["none","wrap","zip","button","tie"],
      o=>o==="none"?T("opt_none"):T("opt_closure"+o[0].toUpperCase()+o.slice(1)));

    const notesF=el("div","field"); notesF.style.marginTop="10px";
    notesF.innerHTML=`<label>${T("aiGuidedNotes")}</label>`;
    const notesIn=el("input","input"); notesIn.value=g.notes||""; notesIn.placeholder=T("aiGuidedNotesPh");
    notesIn.oninput=()=>{ g.notes=notesIn.value; save(); };
    notesF.appendChild(notesIn); box.appendChild(notesF);

    const buildBtn=el("button","big-btn ghost",IC.check+T("aiGuidedBuild")); buildBtn.style.marginTop="12px";
    buildBtn.onclick=()=>{ ta.value=buildGuidedPrompt(g); toast(T("aiGuidedBuilt")); };
    box.appendChild(buildBtn);
    return box;
  }

  // AI PANE
  const AI_STAGES = ["analyzing","silhouette","drafting"];
  function renderAIPane() {
    const c = $(".rail-pane[data-pane=ai]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.spark+T("aiTitle")));
    c.appendChild(el("div","help-note",T("aiDesc")));

    // inspiration image preview (restored from state if present)
    const preview=el("div","ai-preview"+(aiImage?" show":""));
    if(aiImage) preview.innerHTML=`<img src="${aiImage}" alt=""><button class="ai-x" title="${T('removeImg')}">×</button>`;
    const bindRemove=()=>{ const x=preview.querySelector(".ai-x"); if(x) x.onclick=()=>{ aiImage=null; preview.classList.remove("show"); preview.innerHTML=""; }; };
    bindRemove();

    const f=el("div","field"); f.style.marginTop="12px";
    const ta=el("textarea","textarea"); ta.placeholder=T("aiPlaceholder"); ta.id="aiPrompt"; f.appendChild(ta);

    // hidden file input — the upload button opens a real image picker
    const file=el("input"); file.type="file"; file.accept="image/*"; file.style.display="none";
    file.onchange=()=>{ const im=file.files&&file.files[0]; if(!im) return;
      const r=new FileReader();
      r.onload=()=>{ aiImage=r.result;
        preview.innerHTML=`<img src="${aiImage}" alt=""><button class="ai-x" title="${T('removeImg')}">×</button>`;
        preview.classList.add("show"); bindRemove(); toast(T("aiImageAdded")); };
      r.readAsDataURL(im);
    };
    const up=el("button","big-btn ghost",IC.image+T("aiUpload")); up.style.marginBottom="10px";
    up.onclick=()=>file.click();

    const gen=el("button","big-btn",IC.spark+T("generate"));
    gen.onclick=()=>runAI(ta.value,gen);

    // "thinking" stage checklist — built once, toggled visible during generation
    const statusBox=el("div","ai-status"); statusBox.id="aiStatus";
    const attrsBox=el("div","ai-attrs"); attrsBox.id="aiAttrs"; attrsBox.style.display="none";

    const guided = renderGuidedPromptBuilder(ta);

    c.appendChild(preview); c.appendChild(guided); c.appendChild(f); c.appendChild(file); c.appendChild(up); c.appendChild(gen);
    c.appendChild(statusBox); c.appendChild(attrsBox);

    // ---- AI Fashion Billboard: dress a model in real garment photos, then
    // draw a measured pattern from that photo (see js/billboard.js) ----
    c.appendChild(el("div","section-title",IC.image+T("billboardTitle"))).style.marginTop="22px";
    c.appendChild(el("div","help-note",T("billboardDesc")));

    const slots=el("div","bb-slots");
    slots.appendChild(makeBBSlot(0,T("billboardUpload1")));
    slots.appendChild(makeBBSlot(1,T("billboardUpload2")));
    c.appendChild(slots);

    const bbGen=el("button","big-btn",IC.spark+T("billboardGenerate")); bbGen.style.marginTop="10px";
    bbGen.onclick=()=>runBillboard(bbGen);
    c.appendChild(bbGen);

    const bbStatus=el("div","ai-status"); bbStatus.id="bbStatus"; c.appendChild(bbStatus);
    const bbResult=el("div","bb-result"); bbResult.id="bbResult"; c.appendChild(bbResult);
    paintBBResult();
  }
  // One upload slot for the Fashion Billboard's source clothing photos —
  // mirrors the single-image AI-inspiration uploader above (preview + hidden
  // file input + upload button), just parametrised over bbImages[i].
  function makeBBSlot(i, label){
    const wrap=el("div","bb-slot");
    const preview=el("div","ai-preview"+(bbImages[i]?" show":""));
    const paint=()=>{
      if(bbImages[i]){
        preview.innerHTML=`<img src="${bbImages[i]}" alt=""><button class="ai-x" title="${T('removeImg')}">×</button>`;
        preview.classList.add("show");
        preview.querySelector(".ai-x").onclick=()=>{ bbImages[i]=null; paint(); };
      } else { preview.classList.remove("show"); preview.innerHTML=""; }
    };
    const file=el("input"); file.type="file"; file.accept="image/*"; file.style.display="none";
    file.onchange=()=>{ const im=file.files&&file.files[0]; if(!im) return;
      const r=new FileReader();
      r.onload=()=>{ bbImages[i]=r.result; paint(); };
      r.readAsDataURL(im);
    };
    const up=el("button","big-btn ghost",IC.image+label); up.style.marginTop="8px";
    up.onclick=()=>file.click();
    wrap.appendChild(preview); wrap.appendChild(file); wrap.appendChild(up);
    return wrap;
  }
  // Shared 2-stage "thinking" indicator for both billboard calls (sending →
  // waiting on the proxy) — same visual language as beginAIThinking above,
  // kept separate since the stage keys/labels don't overlap with AI_STAGES.
  function beginBBThinking(stage2Key){
    const box=$("#bbStatus"); if(!box) return ()=>{};
    box.innerHTML="";
    ["billboardStageSending",stage2Key].forEach((k,i)=>{ const row=el("div","ai-stage"); row.dataset.i=i; row.innerHTML=`<span class="dot"></span><span>${T(k)}</span>`; box.appendChild(row); });
    box.classList.add("show");
    return (idx)=>{
      [...box.children].forEach((row,i)=>{
        row.classList.toggle("done", idx==="done" || i<idx);
        row.classList.toggle("active", idx!=="done" && i===idx);
      });
      if(idx==="done") setTimeout(()=>box.classList.remove("show"),260);
    };
  }
  function downloadDataURL(dataURL,name){ const a=el("a"); a.href=dataURL; a.download=name; a.click(); }
  // Renders the generated billboard photo (with a "draw pattern from this"
  // follow-up) and, once available, the pattern-drawing image derived from it.
  function paintBBResult(){
    const box=$("#bbResult"); if(!box) return;
    box.innerHTML="";
    box.classList.toggle("show", !!bbBillboard);
    if(!bbBillboard) return;

    const card1=el("div","bb-card");
    card1.appendChild(el("img")).src=bbBillboard;
    const row1=el("div","bb-card-actions");
    const dl1=el("button","tbtn",IC.download); dl1.title=T("billboardDownload");
    dl1.onclick=()=>downloadDataURL(bbBillboard,"berrystudio-billboard.png");
    row1.appendChild(dl1); card1.appendChild(row1);
    const drawBtn=el("button","big-btn ghost",IC.ruler+T("billboardDrawPattern"));
    drawBtn.onclick=()=>runPattern(drawBtn);
    card1.appendChild(drawBtn);
    const piecesBtn=el("button","big-btn",IC.spark+T("billboardGeneratePieces")); piecesBtn.style.marginTop="8px";
    piecesBtn.onclick=()=>runPatternPieces(piecesBtn);
    card1.appendChild(piecesBtn);
    card1.appendChild(el("div","help-note",T("billboardGeneratePiecesHint"))).style.marginTop="6px";
    box.appendChild(card1);

    if(bbPattern){
      const card2=el("div","bb-card");
      card2.appendChild(el("img")).src=bbPattern;
      const row2=el("div","bb-card-actions");
      const dl2=el("button","tbtn",IC.download); dl2.title=T("billboardDownload");
      dl2.onclick=()=>downloadDataURL(bbPattern,"berrystudio-pattern-drawing.png");
      row2.appendChild(dl2); card2.appendChild(row2);
      const traceBtn=el("button","big-btn ghost",IC.image+T("billboardUseTrace"));
      traceBtn.onclick=async()=>{
        const ok=await Canvas.setBackgroundImage(bbPattern);
        if(ok){ bgVisible=true; $("#bgBtn").classList.add("active"); setView("2d"); openBgPanel(); toast(T("billboardTraceReady")); }
        else toast(T("importFail"));
      };
      card2.appendChild(traceBtn);
      const techPackBtn=el("button","big-btn",IC.spark+T("billboardReadTechPack")); techPackBtn.style.marginTop="8px";
      techPackBtn.onclick=()=>runTechPackPieces(techPackBtn);
      card2.appendChild(techPackBtn);
      card2.appendChild(el("div","help-note",T("billboardReadTechPackHint"))).style.marginTop="6px";
      box.appendChild(card2);
    }
  }
  // BerryStudio-Upgrade-Plan WP-4: resolves the configured image-generation
  // adapter (default `proxy` — today's exact "AI Image endpoint" behaviour)
  // instead of a bare endpoint string. Returns null (and toasts) if the
  // active adapter isn't configured yet.
  async function resolveImageAdapter(){
    ensureAIState();
    const providerId = state.aiImageProvider || "proxy";
    const adapter = ImageProviders[providerId];
    const cfg = await resolveAICfg(providerId, aiCfgFor(providerId, true));
    const notConfigured = providerId==="proxy" ? !cfg.baseUrl : (adapter.needsKey && !cfg.apiKey);
    if(notConfigured){ toast(T("billboardNoEndpoint")); return null; }
    return { adapter, cfg };
  }
  async function runBillboard(btn){
    const resolved = await resolveImageAdapter();
    if(!resolved) return;
    const imgs=bbImages.filter(Boolean);
    if(!imgs.length){ toast(T("billboardNeedImages")); return; }
    const orig=btn.innerHTML; btn.innerHTML=IC.spark+T("billboardGenerating"); btn.style.opacity=".7"; btn.disabled=true;
    const setStage=beginBBThinking("billboardStageRendering");
    try{
      setStage(0); await new Promise(r=>setTimeout(r,350));
      setStage(1);
      bbPattern=null;
      bbBillboard=await Billboard.generateBillboard({ adapter:resolved.adapter, cfg:resolved.cfg, images:imgs });
      setStage("done"); paintBBResult(); toast(T("billboardDone"));
    } catch(e){ setStage("done"); toast(T("billboardFail")); }
    finally { btn.innerHTML=orig; btn.style.opacity="1"; btn.disabled=false; }
  }
  async function runPattern(btn){
    const resolved = await resolveImageAdapter();
    if(!resolved) return;
    if(!bbBillboard) return;
    const orig=btn.innerHTML; btn.innerHTML=IC.spark+T("billboardGenerating"); btn.style.opacity=".7"; btn.disabled=true;
    const setStage=beginBBThinking("billboardStageDrafting");
    const sizeLabel = state.kids ? L(KIDS_AGES.find(a=>a.id===state.kids).label) : state.size;
    try{
      setStage(0); await new Promise(r=>setTimeout(r,350));
      setStage(1);
      bbPattern=await Billboard.generatePattern({ adapter:resolved.adapter, cfg:resolved.cfg, image:bbBillboard, sizeLabel });
      setStage("done"); paintBBResult(); toast(T("billboardDone"));
    } catch(e){ setStage("done"); toast(T("billboardFail")); }
    finally { btn.innerHTML=orig; btn.style.opacity="1"; btn.disabled=false; }
  }
  // Build the 3-step checklist fresh for each run (first label depends on
  // whether an image was supplied) and return a setter to advance it.
  function beginAIThinking(hasImage){
    const box=$("#aiStatus"); if(!box) return ()=>{};
    box.innerHTML="";
    const labelFor = k => k==="analyzing" ? T(hasImage?"aiStageAnalyzing":"aiStageReadingText")
      : k==="silhouette" ? T("aiStageSilhouette") : T("aiStageDrafting");
    AI_STAGES.forEach(k=>{ const row=el("div","ai-stage"); row.dataset.stage=k; row.innerHTML=`<span class="dot"></span><span>${labelFor(k)}</span>`; box.appendChild(row); });
    box.classList.add("show");
    $("#aiAttrs").style.display="none";
    return (key)=>{
      const idx = AI_STAGES.indexOf(key);
      [...box.children].forEach((row,i)=>{
        row.classList.toggle("done", key==="done" || i<idx);
        row.classList.toggle("active", key!=="done" && i===idx);
      });
      if(key==="done") setTimeout(()=>box.classList.remove("show"), 260);
    };
  }
  // Render the bilingual "Detected" attribute chips (type, length, flare,
  // sleeve, neckline, hem, closure, colour) once generation completes —
  // this is the concrete evidence that the image/prompt actually mattered.
  // BerryStudio-Upgrade-Plan WP-4: chips carrying a provenance `source`
  // (vision/pixel/prompt/heuristic/spec/user-override) show it inline, and
  // every chip with a known override handler is click-to-correct — users
  // trust AI they can override, and an overridden value is honestly
  // relabelled "your edit" rather than left looking like an AI read.
  let lastAIResult = null;
  const OVERRIDE_ENUMS = {
    type: ["dress","top","shirt","skirt","trousers","robe"],
    neckline: ["v","round","boat","offshoulder","halter","collar"],
    hem: ["straight","curved","highlow","asymmetric"],
  };
  const OVERRIDE_FACTOR_FIELD = { length:"lengthF", flare:"flareF", sleeve:"sleeveLenF" };
  const OVERRIDE_FACTOR_RANGE = { lengthF:[0.55,1.6], flareF:[0.82,1.9], sleeveLenF:[0,1.5] };
  function overrideAIAttribute(key){
    if(!lastAIResult || !lastAIResult.style) return;
    const style = { ...lastAIResult.style };
    if(OVERRIDE_ENUMS[key]){
      const field = key==="hem" ? "hemShape" : key;
      const opts = OVERRIDE_ENUMS[key];
      const input = window.prompt(`${T("attrOverridePrompt")} (${opts.join(", ")})`, style[field]||"");
      if(input==null) return;
      const val = input.trim().toLowerCase();
      if(!opts.includes(val)){ toast(T("attrOverrideInvalid")); return; }
      style[field] = val;
    } else if(OVERRIDE_FACTOR_FIELD[key]){
      const field = OVERRIDE_FACTOR_FIELD[key];
      const [lo,hi] = OVERRIDE_FACTOR_RANGE[field];
      const input = window.prompt(`${T("attrOverridePromptNum")} (${lo}–${hi})`, String(style[field]));
      if(input==null) return;
      const num = parseFloat(input);
      if(Number.isNaN(num)){ toast(T("attrOverrideInvalid")); return; }
      style[field] = Math.max(lo, Math.min(hi, num));
    } else if(key==="closure"){
      const input = window.prompt(T("attrOverridePromptYN"), style.wrap?"yes":"no");
      if(input==null) return;
      style.wrap = /^y/i.test(input.trim());
    } else if(key==="color"){
      const input = window.prompt(T("attrOverridePromptColor"), style.color||"");
      if(input==null || !input.trim()) return;
      style.color = input.trim();
    } else return;

    const built = AIGen.build(style, currentMeas());
    const provenance = (lastAIResult.attributes||[]).reduce((m,a)=>{ if(a.source) m[a.k]={source:a.source,confidence:a.confidence}; return m; },{});
    provenance[key] = { source:"user-override", confidence:1 };
    const newRes = {
      ...built, summary: AIGen.summary(style, state.lang), style,
      attributes: AIGen.attributes(style, state.lang, provenance),
      source: lastAIResult.source, validation: PatternValidator.run(built.pieces, {}),
    };
    state.loaded = null;
    Canvas.setPattern(newRes.pieces, newRes.colors);
    hideEmpty(); renderLayersPane();
    if(state.view==="3d") build3D(newRes.colorInt);
    renderAIAttrs(newRes);
    toast(T("generated"));
  }
  const SOURCE_LABEL_KEY = { vision:"provenanceVision", pixel:"provenancePixel", prompt:"provenancePrompt", heuristic:"provenanceHeuristic", spec:"provenanceSpec", "user-override":"provenanceUserOverride" };
  function renderAIAttrs(res){
    lastAIResult = res;
    const box=$("#aiAttrs"); if(!box) return;
    box.style.display=""; box.innerHTML="";
    const imageUnreadable = !res.usedImage && res.imageSupplied;  // a photo WAS attached, but analyzeImage() found no clear silhouette in it
    const src = res.source==="remote" ? "Claude" : res.source==="spec" ? T("provenanceSpec") : res.source==="fused" ? T("provenanceVision")
      : res.usedImage ? T("usedImageNote") : imageUnreadable ? T("imageUnreadableNote") : "";
    const srcStyle = imageUnreadable ? ` style="color:var(--warn)"` : "";
    box.appendChild(el("div","aa-head",`<span>${T("detected")}</span>${src?`<span${srcStyle}>${src}</span>`:""}`));
    (res.attributes||[]).forEach(a=>{
      const row=el("div","aa-row");
      const val = a.swatch ? `<span class="aa-swatch" style="background:${a.value}"></span>${a.value}` : a.value;
      const srcLabel = a.source ? T(SOURCE_LABEL_KEY[a.source]||a.source) : "";
      const srcTxt = srcLabel ? ` <small class="aa-src">· ${srcLabel}${a.confidence!=null?` · ${a.confidence.toFixed(2)}`:""}</small>` : "";
      row.innerHTML=`<b>${a.label}</b><span class="aa-val">${val}${srcTxt}</span>`;
      const overridable = OVERRIDE_ENUMS[a.k] || OVERRIDE_FACTOR_FIELD[a.k] || a.k==="closure" || a.k==="color";
      if(overridable){ row.style.cursor="pointer"; row.title=T("attrOverrideTitle"); row.onclick=()=>overrideAIAttribute(a.k); }
      box.appendChild(row);
    });
  }
  // schema/pattern-spec.v1.json fetched once and cached — needed by
  // generateFromSpec() to pass the raw schema to a provider's own
  // structured-output mechanism (json_schema/responseSchema/tool input_schema).
  let cachedSpecSchema = null;
  async function loadSpecSchema(){
    if(!cachedSpecSchema) cachedSpecSchema = await (await fetch("./schema/pattern-spec.v1.json")).json();
    return cachedSpecSchema;
  }

  // Core prompt/image -> real vector pieces pipeline, shared by the AI
  // Pattern Generator's own prompt box (runAI, image = the uploaded
  // inspiration image) and the Fashion Billboard's "Generate Pattern Pieces
  // From This" button (runPatternPieces, image = the generated billboard
  // photo) — both are just different sources for the same `imageDataURL`,
  // so this always produces real, editable pieces on the canvas, never an
  // image to trace.
  // generateFromSpec() already computes a real, specific reason for every
  // fallback (missing/invalid key, network failure, rate limit, schema
  // validation failure...) — this used to be discarded in favor of one
  // fixed "didn't validate against the schema" toast even when the real
  // cause was a bad API key or a dropped connection, which is actively
  // misleading. Classifies the raw reason text into the closest of a
  // handful of honest, actionable messages; anything unrecognized still
  // falls back to the original generic (but truthful-enough) message.
  function classifyAIFallbackReason(reason){
    const r = String(reason||"");
    if(/\b401\b|\b403\b|unauthor|invalid.{0,12}key|api.?key/i.test(r)) return "specFallbackAuth";
    if(/\b429\b|rate.?limit/i.test(r)) return "specFallbackRateLimit";
    if(/fetch|network|timeout|abort|dns|offline/i.test(r)) return "specFallbackNetwork";
    return "specValidationFallback";
  }
  async function generatePatternFrom(prompt, imageDataURL, btn, doneToastKey){
    const orig=btn.innerHTML; btn.innerHTML=IC.spark+T("generating"); btn.style.opacity=".7"; btn.disabled=true;
    const setStage = beginAIThinking(!!imageDataURL);
    try {
      // BerryStudio-Upgrade-Plan WP-3: if a real AI provider is configured
      // (anything beyond the default empty `proxy`), try the spec-first
      // pipeline first — prompt -> schema-validated spec -> AIGen.build().
      // Any failure (network, invalid output twice) falls through to
      // EXACTLY today's local heuristic path below, with an honest toast —
      // never a silently broken pattern. No provider configured reproduces
      // today's behaviour with zero new code on this path.
      ensureAIState();
      const providerId = state.aiProvider || "proxy";
      const adapter = AIProviders[providerId];
      const cfg = await resolveAICfg(providerId, aiCfgFor(providerId, false));
      // A selected-but-unconfigured real provider (no key entered yet) used
      // to still attempt a live call, fail with a 401, and surface as the
      // same generic "schema didn't validate" toast below — actively
      // confusing when the real issue is just a missing key. Caught here,
      // before ever touching the network, with a message that says so.
      const missingKey = providerId!=="proxy" && adapter.needsKey && !cfg.apiKey;
      const hasRealProvider = providerId!=="proxy" ? !missingKey : !!cfg.baseUrl;
      let res = null;
      if(missingKey) toast(T("specFallbackNoKey"));
      else if(hasRealProvider){
        setStage("analyzing");
        const schema = await loadSpecSchema();
        const specResult = await generateFromSpec({
          adapter, cfg, prompt, measurements: currentMeas(), category: state.category, lang: state.lang,
          schema, images: imageDataURL ? [imageDataURL] : undefined,
        });
        if(!specResult.fellBack){
          // BerryStudio-Upgrade-Plan WP-4: when an image was supplied and the
          // provider returned a real spec (not the legacy proxy shape), fuse
          // the vision-informed spec with the existing pixel-analysis
          // heuristic — vision wins for type/neckline/wrap, pixel analysis
          // stays authoritative for length/flare/hem/colour exactly as it
          // is today. Text-only or legacy-proxy generations skip this and
          // use the spec result as-is.
          if(imageDataURL && specResult.source==="spec"){
            const pixelMetrics = await AIGen.analyzeImage(imageDataURL, { segment: getSegmentFn() });
            const promptStyle = AIGen.deriveStyle({ metrics: pixelMetrics, prompt, category: state.category, imageDataURL });
            const { style: fusedStyle, sourceMap } = fuseStyle({ specStyle: specResult.style, promptStyle });
            const built = AIGen.build(fusedStyle, currentMeas());
            const provenance = mergeProvenance(sourceMap, provenanceMapFromSpec(specResult.spec));
            res = {
              ...built, summary: AIGen.summary(fusedStyle, state.lang), style: fusedStyle,
              attributes: AIGen.attributes(fusedStyle, state.lang, provenance),
              source: "fused", validation: PatternValidator.run(built.pieces, {}),
              usedImage: !!(pixelMetrics && pixelMetrics.ok), imageSupplied: true,
            };
          } else {
            res = specResult;
            // A schema-valid spec that left construction.neckline unset
            // reaches here with style.neckline===null (js/ai-spec-pipeline.js's
            // specToStyle() leaves it nullable on purpose, for the fuseStyle()
            // branch above — a filled-in guess there would look like a real
            // vision read). This direct/non-fused path is exactly the case
            // that note describes as safe to fill: nothing else here is going
            // to supply a neckline, and AIGen.build()'s necklinePts() quietly
            // drafts a plain round neckline for every unset case otherwise —
            // the same "every generation looks identical" complaint this pass
            // exists to fix. Seeded on the prompt so identical input still
            // reproduces an identical result.
            if(res.style && res.source==="spec" && !res.style.neckline){
              const style = { ...res.style, neckline: AIGen.pick(`${prompt}|${state.category}|neck`,
                res.style.type==="shirt" ? ["collar","round","v"] : ["v","round","boat","offshoulder","halter"]) };
              const built = AIGen.build(style, currentMeas());
              res = {
                ...res, ...built, style,
                attributes: AIGen.attributes(style, state.lang, provenanceMapFromSpec(res.spec)),
                validation: PatternValidator.run(built.pieces, {}),
              };
            }
          }
          setStage("done");
        } else toast(T(classifyAIFallbackReason(specResult.fallbackReason)));
      }
      // Image-driven parametric generation: robust local silhouette analysis
      // (neckline/hem/flare/colour), walked through visibly via setStage so
      // generation feels deliberate — the fallback path whenever no provider
      // is configured, or the configured one failed/returned invalid output.
      if(!res){
        res = await AIGen.generate({
          prompt, imageDataURL, category: state.category,
          measurements: currentMeas(), endpoint: "", lang: state.lang,
          onStage: setStage, segment: getSegmentFn(),
        });
      }
      state.loaded = null;
      Canvas.setPattern(res.pieces, res.colors);
      hideEmpty(); renderLayersPane();
      if(state.view==="3d") build3D(res.colorInt);
      renderAIAttrs(res);                         // show what was actually detected, right where the "thinking" ran
      toast(T(doneToastKey));
    } catch(e){ toast(T("importFail")); }
    finally { btn.innerHTML=orig; btn.style.opacity="1"; btn.disabled=false; }
  }
  async function runAI(txt, btn){
    const prompt=(txt||"").trim();
    if(!prompt && !aiImage){ toast(T("aiNeedInput")); return; }
    await generatePatternFrom(prompt, aiImage, btn, "generated");
  }
  // Fashion Billboard "Generate Pattern Pieces From This" — same pipeline
  // as the AI Pattern Generator's own image-upload path, sourced from the
  // generated billboard photo instead of a user-uploaded inspiration image.
  // Used to call generatePatternFrom() with an EMPTY text prompt (image
  // only) — a real reliability bug, not a deliberate "let the image speak
  // for itself" design: a bare, contextless image gives a vision-capable
  // provider nothing to anchor a specific read on beyond the general system
  // prompt, and some OpenAI-compatible backends reject an empty user
  // message outright. A concrete instruction steers it toward mode 1 (photo
  // silhouette, not tech-pack tracing) and toward reading real construction
  // details instead of a generic runway guess.
  async function runPatternPieces(btn){
    if(!bbBillboard) return;
    const prompt = "The attached image is a photorealistic photo of a professional fashion model wearing the exact garment(s) the user dressed them in with the AI Fashion Billboard tool above — read it as a real worn-garment photo (mode 1), not a technical tech-pack drawing. Identify this garment's actual construction as precisely as the photo allows: garment type, neckline, sleeve length and width, overall silhouette (fitted vs. flared), hem shape, and closure — a confident, specific read, not a generic default.";
    await generatePatternFrom(prompt, bbBillboard, btn, "billboardPiecesReady");
  }
  // "Read Pattern Pieces From This Tech-Pack" — sourced from bbPattern (the
  // AI-drawn technical flat-sketch with individual piece diagrams and printed
  // dimensions), not bbBillboard (a worn-garment photo, which can only ever
  // yield relative style factors — see runPatternPieces above). The prompt
  // steers a vision-capable provider toward buildSystemPrompt()'s "mode 2"
  // (read pieces[].outlineCm off the image literally) instead of guessing
  // silhouette/construction factors as it would for a plain photo.
  async function runTechPackPieces(btn){
    if(!bbPattern) return;
    const prompt = "The attached image is a technical flat-sketch / tech-pack drawing: individual pattern piece diagrams with printed dimensions, and possibly its own body-measurement table. Read the actual piece shapes and printed numbers directly off the image — do not guess relative style factors for pieces you can trace exactly.";
    await generatePatternFrom(prompt, bbPattern, btn, "billboardTechPackReady");
  }

  // ================= QUICK DRAFT BUILDER =================
  // Pick a garment kind → see only the measurements that kind actually needs →
  // produce real pattern pieces. AIGen.build() drives the 6 basic kinds;
  // FancyGen.build() (js/fancy-patterns.js) drives the 4 richer, curved-seam kinds.
  const BUILDER_KINDS = ["dress","top","shirt","skirt","trousers","romper","robe","gown","jacket","coat","suit"];
  const AIGEN_KINDS = ["dress","top","shirt","skirt","trousers","robe","romper"];
  const KIND_MEAS = {
    dress:["chest","waist","hips","backLen","sleeve","bicep","height"],
    top:["chest","waist","hips","backLen","sleeve","bicep"],
    shirt:["chest","waist","hips","backLen","neck","sleeve","bicep"],
    skirt:["waist","hips","inseam"],
    trousers:["waist","hips","thigh","inseam"],
    romper:["chest","waist","hips","backLen","neck","sleeve","bicep","thigh","inseam"],
    robe:["chest","waist","hips","backLen","neck","sleeve","bicep","height"],
    gown:["chest","waist","hips","backLen","sleeve","bicep","height"],
    jacket:["chest","waist","hips","backLen","neck","sleeve","bicep"],
    coat:["chest","waist","hips","shoulder","backLen","neck","sleeve","bicep"],
    suit:["chest","waist","hips","backLen","neck","sleeve","bicep","thigh","inseam"],
  };
  // `sleeveCap` (WP-20): only the AIGen (not FancyGen) kinds with a real
  // sleeve — style.sleeveGatherRatio/sleevePleatCount/sleeveTuckCount only
  // ever reach AIGen.build()'s sleevePiece(); "gown" has `sleeve:1` for its
  // length picker but is drafted by FancyGen.build(), which never reads
  // those fields, so it deliberately does NOT get `sleeveCap`.
  const KIND_STYLE = {
    dress:{length:1,flare:1,fit:1,sleeve:1,sleeveCap:1}, top:{length:1,flare:1,fit:1,sleeve:1,sleeveCap:1}, shirt:{length:1,flare:1,fit:1,sleeve:1,sleeveCap:1},
    skirt:{length:1,flare:1,fit:1,pleats:1}, trousers:{length:1,flare:1,fit:1}, romper:{length:1,fit:1,sleeve:1,sleeveCap:1},
    robe:{length:1,flare:1,fit:1,sleeve:1,sleeveCap:1},
    gown:{length:1,sleeve:1}, jacket:{length:1}, coat:{length:1}, suit:{},
  };
  const LEN_MAP = {short:0.65, medium:1.0, long:1.35};
  const FLARE_MAP = {slim:0.9, regular:1.15, full:1.5};
  const FIT_MAP = {fitted:0.85, regular:1.0, relaxed:1.15};
  const SLEEVE_MAP = {sleeveless:0, short:0.45, long:1.3};
  // WP-14: knife-pleat/tuck count per waist or sleeve-cap edge; each
  // technique's depth is fixed inside buildSkirt/sleevePiece (js/ai.js) —
  // this maps the UI's Light/Full intensity to a pleat/tuck COUNT, same
  // count scale reused for both since they share computePleats' math
  // (see js/pleats.js's computeTucks). "none" keeps AIGen.build()'s
  // output byte-identical to before this option existed.
  const PLEAT_MAP = {none:0, light:3, full:6};
  // WP-20: gather is a continuous ease ratio (raw edge length ÷ finished
  // length), not a discrete count — computeGatherWidth(w, ratio) (js/pleats.js).
  // 1.3x/1.6x are realistic light/full shirring ratios.
  const GATHER_MAP = {none:1, light:1.3, full:1.6};

  function renderBuilderPane() {
    const c = $(".rail-pane[data-pane=builder]"); c.innerHTML = "";
    c.appendChild(el("div","section-title",IC.ruler+T("builderTitle")));
    c.appendChild(el("div","help-note",T("builderDesc")));

    const kindGrid = el("div","opt-grid"); kindGrid.style.margin="10px 0 4px";
    BUILDER_KINDS.forEach(k=>{
      const o = el("div","opt"+(state.builderKind===k?" active":""), T("kind_"+k));
      o.onclick = () => { state.builderKind=k; save(); renderBuilderPane(); };
      kindGrid.appendChild(o);
    });
    c.appendChild(kindGrid);

    if (!state.builderKind) { c.appendChild(el("div","help-note",T("builderPick"))); return; }
    const kind = state.builderKind;

    // Required measurements — only the fields this kind's construction actually reads.
    // These are a local scratch override for this draft only — they don't touch the
    // shared working measurements (Measures pane / Auto Grade stay untouched).
    c.appendChild(el("div","section-title",IC.measure+T("builderMeas"))).style.marginTop="16px";
    c.appendChild(el("div","help-note",T("builderMeasHint")));
    const m = Object.assign({}, currentMeas(), state.builderCustom);
    const box = el("div"); box.style.marginTop="6px";
    KIND_MEAS[kind].forEach(k=>{
      const row = el("div","meas-row",`<label>${T("m_"+k)}</label>`);
      const inp = el("input"); inp.type="number"; inp.value=m[k]; inp.dataset.k=k;
      inp.onchange=()=>{ state.builderCustom[k]=+inp.value; save(); };
      row.appendChild(inp); box.appendChild(row);
    });
    c.appendChild(box);

    // Style controls — only the ones that kind's builder actually honours.
    const st = KIND_STYLE[kind];
    const segRow = (label, key, opts, map) => {
      const wrap = el("div","set-row"); wrap.style.marginTop="10px";
      wrap.innerHTML = `<span class="sl">${label}</span>`;
      const seg = el("div","seg");
      opts.forEach(o=>{ const b=el("button", state.builderOpts[key]===o?"active":"", T("opt_"+o)); b.onclick=()=>{ state.builderOpts[key]=o; save(); renderBuilderPane(); }; seg.appendChild(b); });
      wrap.appendChild(seg); c.appendChild(wrap);
    };
    if (st.length) segRow(T("builderLength"), "length", ["short","medium","long"]);
    if (st.flare) segRow(T("builderFlare"), "flare", ["slim","regular","full"]);
    if (st.fit) segRow(T("builderFit"), "fit", ["fitted","regular","relaxed"]);
    if (st.sleeve) segRow(T("builderSleeve"), "sleeve", ["sleeveless","short","long"]);
    // WP-20: waist/sleeve-cap fullness is a technique choice (Pleat/Gather/
    // Tuck), not just an intensity — the Intensity row only appears once a
    // real technique is picked, same "don't show a control with nothing to
    // control" pattern the rest of this pane already follows.
    if (st.pleats) {
      segRow(T("builderWaistTech"), "waistTech", ["none","pleat","gather","tuck"]);
      if ((state.builderOpts.waistTech||"none") !== "none") segRow(T("builderIntensity"), "waistIntensity", ["light","full"]);
    }
    if (st.sleeveCap) {
      segRow(T("builderSleeveTech"), "sleeveTech", ["none","pleat","gather","tuck"]);
      if ((state.builderOpts.sleeveTech||"none") !== "none") segRow(T("builderIntensity"), "sleeveIntensity", ["light","full"]);
    }

    const genBtn = el("button","big-btn",IC.check+T("builderGenerate")); genBtn.style.marginTop="16px";
    genBtn.onclick = () => generateBuilderPattern(kind);
    c.appendChild(genBtn);
  }

  // WP-20: turns a {tech, intensity} pair from the builder pane into the
  // one style field the chosen technique actually reads — the other two
  // stay at their off-default (0 / 0 / 1), so buildSkirt/sleevePiece's own
  // gather-first priority chain never has more than one real value to see.
  // `keys` is [pleatCountKey, tuckCountKey, gatherRatioKey] — pass the
  // skirt/waist names for the waist row, the sleeve-prefixed names for the
  // sleeve-cap row.
  function fullnessStyle(tech, intensity, [pleatKey, tuckKey, gatherKey]){
    const n = { [pleatKey]:0, [tuckKey]:0, [gatherKey]:1 };
    if (tech === "pleat") n[pleatKey] = PLEAT_MAP[intensity] ?? 0;
    else if (tech === "tuck") n[tuckKey] = PLEAT_MAP[intensity] ?? 0;
    else if (tech === "gather") n[gatherKey] = GATHER_MAP[intensity] ?? 1;
    return n;
  }
  function generateBuilderPattern(kind) {
    const m = Object.assign({}, currentMeas(), state.builderCustom);
    const o = state.builderOpts;
    let pieces;
    if (AIGEN_KINDS.includes(kind)) {
      const style = {
        type: kind,
        lengthF: LEN_MAP[o.length] ?? 1,
        flareF: FLARE_MAP[o.flare] ?? 1,
        fitF: FIT_MAP[o.fit] ?? 1,
        sleeveLenF: KIND_STYLE[kind].sleeve ? (SLEEVE_MAP[o.sleeve] ?? 0.45) : 0,
        sleeveWideF: 1,
        ...(KIND_STYLE[kind].pleats ? fullnessStyle(o.waistTech, o.waistIntensity, ["pleatCount","tuckCount","gatherRatio"]) : {}),
        ...(KIND_STYLE[kind].sleeveCap ? fullnessStyle(o.sleeveTech, o.sleeveIntensity, ["sleevePleatCount","sleeveTuckCount","sleeveGatherRatio"]) : {}),
      };
      pieces = AIGen.build(style, m).pieces;
    } else {
      pieces = FancyGen.build(kind, m, { length:o.length, sleeveless:o.sleeve==="sleeveless", sleeveLong:o.sleeve==="long" });
    }
    if (!pieces || !pieces.length) { toast(T("importFail")); return; }
    state.loaded = null;
    Canvas.setPattern(pieces, PALETTE);
    hideEmpty(); renderLayersPane();
    if (state.view==="3d") build3D();
    toast(T("generated")+" · "+T("kind_"+kind));
    save();
  }

  // EXPORT PANE
  const PAPERS=["A0","A1","A2","A3","A4","Letter","Plotter","Custom"];
  const FORMATS=["PDF","DXF","SVG","AI","PNG","JPEG","HPGL"];
  function renderExportPane() {
    const c = $(".rail-pane[data-pane=export]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.download+T("exportTitle")));
    c.appendChild(el("div",null,`<label style="font-size:11.5px;font-weight:700;color:var(--ink-2)">${T("paperSize")}</label>`));
    const pg=el("div","opt-grid"); pg.style.margin="8px 0 4px";
    PAPERS.forEach((p,i)=>{const o=el("div","opt"+(i===4?" active":""),p);o.onclick=()=>{$$("#pg .opt").forEach(x=>x.classList.remove("active"));o.classList.add("active");};pg.appendChild(o);}); pg.id="pg"; c.appendChild(pg);
    c.appendChild(el("div",null,`<label style="font-size:11.5px;font-weight:700;color:var(--ink-2)">${T("format")}</label>`)).style.marginTop="12px";
    const fg=el("div","opt-grid"); fg.style.margin="8px 0";
    FORMATS.forEach((p,i)=>{const o=el("div","opt"+(i===2?" active":""),p);o.dataset.fmt=p;o.onclick=()=>{$$("#fg .opt").forEach(x=>x.classList.remove("active"));o.classList.add("active");};fg.appendChild(o);}); fg.id="fg"; c.appendChild(fg);
    // toggles
    [["tiled","exportTiled"],["regMarks","exportRegMarks"]].forEach(([k,sk])=>{
      const v = state[sk]!==false; // default on
      const r=el("label","set-row"); r.innerHTML=`<span class="sl">${T(k)}</span>`;
      const sw=el("span","switch",`<input type="checkbox" ${v?"checked":""}><span class="track"></span>`); r.appendChild(sw);
      sw.querySelector("input").onchange=(e)=>{ state[sk]=e.target.checked; save(); };
      c.appendChild(r);
    });
    c.appendChild(el("div",null,`<label style="font-size:11.5px;font-weight:700;color:var(--ink-2)">${T("dpi")}</label>`)).style.marginTop="10px";
    const dpiRow=el("div","opt-grid"); dpiRow.style.margin="8px 0";
    [150,300,600].forEach(d=>{
      const o=el("div","opt"+((state.exportDpi||300)===d?" active":""),String(d));
      o.onclick=()=>{ $$("#dpiRow .opt").forEach(x=>x.classList.remove("active")); o.classList.add("active"); state.exportDpi=d; save(); };
      dpiRow.appendChild(o);
    }); dpiRow.id="dpiRow"; c.appendChild(dpiRow);
    c.appendChild(el("div","help-note",T("dpiNote")));
    // fabric + cost
    c.appendChild(el("div","section-title",null)).textContent=T("fabricCalc");
    const meas=currentMeas();
    const yards = state.lastMarkerYards!=null
      ? state.lastMarkerYards.toFixed(2)
      : ((meas.height/100)* (state.category==="women"?1.8:1.5)).toFixed(2);
    c.appendChild(el("div","help-note",
      state.lastMarkerYards!=null
        ? `${T("fabric")}: <b>${yards} m</b> @ ${state.lastMarkerWidth||160}cm — ${T("markerYardageSrc")}`
        : `${T("fabric")}: <b>${yards} m</b> @ 150cm`));
    const mkBtn=el("button","big-btn ghost",IC.cube+T("createMarker")); mkBtn.style.marginTop="8px"; mkBtn.onclick=openMarkerModal; c.appendChild(mkBtn);
    c.appendChild(el("div","section-title",null)).textContent=T("costEst");
    c.appendChild(el("div",null,`<label style="font-size:11.5px;font-weight:700;color:var(--ink-2)">${T("costCurrency")}</label>`)).style.marginTop="4px";
    const curRow=el("div","opt-grid"); curRow.style.margin="8px 0";
    Object.keys(CURRENCIES).forEach(code=>{
      const o=el("div","opt"+((state.costCurrency||"USD")===code?" active":""), CURRENCIES[code].label);
      o.onclick=()=>{ state.costCurrency=code; save(); renderExportPane(); };
      curRow.appendChild(o);
    });
    c.appendChild(curRow);
    const cur = CURRENCIES[state.costCurrency||"USD"];
    const fmt = usd => `${cur.symbol}${(usd*cur.rate).toFixed(2)}`;
    const fabricCostUsd=+(yards*8).toFixed(2), trimsUsd=6.5, laborUsd=15;
    const cost=el("div");
    cost.appendChild(el("div","cost-row",`<span>${T("fabric")}</span><b>${fmt(fabricCostUsd)}</b>`));
    cost.appendChild(el("div","cost-row",`<span>${T("trims")}</span><b>${fmt(trimsUsd)}</b>`));
    cost.appendChild(el("div","cost-row",`<span>${T("labor")}</span><b>${fmt(laborUsd)}</b>`));
    cost.appendChild(el("div","cost-row total",`<span>${T("total")}</span><b>${fmt(fabricCostUsd+trimsUsd+laborUsd)}</b>`));
    c.appendChild(cost);
    if((state.costCurrency||"USD")!=="USD") c.appendChild(el("div","help-note",T("costRateNote")));
    const ex=el("button","big-btn",IC.download+T("exportNow")); ex.style.marginTop="14px"; ex.onclick=doExport; c.appendChild(ex);
    const tp=el("button","big-btn ghost",T("techPack")); tp.style.marginTop="8px"; tp.onclick=()=>techPack(); c.appendChild(tp);
    const ps=el("button","big-btn ghost",IC.printer+T("patternSummary")); ps.style.marginTop="8px"; ps.onclick=()=>exportSummary(); c.appendChild(ps);
    c.appendChild(el("div","help-note",T("patternSummaryD"))).style.marginTop="6px";
    const bo=el("button","big-btn ghost",T("bom")); bo.style.marginTop="10px"; bo.onclick=()=>exportBom(); c.appendChild(bo);
    const cp=el("button","big-btn ghost",T("checkPattern")); cp.style.marginTop="8px"; cp.onclick=()=>runCheckPattern(); c.appendChild(cp);
    const ws=el("button","big-btn ghost",T("walkSeam")); ws.style.marginTop="8px"; ws.onclick=()=>openWalkSeamModal(); c.appendChild(ws);
  }

  // WP-14: "walk the seam" — scans currently loaded pieces for a pair
  // sharing a declared edges[].seamId (js/fancy-patterns.js's princess-
  // seam metadata is the one real producer of this today) and lets the
  // user drag a single 0-100% slider to see the matching arc-length
  // position highlighted on BOTH edges at once — the visual, interactive
  // front-end over js/geometry.js's seamPointAtFraction (itself the same
  // arc-length technique js/validate.js's notch-alignment check uses).
  function findSeamPairs(pieces){
    const bySeam = {};
    pieces.forEach((p,i)=>{ (p.edges||[]).forEach(e=>{ (bySeam[e.seamId] ||= []).push({pieceIdx:i, edge:e}); }); });
    const pairs = [];
    const dist=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
    Object.entries(bySeam).forEach(([seamId, entries])=>{
      for(let a=0; a<entries.length; a++) for(let b=a+1; b<entries.length; b++){
        if(entries[a].pieceIdx===entries[b].pieceIdx) continue;
        const A=entries[a], B=entries[b];
        const outlineA=pieces[A.pieceIdx].outline, outlineB=pieces[B.pieceIdx].outline;
        const startA=outlineA[A.edge.fromIdx], endA=outlineA[A.edge.toIdx];
        const startB=outlineB[B.edge.fromIdx], endB=outlineB[B.edge.toIdx];
        // Two edges declaring the same seamId aren't guaranteed to be
        // walked in the same direction (frontCenter's princess curve runs
        // top->hem in its own natural point order; frontSide splices the
        // SAME curve in reverse — hem->top). Detect this from the real
        // endpoint positions rather than trusting fromIdx/toIdx order, and
        // flip B's fraction at draw time so "50%" means the same physical
        // point on both edges regardless of how each was declared.
        const sameDir = dist(startA,startB)+dist(endA,endB);
        const oppDir = dist(startA,endB)+dist(endA,startB);
        pairs.push({seamId, a:A, b:B, bReversed: oppDir < sameDir});
      }
    });
    return pairs;
  }
  function openWalkSeamModal(){
    const pieces = Canvas.getPieces();
    const pairs = findSeamPairs(pieces);
    if(!pairs.length){ toast(T("walkSeamNone")); return; }
    const pair = pairs[0];
    const pieceA = pieces[pair.a.pieceIdx], pieceB = pieces[pair.b.pieceIdx];
    // Pieces are drawn at their own independent layoutPieces() position
    // on the shared cutting sheet — comparing raw coordinates between
    // two DIFFERENT pieces would show a constant offset even for a
    // perfectly-matching seam (confirmed: every fraction differed by the
    // exact same distance until this alignment was added). Align pieceB
    // by translating it so its fraction=0 point coincides with pieceA's,
    // purely for this preview's drawing — the real Canvas.getPieces()
    // data is never mutated.
    const a0 = seamPointAtFraction(pieceA.outline, pair.a.edge.fromIdx, pair.a.edge.toIdx, 0);
    const b0 = seamPointAtFraction(pieceB.outline, pair.b.edge.fromIdx, pair.b.edge.toIdx, pair.bReversed ? 1 : 0);
    const alignOffset = [a0[0]-b0[0], a0[1]-b0[1]];
    const pieceBOutlineAligned = pieceB.outline.map(([x,y])=>[x+alignOffset[0], y+alignOffset[1]]);
    openModal(T("walkSeam"), "", true);
    const body = $("#genericModal .modal-body"); body.innerHTML="";
    body.appendChild(el("div","help-note",T("walkSeamHint")+` (${pair.seamId})`));
    const canvas = el("canvas"); canvas.width=560; canvas.height=420;
    canvas.style.cssText="width:100%;height:auto;margin-top:12px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2)";
    body.appendChild(canvas);
    const sliderRow = el("div","row"); sliderRow.style.cssText="display:flex;align-items:center;gap:10px;margin-top:12px";
    const slider = el("input"); slider.type="range"; slider.min="0"; slider.max="100"; slider.value="50"; slider.style.flex="1";
    const pctLbl = el("span",null,"50%"); pctLbl.style.cssText="min-width:3em;text-align:right;font-weight:600";
    sliderRow.appendChild(slider); sliderRow.appendChild(pctLbl); body.appendChild(sliderRow);

    const draw = () => {
      const frac = (+slider.value)/100; pctLbl.textContent = slider.value+"%";
      const ptA = seamPointAtFraction(pieceA.outline, pair.a.edge.fromIdx, pair.a.edge.toIdx, frac);
      const ptBraw = seamPointAtFraction(pieceB.outline, pair.b.edge.fromIdx, pair.b.edge.toIdx, pair.bReversed ? 1-frac : frac);
      const ptB = [ptBraw[0]+alignOffset[0], ptBraw[1]+alignOffset[1]];
      const ctx = canvas.getContext("2d"); const W=canvas.width, H=canvas.height;
      ctx.clearRect(0,0,W,H);
      const allPts = [...pieceA.outline, ...pieceBOutlineAligned];
      const xs=allPts.map(p=>p[0]), ys=allPts.map(p=>p[1]);
      const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
      const scale = Math.min((W-40)/Math.max(maxX-minX,1), (H-40)/Math.max(maxY-minY,1));
      ctx.save(); ctx.translate(20-minX*scale, 20-minY*scale);
      [ [pieceA.outline,"#6d5efc"], [pieceBOutlineAligned,"#00c2a8"] ].forEach(([outline,color])=>{
        ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.beginPath();
        outline.forEach(([x,y],j)=>{ const px=x*scale, py=y*scale; j===0?ctx.moveTo(px,py):ctx.lineTo(px,py); });
        ctx.closePath(); ctx.stroke();
      });
      [ [ptA,"#6d5efc"], [ptB,"#00c2a8"] ].forEach(([pt,color])=>{
        ctx.beginPath(); ctx.arc(pt[0]*scale, pt[1]*scale, 6, 0, Math.PI*2);
        ctx.fillStyle=color; ctx.fill(); ctx.strokeStyle="#1a1a1a"; ctx.lineWidth=1.5; ctx.stroke();
      });
      ctx.restore();
    };
    slider.oninput = draw; draw();
  }

  function doExport(){
    const fmt=($("#fg .opt.active")||{}).dataset?.fmt||"SVG";
    exportAs(fmt);
  }
  // Paper sizes that are actual home-printer page formats — tiling only
  // makes sense for these; A0-A3/Plotter/Custom are already large-format.
  const TILEABLE_PAPER_TO_PAGESIZE = { A4: "a4", Letter: "letter" };
  function currentExportPdfOpts(){
    const paper = ($("#pg .opt.active")||{}).textContent || "A4";
    const pageSize = TILEABLE_PAPER_TO_PAGESIZE[paper];
    const tiled = !!(state.exportTiled!==false && pageSize);
    return { tiled, pageSize: pageSize||"a4", overlapMm: 10, includeGuides: state.exportRegMarks!==false };
  }
  // Central exporter used by both the Export pane and the Project menu.
  function exportAs(fmt){
    if(!Canvas.getPieces().length){ toast(T("empty2d")); return; }
    const F=(fmt||"SVG").toUpperCase();
    if(F==="SVG")      download("berrystudio-pattern.svg","image/svg+xml",Canvas.exportSVG());
    else if(F==="DXF") download("berrystudio-pattern.dxf","application/dxf",Canvas.exportDXF());
    else if(F==="HPGL")download("berrystudio-pattern.hpgl","application/vnd.hp-hpgl",Canvas.exportHPGL());
    else if(F==="PDF"){ const p=Canvas.exportPDF(currentExportPdfOpts()); if(!p){toast(T("empty2d"));return;} download("berrystudio-pattern.pdf","application/pdf",p); }
    else if(F==="AI"){
      const p=Canvas.exportPDF(currentExportPdfOpts()); if(!p){toast(T("empty2d"));return;}
      const ai=`%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator(R) 24.0\n%%AI8_CreatorVersion: 24.0\n%%For: BerryStudio\n${p}`;
      download("berrystudio-pattern.ai","application/postscript",ai);
    }
    else if(F==="PNG"||F==="JPEG"){
      Canvas.exportRaster(F.toLowerCase(), state.exportDpi||300).then(res=>{
        if(!res){toast(T("empty2d"));return;}
        const u=URL.createObjectURL(res.blob); const a=el("a");a.href=u;a.download=`berrystudio-pattern.${F.toLowerCase()}`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
        toast(res.clamped ? T("exported")+" · "+F+" ("+Math.round(res.dpi)+" "+T("dpiClamped")+")" : T("exported")+" · "+F);
      }).catch(()=>toast(T("rasterFailed")));
      return;
    }
    else if(F==="JSON")download("berrystudio-project.json","application/json",JSON.stringify(projectPayload(),null,0));
    else               download(`berrystudio-pattern.${F.toLowerCase()}`,"image/svg+xml",Canvas.exportSVG());
    toast(T("exported")+" · "+F);
  }
  function download(name,type,data){ const b=new Blob([data],{type}); const u=URL.createObjectURL(b); const a=el("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000); }

  // ---- Project menu actions ----
  function newProject(){
    Canvas.clearAll(); state.loaded=null; aiImage=null;
    showEmpty(); renderLayersPane(); renderAIPane();
    if(state.view==="3d") build3D();
    save(); toast(T("newDone"));
  }
  function projectPayload(){
    return {app:"BerryStudio",version:1,pieces:Canvas.getPieces(),texts:Canvas.getTexts(),points:Canvas.getPoints(),cons:Canvas.getCons(),variables:Canvas.getVariables()};
  }
  // Shared by file-based Import Project and cloud-sync Load — same payload
  // shape, same success/failure semantics, one place to keep them in sync.
  function applyProjectPayload(data){
    const pieces=Array.isArray(data)?data:data.pieces;
    if(!Canvas.loadPieces(pieces, data.texts, data.points, data.cons)) return false;
    state.loaded=null; hideEmpty(); renderLayersPane();
    Object.entries(data.variables||{}).forEach(([name,formula])=>{ try{ Canvas.setVariable(name, formula); }catch(e){} });
    if(state.view==="3d") build3D(); save();
    return true;
  }
  function importProject(){
    const inp=el("input"); inp.type="file"; inp.accept=".json,application/json";
    inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=()=>{ try{
        if(applyProjectPayload(JSON.parse(r.result))) toast(T("imported"));
        else toast(T("importFail"));
      }catch(e){ toast(T("importFail")); } };
      r.readAsText(f);
    };
    inp.click();
  }

  // ---- WP-18: cloud sync (opt-in, off unless Settings → Cloud Sync is on
  // AND a target is configured) ----
  function syncTargetImpl(){
    if(state.syncTarget==="googleDrive") return GoogleDriveSync;
    if(state.syncTarget==="oneDrive") return OneDriveSync;
    return null; // "endpoint" handled separately — it takes an explicit URL, not a singleton connection
  }
  async function cloudSyncSave(){
    if(!Canvas.getPieces().length){ toast(T("empty2d")); return; }
    try{
      if(state.syncTarget==="endpoint") await SelfHostedSync.save(state.syncEndpointUrl, projectPayload());
      else {
        const impl=syncTargetImpl();
        if(!impl.isConnected()) await cloudSyncConnect();
        await impl.save(projectPayload());
      }
      toast(T("syncSaved"));
    }catch(e){ toast(T("syncFail")+": "+(e.message||e)); }
  }
  async function cloudSyncLoad(){
    try{
      let data;
      if(state.syncTarget==="endpoint") data=await SelfHostedSync.load(state.syncEndpointUrl);
      else {
        const impl=syncTargetImpl();
        if(!impl.isConnected()) await cloudSyncConnect();
        data=await impl.load();
      }
      if(applyProjectPayload(data)) toast(T("syncLoaded"));
      else toast(T("importFail"));
    }catch(e){ toast(T("syncFail")+": "+(e.message||e)); }
  }
  async function cloudSyncConnect(){
    if(state.syncTarget==="googleDrive") return GoogleDriveSync.connect(state.syncGoogleClientId);
    if(state.syncTarget==="oneDrive") return OneDriveSync.connect(state.syncMicrosoftClientId);
    return null;
  }
  function printPattern(){
    const svg=Canvas.exportSVG(); if(!svg){ toast(T("empty2d")); return; }
    const w=window.open("","_blank");
    if(!w){ toast(T("printProject")+": allow pop-ups"); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>BerryStudio — ${state.loaded?L(PATTERNS[state.loaded].name):"Pattern"}</title>
      <style>@page{margin:12mm}body{margin:0;font-family:Inter,sans-serif}svg{width:100%;height:auto}h1{font-size:16px}</style></head>
      <body><h1>BerryStudio</h1>${svg}<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
    w.document.close();
  }
  // ---- lightweight dropdown menu ----
  function projectMenuItems(){ return [
    { icon:IC.newdoc,  label:T("newProject"),    run:newProject },
    { icon:IC.importf, label:T("importProject"), run:importProject },
    "sep",
    { icon:IC.download,label:T("exportSVG"),     run:()=>exportAs("SVG") },
    { icon:IC.download,label:T("exportDXF"),     run:()=>exportAs("DXF") },
    { icon:IC.pdf,     label:T("savePDF"),       run:()=>exportAs("PDF") },
    { icon:IC.folder,  label:T("saveProject"),   run:()=>exportAs("JSON") },
    { icon:IC.printer, label:T("patternSummary"),run:exportSummary },
    { icon:IC.cube,    label:T("createMarker"),  run:openMarkerModal },
    { icon:IC.magnet,  label:T("snapshotMenu"),  run:openSnapshotPanel },
    ...(state.cloudSync ? [
      "sep",
      { icon:IC.cloudUp,   label:T("syncSaveTo"),   run:cloudSyncSave },
      { icon:IC.cloudDown, label:T("syncLoadFrom"), run:cloudSyncLoad },
    ] : []),
    "sep",
    { icon:IC.printer, label:T("printProject"),  run:printPattern },
  ]; }
  function openMenu(btn, items){
    closeAnyMenu();
    const m=el("div","menu");
    items.forEach(it=>{
      if(it==="sep"){ m.appendChild(el("div","menu-sep")); return; }
      const mi=el("button","menu-item",`${it.icon||""}<span>${it.label}</span>`);
      mi.onclick=()=>{ closeAnyMenu(); it.run(); };
      m.appendChild(mi);
    });
    document.body.appendChild(m);
    const r=btn.getBoundingClientRect();
    m.style.top=(r.bottom+6)+"px";
    if(document.documentElement.dir==="rtl") m.style.right=(innerWidth-r.right)+"px";
    else m.style.left=r.left+"px";
    requestAnimationFrame(()=>m.classList.add("show"));
    setTimeout(()=>document.addEventListener("pointerdown",onDocDown),0);
  }
  function onDocDown(e){ if(!e.target.closest(".menu")&&!e.target.closest("#projectBtn")) closeAnyMenu(); }
  function closeAnyMenu(){ $$(".menu").forEach(m=>m.remove()); document.removeEventListener("pointerdown",onDocDown); }
  const escAttr = s => String(s??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");

  // ================= TEXT TOOL EDITOR =================
  // Floating formatting panel opened by the canvas (new or edit mode).
  function openTextEditor(req){
    closeTextEditor();
    const it = req.item || { text:"", size:4, bold:false, italic:false, color:rgbToHex(getComputedStyle(document.body).getPropertyValue("--ink").trim()) };
    const box = el("div","text-editor");
    box.innerHTML = `
      <input class="input te-text" placeholder="${T("typeText")}" value="${escAttr(it.text)}">
      <div class="row">
        <label style="font-size:11px;font-weight:700;color:var(--ink-2)">${T("fontSize")}</label>
        <input class="input te-size" type="number" min="1" max="30" value="${it.size||4}" style="width:60px">
        <button class="tbtn te-b ${it.bold?"active":""}" title="${T("boldLbl")}">B</button>
        <button class="tbtn te-i ${it.italic?"active":""}" title="${T("italicLbl")}" style="font-style:italic">I</button>
        <input class="te-col" type="color" value="${rgbToHex(it.color)}" title="${T("pieceColor")}">
      </div>
      <div class="row" style="justify-content:flex-end;gap:8px">
        ${req.item?`<button class="tbtn te-del" title="${T("deleteLbl")}" style="width:auto;padding:0 10px;color:var(--danger)">${T("deleteLbl")}</button>`:""}
        <button class="tbtn te-cancel" style="width:auto;padding:0 10px">${T("cancel")}</button>
        <button class="tbtn te-ok active" style="width:auto;padding:0 14px">${T("okLbl")}</button>
      </div>`;
    document.body.appendChild(box);
    // position near the click, clamped to the viewport
    const r = box.getBoundingClientRect();
    box.style.left = Math.min(Math.max(8, req.cx), innerWidth - r.width - 8) + "px";
    box.style.top  = Math.min(Math.max(8, req.cy + 10), innerHeight - r.height - 8) + "px";
    const q = s => box.querySelector(s);
    let bold = !!it.bold, italic = !!it.italic;
    q(".te-b").onclick = () => { bold = !bold; q(".te-b").classList.toggle("active", bold); };
    q(".te-i").onclick = () => { italic = !italic; q(".te-i").classList.toggle("active", italic); };
    const commit = () => {
      const txt = q(".te-text").value.trim();
      if (!txt) { closeTextEditor(); return; }
      const props = { text: txt, size: Math.max(1, +q(".te-size").value || 4), bold, italic, color: q(".te-col").value };
      if (req.item) Canvas.updateText(req.item.id, props);
      else Canvas.addText({ x: req.wx, y: req.wy, ...props });
      closeTextEditor();
    };
    q(".te-ok").onclick = commit;
    q(".te-cancel").onclick = closeTextEditor;
    if (req.item) q(".te-del").onclick = () => { Canvas.removeText(req.item.id); closeTextEditor(); };
    q(".te-text").addEventListener("keydown", e => { if (e.key === "Enter") commit(); if (e.key === "Escape") closeTextEditor(); });
    q(".te-text").focus(); q(".te-text").select();
  }
  function closeTextEditor(){ $$(".text-editor").forEach(x=>x.remove()); }

  // ================= CONSTRUCTION POPOVERS =================
  // Position any floating panel near a click point, clamped to the viewport.
  function placeFloating(box, cx, cy){
    document.body.appendChild(box);
    const r = box.getBoundingClientRect();
    box.style.left = Math.min(Math.max(8, cx), innerWidth - r.width - 8) + "px";
    box.style.top  = Math.min(Math.max(8, cy + 10), innerHeight - r.height - 8) + "px";
  }

  // Rename a construction point and/or give it a live formula for X/Y.
  function openPointEditor(req){
    closeTextEditor();
    const p = req.point;
    const box = el("div","text-editor");
    box.innerHTML = `
      <input class="input pe-name" placeholder="${T("pointName")}" value="${escAttr(p.name)}">
      <div class="row">
        <input class="input pe-x" placeholder="${T("pointX")}" value="${escAttr(p.xExpr||(+p.x.toFixed(2)))}" style="width:50%">
        <input class="input pe-y" placeholder="${T("pointY")}" value="${escAttr(p.yExpr||(+p.y.toFixed(2)))}" style="width:50%">
      </div>
      <div class="help-note" style="margin:0">${T("formulaHint")}</div>
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="tbtn pe-del" title="${T("deletePoint")}" style="width:auto;padding:0 10px;color:var(--danger)">${T("deleteLbl")}</button>
        <button class="tbtn pe-cancel" style="width:auto;padding:0 10px">${T("cancel")}</button>
        <button class="tbtn pe-ok active" style="width:auto;padding:0 14px">${T("okLbl")}</button>
      </div>`;
    placeFloating(box, req.cx, req.cy);
    const q = s => box.querySelector(s);
    const commit = () => {
      const name = q(".pe-name").value.trim() || p.name;
      Canvas.setPointName(p.id, name);
      const r = Canvas.setPointFormula(p.id, q(".pe-x").value.trim(), q(".pe-y").value.trim());
      if (!r.ok){ toast(T("invalidFormula")+": "+r.error); return; }
      closeTextEditor(); renderMeasurePane();
    };
    q(".pe-ok").onclick = commit;
    q(".pe-cancel").onclick = closeTextEditor;
    q(".pe-del").onclick = () => { Canvas.removePoint(p.id); closeTextEditor(); };
    box.addEventListener("keydown", e => { if (e.key==="Enter") commit(); if (e.key==="Escape") closeTextEditor(); });
    q(".pe-name").focus(); q(".pe-name").select();
  }

  // Name prompt shown when a construction-point loop is closed with the
  // "Create Pattern Piece" tool — confirming snapshots it into a real piece.
  function openPromotePrompt(outlinePts){
    closeTextEditor();
    const box = el("div","text-editor");
    box.innerHTML = `
      <div class="help-note" style="margin:0">${T("promoteHint").replace("{n}", outlinePts.length)}</div>
      <input class="input pp-en" dir="ltr" placeholder="${T("nameEn")}">
      <input class="input pp-ar" dir="rtl" placeholder="${T("nameAr")}">
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="tbtn pp-cancel" style="width:auto;padding:0 10px">${T("cancel")}</button>
        <button class="tbtn pp-ok active" style="width:auto;padding:0 14px">${T("promoteBtn")}</button>
      </div>`;
    placeFloating(box, innerWidth/2 - 130, innerHeight/3);
    const q = s => box.querySelector(s);
    const cancel = () => { Canvas.cancelPromote(); closeTextEditor(); };
    const commit = () => {
      const en = q(".pp-en").value.trim() || "New Piece", ar = q(".pp-ar").value.trim() || "قطعة جديدة";
      Canvas.finishPromotePiece(en, ar); closeTextEditor(); hideEmpty(); renderLayersPane();
      toast(T("promoted")+" · "+en);
    };
    q(".pp-ok").onclick = commit; q(".pp-cancel").onclick = cancel;
    box.addEventListener("keydown", e => { if (e.key==="Enter") commit(); if (e.key==="Escape") cancel(); });
    q(".pp-en").focus();
  }

  // Two-point calibration for the trace-over background image: asks for the
  // real-world distance (cm) between the two points the user just clicked.
  function openCalibPrompt(measuredDist){
    closeTextEditor();
    const box = el("div","text-editor");
    box.innerHTML = `
      <div class="help-note" style="margin:0">${T("calibHint")}</div>
      <input class="input cb-dist" type="number" min="0.1" step="0.1" placeholder="${T("realDistance")}">
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="tbtn cb-cancel" style="width:auto;padding:0 10px">${T("cancel")}</button>
        <button class="tbtn cb-ok active" style="width:auto;padding:0 14px">${T("applyCalib")}</button>
      </div>`;
    placeFloating(box, innerWidth/2 - 130, innerHeight/3);
    const q = s => box.querySelector(s);
    const commit = () => {
      const cm = +q(".cb-dist").value;
      if (cm>0){ Canvas.applyCalibration(cm, measuredDist); toast(T("calibDone")); }
      closeTextEditor(); setTool("select");
    };
    q(".cb-ok").onclick = commit; q(".cb-cancel").onclick = ()=>{ closeTextEditor(); setTool("select"); };
    box.addEventListener("keydown", e => { if (e.key==="Enter") commit(); if (e.key==="Escape") closeTextEditor(); });
    q(".cb-dist").focus();
  }

  // Trace-over background image: import / opacity / show-hide / calibrate / remove.
  let bgVisible = true;
  function openBgPanel(){
    closeTextEditor();
    const has = Canvas.hasBackground();
    const box = el("div","text-editor");
    if (!has){
      box.innerHTML = `
        <div class="help-note" style="margin:0">${T("bgImage")}</div>
        <button class="tbtn bg-import active" style="width:auto;padding:0 14px">${T("bgImport")}</button>
        <div class="row" style="justify-content:flex-end">
          <button class="tbtn bg-close" style="width:auto;padding:0 10px">${T("close")}</button>
        </div>`;
      placeFloating(box, innerWidth/2 - 130, 90);
      const file=el("input"); file.type="file"; file.accept="image/*"; file.style.display="none";
      file.onchange=()=>{ const im=file.files&&file.files[0]; if(!im) return;
        const r=new FileReader();
        r.onload=async ()=>{ const ok=await Canvas.setBackgroundImage(r.result); if(ok){ bgVisible=true; $("#bgBtn").classList.add("active"); closeTextEditor(); openBgPanel(); } };
        r.readAsDataURL(im);
      };
      box.appendChild(file);
      box.querySelector(".bg-import").onclick=()=>file.click();
      box.querySelector(".bg-close").onclick=closeTextEditor;
      return;
    }
    box.innerHTML = `
      <div class="row"><label style="flex:1">${T("bgOpacity")}</label><input class="range bg-op" type="range" min="0.1" max="1" step="0.05" value="${Canvas.getBgOpacity()}" style="flex:2"></div>
      <div class="row"><label style="flex:1">${T("bgShow")}</label><input class="bg-show" type="checkbox" ${bgVisible?"checked":""}></div>
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="tbtn bg-remove" style="width:auto;padding:0 10px;color:var(--danger)">${T("bgRemove")}</button>
        <button class="tbtn bg-calib active" style="width:auto;padding:0 12px">${T("bgCalibrate")}</button>
        <button class="tbtn bg-close" style="width:auto;padding:0 10px">${T("close")}</button>
      </div>`;
    placeFloating(box, innerWidth/2 - 130, 90);
    box.querySelector(".bg-op").oninput = e => Canvas.setBgOpacity(+e.target.value);
    box.querySelector(".bg-show").onchange = e => { bgVisible=e.target.checked; Canvas.setBgVisible(bgVisible); };
    box.querySelector(".bg-remove").onclick = () => { Canvas.removeBackground(); $("#bgBtn").classList.remove("active"); closeTextEditor(); };
    box.querySelector(".bg-calib").onclick = () => { closeTextEditor(); setTool("calib"); toast(T("calibHint")); };
    box.querySelector(".bg-close").onclick = closeTextEditor;
  }

  // Frozen snapshot ghost overlay — a single translucent reference of the pattern's
  // current state to compare later edits against. Mirrors openBgPanel() exactly.
  function openSnapshotPanel(){
    closeTextEditor();
    const has = Canvas.hasSnapshot();
    const box = el("div","text-editor");
    if (!has){
      if (!Canvas.getPieces().length){ toast(T("empty2d")); return; }
      box.innerHTML = `
        <div class="help-note" style="margin:0">${T("snapshotHint")}</div>
        <button class="tbtn snap-freeze active" style="width:auto;padding:0 14px">${T("freezeSnapshot")}</button>
        <div class="row" style="justify-content:flex-end">
          <button class="tbtn snap-close" style="width:auto;padding:0 10px">${T("close")}</button>
        </div>`;
      placeFloating(box, innerWidth/2 - 130, 90);
      box.querySelector(".snap-freeze").onclick = () => { Canvas.freezeSnapshot(); $("#snapshotBtn").classList.add("active"); closeTextEditor(); openSnapshotPanel(); toast(T("freezeSnapshot")+" ✓"); };
      box.querySelector(".snap-close").onclick = closeTextEditor;
      return;
    }
    box.innerHTML = `
      <div class="row"><label style="flex:1">${T("snapshotOpacity")}</label><input class="range snap-op" type="range" min="0.1" max="1" step="0.05" value="${Canvas.getSnapshotOpacity()}" style="flex:2"></div>
      <div class="row"><label style="flex:1">${T("snapshotShow")}</label><input class="snap-show" type="checkbox" checked></div>
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="tbtn snap-remove" style="width:auto;padding:0 10px;color:var(--danger)">${T("snapshotRemove")}</button>
        <button class="tbtn snap-close" style="width:auto;padding:0 10px">${T("close")}</button>
      </div>`;
    placeFloating(box, innerWidth/2 - 130, 90);
    box.querySelector(".snap-op").oninput = e => Canvas.setSnapshotOpacity(+e.target.value);
    box.querySelector(".snap-show").onchange = e => Canvas.showSnapshot(e.target.checked);
    box.querySelector(".snap-remove").onclick = () => { Canvas.removeSnapshot(); $("#snapshotBtn").classList.remove("active"); closeTextEditor(); };
    box.querySelector(".snap-close").onclick = closeTextEditor;
  }

  // ================= OBJECT BROWSER =================
  // A docked, non-auto-closing panel (unlike the .text-editor popovers, which all get
  // swept by closeTextEditor()) listing every construction/finished entity grouped by
  // type, with a name filter and click-to-select/focus. Read-only inspection + focus —
  // it doesn't edit anything itself (use the existing point/piece editors for that).
  let objBrowserOpen = false;
  function toggleObjectBrowser(){
    objBrowserOpen = !objBrowserOpen;
    $("#objBrowserBtn").classList.toggle("active", objBrowserOpen);
    if (objBrowserOpen) renderObjectBrowser();
    else { const p=$("#objBrowserPanel"); if(p) p.remove(); }
  }
  function renderObjectBrowser(){
    if (!objBrowserOpen) return;
    let panel = $("#objBrowserPanel");
    const query = panel ? panel.querySelector(".ob-search")?.value.trim().toLowerCase() : "";
    if (!panel){ panel = el("div","obj-browser"); panel.id="objBrowserPanel"; document.body.appendChild(panel); }
    panel.innerHTML = `
      <div class="ob-head">
        <b>${T("objBrowser")}</b>
        <div class="ob-head-btns">
          <button class="tbtn ob-refresh" title="${T("refresh")}">${IC.redo}</button>
          <button class="tbtn ob-close" title="${T("close")}">✕</button>
        </div>
      </div>
      <input class="input ob-search" placeholder="${T("objSearch")}" value="${escAttr(query||"")}">
      <div class="ob-list"></div>`;
    const list = panel.querySelector(".ob-list");
    const match = label => !query || (label||"").toLowerCase().includes(query);
    const lineNo = {}; let li=0, ai=0, ci=0;
    const groups = [
      { key:"points",  label:T("objPoints"),  items: Canvas.getPoints().map(p=>({ id:p.id, label:p.name, kind:"point" })) },
      { key:"lines",   label:T("objLines"),   items: Canvas.getCons().filter(c=>c.kind==="line").map(c=>({ id:c.id, label:`${T("objLine")} ${++li}`, kind:"cons" })) },
      { key:"arcs",    label:T("objArcs"),    items: Canvas.getCons().filter(c=>c.kind==="arc").map(c=>({ id:c.id, label:`${T("objArc")} ${++ai}`, kind:"cons" })) },
      { key:"circles", label:T("objCircles"), items: Canvas.getCons().filter(c=>c.kind==="circle").map(c=>({ id:c.id, label:`${T("objCircle")} ${++ci}`, kind:"cons" })) },
      { key:"pieces",  label:T("objPieces"),  items: Canvas.getPieces().map((p,i)=>({ id:i, label:L(p.name), kind:"piece" })) },
      { key:"texts",   label:T("objTexts"),   items: Canvas.getTexts().map(t=>({ id:t.id, label:t.text||T("objTextEmpty"), kind:"text", x:t.x, y:t.y })) },
    ];
    groups.forEach(g=>{
      const filtered = g.items.filter(it=>match(it.label));
      if (!filtered.length && query) return;
      const det = el("details"); det.open = true;
      det.innerHTML = `<summary>${g.label} · ${filtered.length}</summary>`;
      const ul = el("div","ob-rows");
      filtered.forEach(it=>{
        const row = el("div","ob-row");
        const label = el("span","ob-row-label", escAttr(it.label));
        row.appendChild(label);
        row.onclick = () => {
          if (it.kind==="point") Canvas.selectPoint(it.id);
          else if (it.kind==="cons") Canvas.selectCons(it.id);
          else if (it.kind==="piece") { Canvas.selectPiece(it.id); Canvas.render(); }
          else if (it.kind==="text") Canvas.centerOn(it.x, it.y);
        };
        const actions = el("div","ob-row-actions");
        // Construction lines/arcs/circles have no name field to rename —
        // delete-only for those; every other kind gets both.
        if (it.kind!=="cons"){
          const renameBtn = el("button",null,IC.edit); renameBtn.title = T("objRename");
          renameBtn.onclick = (e) => {
            e.stopPropagation();
            const next = window.prompt(T("objRenamePrompt"), it.label);
            if (next==null || !next.trim()) return;
            const v = next.trim();
            if (it.kind==="point") Canvas.setPointName(it.id, v);
            else if (it.kind==="piece") Canvas.renamePiece(it.id, {[state.lang]: v});
            else if (it.kind==="text") Canvas.updateText(it.id, {text: v});
            renderLayersPane(); renderObjectBrowser();
          };
          actions.appendChild(renameBtn);
        }
        const delBtn = el("button",null,IC.trash); delBtn.title = T("objDelete");
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (it.kind==="point") Canvas.removePoint(it.id);
          else if (it.kind==="cons") Canvas.removeCons(it.id);
          else if (it.kind==="piece") Canvas.removePiece(it.id);
          else if (it.kind==="text") Canvas.removeText(it.id);
          renderLayersPane(); sync3DVisibility(); renderObjectBrowser();
        };
        actions.appendChild(delBtn);
        row.appendChild(actions);
        ul.appendChild(row);
      });
      det.appendChild(ul); list.appendChild(det);
    });
    if (!groups.some(g=>g.items.some(it=>match(it.label)))) list.appendChild(el("div","help-note",T("objEmpty")));
    panel.querySelector(".ob-close").onclick = toggleObjectBrowser;
    panel.querySelector(".ob-refresh").onclick = renderObjectBrowser;
    panel.querySelector(".ob-search").oninput = renderObjectBrowser;
    panel.querySelector(".ob-search").focus();
    if (query) panel.querySelector(".ob-search").setSelectionRange(query.length, query.length);
  }

  // ================= HELP =================
  function openHelp(){
    const tools = ["select","pen","line","arc","free","symmetry","knife","move","rotate","scale","measure","text","seam","notch","grain"];
    let html = `<h3 style="margin-bottom:8px">${T("helpQuick")}</h3><ol style="padding-inline-start:20px;font-size:13px;line-height:1.7;color:var(--ink-2)">`;
    html += `<li>${T("helpQ1")}</li><li>${T("helpQ2")}</li><li>${T("helpQ3")}</li></ol>`;
    html += `<h3 style="margin:18px 0 8px">${T("helpTools")}</h3><table style="width:100%;border-collapse:collapse;font-size:12.5px">`;
    tools.forEach(k=>{ html += `<tr><td style="padding:6px 8px;border-bottom:1px solid var(--line-2);font-weight:700;white-space:nowrap">${T("t_"+k)}</td><td style="padding:6px 8px;border-bottom:1px solid var(--line-2);color:var(--ink-2)">${T("tt_"+k)}</td></tr>`; });
    html += `</table><h3 style="margin:18px 0 8px">${T("helpShortcuts")}</h3><table style="width:100%;border-collapse:collapse;font-size:12.5px">`;
    [["V P L A M R S T", T("sc_tools")], ["Ctrl+Z / Ctrl+Shift+Z", T("sc_undo")], ["Ctrl+K", T("sc_cmd")], ["Esc", T("sc_esc")],
     ["[ / ]", T("sc_cycle")], ["Arrow keys", T("sc_nudge")], ["Shift+Arrow", T("sc_nudgeFine")], ["Delete / Backspace", T("sc_delete")],
     ["Shift+Drag", T("sc_freeDrag")]]
      .forEach(([k,d])=>{ html += `<tr><td style="padding:6px 8px;border-bottom:1px solid var(--line-2)"><code style="background:var(--panel-2);border:1px solid var(--line);border-radius:6px;padding:2px 7px;font-weight:700">${k}</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--line-2);color:var(--ink-2)">${d}</td></tr>`; });
    html += "</table>";
    openModal(T("helpTitle"), html, true);
  }
  function techPack(){
    const pieces=Canvas.getPieces(); if(!pieces.length){toast(T("empty2d"));return;}
    const m=currentMeas();
    let html=`<h2 style="margin-bottom:8px">${state.loaded?L(PATTERNS[state.loaded].name):"Tech Pack"}</h2>`;
    html+=`<p style="color:var(--ink-2);font-size:13px;margin-bottom:14px">${T("gradedTo")}: ${state.kids?L(KIDS_AGES.find(a=>a.id===state.kids).label):state.size} · ${T("std_"+state.standard)}</p>`;
    html+=`<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="text-align:start"><th style="text-align:start;padding:6px;border-bottom:1px solid var(--line)">${T("pieces")}</th><th style="padding:6px;border-bottom:1px solid var(--line)">EN / AR</th></tr>`;
    pieces.forEach(p=>{html+=`<tr><td style="padding:6px;border-bottom:1px solid var(--line-2)">${L(p.name)}</td><td style="padding:6px;border-bottom:1px solid var(--line-2);color:var(--ink-2)">${p.name[state.lang==="ar"?"en":"ar"]}</td></tr>`;});
    html+=`</table><h3 style="margin:16px 0 6px">${T("customMeas")}</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px">`;
    MEAS_KEYS.forEach(k=>html+=`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line-2)"><span>${T("m_"+k)}</span><b>${m[k]} cm</b></div>`);
    html+="</div>";
    openModal("Tech Pack", html, true);
  }

  // ================= CHECK PATTERN (WP-0.4) =================
  const CP_COLOR = { pass: "var(--ok)", warn: "var(--warn)", fail: "var(--danger)", deferred: "var(--ink-2)" };
  // `confidence`: null for per-piece checks (no pairing involved, no badge);
  // 'verified' for a crossPiece pair matched by a real declared role
  // (WP-25 — js/validate.js's pairByRole); 'heuristic' for one matched by
  // name-guessing (js/validate.js's pairFrontBack, the pre-WP-25 fallback).
  function cpChip(checkKey, result, confidence){
    const color = CP_COLOR[result.status] || "var(--ink-2)";
    const note = confidence === 'verified' ? T("cp_verifiedNote") : confidence === 'heuristic' ? T("cp_heuristicNote") : "";
    const title = [result.message, note].filter(Boolean).join(" — ");
    const badge = confidence === 'verified' ? ` · ${T("cp_verified")}` : confidence === 'heuristic' ? ` · ${T("cp_heuristic")}` : "";
    return `<span title="${title.replace(/"/g,'&quot;')}" style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;border:1px solid ${color};color:${color};font-size:11px;font-weight:700;white-space:nowrap">
      ${T("cp_"+checkKey)}${badge}: ${T("cp_"+result.status)}
    </span>`;
  }
  function runCheckPattern(){
    const pieces=Canvas.getPieces(); if(!pieces.length){toast(T("empty2d"));return;}
    // WP-24: bodyChestCm lets Ease compare a hinted piece's finished chest
    // against the actual wearer body — without it Ease honestly reports
    // "not applicable" for every piece rather than guessing a body.
    const report = PatternValidator.run(pieces, { seamAllowanceCm: state.seamCm||1, offsetPoly: Canvas.offsetPoly, bodyChestCm: currentMeas().chest });
    const s = report.summary;
    let html = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <span style="color:var(--ok);font-weight:700">${s.pass||0} ${T("cp_pass")}</span>
      <span style="color:var(--warn);font-weight:700">${s.warn||0} ${T("cp_warn")}</span>
      <span style="color:var(--danger);font-weight:700">${s.fail||0} ${T("cp_fail")}</span>
      <span style="color:var(--ink-2);font-weight:700">${s.deferred||0} ${T("cp_deferred")}</span>
    </div>`;

    html += `<h3 style="margin:10px 0 6px">${T("cp_perPiece")}</h3>`;
    report.perPiece.forEach((p)=>{
      html += `<div style="padding:8px 0;border-bottom:1px solid var(--line-2)">
        <div style="font-weight:700;margin-bottom:6px">${p.label}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${Object.entries(p.checks).map(([k,r])=>cpChip(k,r,null)).join("")}
        </div>
      </div>`;
    });

    if (report.crossPiece.length){
      html += `<h3 style="margin:14px 0 6px">${T("cp_crossPiece")}</h3>`;
      report.crossPiece.forEach((p)=>{
        const confidence = p.verified ? 'verified' : 'heuristic';
        html += `<div style="padding:8px 0;border-bottom:1px solid var(--line-2)">
          <div style="font-weight:700;margin-bottom:6px">${p.label}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${Object.entries(p.checks).map(([k,r])=>cpChip(k,r,confidence)).join("")}
          </div>
        </div>`;
      });
    }

    openModal(T("checkPattern"), html, true);
  }

  // ================= MARKER-MAKING (client-side bounding-box nesting) =================
  // Shelf/FFDH bin packing over each piece's axis-aligned bounding box — not true
  // polygon (NFP) nesting. Simple, fast, always safe; the preview is explicitly
  // captioned as a simplified box approximation rather than an exact cutting layout.
  function nestShelfPack(items, matWidth, allowRotate, minDist){
    const sorted = items.slice().sort((a,b)=> Math.max(b.w,b.h) - Math.max(a.w,a.h));
    const shelves = [];
    let cur = null;
    sorted.forEach(it=>{
      const orients = allowRotate ? [{w:it.w,h:it.h},{w:it.h,h:it.w}] : [{w:it.w,h:it.h}];
      let choice = cur && orients.find(o => cur.x + (cur.items.length?minDist:0) + o.w <= matWidth && o.h <= cur.height + 1e-6);
      if(!choice){
        const fitting = orients.filter(o=>o.w<=matWidth);
        choice = (fitting.length?fitting:orients).slice().sort((a,b)=>a.h-b.h)[0];
        const y = cur ? cur.y+cur.height+minDist : 0;
        cur = { y, height: choice.h, x:0, items: [] };
        shelves.push(cur);
      }
      const gap = cur.items.length ? minDist : 0;
      const x = cur.x + gap;
      cur.items.push({ label: it.label, x, y: cur.y, w: choice.w, h: choice.h });
      cur.x = x + choice.w;
    });
    const totalHeight = shelves.length ? shelves[shelves.length-1].y + shelves[shelves.length-1].height : 0;
    return { placed: shelves.flatMap(s=>s.items), totalHeight };
  }
  function drawNestPreview(canvas, result, matWidth, matLength){
    const ctx = canvas.getContext("2d"); const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    const h = Math.max(result.totalHeight, matLength*0.15, 10);
    const scale = Math.min((W-20)/matWidth, (H-20)/h);
    ctx.save(); ctx.translate(10,10);
    const line = getComputedStyle(document.body).getPropertyValue("--line").trim()||"#ccc";
    ctx.strokeStyle=line; ctx.lineWidth=1; ctx.strokeRect(0,0,matWidth*scale,result.totalHeight*scale);
    ctx.setLineDash([4,3]);
    for(let y=matLength; y<result.totalHeight; y+=matLength){ ctx.beginPath(); ctx.moveTo(0,y*scale); ctx.lineTo(matWidth*scale,y*scale); ctx.stroke(); }
    ctx.setLineDash([]);
    result.placed.forEach((p,i)=>{
      const c = PALETTE[i%PALETTE.length];
      ctx.fillStyle = c+"33"; ctx.strokeStyle = c; ctx.lineWidth=1.5;
      ctx.fillRect(p.x*scale, p.y*scale, p.w*scale, p.h*scale);
      ctx.strokeRect(p.x*scale, p.y*scale, p.w*scale, p.h*scale);
      ctx.fillStyle = "#1a1a1a"; ctx.font = "10px Inter, sans-serif"; ctx.textBaseline="top";
      ctx.fillText(p.label, p.x*scale+3, p.y*scale+3, Math.max(0,p.w*scale-6));
    });
    ctx.restore();
  }
  // WP-11: draws the TRUE polygon-nest result (real outline shapes, not
  // bounding boxes) — same canvas/scale-fitting approach as
  // drawNestPreview above, but tracing each piece's actual placed
  // polygon so a piece visibly nests into another's concave notch
  // instead of just stacking rectangles.
  function drawNestPreviewPolygons(canvas, placements, matWidth){
    const ctx = canvas.getContext("2d"); const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    const totalHeight = placements.reduce((m,p)=>Math.max(m,...p.poly.map(pt=>pt[1])), 0);
    const h = Math.max(totalHeight, 10);
    const scale = Math.min((W-20)/matWidth, (H-20)/h);
    ctx.save(); ctx.translate(10,10);
    const line = getComputedStyle(document.body).getPropertyValue("--line").trim()||"#ccc";
    ctx.strokeStyle=line; ctx.lineWidth=1; ctx.strokeRect(0,0,matWidth*scale,totalHeight*scale);
    placements.forEach((p,i)=>{
      const c = PALETTE[i%PALETTE.length];
      ctx.fillStyle = c+"33"; ctx.strokeStyle = c; ctx.lineWidth=1.5;
      ctx.beginPath();
      p.poly.forEach(([x,y],j)=>{ const px=x*scale, py=y*scale; j===0?ctx.moveTo(px,py):ctx.lineTo(px,py); });
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#1a1a1a"; ctx.font = "10px Inter, sans-serif"; ctx.textBaseline="top";
      const bx = Math.min(...p.poly.map(pt=>pt[0])), by = Math.min(...p.poly.map(pt=>pt[1]));
      ctx.fillText(p.label, bx*scale+3, by*scale+3);
    });
    ctx.restore();
  }
  function openMarkerModal(){
    const pieces = Canvas.getPieces();
    if(!pieces.length){ toast(T("empty2d")); return; }
    openModal(T("createMarker"), "", true);
    const body = $("#genericModal .modal-body"); body.innerHTML="";

    const matField = el("div","field");
    matField.innerHTML = `<label>${T("markerMaterial")}</label>
      <select class="input mk-mat">
        <option value="">${T("pieceMaterialDefault")}</option>
        ${FABRICS.map(f=>`<option value="${f.key}">${T("fab_"+f.key)}</option>`).join("")}
      </select>`;
    body.appendChild(matField);

    const pcsField = el("div","field"); pcsField.style.marginTop="12px";
    pcsField.innerHTML = `<label>${T("markerPieces")} · <span class="mk-count"></span></label>`;
    const pcsList = el("div"); pcsList.style.cssText="max-height:140px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px";
    const checks = pieces.map((p,i)=>{
      const row = el("label"); row.style.cssText="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:12.5px";
      const cb = el("input"); cb.type="checkbox"; cb.checked=true;
      row.appendChild(cb); row.appendChild(el("span",null,L(p.name)));
      pcsList.appendChild(row); return cb;
    });
    pcsField.appendChild(pcsList); body.appendChild(pcsField);
    const updateCount = () => { pcsField.querySelector(".mk-count").textContent = `${checks.filter(c=>c.checked).length} / ${checks.length}`; };
    checks.forEach(cb=>cb.onchange=updateCount); updateCount();

    const row1 = el("div","row"); row1.style.cssText="display:flex;gap:10px;margin-top:12px";
    const wField = el("div","field"); wField.style.flex="1"; wField.innerHTML=`<label>${T("markerWidth")}</label>`;
    const wInp = el("input","input"); wInp.type="number"; wInp.min="20"; wInp.value="160"; wField.appendChild(wInp);
    const lField = el("div","field"); lField.style.flex="1"; lField.innerHTML=`<label>${T("markerLength")}</label>`;
    const lInp = el("input","input"); lInp.type="number"; lInp.min="20"; lInp.value="250"; lField.appendChild(lInp);
    row1.appendChild(wField); row1.appendChild(lField); body.appendChild(row1);
    body.appendChild(el("div","help-note",T("markerLengthNote"))).style.marginTop="4px";

    const row2 = el("div","row"); row2.style.cssText="display:flex;gap:10px;margin-top:12px";
    const rField = el("div","field"); rField.style.flex="1"; rField.innerHTML=`<label>${T("markerRotation")}</label>
      <select class="input mk-rot"><option value="none">${T("markerRotNone")}</option><option value="any" selected>${T("markerRotAny")}</option></select>`;
    const dField = el("div","field"); dField.style.flex="1"; dField.innerHTML=`<label>${T("markerMinDist")}</label>`;
    const dInp = el("input","input"); dInp.type="number"; dInp.min="0"; dInp.step="0.1"; dInp.value="0.1"; dField.appendChild(dInp);
    row2.appendChild(rField); row2.appendChild(dField); body.appendChild(row2);

    // WP-11: true polygon nesting alongside the original instant
    // bounding-box packer — defaults to "fast" so nothing changes for an
    // existing user until they opt into the slower, tighter mode.
    const modeField = el("div","field"); modeField.style.marginTop="12px";
    modeField.innerHTML = `<label>${T("markerMode")}</label>`;
    const modeSeg = el("div","seg");
    modeSeg.innerHTML = `<button class="active" data-mode="fast">${T("markerModeFast")}</button><button data-mode="full">${T("markerModeFull")}</button>`;
    modeField.appendChild(modeSeg); body.appendChild(modeField);
    const noteEl = body.appendChild(el("div","help-note",T("markerPreviewNote")));
    noteEl.style.marginTop="6px";
    let mode = "fast";
    [...modeSeg.children].forEach(b=>b.onclick=()=>{
      mode = b.dataset.mode;
      [...modeSeg.children].forEach(x=>x.classList.toggle("active", x===b));
      noteEl.textContent = mode==="fast" ? T("markerPreviewNote") : T("markerFullNote");
    });

    const canvas = el("canvas"); canvas.width=680; canvas.height=380;
    canvas.style.cssText="width:100%;height:auto;margin-top:14px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2)";
    body.appendChild(canvas);

    const yardEl = el("div","help-note"); yardEl.style.marginTop="8px"; yardEl.textContent=T("markerYardageHint");
    const btnRow = el("div","row"); btnRow.style.cssText="display:flex;gap:8px;margin-top:12px";
    const nestBtn = el("button","big-btn",T("markerNest")); nestBtn.style.flex="1";
    const stopBtn = el("button","big-btn ghost",T("markerStop")); stopBtn.style.flex="1";
    btnRow.appendChild(nestBtn); btnRow.appendChild(stopBtn);
    body.appendChild(btnRow); body.appendChild(yardEl);

    let fullNestRunning = false;
    stopBtn.onclick = () => { if(fullNestRunning) cancelNest(); else toast(T("markerInstant")); };

    nestBtn.onclick = async () => {
      const matFilter = body.querySelector(".mk-mat").value;
      const selected = pieces.filter((p,i)=>checks[i].checked && (!matFilter || (p.material||state.fabric3d)===matFilter));
      if(!selected.length){ toast(T("empty2d")); return; }
      const matWidth = +wInp.value||160, matLength = +lInp.value||250;
      const allowRotate = rField.querySelector(".mk-rot").value==="any";
      const minDistCm = +dInp.value||0;

      if(mode==="fast"){
        const items = selected.map(p=>{
          const xs=p.outline.map(pt=>pt[0]), ys=p.outline.map(pt=>pt[1]);
          return { label:L(p.name), w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys) };
        });
        const result = nestShelfPack(items, matWidth, allowRotate, minDistCm);
        drawNestPreview(canvas, result, matWidth, matLength);
        state.lastMarkerYards = result.totalHeight/100; state.lastMarkerWidth = matWidth; save();
        yardEl.innerHTML = `${T("markerYardage")}: <b>${state.lastMarkerYards.toFixed(2)} m</b> @ ${matWidth}cm`;
        renderExportPane();
        return;
      }

      // Full nest: real polygon outlines, in a Worker (js/nesting.js) so
      // the UI stays responsive — see WP-11's own honest-notes for why
      // this is bottom-left-fill + simulated annealing over true overlap
      // testing rather than literal Minkowski-NFP + convex decomposition.
      const idToLabel = {}; selected.forEach((p,i)=>{ idToLabel[i]=L(p.name); });
      const nestPieces = selected.map((p,i)=>({
        id: i, outline: p.outline,
        grainLocked: !!(p.grain && p.grain.length>=2 && p.grainline!=="bias"),
      }));
      fullNestRunning = true;
      nestBtn.disabled = true; nestBtn.textContent = T("markerNesting");
      try {
        const result = await nestTruePolygon(
          { pieces: nestPieces, matWidth, allowRotate, minDistCm },
          (p)=>{ yardEl.innerHTML = `${T("markerNesting")} ${Math.round(p.utilization*100)}%`; },
        );
        fullNestRunning = false;
        nestBtn.disabled = false; nestBtn.textContent = T("markerNest");
        if(result.error){ toast(result.error); return; }
        const placements = result.placements.map(pl=>({ ...pl, label: idToLabel[pl.id] }));
        drawNestPreviewPolygons(canvas, placements, matWidth);
        state.lastMarkerYards = result.totalHeight/100; state.lastMarkerWidth = matWidth; save();
        const utilPct = Math.round(result.utilization*100);
        yardEl.innerHTML = `${T("markerYardage")}: <b>${state.lastMarkerYards.toFixed(2)} m</b> @ ${matWidth}cm`
          + ` · ${T("markerUtilization")}: <b>${utilPct}%</b>`
          + (result.cancelled ? ` — ${T("markerCancelled")}` : "");
        renderExportPane();
      } catch(err){
        fullNestRunning = false;
        nestBtn.disabled = false; nestBtn.textContent = T("markerNest");
        toast(String(err && err.message || err));
      }
    };
  }

  // ================= PATTERN SUMMARY (one-page, print-ready) =================
  // A condensed bilingual sheet — size table + a small labelled diagram per
  // piece with width/height call-outs + a construction note. Distinct from
  // the full Tech Pack: this is meant to be printed or saved as a single PDF.
  function pieceBBox(outline){
    const xs=outline.map(p=>p[0]), ys=outline.map(p=>p[1]);
    return { minX:Math.min(...xs), minY:Math.min(...ys), maxX:Math.max(...xs), maxY:Math.max(...ys) };
  }
  function dimLineH(x1,x2,y,val,fs,sw){
    const a=fs*0.6, mid=(x1+x2)/2;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#333" stroke-width="${sw}"/>
      <line x1="${x1}" y1="${y-a}" x2="${x1}" y2="${y+a}" stroke="#333" stroke-width="${sw}"/>
      <line x1="${x2}" y1="${y-a}" x2="${x2}" y2="${y+a}" stroke="#333" stroke-width="${sw}"/>
      <rect x="${mid-fs*1.6}" y="${y+fs*0.35}" width="${fs*3.2}" height="${fs*1.15}" fill="#fff" opacity="0.85"/>
      <text x="${mid}" y="${y+fs*1.25}" font-size="${fs}" text-anchor="middle" fill="#222">${val.toFixed(1)}cm</text>`;
  }
  function dimLineV(y1,y2,x,val,fs,sw){
    const a=fs*0.6, mid=(y1+y2)/2;
    return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#333" stroke-width="${sw}"/>
      <line x1="${x-a}" y1="${y1}" x2="${x+a}" y2="${y1}" stroke="#333" stroke-width="${sw}"/>
      <line x1="${x-a}" y1="${y2}" x2="${x+a}" y2="${y2}" stroke="#333" stroke-width="${sw}"/>
      <text x="${x+fs*1.3}" y="${mid}" font-size="${fs}" text-anchor="middle" fill="#222" transform="rotate(-90 ${x+fs*1.3} ${mid})">${val.toFixed(1)}cm</text>`;
  }
  function pieceDiagramSVG(p){
    const b=pieceBBox(p.outline), w=b.maxX-b.minX||1, h=b.maxY-b.minY||1;
    const pad=Math.max(w,h)*0.14+2, rp=pad+Math.max(w,h)*0.22, bp=pad+Math.max(w,h)*0.16;
    const vbX=b.minX-pad, vbY=b.minY-pad, vbW=w+pad+rp, vbH=h+pad+bp;
    const pts=p.outline.map(pt=>pt.join(",")).join(" ");
    const col=p.color||"#6d5efc", fs=Math.max(w,h)*0.055, sw=Math.max(w,h)*0.01;
    let s=`<svg viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="100%" height="168" preserveAspectRatio="xMidYMid meet">`;
    s+=`<polygon points="${pts}" fill="${col}" fill-opacity="0.14" stroke="${col}" stroke-width="${sw}"/>`;
    (p.grain&&p.grain.length===2? [p.grain] : []).forEach(g=>{
      s+=`<line x1="${g[0][0]}" y1="${g[0][1]}" x2="${g[1][0]}" y2="${g[1][1]}" stroke="${col}" stroke-width="${sw*0.8}" stroke-dasharray="${sw*2},${sw}"/>`;
    });
    s+=dimLineH(b.minX,b.maxX,b.maxY+pad*0.55,w,fs,sw);
    s+=dimLineV(b.maxY,b.minY,b.maxX+pad*0.55,h,fs,sw);
    return s+"</svg>";
  }
  function buildSummaryHTML(){
    const pieces=Canvas.getPieces(); const m=currentMeas();
    const nameObj = state.loaded ? PATTERNS[state.loaded].name : { en:T("customPattern"), ar:T("customPattern") };
    const descObj = state.loaded ? PATTERNS[state.loaded].desc : null;
    const sizeLbl = state.kids ? L(KIDS_AGES.find(a=>a.id===state.kids).label) : state.size;
    const seamCm = Canvas.getOpt("seamCm");
    const rows=[["m_chest","chest"],["m_waist","waist"],["m_hips","hips"],["m_shoulder","shoulder"],["m_sleeve","sleeve"]];
    const rtl = state.lang==="ar";
    const piecesHTML = pieces.map((p,i)=>`
      <div class="sp-box">
        <div class="sp-head"><span class="sp-num">${i+1}</span><span class="sp-name">${p.name.en}</span><span class="sp-name-ar">${p.name.ar}</span></div>
        ${pieceDiagramSVG(p)}
      </div>`).join("");
    return `<!doctype html><html lang="${state.lang}" dir="${rtl?"rtl":"ltr"}"><head><meta charset="utf-8">
<title>BerryStudio — ${nameObj.en} · ${T("patternSummary")}</title>
<style>
  @page{margin:14mm}
  *{box-sizing:border-box}
  body{font-family:${rtl?"'Cairo','Segoe UI'":"'Segoe UI'"},Tahoma,Arial,sans-serif;color:#1a1a1a;margin:0;padding:22px;background:#fff}
  h1{font-size:21px;margin:0 0 3px}
  h1 span{color:#8a8a8a;font-weight:600;font-size:16px}
  .sub{font-size:13px;color:#666;margin:0 0 16px}
  .top{display:grid;grid-template-columns:1.1fr 1fr;gap:16px;margin-bottom:20px;align-items:start}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border:1px solid #ddd;padding:7px 10px;text-align:center}
  th{background:#f1eeff;font-weight:700}
  .refbox{font-size:12.5px;color:#444;line-height:1.7;border:1px solid #eee;border-radius:10px;padding:12px;background:#fafafa;height:100%}
  .refbox b{display:block;font-size:13.5px;margin-bottom:4px;color:#111}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
  .sp-box{border:1px solid #ddd;border-radius:10px;padding:10px;background:#fcfcfc}
  .sp-head{display:flex;align-items:center;gap:7px;margin-bottom:6px;font-weight:700;font-size:12.5px;flex-wrap:wrap}
  .sp-num{width:20px;height:20px;flex:none;border-radius:50%;background:#6d5efc;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px}
  .sp-name-ar{color:#6d5efc;font-weight:600}
  .note{margin-top:20px;border:1px dashed #c9a94a;background:#fff8e6;padding:11px 15px;border-radius:9px;font-size:12.5px;color:#7a5c00;line-height:1.6}
  .pbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px}
  .pbar button{font-family:inherit;font-size:13px;font-weight:700;padding:9px 16px;border-radius:8px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer}
  .pbar button.primary{background:#6d5efc;color:#fff;border-color:#6d5efc}
  @media print{.pbar{display:none}}
</style></head>
<body>
  <div class="pbar"><button onclick="window.close()">${T("close")}</button><button class="primary" onclick="window.print()">${T("printNow")}</button></div>
  <h1>${nameObj.en} <span>/ ${nameObj.ar}</span></h1>
  <p class="sub">BerryStudio · ${T("gradedTo")}: ${sizeLbl} · ${T("std_"+state.standard)}</p>
  <div class="top">
    <table>
      <tr><th>${T("tab_measure")}</th><th>cm</th></tr>
      ${rows.map(([lk,mk])=>`<tr><td>${T(lk)}</td><td>${m[mk]}</td></tr>`).join("")}
    </table>
    <div class="refbox"><b>${nameObj.en} / ${nameObj.ar}</b>${descObj?L(descObj):""}</div>
  </div>
  <div class="grid">${piecesHTML}</div>
  <div class="note">${T("summaryNote").replace("{n}",seamCm)}</div>
</body></html>`;
  }
  function exportSummary(){
    if(!Canvas.getPieces().length){ toast(T("empty2d")); return; }
    const w=window.open("","_blank");
    if(!w){ toast(T("patternSummary")+": allow pop-ups"); return; }
    w.document.write(buildSummaryHTML()); w.document.close();
    toast(T("exported")+" · "+T("patternSummary"));
  }

  // ================= BILL OF MATERIALS =================
  // Notions are derived from what's actually in the loaded pattern — piece
  // roles/names that already carry real signal (e.g. fancy-patterns.js's
  // "Zip Placket Facing" pieces, cuff/waistband roles) — rather than a
  // fixed guessed list, so an empty/simple pattern gets a short, honest BOM
  // and a coat/suit gets a real one. Front-button count is the one estimate
  // (industry ~10-12cm spacing over the back length) and is labelled as such.
  function buildBomFabricConsumption(){
    const m=currentMeas();
    const yards = state.lastMarkerYards!=null ? +state.lastMarkerYards.toFixed(2) : +((m.height/100)*(state.category==="women"?1.8:1.5)).toFixed(2);
    const width = state.lastMarkerWidth || 160;
    return { yards, width };
  }
  function buildBomItems(pieces){
    const m=currentMeas();
    const { yards, width } = buildBomFabricConsumption();
    const isZipPlacket = p => p.role==="placket-facing" && /zip/i.test((p.name&&p.name.en)||"");
    const buttonFrontPiece = p => p.role==="lapel-facing" && !isZipPlacket(p);
    const zipPresent = pieces.some(isZipPlacket);
    const cuffCount = pieces.filter(p=>p.role==="cuff").length;
    const waistbandCount = pieces.filter(p=>p.role==="waistband").length;
    const buttonFrontPresent = pieces.some(buttonFrontPiece);
    const liningNeeded = pieces.some(p=>p.role==="lapel-facing"||p.role==="placket-facing");
    const interfacingNeeded = pieces.some(p=>["collar","cuff","waistband","lapel-facing","placket-facing"].includes(p.role));

    const items = [];
    items.push({ item:T("bomMainFabric"), qty:`${yards} m`, note:`@ ${width}cm — ${T("bomFabricDefault")}` });
    if(liningNeeded) items.push({ item:T("bomLining"), qty:`${+(yards*0.4).toFixed(2)} m`, note:T("bomLiningNote") });
    if(interfacingNeeded) items.push({ item:T("bomInterfacing"), qty:"0.3 m", note:T("bomInterfacingNote") });
    if(zipPresent) items.push({ item:T("bomZipper"), qty:"1", note:`≈${Math.round(m.backLen*0.6)} cm` });
    if(cuffCount) items.push({ item:T("bomButtonsCuff"), qty:String(cuffCount), note:T("bomButtonsCuffNote") });
    if(waistbandCount) items.push({ item:T("bomClosureWaistband"), qty:String(waistbandCount), note:T("bomClosureWaistbandNote") });
    if(buttonFrontPresent) items.push({ item:T("bomButtonsFront"), qty:String(Math.max(2,Math.round(m.backLen/12))), note:T("bomButtonsFrontNote") });
    items.push({ item:T("bomThread"), qty:"1", note:T("bomThreadNote") });
    items.push({ item:T("bomLabels"), qty:"1", note:T("bomLabelsNote") });
    return items;
  }
  function buildBomHTML(){
    const pieces=Canvas.getPieces();
    const nameObj = state.loaded ? PATTERNS[state.loaded].name : { en:T("customPattern"), ar:T("customPattern") };
    const sizeLbl = state.kids ? L(KIDS_AGES.find(a=>a.id===state.kids).label) : state.size;
    const rtl = state.lang==="ar";
    const items = buildBomItems(pieces);
    const itemsHTML = items.map(row=>`<tr><td style="text-align:${rtl?"end":"start"}">${row.item}</td><td>${row.qty}</td><td style="color:#666;font-size:12px">${row.note}</td></tr>`).join("");
    const cuttingHTML = pieces.map((p,i)=>`<tr><td style="text-align:${rtl?"end":"start"}">${i+1}. ${p.name.en} / ${p.name.ar}</td><td>${p.cutOnFold?T("cutOnFold"):"—"}</td><td>${p.color||""}</td></tr>`).join("");
    return `<!doctype html><html lang="${state.lang}" dir="${rtl?"rtl":"ltr"}"><head><meta charset="utf-8">
<title>BerryStudio — ${nameObj.en} · ${T("bom")}</title>
<style>
  @page{margin:14mm}
  *{box-sizing:border-box}
  body{font-family:${rtl?"'Cairo','Segoe UI'":"'Segoe UI'"},Tahoma,Arial,sans-serif;color:#1a1a1a;margin:0;padding:22px;background:#fff}
  h1{font-size:21px;margin:0 0 3px}
  h1 span{color:#8a8a8a;font-weight:600;font-size:16px}
  .sub{font-size:13px;color:#666;margin:0 0 16px}
  h2{font-size:15px;margin:22px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border:1px solid #ddd;padding:7px 10px;text-align:center}
  th{background:#f1eeff;font-weight:700}
  .pbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px}
  .pbar button{font-family:inherit;font-size:13px;font-weight:700;padding:9px 16px;border-radius:8px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer}
  .pbar button.primary{background:#6d5efc;color:#fff;border-color:#6d5efc}
  @media print{.pbar{display:none}}
</style></head>
<body>
  <div class="pbar"><button onclick="window.close()">${T("close")}</button><button class="primary" onclick="window.print()">${T("printNow")}</button></div>
  <h1>${nameObj.en} <span>/ ${nameObj.ar}</span></h1>
  <p class="sub">BerryStudio · ${T("bom")} · ${T("gradedTo")}: ${sizeLbl} · ${T("std_"+state.standard)}</p>
  <h2>${T("bom")}</h2>
  <table><tr><th>${T("bomItem")}</th><th>${T("bomQty")}</th><th>${T("bomNotes")}</th></tr>${itemsHTML}</table>
  <h2>${T("bomCuttingList")}</h2>
  <table><tr><th>${T("pieces")}</th><th>${T("cutOnFold")}</th><th>${T("pieceColor")}</th></tr>${cuttingHTML}</table>
</body></html>`;
  }
  function exportBom(){
    const pieces=Canvas.getPieces(); if(!pieces.length){ toast(T("empty2d")); return; }
    const w=window.open("","_blank");
    if(!w){ toast(T("bom")+": allow pop-ups"); return; }
    w.document.write(buildBomHTML()); w.document.close();
    toast(T("exported")+" · "+T("bom"));
  }

  // ================= PATTERNS =================
  function currentMeas(){ return computeMeasurements({category:state.category,size:state.size,standard:state.standard,kids:state.kids,custom:state.custom}); }
  function loadPattern(id){
    state.loaded=id; const p=PATTERNS[id];
    // switch category to match
    if(p.category && p.category!==state.category){ state.category=p.category; syncCategoryUI(); }
    const opts={category:state.category,size:state.size,standard:state.standard,kids:state.kids,custom:state.custom};
    Canvas.setPattern(resolveGradedPieces(p, opts, computeMeasurements, state.gradeRules[id]), PALETTE);
    afterLoad(L(p.name));
  }
  function afterLoad(name){ hideEmpty(); renderLayersPane(); renderSizePane(); toast(T("patternLoaded")+" · "+name); if(state.view==="3d") build3D(); save(); }
  function grade(){
    if(state.loaded){
      const p=PATTERNS[state.loaded];
      const opts={category:state.category,size:state.size,standard:state.standard,kids:state.kids,custom:state.custom};
      const pieces=resolveGradedPieces(p, opts, computeMeasurements, state.gradeRules[state.loaded]);
      Canvas.setPattern(pieces, PALETTE); renderLayersPane(); if(state.view==="3d") build3D();
    }
    Canvas.recomputeConstruction();   // re-resolve any formula-driven construction points to the new measurements
    updateGradeLbl(); updateStageChips(); renderSizePane(); save();
  }

  // ================= 3D =================
  function colorToInt(c){
    if(!c) return cssHex("--brand");
    if(c[0]==="#"){ const h=c.length===4 ? c.slice(1).split("").map(x=>x+x).join("") : c.slice(1); return parseInt(h,16); }
    const m=/(\d+)\D+(\d+)\D+(\d+)/.exec(c); return m ? (+m[1]<<16)|(+m[2]<<8)|+m[3] : cssHex("--brand");
  }
  const fabricOpacity3D = () => Math.max(0.5, Math.min(1, 0.62 + Canvas.getOpt("fillOpacity")*0.6));
  function pieceVisMap(){ return Canvas.getPieces().map(p=>({ key:(p.name&&p.name.en)||"", visible:p.visible!==false })); }
  // Mirrors the part-classification regex in three-view.js's applyPieceVisibility() —
  // the procedural 3D body only has 4 named mesh groups, so material (like visibility)
  // is assigned per-part, picking the first visible piece that maps to each part.
  function classifyPart(name){
    const k=(name||"").toLowerCase();
    return /sleeve|كم/.test(k) ? "sleeve"
      : /skirt|تنور/.test(k) ? "skirt"
      : /trouser|بنطل|pant|\bleg\b/.test(k) ? "trousers" : "bodice";
  }
  function isBackPiece(name){ return /\bback\b|خلفي|خلفية/.test((name||"").toLowerCase()); }
  // A part's mesh used to just take the FIRST matching piece's color/material and
  // silently drop every other one — a front+back bodice/skirt with a different
  // fabric or color (common: contrast lining, color-blocked panels) lost the back
  // piece's styling entirely, since the procedural body has one continuous
  // front+back shell per part, not one mesh per real 2D piece. WP-28 split each
  // part's mesh into a real front sub-mesh and a real back sub-mesh in
  // three-view.js, so this now hands over a full {color,material} pair for
  // `back` (not just a color) whenever a distinct back piece exists. A part with
  // only one piece (the overwhelmingly common case) still gets exactly the same
  // single `front` descriptor as before and `back` stays null, unchanged.
  function partsFabric(){
    const buckets={};
    Canvas.getPieces().filter(p=>p.visible!==false).forEach(p=>{
      const part=classifyPart(p.name&&p.name.en);
      const back = isBackPiece(p.name&&p.name.en) || isBackPiece(p.name&&p.name.ar);
      (buckets[part] ||= {front:[], back:[]})[back?"back":"front"].push(p);
    });
    const parts={};
    Object.entries(buckets).forEach(([part,{front,back}])=>{
      const primary = front[0] || back[0];
      const frontDesc = { color:colorToInt(primary.color), material:primary.material||state.fabric3d||"cotton" };
      parts[part] = { front: frontDesc };
      if (back.length){
        const backDesc = { color:colorToInt(back[0].color), material:back[0].material||state.fabric3d||"cotton" };
        // Only a genuinely distinct back piece is worth a separate sub-mesh
        // material — one matching front exactly (color AND fabric) has
        // nothing to render differently, so leave the back mesh mirroring
        // front instead of manufacturing a no-op override.
        const sameAsFront = front.length && backDesc.color===frontDesc.color && backDesc.material===frontDesc.material;
        if (!sameAsFront) parts[part].back = backDesc;
      }
    });
    return parts;
  }
  function build3D(colorInt){
    const m=currentMeas(); const pieces=Canvas.getPieces();
    const fv=pieces.find(p=>p.visible!==false);
    View3D.build(state.category, m, {
      color: colorInt!=null ? colorInt : (fv ? colorToInt(fv.color) : cssHex("--brand")),
      material: state.fabric3d || "cotton", opacity: fabricOpacity3D(), pieces: pieceVisMap(),
      parts: partsFabric(),
    });
  }
  // live 3D updates (no full rebuild)
  function sync3DFabric(){ if(state.view!=="3d") return;
    View3D.setFabric({ parts: partsFabric(), opacity: fabricOpacity3D() }); }
  function sync3DVisibility(){ if(state.view!=="3d") return; View3D.setPieceVisibility(pieceVisMap()); }
  function cssHex(k){ const t=document.createElement("canvas").getContext("2d");t.fillStyle=getComputedStyle(document.body).getPropertyValue(k).trim();return parseInt(t.fillStyle.slice(1),16);}
  function setView(v){
    state.view=v;
    $("#view3d").classList.toggle("show", v==="3d");
    $("#viewClothLab").classList.toggle("show", v==="clothlab");
    $("#viewClothLab").classList.toggle("engine-embedded", state.clothLabEngine==="embedded");
    document.querySelector(".canvas-wrap").classList.toggle("threed", v==="3d");
    document.querySelector(".canvas-wrap").classList.toggle("clothlab", v==="clothlab");
    $$("#viewToggle button").forEach(b=>{ const on=b.dataset.v===v; b.classList.toggle("active",on); b.setAttribute("aria-pressed",on); });
    if(v==="3d"){ View3D.resize(); build3D(); }
    else if(v==="clothlab"){ loadClothLab(); syncClothLab(); }
    else Canvas.render();
    save();
  }
  // cloth-lab is a separate React/R3F app (own build+deploy, see cloth-lab/
  // and .github/workflows/deploy-pages.yml). Two mount strategies (WP-5),
  // gated by state.clothLabEngine — dispatch lives here so setView()'s own
  // clothlab branch (and syncClothLab() below) never need to know which one
  // is active. "iframe" (default): src set lazily on first switch so it
  // isn't loaded (and its GPU work isn't running) unless the user actually
  // opens this tab. "embedded": cloth-lab's lib build (cloth-lab/dist-embed/,
  // WP-5.4) dynamically imported and mounted directly into #clothLabEmbed —
  // same lazy-on-first-switch principle, just no iframe/postMessage
  // boundary to cross.
  function loadClothLab(){
    if(state.clothLabEngine==="embedded"){ mountClothLabEmbedded(); return; }
    const frame=$("#clothLabFrame");
    if(frame.dataset.loaded) return;
    const isLocal=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    frame.src = isLocal ? "http://localhost:5173/" : "cloth-lab/";
    frame.dataset.loaded="1";
  }
  // `clothLabEmbedModule` holds the {update, unmount} handle mount() returns
  // once the dynamic import + first render actually complete — syncClothLab()
  // reads it to push later pattern updates. `clothLabEmbedLoadPromise` guards
  // against double-mounting if the user flips tabs again before the first
  // import finishes (dynamic import() itself is cached by the module
  // registry, but calling mount() twice would create two React roots on the
  // same container).
  let clothLabEmbedModule = null;
  let clothLabEmbedLoadPromise = null;
  function mountClothLabEmbedded(){
    if(clothLabEmbedLoadPromise) return clothLabEmbedLoadPromise;
    const container = $("#clothLabEmbed");
    // Relative to THIS module's own URL (js/app.js), not location.origin —
    // resolves correctly whether the site is served from the domain root
    // (local dev) or a GitHub Pages subpath (production), same reasoning
    // as clothLabOrigin() below not hardcoding an origin.
    const embedUrl = new URL("../cloth-lab/dist-embed/cloth-lab-embed.js", import.meta.url).href;
    const assetBase = new URL("../cloth-lab/dist-embed/", import.meta.url).href;
    clothLabEmbedLoadPromise = import(/* @vite-ignore */ embedUrl).then((mod) => {
      clothLabEmbedModule = mod.mount(container, {
        assetBase,
        pattern: buildClothLabPayload(),
        onReady: () => { clothLabReady = true; },
      });
    }).catch((err) => {
      console.error("Cloth Lab (embedded engine) failed to load:", err);
      clothLabEmbedLoadPromise = null; // allow a retry on the next tab switch
    });
    return clothLabEmbedLoadPromise;
  }
  // Derived straight from the iframe's actual src (same-origin in production
  // — one combined GH Pages deploy; genuinely cross-origin in local dev —
  // root app on :4173, cloth-lab's own Vite dev server on :5173, per
  // .claude/launch.json) rather than re-deriving isLocal independently, so
  // this can never drift out of sync with whatever loadClothLab() actually
  // pointed the iframe at.
  function clothLabOrigin(){
    const frame=$("#clothLabFrame");
    return frame && frame.src ? new URL(frame.src).origin : location.origin;
  }
  // Majority vote over each visible piece's chosen material — both apps use
  // identical fabric key names (cotton/denim/silk/satin/chiffon/wool/linen/
  // leather), so this is a direct passthrough, not a translation.
  function dominantFabricId(){
    const counts={};
    Canvas.getPieces().forEach(p=>{ if(p.material) counts[p.material]=(counts[p.material]||0)+1; });
    let best=null, bestN=0;
    for(const k in counts) if(counts[k]>bestN){ best=k; bestN=counts[k]; }
    return best; // null → cloth-lab keeps its own current/default fabric
  }
  // What actually crosses the iframe boundary — see cloth-lab/src/App.jsx's
  // message listener (Phase 2) for how this gets turned into a simulated
  // garment. Piece outlines are already cm, already compatible; the harder
  // half-piece/role/seam conversion happens entirely on the cloth-lab side.
  function buildClothLabPayload(){
    return {
      type: "berrystudio:pattern",
      measurements: currentMeas(),
      category: state.category,
      fabricId: dominantFabricId(),
      avatarGLB: state.avatarGLB || {},
      // cloth-lab was English-only regardless of this app's own language
      // setting — the bridge already carried bilingual {en,ar} piece labels
      // (below) but nothing telling cloth-lab which one, or its own UI
      // chrome, should actually be shown. See cloth-lab/src/i18n.js.
      lang: state.lang,
      pieces: Canvas.getPieces().filter(p=>p.visible!==false).map((p,i)=>({
        id: ((p.name&&p.name.en)||"piece").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")+"_"+i,
        label: p.name || {en:"Piece "+(i+1), ar:"قطعة "+(i+1)},
        outline: p.outline,
        darts: p.darts, notches: p.notches, grain: p.grain,
        // BerryStudio-Upgrade-Plan WP-6: forward declared metadata so
        // cloth-lab's importer can use it instead of guessing from `label`
        // — see cloth-lab/src/pattern/importFromApp.js and roles.js.
        role: p.role, cutOnFold: p.cutOnFold, foldEdgeIndex: p.foldEdgeIndex,
        bilateral: p.bilateral, edges: p.edges, grainline: p.grainline,
        // The 2D canvas's own per-piece color (Layers panel swatch/picker —
        // js/canvas.js's setColor()), so cloth-lab's Cloth/Pieces views can
        // render each simulated piece in the same color it has in 2D
        // instead of a generic material tint.
        color: p.color,
      })),
    };
  }
  // Only actually posts once cloth-lab's own listener has confirmed it's
  // mounted (see wire()'s "clothlab:ready" handler) and only when the
  // pattern actually changed since the last send — ClothMesh fully disposes
  // and rebuilds the GPU sim on any pieces/seams/dims change, so resending an
  // identical payload on every tab visit would force a jarring multi-second
  // resim restart purely from switching tabs to look.
  function syncClothLab(force){
    if(!clothLabReady) return;
    const payload = buildClothLabPayload();
    const json = JSON.stringify(payload);
    if(!force && json===lastClothLabPayloadJSON) return;
    lastClothLabPayloadJSON = json;
    if(state.clothLabEngine==="embedded"){
      if(clothLabEmbedModule) clothLabEmbedModule.update({ pattern: payload });
      return;
    }
    const frame=$("#clothLabFrame");
    if(!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(payload, clothLabOrigin());
  }

  // ================= EMPTY STATE =================
  function hideEmpty(){ $("#emptyState").classList.add("hidden"); }
  function showEmpty(){ $("#emptyState").classList.remove("hidden"); }

  // ================= HEADER / CATEGORY =================
  function syncCategoryUI(){ $$("#catSeg button").forEach(b=>{ const on=b.dataset.cat===state.category; b.classList.toggle("active",on); b.setAttribute("aria-pressed",on); }); }
  const DEFAULT_PATTERN_BY_CATEGORY = {women:"womens_dress",men:"mens_shirt",girls:"girls_dress",boys:"boys_trousers"};
  function setCategory(cat){
    state.category=cat; syncCategoryUI();
    // load a default pattern for that category
    const def=DEFAULT_PATTERN_BY_CATEGORY[cat];
    if(state.loaded) loadPattern(def); else { renderMeasurePane(); grade(); }
    renderLibraryPane();
  }

  // ================= MOTION (WP-17) =================
  // Defaults from the OS `prefers-reduced-motion` media query on a first-ever
  // visit (see state init above); always overridable via the Settings toggle.
  // Covers CSS transition durations and 3D Preview's ambient auto-rotate —
  // deliberately NOT the Walk pose animation, which is content the user
  // explicitly selected, not decorative background motion — and Cloth Lab
  // has no continuous ambient motion of its own to reduce (its camera only
  // spins during an explicit turntable export, not while viewing).
  function applyReduceMotion(on){
    document.body.style.setProperty("--fast", on?"0s":".16s");
    document.body.style.setProperty("--med", on?"0s":".28s");
    document.body.style.setProperty("--slow", on?"0s":".5s");
    View3D.setReduceMotion(on);
  }

  // ================= THEME / LANG =================
  function applyTheme(){
    document.documentElement.setAttribute("data-theme",state.theme);
    document.documentElement.setAttribute("data-mode",state.mode);
    document.body.setAttribute("data-theme",state.theme);
    document.body.setAttribute("data-mode",state.mode);
    document.body.setAttribute("data-contrast",state.highContrast?"high":"normal");
    $("#modeBtn").innerHTML = state.mode==="light"?IC.moon:IC.sun;
    Canvas.render(); if(state.view==="3d") build3D();
  }
  function applyLang(){
    const d=I18N[state.lang].dir;
    document.documentElement.lang=state.lang; document.documentElement.dir=d;
    $$("[data-i18n]").forEach(e=>e.textContent=T(e.dataset.i18n));
    $$("[data-i18n-ph]").forEach(e=>e.placeholder=T(e.dataset.i18nPh));
    $$("[data-i18n-aria]").forEach(e=>e.setAttribute("aria-label",T(e.dataset.i18nAria)));
    Canvas.setTranslator(T);
    buildToolRail(); buildRail(); syncCategoryUI(); updateStageChips();
    $("#brandName").textContent=T("appName"); $("#brandSub").textContent=T("tagline");
    $$("#viewToggle button")[0].textContent=T("view2d"); $$("#viewToggle button")[1].textContent=T("view3d"); $$("#viewToggle button")[2].textContent=T("viewClothLab");
    Canvas.render();
    // Cloth Lab only re-reads `lang` from a resent payload (it has no
    // language toggle of its own — it mirrors this app's) — without this,
    // switching language while already on the Cloth Lab tab left it
    // showing the old language until the next unrelated pattern edit.
    if(clothLabReady) syncClothLab(true);
  }

  // ================= TOOLTIPS =================
  const ttEl=el("div","tt"); document.body.appendChild(ttEl);
  function tip(node,title,body){
    node.addEventListener("pointerenter",e=>{ if(!state.hoverHelp)return; ttEl.innerHTML=`<b>${title}</b>${body?`<small>${body}</small>`:""}`; ttEl.classList.add("show"); posTip(e); });
    node.addEventListener("pointermove",posTip);
    node.addEventListener("pointerleave",()=>ttEl.classList.remove("show"));
    function posTip(e){ const r=ttEl.getBoundingClientRect(); let x=e.clientX+14,y=e.clientY+14; if(x+r.width>innerWidth)x=e.clientX-r.width-14; if(y+r.height>innerHeight)y=e.clientY-r.height-14; ttEl.style.left=x+"px"; ttEl.style.top=y+"px"; }
  }

  // ================= PIECE INFO =================
  function showPieceInfo(p){
    const box=$("#pieceInfo");
    box.innerHTML=`<div class="pi-t">${L(p.name)}</div><div class="pi-ar">${p.name[state.lang==="ar"?"en":"ar"]}</div><div class="pi-d">${L(p.desc||{en:"",ar:""})}</div>`;
    box.classList.add("show");
    setTimeout(()=>box.classList.remove("show"),4200);
  }

  // ================= TOASTS =================
  function toast(msg){ const t=el("div","toast",IC.check+`<span>${msg}</span>`); $("#toasts").appendChild(t); setTimeout(()=>{t.style.opacity="0";t.style.transform="translateY(8px)";setTimeout(()=>t.remove(),250);},1900); }

  // ================= MODALS =================
  function openModal(title,body,wide){ const o=$("#genericModal"); o.querySelector(".modal").classList.toggle("wide",!!wide); o.querySelector("h2").textContent=title; o.querySelector(".modal-body").innerHTML=body; o.classList.add("show"); }
  function closeModal(id){ $(id).classList.remove("show"); }

  // ================= MODAL ACCESSIBILITY (WP-17) =================
  // Every ".overlay" in index.html (theme/settings/command palette/generic/
  // onboarding) is opened by a different function and closed by a shared
  // data-close/"click outside" mechanism — rather than touch every call
  // site individually, watch the shared "show" class itself: focus moves
  // into the dialog when it appears and back to whatever triggered it when
  // it's gone, and Tab is trapped inside the visible dialog throughout.
  let modalReturnFocus = null;
  function focusablesIn(root){
    // NOTE: $$() always queries the whole document and ignores a second
    // argument (see its definition above) — querySelectorAll directly on
    // root is required here to actually scope this to the open dialog.
    return [...root.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
  }
  function initModalA11y(){
    $$(".overlay").forEach(overlay=>{
      new MutationObserver(()=>{
        const modal = overlay.querySelector(".modal");
        if(overlay.classList.contains("show")){
          modalReturnFocus = document.activeElement;
          const first = modal && focusablesIn(modal)[0];
          (first || modal || overlay).focus({ preventScroll:true });
        } else if(modalReturnFocus){
          modalReturnFocus.focus({ preventScroll:true });
          modalReturnFocus = null;
        }
      }).observe(overlay, { attributes:true, attributeFilter:["class"] });
    });
  }
  function trapModalTab(e){
    const overlay = $$(".overlay.show")[0]; if(!overlay) return;
    const modal = overlay.querySelector(".modal"); if(!modal) return;
    const items = focusablesIn(modal); if(!items.length) return;
    const first=items[0], last=items[items.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  }

  // Theme picker
  function openThemePicker(){
    const body=$("#themeModal .modal-body"); body.innerHTML="";
    const themes=[
      {id:"egypt",name:{en:"Egyptian",ar:"مصري"},d:{en:"Warm earthy & gold",ar:"دفء ترابي وذهبي"},sw:["#c8912e","#1f7a6d","#c1492e"]},
      {id:"saudi",name:{en:"Saudi / Gulf",ar:"سعودي / خليجي"},d:{en:"Emerald, gold, burgundy",ar:"زمردي وذهبي وعنابي"},sw:["#0f7a4f","#c69a2e","#7a1f2b"]},
      {id:"intl",name:{en:"International",ar:"عالمي"},d:{en:"Clean modern accents",ar:"عصري نظيف"},sw:["#6d5efc","#00c2a8","#ff5d8f"]},
    ];
    const grid=el("div","theme-cards");
    themes.forEach(th=>{ const card=el("div","theme-card"+(state.theme===th.id?" active":"")); card.innerHTML=`<div class="swatches">${th.sw.map(s=>`<span class="sw" style="background:${s}"></span>`).join("")}</div><div class="tn">${L(th.name)}</div><div class="td">${L(th.d)}</div>`; card.onclick=()=>{state.theme=th.id;applyTheme();save();$$("#themeModal .theme-card").forEach(x=>x.classList.remove("active"));card.classList.add("active");toast(T("themeChanged"));}; grid.appendChild(card); });
    body.appendChild(grid);
    // mode toggle inside
    const row=el("label","set-row"); row.style.marginTop="18px"; row.innerHTML=`<span class="sl">${T("appearance")}<small>${T("tt_mode")}</small></span>`;
    const sw=el("span","switch",`<input type="checkbox" ${state.mode==="dark"?"checked":""}><span class="track"></span>`);
    sw.querySelector("input").onchange=e=>{state.mode=e.target.checked?"dark":"light";applyTheme();save();}; row.appendChild(sw); body.appendChild(row);
    $("#themeModal").classList.add("show");
  }

  // ================= AI PROVIDER SETTINGS (WP-1) =================
  // Local UI state only (which sub-nav pane is showing) — not persisted,
  // openSettings() rebuilds this panel from scratch every time it's opened.
  let aiSettingsTab = "text";
  // WP-21 Route B: deliberately in-memory only, NEVER persisted to
  // state/localStorage — a page reload must honestly show "no model
  // loaded" (js/workers/local-model-worker.js starts fresh every reload
  // too) even though the model's bytes are still sitting in IndexedDB/
  // OPFS waiting for an explicit "Load cached model" click.
  let onnxLoadedInfo = null; // { name, inputNames, outputNames } once loaded this session
  let onnxLastResult = null; // last runOnnxTestInference() result, for display

  // Today's state.aiEndpoint/aiImageEndpoint (the old flat fields) become the
  // `proxy` adapter's persisted baseUrl the first time this renders — existing
  // users' saved values keep working with zero migration step of their own.
  function ensureAIState(){
    if(!state.aiProviderCfg) state.aiProviderCfg = { proxy: { baseUrl: state.aiEndpoint||"" } };
    if(!state.aiImageProviderCfg) state.aiImageProviderCfg = { proxy: { baseUrl: state.aiImageEndpoint||"" } };
  }
  function aiCfgFor(providerId, isImage){
    const bag = isImage ? state.aiImageProviderCfg : state.aiProviderCfg;
    if(!bag[providerId]) bag[providerId] = {};
    return bag[providerId];
  }
  // Resolves {baseUrl, apiKey, model} for an adapter call, prompting once for
  // the encryption passphrase if a persisted key exists but is locked. Never
  // logs/toasts the resolved key itself — see js/ai-keystore.js.
  async function resolveAICfg(providerId, cfg, useVisionModel){
    let apiKey = await KeyStore.resolve(providerId);
    if(apiKey==null && KeyStore.hasPersistent(providerId) && KeyStore.needsPassphrase()){
      const pass = window.prompt(T("keyPassphrasePrompt"));
      if(pass){ try{ await KeyStore.unlock(pass); apiKey = await KeyStore.resolve(providerId); }catch(e){ toast(T("keyPassphraseWrong")); } }
    }
    return { baseUrl: cfg.baseUrl||undefined, apiKey: apiKey||undefined, model: (useVisionModel? cfg.visionModel : cfg.model)||undefined };
  }

  // WP-18: cloud sync target configuration. Rendered only while Settings'
  // "Cloud Sync" toggle is on — off by default, matching the plan's "local
  // -first stays the default forever" requirement.
  function renderSyncSettings(body){
    const wrap=el("div","field"); wrap.style.marginTop="14px";
    wrap.innerHTML=`<label>${T("syncTargetLabel")}</label>`;
    const sel=el("select","select");
    [["endpoint",T("syncTargetEndpoint")],["googleDrive",T("syncTargetDrive")],["oneDrive",T("syncTargetOneDrive")]].forEach(([id,label])=>{
      const opt=document.createElement("option"); opt.value=id; opt.textContent=label; if(id===state.syncTarget) opt.selected=true;
      sel.appendChild(opt);
    });
    sel.onchange=()=>{ state.syncTarget=sel.value; save(); openSettings(); };
    wrap.appendChild(sel); body.appendChild(wrap);

    if(state.syncTarget==="endpoint"){
      const urlField=el("div","field"); urlField.style.marginTop="10px";
      urlField.innerHTML=`<label>${T("syncEndpointUrlLabel")}</label>`;
      const urlInp=el("input","input"); urlInp.type="url"; urlInp.dir="ltr"; urlInp.placeholder="https://your-server.example/berrystudio-project.json";
      urlInp.value=state.syncEndpointUrl||"";
      urlInp.onchange=()=>{ state.syncEndpointUrl=urlInp.value.trim(); save(); };
      urlField.appendChild(urlInp); body.appendChild(urlField);

      const tokField=el("div","field"); tokField.style.marginTop="10px";
      tokField.innerHTML=`<label>${T("syncEndpointTokenLabel")}</label>`;
      const tokInp=el("input","input"); tokInp.type="password"; tokInp.dir="ltr"; tokInp.placeholder=T("optional");
      tokInp.value=SelfHostedSync.getToken();
      tokInp.onchange=()=>SelfHostedSync.setToken(tokInp.value.trim());
      tokField.appendChild(tokInp); body.appendChild(tokField);
      body.appendChild(el("div","help-note",T("syncEndpointHint")));
    } else {
      const isDrive=state.syncTarget==="googleDrive";
      const idField=el("div","field"); idField.style.marginTop="10px";
      idField.innerHTML=`<label>${isDrive?T("syncGoogleClientIdLabel"):T("syncMicrosoftClientIdLabel")}</label>`;
      const idInp=el("input","input"); idInp.dir="ltr"; idInp.placeholder=T("syncClientIdPlaceholder");
      idInp.value=isDrive?(state.syncGoogleClientId||""):(state.syncMicrosoftClientId||"");
      idInp.onchange=()=>{ if(isDrive) state.syncGoogleClientId=idInp.value.trim(); else state.syncMicrosoftClientId=idInp.value.trim(); save(); };
      idField.appendChild(idInp); body.appendChild(idField);
      body.appendChild(el("div","help-note",isDrive?T("syncDriveHint"):T("syncOneDriveHint")));

      const impl=isDrive?GoogleDriveSync:OneDriveSync;
      const connectBtn=el("button","big-btn ghost",impl.isConnected()?T("syncConnected"):T("syncConnect"));
      connectBtn.style.marginTop="10px";
      connectBtn.disabled=impl.isConnected();
      connectBtn.onclick=async()=>{
        try{ await cloudSyncConnect(); toast(T("syncConnected")); openSettings(); }
        catch(e){ toast(T("syncFail")+": "+(e.message||e)); }
      };
      body.appendChild(connectBtn);
    }
  }

  // Per-category avatar picker: bundled model / custom URL / upload your
  // own file. `state.avatarGLB[cat]` stores whichever URL is active —
  // bundled options resolve to a repo-relative path, uploads to a session-
  // only blob: URL (see the honest note in the upload handler below).
  function renderAvatarPickerRow(container, cat){
    const current = (state.avatarGLB && state.avatarGLB[cat]) || "";
    const bundled = BUNDLED_AVATARS[cat] || [];
    const bundledMatch = bundled.find(b => b.file === current);
    const mode = bundledMatch ? "bundled" : current.startsWith("blob:") ? "upload" : current ? "url" : "none";

    const row = el("div"); row.style.cssText = "margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--line-2)";
    row.appendChild(el("div", null, T(cat))).style.cssText = "font-size:12px;font-weight:700;margin-bottom:6px";

    const applyURL = (url) => {
      state.avatarGLB = state.avatarGLB || {};
      state.avatarGLB[cat] = url || ""; save();
      View3D.setAvatarURL(cat, url || null);
      if (state.view === "3d" && state.category === cat) build3D();
      toast("✓ " + T(cat));
    };

    const sel = el("select", "select");
    const opt = (value, label, selected) => { const o = document.createElement("option"); o.value = value; o.textContent = label; if (selected) o.selected = true; sel.appendChild(o); };
    opt("none", T("avatarNone"), mode === "none");
    bundled.forEach(b => opt("bundled:" + b.id, T("avatarModel_" + b.id), mode === "bundled" && bundledMatch.id === b.id));
    opt("url", T("avatarCustomUrl"), mode === "url");
    opt("upload", T("avatarUpload"), mode === "upload");
    row.appendChild(sel);

    const detail = el("div"); detail.style.marginTop = "6px";
    row.appendChild(detail);

    function renderDetail(selected){
      detail.innerHTML = "";
      if (selected === "url") {
        const inp = el("input", "input"); inp.type = "url"; inp.dir = "ltr";
        inp.placeholder = "https://models.readyplayer.me/….glb";
        inp.value = mode === "url" ? current : "";
        inp.onchange = () => applyURL(inp.value.trim());
        detail.appendChild(inp);
      } else if (selected === "upload") {
        const inp = el("input"); inp.type = "file"; inp.accept = ".glb,model/gltf-binary";
        inp.onchange = () => {
          const f = inp.files && inp.files[0]; if (!f) return;
          applyURL(URL.createObjectURL(f));
        };
        detail.appendChild(inp);
        detail.appendChild(el("div", "help-note", T("avatarUploadHint")));
      } else if (selected === "none") {
        if (current) applyURL("");
      }
    }
    sel.onchange = () => {
      const v = sel.value;
      if (v.startsWith("bundled:")) { applyURL(bundled.find(b => b.id === v.slice(8)).file); renderDetail("bundled"); }
      else { renderDetail(v); }
    };
    renderDetail(mode);
    container.appendChild(row);
  }

  function renderAISettings(body){
    ensureAIState();
    const wrap=el("div","field"); wrap.style.marginTop="14px";
    wrap.innerHTML=`<label>${T("aiProviderSection")}</label>`;
    const seg=el("div","seg",`<button class="${aiSettingsTab==="text"?"active":""}">${T("aiTextGen")}</button><button class="${aiSettingsTab==="image"?"active":""}">${T("aiImageGen")}</button>`);
    seg.children[0].onclick=()=>{ aiSettingsTab="text"; openSettings(); };
    seg.children[1].onclick=()=>{ aiSettingsTab="image"; openSettings(); };
    wrap.appendChild(seg);
    const pane=el("div"); pane.style.marginTop="10px";
    wrap.appendChild(pane);
    body.appendChild(wrap);
    renderProviderPane(pane, aiSettingsTab==="image");
    renderSegmentationSettings(body);
  }

  // BerryStudio-Upgrade-Plan-v2.0 WP-39: an optional real segmentation
  // model, orthogonal to whichever text/image AI provider is selected
  // above (it augments js/ai.js's own local silhouette read, not any
  // provider's request) — a Hugging Face model ID for a matting/
  // segmentation architecture, run in-browser via the same worker Route
  // C's Hugging Face route uses. Empty (the default) keeps every existing
  // photo read byte-identical to before this WP — see getSegmentFn().
  function renderSegmentationSettings(body){
    const wrap=el("div","field"); wrap.style.marginTop="14px";
    wrap.innerHTML=`<label>${T("segModelLabel")}</label>`;
    const inp=el("input","input"); inp.dir="ltr"; inp.placeholder="Xenova/modnet";
    inp.value = state.segmentationModelId || "";
    inp.onchange=()=>{ state.segmentationModelId = inp.value.trim(); save(); };
    wrap.appendChild(inp);
    wrap.appendChild(el("div","help-note", T("segModelHint")));
    body.appendChild(wrap);
  }
  // undefined (not null) when unconfigured — js/ai.js's analyzeImage()
  // only branches on `opts.segment` at all when it's truthy, so this stays
  // a plain pass-through with zero special-casing on either side.
  function getSegmentFn(){
    const modelId = (state.segmentationModelId||"").trim();
    if(!modelId) return undefined;
    return async (imageData) => {
      await loadSegmentationModel(modelId);
      return await runSegmentationOn(imageData);
    };
  }

  // WP-21 Route B panel: pick a .onnx file, restore/clear whatever's
  // cached, run a real (if synthetic-input) inference pass. Kept as its
  // own function rather than folded into renderProviderPane — this UI
  // shares nothing with the model/vision-model/fetch/test fields every
  // other adapter renders (see isRouteBFile's early return there).
  function renderOnnxFileRoute(pane, cfg){
    pane.appendChild(el("div","help-note",T("onnxHint")));

    const statusLine=el("div","help-note"); statusLine.dir="ltr"; statusLine.style.marginTop="10px";
    function paintStatus(){
      if(onnxLoadedInfo){
        statusLine.style.color="var(--ok)";
        statusLine.textContent=`✓ ${T("onnxModelLoaded")}: ${onnxLoadedInfo.name}`;
      } else {
        statusLine.style.color="var(--ink-2)";
        statusLine.textContent=`○ ${T("onnxNoModelLoaded")}`;
      }
    }
    paintStatus();

    const pickRow=el("div"); pickRow.style.cssText="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap;align-items:center";
    const fileInput=el("input"); fileInput.type="file"; fileInput.accept=".onnx"; fileInput.style.display="none";
    const pickBtn=el("button","big-btn ghost", T("onnxPickFile"));
    pickBtn.type="button"; pickBtn.onclick=()=>fileInput.click();
    fileInput.onchange=async()=>{
      const f=fileInput.files && fileInput.files[0]; fileInput.value="";
      if(!f) return;
      const orig=pickBtn.textContent; pickBtn.disabled=true; pickBtn.textContent=T("onnxLoading");
      try{
        const bytes=await f.arrayBuffer();
        const result=await loadLocalModelFromFile(f.name, f.type||"application/octet-stream", bytes);
        onnxLoadedInfo={ name: result.name, inputNames: result.inputNames, outputNames: result.outputNames };
        onnxLastResult=null;
        toast("✓ "+T("onnxModelLoaded"));
      }catch(e){ toast("✗ "+(e&&e.message||e)); }
      finally{ pickBtn.disabled=false; pickBtn.textContent=orig; renderProviderPane(pane, false); }
    };
    pickRow.appendChild(pickBtn); pickRow.appendChild(fileInput);
    pane.appendChild(pickRow);
    pane.appendChild(statusLine);

    // Cached-model row — metadata-only read (js/workers/model-file-cache.js
    // never hands back bytes for this), so this is cheap on every render
    // and never itself counts as "loading" a model.
    const cacheRow=el("div"); cacheRow.style.cssText="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap;align-items:center";
    const cacheInfo=el("div","help-note"); cacheInfo.dir="ltr"; cacheInfo.textContent=T("loading");
    cacheRow.appendChild(cacheInfo);
    pane.appendChild(cacheRow);
    getModelFileMeta().then(meta=>{
      cacheInfo.textContent = meta ? `${T("onnxCachedLabel")}: ${meta.name} (${(meta.size/1e6).toFixed(1)}MB)` : T("onnxNoCached");
      if(!meta) return;
      const restoreBtn=el("button","big-btn ghost", T("onnxLoadCached"));
      restoreBtn.type="button";
      restoreBtn.onclick=async()=>{
        const orig=restoreBtn.textContent; restoreBtn.disabled=true; restoreBtn.textContent=T("onnxLoading");
        try{
          const result=await restoreLocalModelFromCache();
          onnxLoadedInfo={ name: result.name, inputNames: result.inputNames, outputNames: result.outputNames };
          onnxLastResult=null;
          toast("✓ "+T("onnxModelLoaded"));
        }catch(e){ toast("✗ "+(e&&e.message||e)); }
        finally{ restoreBtn.disabled=false; restoreBtn.textContent=orig; renderProviderPane(pane, false); }
      };
      const clearBtn=el("button","big-btn ghost", T("onnxClearCached"));
      clearBtn.type="button";
      clearBtn.onclick=async()=>{ await clearModelFile(); renderProviderPane(pane, false); };
      cacheRow.appendChild(restoreBtn); cacheRow.appendChild(clearBtn);
    });

    // Test-inference section — only meaningful once a model is actually
    // loaded this session (picked or restored above).
    const testWrap=el("div"); testWrap.style.marginTop="10px";
    pane.appendChild(testWrap);
    function renderTestSection(){
      testWrap.innerHTML="";
      if(!onnxLoadedInfo) return;
      testWrap.appendChild(el("div","help-note",T("onnxTestHint")));
      const testBtn=el("button","big-btn ghost", T("onnxRunTest"));
      testBtn.type="button"; testBtn.style.marginTop="8px";
      const resultLine=el("div","help-note"); resultLine.dir="ltr"; resultLine.style.marginTop="8px";
      if(onnxLastResult) resultLine.textContent=onnxLastResult;
      testBtn.onclick=async()=>{
        const orig=testBtn.textContent; testBtn.disabled=true; testBtn.textContent=T("onnxLoading");
        try{
          const r=await runOnnxTestInference();
          const outSummary=r.outputs.map(o=>`${o.name} [${o.dims.join("×")}] ${o.type}`).join(", ");
          resultLine.style.color="var(--ok)";
          onnxLastResult = `✓ ${outSummary} (${r.latencyMs}ms)`;
          resultLine.textContent=onnxLastResult;
        }catch(e){
          resultLine.style.color="var(--danger)";
          onnxLastResult = "✗ "+(e&&e.message||e);
          resultLine.textContent=onnxLastResult;
        }
        finally{ testBtn.disabled=false; testBtn.textContent=orig; }
      };
      testWrap.appendChild(testBtn); testWrap.appendChild(resultLine);
    }
    renderTestSection();
  }

  function renderProviderPane(pane, isImage){
    pane.innerHTML="";
    // BerryStudio-Upgrade-Plan WP-4: image-generation adapters
    // (openai-images/gemini-image/local-image/comfyui, js/image-providers.js) —
    // `proxy` here preserves today's exact "AI Image endpoint" behaviour.
    const providerList = isImage ? IMAGE_PROVIDER_IDS : AI_PROVIDER_IDS;
    const providerSet = isImage ? ImageProviders : AIProviders;
    const stateKey = isImage ? "aiImageProvider" : "aiProvider";
    const activeId = providerList.includes(state[stateKey]) ? state[stateKey] : providerList[0];
    if(activeId!==state[stateKey]){ state[stateKey]=activeId; save(); }

    const selWrap=el("div","field");
    selWrap.innerHTML=`<label>${T("aiProviderLabel")}</label>`;
    const sel=el("select","select");
    providerList.forEach(id=>{
      const opt=document.createElement("option"); opt.value=id; opt.textContent=providerSet[id].label; if(id===activeId) opt.selected=true;
      sel.appendChild(opt);
    });
    sel.onchange=()=>{ state[stateKey]=sel.value; save(); renderProviderPane(pane, isImage); };
    selWrap.appendChild(sel); pane.appendChild(selWrap);

    const adapter=providerSet[activeId];
    const cfg=aiCfgFor(activeId, isImage);
    // WP-21: Route B (local .onnx file) has its own dedicated UI
    // (renderOnnxFileRoute below) and no {model, test, fetchModels}
    // surface of its own — the generic model/vision fields and
    // fetch/test buttons further down don't apply to it.
    const isRouteBFile = !isImage && activeId==="browser-local" && cfg.route==="file";

    if(isImage && activeId==="local-image"){
      pane.appendChild(el("div","help-note",T("localImageHint")));
    }
    if(isImage && activeId==="comfyui"){
      pane.appendChild(el("div","help-note",T("comfyuiHint")));
      pane.appendChild(el("div","help-note",T("localServerCorsHint")));
    }
    if(!isImage && activeId==="browser-local"){
      pane.appendChild(el("div","help-note",T("browserLocalHint")));
      const badge=el("div","help-note",T("loading")); pane.appendChild(badge);
      probeCapabilities().then(cap=>{
        const color = cap.tier==="green" ? "var(--ok)" : cap.tier==="amber" ? "var(--warn)" : "var(--danger)";
        badge.style.color = color;
        badge.textContent = `${cap.tier==="green"?"●":cap.tier==="amber"?"◐":"○"} WebGPU: ${cap.webgpu?"yes":"no"} — ${cap.reason}`;
      });
      // BerryStudio-Upgrade-Plan-v2.0 WP-21 — Route B: a real local .onnx
      // file, alongside Route C's existing Hugging Face model ID (which
      // still uses the generic "Text model" field rendered further down).
      // `cfg.route` defaults to "hf" so every existing saved config keeps
      // behaving exactly as before this WP.
      const route = cfg.route === "file" ? "file" : "hf";
      const routeSeg=el("div","seg",`<button class="${route==="hf"?"active":""}">${T("routeBToggleHF")}</button><button class="${route==="file"?"active":""}">${T("routeBToggleFile")}</button>`);
      routeSeg.children[0].onclick=()=>{ cfg.route="hf"; save(); renderProviderPane(pane, isImage); };
      routeSeg.children[1].onclick=()=>{ cfg.route="file"; save(); renderProviderPane(pane, isImage); };
      pane.appendChild(routeSeg);
      if(isRouteBFile) renderOnnxFileRoute(pane, cfg);
    }

    (adapter.fields||[]).forEach(f=>{
      const fWrap=el("div","field");
      const labelKey = f.key==="apiKey" ? "aiKeyLabel" : f.key==="baseUrl" ? "aiBaseUrlLabel" : f.key;
      fWrap.innerHTML=`<label>${T(labelKey)}${f.required?" *":""}</label>`;
      const inp=el("input","input");
      inp.type = f.key==="apiKey" ? "password" : "url";
      inp.dir="ltr";
      inp.placeholder = f.key==="baseUrl" ? (adapter.defaultBaseUrl||"") : "sk-…";
      if(f.key==="apiKey"){
        inp.value = KeyStore.get(activeId) || "";
        inp.oninput=()=>{ KeyStore.set(activeId, inp.value); };
      } else {
        inp.value = cfg[f.key] || "";
        inp.oninput=()=>{ cfg[f.key]=inp.value.trim(); save(); };
      }
      fWrap.appendChild(inp); pane.appendChild(fWrap);
    });

    if(["ollama","lmstudio","llamacpp","vllm"].includes(activeId)){
      pane.appendChild(el("div","help-note", activeId==="ollama" ? T("ollamaCorsHint") : T("localServerCorsHint")));
    }

    if(adapter.needsKey){
      const pr=el("label","set-row");
      pr.innerHTML=`<span class="sl">${T("keyPersistToggle")}<small>${T("keyPersistWarnD")}</small></span>`;
      const sw=el("span","switch",`<input type="checkbox" ${state.aiKeyPersist?"checked":""}><span class="track"></span>`);
      sw.querySelector("input").onchange=async(e)=>{
        state.aiKeyPersist=e.target.checked; save();
        if(state.aiKeyPersist){
          if(KeyStore.needsPassphrase()){
            const pass=window.prompt(T("keyPassphrasePrompt"));
            if(!pass){ state.aiKeyPersist=false; save(); e.target.checked=false; return; }
            try{ await KeyStore.unlock(pass); }catch(err){ toast(T("keyPassphraseWrong")); state.aiKeyPersist=false; save(); e.target.checked=false; return; }
          }
          const val=KeyStore.get(activeId);
          if(val) await KeyStore.setPersistent(activeId, val);
          toast("✓ "+T("keyPersistToggle"));
        } else {
          KeyStore.removePersistent(activeId);
        }
      };
      pr.appendChild(sw); pane.appendChild(pr);
    }

    if(isRouteBFile) return; // Route B's own UI (renderOnnxFileRoute) already rendered everything this pane needs

    // model slot — free-text input with a <datalist> populated by "Fetch
    // models" (text/vision providers only — image adapters have no
    // models-list API, the field still just sets cfg.model directly).
    const modelRow=el("div","field"); modelRow.style.marginTop="10px";
    modelRow.innerHTML=`<label>${T(isImage?"aiModelImage":"aiModelText")}</label>`;
    const modelInput=el("input","input"); modelInput.dir="ltr"; modelInput.value=cfg.model||""; modelInput.placeholder=isImage?(adapter.id==="openai-images"?"gpt-image-2":""):"";
    if(!isImage) modelInput.setAttribute("list","dl-text-"+activeId);
    modelInput.oninput=()=>{ cfg.model=modelInput.value.trim(); save(); };
    const dlText=isImage?null:el("datalist"); if(dlText) dlText.id="dl-text-"+activeId;
    modelRow.appendChild(modelInput); if(dlText) modelRow.appendChild(dlText); pane.appendChild(modelRow);

    let visionInput=null, dlVision=null;
    if(!isImage){
      const visionRow=el("div","field");
      visionRow.innerHTML=`<label>${T("aiModelVision")}</label>`;
      visionInput=el("input","input"); visionInput.dir="ltr"; visionInput.value=cfg.visionModel||""; visionInput.setAttribute("list","dl-vision-"+activeId);
      visionInput.oninput=()=>{ cfg.visionModel=visionInput.value.trim(); save(); };
      dlVision=el("datalist"); dlVision.id="dl-vision-"+activeId;
      visionRow.appendChild(visionInput); visionRow.appendChild(dlVision); pane.appendChild(visionRow);
    }
    // Most image adapters have no models()/test() API — nothing further to
    // render for those. comfyui is the exception (WP-23): it's a local
    // server worth a real Test Connection round-trip, same as the local
    // text-provider adapters below, just without a "Fetch models" button
    // (ComfyUI's checkpoint list isn't a "model slot" the way text/vision
    // providers have one — generate() auto-detects it instead).
    if(isImage && !adapter.test) return;

    const btnRow=el("div"); btnRow.style.cssText="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap";
    if(!isImage){
      const fetchBtn=el("button","big-btn ghost", T("fetchModels"));
      fetchBtn.type="button";
      fetchBtn.onclick=async()=>{
        const orig=fetchBtn.textContent; fetchBtn.disabled=true; fetchBtn.textContent=T("loading");
        try{
          const resolved=await resolveAICfg(activeId, cfg, false);
          const {text, vision}=await adapter.models(resolved);
          dlText.innerHTML=text.map(m=>`<option value="${m.replace(/"/g,'')}">`).join("");
          if(dlVision) dlVision.innerHTML=vision.map(m=>`<option value="${m.replace(/"/g,'')}">`).join("");
          toast(text.length ? `✓ ${text.length}` : T("noModelsFound"));
        }catch(e){ toast(T("aiRequestFailed")); }
        finally{ fetchBtn.disabled=false; fetchBtn.textContent=orig; }
      };
      btnRow.appendChild(fetchBtn);
    }

    const testBtn=el("button","big-btn ghost", T("testConnection"));
    testBtn.type="button";
    const statusLine=el("div","help-note"); statusLine.style.display="none"; statusLine.style.marginTop="8px"; statusLine.dir="ltr"; statusLine.style.textAlign=state.lang==="ar"?"right":"left";
    testBtn.onclick=async()=>{
      const orig=testBtn.textContent; testBtn.disabled=true; testBtn.textContent=T("loading");
      try{
        const resolved=await resolveAICfg(activeId, cfg, false);
        const r=await adapter.test(resolved);
        statusLine.style.display="";
        statusLine.style.color = r.ok ? "var(--ok)" : "var(--danger)";
        statusLine.textContent = (r.ok?"✓ ":"✗ ") + (r.message||"") + (r.latencyMs!=null?` (${r.latencyMs}ms)`:"");
      }catch(e){
        statusLine.style.display=""; statusLine.style.color="var(--danger)"; statusLine.textContent="✗ "+(e&&e.message||e);
      }
      finally{ testBtn.disabled=false; testBtn.textContent=orig; }
    };
    btnRow.appendChild(testBtn);
    pane.appendChild(btnRow); pane.appendChild(statusLine);
  }

  // Settings
  function openSettings(){
    const body=$("#settingsModal .modal-body"); body.innerHTML="";
    const toggles=[["hoverHelp","hoverHelpD"],["highContrast","highContrastD"],["reduceMotion","reduceMotionD"],["cloudSync","cloudSyncD"]];
    toggles.forEach(([k,d])=>{
      const r=el("label","set-row"); r.innerHTML=`<span class="sl">${T(k)}<small>${T(d)}</small></span>`;
      const sw=el("span","switch",`<input type="checkbox" ${state[k]?"checked":""}><span class="track"></span>`);
      sw.querySelector("input").onchange=e=>{ state[k]=e.target.checked; save(); if(k==="highContrast")applyTheme(); if(k==="reduceMotion")applyReduceMotion(e.target.checked); if(k==="cloudSync")openSettings(); else toast("✓"); };
      r.appendChild(sw); body.appendChild(r);
    });
    if(state.cloudSync) renderSyncSettings(body);
    const units=el("label","set-row"); units.innerHTML=`<span class="sl">${T("tab_measure")}<small>cm / inch</small></span>`;
    const seg=el("div","seg",`<button ${state.unitsCm?'class="active"':''}>cm</button><button ${!state.unitsCm?'class="active"':''}>inch</button>`);
    seg.children[0].onclick=()=>{state.unitsCm=true;Canvas.setOpt("unitsCm",true);save();openSettings();updateStageChips();};
    seg.children[1].onclick=()=>{state.unitsCm=false;Canvas.setOpt("unitsCm",false);save();openSettings();updateStageChips();};
    units.appendChild(seg); body.appendChild(units);
    // AI Provider section (BerryStudio-Upgrade-Plan WP-1) — replaces the old
    // flat "AI endpoint"/"AI Image endpoint" fields; today's saved values
    // become the `proxy` adapter's baseUrl under the hood (see ensureAIState()).
    renderAISettings(body);
    // 3D avatar models — pick a bundled model, paste a URL (e.g. Ready
    // Player Me), or upload your own GLB file, per category.
    const av = el("div","field"); av.style.marginTop="14px";
    av.innerHTML = `<label>${T("avatarModels")}</label>`;
    ["women","men","girls","boys"].forEach(cat=>renderAvatarPickerRow(av, cat));
    av.appendChild(el("div","help-note",T("avatarModelsD")));
    body.appendChild(av);
    // BerryStudio-Upgrade-Plan WP-5: 3D Cloth Lab engine — feature-flagged
    // swap between the original iframe embed and the new same-page embedded
    // mount. Same .seg segmented-toggle pattern as the cm/inch units field
    // above. Switching takes effect the next time the Cloth Lab tab opens
    // (loadClothLab()'s dataset.loaded guard is iframe-only, so flipping
    // this while already on that tab needs a tab round-trip to re-mount —
    // acceptable for a rarely-changed setting, not worth extra plumbing).
    const engineRow=el("label","set-row"); engineRow.style.marginTop="14px";
    engineRow.innerHTML=`<span class="sl">${T("clothLabEngine")}<small>${T("clothLabEngineD")}</small></span>`;
    const engineSeg=el("div","seg",
      `<button ${state.clothLabEngine!=="embedded"?'class="active"':''}>${T("clothLabEngineIframe")}</button>`+
      `<button ${state.clothLabEngine==="embedded"?'class="active"':''}>${T("clothLabEngineEmbedded")}</button>`
    );
    engineSeg.children[0].onclick=()=>{state.clothLabEngine="iframe";save();openSettings();};
    engineSeg.children[1].onclick=()=>{state.clothLabEngine="embedded";save();openSettings();};
    engineRow.appendChild(engineSeg); body.appendChild(engineRow);
    const rb=el("button","big-btn ghost",T("resetOnb")); rb.style.marginTop="16px"; rb.onclick=()=>{closeModal("#settingsModal");startOnboarding();}; body.appendChild(rb);
    const ib=el("button","big-btn",IC.download+T("installApp")); ib.style.marginTop="8px"; ib.onclick=installApp; body.appendChild(ib);
    $("#settingsModal").classList.add("show");
  }

  // ================= COMMAND PALETTE =================
  let cmdSel=0, cmdItems=[];
  function commands(){ return [
    {t:T("helpTitle"),i:IC.question,run:openHelp},
    {t:T("addLayer"),i:IC.layers,run:()=>{Canvas.addPiece({en:I18N.en.newLayer,ar:I18N.ar.newLayer});hideEmpty();renderLayersPane();showPane("layers");}},
    {t:T("newProject"),i:IC.newdoc,run:newProject},
    {t:T("importProject"),i:IC.importf,run:importProject},
    {t:T("savePDF"),i:IC.pdf,run:()=>exportAs("PDF")},
    {t:T("exportDXF"),i:IC.download,run:()=>exportAs("DXF")},
    {t:T("printProject"),i:IC.printer,run:printPattern},
    {t:T("patternSummary"),i:IC.printer,run:exportSummary},
    {t:T("checkPattern"),i:IC.spark,run:()=>runCheckPattern()},
    {t:T("undoLbl"),i:IC.undo,run:()=>{Canvas.doUndo();renderLayersPane();sync3DVisibility();}},
    {t:T("redoLbl"),i:IC.redo,run:()=>{Canvas.doRedo();renderLayersPane();sync3DVisibility();}},
    {t:T("view2d"),i:IC.grid,run:()=>setView("2d")},
    {t:T("view3d"),i:IC.cube,run:()=>setView("3d")},
    {t:T("viewClothLab"),i:IC.cube,run:()=>setView("clothlab")},
    {t:T("autoGrade"),i:IC.spark,run:()=>{grade();toast(T("graded"));}},
    {t:T("theme"),i:IC.palette,run:openThemePicker},
    {t:T("settings"),i:IC.gear,run:openSettings},
    {t:T("exportTitle"),i:IC.download,run:()=>{showPane("export");}},
    {t:T("aiTitle"),i:IC.spark,run:()=>showPane("ai")},
    {t:T("libraryTitle"),i:IC.shirt,run:()=>showPane("library")},
    ...LIBRARY.map(x=>({t:L(PATTERNS[x.id].name),i:IC.dress,run:()=>loadPattern(x.id)})),
    {t:T("language")+" · "+(state.lang==="en"?"العربية":"English"),i:IC.globe,run:toggleLang},
  ]; }
  function openCmd(){ $("#cmdModal").classList.add("show"); const inp=$("#cmdInput"); inp.value=""; inp.focus(); renderCmd(""); }
  function renderCmd(q){ cmdItems=commands().filter(c=>c.t.toLowerCase().includes(q.toLowerCase())); cmdSel=0; const list=$("#cmdList"); list.innerHTML=""; cmdItems.forEach((c,i)=>{ const it=el("div","cmd-item"+(i===0?" sel":""),`${c.i}<span>${c.t}</span><span class="k">↵</span>`); it.onclick=()=>{c.run();closeModal("#cmdModal");}; list.appendChild(it); }); }

  // ================= ONBOARDING =================
  let onbStep=0;
  const ONB=[["onbTitle1","onbBody1"],["onbTitle2","onbBody2"],["onbTitle3","onbBody3"],["onbTitle4","onbBody4"]];
  function startOnboarding(){ onbStep=0; $("#onbModal").classList.add("show"); renderOnb(); }
  // last-resort fallback if every Berry Academy image source 404s
  const ONB_HERO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M8 2l4 3 4-3 5 4-3 4v11H6V10L3 6z"/></svg>';
  function setOnbHero(){
    const hero=$("#onbHero"); if(!hero) return;
    // Berry Academy logo on all 4 tutorial screens. Prefers a real photo
    // (icons/intro.png / .jpg) if one is dropped in; otherwise uses the
    // bundled branded recreation (icons/intro.svg).
    hero.classList.add("photo"); hero.innerHTML="";
    const img=el("img","onb-photo"); img.alt="Berry Academy";
    const sources=["icons/intro.png","icons/intro.jpg","icons/intro.svg"];
    let si=0;
    const tryNext=()=>{ if(si>=sources.length){ hero.classList.remove("photo"); hero.innerHTML=ONB_HERO_SVG; return; } img.src=sources[si++]+"?v=1"; };
    img.onerror=tryNext; tryNext();
    hero.appendChild(img);
  }
  function renderOnb(){
    const [t,b]=ONB[onbStep];
    setOnbHero();
    $("#onbTitle").textContent=T(t); $("#onbBody").textContent=T(b);
    $("#onbDots").innerHTML=ONB.map((_,i)=>`<span class="onb-dot ${i===onbStep?"active":""}"></span>`).join("");
    $("#onbNext").textContent = onbStep===ONB.length-1?T("getStarted"):T("next");
    $("#onbBack").style.visibility = onbStep===0?"hidden":"visible";
  }
  function onbNext(){ if(onbStep<ONB.length-1){onbStep++;renderOnb();} else {state.onboarded=true;save();closeModal("#onbModal");} }
  function onbBack(){ if(onbStep>0){onbStep--;renderOnb();} }

  // ================= STAGE CHIPS =================
  function updateStageChips(){
    const m=currentMeas();
    $("#chipSize").innerHTML=`${T("gradedTo")}: <b>${state.kids?L(KIDS_AGES.find(a=>a.id===state.kids).label):state.size}</b>`;
    $("#chipStd").innerHTML=`${T("standard")}: <b>${T("std_"+state.standard)}</b>`;
    $("#chipChest").innerHTML=`${T("m_chest")}: <b>${state.unitsCm?m.chest+" cm":(m.chest/2.54).toFixed(1)+" in"}</b>`;
  }

  // ================= LANG / MISC TOGGLES =================
  function toggleLang(){ state.lang=state.lang==="en"?"ar":"en"; save(); applyLang(); applyTheme(); toast(state.lang==="ar"?"تم":"Done"); }
  function toggleMode(){ state.mode=state.mode==="light"?"dark":"light"; applyTheme(); save(); }

  // ================= PWA INSTALL =================
  let deferredPrompt=null;
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("#installBtn").classList.remove("hidden");});
  function installApp(){ if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null;} else toast(T("installApp")+" — Add to Home Screen"); }

  // ================= KEYBOARD =================
  function keys(e){
    const meta=e.ctrlKey||e.metaKey;
    if(e.key==="Tab" && $$(".overlay.show").length){ trapModalTab(e); return; }
    if(meta&&e.key==="k"){e.preventDefault();openCmd();return;}
    if(meta&&e.key==="z"&&!e.shiftKey){e.preventDefault();Canvas.doUndo();renderLayersPane();return;}
    if(meta&&(e.key==="y"||(e.shiftKey&&e.key.toLowerCase()==="z"))){e.preventDefault();Canvas.doRedo();renderLayersPane();return;}
    if($("#cmdModal").classList.contains("show")){
      if(e.key==="ArrowDown"){e.preventDefault();cmdSel=Math.min(cmdItems.length-1,cmdSel+1);hiCmd();}
      if(e.key==="ArrowUp"){e.preventDefault();cmdSel=Math.max(0,cmdSel-1);hiCmd();}
      if(e.key==="Enter"&&cmdItems[cmdSel]){cmdItems[cmdSel].run();closeModal("#cmdModal");}
      if(e.key==="Escape")closeModal("#cmdModal");
      return;
    }
    if(e.key==="Escape"){ $$(".overlay.show").forEach(o=>o.classList.remove("show")); closeAnyMenu(); closeTextEditor(); Canvas.cancelPick(); }
    // SELECT belongs here alongside INPUT/TEXTAREA: a focused <select>'s
    // native behaviour for ArrowUp/ArrowDown/Delete etc. is to cycle its
    // own options — without this, those keys never reached the browser at
    // all here (2D view + a canvas piece selected, which is the common
    // case while a select like the Grade Rules piece dropdown is in use):
    // e.preventDefault() below fired first and nudged/deleted the SELECTED
    // CANVAS PIECE instead, and the dropdown never visibly responded to
    // the keyboard at all — the concrete bug behind "I can't select from
    // the piece dropdown".
    const typing = document.activeElement.tagName==="INPUT" || document.activeElement.tagName==="TEXTAREA" || document.activeElement.tagName==="SELECT" || document.activeElement.isContentEditable;
    // tool shortcuts
    const map={v:"select",p:"pen",l:"line",a:"arc",m:"measure",r:"rotate",s:"scale",t:"text"};
    if(!meta&&map[e.key]&&!typing)setTool(map[e.key]);
    // WP-17: keyboard operation of the canvas — cycle/nudge the selected
    // pattern piece with "[" / "]" and arrow keys ("[" / "]" rather than
    // Tab, so Tab keeps doing its normal job of moving DOM focus between
    // toolbar/panel controls). Delete/Backspace now goes through
    // Canvas.deleteSelection() (below), which acts on whatever is
    // currently selected on the canvas — a piece, a construction point,
    // a construction line/arc/circle, a text annotation, or a notch —
    // not just whole pieces.
    if(!meta && !typing && state.view==="2d" && !$$(".overlay.show").length){
      const pieces=Canvas.getPieces(), sel=Canvas.getSelected();
      if((e.key==="["||e.key==="]") && pieces.length){
        e.preventDefault();
        const dir=e.key==="]"?1:-1;
        const next=sel<0 ? (dir>0?0:pieces.length-1) : (sel+dir+pieces.length)%pieces.length;
        Canvas.selectPiece(next); renderLayersPane();
      } else if((sel>=0 || Canvas.getMultiSelection().length) && (e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="ArrowLeft"||e.key==="ArrowRight")){
        e.preventDefault();
        const step=e.shiftKey?0.1:1;
        const dx=e.key==="ArrowLeft"?-step:e.key==="ArrowRight"?step:0;
        const dy=e.key==="ArrowUp"?-step:e.key==="ArrowDown"?step:0;
        const group=Canvas.getMultiSelection();
        if(group.length) Canvas.nudgePieces(group,dx,dy); else Canvas.nudgePiece(sel,dx,dy);
        sync3DVisibility();
      } else if(e.key==="Delete"||e.key==="Backspace"){
        if (Canvas.deleteSelection()){
          e.preventDefault();
          renderLayersPane(); sync3DVisibility();
          if (objBrowserOpen) renderObjectBrowser();
        }
      }
    } else if(meta && !typing && state.view==="2d" && !$$(".overlay.show").length){
      // Copy/cut/paste for whatever's selected on the canvas — a construction
      // point, line/arc/circle, text, notch, or whole piece (same target
      // Canvas.deleteSelection() acts on). Only preventDefault when the
      // canvas actually had something to act on, so Ctrl/Cmd+C|X|V still do
      // their normal browser thing (e.g. copying selected page text) when
      // nothing on the canvas is selected.
      const k=e.key.toLowerCase();
      if(k==="c" && Canvas.copySelection()){ e.preventDefault(); toast(T("copiedObj")); }
      else if(k==="x" && Canvas.cutSelection()){
        e.preventDefault();
        renderLayersPane(); sync3DVisibility(); if (objBrowserOpen) renderObjectBrowser();
        toast(T("cutObj"));
      } else if(k==="v" && Canvas.pasteClipboard()){
        e.preventDefault();
        renderLayersPane(); sync3DVisibility(); if (objBrowserOpen) renderObjectBrowser();
        toast(T("pastedObj"));
      }
    }
  }
  function hiCmd(){ $$("#cmdList .cmd-item").forEach((x,i)=>x.classList.toggle("sel",i===cmdSel)); const s=$$("#cmdList .cmd-item")[cmdSel]; if(s)s.scrollIntoView({block:"nearest"}); }

  // ================= WIRE EVENTS =================
  function wire(){
    // category
    $$("#catSeg button").forEach(b=>b.onclick=()=>setCategory(b.dataset.cat));
    // view toggle
    $$("#viewToggle button").forEach(b=>{ b.onclick=()=>setView(b.dataset.v); });
    // header buttons
    $("#projectBtn").onclick=(e)=>{ e.stopPropagation(); openMenu($("#projectBtn"), projectMenuItems()); }; tip($("#projectBtn"),T("project"),T("projectMenu"));
    $("#cmdBtn").onclick=openCmd; tip($("#cmdBtn"),T("cmd")||"⌘K",T("tt_cmd"));
    $("#themeBtn").onclick=openThemePicker; tip($("#themeBtn"),T("theme"),T("tt_theme"));
    $("#langBtn").onclick=toggleLang; tip($("#langBtn"),T("language"),T("tt_lang"));
    $("#modeBtn").onclick=toggleMode; tip($("#modeBtn"),T("appearance"),T("tt_mode"));
    $("#settingsBtn").onclick=openSettings; tip($("#settingsBtn"),T("settings"),T("tt_settings"));
    tip($("#docsBtn"),T("docs"),T("tt_docs"));
    $("#helpBtn").onclick=openHelp; tip($("#helpBtn"),T("help"),T("helpTitle"));
    $("#installBtn").onclick=installApp;
    $("#unitsPill").onclick=()=>{state.unitsCm=!state.unitsCm;Canvas.setOpt("unitsCm",state.unitsCm);save();updateUnitsPill();updateStageChips();};
    tip($("#unitsPill"),T("tab_measure"),T("tt_units"));
    // grid/snap in stage toolbar
    $("#undoBtn").onclick=()=>{Canvas.doUndo();renderLayersPane();sync3DVisibility();}; tip($("#undoBtn"),T("undoLbl"),T("tt_undo"));
    $("#redoBtn").onclick=()=>{Canvas.doRedo();renderLayersPane();sync3DVisibility();}; tip($("#redoBtn"),T("redoLbl"),T("tt_redo"));
    $("#gridBtn").onclick=()=>{const v=!Canvas.getOpt("grid");Canvas.setOpt("grid",v);$("#gridBtn").classList.toggle("active",v);}; tip($("#gridBtn"),T("t_line"),T("tt_grid"));
    $("#snapBtn").onclick=()=>{const v=!Canvas.getOpt("snap");Canvas.setOpt("snap",v);$("#snapBtn").classList.toggle("active",v);}; tip($("#snapBtn"),"Snap",T("tt_snap"));
    $("#bgBtn").onclick=()=>openBgPanel(); tip($("#bgBtn"),T("bgImage"),T("tt_bgImage"));
    $("#bgBtn").classList.toggle("active",Canvas.hasBackground());
    $("#objBrowserBtn").onclick=()=>toggleObjectBrowser(); tip($("#objBrowserBtn"),T("objBrowser"),T("tt_objBrowser"));
    $("#snapshotBtn").onclick=()=>openSnapshotPanel(); tip($("#snapshotBtn"),T("snapshotMenu"),T("tt_snapshot"));
    $("#snapshotBtn").classList.toggle("active",Canvas.hasSnapshot());
    // zoom
    $("#zin").onclick=()=>Canvas.zoom(1.2); tip($("#zin"),"+",T("tt_zoomin"));
    $("#zout").onclick=()=>Canvas.zoom(0.83); tip($("#zout"),"−",T("tt_zoomout"));
    $("#zfit").onclick=()=>Canvas.fit(); tip($("#zfit"),"Fit",T("tt_zoomfit"));
    // empty state
    $("#emptyDraft").onclick=()=>{hideEmpty();setTool("pen");};
    $("#emptyLib").onclick=()=>{showPane("library");};
    // modals close
    $$("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
    $$(".overlay").forEach(o=>o.addEventListener("click",e=>{if(e.target===o)o.classList.remove("show");}));
    // cmd input
    $("#cmdInput").oninput=e=>renderCmd(e.target.value);
    // onboarding
    $("#onbNext").onclick=onbNext; $("#onbBack").onclick=onbBack; $("#onbSkip").onclick=()=>{state.onboarded=true;save();closeModal("#onbModal");};
    // 3d controls
    $("#spinToggle").onchange=e=>View3D.setSpin(e.target.checked);
    $("#walkToggle").onchange=e=>View3D.setWalk(e.target.checked);
    document.addEventListener("keydown",keys);
    window.addEventListener("resize",()=>{if(state.view==="3d")View3D.resize();});
    // 3D Cloth Lab bridge: cloth-lab posts {type:"clothlab:ready"} once its
    // own listener is mounted (avoids a race where we'd post before it can
    // hear us) — confirm the sender really is our iframe, then send it the
    // current pattern right away and on every later tab switch (syncClothLab
    // itself no-ops if the pattern hasn't actually changed).
    window.addEventListener("message",(e)=>{
      if(!e.data || e.data.type!=="clothlab:ready") return;
      const frame=$("#clothLabFrame");
      if(!frame || e.source!==frame.contentWindow) return;
      clothLabReady=true;
      syncClothLab(true);
    });
  }
  function updateUnitsPill(){ $("#unitsPill .u").textContent=state.unitsCm?"cm":"inch"; }

  // ================= INIT =================
  function init(){
    // shell text
    $("#brandName").textContent=T("appName"); $("#brandSub").textContent=T("tagline");
    Canvas.init($("#patternCanvas"), T, (p)=>{ if(p)showPieceInfo(p); });
    Canvas.setOpt("unitsCm",state.unitsCm);
    Canvas.onZoomChange(()=>{ $("#zval").textContent=Canvas.getZoom()+"%"; });
    View3D.init($("#canvas3d"));
    View3D.setLoadingCallback((v,detail)=>{
      const o=$("#v3dLoading"); if(!o) return;
      o.classList.toggle("show", v);
      if(v){ const pct=detail&&detail.progress; const txt=$("#v3dLoadingTxt");
        if(txt) txt.textContent = pct>0 ? `${T("v3dLoadingLabel")} ${pct}%` : T("v3dLoadingLabel"); }
    });
    View3D.setAvatarIssueCallback((cat,err)=>{ console.warn("[3D avatar]",cat,err); toast(T("v3dAvatarFailed")); });
    View3D.setFatalErrorCallback(()=>{ const o=$("#v3dError"); if(o) o.classList.add("show"); });
    $("#v3dRetryBtn").onclick=async()=>{
      const o=$("#v3dError"); if(o) o.classList.remove("show");
      const ok=await View3D.retryInit();
      if(ok){ View3D.resize(); build3D(); } else if(o) o.classList.add("show");
    };
    $("#v3dContinue2DBtn").onclick=()=>{ $("#v3dError").classList.remove("show"); setView("2d"); };
    applyReduceMotion(state.reduceMotion);
    initModalA11y();
    // photoreal GLB avatars saved in Settings (per category)
    Object.entries(state.avatarGLB || {}).forEach(([cat,url]) => { if(url) View3D.setAvatarURL(cat, url); });
    Canvas.onTextRequest(openTextEditor);
    Canvas.setMeasureProvider(()=>currentMeas());
    Canvas.onPointRequest(openPointEditor);
    Canvas.onPromoteRequest(openPromotePrompt);
    Canvas.onCalibrationRequest(openCalibPrompt);
    Canvas.onWarnRequest(key=>toast(T(key)));
    buildToolRail(); buildRail(); wire();
    applyTheme(); applyLang();
    updateUnitsPill(); updateStageChips();
    $("#gridBtn").classList.toggle("active",Canvas.getOpt("grid"));
    $("#snapBtn").classList.toggle("active",Canvas.getOpt("snap"));
    // register SW
    if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
    // onboarding first run
    if(!state.onboarded) setTimeout(startOnboarding,400);
    // load default pattern so app looks alive, then restore last view —
    // unless BodyForm (body.html) just handed off a category+measurements
    // set (BerryStudio-Upgrade-Plan WP-10), in which case land directly in
    // the 3D Cloth Lab with those values instead of the usual boot pattern.
    setTimeout(()=>{
      const handoff = consumeBodyFormHandoff();
      if(handoff && handoff.category && handoff.measurements){
        state.custom = {...handoff.measurements};
        loadPattern(DEFAULT_PATTERN_BY_CATEGORY[handoff.category] || "womens_dress");
        grade(); renderSizePane(); renderMeasurePane();
        setView("clothlab");
      } else {
        loadPattern(state.loaded||"womens_dress"); setView(state.view||"2d");
      }
    },200);
  }
  document.addEventListener("DOMContentLoaded",init);
})();
