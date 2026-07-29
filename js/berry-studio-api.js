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
   ============================================================ */
import { Canvas } from './canvas.js';
import { AIGen } from './ai.js';
import { PatternValidator } from './validate.js';
import { computeMeasurements } from './data.js';
import { nest as nestWorker, cancelNest as cancelNestWorker } from './nesting.js';

// A piece's grain arrow declares its own weave direction; a piece
// authored on the bias deliberately has none locked. Same rule
// js/app.js's own Create Marker modal already uses for the fast/full
// nest toggle — kept identical here rather than re-deriving it.
function isGrainLocked(piece) {
  return !!(piece.grain && piece.grain.length >= 2 && piece.grainline !== "bias");
}

export const BerryStudio = {
  // ---- generate({ prompt, imageDataURL, category, measurements, endpoint, lang, onStage }) ----
  // -> Promise<{ pieces, colors, summary, style, attributes, source, usedImage }>
  // Delegates directly to AIGen.generate (js/ai.js) — local silhouette-analysis
  // path if no `endpoint` is given, remote (POST to `endpoint`) otherwise,
  // with an automatic fallback to local on any remote failure.
  generate(opts) {
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

  // ---- export(fmt, opts) -> string | {blob,dpi,clamped} | null ----
  // fmt: 'svg' | 'dxf' | 'hpgl' | 'pdf' | 'png' | 'jpeg'. opts forwards to
  // the underlying Canvas method: {seam,unitsCm} for svg, {tiled,pageSize,
  // overlapMm,includeGuides} for pdf (WP-12), {dpi} for png/jpeg (WP-12 —
  // async, returns a Promise since raster export rasterizes through a real
  // <canvas>). Returns null if no pattern is loaded, matching every
  // existing export call site's own empty-pattern guard.
  export(fmt, opts) {
    if (!Canvas.getPieces().length) return null;
    const F = (fmt || "svg").toLowerCase();
    if (F === "svg") return Canvas.exportSVG(opts);
    if (F === "dxf") return Canvas.exportDXF();
    if (F === "hpgl") return Canvas.exportHPGL();
    if (F === "pdf") return Canvas.exportPDF(opts);
    if (F === "png" || F === "jpeg") return Canvas.exportRaster(F, (opts && opts.dpi) || 300);
    throw new Error(`BerryStudio.export: unknown format "${fmt}" (expected svg/dxf/hpgl/pdf/png/jpeg)`);
  },

  // ---- validate({ pieceIds, seamAllowanceCm }) -> PatternValidator's full report ----
  // `pieceIds` optionally scopes the run to a subset (default: every
  // loaded piece) — front/back seam-length-parity pairing (js/validate.js)
  // still runs against exactly the pieces given, so validating a deliberate
  // subset can genuinely change which pairs are found.
  validate(opts) {
    const { pieceIds, seamAllowanceCm } = opts || {};
    const all = Canvas.getPieces();
    const pieces = pieceIds && pieceIds.length ? pieceIds.map((i) => all[i]).filter(Boolean) : all;
    return PatternValidator.run(pieces, { seamAllowanceCm, offsetPoly: Canvas.offsetPoly });
  },
};

if (typeof window !== "undefined") window.BerryStudio = BerryStudio;
