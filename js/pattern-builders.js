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
export function qBez(p0, c, p1, n) {
  n = n || 8;
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return pts;
}
export function qBezToCubic(p0, c, p1) {
  return {
    c1: [p0[0] + (2 / 3) * (c[0] - p0[0]), p0[1] + (2 / 3) * (c[1] - p0[1])],
    c2: [p1[0] + (2 / 3) * (c[0] - p1[0]), p1[1] + (2 / 3) * (c[1] - p1[1])],
  };
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

// Set-in sleeve cap: asymmetric front/back cap curve (the front cap sits
// shallower than the back, a real drafting convention — the front
// armhole is cut slightly higher than the back so the sleeve cap eases
// in correctly). Walks: underarm-front -> (curve) -> cap top -> (curve)
// -> underarm-back -> straight down the back edge -> across the cuff ->
// straight up the front edge, closing. Front gets ONE notch partway up
// its curve, back gets TWO close together — the single/double sleeve-
// notch convention real patterns use to mark which half is which without
// reading a label.
export function setInSleeve(bicep, sleeveLen, capHeightF) {
  capHeightF = capHeightF == null ? 1 : capHeightF;
  const halfBicep = bicep / 2;
  const capH = halfBicep * 0.62 * capHeightF;
  const capTop = [halfBicep, -capH];
  const frontBase = [0, -capH * 0.85];
  const backBase = [bicep, -capH * 0.72];
  const frontSeg = [frontBase, [halfBicep * 0.42, -capH * 0.98], capTop];
  const backSeg = [capTop, [halfBicep * 1.58, -capH * 0.95], backBase];
  const frontPts = qBez(...frontSeg, 6);
  const backPts = qBez(...backSeg, 6);
  const outline = [frontBase, ...frontPts, ...backPts, [bicep, sleeveLen], [0, sleeveLen]];
  withCurves(outline, [
    { fromIdx: 0, toIdx: frontPts.length, ...qBezToCubic(...frontSeg) },
    { fromIdx: frontPts.length, toIdx: frontPts.length + backPts.length, ...qBezToCubic(...backSeg) },
  ]);
  outline.frontNotchIdx = 2; // partway up the front cap curve
  outline.backNotchIdx1 = frontPts.length + 2; // two adjacent points on the back cap curve
  outline.backNotchIdx2 = frontPts.length + 3;
  return outline;
}

// Two-piece sleeve: an outer/upper panel carrying the full (front+back)
// cap curve, and a smaller inner/under panel completing the underarm —
// a genuinely different sleeve CONSTRUCTION from the one-piece set-in
// sleeve above.
export function sleeveUpperPc(bicep, sleeveLen) {
  const halfBicep = bicep / 2, capH = halfBicep * 0.6;
  const capTop = [halfBicep, -capH];
  const frontBase = [bicep * 0.1, -capH * 0.8];
  const backBase = [bicep * 0.9, -capH * 0.68];
  const frontSeg = [frontBase, [halfBicep * 0.42, -capH * 0.95], capTop];
  const backSeg = [capTop, [halfBicep * 1.58, -capH * 0.92], backBase];
  const frontPts = qBez(...frontSeg, 6), backPts = qBez(...backSeg, 6);
  const outline = [frontBase, ...frontPts, ...backPts, [bicep * 0.82, sleeveLen], [bicep * 0.18, sleeveLen]];
  withCurves(outline, [
    { fromIdx: 0, toIdx: frontPts.length, ...qBezToCubic(...frontSeg) },
    { fromIdx: frontPts.length, toIdx: frontPts.length + backPts.length, ...qBezToCubic(...backSeg) },
  ]);
  outline.frontNotchIdx = 2;
  outline.backNotchIdx1 = frontPts.length + 2;
  outline.backNotchIdx2 = frontPts.length + 3;
  return outline;
}
export function sleeveUnderPc(bicep, sleeveLen) {
  const w = bicep * 0.24;
  const topSeg = [[0, 0], [w * 0.5, -3], [w, 0]];
  const topPts = qBez(...topSeg, 5);
  const outline = [[0, 0], ...topPts, [w * 0.85, sleeveLen * 0.85], [w * 0.15, sleeveLen * 0.85]];
  return withCurves(outline, [{ fromIdx: 0, toIdx: topPts.length, ...qBezToCubic(...topSeg) }]);
}

// Gathered puff sleeve: the cap is cut WIDER than the armhole it sews
// into (js/pleats.js's computeGatherWidth) and eased in with gathering
// stitches, unlike a set-in sleeve's cap curve which matches the armhole
// directly.
export function puffSleevePc(bicep, sleeveLen, gatherRatio) {
  const rawW = computeGatherWidth(bicep, gatherRatio);
  const halfW = rawW / 2, capH = halfW * 0.55;
  const seg = [[0, 0], [halfW, -capH], [rawW, 0]];
  const capPts = qBez(...seg, 8);
  const outline = [[0, 0], ...capPts, [rawW * 0.82, sleeveLen], [rawW * 0.18, sleeveLen]];
  withCurves(outline, [{ fromIdx: 0, toIdx: capPts.length, ...qBezToCubic(...seg) }]);
  outline.capCenterIdx = Math.round(capPts.length / 2); // gather-center, matches the shoulder seam
  return outline;
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

  function centerPanel(bustX, waistX, hipX, neckDepthY) {
    const shoulderPt = [shoulderX, topY];
    const neckSeg = [[0, neckDepthY], [shoulderX * 0.5, neckDepthY - 2], shoulderPt];
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

  const frontCenter = centerPanel(fBustX, fWaistX, fHipX, necklineY);
  const frontSide = sidePanel(frontCenter);
  const backCenter = centerPanel(bBustX, bWaistX, bHipX, necklineY * 0.45);
  const backSide = sidePanel(backCenter);
  return { frontCenter, frontSide, backCenter, backSide, hemY, sideX, shoulderX };
}

// A plain (non-princess) front/back bodice half: curved neckline + curved
// armhole, straight below the underarm to the hem, on the fold.
// Suppression comes from a separate waist dart the caller adds — a
// genuinely different suppression method from princessPanel() above.
export function plainBodicePanel(shoulderX, necklineY, chestX, underarmY, waistX, waistY, hipX, hipY, hemX, hemY) {
  const topY = -1;
  const shoulderPt = [shoulderX, topY];
  const neckSeg = [[0, necklineY], [shoulderX * 0.5, necklineY - 2], shoulderPt];
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
export function gorePanel(waistHalfW, hipHalfW, hemHalfW, waistToHip, hipToHem) {
  return [[0, 0], [waistHalfW, 0], [hipHalfW, waistToHip], [hemHalfW, waistToHip + hipToHem], [0, waistToHip + hipToHem]];
}
// A FULL (not cut-on-fold) gore, symmetric about its own vertical center
// — both edges flare outward equally from waist to hem, unlike
// gorePanel() above.
export function sideGorePanel(waistW, hipW, hemW, waistToHip, hipToHem) {
  const hw = waistW / 2, hh = hipW / 2, hm = hemW / 2, hipY = waistToHip, hemY = waistToHip + hipToHem;
  return [[-hw, 0], [hw, 0], [hh, hipY], [hm, hemY], [-hm, hemY], [-hh, hipY]];
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
// wide curved shoulder-to-underarm edge flaring to a relatively narrow
// cuff — a genuinely different sleeve construction from a fitted set-in
// cap or a gathered puff, closer to a flare/godet than a tailored sleeve.
export function wideSleevePc(shoulderW, sleeveLen, wideF) {
  wideF = wideF == null ? 1 : wideF;
  const seg = [[0, 0], [shoulderW * 0.5, -shoulderW * 0.15 * wideF], [shoulderW, 0]];
  const topPts = qBez(...seg, 6);
  // The cuff-inner corner is kept a guaranteed minimum distance from the
  // piece's own x=0 (never closer than 25% of shoulderW) — otherwise, for
  // some shoulderW/sleeveLen/wideF combinations, it lands close enough to
  // x=0 that checkFoldSymmetry's heuristic (a real fold detector, not a
  // guess at THIS piece specifically) mistakes the closing edge for a
  // candidate fold and correctly reports it as not straight (it isn't —
  // this piece has no fold at all, it's a bilateral mirrored pair).
  const cuffInnerX = Math.max(shoulderW * 0.25, shoulderW * 0.4 - sleeveLen * wideF * 0.15);
  const outline = [[0, 0], ...topPts, [shoulderW * 0.6 + sleeveLen * wideF * 0.5, sleeveLen], [cuffInnerX, sleeveLen]];
  return withCurves(outline, [{ fromIdx: 0, toIdx: topPts.length, ...qBezToCubic(...seg) }]);
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
