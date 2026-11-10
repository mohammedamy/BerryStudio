/* ============================================================
   Pattern Construction Builders — shared drafting vocabulary.

   Extracted from js/reference-patterns.js (docs/plan 4.md Phase 2) once
   Phase 3 (the 100-pattern core catalogue) needed the SAME real
   construction math across ~100 more patterns — at that point "each file
   keeps its own small local copy" (the convention js/fancy-patterns.js
   and js/underwear-library.js each use for their OWN curve math, since
   duplicating ~20 lines of bezier sampling per file is cheap and keeps
   their module boundaries simple) stops being the right call: this is
   several hundred lines of real garment-construction logic (princess
   seams, raglan seams, two-piece sleeves, gored skirts, trouser legs,
   collars) meant to be reused verbatim by many generator files, not
   reimplemented per file. A real shared module is the honest choice once
   reuse is this wide, not a stylistic reversal of the smaller-file
   convention elsewhere.

   Every function here is a pure geometry builder: given cm measurements,
   it returns an `outline` array (a plain [[x,y],...] point list) carrying
   real `curves` metadata (via withCurves(), the same fromIdx/toIdx/c1/c2
   convention every generator in this codebase already uses) and any
   named index properties (e.g. `.chestIdx`, `.princessFromIdx`,
   `.frontNotchIdx`) a caller needs to place notches, declare
   `chestEdgeIndices`, or declare `edges[].seamId` — never randomness,
   never Date.now(), never module-level mutable state, so every generator
   built on these stays a pure function of its own measurements (docs/
   plan 4.md §2).
   ============================================================ */
import { computeGatherWidth } from './pleats.js';

// ---------------- curve sampling ----------------
// Exact raised-cosine (-cos) Hermite/Bezier handle factor: matches
// y(x) = y0 - H * (1 - cos(pi * (x - x0) / dx)) / 2 with horizontal
// tangents (slope = 0) at both the underarm base and crown peak, an
// S-curve inflection at mid-armscye, and midpoint slope (pi/2)*(H/dx).
export const COSINE_CAP_K = 1 - 2 / Math.PI;

export function qBez(p0, c, p1, n) {
  n = n || 8;
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return pts;
}
export function cBez(p0, c1, c2, p1, n) {
  n = n || 6;
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
    ]);
  }
  return pts;
}
export function qBezToCubic(p0, c, p1) {
  return {
    c1: [p0[0] + (2 / 3) * (c[0] - p0[0]), p0[1] + (2 / 3) * (c[1] - p0[1])],
    c2: [p1[0] + (2 / 3) * (c[0] - p1[0]), p1[1] + (2 / 3) * (c[1] - p1[1])],
  };
}

// Raised-cosine (-cos) S-curve sleeve cap from `frontBase` -> `capTop` -> `backBase`.
// Unlike an inverted-|x| triangle or single quadratic arc, both underarm endpoints
// and the crown peak have horizontal tangents (dy/dx = 0): the curve swoops
// concave-up out of the underarm hollow, inflects smoothly mid-armscye, rounds
// over the crown dome, and mirrors smoothly down to the opposite underarm.
export function cosineSleeveCap(frontBase, capTop, backBase, opts) {
  const o = opts || {};
  const n = o.samplesPerHalf || 6;
  const fromOffset = o.fromIdxOffset || 0;
  const kFU = o.kFrontUnderarm != null ? o.kFrontUnderarm : COSINE_CAP_K;
  const kFC = o.kFrontCrown != null ? o.kFrontCrown : COSINE_CAP_K;
  const kBC = o.kBackCrown != null ? o.kBackCrown : COSINE_CAP_K;
  const kBU = o.kBackUnderarm != null ? o.kBackUnderarm : COSINE_CAP_K;

  const dx1 = capTop[0] - frontBase[0];
  const dx2 = backBase[0] - capTop[0];
  const fc1 = [frontBase[0] + dx1 * kFU, frontBase[1]];
  const fc2 = [capTop[0] - dx1 * kFC, capTop[1]];
  const bc1 = [capTop[0] + dx2 * kBC, capTop[1]];
  const bc2 = [backBase[0] - dx2 * kBU, backBase[1]];

  const frontPts = cBez(frontBase, fc1, fc2, capTop, n);
  const backPts = cBez(capTop, bc1, bc2, backBase, n);
  const points = [frontBase, ...frontPts, ...backPts];
  const curves = [
    { fromIdx: fromOffset, toIdx: fromOffset + n, c1: fc1, c2: fc2 },
    { fromIdx: fromOffset + n, toIdx: fromOffset + 2 * n, c1: bc1, c2: bc2 },
  ];
  return {
    points,
    curves,
    crownIdx: fromOffset + n,
    backUnderarmIdx: fromOffset + 2 * n,
    frontNotchIdx: fromOffset + Math.max(1, Math.round(n * 0.35)),
    backNotchIdx1: fromOffset + n + Math.max(1, Math.round(n * 0.55)),
    backNotchIdx2: fromOffset + n + Math.min(n - 1, Math.max(2, Math.round(n * 0.72))),
  };
}

// Complete one-piece flat-pattern sleeve outline with a true `-cos` S-curve cap,
// cubic Bezier `.curves` metadata, and standard front/crown/back notch indices.
export function cosineSleeveOutline(opts) {
  const width = Math.max(8, Number(opts.width) || 32);
  const halfW = width / 2;
  const baseY = Number(opts.baseY) || 0;
  const capH = opts.capHeight != null ? Math.max(2.5, Number(opts.capHeight)) : Math.max(4.5, halfW * 0.58);
  const hemY = Math.max(baseY + 5, Number(opts.sleeveLen) || 40);
  const rawCuffW = opts.cuffWidth != null ? Number(opts.cuffWidth) : width * 0.78;
  let cuffLeft = (width - rawCuffW) / 2;
  let cuffRight = width - cuffLeft;
  // Keep non-zero taper/flare outside checkFoldSymmetry's 2%-of-width candidate-fold band
  if (Math.abs(cuffLeft) > 1e-6 && Math.abs(cuffLeft) < width * 0.035) {
    const sign = cuffLeft >= 0 ? 1 : -1;
    cuffLeft = sign * width * 0.04;
    cuffRight = width - cuffLeft;
  }
  const frontHollow = opts.frontHollow !== false;
  const cap = cosineSleeveCap(
    [0, baseY],
    [halfW, baseY - capH],
    [width, baseY + (Number(opts.backDrop) || 0)],
    {
      samplesPerHalf: opts.samplesPerHalf || 6,
      kFrontUnderarm: frontHollow ? 0.41 : COSINE_CAP_K,
      kFrontCrown: frontHollow ? 0.35 : COSINE_CAP_K,
      kBackCrown: frontHollow ? 0.39 : COSINE_CAP_K,
      kBackUnderarm: frontHollow ? 0.34 : COSINE_CAP_K,
    },
  );
  const cuffDropL = Number(opts.cuffLeftDrop) || 0;
  const outline = [...cap.points, [cuffRight, hemY], [cuffLeft, hemY + cuffDropL]];
  withCurves(outline, cap.curves);
  outline.frontUnderarmIdx = 0;
  outline.crownIdx = cap.crownIdx;
  outline.capCenterIdx = cap.crownIdx;
  outline.backUnderarmIdx = cap.backUnderarmIdx;
  outline.frontNotchIdx = cap.frontNotchIdx;
  outline.backNotchIdx1 = cap.backNotchIdx1;
  outline.backNotchIdx2 = cap.backNotchIdx2;
  outline.capWidthCm = width;
  return outline;
}
// Attaches `.curves` directly to the outline array (same idiom every
// other generator file in this codebase uses) so a piece definition can
// read `outline: someHelper(...)` and pick up real curve metadata
// without a second parallel return value.
export function withCurves(outline, curves) {
  if (curves && curves.length) outline.curves = curves;
  return outline;
}
// Copies any outline.curves (attached via withCurves above) onto the
// piece object itself — called once per pattern after all pieces are
// built, same as js/underwear-library.js's hoistCurves().
export function hoistCurves(pieces) {
  for (const p of pieces) if (!p.curves && p.outline && p.outline.curves) p.curves = p.outline.curves;
  return pieces;
}
export function dedupeJoin(a, b) {
  if (a.length && b.length) {
    const last = a[a.length - 1], first = b[0];
    if (last[0] === first[0] && last[1] === first[1]) return a.slice(0, -1);
  }
  return a;
}

// ---------------- reusable construction pieces ----------------

// WP-61/63 (docs/plan 4.md Phase 5, cloth-lab compatibility pass): given
// an edge [fromIdx,toIdx] within a cutOnFold piece's OWN original
// (pre-unfold) outline of length `nOrig`, returns the matching edge on
// that SAME piece's own mirrored-interior half (see
// cloth-lab/src/pattern/importFromApp.js's unfoldPiece(): appended
// mirror point k = mirror(original[nOrig-2-k]), placed at unfolded
// index nOrig+k — solving for i = nOrig-2-k gives unfolded index
// 2*nOrig-2-i). A cutOnFold piece is a single already-doubled shape,
// not a bilateral pair, so its own hip-to-gusset/waist-to-side curve
// needs both a right-side declaration (walked as-authored) AND this
// correctly-computed left-side one — verified against a direct
// reproduction of unfoldPiece() before ever being trusted (see
// js/ai.js's own copy, added first, for that verification).
// Code-review fix, caught by direct reproduction before trusting a new
// call site: the raw `2*nOrig-2-i` formula only holds for an INTERIOR
// point (1 <= i <= nOrig-2) — index 0 and index nOrig-1 are the
// fold-line's own two shared endpoints, kept as themselves (never
// duplicated) by unfoldPiece(), so mirroring produces a nonexistent,
// out-of-bounds index for them (confirmed: 2*6-2-0=10 on a 10-point
// unfolded array, indices 0..9). Those two endpoints map to themselves.
function foldMirrorIndex(i, nOrig) {
  return (i === 0 || i === nOrig - 1) ? i : 2 * nOrig - 2 - i;
}
export function foldMirrorEdge(nOrig, fromIdx, toIdx) {
  return { fromIdx: foldMirrorIndex(toIdx, nOrig), toIdx: foldMirrorIndex(fromIdx, nOrig) };
}

// A simple 4-corner rectangular waistband/collar-band/cuff strip — cut on
// the straight grain, no curve needed (a real straight strip, not a
// stand-in for a curved piece).
export function bandPc(lengthCm, heightCm) {
  return [[0, 0], [lengthCm, 0], [lengthCm, heightCm], [0, heightCm]];
}

// Half collar (classic two-point shirt collar), cut on the fold at
// center-back (idx0 and the last point). Walks: CB neck point -> (curved
// neckline edge) -> front point base -> point tip (extends further out
// AND further down than the neckline) -> up to the top/outer edge -> back
// to CB at the top, closing.
export function pointedCollar(halfNeck, standH, pointDrop) {
  const neckSeg = [[0, 0], [halfNeck * 0.5, standH * 0.25], [halfNeck, 0]];
  const neckPts = qBez(...neckSeg, 6);
  const outline = [
    [0, 0], ...neckPts,
    [halfNeck + pointDrop * 0.4, pointDrop],
    [halfNeck * 0.55, standH],
    [0, standH],
  ];
  withCurves(outline, [{ fromIdx: 0, toIdx: neckPts.length, ...qBezToCubic(...neckSeg) }]);
  outline.frontIdx = neckPts.length; // front-point base, matches the collar stand's own front end
  return outline;
}

// Round (Peter Pan style) collar, no stand — a curved neckline edge and a
// rounder curved outer edge, no point. Cut on the fold at CB.
export function roundCollarPc(halfNeck, width) {
  const neckSeg = [[0, 0], [halfNeck * 0.5, width * 0.12], [halfNeck, 0]];
  const neckPts = qBez(...neckSeg, 6);
  const outerSeg = [[halfNeck, 0], [halfNeck * 0.55, width * 1.15], [0, width]];
  const outerPts = qBez(...outerSeg, 6);
  const outline = [[0, 0], ...neckPts.slice(0, -1), ...outerPts];
  const off = neckPts.length; // = 6, where outerPts' own [halfNeck,0] start lands
  withCurves(outline, [
    { fromIdx: 0, toIdx: off, ...qBezToCubic(...neckSeg) },
    { fromIdx: off, toIdx: off + outerPts.length - 1, ...qBezToCubic(...outerSeg) },
  ]);
  outline.frontIdx = off; // where the neckline edge meets the outer edge, at CF
  return outline;
}

// Collar stand: a slightly curved standing band that follows the neck
// curve rather than a flat rectangle.
export function collarStand(halfNeck, standH) {
  const seg = [[0, 0], [halfNeck * 0.5, -standH * 0.35], [halfNeck, 0]];
  const top = qBez(...seg, 6);
  const outline = [[0, 0], ...top, [halfNeck, standH], [0, standH]];
  withCurves(outline, [{ fromIdx: 0, toIdx: top.length, ...qBezToCubic(...seg) }]);
  outline.shoulderIdx = Math.round(top.length / 2); // roughly the shoulder-seam match point
  return outline;
}

// Set-in sleeve cap: raised-cosine (-cos) S-curve with subtle front/back
// tailoring asymmetry (deeper front underarm hollow + fuller back crown ease,
// preserving horizontal tangents at both underarms and the crown peak).
// Walks: underarm-front -> (-cos S-curve) -> cap top -> (-cos S-curve)
// -> underarm-back -> tapered back seam -> across the cuff -> tapered front
// seam, closing. Front gets ONE notch partway up its curve, back gets TWO
// close together — the single/double sleeve-notch convention real patterns
// use to mark which half is which without reading a label.
export function setInSleeve(bicep, sleeveLen, capHeightF) {
  capHeightF = capHeightF == null ? 1 : capHeightF;
  const halfBicep = bicep / 2;
  const capH = halfBicep * 0.58 * capHeightF;
  return cosineSleeveOutline({
    width: bicep,
    sleeveLen: Math.max(5, sleeveLen),
    capHeight: capH,
    cuffWidth: bicep * 0.84,
    frontHollow: true,
    samplesPerHalf: 6,
  });
}

// Two-piece sleeve: an outer/upper panel carrying the full (front+back)
// `-cos` S-curve cap, and a smaller inner/under panel completing the underarm —
// a genuinely different sleeve CONSTRUCTION from the one-piece set-in
// sleeve above.
export function sleeveUpperPc(bicep, sleeveLen) {
  const halfBicep = bicep / 2, capH = halfBicep * 0.56;
  const cap = cosineSleeveCap(
    [bicep * 0.08, 0],
    [halfBicep, -capH],
    [bicep * 0.92, 0],
    {
      samplesPerHalf: 6,
      kFrontUnderarm: 0.41,
      kFrontCrown: 0.35,
      kBackCrown: 0.39,
      kBackUnderarm: 0.34,
    },
  );
  const hemY = Math.max(5, sleeveLen);
  const outline = [...cap.points, [bicep * 0.82, hemY], [bicep * 0.18, hemY]];
  withCurves(outline, cap.curves);
  outline.frontNotchIdx = cap.frontNotchIdx;
  outline.backNotchIdx1 = cap.backNotchIdx1;
  outline.backNotchIdx2 = cap.backNotchIdx2;
  outline.crownIdx = cap.crownIdx;
  return outline;
}
export function sleeveUnderPc(bicep, sleeveLen) {
  const w = bicep * 0.24;
  const cap = cosineSleeveCap([0, 0], [w * 0.5, -2.6], [w, 0], { samplesPerHalf: 4 });
  const hemY = Math.max(5, sleeveLen * 0.85);
  const outline = [...cap.points, [w * 0.85, hemY], [w * 0.15, hemY]];
  return withCurves(outline, cap.curves);
}

// Gathered puff sleeve: the `-cos` S-curve cap is cut WIDER than the armhole
// it sews into (js/pleats.js's computeGatherWidth) and eased in with gathering
// stitches, unlike a set-in sleeve's cap curve which matches the armhole
// directly.
export function puffSleevePc(bicep, sleeveLen, gatherRatio) {
  const rawW = computeGatherWidth(bicep, gatherRatio);
  const halfW = rawW / 2, capH = halfW * 0.52;
  return cosineSleeveOutline({
    width: rawW,
    sleeveLen: Math.max(5, sleeveLen),
    capHeight: capH,
    cuffWidth: rawW * 0.64,
    frontHollow: false,
    samplesPerHalf: 6,
  });
}

// Princess-seam curve (bust/waist/hip shaping): three quadratic segments
// (shoulder->bust, bust->waist, waist->hip). Returns points INCLUDING
// shoulderPt at index 0 and hipPt as the last curved point (caller
// appends the hem point).
export function princessCurve(shoulderPt, bustX, bustY, waistX, waistY, hipX, hipY) {
  const seg1 = [shoulderPt, [bustX * 0.75, (shoulderPt[1] + bustY) / 2], [bustX, bustY]];
  const seg2 = [[bustX, bustY], [(bustX + waistX) / 2, (bustY + waistY) / 2], [waistX, waistY]];
  const seg3 = [[waistX, waistY], [(waistX + hipX) / 2, (waistY + hipY) / 2], [hipX, hipY]];
  const p1 = qBez(...seg1, 6), p2 = qBez(...seg2, 5), p3 = qBez(...seg3, 5);
  const points = [shoulderPt, ...p1, ...p2, ...p3];
  const curves = [
    { fromIdx: 0, toIdx: p1.length, ...qBezToCubic(...seg1) },
    { fromIdx: p1.length, toIdx: p1.length + p2.length, ...qBezToCubic(...seg2) },
    { fromIdx: p1.length + p2.length, toIdx: p1.length + p2.length + p3.length, ...qBezToCubic(...seg3) },
  ];
  return { points, curves };
}

// Princess-seamed front/back center+side panels, built in ONE shared
// coordinate space (center's princess edge and side's princess edge use
// the literal same shoulder/bust/waist/hip points) — real, not
// approximated — which is also what js/pattern-flat.js's sharedSeamId
// placement relies on to render these as one joined silhouette instead
// of flanked boxes.
// opts: { chest, waist, hips, backLen, necklineDepth, hemBelowHip }
export function princessPanel(opts) {
  const { chest, waist, hips, backLen, necklineDepth, hemBelowHip } = opts;
  const topY = -1, necklineY = necklineDepth;
  const bustY = backLen * 0.42, waistY = backLen * 0.98, hipY = waistY + 18, hemY = hipY + hemBelowHip;
  const shoulderX = chest * 0.24;
  const fBustX = chest * 0.60, fWaistX = waist * 0.50, fHipX = hips * 0.58;
  const bBustX = chest * 0.55, bWaistX = waist * 0.47, bHipX = hips * 0.54;
  const sideX = chest * 1.06;

  function centerPanel(bustX, waistX, hipX, neckDepthY, isFront = false) {
    const shoulderPt = [shoulderX, topY];
    const neckSeg = (isFront && opts.squareNeck)
      ? [[0, neckDepthY], [shoulderX * 0.7, neckDepthY], shoulderPt]
      : [[0, neckDepthY], [shoulderX * 0.5, neckDepthY - 2], shoulderPt];
    const neckPts = qBez(...neckSeg, 6);
    const princess = princessCurve(shoulderPt, bustX, bustY, waistX, waistY, hipX, hipY);
    const outline = [[0, neckDepthY], ...neckPts.slice(0, -1), ...princess.points, [hipX, hemY], [0, hemY]];
    const off = 1 + (neckPts.length - 1);
    const curves = [
      { fromIdx: 0, toIdx: off, ...qBezToCubic(...neckSeg) },
      ...princess.curves.map((c) => ({ ...c, fromIdx: c.fromIdx + off, toIdx: c.toIdx + off })),
    ];
    withCurves(outline, curves);
    outline.princessFromIdx = off;
    outline.princessToIdx = off + princess.points.length - 1;
    outline.bustNotchIdx = off + 6; // princess.points[6] == bustPt (see princessCurve)
    outline.waistNotchIdx = off + 11; // princess.points[11] == waistPt
    return outline;
  }

  function sidePanel(centerOutline) {
    const shoulderPt = [shoulderX, topY];
    const princessFwd = centerOutline.slice(centerOutline.princessFromIdx, centerOutline.princessToIdx + 1);
    const princessRev = princessFwd.slice().reverse(); // side's own left edge: hip->...->shoulder
    const underarmPt = [sideX, bustY * 0.52];
    const armSeg = [shoulderPt, [(shoulderX + sideX) / 2, topY - 1], underarmPt];
    const armPts = qBez(...armSeg, 6);
    const sideWaistPt = [sideX * 0.98, waistY], sideHipPt = [sideX * 1.0, hipY];
    const sideHemPt = [centerOutline[centerOutline.princessToIdx][0] + (sideX * 1.0 - centerOutline[centerOutline.princessToIdx][0]), hemY];
    const outline = [...princessRev, ...armPts, sideWaistPt, sideHipPt, sideHemPt];
    const armFromIdx = princessRev.length - 1;
    withCurves(outline, [{ fromIdx: armFromIdx, toIdx: armFromIdx + armPts.length, ...qBezToCubic(...armSeg) }]);
    outline.armholeFromIdx = armFromIdx;
    outline.armholeToIdx = armFromIdx + armPts.length;
    outline.princessFromIdx = 0;
    outline.princessToIdx = princessRev.length - 1;
    return outline;
  }

  const frontCenter = centerPanel(fBustX, fWaistX, fHipX, necklineY, true);
  const frontSide = sidePanel(frontCenter);
  const backCenter = centerPanel(bBustX, bWaistX, bHipX, necklineY * 0.45, false);
  const backSide = sidePanel(backCenter);
  return { frontCenter, frontSide, backCenter, backSide, hemY, sideX, shoulderX };
}

// A plain (non-princess) front/back bodice half: curved neckline + curved
// armhole, straight below the underarm to the hem, on the fold.
// Suppression comes from a separate waist dart the caller adds — a
// genuinely different suppression method from princessPanel() above.
export function plainBodicePanel(shoulderX, necklineY, chestX, underarmY, waistX, waistY, hipX, hipY, hemX, hemY, squareNeck = false) {
  const topY = -1;
  const shoulderPt = [shoulderX, topY];
  const neckSeg = squareNeck
    ? [[0, necklineY], [shoulderX * 0.7, necklineY], shoulderPt]
    : [[0, necklineY], [shoulderX * 0.5, necklineY - 2], shoulderPt];
  const neckPts = qBez(...neckSeg, 5);
  const underarmPt = [chestX, underarmY];
  const armSeg = [shoulderPt, [shoulderX + (chestX - shoulderX) * 0.6, topY + underarmY * 0.12], underarmPt];
  const armPts = qBez(...armSeg, 6);
  const outline = [[0, necklineY], ...neckPts.slice(0, -1), ...armPts, [waistX, waistY], [hipX, hipY], [hemX, hemY], [0, hemY]];
  const neckOff = 1 + (neckPts.length - 1);
  withCurves(outline, [
    { fromIdx: 0, toIdx: neckOff, ...qBezToCubic(...neckSeg) },
    { fromIdx: neckOff, toIdx: neckOff + armPts.length, ...qBezToCubic(...armSeg) },
  ]);
  outline.waistIdx = neckOff + armPts.length;
  outline.chestIdx = neckOff + armPts.length - 1; // underarm point, at chest/bust level
  return outline;
}

// A raglan body panel: the "shoulder" is a diagonal seam running from the
// neckline straight down to the underarm (no separate shoulder seam) —
// the sleeve extends UP to meet it. See raglanSleevePc() below for the
// matching sleeve.
export function raglanBodyPanel(neckX, necklineY, chestX, underarmY, waistX, waistY, hipX, hipY, hemX, hemY) {
  const neckSeg = [[0, necklineY], [neckX * 0.5, necklineY - 1.5], [neckX, 0]];
  const neckPts = qBez(...neckSeg, 4);
  const raglanSeg = [[neckX, 0], [neckX + (chestX - neckX) * 0.3, underarmY * 0.5], [chestX, underarmY]];
  const raglanPts = qBez(...raglanSeg, 6);
  const outline = [[0, necklineY], ...neckPts.slice(0, -1), ...raglanPts, [waistX, waistY], [hipX, hipY], [hemX, hemY], [0, hemY]];
  const neckOff = 1 + (neckPts.length - 1);
  withCurves(outline, [
    { fromIdx: 0, toIdx: neckOff, ...qBezToCubic(...neckSeg) },
    { fromIdx: neckOff, toIdx: neckOff + raglanPts.length, ...qBezToCubic(...raglanSeg) },
  ]);
  outline.raglanFromIdx = neckOff;
  outline.raglanToIdx = neckOff + raglanPts.length;
  outline.chestIdx = outline.raglanToIdx;
  return outline;
}
// The matching raglan sleeve: a front raglan edge and a back raglan edge
// (built in the SAME shared coordinate frame as the body panels), meeting
// at the top near the neckline, with the ordinary sleeve tube below.
export function raglanSleevePc(neckX, chestX, underarmY, sleeveLen) {
  const raglanSeg = [[neckX, 0], [neckX + (chestX - neckX) * 0.3, underarmY * 0.5], [chestX, underarmY]];
  const raglanPts = qBez(...raglanSeg, 6); // front raglan edge, neckX,0 -> chestX,underarmY
  const cuffHalf = chestX * 0.32;
  const backRaglanSeg = raglanSeg.map((p) => [neckX - (p[0] - neckX), p[1]]); // mirrored, for the back edge
  const backRaglanPts = raglanPts.slice().reverse().map((p) => [neckX - (p[0] - neckX), p[1]]); // walked underarm -> neckX
  const outline = [
    [neckX, 0], ...raglanPts,
    [chestX * 0.62, underarmY + sleeveLen], [chestX * 0.62 - cuffHalf * 2, underarmY + sleeveLen],
    ...backRaglanPts,
  ];
  outline.frontRaglanFromIdx = 0;
  outline.frontRaglanToIdx = raglanPts.length;
  outline.backRaglanFromIdx = raglanPts.length + 2;
  outline.backRaglanToIdx = outline.length - 1;
  return withCurves(outline, [
    { fromIdx: 0, toIdx: raglanPts.length, ...qBezToCubic(...raglanSeg) },
    // backRaglanPts walks underarm->neck (reversed direction relative to
    // backRaglanSeg, which is defined neck->underarm like the front) —
    // same c1/c2 swap convention js/pattern-flat.js's unfoldPiece uses
    // for a reflected-and-reversed curve copy.
    { fromIdx: outline.backRaglanFromIdx, toIdx: outline.backRaglanToIdx, c1: qBezToCubic(...backRaglanSeg).c2, c2: qBezToCubic(...backRaglanSeg).c1 },
  ]);
}

// Curved shoulder yoke (front or back), cut on the fold — a gentle
// upward curve rather than a straight band.
export function yokeCurvePc(halfWidth, depth) {
  const seg = [[0, depth], [halfWidth * 0.5, depth * 0.4], [halfWidth, 0]];
  const top = qBez(...seg, 6);
  const outline = [[0, depth], ...top, [halfWidth, depth * 1.6], [0, depth * 1.6]];
  withCurves(outline, [{ fromIdx: 0, toIdx: top.length, ...qBezToCubic(...seg) }]);
  outline.shoulderIdx = top.length + 1; // outer shoulder-tip point, where the yoke meets the armhole/sleeve
  return outline;
}

export function pocketPatch(w, h) {
  return [[0, 0], [w, 0], [w, h], [0, h]];
}

// A trapezoid gore panel: narrower at the waist, wider at the hem — the
// gore's own angled side edges ARE its suppression method (no dart
// needed to go from waist to hip circumference). A HALF shape, cut on
// the fold (one flat edge at x=0).
function threePtCubic(p0, pm, p1) {
  const c = [2 * pm[0] - 0.5 * (p0[0] + p1[0]), 2 * pm[1] - 0.5 * (p0[1] + p1[1])];
  return qBezToCubic(p0, c, p1);
}

export function gorePanel(waistHalfW, hipHalfW, hemHalfW, waistToHip, hipToHem) {
  const p1 = [waistHalfW, 0], p2 = [hipHalfW, waistToHip], p3 = [hemHalfW, waistToHip + hipToHem];
  const outline = [[0, 0], p1, p2, p3, [0, waistToHip + hipToHem]];
  return withCurves(outline, [{ fromIdx: 1, toIdx: 3, ...threePtCubic(p1, p2, p3) }]);
}
// A FULL (not cut-on-fold) gore, symmetric about its own vertical center
// — both edges flare outward equally from waist to hem, unlike
// gorePanel() above.
export function sideGorePanel(waistW, hipW, hemW, waistToHip, hipToHem) {
  const hw = waistW / 2, hh = hipW / 2, hm = hemW / 2, hipY = waistToHip, hemY = waistToHip + hipToHem;
  const r1 = [hw, 0], r2 = [hh, hipY], r3 = [hm, hemY];
  const l1 = [-hm, hemY], l2 = [-hh, hipY], l3 = [-hw, 0];
  const outline = [l3, r1, r2, r3, l1, l2];
  return withCurves(outline, [
    { fromIdx: 1, toIdx: 3, ...threePtCubic(r1, r2, r3) },
    { fromIdx: 4, toIdx: 5, ...threePtCubic(l1, [0.5 * (l1[0] + l2[0]), 0.5 * (l1[1] + l2[1])], l2) },
  ]);
}

// One trouser leg panel (a full piece, mirrored L/R as a bilateral pair —
// not cut on fold). Walks clockwise: waist (outseam side) -> down the
// outseam, flaring slightly at the hip -> across the hem -> up the
// inseam -> a curved crotch seam back to the waist (inseam side). The
// back panel's crotch curve is real-conventionally deeper and more
// extended than the front's (isFront controls this). floorY (the hem
// line) is the SAME for front and back regardless of crotch shape — a
// real physical constraint (both legs of the same trouser end at the
// same length).
export function legPanel(waistW, hipW, hemW, riseLen, inseamLen, isFront) {
  const floorY = riseLen + inseamLen;
  const crotchDepth = isFront ? riseLen * 0.9 : riseLen * 1.15;
  const crotchExt = isFront ? hipW * 0.22 : hipW * 0.32;
  const waistInX = waistW * 0.2;
  const riseBottom = [waistInX - crotchExt, crotchDepth];
  const hemInX = riseBottom[0] + hemW * 0.18;
  const crotchSeg = [[waistInX, 0], [waistInX - crotchExt * 0.75, crotchDepth * 0.55], riseBottom];
  const crotchPts = qBez(...crotchSeg, 6);
  const outline = [
    [waistW, 0],                                     // 0 waist, outseam
    [waistW + (hipW - waistW), riseLen],              // 1 hip, outseam — slight flare
    [hemW, floorY],                                   // 2 hem, outseam
    [hemInX, floorY],                                 // 3 hem, inseam
    riseBottom,                                        // 4 inseam meets the crotch curve
    ...crotchPts.slice(0, -1).reverse(),               // 5.. curve back up to the waist (inseam side)
    [waistInX, 0],                                     // last: waist, inseam — closes near point 0
  ];
  withCurves(outline, [{ fromIdx: 4, toIdx: outline.length - 1, c1: qBezToCubic(...crotchSeg).c2, c2: qBezToCubic(...crotchSeg).c1 }]);
  outline.crotchIdx = 4;
  outline.hemOutIdx = 2;
  outline.hemInIdx = 3;
  return outline;
}

// A dramatic wide sleeve wedge (kimono/batwing/cape-sleeve style): a
// wide `-cos` S-curved shoulder-to-underarm edge flaring to the sleeve hem —
// a genuinely different sleeve construction from a fitted set-in cap or a
// gathered puff, closer to a flare/godet than a tailored sleeve.
export function wideSleevePc(shoulderW, sleeveLen, wideF) {
  wideF = wideF == null ? 1 : wideF;
  const capH = Math.max(3, shoulderW * 0.18 * wideF);
  const cap = cosineSleeveCap([0, 0], [shoulderW * 0.5, -capH], [shoulderW, 0], { samplesPerHalf: 6 });
  // The cuff-inner corner is kept a guaranteed minimum distance from the
  // piece's own x=0 (never closer than 25% of shoulderW) — otherwise, for
  // some shoulderW/sleeveLen/wideF combinations, it lands close enough to
  // x=0 that checkFoldSymmetry's heuristic (a real fold detector, not a
  // guess at THIS piece specifically) mistakes the closing edge for a
  // candidate fold and correctly reports it as not straight (it isn't —
  // this piece has no fold at all, it's a bilateral mirrored pair).
  const cuffInnerX = Math.max(shoulderW * 0.25, shoulderW * 0.4 - sleeveLen * wideF * 0.15);
  const hemY = Math.max(5, sleeveLen);
  const outline = [...cap.points, [shoulderW * 0.6 + hemY * wideF * 0.5, hemY], [cuffInnerX, hemY]];
  outline.frontNotchIdx = cap.frontNotchIdx;
  outline.backNotchIdx1 = cap.backNotchIdx1;
  outline.backNotchIdx2 = cap.backNotchIdx2;
  outline.crownIdx = cap.crownIdx;
  return withCurves(outline, cap.curves);
}

// Mirrors a fold-half outline (produced by plainBodicePanel()/
// princessPanel() etc., fold edge at x=0) into the FULL symmetric piece
// it represents — same technique js/pattern-flat.js's unfoldPiece() uses
// (that file's own header explains the index math this mirrors: the
// interior points get a reflected-and-reversed copy appended, and any
// curve gets a matching reflected-and-reversed copy with c1/c2 swapped).
// Used for an OPEN-front robe/kaftan panel: a full, un-split front with
// NO center-front seam at all (the wearer leaves it open or ties a sash
// — a real, common construction, exactly js/data.js's existing abaya
// front-panel convention) rather than two cut-on-fold halves meeting at
// a seam.
export function mirrorHalfToFull(half) {
  const o = half;
  const n = o.length;
  const tail = [];
  for (let k = n - 2; k >= 1; k--) tail.push([-o[k][0], o[k][1]]);
  const outline = o.concat(tail);
  const tailIndexOf = (k) => 2 * n - 2 - k;
  const remapTail = (k) => (k === 0 || k === n - 1) ? k : tailIndexOf(k);
  const curves = [];
  for (const c of (o.curves || [])) {
    curves.push({ ...c });
    const ta = remapTail(c.toIdx), tb = remapTail(c.fromIdx);
    if (ta === c.toIdx && tb === c.fromIdx) continue;
    curves.push({ fromIdx: ta, toIdx: tb, c1: [-c.c2[0], c.c2[1]], c2: [-c.c1[0], c.c1[1]] });
  }
  return withCurves(outline, curves);
}
