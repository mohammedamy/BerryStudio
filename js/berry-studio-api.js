/* ============================================================
   BerryStudio-Upgrade-Plan WP-15 — local automation API.

   A thin, documented facade over capability that (as of WP-11) is
   real and callable everywhere it delegates to: window.Canvas,
   AIGen.generate, PatternValidator.run, computeMeasurements, and the
   WP-11 nesting Worker client — the one verb (nest) that had no
   public surface before WP-11 gave it one. This file adds no new
   drafting/export/grading/validation logic of its own; every method
   below is a direct pass-through, so behavior always matches the
   underlying feature exactly (no separate code path to drift out of
   sync).

   Unlike the WP-0.1 `window.X = X` compat aliases (Canvas/AIGen/etc,
   flagged there as temporary), `window.BerryStudio` here is the
   actual, permanent, documented deliverable this work package exists
   to ship.

   WP-42 Stage B: generate()/export() gate on entitlement (see
   checkEntitlement() below) before delegating — a real code-review-
   caught bug found this facade calling AIGen.generate()/Canvas.export*
   directly, completely bypassing js/app.js's own gating and letting any
   signed-out/expired user use two of the five gated surfaces for free
   from devtools. grade()/nest()/validate() stay ungated, matching the
   plan's own scope (only AI + Export are gated; grading/nesting/
   validation are explicitly free surfaces).
   ============================================================ */
import { Canvas } from './canvas.js';
import { AIGen } from './ai.js';
import { PatternValidator } from './validate.js';
import { computeMeasurements } from './data.js';
import { nest as nestWorker, cancelNest as cancelNestWorker } from './nesting.js';
import { Auth, isAuthConfigured } from './auth.js';
import { computeEntitlement, isAllowed } from './entitlement.js';

// A piece's grain arrow declares its own weave direction; a piece
// authored on the bias deliberately has none locked. Same rule
// js/app.js's own Create Marker modal already uses for the fast/full
// nest toggle — kept identical here rather than re-deriving it.
function isGrainLocked(piece) {
  return !!(piece.grain && piece.grain.length >= 2 && piece.grainline !== "bias");
}

// WP-42 Stage B code-review fix: generate()/export() used to call
// AIGen.generate/Canvas.export* directly, completely bypassing js/app.js's
// entitlement gate — confirmed as a real, complete bypass of every gated
// surface via this one documented, always-loaded API (any signed-out or
// expired-trial user could call BerryStudio.generate(...)/export(...) from
// devtools for free). js/app.js's own gateAllowed()/currentEntitlement are
// private closure state in a non-module IIFE with nothing exported — this
// module has no access to them, and caching a copy here would itself be a
// staleness bug — so this performs its own fresh Supabase check, same
// three calls (isAuthConfigured -> Auth.getSession -> Auth.getProfile ->
// computeEntitlement) js/app.js's own refreshEntitlement() makes. This is
// why generate()/export() are async now (a real, documented contract
// change — see README's Automation API section) even for the previously-
// synchronous export formats (svg/dxf/hpgl/pdf): there is no synchronous
// way to ask Supabase "is this session entitled" from a cold module with
// no cached state.
async function checkEntitlement() {
  if (!isAuthConfigured()) return false; // unconfigured deployment: matches gateAllowed()'s own "can't prove it, don't grant it" rule
  let session;
  try { session = await Auth.getSession(); } catch (e) { return false; }
  if (!session || !session.user) return false;
  let profile;
  // A real fetch error here means "can't prove it" for a cold, uncached
  // check with no previous state to fall back to (unlike js/app.js's
  // refreshEntitlement(), which does have one) — fail closed, same as a
  // freshly-loaded page with no session.
  try { profile = await Auth.getProfile(session.user.id); } catch (e) { return false; }
  return isAllowed(computeEntitlement(profile, Date.now()));
}
const GATE_MESSAGE = 'BerryStudio: this feature needs sign-in and an active trial/subscription — open the app and use the Account button in the header.';

export const BerryStudio = {
  // ---- generate({ prompt, imageDataURL, category, measurements, endpoint, lang, onStage }) ----
  // -> Promise<{ pieces, colors, summary, style, attributes, source, usedImage }>
  // Delegates directly to AIGen.generate (js/ai.js) — local silhouette-analysis
  // path if no `endpoint` is given, remote (POST to `endpoint`) otherwise,
  // with an automatic fallback to local on any remote failure. WP-42 Stage B:
  // AI is a gated surface — throws if the caller isn't signed in with an
  // active trial/subscription (see checkEntitlement() above).
  async generate(opts) {
    if (!(await checkEntitlement())) throw new Error(GATE_MESSAGE);
    return AIGen.generate(opts || {});
  },

  // ---- grade({ category, size, standard, kids, custom }) -> resolved measurement set ----
  // Grading a specific LOADED pattern to this measurement set is a real,
  // separate second step (see the README's "Automation API" section for
  // a runnable example) — computeMeasurements() only resolves numbers,
  // it has no pattern loaded to apply them to.
  grade(opts) {
    return computeMeasurements(opts || {});
  },

  // ---- nest({ pieceIds, matWidth, allowRotate, minDistCm, maxIterations }, onProgress) ----
  // -> Promise<{ placements, utilization, totalHeight }> (or {cancelled:true,...}/{error})
  // `pieceIds` are indices into Canvas.getPieces() (default: every currently
  // loaded piece). Runs the real WP-11 polygon-nesting Worker — the same
  // one the in-app "Create Marker" modal's "Full nest" mode uses — not a
  // bounding-box approximation.
  nest(opts, onProgress) {
    const { pieceIds, matWidth, allowRotate, minDistCm, maxIterations } = opts || {};
    const all = Canvas.getPieces();
    const selected = pieceIds && pieceIds.length ? pieceIds.map((i) => all[i]).filter(Boolean) : all;
    const pieces = selected.map((p, i) => ({ id: i, outline: p.outline, grainLocked: isGrainLocked(p) }));
    return nestWorker({ pieces, matWidth, allowRotate, minDistCm, maxIterations }, onProgress);
  },
  cancelNest() {
    return cancelNestWorker();
  },

  // ---- export(fmt, opts) -> Promise<string | {blob,dpi,clamped} | null> ----
  // fmt: 'svg' | 'dxf' | 'hpgl' | 'pdf' | 'png' | 'jpeg'. opts forwards to
  // the underlying Canvas method: {seam,unitsCm} for svg, {tiled,pageSize,
  // overlapMm,includeGuides} for pdf (WP-12), {dpi} for png/jpeg (WP-12 —
  // rasterizes through a real <canvas>). Returns null if no pattern is
  // loaded, matching every existing export call site's own empty-pattern
  // guard. WP-42 Stage B: now async for EVERY format, including the
  // previously-synchronous svg/dxf/hpgl/pdf — a real, documented contract
  // change (update any caller doing `const svg = BerryStudio.export("svg")`
  // to `await` it) — because Export is now a gated surface and there is no
  // synchronous way to check entitlement (see checkEntitlement() above).
  // Throws if the caller isn't entitled — never silently returns
  // unauthorized data.
  async export(fmt, opts) {
    if (!(await checkEntitlement())) throw new Error(GATE_MESSAGE);
    if (!Canvas.getPieces().length) return null;
    const F = (fmt || "svg").toLowerCase();
    if (F === "svg") return Canvas.exportSVG(opts);
    if (F === "dxf") return Canvas.exportDXF();
    if (F === "hpgl") return Canvas.exportHPGL();
    if (F === "pdf") return Canvas.exportPDF(opts);
    if (F === "png" || F === "jpeg") return Canvas.exportRaster(F, (opts && opts.dpi) || 300);
    throw new Error(`BerryStudio.export: unknown format "${fmt}" (expected svg/dxf/hpgl/pdf/png/jpeg)`);
  },

  // ---- validate({ pieceIds, seamAllowanceCm, bodyChestCm }) -> PatternValidator's full report ----
  // `pieceIds` optionally scopes the run to a subset (default: every
  // loaded piece) — front/back seam-length-parity pairing (js/validate.js)
  // still runs against exactly the pieces given, so validating a deliberate
  // subset can genuinely change which pairs are found. `bodyChestCm`
  // (WP-24, optional) is the wearer's body chest measurement — e.g. the
  // same value BerryStudio.grade(...)'s result carries as `.chest` —
  // needed for the Ease check to compare a hinted piece's finished chest
  // against a real body; omitted, Ease honestly reports "not applicable".
  validate(opts) {
    const { pieceIds, seamAllowanceCm, bodyChestCm } = opts || {};
    const all = Canvas.getPieces();
    const pieces = pieceIds && pieceIds.length ? pieceIds.map((i) => all[i]).filter(Boolean) : all;
    return PatternValidator.run(pieces, { seamAllowanceCm, offsetPoly: Canvas.offsetPoly, bodyChestCm });
  },
};

if (typeof window !== "undefined") window.BerryStudio = BerryStudio;
