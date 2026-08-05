/* ============================================================
   Fancy Pattern Library — 24 elaborate, multi-piece designs
   (6 per category: women / men / girls / boys). Each design has
   8+ real pattern pieces and genuinely curved seams (necklines,
   armholes, lapels, princess seams, godets, hoods) built from
   bezier curves sampled into the polyline outlines the rest of
   the app already understands — NOT the AIGen.build() pipeline
   used by library.js, which tops out at ~5 straight-edged pieces.

   Relies on q(), PATTERNS, LIBRARY from data.js.
   ============================================================ */
import { q, PATTERNS, LIBRARY } from './data.js';

export let FancyGen;

(function () {
  "use strict";

  // ---------------- curve sampling ----------------
  // Quadratic / cubic bezier samplers — turn a smooth curve into the
  // short straight segments the existing outline/render/export pipeline
  // already handles, so seams read as curved without any engine changes.
  function qBez(p0, c, p1, n) {
    n = n || 8;
    const pts = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u*u*p0[0] + 2*u*t*c[0] + t*t*p1[0], u*u*p0[1] + 2*u*t*c[1] + t*t*p1[1]]);
    }
    return pts;
  }
  function cBez(p0, c1, c2, p1, n) {
    n = n || 8;
    const pts = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([
        u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p1[0],
        u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p1[1],
      ]);
    }
    return pts;
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  // WP-26: two dedupe helpers for a bezier-sampling boundary condition that
  // shipped a real, reproducible bug — a curve segment's sampled endpoint
  // sometimes lands exactly on a point that's already in the outline
  // (either the next segment's own start, or the outline's own [0,0]
  // origin when a shape's final curve sweeps back to close on itself).
  // Both read as a literal duplicate consecutive point to checkClosedOutline
  // (js/validate.js), which treats every outline as implicitly closed —
  // the wrap-around from the last point back to the first is real, so a
  // curve that re-lands on the start point IS the closing edge and the
  // extra sample must be dropped, not kept alongside it.
  //
  // dedupeJoin: drop `a`'s trailing point if it coincides with `b`'s
  // leading point — used where a neckline curve's endpoint is defined to
  // exactly match the following curve's start (e.g. princessBodice below).
  // Only fires when the points genuinely coincide, so neckline variants
  // that don't share that endpoint (e.g. "offshoulder") are untouched.
  function dedupeJoin(a, b) {
    if (!a.length || !b.length) return a;
    const last = a[a.length - 1], first = b[0];
    return (last[0] === first[0] && last[1] === first[1]) ? a.slice(0, -1) : a;
  }
  // dedupeClose: drop a polyline's own trailing point if it coincides with
  // its own first point — used where a shape's last curve segment sweeps
  // back to the same [0,0] origin the outline started at (godetPc, capePc,
  // peplumPc below all close this way).
  function dedupeClose(pts) {
    if (pts.length < 2) return pts;
    const first = pts[0], last = pts[pts.length - 1];
    return (first[0] === last[0] && first[1] === last[1]) ? pts.slice(0, -1) : pts;
  }

  // Shared S-curve for a princess seam: 4 waypoints (shoulder→bust→waist→hip→hem),
  // out at bust/hip, in at waist. Reused as the shared edge between a bodice's
  // center panel and side panel — one curve, two panels, always seam-consistent.
  // WP-14: alongside the flattened polyline (unchanged — every existing
  // consumer keeps reading `points`), also returns `curves`: the 4 real
  // cubic-bezier segments this curve is built from, as
  // {fromIdx,toIdx,c1,c2} additive metadata (js/pattern-export.js's DXF
  // layer-3 already reads this shape from WP-12). Indices are relative
  // to `points`' own start (index 0) — callers splicing this into a
  // larger outline array must offset fromIdx/toIdx by wherever `points`
  // actually lands, same as princessBodice() does below.
  function princessCurve(topX, topY, bustX, bustY, waistX, waistY, hipX, hipY, hemX, hemY) {
    const points = [[topX, topY]];
    const curves = [];
    const addSeg = (c1, c2, p1) => {
      const fromIdx = points.length - 1;
      points.push(...cBez(points[fromIdx], c1, c2, p1, 6));
      curves.push({ fromIdx, toIdx: points.length - 1, c1, c2 });
    };
    addSeg([lerp(topX,bustX,0.3), lerp(topY,bustY,0.6)], [lerp(topX,bustX,0.85), bustY-3], [bustX, bustY]);
    addSeg([lerp(bustX,waistX,0.3), lerp(bustY,waistY,0.5)], [lerp(bustX,waistX,0.85), waistY-4], [waistX, waistY]);
    addSeg([lerp(waistX,hipX,0.3), lerp(waistY,hipY,0.5)], [lerp(waistX,hipX,0.85), hipY-3], [hipX, hipY]);
    addSeg([lerp(hipX,hemX,0.3), lerp(hipY,hemY,0.5)], [lerp(hipX,hemX,0.85), hemY-2], [hemX, hemY]);
    return { points, curves };
  }

  // ---------------- reusable mechanical components ----------------

  // Tailored two-piece sleeve (upper/outer + under/inner), curved cap.
  function sleeve2pc(bicep, sleeveLen) {
    const bw = bicep / 2;
    const capTop = [bw*0.55, -9];
    const upper = [
      [0, 6],
      ...qBez([0,6], [bw*0.3,-8], capTop, 6),
      ...qBez(capTop, [bw*1.3,-7], [bw*1.7,8], 6),
      [bw*1.55, sleeveLen-6],
      [bw*0.15, sleeveLen-2],
    ];
    const under = [
      [0, 11],
      ...qBez([0,11], [bw*0.5,3], [bw*1.15,13], 6),
      [bw*1.02, sleeveLen-9],
      [bw*0.1, sleeveLen-5],
    ];
    return { upper, under };
  }
  // Simple one-piece sleeve with a curved cap (dresses/gowns/robes).
  function sleeve1pc(bicep, sleeveLen, wideF) {
    wideF = wideF || 1;
    const bw = (bicep/2) * wideF;
    const capTop = [bw, -10];
    return [
      [0,6], ...qBez([0,6],[bw*0.4,-9],capTop,6), ...qBez(capTop,[bw*1.6,-8],[bw*2,6],6),
      [bw*1.85, sleeveLen], [0.1, sleeveLen-2],
    ];
  }
  // Shirt-style 2-piece collar (curved collar + straight stand band).
  function collarStand(neck) {
    const h = neck/2;
    const collar = [ [0,0], ...qBez([0,0],[h*0.5,-2],[h,1],6), [h,6], [0,7] ];
    const stand = [ [0,0],[h+2,0],[h+2,4],[0,4] ];
    return { collar, stand };
  }
  // One-piece shawl collar for tuxedos/blazers — curved on both edges.
  function shawlCollar(neck, depth) {
    depth = depth || 22;
    const h = neck/2 + 4;
    return [
      [0,0],
      ...qBez([0,0],[h*0.6,-3],[h,4],6),
      ...qBez([h,4],[h*1.15, depth*0.5],[h*0.85, depth],8),
      [h*0.3, depth+4],
      [0,10],
    ];
  }
  // Notched-lapel front facing strip — curved lapel roll-line.
  function lapelFacing(neck, len) {
    const h = neck/2;
    return [
      [0,0], [h*0.8,2],
      ...qBez([h*0.8,2], [h*1.3,len*0.18], [h*0.55,len*0.32], 7),
      ...qBez([h*0.55,len*0.32], [h*0.3,len*0.7], [h*0.15,len], 7),
      [0,len],
    ];
  }
  function cuffPc(wristW) { return [[0,0],[wristW+4,0],[wristW+4,7],[0,8]]; }
  function waistbandPc(waistW, h) { h = h || 7; return [[0,0],[waistW+4,0],[waistW+6,h],[0,h]]; }
  // Welt/patch pocket, gently curved bottom.
  function pocketPc(w, h) {
    return [ [0,0],[w,0],[w,h], ...qBez([w,h],[w/2,h+3],[0,h],6) ];
  }
  // Triangular flare insert (godet) — two curved sides meeting at a point.
  function godetPc(topW, len) {
    const bottom = [topW/2, len];
    return dedupeClose([
      [0,0],[topW,0],
      ...qBez([topW,0], [topW*0.85, len*0.6], bottom, 7),
      ...qBez(bottom, [topW*0.15, len*0.6], [0,0], 7),
    ]);
  }
  // One half of a two-piece hood — curved crown + curved face-opening.
  function hoodHalf(headC, depth) {
    depth = depth || 34;
    const w = headC * 0.28;
    const crownTop = [w*0.5, -depth];
    return [
      [0,4],
      ...qBez([0,4], [w*0.1,-depth*0.7], crownTop, 7),
      ...qBez(crownTop, [w*1.05,-depth*0.5], [w*1.15,2], 7),
      [w*0.95, 14],
    ];
  }
  function yokePc(shoulderW, depth) {
    depth = depth || 9;
    return [ [0,0],[shoulderW,0],[shoulderW,depth*0.6], ...qBez([shoulderW,depth*0.6],[shoulderW/2,depth+3],[0,depth*0.6],8) ];
  }
  // Flared peplum panel with a gently waved curved hem.
  function peplumPc(waistW, flareLen) {
    const bulge = flareLen * 0.15;
    return dedupeClose([
      [0,0],[waistW,0],
      ...qBez([waistW,0], [waistW*1.3,flareLen*0.6], [waistW*1.05,flareLen], 6),
      ...qBez([waistW*1.05,flareLen], [waistW*0.5,flareLen+bulge], [-waistW*0.05,flareLen], 6),
      ...qBez([-waistW*0.05,flareLen], [-waistW*0.3,flareLen*0.6], [0,0], 6),
    ]);
  }
  function sashPc(width, tailLen) {
    return [ [0,0],[width,0],[width,5],[width+tailLen,5], ...qBez([width+tailLen,5],[width+tailLen+10,2.5],[width+tailLen,0],5) ];
  }
  // Tiered ruffle skirt panel, curved hem.
  function tierPc(topW, botW, height) {
    return [ [0,0],[topW,0],[botW,height], ...qBez([botW,height],[botW*0.5,height+4],[0,height],8) ];
  }
  // Draped cape overlay, curved swooping hem.
  function capePc(neckW, len) {
    return dedupeClose([
      [0,0],[neckW,0],
      ...qBez([neckW,0], [neckW*1.8,len*0.5], [neckW*1.5,len], 8),
      ...qBez([neckW*1.5,len], [neckW*0.7,len+6], [0,len*0.85], 8),
      ...qBez([0,len*0.85], [-neckW*0.1,len*0.4], [0,0], 5),
    ]);
  }

  // Princess-seamed bodice: shared curved side-seam between a narrow center
  // panel and a wider side panel, front and back. `neckline` picks the
  // center-front neckline shape; bust/waist/hip "out" values set the fit.
  function princessBodice(m, o) {
    o = o || {};
    const qc = q(m.chest), qw = q(m.waist), qh = q(m.hips);
    const shoulderX = qc * 0.22;
    const shoulderW = qc * 0.30;
    const sideX = o.sideX != null ? o.sideX : qc * 1.05;
    const necklineY = o.necklineY != null ? o.necklineY : 6;
    const topY = -1;
    const bustY = o.bustY != null ? o.bustY : m.backLen * 0.42;
    const waistY = o.waistY != null ? o.waistY : m.backLen * 0.98;
    const hipY = o.hipY != null ? o.hipY : waistY + 18;
    const hemY = o.hemY != null ? o.hemY : hipY + 20;
    const bustOutF = o.bustOutF != null ? o.bustOutF : 1.0;
    const waistInF = o.waistInF != null ? o.waistInF : 1.0;
    const hipOutF = o.hipOutF != null ? o.hipOutF : 1.0;
    const hemOutF = o.hemOutF != null ? o.hemOutF : 1.05;

    const fBustX = qc * 0.62 * bustOutF, fWaistX = qw * 0.55 * waistInF, fHipX = qh * 0.60 * hipOutF, fHemX = qh * 0.60 * hemOutF;
    const bBustX = qc * 0.58 * bustOutF, bWaistX = qw * 0.52 * waistInF, bHipX = qh * 0.57 * hipOutF, bHemX = qh * 0.57 * hemOutF;

    const { points: frontCurve, curves: frontCurveCurves } = princessCurve(shoulderX, topY, fBustX, bustY, fWaistX, waistY, fHipX, hipY, fHemX, hemY);
    const { points: backCurve, curves: backCurveCurves } = princessCurve(shoulderX, topY, bBustX, bustY, bWaistX, waistY, bHipX, hipY, bHemX, hemY);

    // Neckline: a curved cutout from center-front down to the shoulder point.
    let neckPts;
    switch (o.neckline) {
      case "sweetheart":
        neckPts = qBez([0, necklineY+8], [shoulderX*0.35, necklineY+14], [shoulderX, topY], 7);
        break;
      case "offshoulder":
        neckPts = qBez([0, necklineY+10], [shoulderX*0.5, necklineY+13], [shoulderX*1.15, topY+3], 7);
        break;
      case "scoop":
        neckPts = qBez([0, necklineY+4], [shoulderX*0.5, necklineY+9], [shoulderX, topY], 7);
        break;
      default:
        neckPts = qBez([0, necklineY], [shoulderX*0.5, necklineY-2], [shoulderX, topY], 6);
    }

    // WP-26: neckPts' last sampled point and frontCurve's first point are
    // the same coordinate for every neckline variant whose curve is
    // defined to end exactly at the shoulder point ([shoulderX, topY]) —
    // "offshoulder" ends somewhere else on purpose and is left untouched.
    const frontNeck = dedupeJoin(neckPts, frontCurve);
    const frontCenter = [ [0, necklineY], ...frontNeck, ...frontCurve, [0, hemY] ];
    const frontSide = [
      ...frontCurve.slice().reverse(),
      [shoulderX + shoulderW, topY - 2],
      ...qBez([shoulderX+shoulderW, topY-2], [sideX*0.9, bustY*0.55], [sideX, bustY], 6),
      [sideX*1.02, waistY],
      [sideX*1.04, hipY],
      [fHemX + (sideX*1.04 - fHipX), hemY],
    ];
    const backNeckPts = qBez([0, necklineY*0.4], [shoulderX*0.5, -1], [shoulderX, topY], 5);
    const backNeck = dedupeJoin(backNeckPts, backCurve); // WP-26, same coincident-endpoint case as frontNeck
    const backCenter = [ [0, necklineY*0.4], ...backNeck, ...backCurve, [0, hemY] ];
    const backSide = [
      ...backCurve.slice().reverse(),
      [shoulderX + shoulderW, topY - 2],
      ...qBez([shoulderX+shoulderW, topY-2], [sideX*0.88, bustY*0.55], [sideX*0.98, bustY], 6),
      [sideX*1.0, waistY],
      [sideX*1.02, hipY],
      [bHemX + (sideX*1.02 - bHipX), hemY],
    ];

    // WP-6 metadata: princess-seam edge index ranges, computed from the
    // construction above (not re-derived geometrically later) — this
    // generator is the one place that actually knows which indices are the
    // shared curve, so it declares them directly. frontCenter/backCenter
    // are single physical half-pieces (cutOnFold); the importer unfolds them
    // and, post-unfold, geometrically splits the (now doubled) princess
    // curve into its right/left halves — see importFromApp.js's
    // deriveUnfoldedSeamEdges. frontSide/backSide are single-side pieces
    // (bilateral) representing a mirrored L/R pair; the importer duplicates
    // them and suffixes the declared seamId per copy.
    //
    // WP-14: frontCenter/backCenter also get real `curves` metadata (the
    // princess seam's actual bezier control points, from princessCurve's
    // natural, non-reversed point order — frontSide/backSide splice the
    // SAME curve in reverse, which would need separate reversed-index
    // math; since both pieces show the identical physical seam, only one
    // needs to carry the authoritative curve data). Offsets account for
    // the leading `[0,y]` point and frontNeck/backNeck (WP-26: the
    // deduped neck arrays actually spliced into frontCenter/backCenter
    // above, one point shorter than neckPts/backNeckPts whenever the
    // dedupe fired) this curve is spliced after.
    const frontCurveOffset = 1 + frontNeck.length;
    const backCurveOffset = 1 + backNeck.length;
    const offsetCurves = (curves, off) => curves.map((c) => ({ fromIdx: c.fromIdx + off, toIdx: c.toIdx + off, c1: c.c1, c2: c.c2 }));
    // frontCenter/backCenter ALSO get a real `edges[].seamId` (alongside
    // princessSeamId, which the cloth-lab importer's cutOnFold branch
    // reads instead and never looks at `edges` for) — same seamId as
    // frontSide/backSide, same fromIdx/toIdx range as the `curves` metadata
    // above, since it's the identical physical curve. This is what makes
    // WP-14's 2D "walk the seam" tool findable: it needs two pieces in
    // Canvas.getPieces() sharing one seamId, and before this only
    // frontSide/backSide (one piece each) declared edges at all.
    const frontCenterEdge = { fromIdx: frontCurveOffset, toIdx: frontCurveOffset + frontCurve.length - 1, seamId: 'princessFront' };
    const backCenterEdge = { fromIdx: backCurveOffset, toIdx: backCurveOffset + backCurve.length - 1, seamId: 'princessBack' };
    const meta = {
      frontCenter: { role: 'bodice-front-center', cutOnFold: true, princessSeamId: 'princessFront', curves: offsetCurves(frontCurveCurves, frontCurveOffset), edges: [frontCenterEdge] },
      frontSide: { role: 'bodice-front-side', bilateral: true, edges: [{ fromIdx: 0, toIdx: frontCurve.length - 1, seamId: 'princessFront' }] },
      backCenter: { role: 'bodice-back-center', cutOnFold: true, princessSeamId: 'princessBack', curves: offsetCurves(backCurveCurves, backCurveOffset), edges: [backCenterEdge] },
      backSide: { role: 'bodice-back-side', bilateral: true, edges: [{ fromIdx: 0, toIdx: backCurve.length - 1, seamId: 'princessBack' }] },
    };
    return { frontCenter, frontSide, backCenter, backSide, hemY, sideX, meta };
  }

  // Jacket-style front/back (blazer, coat, sherwani), with a lapel notch curve.
  function jacketFrontBack(m, len, o) {
    o = o || {};
    const qc = q(m.chest);
    const hemW = qc * (o.hemFlareF || 1.05);
    const closureX = o.closureX != null ? o.closureX : qc * 0.12;
    const front = [
      [closureX, 4],
      ...qBez([closureX,4], [qc*0.45, len*0.1], [qc*0.30, len*0.34], 7),
      ...qBez([qc*0.30, len*0.34], [qc*0.55, len*0.7], [hemW*0.62, len], 7),
      [closureX*0.3, len],
      [closureX*0.3, 8],
    ];
    const back = [
      [0,0], [qc*0.9, 2],
      ...qBez([qc*0.9,2], [qc*1.02, len*0.5], [hemW, len], 8),
      [0, len],
    ];
    return { front, back };
  }
  // Simple gore/panel for a paneled or A-line skirt, gently curved side seam.
  function gorePanel(topW, botW, len, curveOut) {
    curveOut = curveOut || 0;
    return [
      [0,0],[topW,0],
      ...qBez([topW,0], [topW+curveOut, len*0.55], [botW, len], 6),
      [0, len],
    ];
  }
  // Asymmetric wrap/surplice front panel (wrap dresses, sherwani-style closures).
  function wrapPanel(qc, qw, len, side) {
    const d = side === "L" ? 1 : -1;
    return [
      [0, 4], [qc*0.9*d, 6],
      ...qBez([qc*0.9*d,6], [qc*0.5*d, len*0.35], [qw*0.15*d, len*0.55], 7),
      [qw*0.15*d, len], [0, len],
    ];
  }
  // Trouser front/back panel with a curved crotch seam.
  function trouserPanel(qw, qh, thigh, inseam, front) {
    const crotchDrop = front ? thigh*0.28 : thigh*0.34;
    const w = front ? qh*0.52 : qh*0.56;
    return [
      [0,0], [qw*0.5,0], [w, crotchDrop*0.4],
      ...qBez([w,crotchDrop*0.4], [w*1.05,crotchDrop*0.85], [w*0.85,crotchDrop], 6),
      [w*0.6, crotchDrop+inseam], [w*0.15, crotchDrop+inseam], [0, crotchDrop*0.5],
    ];
  }

  // ---------------- generic builders (for the Quick Draft builder pane) ----------------
  // Same helpers as the named catalog designs above, but generalized to any category's
  // measurements and a small set of runtime options, instead of one fixed named design.
  const LEN_F = { short: 0.35, medium: 0.6, long: 0.86 };
  const JLEN_F = { short: 1.15, medium: 1.4, long: 1.65 };
  const CLEN_F = { short: 1.4, medium: 1.85, long: 2.3 };

  function buildFancyGown(m, opts) {
    opts = opts || {};
    const b = princessBodice(m, { neckline: opts.neckline || "scoop", hipY: m.backLen*0.98+6, hemY: m.backLen*0.98+8 });
    const waistW = q(m.waist), hemW = q(m.hips)*1.9;
    const hemLen = m.height * (LEN_F[opts.length] || LEN_F.long) - b.hemY;
    const pieces = [
      { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a curved neckline.",ar:"لوحة المقدمة الوسطى بخط رقبة منحنٍ."}, ...b.meta.frontCenter, outline:b.frontCenter },
      { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel joined at the princess seam.",ar:"لوحة جانبية منحنية تلتقي بخط قصة الأميرة."}, ...b.meta.frontSide, outline:b.frontSide },
      { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter },
      { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide },
      { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore flaring to the hem.",ar:"مروحة أمامية تتسع نحو الحاشية."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 6) },
      { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore flaring to the hem.",ar:"مروحة خلفية تتسع نحو الحاشية."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 6) },
      { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة جانبية يسرى"}, desc:{en:"Side gore adding fullness.",ar:"مروحة جانبية تضيف اتساعًا."}, role:"skirt-side-gore-left", outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8) },
      { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة جانبية يمنى"}, desc:{en:"Side gore adding fullness.",ar:"مروحة جانبية تضيف اتساعًا."}, role:"skirt-side-gore-right", outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8) },
    ];
    if (!opts.sleeveless) pieces.push({ key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Curved cap sleeve.",ar:"كم برأس منحنٍ."}, role:"sleeve", bilateral:true, outline: sleeve1pc(m.bicep, m.sleeve * (opts.sleeveLong ? 0.85 : 0.35), 1.1) });
    pieces.push({ key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Tie sash with a pointed tail.",ar:"حزام بطرف مدبب."}, role:"sash", outline: sashPc(waistW*0.4, 45) });
    return pieces;
  }

  function buildFancyJacket(m, opts) {
    opts = opts || {};
    const len = m.backLen * (JLEN_F[opts.length] || JLEN_F.medium);
    const jb = jacketFrontBack(m, len, { hemFlareF: 1.0 });
    const sl = sleeve2pc(m.bicep, m.sleeve);
    return [
      { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored front panel.",ar:"مقدمة مفصّلة."}, role:"front-panel", outline: jb.front },
      { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored back panel.",ar:"خلفية مفصّلة."}, role:"back-panel", cutOnFold:true, outline: jb.back },
      { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline: sl.upper },
      { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline: sl.under },
      { key:"collar", name:{en:"Collar",ar:"الياقة"}, desc:{en:"Curved collar.",ar:"ياقة منحنية."}, role:"collar", outline: shawlCollar(m.neck, 18) },
      { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved lapel facing.",ar:"بطانة صدر منحنية."}, role:"lapel-facing", outline: lapelFacing(m.neck, len*0.5) },
      { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket.",ar:"جيب مطوي منحنٍ."}, role:"pocket", outline: pocketPc(10,3.5) },
      { key:"backLining", name:{en:"Back Lining",ar:"بطانة الظهر"}, desc:{en:"Full back body lining.",ar:"بطانة كاملة للظهر."}, role:"lining", outline: jb.back },
    ];
  }

  function buildFancyCoat(m, opts) {
    opts = opts || {};
    const len = m.backLen * (CLEN_F[opts.length] || CLEN_F.medium);
    const jb = jacketFrontBack(m, len, { hemFlareF: 1.05, closureX: q(m.chest)*0.22 });
    const sl = sleeve2pc(m.bicep, m.sleeve+2);
    return [
      { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Long front panel with a curved lapel.",ar:"لوحة أمامية طويلة بياقة منحنية."}, role:"front-panel", outline: jb.front },
      { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Long back panel.",ar:"لوحة خلفية طويلة."}, role:"back-panel", cutOnFold:true, outline: jb.back },
      { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline: sl.upper },
      { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline: sl.under },
      { key:"collar", name:{en:"Wide Collar",ar:"ياقة عريضة"}, desc:{en:"Wide curved collar.",ar:"ياقة عريضة منحنية."}, role:"collar", outline: shawlCollar(m.neck*1.05, 20) },
      { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the front edge.",ar:"بطانة منحنية على حافة المقدمة."}, role:"lapel-facing", outline: lapelFacing(m.neck, len*0.45) },
      { key:"chestPocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Welt chest pocket.",ar:"جيب صدر مطوي."}, role:"pocket", outline: pocketPc(10,3.5) },
      { key:"hipFlap", name:{en:"Hip Flap Pocket",ar:"جيب ورك بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, role:"pocket", outline: pocketPc(14,5.5) },
      { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke reinforcing the back.",ar:"كوة كتف منحنية تعزز الظهر."}, role:"yoke", outline: yokePc(q(m.shoulder)*1.3, 10) },
    ];
  }

  function buildFancySuit(m) {
    const jLen = m.backLen*1.55, vLen = m.backLen*1.05;
    const jb = jacketFrontBack(m, jLen, { hemFlareF: 1.0 });
    const vb = jacketFrontBack(m, vLen, { hemFlareF: 0.9, closureX: q(m.chest)*0.06 });
    const sl = sleeve2pc(m.bicep, m.sleeve);
    const qw = q(m.waist), qh = q(m.hips);
    return [
      { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored suit jacket front.",ar:"مقدمة جاكيت البدلة المفصّلة."}, role:"front-panel", outline: jb.front },
      { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored suit jacket back.",ar:"خلفية جاكيت البدلة المفصّلة."}, role:"back-panel", cutOnFold:true, outline: jb.back },
      { key:"sleeveU", name:{en:"Jacket Sleeve Upper",ar:"الكم العلوي للجاكيت"}, desc:{en:"Outer jacket sleeve panel.",ar:"اللوحة الخارجية لكم الجاكيت."}, role:"sleeve-upper", bilateral:true, outline: sl.upper },
      { key:"sleeveD", name:{en:"Jacket Sleeve Under",ar:"الكم السفلي للجاكيت"}, desc:{en:"Inner jacket sleeve panel.",ar:"اللوحة الداخلية لكم الجاكيت."}, role:"sleeve-under", bilateral:true, outline: sl.under },
      { key:"collar", name:{en:"Jacket Collar",ar:"ياقة الجاكيت"}, desc:{en:"Notch-ready jacket collar.",ar:"ياقة جاكيت جاهزة للفتحة."}, role:"collar", outline: shawlCollar(m.neck, 20) },
      { key:"facing", name:{en:"Jacket Facing",ar:"بطانة الجاكيت"}, desc:{en:"Curved front facing.",ar:"بطانة أمامية منحنية."}, role:"lapel-facing", outline: lapelFacing(m.neck, jLen*0.5) },
      { key:"vestFront", name:{en:"Vest Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted sleeveless vest front.",ar:"مقدمة صدرية ضيقة بلا أكمام."}, role:"front-panel", outline: vb.front },
      { key:"vestBack", name:{en:"Vest Back",ar:"خلفية الصدرية"}, desc:{en:"Vest back panel.",ar:"لوحة خلفية الصدرية."}, role:"back-panel", cutOnFold:true, outline: vb.back },
      { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Front leg panel with a curved crotch seam.",ar:"لوحة الساق الأمامية بخط تفصيل منحنٍ."}, role:"other", outline: trouserPanel(qw, qh, m.thigh, m.inseam, true) },
      { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Back leg panel with a curved seat curve.",ar:"لوحة الساق الخلفية بمنحنى مقعد."}, role:"other", outline: trouserPanel(qw, qh, m.thigh, m.inseam, false) },
    ];
  }

  FancyGen = {
    build(kind, m, opts) {
      if (kind === "gown") return buildFancyGown(m, opts);
      if (kind === "jacket") return buildFancyJacket(m, opts);
      if (kind === "coat") return buildFancyCoat(m, opts);
      if (kind === "suit") return buildFancySuit(m);
      return [];
    },
  };
  // TEMP compat alias for one release — see BerryStudio-Upgrade-Plan WP-0.1.
  if (typeof window !== 'undefined') window.FancyGen = FancyGen;

  // ---------------- registration ----------------
  function def(id, category, nameEn, nameAr, tagEn, tagAr, type, descEn, descAr, piecesFn) {
    PATTERNS[id] = {
      id, category, name: { en: nameEn, ar: nameAr },
      desc: { en: descEn, ar: descAr },
      pieces: piecesFn,
    };
    LIBRARY.push({ id, cat: category, tag: { en: tagEn, ar: tagAr }, type });
  }

  // ================= WOMEN (6) =================

  def("wf01", "women", "Princess-Seam Ball Gown", "فستان سهرة بقصات أميرة",
    "Gown", "فستان سهرة", "gown",
    "A dramatic floor-length gown with curved princess seams and a gored, full skirt.",
    "فستان سهرة طويل بقصات أميرة منحنية وتنورة كاملة بقطع مروحية.",
    (m) => {
      const b = princessBodice(m, { neckline: "scoop", hipY: m.backLen*0.98+6, hemY: m.backLen*0.98+8 });
      const waistW = q(m.waist), hemLen = m.height*0.86 - b.hemY, hemW = q(m.hips)*1.9;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a curved scoop neckline.",ar:"لوحة المقدمة الوسطى بخط رقبة منحنٍ."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel joined at the princess seam.",ar:"لوحة جانبية منحنية تلتقي بخط قصة الأميرة."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Center front gore flaring to the hem.",ar:"مروحة أمامية وسطى تتسع نحو الحاشية."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 6), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Center back gore flaring to the hem.",ar:"مروحة خلفية وسطى تتسع نحو الحاشية."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 6), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore adding fullness to the skirt.",ar:"مروحة جانبية تضيف اتساعًا للتنورة."}, role:"skirt-side-gore-left", outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore adding fullness to the skirt.",ar:"مروحة جانبية تضيف اتساعًا للتنورة."}, role:"skirt-side-gore-right", outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8), grain:[[4,10],[4,hemLen-10]] },
        { key:"sleeve", name:{en:"Cap Sleeve",ar:"كم قصير"}, desc:{en:"Short curved cap sleeve.",ar:"كم قصير منحنٍ."}, role:"cap-sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.35, 1.1), grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.3]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Long tie sash with a pointed tail.",ar:"حزام طويل بطرف مدبب."}, role:"sash", outline:sashPc(waistW*0.5, 55), grain:[[10,2],[40,2]] },
      ];
    });

  def("wf02", "women", "Sweetheart Mermaid Gown", "فستان حورية بخط قلب",
    "Gown", "فستان سهرة", "gown",
    "A fitted mermaid gown with a sweetheart neckline and flare godets at the hem.",
    "فستان حورية ضيق بخط رقبة على شكل قلب وقطع مروحية عند الحاشية.",
    (m) => {
      const b = princessBodice(m, { neckline:"sweetheart", waistInF:0.85, hipOutF:0.95, hipY:m.backLen*0.98+6, hemY:m.backLen*0.98+8 });
      const waistW = q(m.waist), hemLen = m.height*0.85 - b.hemY, kneeLen = hemLen*0.62;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Fitted center front with a sweetheart curve.",ar:"مقدمة ضيقة بخط قلب منحنٍ."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel, fitted through the waist.",ar:"لوحة جانبية ضيقة عند الخصر."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Fitted center back panel.",ar:"لوحة خلفية وسطى ضيقة."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Fitted back side panel.",ar:"لوحة جانبية خلفية ضيقة."}, ...b.meta.backSide, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"skirtF", name:{en:"Mermaid Skirt Front",ar:"تنورة الحورية الأمامية"}, desc:{en:"Narrow through the knee before flaring.",ar:"ضيقة عند الركبة ثم تتسع."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.52, waistW*0.62, kneeLen, 1), grain:[[4,10],[4,kneeLen-8]] },
        { key:"skirtB", name:{en:"Mermaid Skirt Back",ar:"تنورة الحورية الخلفية"}, desc:{en:"Narrow through the knee before flaring.",ar:"ضيقة عند الركبة ثم تتسع."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.5, waistW*0.6, kneeLen, 1), grain:[[4,10],[4,kneeLen-8]] },
        { key:"godetL", name:{en:"Hem Godet Left",ar:"مروحة الحاشية اليسرى"}, desc:{en:"Flare insert at the hem for walking ease.",ar:"إدراج مروحي عند الحاشية لسهولة الحركة."}, role:"godet", outline:godetPc(q(m.hips)*0.22, hemLen-kneeLen+18), grain:[[3,6],[3,hemLen-kneeLen]] },
        { key:"godetR", name:{en:"Hem Godet Right",ar:"مروحة الحاشية اليمنى"}, desc:{en:"Flare insert at the hem for walking ease.",ar:"إدراج مروحي عند الحاشية لسهولة الحركة."}, role:"godet", outline:godetPc(q(m.hips)*0.22, hemLen-kneeLen+18), grain:[[3,6],[3,hemLen-kneeLen]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Slim tie sash accenting the waist.",ar:"حزام رفيع يبرز الخصر."}, role:"sash", outline:sashPc(waistW*0.4, 45), grain:[[8,2],[30,2]] },
      ];
    });

  def("wf03", "women", "Off-Shoulder Corset Gown", "فستان سهرة بكتف مكشوف",
    "Gown", "فستان سهرة", "gown",
    "A corset-fitted gown with an off-shoulder neckline and a full flowing skirt.",
    "فستان سهرة بقصة كورسيه وخط كتف مكشوف وتنورة كاملة الاتساع.",
    (m) => {
      const b = princessBodice(m, { neckline:"offshoulder", waistInF:0.8, bustOutF:1.05, hipY:m.backLen*0.98+6, hemY:m.backLen*0.98+8 });
      const waistW = q(m.waist), hemLen = m.height*0.86 - b.hemY, hemW = q(m.hips)*1.85;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Corset-fitted center front panel.",ar:"مقدمة وسطى بقصة كورسيه ضيقة."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Boned side panel shaping the waist.",ar:"لوحة جانبية مقوّاة تشكّل الخصر."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel, lace-up ready.",ar:"لوحة خلفية وسطى جاهزة للرباط."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Boned back side panel.",ar:"لوحة جانبية خلفية مقوّاة."}, ...b.meta.backSide, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"shoulderBand", name:{en:"Off-Shoulder Band",ar:"شريط الكتف المكشوف"}, desc:{en:"Curved band draping over both shoulders.",ar:"شريط منحنٍ ينسدل على الكتفين."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.18, 1.3), grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.14]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Full front gore.",ar:"مروحة أمامية كاملة الاتساع."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 7), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Full back gore.",ar:"مروحة خلفية كاملة الاتساع."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 7), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, role:"skirt-side-gore-left", outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, role:"skirt-side-gore-right", outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8), grain:[[4,10],[4,hemLen-10]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Tie sash finishing the waist seam.",ar:"حزام يُنهي خط الخصر."}, role:"sash", outline:sashPc(waistW*0.4, 50), grain:[[8,2],[35,2]] },
      ];
    });

  def("wf04", "women", "Wrap Ruffle Dress", "فستان ملفوف بكشكش",
    "Dress", "فستان", "dress",
    "A surplice wrap bodice over a cascading tiered ruffle skirt.",
    "صدرية ملفوفة فوق تنورة بطبقات كشكش متتالية.",
    (m) => {
      const qc = q(m.chest), qw = q(m.waist), bodiceLen = m.backLen*0.95;
      const tierLen = (m.height*0.55 - bodiceLen) / 3;
      const t1w = qw*1.7, t2w = qw*2.1, t3w = qw*2.6;
      return [
        { key:"frontL", name:{en:"Front Wrap Left",ar:"المقدمة الملفوفة اليسرى"}, desc:{en:"Left wrap panel crossing to the opposite hip.",ar:"لوحة ملفوفة يسرى تعبر إلى الورك المقابل."}, role:"front-panel", outline:wrapPanel(qc, qw, bodiceLen, "L"), grain:[[4,8],[4,bodiceLen-10]] },
        { key:"frontR", name:{en:"Front Wrap Right",ar:"المقدمة الملفوفة اليمنى"}, desc:{en:"Right wrap panel crossing to the opposite hip.",ar:"لوحة ملفوفة يمنى تعبر إلى الورك المقابل."}, role:"front-panel", outline:wrapPanel(qc, qw, bodiceLen, "R"), grain:[[-4,8],[-4,bodiceLen-10]] },
        { key:"back", name:{en:"Bodice Back",ar:"خلفية الصدرية"}, desc:{en:"Curved back bodice panel.",ar:"لوحة خلفية منحنية للصدرية."}, role:"back-panel", cutOnFold:true, outline:[[0,0],[qc*0.95,2],...qBez([qc*0.95,2],[qc*1.0,bodiceLen*0.5],[qw*0.85,bodiceLen],8),[0,bodiceLen]], grain:[[4,8],[4,bodiceLen-10]] },
        { key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Softly gathered sleeve.",ar:"كم مجمّع برفق."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.45), grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.4]] },
        { key:"facing", name:{en:"Neckline Facing",ar:"بطانة خط الرقبة"}, desc:{en:"Curved facing strip finishing the wrap neckline.",ar:"شريط بطانة منحنٍ لتشطيب خط الرقبة الملفوف."}, role:"lapel-facing", outline:[[0,0],...qBez([0,0],[qc*0.4,3],[qc*0.8,1],6),[qc*0.8,6],[0,6]], grain:[[4,2],[qc*0.5,2]] },
        { key:"tier1", name:{en:"Ruffle Tier 1",ar:"الطبقة الأولى من الكشكش"}, desc:{en:"Top tier, gathered at the waist seam.",ar:"الطبقة العلوية مجمّعة عند خط الخصر."}, role:"tier", outline:tierPc(t1w, t2w, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"tier2", name:{en:"Ruffle Tier 2",ar:"الطبقة الثانية من الكشكش"}, desc:{en:"Middle tier, wider than the first.",ar:"الطبقة الوسطى أوسع من الأولى."}, role:"tier", outline:tierPc(t2w, t3w, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"tier3", name:{en:"Ruffle Tier 3",ar:"الطبقة الثالثة من الكشكش"}, desc:{en:"Hem tier with the fullest curved sweep.",ar:"طبقة الحاشية الأوسع بانسيابة منحنية."}, role:"tier", outline:tierPc(t3w, t3w*1.25, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"sash", name:{en:"Wrap Tie",ar:"رباط الالتفاف"}, desc:{en:"Long tie securing the wrap closure.",ar:"رباط طويل لتثبيت الإغلاق الملفوف."}, role:"wrap-tie", outline:sashPc(qw*0.3, 60), grain:[[8,2],[40,2]] },
      ];
    });

  def("wf05", "women", "Cape-Sleeve Evening Gown", "فستان سهرة بكاب",
    "Gown", "فستان سهرة", "gown",
    "An elegant gown with a draped cape overlay and a soft gored skirt.",
    "فستان سهرة أنيق بكاب منسدل وتنورة مروحية ناعمة.",
    (m) => {
      const b = princessBodice(m, { neckline:"scoop", hipY:m.backLen*0.98+6, hemY:m.backLen*0.98+8 });
      const waistW = q(m.waist), hemLen = m.height*0.86 - b.hemY, hemW = q(m.hips)*1.8;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel.",ar:"لوحة المقدمة الوسطى."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"cape", name:{en:"Draped Cape Overlay",ar:"طبقة الكاب المنسدلة"}, desc:{en:"Sweeping curved cape draping from the shoulders.",ar:"كاب منحنٍ ينسدل من الكتفين."}, role:"cape-overlay", outline:capePc(q(m.shoulder)*0.9, 55), grain:[[6,6],[6,40]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore.",ar:"مروحة أمامية."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 5), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore.",ar:"مروحة خلفية."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 5), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, role:"skirt-side-gore-left", outline:gorePanel(waistW*0.45, hemW*0.3, hemLen, 7), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, role:"skirt-side-gore-right", outline:gorePanel(waistW*0.45, hemW*0.3, hemLen, 7), grain:[[4,10],[4,hemLen-10]] },
      ];
    });

  def("wf06", "women", "Peplum Blazer Dress", "فستان بليزر بحزام مكشكش",
    "Dress", "فستان", "dress",
    "A structured blazer-front dress with a tailored collar and a flared peplum hem.",
    "فستان بمقدمة بليزر مهيكلة وياقة مفصّلة وحاشية بيبلوم متسعة.",
    (m) => {
      const jb = jacketFrontBack(m, m.backLen*0.55, { hemFlareF:1.0 });
      const waistW = q(m.waist);
      const sl = sleeve2pc(m.bicep, m.sleeve);
      return [
        { key:"front", name:{en:"Bodice Front",ar:"مقدمة الصدرية"}, desc:{en:"Structured front with a tailored closure.",ar:"مقدمة مهيكلة بإغلاق مفصّل."}, role:"front-panel", outline:jb.front, grain:[[4,8],[4,m.backLen*0.4]] },
        { key:"back", name:{en:"Bodice Back",ar:"خلفية الصدرية"}, desc:{en:"Tailored back panel.",ar:"لوحة خلفية مفصّلة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,8],[4,m.backLen*0.4]] },
        { key:"collar", name:{en:"Shawl Collar",ar:"ياقة شال"}, desc:{en:"Curved shawl collar.",ar:"ياقة شال منحنية."}, role:"collar", outline:shawlCollar(m.neck, 16), grain:[[4,4],[4,12]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved lapel facing.",ar:"بطانة صدر منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck, m.backLen*0.5), grain:[[4,4],[4,m.backLen*0.3]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"peplumF", name:{en:"Peplum Front",ar:"بيبلوم أمامي"}, desc:{en:"Flared peplum flounce at the front waist.",ar:"كشكش بيبلوم متسع عند الخصر الأمامي."}, role:"peplum-front", outline:peplumPc(waistW*0.55, 22), grain:[[6,4],[6,16]] },
        { key:"peplumB", name:{en:"Peplum Back",ar:"بيبلوم خلفي"}, desc:{en:"Flared peplum flounce at the back waist.",ar:"كشكش بيبلوم متسع عند الخصر الخلفي."}, role:"peplum-back", outline:peplumPc(waistW*0.5, 20), grain:[[6,4],[6,15]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket.",ar:"جيب مطوي منحني."}, role:"pocket", outline:pocketPc(11,4), grain:[[5,1],[5,3]] },
      ];
    });

  // ================= MEN (6) =================

  def("mf01", "men", "Classic Tuxedo Jacket", "جاكيت سموكينغ كلاسيكي",
    "Jacket", "جاكيت", "jacket",
    "A formal tuxedo jacket with a curved shawl collar and satin-ready lapel facing.",
    "جاكيت سموكينغ رسمي بياقة شال منحنية وبطانة صدر جاهزة للساتان.",
    (m) => {
      const len = m.backLen*1.55;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.0 });
      const sl = sleeve2pc(m.bicep, m.sleeve);
      return [
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored front with a curved hem sweep.",ar:"مقدمة مفصّلة بحاشية منحنية."}, role:"front-panel", outline:jb.front, grain:[[4,10],[4,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Center back panel with a shaped waist.",ar:"لوحة الخلفية الوسطى بخصر مشكّل."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel with a curved cap.",ar:"اللوحة الخارجية للكم برأس منحنٍ."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Shawl Collar",ar:"ياقة شال"}, desc:{en:"Smooth curved shawl collar, no notch.",ar:"ياقة شال منحنية بلا فتحة."}, role:"collar", outline:shawlCollar(m.neck, 22), grain:[[4,4],[4,16]] },
        { key:"facing", name:{en:"Lapel Facing",ar:"بطانة الصدر"}, desc:{en:"Curved facing along the lapel roll-line.",ar:"بطانة منحنية على خط انثناء الصدر."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.55), grain:[[4,4],[4,len*0.35]] },
        { key:"pocketWelt", name:{en:"Chest Welt Pocket",ar:"جيب صدر مطوي"}, desc:{en:"Curved welt pocket at the chest.",ar:"جيب مطوي منحنٍ عند الصدر."}, role:"pocket", outline:pocketPc(10,3.5), grain:[[5,1],[5,2.5]] },
        { key:"pocketFlap", name:{en:"Hip Pocket Flap",ar:"غطاء جيب الورك"}, desc:{en:"Curved flap for the hip pocket.",ar:"غطاء منحنٍ لجيب الورك."}, role:"pocket", outline:pocketPc(13,5), grain:[[6,1.5],[6,3.5]] },
        { key:"backLining", name:{en:"Back Lining",ar:"بطانة الظهر"}, desc:{en:"Full back body lining.",ar:"بطانة كاملة للظهر."}, role:"lining", outline:jb.back, grain:[[4,10],[4,len*0.6]] },
      ];
    });

  def("mf02", "men", "Double-Breasted Overcoat", "معطف صفين من الأزرار",
    "Coat", "معطف", "coat",
    "A long double-breasted overcoat with a wide curved lapel and a half-belt back.",
    "معطف طويل بصفين من الأزرار وياقة عريضة منحنية ونصف حزام خلفي.",
    (m) => {
      const len = m.backLen*2.1;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.08, closureX: q(m.chest)*0.32 });
      const sl = sleeve2pc(m.bicep, m.sleeve+3);
      return [
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Wide double-breasted overlap front.",ar:"مقدمة عريضة بتراكب صفين من الأزرار."}, role:"front-panel", outline:jb.front, grain:[[6,12],[6,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Long back panel with a center vent.",ar:"لوحة خلفية طويلة بفتحة وسطى."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[6,12],[6,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer coat sleeve panel.",ar:"اللوحة الخارجية لكم المعطف."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner coat sleeve panel.",ar:"اللوحة الداخلية لكم المعطف."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"facing", name:{en:"Wide Lapel Facing",ar:"بطانة الصدر العريضة"}, desc:{en:"Wide curved lapel facing.",ar:"بطانة صدر عريضة منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck*1.15, len*0.5), grain:[[4,4],[4,len*0.3]] },
        { key:"undercollar", name:{en:"Undercollar",ar:"تحت الياقة"}, desc:{en:"Curved undercollar piece.",ar:"قطعة تحت الياقة المنحنية."}, role:"undercollar", outline:shawlCollar(m.neck, 14), grain:[[4,3],[4,10]] },
        { key:"backBelt", name:{en:"Half Belt",ar:"نصف حزام"}, desc:{en:"Decorative half-belt tab at the back waist.",ar:"شريط نصف حزام زخرفي عند خصر الظهر."}, role:"belt", outline:waistbandPc(q(m.waist)*0.5, 6), grain:[[8,1],[8,4]] },
        { key:"chestPocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Curved welt chest pocket.",ar:"جيب صدر مطوي منحنٍ."}, role:"pocket", outline:pocketPc(10,3.5), grain:[[5,1],[5,2.5]] },
        { key:"hipFlap", name:{en:"Hip Flap Pocket",ar:"جيب ورك بغطاء"}, desc:{en:"Flap pocket at the hip.",ar:"جيب بغطاء عند الورك."}, role:"pocket", outline:pocketPc(14,5.5), grain:[[6,1.5],[6,3.5]] },
      ];
    });

  def("mf03", "men", "Structured Bomber Jacket", "جاكيت بومبر مهيكل",
    "Jacket", "جاكيت", "jacket",
    "A structured bomber jacket with ribbed collar, cuffs and waistband.",
    "جاكيت بومبر مهيكل بياقة وأساور وحزام خصر من الريب.",
    (m) => {
      const len = m.backLen*1.15;
      const jb = jacketFrontBack(m, len, { hemFlareF:0.95, closureX:q(m.chest)*0.08 });
      const sl = sleeve2pc(m.bicep, m.sleeve-4);
      const cs = collarStand(m.neck);
      return [
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Front panel with a zip closure edge.",ar:"مقدمة بحافة إغلاق سحاب."}, role:"front-panel", outline:jb.front, grain:[[4,8],[4,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Back panel gathered to the waistband.",ar:"لوحة خلفية مجمّعة عند حزام الخصر."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,8],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.4]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.4]] },
        { key:"collarBand", name:{en:"Rib Collar Band",ar:"شريط ياقة ريب"}, desc:{en:"Stretch ribbed collar band.",ar:"شريط ياقة مطاطي من الريب."}, role:"collar-band", outline:cs.stand, grain:[[4,1],[m.neck/2,1]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff gathering the sleeve hem.",ar:"أسورة ريب تجمع نهاية الكم."}, role:"rib-cuff", outline:cuffPc(q(m.bicep)*0.8), grain:[[4,1],[4,5]] },
        { key:"waistband", name:{en:"Rib Waistband",ar:"حزام خصر ريب"}, desc:{en:"Ribbed waistband cinching the hem.",ar:"حزام خصر من الريب يجمع الحاشية."}, role:"waistband", outline:waistbandPc(q(m.waist)*0.9, 8), grain:[[8,2],[8,6]] },
        { key:"placket", name:{en:"Zip Placket Facing",ar:"بطانة فتحة السحاب"}, desc:{en:"Facing strip behind the zip.",ar:"شريط بطانة خلف السحاب."}, role:"placket-facing", outline:lapelFacing(m.neck*0.5, len*0.4), grain:[[3,3],[3,len*0.25]] },
        { key:"pocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Zippered chest pocket panel.",ar:"لوحة جيب صدر بسحاب."}, role:"pocket", outline:pocketPc(11,4), grain:[[5,1],[5,3]] },
      ];
    });

  def("mf04", "men", "Sherwani Formal Coat", "شيرواني رسمي",
    "Coat", "معطف", "coat",
    "A long formal sherwani coat with an asymmetric closure, Nehru collar and flared godets.",
    "معطف شيرواني رسمي طويل بإغلاق غير متماثل وياقة نهرو وقطع مروحية متسعة.",
    (m) => {
      const len = m.backLen*2.3;
      const qc = q(m.chest), qw = q(m.waist);
      const cs = collarStand(m.neck);
      const sl = sleeve2pc(m.bicep, m.sleeve+2);
      return [
        { key:"frontL", name:{en:"Front Left",ar:"المقدمة اليسرى"}, desc:{en:"Left front with the asymmetric closure curve.",ar:"مقدمة يسرى بمنحنى إغلاق غير متماثل."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "L"), grain:[[4,10],[4,len*0.6]] },
        { key:"frontR", name:{en:"Front Right",ar:"المقدمة اليمنى"}, desc:{en:"Right front underlapping the closure.",ar:"مقدمة يمنى تحت الإغلاق."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "R"), grain:[[-4,10],[-4,len*0.6]] },
        { key:"back", name:{en:"Back Panel",ar:"لوحة الظهر"}, desc:{en:"Long back panel to the hem.",ar:"لوحة ظهر طويلة حتى الحاشية."}, role:"back-panel", cutOnFold:true, outline:jacketFrontBack(m, len, {hemFlareF:1.05}).back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Nehru Collar",ar:"ياقة نهرو"}, desc:{en:"Standing Nehru-style collar band.",ar:"ياقة واقفة بطراز نهرو."}, role:"collar-stand", outline:cs.stand, grain:[[4,1],[m.neck/2,1]] },
        { key:"godetL", name:{en:"Hem Godet Left",ar:"مروحة الحاشية اليسرى"}, desc:{en:"Flare insert for a graceful hem sweep.",ar:"إدراج مروحي لانسيابة أنيقة عند الحاشية."}, role:"godet", outline:godetPc(q(m.hips)*0.3, len*0.32), grain:[[5,8],[5,len*0.2]] },
        { key:"godetR", name:{en:"Hem Godet Right",ar:"مروحة الحاشية اليمنى"}, desc:{en:"Flare insert for a graceful hem sweep.",ar:"إدراج مروحي لانسيابة أنيقة عند الحاشية."}, role:"godet", outline:godetPc(q(m.hips)*0.3, len*0.32), grain:[[5,8],[5,len*0.2]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket at the hip.",ar:"جيب مطوي منحنٍ عند الورك."}, role:"pocket", outline:pocketPc(11,4), grain:[[5,1],[5,3]] },
      ];
    });

  def("mf05", "men", "Three-Piece Suit Ensemble", "بدلة رسمية من ثلاث قطع",
    "Suit", "بدلة", "suit",
    "A full three-piece suit — jacket, vest and trousers — with tailored curves throughout.",
    "بدلة كاملة من ثلاث قطع — جاكيت وصدرية وبنطلون — بقصات مفصّلة منحنية.",
    (m) => {
      const jLen = m.backLen*1.55, vLen = m.backLen*1.05;
      const jb = jacketFrontBack(m, jLen, { hemFlareF:1.0 });
      const vb = jacketFrontBack(m, vLen, { hemFlareF:0.9, closureX:q(m.chest)*0.06 });
      const sl = sleeve2pc(m.bicep, m.sleeve);
      const qw = q(m.waist), qh = q(m.hips);
      return [
        { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored suit jacket front.",ar:"مقدمة جاكيت البدلة المفصّلة."}, role:"front-panel", outline:jb.front, grain:[[4,10],[4,jLen*0.6]] },
        { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored suit jacket back.",ar:"خلفية جاكيت البدلة المفصّلة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,10],[4,jLen*0.6]] },
        { key:"sleeveU", name:{en:"Jacket Sleeve Upper",ar:"الكم العلوي للجاكيت"}, desc:{en:"Outer jacket sleeve panel.",ar:"اللوحة الخارجية لكم الجاكيت."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Jacket Sleeve Under",ar:"الكم السفلي للجاكيت"}, desc:{en:"Inner jacket sleeve panel.",ar:"اللوحة الداخلية لكم الجاكيت."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Jacket Collar",ar:"ياقة الجاكيت"}, desc:{en:"Notch-ready jacket collar.",ar:"ياقة جاكيت جاهزة للفتحة."}, role:"collar", outline:shawlCollar(m.neck, 20), grain:[[4,4],[4,14]] },
        { key:"facing", name:{en:"Jacket Facing",ar:"بطانة الجاكيت"}, desc:{en:"Curved front facing.",ar:"بطانة أمامية منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck, jLen*0.5), grain:[[4,4],[4,jLen*0.3]] },
        { key:"vestFront", name:{en:"Vest Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted sleeveless vest front.",ar:"مقدمة صدرية ضيقة بلا أكمام."}, role:"front-panel", outline:vb.front, grain:[[3,8],[3,vLen*0.6]] },
        { key:"vestBack", name:{en:"Vest Back",ar:"خلفية الصدرية"}, desc:{en:"Vest back, often cut in lining fabric.",ar:"خلفية الصدرية، تُقص عادة من قماش البطانة."}, role:"back-panel", cutOnFold:true, outline:vb.back, grain:[[3,8],[3,vLen*0.6]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Front leg panel with a curved crotch seam.",ar:"لوحة الساق الأمامية بخط تفصيل منحنٍ."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,10],[qw*0.3,m.inseam*0.6]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Back leg panel with a deeper curved seat curve.",ar:"لوحة الساق الخلفية بمنحنى مقعد أعمق."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,10],[qw*0.3,m.inseam*0.6]] },
      ];
    });

  def("mf06", "men", "Structured Peacoat", "معطف بحري مهيكل",
    "Coat", "معطف", "coat",
    "A classic structured peacoat with a wide collar, back yoke and flap pockets.",
    "معطف بحري كلاسيكي مهيكل بياقة عريضة وكوة ظهر وجيوب بأغطية.",
    (m) => {
      const len = m.backLen*1.85;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.02, closureX:q(m.chest)*0.22 });
      const sl = sleeve2pc(m.bicep, m.sleeve+2);
      return [
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Double-layered front with a wide lapel.",ar:"مقدمة مزدوجة الطبقة بياقة عريضة."}, role:"front-panel", outline:jb.front, grain:[[5,10],[5,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Back panel joined below the yoke.",ar:"لوحة خلفية توصل أسفل الكوة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[5,10],[5,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Wide Collar",ar:"ياقة عريضة"}, desc:{en:"Wide curved storm collar.",ar:"ياقة عاصفة عريضة منحنية."}, role:"collar", outline:shawlCollar(m.neck*1.05, 20), grain:[[4,4],[4,14]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the front edge.",ar:"بطانة منحنية على حافة المقدمة."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.45), grain:[[4,4],[4,len*0.28]] },
        { key:"chestPocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Welt chest pocket.",ar:"جيب صدر مطوي."}, role:"pocket", outline:pocketPc(10,3.5), grain:[[5,1],[5,2.5]] },
        { key:"hipFlap", name:{en:"Hip Flap Pocket",ar:"جيب ورك بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, role:"pocket", outline:pocketPc(14,5.5), grain:[[6,1.5],[6,3.5]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke reinforcing the back.",ar:"كوة كتف منحنية تعزز الظهر."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.3, 10), grain:[[6,2],[6,7]] },
      ];
    });

  // ================= GIRLS (6) =================

  def("gf01", "girls", "Princess Party Gown", "فستان حفلة أميرة",
    "Gown", "فستان سهرة", "gown",
    "A twirl-ready party gown with a princess-seam bodice and a tiered tulle-look skirt.",
    "فستان حفلة قابل للدوران بصدرية بقصات أميرة وتنورة بطبقات تول.",
    (m) => {
      const b = princessBodice(m, { neckline:"scoop", hipY:m.backLen*0.9+4, hemY:m.backLen*0.9+6 });
      const waistW = q(m.waist), tierLen = (m.height*0.62 - b.hemY)/3;
      const t1w = waistW*1.8, t2w = waistW*2.3, t3w = waistW*2.9;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a curved neckline.",ar:"لوحة المقدمة الوسطى بخط رقبة منحنٍ."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"tier1", name:{en:"Skirt Tier 1",ar:"طبقة التنورة الأولى"}, desc:{en:"Top tier gathered at the waist.",ar:"الطبقة العلوية مجمّعة عند الخصر."}, role:"tier", outline:tierPc(t1w, t2w, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"tier2", name:{en:"Skirt Tier 2",ar:"طبقة التنورة الثانية"}, desc:{en:"Middle tier.",ar:"الطبقة الوسطى."}, role:"tier", outline:tierPc(t2w, t3w, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"tier3", name:{en:"Skirt Tier 3",ar:"طبقة التنورة الثالثة"}, desc:{en:"Hem tier, fullest of the three.",ar:"طبقة الحاشية، الأوسع من الثلاث."}, role:"tier", outline:tierPc(t3w, t3w*1.3, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"sleeve", name:{en:"Cap Sleeve",ar:"كم قصير"}, desc:{en:"Puffed curved cap sleeve.",ar:"كم قصير منتفخ منحنٍ."}, role:"cap-sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.3, 1.2), grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.24]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Bow sash tying at the back.",ar:"حزام بفيونكة يُربط خلفيًا."}, role:"sash", outline:sashPc(waistW*0.4, 40), grain:[[6,1.5],[25,1.5]] },
      ];
    });

  def("gf02", "girls", "Butterfly-Sleeve Ball Gown", "فستان سهرة بأكمام فراشة",
    "Gown", "فستان سهرة", "gown",
    "A ball gown with dramatic butterfly sleeves and a full gored skirt.",
    "فستان سهرة بأكمام فراشة درامية وتنورة كاملة الاتساع.",
    (m) => {
      const b = princessBodice(m, { neckline:"sweetheart", hipY:m.backLen*0.9+4, hemY:m.backLen*0.9+6 });
      const waistW = q(m.waist), hemLen = m.height*0.6 - b.hemY, hemW = q(m.hips)*2.0;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front with a sweetheart curve.",ar:"مقدمة وسطى بخط قلب منحنٍ."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"sleeve", name:{en:"Butterfly Sleeve",ar:"كم فراشة"}, desc:{en:"Wide winged sleeve with a curved edge.",ar:"كم عريض بجناحين وحافة منحنية."}, role:"butterfly-sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.32, 1.6), grain:[[q(m.bicep)*0.6,3],[q(m.bicep)*0.6,m.sleeve*0.25]] },
        { key:"facing", name:{en:"Neckline Facing",ar:"بطانة خط الرقبة"}, desc:{en:"Curved facing finishing the neckline.",ar:"بطانة منحنية لتشطيب خط الرقبة."}, role:"lapel-facing", outline:[[0,0],...qBez([0,0],[q(m.chest)*0.4,3],[q(m.chest)*0.7,1],6),[q(m.chest)*0.7,5],[0,5]], grain:[[3,2],[q(m.chest)*0.4,2]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore.",ar:"مروحة أمامية."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 6), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore.",ar:"مروحة خلفية."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 6), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, role:"skirt-side-gore-left", outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 7), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, role:"skirt-side-gore-right", outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 7), grain:[[3,8],[3,hemLen-8]] },
      ];
    });

  def("gf03", "girls", "Fairy-Tale Cape Dress", "فستان بكاب حكاية خرافية",
    "Gown", "فستان سهرة", "gown",
    "A storybook gown with a sweeping attached cape and a full curved skirt.",
    "فستان مستوحى من الحكايات بكاب منسدل وتنورة كاملة منحنية.",
    (m) => {
      const b = princessBodice(m, { neckline:"scoop", hipY:m.backLen*0.9+4, hemY:m.backLen*0.9+6 });
      const waistW = q(m.waist), hemLen = m.height*0.6 - b.hemY, hemW = q(m.hips)*1.9;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel.",ar:"لوحة المقدمة الوسطى."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"cape", name:{en:"Attached Cape",ar:"كاب متصل"}, desc:{en:"Sweeping cape draping from the shoulders.",ar:"كاب منسدل من الكتفين."}, role:"cape", outline:capePc(q(m.shoulder)*0.85, 42), grain:[[5,5],[5,30]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore.",ar:"مروحة أمامية."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 5), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore.",ar:"مروحة خلفية."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 5), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, role:"skirt-side-gore-left", outline:gorePanel(waistW*0.45, hemW*0.3, hemLen, 6), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, role:"skirt-side-gore-right", outline:gorePanel(waistW*0.45, hemW*0.3, hemLen, 6), grain:[[3,8],[3,hemLen-8]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Bow sash at the waist.",ar:"حزام بفيونكة عند الخصر."}, role:"sash", outline:sashPc(waistW*0.4, 38), grain:[[6,1.5],[24,1.5]] },
      ];
    });

  def("gf04", "girls", "Tiered Ruffle Party Dress", "فستان حفلة بطبقات كشكش",
    "Dress", "فستان", "dress",
    "A playful party dress with a princess-seam bodice and four ruffled tiers.",
    "فستان حفلة مرح بصدرية بقصات أميرة وأربع طبقات من الكشكش.",
    (m) => {
      const b = princessBodice(m, { neckline:"round", hipY:m.backLen*0.9+4, hemY:m.backLen*0.9+6 });
      const waistW = q(m.waist), tierLen = (m.height*0.5 - b.hemY)/4;
      const widths = [waistW*1.7, waistW*2.0, waistW*2.4, waistW*2.9];
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel.",ar:"لوحة المقدمة الوسطى."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"tier1", name:{en:"Skirt Tier 1",ar:"طبقة التنورة الأولى"}, desc:{en:"Top tier.",ar:"الطبقة العلوية."}, role:"tier", outline:tierPc(widths[0], widths[1], tierLen), grain:[[4,3],[4,tierLen-4]] },
        { key:"tier2", name:{en:"Skirt Tier 2",ar:"طبقة التنورة الثانية"}, desc:{en:"Second tier.",ar:"الطبقة الثانية."}, role:"tier", outline:tierPc(widths[1], widths[2], tierLen), grain:[[4,3],[4,tierLen-4]] },
        { key:"tier3", name:{en:"Skirt Tier 3",ar:"طبقة التنورة الثالثة"}, desc:{en:"Third tier.",ar:"الطبقة الثالثة."}, role:"tier", outline:tierPc(widths[2], widths[3], tierLen), grain:[[4,3],[4,tierLen-4]] },
        { key:"tier4", name:{en:"Skirt Tier 4",ar:"طبقة التنورة الرابعة"}, desc:{en:"Hem tier.",ar:"طبقة الحاشية."}, role:"tier", outline:tierPc(widths[3], widths[3]*1.2, tierLen), grain:[[4,3],[4,tierLen-4]] },
        { key:"sleeve", name:{en:"Puff Sleeve",ar:"كم منتفخ"}, desc:{en:"Short puffed sleeve.",ar:"كم قصير منتفخ."}, role:"puff-sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.28, 1.15), grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.22]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Bow sash at the waist seam.",ar:"حزام بفيونكة عند خط الخصر."}, role:"sash", outline:sashPc(waistW*0.4, 36), grain:[[6,1.5],[22,1.5]] },
      ];
    });

  def("gf05", "girls", "Velvet-Collar Structured Coat Dress", "فستان معطف بياقة مخملية",
    "Coat", "فستان معطف", "coat",
    "A structured coat-dress with a velvet collar and a flared peplum hem.",
    "فستان معطف مهيكل بياقة مخملية وحاشية بيبلوم متسعة.",
    (m) => {
      const len = m.backLen*1.4;
      const qc = q(m.chest), qw = q(m.waist);
      return [
        { key:"frontL", name:{en:"Front Left",ar:"المقدمة اليسرى"}, desc:{en:"Left front closure panel.",ar:"لوحة إغلاق يسرى."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "L"), grain:[[3,8],[3,len*0.6]] },
        { key:"frontR", name:{en:"Front Right",ar:"المقدمة اليمنى"}, desc:{en:"Right front underlapping panel.",ar:"لوحة يمنى تحت الإغلاق."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "R"), grain:[[-3,8],[-3,len*0.6]] },
        { key:"back", name:{en:"Back Panel",ar:"لوحة الظهر"}, desc:{en:"Curved back panel.",ar:"لوحة ظهر منحنية."}, role:"back-panel", cutOnFold:true, outline:jacketFrontBack(m, len, {hemFlareF:1.0}).back, grain:[[3,8],[3,len*0.6]] },
        { key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Curved-cap sleeve.",ar:"كم برأس منحنٍ."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.85), grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.7]] },
        { key:"collar", name:{en:"Velvet Collar",ar:"ياقة مخملية"}, desc:{en:"Contrast velvet collar piece.",ar:"قطعة ياقة مخملية متباينة."}, role:"collar", outline:shawlCollar(m.neck, 12), grain:[[3,3],[3,9]] },
        { key:"peplumF", name:{en:"Peplum Front",ar:"بيبلوم أمامي"}, desc:{en:"Flared peplum at the front waist.",ar:"بيبلوم متسع عند الخصر الأمامي."}, role:"peplum-front", outline:peplumPc(qw*0.5, 16), grain:[[5,3],[5,11]] },
        { key:"peplumB", name:{en:"Peplum Back",ar:"بيبلوم خلفي"}, desc:{en:"Flared peplum at the back waist.",ar:"بيبلوم متسع عند الخصر الخلفي."}, role:"peplum-back", outline:peplumPc(qw*0.48, 15), grain:[[5,3],[5,10]] },
        { key:"pocket", name:{en:"Patch Pocket",ar:"جيب ملصق"}, desc:{en:"Curved patch pocket.",ar:"جيب ملصق منحني."}, role:"pocket", outline:pocketPc(9,3.5), grain:[[4,1],[4,2.5]] },
      ];
    });

  def("gf06", "girls", "Godet-Flare Gala Dress", "فستان سهرة بمروحات متسعة",
    "Gown", "فستان سهرة", "gown",
    "A gala dress with a princess-seam bodice and flare godets inserted at the hem.",
    "فستان سهرة بصدرية بقصات أميرة ومروحات اتساع عند الحاشية.",
    (m) => {
      const b = princessBodice(m, { neckline:"offshoulder", hipY:m.backLen*0.9+4, hemY:m.backLen*0.9+6 });
      const waistW = q(m.waist), hemLen = m.height*0.58 - b.hemY;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel.",ar:"لوحة المقدمة الوسطى."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"skirtF", name:{en:"Skirt Front",ar:"مقدمة التنورة"}, desc:{en:"Front skirt panel.",ar:"لوحة التنورة الأمامية."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, waistW*0.65, hemLen, 2), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtB", name:{en:"Skirt Back",ar:"خلفية التنورة"}, desc:{en:"Back skirt panel.",ar:"لوحة التنورة الخلفية."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, waistW*0.65, hemLen, 2), grain:[[3,8],[3,hemLen-8]] },
        { key:"godetL", name:{en:"Flare Godet Left",ar:"مروحة اتساع يسرى"}, desc:{en:"Triangular flare insert at the side hem.",ar:"إدراج مروحي مثلث عند الحاشية الجانبية."}, role:"godet", outline:godetPc(q(m.hips)*0.25, hemLen*0.55), grain:[[3,5],[3,hemLen*0.35]] },
        { key:"godetR", name:{en:"Flare Godet Right",ar:"مروحة اتساع يمنى"}, desc:{en:"Triangular flare insert at the side hem.",ar:"إدراج مروحي مثلث عند الحاشية الجانبية."}, role:"godet", outline:godetPc(q(m.hips)*0.25, hemLen*0.55), grain:[[3,5],[3,hemLen*0.35]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Tie sash at the waist.",ar:"حزام يُربط عند الخصر."}, role:"sash", outline:sashPc(waistW*0.4, 36), grain:[[6,1.5],[22,1.5]] },
      ];
    });

  // ================= BOYS (6) =================

  def("bf01", "boys", "Kids Tuxedo Blazer", "بليزر سموكينغ للأطفال",
    "Jacket", "جاكيت", "jacket",
    "A miniature tuxedo blazer with a curved shawl collar and a lined back.",
    "بليزر سموكينغ مصغّر بياقة شال منحنية وظهر مبطّن.",
    (m) => {
      const len = m.backLen*1.4;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.0 });
      const sl = sleeve2pc(m.bicep, m.sleeve);
      return [
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored blazer front.",ar:"مقدمة بليزر مفصّلة."}, role:"front-panel", outline:jb.front, grain:[[3,8],[3,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored blazer back.",ar:"خلفية بليزر مفصّلة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,8],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Shawl Collar",ar:"ياقة شال"}, desc:{en:"Curved shawl collar.",ar:"ياقة شال منحنية."}, role:"collar", outline:shawlCollar(m.neck, 15), grain:[[3,3],[3,11]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved lapel facing.",ar:"بطانة صدر منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.5), grain:[[3,3],[3,len*0.3]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket.",ar:"جيب مطوي منحنٍ."}, role:"pocket", outline:pocketPc(8,3), grain:[[4,1],[4,2]] },
        { key:"cuff", name:{en:"Sleeve Cuff Detail",ar:"تفصيلة أسورة الكم"}, desc:{en:"Decorative cuff band at the sleeve hem.",ar:"شريط أسورة زخرفي عند نهاية الكم."}, role:"cuff", outline:cuffPc(q(m.bicep)*0.7), grain:[[3,1],[3,4]] },
        { key:"backLining", name:{en:"Back Lining",ar:"بطانة الظهر"}, desc:{en:"Full back body lining.",ar:"بطانة كاملة للظهر."}, role:"lining", outline:jb.back, grain:[[3,8],[3,len*0.6]] },
      ];
    });

  def("bf02", "boys", "Structured Bomber Jacket (Kids)", "جاكيت بومبر مهيكل للأطفال",
    "Jacket", "جاكيت", "jacket",
    "A kids' bomber jacket with ribbed collar, cuffs and waistband.",
    "جاكيت بومبر للأطفال بياقة وأساور وحزام خصر من الريب.",
    (m) => {
      const len = m.backLen*1.05;
      const jb = jacketFrontBack(m, len, { hemFlareF:0.95, closureX:q(m.chest)*0.08 });
      const sl = sleeve2pc(m.bicep, m.sleeve-3);
      const cs = collarStand(m.neck);
      return [
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Front panel with a zip closure edge.",ar:"مقدمة بحافة إغلاق سحاب."}, role:"front-panel", outline:jb.front, grain:[[3,7],[3,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Back panel gathered to the waistband.",ar:"لوحة خلفية مجمّعة عند حزام الخصر."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,7],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.4]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.4]] },
        { key:"collarBand", name:{en:"Rib Collar Band",ar:"شريط ياقة ريب"}, desc:{en:"Stretch ribbed collar band.",ar:"شريط ياقة مطاطي من الريب."}, role:"collar-band", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff at the sleeve hem.",ar:"أسورة ريب عند نهاية الكم."}, role:"rib-cuff", outline:cuffPc(q(m.bicep)*0.8), grain:[[3,1],[3,4]] },
        { key:"waistband", name:{en:"Rib Waistband",ar:"حزام خصر ريب"}, desc:{en:"Ribbed waistband cinching the hem.",ar:"حزام خصر من الريب يجمع الحاشية."}, role:"waistband", outline:waistbandPc(q(m.waist)*0.9, 7), grain:[[6,2],[6,5]] },
        { key:"placket", name:{en:"Zip Placket Facing",ar:"بطانة فتحة السحاب"}, desc:{en:"Facing strip behind the zip.",ar:"شريط بطانة خلف السحاب."}, role:"placket-facing", outline:lapelFacing(m.neck*0.5, len*0.4), grain:[[2,3],[2,len*0.25]] },
        { key:"pocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Zippered chest pocket panel.",ar:"لوحة جيب صدر بسحاب."}, role:"pocket", outline:pocketPc(9,3.5), grain:[[4,1],[4,2.5]] },
      ];
    });

  def("bf03", "boys", "Sherwani Coat (Kids)", "معطف شيرواني للأطفال",
    "Coat", "معطف", "coat",
    "A kids' formal sherwani coat with an asymmetric closure and flared godets.",
    "معطف شيرواني رسمي للأطفال بإغلاق غير متماثل وقطع مروحية متسعة.",
    (m) => {
      const len = m.backLen*1.7;
      const qc = q(m.chest), qw = q(m.waist);
      const cs = collarStand(m.neck);
      const sl = sleeve2pc(m.bicep, m.sleeve+1);
      return [
        { key:"frontL", name:{en:"Front Left",ar:"المقدمة اليسرى"}, desc:{en:"Left front with the asymmetric closure curve.",ar:"مقدمة يسرى بمنحنى إغلاق غير متماثل."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "L"), grain:[[3,8],[3,len*0.6]] },
        { key:"frontR", name:{en:"Front Right",ar:"المقدمة اليمنى"}, desc:{en:"Right front underlapping the closure.",ar:"مقدمة يمنى تحت الإغلاق."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "R"), grain:[[-3,8],[-3,len*0.6]] },
        { key:"back", name:{en:"Back Panel",ar:"لوحة الظهر"}, desc:{en:"Back panel to the hem.",ar:"لوحة ظهر حتى الحاشية."}, role:"back-panel", cutOnFold:true, outline:jacketFrontBack(m, len, {hemFlareF:1.05}).back, grain:[[3,8],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Nehru Collar",ar:"ياقة نهرو"}, desc:{en:"Standing Nehru-style collar band.",ar:"ياقة واقفة بطراز نهرو."}, role:"collar-stand", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"godetL", name:{en:"Hem Godet Left",ar:"مروحة الحاشية اليسرى"}, desc:{en:"Flare insert at the hem.",ar:"إدراج مروحي عند الحاشية."}, role:"godet", outline:godetPc(q(m.hips)*0.28, len*0.3), grain:[[4,6],[4,len*0.18]] },
        { key:"godetR", name:{en:"Hem Godet Right",ar:"مروحة الحاشية اليمنى"}, desc:{en:"Flare insert at the hem.",ar:"إدراج مروحي عند الحاشية."}, role:"godet", outline:godetPc(q(m.hips)*0.28, len*0.3), grain:[[4,6],[4,len*0.18]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket at the hip.",ar:"جيب مطوي منحنٍ عند الورك."}, role:"pocket", outline:pocketPc(9,3.5), grain:[[4,1],[4,2.5]] },
      ];
    });

  def("bf04", "boys", "Three-Piece Suit (Kids)", "بدلة أطفال من ثلاث قطع",
    "Suit", "بدلة", "suit",
    "A full kids' three-piece suit — jacket, vest and trousers — with tailored curves.",
    "بدلة أطفال كاملة من ثلاث قطع — جاكيت وصدرية وبنطلون — بقصات مفصّلة منحنية.",
    (m) => {
      const jLen = m.backLen*1.4, vLen = m.backLen*0.95;
      const jb = jacketFrontBack(m, jLen, { hemFlareF:1.0 });
      const vb = jacketFrontBack(m, vLen, { hemFlareF:0.9, closureX:q(m.chest)*0.06 });
      const sl = sleeve2pc(m.bicep, m.sleeve);
      const qw = q(m.waist), qh = q(m.hips);
      return [
        { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored suit jacket front.",ar:"مقدمة جاكيت البدلة المفصّلة."}, role:"front-panel", outline:jb.front, grain:[[3,8],[3,jLen*0.6]] },
        { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored suit jacket back.",ar:"خلفية جاكيت البدلة المفصّلة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,8],[3,jLen*0.6]] },
        { key:"sleeveU", name:{en:"Jacket Sleeve Upper",ar:"الكم العلوي للجاكيت"}, desc:{en:"Outer jacket sleeve panel.",ar:"اللوحة الخارجية لكم الجاكيت."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Jacket Sleeve Under",ar:"الكم السفلي للجاكيت"}, desc:{en:"Inner jacket sleeve panel.",ar:"اللوحة الداخلية لكم الجاكيت."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Jacket Collar",ar:"ياقة الجاكيت"}, desc:{en:"Notch-ready jacket collar.",ar:"ياقة جاكيت جاهزة للفتحة."}, role:"collar", outline:shawlCollar(m.neck, 14), grain:[[3,3],[3,10]] },
        { key:"facing", name:{en:"Jacket Facing",ar:"بطانة الجاكيت"}, desc:{en:"Curved front facing.",ar:"بطانة أمامية منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck, jLen*0.5), grain:[[3,3],[3,jLen*0.3]] },
        { key:"vestFront", name:{en:"Vest Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted sleeveless vest front.",ar:"مقدمة صدرية ضيقة بلا أكمام."}, role:"front-panel", outline:vb.front, grain:[[2,6],[2,vLen*0.6]] },
        { key:"vestBack", name:{en:"Vest Back",ar:"خلفية الصدرية"}, desc:{en:"Vest back panel.",ar:"لوحة خلفية الصدرية."}, role:"back-panel", cutOnFold:true, outline:vb.back, grain:[[2,6],[2,vLen*0.6]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Front leg panel with a curved crotch seam.",ar:"لوحة الساق الأمامية بخط تفصيل منحنٍ."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,8],[qw*0.3,m.inseam*0.6]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Back leg panel with a curved seat curve.",ar:"لوحة الساق الخلفية بمنحنى مقعد."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,8],[qw*0.3,m.inseam*0.6]] },
      ];
    });

  def("bf05", "boys", "Winter Parka with Hood", "معطف بارد شتوي بقبعة",
    "Coat", "معطف", "coat",
    "A cozy hooded parka with a curved two-piece hood and a ribbed hem.",
    "معطف شتوي دافئ بقبعة من قطعتين منحنية وحاشية من الريب.",
    (m) => {
      const len = m.backLen*1.5;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.05, closureX:q(m.chest)*0.1 });
      return [
        { key:"front", name:{en:"Parka Front",ar:"مقدمة المعطف"}, desc:{en:"Insulated front panel.",ar:"لوحة أمامية معزولة."}, role:"front-panel", outline:jb.front, grain:[[4,10],[4,len*0.6]] },
        { key:"back", name:{en:"Parka Back",ar:"خلفية المعطف"}, desc:{en:"Insulated back panel.",ar:"لوحة خلفية معزولة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Roomy curved-cap sleeve.",ar:"كم واسع برأس منحنٍ."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep*1.15, m.sleeve, 1.05), grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.7]] },
        { key:"hoodL", name:{en:"Hood Left",ar:"القبعة اليسرى"}, desc:{en:"Left half of the two-piece hood.",ar:"النصف الأيسر من القبعة ذات القطعتين."}, role:"hood", outline:hoodHalf(m.neck*2.1, 30), grain:[[6,4],[6,20]] },
        { key:"hoodR", name:{en:"Hood Right",ar:"القبعة اليمنى"}, desc:{en:"Right half of the two-piece hood.",ar:"النصف الأيمن من القبعة ذات القطعتين."}, role:"hood", outline:hoodHalf(m.neck*2.1, 30), grain:[[6,4],[6,20]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff sealing the sleeve hem.",ar:"أسورة ريب تُغلق نهاية الكم."}, role:"rib-cuff", outline:cuffPc(q(m.bicep)*0.85), grain:[[3,1],[3,4]] },
        { key:"waistband", name:{en:"Ribbed Hem Band",ar:"شريط حاشية من الريب"}, desc:{en:"Ribbed band sealing the coat hem.",ar:"شريط ريب يُغلق حاشية المعطف."}, role:"hem-band", outline:waistbandPc(q(m.waist)*0.95, 7), grain:[[6,2],[6,5]] },
        { key:"pocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Flapped chest pocket.",ar:"جيب صدر بغطاء."}, role:"pocket", outline:pocketPc(10,4), grain:[[4,1],[4,3]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke.",ar:"كوة كتف منحنية."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.2, 9), grain:[[5,2],[5,6]] },
      ];
    });

  def("bf06", "boys", "Double-Breasted Kids Overcoat", "معطف أطفال بصفين من الأزرار",
    "Coat", "معطف", "coat",
    "A double-breasted kids' overcoat with a wide lapel and a half-belt back.",
    "معطف أطفال بصفين من الأزرار وياقة عريضة ونصف حزام خلفي.",
    (m) => {
      const len = m.backLen*1.6;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.05, closureX:q(m.chest)*0.28 });
      const sl = sleeve2pc(m.bicep, m.sleeve+2);
      return [
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Wide double-breasted overlap front.",ar:"مقدمة عريضة بتراكب صفين من الأزرار."}, role:"front-panel", outline:jb.front, grain:[[4,10],[4,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Back panel with a center vent.",ar:"لوحة خلفية بفتحة وسطى."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer coat sleeve panel.",ar:"اللوحة الخارجية لكم المعطف."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner coat sleeve panel.",ar:"اللوحة الداخلية لكم المعطف."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"facing", name:{en:"Wide Lapel Facing",ar:"بطانة الصدر العريضة"}, desc:{en:"Wide curved lapel facing.",ar:"بطانة صدر عريضة منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck*1.1, len*0.5), grain:[[3,3],[3,len*0.3]] },
        { key:"collarStand", name:{en:"Collar Stand",ar:"قاعدة الياقة"}, desc:{en:"Standing collar band beneath the lapel.",ar:"شريط ياقة واقف أسفل الصدر."}, role:"collar-stand", outline:collarStand(m.neck).stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"flapPocket", name:{en:"Flap Pocket",ar:"جيب بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, role:"pocket", outline:pocketPc(11,4.5), grain:[[5,1],[5,3]] },
        { key:"backBelt", name:{en:"Half Belt",ar:"نصف حزام"}, desc:{en:"Decorative half-belt tab at the back waist.",ar:"شريط نصف حزام زخرفي عند خصر الظهر."}, role:"belt", outline:waistbandPc(q(m.waist)*0.5, 5), grain:[[6,1],[6,3]] },
      ];
    });

  // ================= WOMEN — 10 more professional designs =================
  // Same authoring pattern as wf01-06 above (bezier-curved bespoke geometry,
  // reusing the same component toolkit), each with 10+ real pieces.

  def("wf07", "women", "Kimono-Sleeve Wrap Dress", "فستان ملفوف بأكمام كيمونو",
    "Dress", "فستان", "dress",
    "A wrap bodice with wide kimono sleeves over a three-tier flowing skirt.",
    "صدرية ملفوفة بأكمام كيمونو عريضة فوق تنورة انسيابية من ثلاث طبقات.",
    (m) => {
      const qc = q(m.chest), qw = q(m.waist), bodiceLen = m.backLen*0.92;
      const tierLen = (m.height*0.58 - bodiceLen) / 3;
      const t1w = qw*1.75, t2w = qw*2.15, t3w = qw*2.6;
      return [
        { key:"frontL", name:{en:"Front Wrap Left",ar:"المقدمة الملفوفة اليسرى"}, desc:{en:"Left wrap panel crossing to the opposite hip.",ar:"لوحة ملفوفة يسرى تعبر إلى الورك المقابل."}, role:"front-panel", outline:wrapPanel(qc, qw, bodiceLen, "L"), grain:[[4,8],[4,bodiceLen-10]] },
        { key:"frontR", name:{en:"Front Wrap Right",ar:"المقدمة الملفوفة اليمنى"}, desc:{en:"Right wrap panel crossing to the opposite hip.",ar:"لوحة ملفوفة يمنى تعبر إلى الورك المقابل."}, role:"front-panel", outline:wrapPanel(qc, qw, bodiceLen, "R"), grain:[[-4,8],[-4,bodiceLen-10]] },
        { key:"back", name:{en:"Bodice Back",ar:"خلفية الصدرية"}, desc:{en:"Curved back bodice panel.",ar:"لوحة خلفية منحنية للصدرية."}, role:"back-panel", cutOnFold:true, outline:[[0,0],[qc*0.95,2],...qBez([qc*0.95,2],[qc*1.0,bodiceLen*0.5],[qw*0.85,bodiceLen],8),[0,bodiceLen]], grain:[[4,8],[4,bodiceLen-10]] },
        { key:"sleeve", name:{en:"Kimono Sleeve",ar:"كم كيمونو"}, desc:{en:"Wide flowing kimono-style sleeve.",ar:"كم واسع انسيابي بطراز الكيمونو."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.55, 1.9), grain:[[q(m.bicep)*0.6,4],[q(m.bicep)*0.6,m.sleeve*0.45]] },
        { key:"facing", name:{en:"Neckline Facing",ar:"بطانة خط الرقبة"}, desc:{en:"Curved facing strip finishing the wrap neckline.",ar:"شريط بطانة منحنٍ لتشطيب خط الرقبة الملفوف."}, role:"lapel-facing", outline:[[0,0],...qBez([0,0],[qc*0.4,3],[qc*0.8,1],6),[qc*0.8,6],[0,6]], grain:[[4,2],[qc*0.5,2]] },
        { key:"tier1", name:{en:"Skirt Tier 1",ar:"الطبقة الأولى من التنورة"}, desc:{en:"Top tier gathered at the waist.",ar:"الطبقة العلوية مجمّعة عند الخصر."}, role:"tier", outline:tierPc(t1w, t2w, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"tier2", name:{en:"Skirt Tier 2",ar:"الطبقة الثانية من التنورة"}, desc:{en:"Middle tier, wider than the first.",ar:"الطبقة الوسطى أوسع من الأولى."}, role:"tier", outline:tierPc(t2w, t3w, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"tier3", name:{en:"Skirt Tier 3",ar:"الطبقة الثالثة من التنورة"}, desc:{en:"Hem tier with the fullest curved sweep.",ar:"طبقة الحاشية الأوسع بانسيابة منحنية."}, role:"tier", outline:tierPc(t3w, t3w*1.25, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"sash", name:{en:"Wrap Tie",ar:"رباط الالتفاف"}, desc:{en:"Long tie securing the wrap closure.",ar:"رباط طويل لتثبيت الإغلاق الملفوف."}, role:"wrap-tie", outline:sashPc(qw*0.3, 55), grain:[[8,2],[35,2]] },
        { key:"pocket", name:{en:"Side Seam Pocket",ar:"جيب خط الجانب"}, desc:{en:"Hidden pocket set into the skirt side seam.",ar:"جيب مخفي داخل خط جانب التنورة."}, role:"pocket", outline:pocketPc(11,14), grain:[[5,4],[5,10]] },
      ];
    });

  def("wf08", "women", "Structured Blazer Jumpsuit", "أفرول بليزر مهيكل",
    "Jumpsuit", "أفرول", "suit",
    "A tailored blazer bodice joined to wide-leg trousers, with a full lapel and belt.",
    "صدرية بليزر مفصّلة متصلة ببنطلون واسع الساق، بياقة صدر كاملة وحزام.",
    (m) => {
      const jb = jacketFrontBack(m, m.backLen*0.6, { hemFlareF:1.0 });
      const qw = q(m.waist), qh = q(m.hips);
      return [
        { key:"front", name:{en:"Bodice Front",ar:"مقدمة الصدرية"}, desc:{en:"Structured front with a lapel closure.",ar:"مقدمة مهيكلة بإغلاق ذي صدر."}, role:"front-panel", outline:jb.front, grain:[[4,8],[4,m.backLen*0.45]] },
        { key:"back", name:{en:"Bodice Back",ar:"خلفية الصدرية"}, desc:{en:"Tailored back panel.",ar:"لوحة خلفية مفصّلة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,8],[4,m.backLen*0.45]] },
        { key:"collar", name:{en:"Notch Collar",ar:"ياقة بفتحة"}, desc:{en:"Tailored notch-style collar.",ar:"ياقة مفصّلة بطراز الفتحة."}, role:"collar", outline:shawlCollar(m.neck, 18), grain:[[4,4],[4,13]] },
        { key:"facing", name:{en:"Lapel Facing",ar:"بطانة الصدر"}, desc:{en:"Curved facing along the lapel roll-line.",ar:"بطانة منحنية على خط انثناء الصدر."}, role:"lapel-facing", outline:lapelFacing(m.neck, m.backLen*0.55), grain:[[4,4],[4,m.backLen*0.35]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sleeve2pc(m.bicep, m.sleeve).upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sleeve2pc(m.bicep, m.sleeve).under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Wide-leg front panel with a curved crotch seam.",ar:"لوحة ساق أمامية واسعة بخط تفصيل منحنٍ."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,10],[qw*0.3,m.inseam*0.6]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Wide-leg back panel with a curved seat curve.",ar:"لوحة ساق خلفية واسعة بمنحنى مقعد."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,10],[qw*0.3,m.inseam*0.6]] },
        { key:"belt", name:{en:"Waist Belt",ar:"حزام الخصر"}, desc:{en:"Fitted belt cinching the waist seam.",ar:"حزام مضبوط يجمع خط الخصر."}, role:"belt", outline:waistbandPc(qw*0.85, 6), grain:[[6,2],[6,4]] },
        { key:"pocketL", name:{en:"Hip Pocket Left",ar:"جيب الورك الأيسر"}, desc:{en:"Curved welt pocket at the left hip.",ar:"جيب مطوي منحنٍ عند الورك الأيسر."}, role:"pocket", outline:pocketPc(11,4.5), grain:[[5,1],[5,3]] },
        { key:"pocketR", name:{en:"Hip Pocket Right",ar:"جيب الورك الأيمن"}, desc:{en:"Curved welt pocket at the right hip.",ar:"جيب مطوي منحنٍ عند الورك الأيمن."}, role:"pocket", outline:pocketPc(11,4.5), grain:[[5,1],[5,3]] },
      ];
    });

  def("wf09", "women", "Belted A-Line Coat Dress", "فستان معطف A بحزام",
    "Coat", "فستان معطف", "coat",
    "A structured coat-dress with a shirt collar, belted waist, and an A-line skirt.",
    "فستان معطف مهيكل بياقة قميص وخصر مربوط بحزام وتنورة بقصة A.",
    (m) => {
      const b = princessBodice(m, { neckline:"round", hipY:m.backLen*0.98+4, hemY:m.backLen*0.98+6 });
      const waistW = q(m.waist), hemLen = m.height*0.55 - b.hemY, hemW = q(m.hips)*1.7;
      const cs = collarStand(m.neck);
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a shirt-style opening.",ar:"مقدمة وسطى بفتحة بطراز القميص."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel joined at the princess seam.",ar:"لوحة جانبية منحنية تلتقي بخط قصة الأميرة."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"collar", name:{en:"Shirt Collar",ar:"ياقة قميص"}, desc:{en:"Two-piece shirt-style collar.",ar:"ياقة قميص من قطعتين."}, role:"collar", outline:cs.collar, grain:[[4,2],[4,5]] },
        { key:"collarStandPc", name:{en:"Collar Stand",ar:"قاعدة الياقة"}, desc:{en:"Standing band beneath the collar.",ar:"شريط واقف أسفل الياقة."}, role:"collar-stand", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Curved-cap set-in sleeve.",ar:"كم مثبّت برأس منحنٍ."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.7), grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.55]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"A-line front gore.",ar:"مروحة أمامية بقصة A."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 4), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"A-line back gore.",ar:"مروحة خلفية بقصة A."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 4), grain:[[4,10],[4,hemLen-10]] },
        { key:"belt", name:{en:"Tie Belt",ar:"حزام يُربط"}, desc:{en:"Self-fabric belt cinching the waist.",ar:"حزام من نفس القماش يجمع الخصر."}, role:"belt", outline:sashPc(waistW*0.4, 45), grain:[[8,2],[30,2]] },
        { key:"pocket", name:{en:"Patch Pocket",ar:"جيب ملصق"}, desc:{en:"Curved patch pocket on the skirt front.",ar:"جيب ملصق منحنٍ على مقدمة التنورة."}, role:"pocket", outline:pocketPc(12,10), grain:[[5,3],[5,7]] },
      ];
    });

  def("wf10", "women", "Halter Slit Evening Gown", "فستان سهرة بياقة حلق وشق",
    "Gown", "فستان سهرة", "gown",
    "A halter-neck gown with a fitted bodice, a thigh-high godet slit, and a train.",
    "فستان سهرة بياقة حلق وصدرية ضيقة وشق حتى الفخذ وذيل خلفي.",
    (m) => {
      const b = princessBodice(m, { neckline:"offshoulder", waistInF:0.82, hipY:m.backLen*0.98+6, hemY:m.backLen*0.98+8 });
      const waistW = q(m.waist), hemLen = m.height*0.88 - b.hemY, hemW = q(m.hips)*1.6;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Fitted center front with a halter tie extension.",ar:"مقدمة ضيقة بامتداد رباط حول الرقبة."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Boned side panel shaping the waist.",ar:"لوحة جانبية مقوّاة تشكّل الخصر."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Low open back panel.",ar:"لوحة خلفية مكشوفة."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Boned back side panel.",ar:"لوحة جانبية خلفية مقوّاة."}, ...b.meta.backSide, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"halterTie", name:{en:"Halter Neck Tie",ar:"رباط الرقبة"}, desc:{en:"Long tie looping behind the neck.",ar:"رباط طويل يلتف خلف الرقبة."}, role:"sash", outline:sashPc(m.neck*0.35, 30), grain:[[6,2],[20,2]] },
        { key:"skirtF", name:{en:"Skirt Front Panel",ar:"مقدمة التنورة"}, desc:{en:"Fitted front panel with the slit opening.",ar:"لوحة أمامية ضيقة بفتحة الشق."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, waistW*0.62, hemLen, 1), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtB", name:{en:"Skirt Back Panel with Train",ar:"خلفية التنورة بذيل"}, desc:{en:"Back panel extending into a soft train.",ar:"لوحة خلفية تمتد إلى ذيل ناعم."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, hemW*0.55, hemLen*1.3, 10), grain:[[4,10],[4,hemLen-6]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore adding fullness.",ar:"مروحة جانبية تضيف اتساعًا."}, role:"skirt-side-gore-left", outline:gorePanel(waistW*0.45, hemW*0.3, hemLen, 7), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore adding fullness.",ar:"مروحة جانبية تضيف اتساعًا."}, role:"skirt-side-gore-right", outline:gorePanel(waistW*0.45, hemW*0.3, hemLen, 7), grain:[[4,10],[4,hemLen-10]] },
        { key:"godet", name:{en:"Slit Godet",ar:"مروحة الشق"}, desc:{en:"Flare insert set behind the slit opening.",ar:"إدراج مروحي خلف فتحة الشق."}, role:"godet", outline:godetPc(q(m.hips)*0.3, hemLen*0.5), grain:[[4,6],[4,hemLen*0.3]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Slim tie sash accenting the waist seam.",ar:"حزام رفيع يبرز خط الخصر."}, role:"sash", outline:sashPc(waistW*0.35, 40), grain:[[6,2],[26,2]] },
      ];
    });

  def("wf11", "women", "Puff-Sleeve Peplum Midi Dress", "فستان ميدي بيبلوم وأكمام منتفخة",
    "Dress", "فستان", "dress",
    "A princess-seam midi dress with statement puff sleeves and a flared peplum waist.",
    "فستان ميدي بقصات أميرة وأكمام منتفخة لافتة وخصر بيبلوم متسع.",
    (m) => {
      const b = princessBodice(m, { neckline:"round", hipY:m.backLen*0.98+2, hemY:m.backLen*0.98+3 });
      const waistW = q(m.waist), hemLen = m.height*0.62 - b.hemY, hemW = q(m.hips)*1.55;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a round neckline.",ar:"مقدمة وسطى بخط رقبة دائري."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"sleeve", name:{en:"Puff Sleeve",ar:"كم منتفخ"}, desc:{en:"Full statement puff sleeve gathered at the cuff.",ar:"كم منتفخ لافت مجمّع عند الأسورة."}, role:"puff-sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.4, 1.7), grain:[[q(m.bicep)*0.6,4],[q(m.bicep)*0.6,m.sleeve*0.32]] },
        { key:"cuff", name:{en:"Sleeve Cuff",ar:"أسورة الكم"}, desc:{en:"Fitted band gathering the puff sleeve.",ar:"شريط ضيق يجمع الكم المنتفخ."}, role:"cuff", outline:cuffPc(q(m.bicep)*0.55), grain:[[3,1],[3,4]] },
        { key:"peplumF", name:{en:"Peplum Front",ar:"بيبلوم أمامي"}, desc:{en:"Flared peplum flounce at the front waist.",ar:"كشكش بيبلوم متسع عند الخصر الأمامي."}, role:"peplum-front", outline:peplumPc(waistW*0.55, 20), grain:[[6,4],[6,15]] },
        { key:"peplumB", name:{en:"Peplum Back",ar:"بيبلوم خلفي"}, desc:{en:"Flared peplum flounce at the back waist.",ar:"كشكش بيبلوم متسع عند الخصر الخلفي."}, role:"peplum-back", outline:peplumPc(waistW*0.5, 18), grain:[[6,4],[6,14]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Straight midi-length front gore.",ar:"مروحة أمامية بطول ميدي مستقيم."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 3), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Straight midi-length back gore.",ar:"مروحة خلفية بطول ميدي مستقيم."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 3), grain:[[4,10],[4,hemLen-10]] },
        { key:"belt", name:{en:"Waist Tie",ar:"رباط الخصر"}, desc:{en:"Thin tie finishing the peplum seam.",ar:"رباط رفيع يُنهي خط البيبلوم."}, role:"sash", outline:sashPc(waistW*0.3, 30), grain:[[5,1.5],[20,1.5]] },
      ];
    });

  def("wf12", "women", "Belted Trench Coat", "معطف ترنش بحزام",
    "Coat", "معطف", "coat",
    "A classic double-breasted trench coat with epaulettes, a storm flap and a tie belt.",
    "معطف ترنش كلاسيكي بصفين من الأزرار وشرائط كتف وغطاء عاصفة وحزام يُربط.",
    (m) => {
      const len = m.backLen*1.65;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.05, closureX:q(m.chest)*0.24 });
      const sl = sleeve2pc(m.bicep, m.sleeve+2);
      return [
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Wide double-breasted front with a storm-flap edge.",ar:"مقدمة عريضة بصفين من الأزرار وحافة غطاء عاصفة."}, role:"front-panel", outline:jb.front, grain:[[4,10],[4,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Long back panel with a center vent.",ar:"لوحة خلفية طويلة بفتحة وسطى."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke for rain coverage.",ar:"كوة كتف منحنية لتغطية إضافية من المطر."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.35, 11), grain:[[5,3],[5,8]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Storm Collar",ar:"ياقة عاصفة"}, desc:{en:"Wide curved collar that folds up against the wind.",ar:"ياقة عريضة منحنية تُطوى ضد الرياح."}, role:"collar", outline:shawlCollar(m.neck*1.05, 20), grain:[[4,4],[4,15]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the front closure.",ar:"بطانة منحنية على حافة الإغلاق الأمامية."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.45), grain:[[4,4],[4,len*0.3]] },
        { key:"epaulette", name:{en:"Shoulder Epaulette",ar:"شريط الكتف"}, desc:{en:"Decorative shoulder tab, buttoned at the collar seam.",ar:"شريط كتف زخرفي يُثبّت بزر عند خط الياقة."}, role:"epaulette", outline:pocketPc(6,2.5), grain:[[3,1],[3,2]] },
        { key:"belt", name:{en:"Tie Belt",ar:"حزام يُربط"}, desc:{en:"Long self-fabric belt with a buckle loop.",ar:"حزام طويل من نفس القماش بحلقة إبزيم."}, role:"belt", outline:waistbandPc(q(m.waist)*0.5, 6), grain:[[6,2],[6,4]] },
        { key:"pocket", name:{en:"Flap Pocket",ar:"جيب بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, role:"pocket", outline:pocketPc(13,5), grain:[[6,1.5],[6,3.5]] },
      ];
    });

  def("wf13", "women", "Ruffled Off-Shoulder Ball Gown", "فستان سهرة بكشكش وكتف مكشوف",
    "Gown", "فستان سهرة", "gown",
    "A romantic ball gown with a ruffled off-shoulder neckline and a tiered tulle-look skirt.",
    "فستان سهرة رومانسي بخط كتف مكشوف مكشكش وتنورة بطبقات تول.",
    (m) => {
      const b = princessBodice(m, { neckline:"offshoulder", hipY:m.backLen*0.98+4, hemY:m.backLen*0.98+6 });
      const waistW = q(m.waist), tierLen = (m.height*0.85 - b.hemY) / 3;
      const t1w = waistW*1.9, t2w = waistW*2.4, t3w = waistW*3.0;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a curved off-shoulder line.",ar:"مقدمة وسطى بخط كتف مكشوف منحنٍ."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel joined at the princess seam.",ar:"لوحة جانبية منحنية تلتقي بخط قصة الأميرة."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"ruffle", name:{en:"Off-Shoulder Ruffle Band",ar:"شريط كشكش الكتف المكشوف"}, desc:{en:"Gathered ruffle draping across both shoulders.",ar:"شريط كشكش مجمّع ينسدل عبر الكتفين."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.22, 1.5), grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.18]] },
        { key:"tier1", name:{en:"Skirt Tier 1",ar:"الطبقة الأولى من التنورة"}, desc:{en:"Top tier gathered at the waist.",ar:"الطبقة العلوية مجمّعة عند الخصر."}, role:"tier", outline:tierPc(t1w, t2w, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"tier2", name:{en:"Skirt Tier 2",ar:"الطبقة الثانية من التنورة"}, desc:{en:"Middle tier.",ar:"الطبقة الوسطى."}, role:"tier", outline:tierPc(t2w, t3w, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"tier3", name:{en:"Skirt Tier 3",ar:"الطبقة الثالثة من التنورة"}, desc:{en:"Hem tier, fullest of the three.",ar:"طبقة الحاشية، الأوسع من الثلاث."}, role:"tier", outline:tierPc(t3w, t3w*1.25, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"godetL", name:{en:"Hem Godet Left",ar:"مروحة الحاشية اليسرى"}, desc:{en:"Flare insert adding fullness at the hem.",ar:"إدراج مروحي يضيف اتساعًا عند الحاشية."}, role:"godet", outline:godetPc(q(m.hips)*0.2, tierLen*1.4), grain:[[3,6],[3,tierLen]] },
        { key:"godetR", name:{en:"Hem Godet Right",ar:"مروحة الحاشية اليمنى"}, desc:{en:"Flare insert adding fullness at the hem.",ar:"إدراج مروحي يضيف اتساعًا عند الحاشية."}, role:"godet", outline:godetPc(q(m.hips)*0.2, tierLen*1.4), grain:[[3,6],[3,tierLen]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Wide sash defining the waist seam.",ar:"حزام عريض يبرز خط الخصر."}, role:"sash", outline:sashPc(waistW*0.5, 55), grain:[[10,2],[40,2]] },
      ];
    });

  def("wf14", "women", "Cape-Back Evening Jumpsuit", "أفرول سهرة بكاب خلفي",
    "Jumpsuit", "أفرول", "suit",
    "A tailored evening jumpsuit with a dramatic detachable-look cape falling from the back.",
    "أفرول سهرة مفصّل بكاب خلفي درامي يبدو قابلًا للفصل، منسدل من الظهر.",
    (m) => {
      const jb = jacketFrontBack(m, m.backLen*0.55, { hemFlareF:0.95 });
      const qw = q(m.waist), qh = q(m.hips);
      const cs = collarStand(m.neck);
      return [
        { key:"front", name:{en:"Bodice Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted halter-adjacent front bodice.",ar:"صدرية أمامية ضيقة قريبة من طراز الحلق."}, role:"front-panel", outline:jb.front, grain:[[3,8],[3,m.backLen*0.4]] },
        { key:"back", name:{en:"Bodice Back",ar:"خلفية الصدرية"}, desc:{en:"Low back panel anchoring the cape.",ar:"لوحة ظهر مكشوفة تُثبّت الكاب."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,8],[3,m.backLen*0.4]] },
        { key:"collar", name:{en:"Standing Collar",ar:"ياقة واقفة"}, desc:{en:"Structured standing collar band.",ar:"شريط ياقة واقف مهيكل."}, role:"collar-stand", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"cape", name:{en:"Draped Back Cape",ar:"كاب خلفي منسدل"}, desc:{en:"Sweeping cape attached at the shoulder seam.",ar:"كاب منسدل مثبّت عند خط الكتف."}, role:"cape-overlay", outline:capePc(q(m.shoulder)*0.95, 60), grain:[[6,6],[6,42]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Wide palazzo-leg front panel.",ar:"لوحة ساق أمامية واسعة بطراز البالاتزو."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam*1.1, true), grain:[[qw*0.3,10],[qw*0.3,m.inseam*0.6]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Wide palazzo-leg back panel.",ar:"لوحة ساق خلفية واسعة بطراز البالاتزو."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam*1.1, false), grain:[[qw*0.3,10],[qw*0.3,m.inseam*0.6]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Tie sash defining the waist.",ar:"حزام يُربط ويبرز الخصر."}, role:"sash", outline:sashPc(qw*0.4, 45), grain:[[8,2],[30,2]] },
        { key:"pocketL", name:{en:"Side Pocket Left",ar:"الجيب الجانبي الأيسر"}, desc:{en:"Hidden side-seam pocket.",ar:"جيب مخفي داخل الخط الجانبي."}, role:"pocket", outline:pocketPc(10,13), grain:[[4,4],[4,9]] },
        { key:"pocketR", name:{en:"Side Pocket Right",ar:"الجيب الجانبي الأيمن"}, desc:{en:"Hidden side-seam pocket.",ar:"جيب مخفي داخل الخط الجانبي."}, role:"pocket", outline:pocketPc(10,13), grain:[[4,4],[4,9]] },
        { key:"facing", name:{en:"Neckline Facing",ar:"بطانة خط الرقبة"}, desc:{en:"Curved facing finishing the front neckline.",ar:"بطانة منحنية لتشطيب خط الرقبة الأمامي."}, role:"lapel-facing", outline:lapelFacing(m.neck*0.7, m.backLen*0.25), grain:[[3,2],[3,m.backLen*0.15]] },
      ];
    });

  def("wf15", "women", "Empire-Waist Bridal Gown", "فستان زفاف بخصر إمبراطوري",
    "Gown", "فستان سهرة", "gown",
    "A bridal gown with an empire waist, long lace-ready sleeves, and a flowing train.",
    "فستان زفاف بخصر إمبراطوري وأكمام طويلة جاهزة للدانتيل وذيل انسيابي.",
    (m) => {
      const b = princessBodice(m, { neckline:"scoop", bustY:m.backLen*0.32, waistY:m.backLen*0.5, hipY:m.backLen*0.98+8, hemY:m.backLen*0.98+10 });
      const waistW = q(m.chest)*0.85, hemLen = m.height*0.95 - b.hemY, hemW = q(m.hips)*2.1;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a raised empire seam.",ar:"مقدمة وسطى بخط خصر إمبراطوري مرتفع."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel joined at the empire seam.",ar:"لوحة جانبية منحنية تلتقي بخط الخصر الإمبراطوري."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel with a button-loop opening.",ar:"لوحة خلفية وسطى بفتحة أزرار وعُرى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"sleeveU", name:{en:"Lace Sleeve Upper",ar:"الكم العلوي المخرّم"}, desc:{en:"Outer long sleeve panel, ready for lace overlay.",ar:"اللوحة الخارجية للكم الطويل، جاهزة لطبقة الدانتيل."}, role:"sleeve-upper", bilateral:true, outline:sleeve2pc(m.bicep, m.sleeve).upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Lace Sleeve Under",ar:"الكم السفلي المخرّم"}, desc:{en:"Inner long sleeve panel.",ar:"اللوحة الداخلية للكم الطويل."}, role:"sleeve-under", bilateral:true, outline:sleeve2pc(m.bicep, m.sleeve).under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore flowing from the empire seam.",ar:"مروحة أمامية تنسدل من خط الخصر الإمبراطوري."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.5, hemW*0.28, hemLen, 8), grain:[[4,10],[4,hemLen-12]] },
        { key:"skirtB", name:{en:"Skirt Back Gore with Train",ar:"مروحة التنورة الخلفية بذيل"}, desc:{en:"Back gore extending into a cathedral train.",ar:"مروحة خلفية تمتد إلى ذيل طويل."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.5, hemW*0.4, hemLen*1.5, 14), grain:[[4,10],[4,hemLen-8]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore adding fullness.",ar:"مروحة جانبية تضيف اتساعًا."}, role:"skirt-side-gore-left", outline:gorePanel(waistW*0.4, hemW*0.32, hemLen, 9), grain:[[4,10],[4,hemLen-12]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore adding fullness.",ar:"مروحة جانبية تضيف اتساعًا."}, role:"skirt-side-gore-right", outline:gorePanel(waistW*0.4, hemW*0.32, hemLen, 9), grain:[[4,10],[4,hemLen-12]] },
        { key:"sash", name:{en:"Empire Sash",ar:"حزام الخصر الإمبراطوري"}, desc:{en:"Delicate sash marking the raised waist seam.",ar:"حزام رقيق يبرز خط الخصر المرتفع."}, role:"sash", outline:sashPc(waistW*0.35, 40), grain:[[6,2],[26,2]] },
      ];
    });

  def("wf16", "women", "Tailored Pantsuit", "بدلة نسائية مفصّلة",
    "Suit", "بدلة", "suit",
    "A sharply tailored blazer and matching straight-leg trousers, fully lined.",
    "بليزر مفصّل بدقة مع بنطلون مستقيم مطابق، مبطّن بالكامل.",
    (m) => {
      const len = m.backLen*1.45;
      const jb = jacketFrontBack(m, len, { hemFlareF:0.98 });
      const sl = sleeve2pc(m.bicep, m.sleeve);
      const qw = q(m.waist), qh = q(m.hips);
      return [
        { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Sharply tailored jacket front.",ar:"مقدمة جاكيت مفصّلة بدقة."}, role:"front-panel", outline:jb.front, grain:[[4,8],[4,len*0.6]] },
        { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored jacket back panel.",ar:"لوحة خلفية مفصّلة للجاكيت."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,8],[4,len*0.6]] },
        { key:"collar", name:{en:"Notch Collar",ar:"ياقة بفتحة"}, desc:{en:"Tailored notch collar.",ar:"ياقة مفصّلة بطراز الفتحة."}, role:"collar", outline:shawlCollar(m.neck, 18), grain:[[4,4],[4,13]] },
        { key:"facing", name:{en:"Lapel Facing",ar:"بطانة الصدر"}, desc:{en:"Curved facing along the lapel roll-line.",ar:"بطانة منحنية على خط انثناء الصدر."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.5), grain:[[4,4],[4,len*0.32]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"backLining", name:{en:"Jacket Back Lining",ar:"بطانة ظهر الجاكيت"}, desc:{en:"Full back body lining.",ar:"بطانة كاملة لظهر الجاكيت."}, role:"lining", outline:jb.back, grain:[[4,8],[4,len*0.6]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Straight-leg front panel with a curved crotch seam.",ar:"لوحة ساق أمامية مستقيمة بخط تفصيل منحنٍ."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,10],[qw*0.3,m.inseam*0.6]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Straight-leg back panel with a curved seat curve.",ar:"لوحة ساق خلفية مستقيمة بمنحنى مقعد."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,10],[qw*0.3,m.inseam*0.6]] },
        { key:"waistband", name:{en:"Trouser Waistband",ar:"حزام خصر البنطلون"}, desc:{en:"Fitted waistband finishing the trouser top.",ar:"حزام خصر مضبوط يُنهي أعلى البنطلون."}, role:"waistband", outline:waistbandPc(qw*0.95, 6), grain:[[6,2],[6,4]] },
        { key:"pocket", name:{en:"Jacket Welt Pocket",ar:"جيب مطوي في الجاكيت"}, desc:{en:"Curved welt pocket at the jacket hip.",ar:"جيب مطوي منحنٍ عند ورك الجاكيت."}, role:"pocket", outline:pocketPc(12,4.5), grain:[[5,1],[5,3]] },
      ];
    });

  // ================= MEN — 10 more professional designs =================

  def("mf07", "men", "Double-Breasted Overcoat", "معطف بصفين من الأزرار",
    "Coat", "معطف", "coat",
    "A long double-breasted overcoat with a wide collar, epaulettes and a tie belt.",
    "معطف طويل بصفين من الأزرار وياقة عريضة وشرائط كتف وحزام يُربط.",
    (m) => {
      const len = m.backLen*1.7;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.05, closureX:q(m.chest)*0.28 });
      const sl = sleeve2pc(m.bicep, m.sleeve+2);
      return [
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Wide double-breasted front panel.",ar:"مقدمة عريضة بصفين من الأزرار."}, role:"front-panel", outline:jb.front, grain:[[4,10],[4,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Long back panel with a center vent.",ar:"لوحة خلفية طويلة بفتحة وسطى."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke reinforcing the back.",ar:"كوة كتف منحنية تعزز الظهر."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.35, 11), grain:[[5,3],[5,8]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Wide Collar",ar:"ياقة عريضة"}, desc:{en:"Wide curved collar that folds up against the wind.",ar:"ياقة عريضة منحنية تُطوى ضد الرياح."}, role:"collar", outline:shawlCollar(m.neck*1.08, 22), grain:[[4,4],[4,16]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the front closure.",ar:"بطانة منحنية على حافة الإغلاق الأمامية."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.45), grain:[[4,4],[4,len*0.3]] },
        { key:"epaulette", name:{en:"Shoulder Epaulette",ar:"شريط الكتف"}, desc:{en:"Decorative shoulder tab, buttoned at the collar seam.",ar:"شريط كتف زخرفي يُثبّت بزر عند خط الياقة."}, role:"epaulette", outline:pocketPc(7,2.5), grain:[[3,1],[3,2]] },
        { key:"belt", name:{en:"Tie Belt",ar:"حزام يُربط"}, desc:{en:"Long self-fabric belt with a buckle loop.",ar:"حزام طويل من نفس القماش بحلقة إبزيم."}, role:"belt", outline:waistbandPc(q(m.waist)*0.55, 7), grain:[[6,2],[6,4]] },
        { key:"pocket", name:{en:"Flap Pocket",ar:"جيب بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, role:"pocket", outline:pocketPc(14,5.5), grain:[[6,1.5],[6,3.5]] },
      ];
    });

  def("mf08", "men", "Four-Pocket Safari Jacket", "جاكيت سفاري بأربعة جيوب",
    "Jacket", "جاكيت", "jacket",
    "A utilitarian safari jacket with four patch pockets, a belted waist and epaulettes.",
    "جاكيت سفاري عملي بأربعة جيوب ملصقة وخصر بحزام وشرائط كتف.",
    (m) => {
      const len = m.backLen*1.15;
      const jb = jacketFrontBack(m, len, { hemFlareF:0.95, closureX:q(m.chest)*0.1 });
      const sl = sleeve2pc(m.bicep, m.sleeve);
      return [
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Front panel with a shirt-style closure.",ar:"مقدمة بإغلاق بطراز القميص."}, role:"front-panel", outline:jb.front, grain:[[3,8],[3,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Back panel with a shoulder yoke seam.",ar:"لوحة خلفية بخط كوة الكتف."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,8],[3,len*0.6]] },
        { key:"collar", name:{en:"Shirt Collar",ar:"ياقة قميص"}, desc:{en:"Curved shirt-style collar.",ar:"ياقة بطراز القميص منحنية."}, role:"collar", outline:collarStand(m.neck).collar, grain:[[4,2],[4,5]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"belt", name:{en:"Waist Belt",ar:"حزام الخصر"}, desc:{en:"Self-fabric belt with a buckle loop.",ar:"حزام من نفس القماش بحلقة إبزيم."}, role:"belt", outline:waistbandPc(q(m.waist)*0.6, 6), grain:[[5,2],[5,4]] },
        { key:"pocketChestL", name:{en:"Chest Pocket Left",ar:"جيب الصدر الأيسر"}, desc:{en:"Flapped patch pocket at the chest.",ar:"جيب صدر ملصق بغطاء."}, role:"pocket", outline:pocketPc(9,4), grain:[[4,1],[4,3]] },
        { key:"pocketChestR", name:{en:"Chest Pocket Right",ar:"جيب الصدر الأيمن"}, desc:{en:"Flapped patch pocket at the chest.",ar:"جيب صدر ملصق بغطاء."}, role:"pocket", outline:pocketPc(9,4), grain:[[4,1],[4,3]] },
        { key:"pocketHipL", name:{en:"Hip Pocket Left",ar:"جيب الورك الأيسر"}, desc:{en:"Large flapped hip pocket.",ar:"جيب ورك كبير بغطاء."}, role:"pocket", outline:pocketPc(12,6), grain:[[5,1.5],[5,4]] },
        { key:"pocketHipR", name:{en:"Hip Pocket Right",ar:"جيب الورك الأيمن"}, desc:{en:"Large flapped hip pocket.",ar:"جيب ورك كبير بغطاء."}, role:"pocket", outline:pocketPc(12,6), grain:[[5,1.5],[5,4]] },
      ];
    });

  def("mf09", "men", "Classic Trench Coat", "معطف ترنش كلاسيكي",
    "Coat", "معطف", "coat",
    "A classic double-breasted trench coat with a storm collar, gun flap and belt.",
    "معطف ترنش كلاسيكي بصفين من الأزرار وياقة عاصفة وغطاء كتف وحزام.",
    (m) => {
      const len = m.backLen*1.6;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.02, closureX:q(m.chest)*0.24 });
      const sl = sleeve2pc(m.bicep, m.sleeve+1);
      return [
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Front panel with a storm-flap edge.",ar:"مقدمة بحافة غطاء عاصفة."}, role:"front-panel", outline:jb.front, grain:[[4,9],[4,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Long back panel with a center vent.",ar:"لوحة خلفية طويلة بفتحة وسطى."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,9],[4,len*0.6]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved yoke for extra rain coverage.",ar:"كوة كتف منحنية لتغطية إضافية من المطر."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.3, 10), grain:[[5,3],[5,7]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Storm Collar",ar:"ياقة عاصفة"}, desc:{en:"Wide curved collar buttoning up to the throat.",ar:"ياقة عريضة منحنية تُغلق حتى الرقبة."}, role:"collar", outline:shawlCollar(m.neck, 20), grain:[[4,4],[4,15]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the closure.",ar:"بطانة منحنية على حافة الإغلاق."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.45), grain:[[4,4],[4,len*0.28]] },
        { key:"epaulette", name:{en:"Shoulder Epaulette",ar:"شريط الكتف"}, desc:{en:"Buttoned shoulder tab.",ar:"شريط كتف بزر."}, role:"epaulette", outline:pocketPc(6,2.5), grain:[[3,1],[3,2]] },
        { key:"belt", name:{en:"Tie Belt",ar:"حزام يُربط"}, desc:{en:"Long belt with a metal buckle loop.",ar:"حزام طويل بحلقة إبزيم معدنية."}, role:"belt", outline:waistbandPc(q(m.waist)*0.5, 6), grain:[[6,2],[6,4]] },
        { key:"pocket", name:{en:"Flap Pocket",ar:"جيب بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, role:"pocket", outline:pocketPc(13,5), grain:[[6,1.5],[6,3.5]] },
      ];
    });

  def("mf10", "men", "Formal Sherwani Coat", "معطف شيرواني رسمي",
    "Coat", "معطف", "coat",
    "A long formal sherwani coat with a Nehru collar and flared side godets.",
    "معطف شيرواني رسمي طويل بياقة نهرو ومروحات اتساع جانبية.",
    (m) => {
      const len = m.backLen*1.85;
      const qc = q(m.chest), qw = q(m.waist);
      const cs = collarStand(m.neck);
      const sl = sleeve2pc(m.bicep, m.sleeve+1);
      return [
        { key:"frontL", name:{en:"Front Left",ar:"المقدمة اليسرى"}, desc:{en:"Left front with the closure curve.",ar:"مقدمة يسرى بمنحنى الإغلاق."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "L"), grain:[[4,10],[4,len*0.6]] },
        { key:"frontR", name:{en:"Front Right",ar:"المقدمة اليمنى"}, desc:{en:"Right front underlapping the closure.",ar:"مقدمة يمنى تحت الإغلاق."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "R"), grain:[[-4,10],[-4,len*0.6]] },
        { key:"back", name:{en:"Back Panel",ar:"لوحة الظهر"}, desc:{en:"Long back panel to the hem.",ar:"لوحة ظهر طويلة حتى الحاشية."}, role:"back-panel", cutOnFold:true, outline:jacketFrontBack(m, len, {hemFlareF:1.05}).back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Nehru Collar",ar:"ياقة نهرو"}, desc:{en:"Standing Nehru-style collar band.",ar:"ياقة واقفة بطراز نهرو."}, role:"collar-stand", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"godetL", name:{en:"Hem Godet Left",ar:"مروحة الحاشية اليسرى"}, desc:{en:"Flare insert at the hem.",ar:"إدراج مروحي عند الحاشية."}, role:"godet", outline:godetPc(q(m.hips)*0.3, len*0.28), grain:[[4,6],[4,len*0.16]] },
        { key:"godetR", name:{en:"Hem Godet Right",ar:"مروحة الحاشية اليمنى"}, desc:{en:"Flare insert at the hem.",ar:"إدراج مروحي عند الحاشية."}, role:"godet", outline:godetPc(q(m.hips)*0.3, len*0.28), grain:[[4,6],[4,len*0.16]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the closure edge.",ar:"بطانة منحنية على حافة الإغلاق."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.4), grain:[[3,3],[3,len*0.25]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket at the hip.",ar:"جيب مطوي منحنٍ عند الورك."}, role:"pocket", outline:pocketPc(10,4), grain:[[4,1],[4,3]] },
      ];
    });

  def("mf11", "men", "Classic Denim Jacket", "جاكيت جينز كلاسيكي",
    "Jacket", "جاكيت", "jacket",
    "A trucker-style denim jacket with a shoulder yoke, chest pockets and a ribbed hem.",
    "جاكيت جينز بطراز تراكر بكوة كتف وجيوب صدر وحاشية من الريب.",
    (m) => {
      const len = m.backLen*0.95;
      const jb = jacketFrontBack(m, len, { hemFlareF:0.92, closureX:q(m.chest)*0.08 });
      const sl = sleeve2pc(m.bicep, m.sleeve-2);
      const cs = collarStand(m.neck);
      return [
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Front panel with a button-front closure.",ar:"مقدمة بإغلاق أزرار أمامي."}, role:"front-panel", outline:jb.front, grain:[[3,7],[3,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Back panel below the shoulder yoke.",ar:"لوحة خلفية أسفل كوة الكتف."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,7],[3,len*0.6]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved western-style shoulder yoke.",ar:"كوة كتف منحنية بطراز غربي."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.25, 9), grain:[[5,3],[5,6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.4]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.4]] },
        { key:"collarBand", name:{en:"Collar Band",ar:"شريط الياقة"}, desc:{en:"Standing collar band.",ar:"شريط ياقة واقف."}, role:"collar-band", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"cuff", name:{en:"Cuff",ar:"الأسورة"}, desc:{en:"Buttoned cuff at the sleeve hem.",ar:"أسورة بزر عند نهاية الكم."}, role:"cuff", outline:cuffPc(q(m.bicep)*0.75), grain:[[3,1],[3,4]] },
        { key:"waistband", name:{en:"Hem Waistband",ar:"حزام الحاشية"}, desc:{en:"Buttoned waistband finishing the hem.",ar:"حزام بزر يُنهي الحاشية."}, role:"waistband", outline:waistbandPc(q(m.waist)*0.9, 7), grain:[[6,2],[6,5]] },
        { key:"pocketChestL", name:{en:"Chest Pocket Left",ar:"جيب الصدر الأيسر"}, desc:{en:"Flapped chest pocket.",ar:"جيب صدر بغطاء."}, role:"pocket", outline:pocketPc(8,3.5), grain:[[4,1],[4,2.5]] },
        { key:"pocketChestR", name:{en:"Chest Pocket Right",ar:"جيب الصدر الأيمن"}, desc:{en:"Flapped chest pocket.",ar:"جيب صدر بغطاء."}, role:"pocket", outline:pocketPc(8,3.5), grain:[[4,1],[4,2.5]] },
        { key:"pocketHip", name:{en:"Hip Welt Pocket",ar:"جيب الورك المطوي"}, desc:{en:"Side-seam welt pocket.",ar:"جيب مطوي عند الخط الجانبي."}, role:"pocket", outline:pocketPc(9,11), grain:[[4,3],[4,7]] },
      ];
    });

  def("mf12", "men", "Pinstripe Three-Piece Suit", "بدلة مخططة من ثلاث قطع",
    "Suit", "بدلة", "suit",
    "A boardroom-ready pinstripe suit — jacket, vest and trousers, fully lined.",
    "بدلة مخططة جاهزة لقاعات الاجتماعات — جاكيت وصدرية وبنطلون، مبطّنة بالكامل.",
    (m) => {
      const jLen = m.backLen*1.55, vLen = m.backLen*1.05;
      const jb = jacketFrontBack(m, jLen, { hemFlareF:1.0 });
      const vb = jacketFrontBack(m, vLen, { hemFlareF:0.9, closureX:q(m.chest)*0.06 });
      const sl = sleeve2pc(m.bicep, m.sleeve);
      const qw = q(m.waist), qh = q(m.hips);
      return [
        { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored pinstripe jacket front.",ar:"مقدمة جاكيت مخططة مفصّلة."}, role:"front-panel", outline:jb.front, grain:[[4,8],[4,jLen*0.6]] },
        { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored jacket back panel.",ar:"لوحة خلفية مفصّلة للجاكيت."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,8],[4,jLen*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Jacket Collar",ar:"ياقة الجاكيت"}, desc:{en:"Notch-ready jacket collar.",ar:"ياقة جاكيت جاهزة للفتحة."}, role:"collar", outline:shawlCollar(m.neck, 20), grain:[[4,4],[4,15]] },
        { key:"facing", name:{en:"Jacket Facing",ar:"بطانة الجاكيت"}, desc:{en:"Curved front facing.",ar:"بطانة أمامية منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck, jLen*0.5), grain:[[4,4],[4,jLen*0.3]] },
        { key:"vestFront", name:{en:"Vest Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted sleeveless vest front.",ar:"مقدمة صدرية ضيقة بلا أكمام."}, role:"front-panel", outline:vb.front, grain:[[2,6],[2,vLen*0.6]] },
        { key:"vestBack", name:{en:"Vest Back",ar:"خلفية الصدرية"}, desc:{en:"Vest back panel.",ar:"لوحة خلفية الصدرية."}, role:"back-panel", cutOnFold:true, outline:vb.back, grain:[[2,6],[2,vLen*0.6]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Front leg panel with a curved crotch seam.",ar:"لوحة الساق الأمامية بخط تفصيل منحنٍ."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,8],[qw*0.3,m.inseam*0.6]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Back leg panel with a curved seat curve.",ar:"لوحة الساق الخلفية بمنحنى مقعد."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,8],[qw*0.3,m.inseam*0.6]] },
        { key:"waistband", name:{en:"Trouser Waistband",ar:"حزام خصر البنطلون"}, desc:{en:"Fitted waistband finishing the trouser top.",ar:"حزام خصر مضبوط يُنهي أعلى البنطلون."}, role:"waistband", outline:waistbandPc(qw*0.95, 6), grain:[[6,2],[6,4]] },
      ];
    });

  def("mf13", "men", "Ribbed Bomber Jacket", "جاكيت بومبر بريب",
    "Jacket", "جاكيت", "jacket",
    "A varsity-style bomber jacket with ribbed collar, cuffs and waistband.",
    "جاكيت بومبر بطراز الفرق الرياضية بياقة وأساور وحزام خصر من الريب.",
    (m) => {
      const len = m.backLen*1.0;
      const jb = jacketFrontBack(m, len, { hemFlareF:0.92, closureX:q(m.chest)*0.08 });
      const sl = sleeve2pc(m.bicep, m.sleeve-2);
      const cs = collarStand(m.neck);
      return [
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Front panel with a zip closure edge.",ar:"مقدمة بحافة إغلاق سحاب."}, role:"front-panel", outline:jb.front, grain:[[3,7],[3,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Back panel gathered to the waistband.",ar:"لوحة خلفية مجمّعة عند حزام الخصر."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,7],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.4]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.4]] },
        { key:"collarBand", name:{en:"Rib Collar Band",ar:"شريط ياقة ريب"}, desc:{en:"Stretch ribbed collar band.",ar:"شريط ياقة مطاطي من الريب."}, role:"collar-band", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff at the sleeve hem.",ar:"أسورة ريب عند نهاية الكم."}, role:"rib-cuff", outline:cuffPc(q(m.bicep)*0.8), grain:[[3,1],[3,4]] },
        { key:"waistband", name:{en:"Rib Waistband",ar:"حزام خصر ريب"}, desc:{en:"Ribbed waistband cinching the hem.",ar:"حزام خصر من الريب يجمع الحاشية."}, role:"waistband", outline:waistbandPc(q(m.waist)*0.9, 7), grain:[[6,2],[6,5]] },
        { key:"placket", name:{en:"Zip Placket Facing",ar:"بطانة فتحة السحاب"}, desc:{en:"Facing strip behind the zip.",ar:"شريط بطانة خلف السحاب."}, role:"placket-facing", outline:lapelFacing(m.neck*0.5, len*0.4), grain:[[2,3],[2,len*0.25]] },
        { key:"pocketChest", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Zippered chest pocket panel.",ar:"لوحة جيب صدر بسحاب."}, role:"pocket", outline:pocketPc(9,3.5), grain:[[4,1],[4,2.5]] },
        { key:"pocketHip", name:{en:"Hip Pocket",ar:"جيب الورك"}, desc:{en:"Zippered hip pocket panel.",ar:"لوحة جيب ورك بسحاب."}, role:"pocket", outline:pocketPc(10,4), grain:[[4,1.5],[4,3]] },
      ];
    });

  def("mf14", "men", "Formal Cape-Back Kandura", "كندورة رسمية بكاب خلفي",
    "Robe", "كندورة", "robe",
    "A floor-length formal kandura with a standing collar and a draped back cape.",
    "كندورة رسمية بطول كامل بياقة واقفة وكاب خلفي منسدل.",
    (m) => {
      const len = m.height*0.86;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.15, closureX:q(m.chest)*0.06 });
      const sl = sleeve2pc(m.bicep, m.sleeve+2);
      const cs = collarStand(m.neck);
      return [
        { key:"front", name:{en:"Kandura Front",ar:"مقدمة الكندورة"}, desc:{en:"Long front panel to the hem.",ar:"مقدمة طويلة حتى الحاشية."}, role:"front-panel", cutOnFold:true, outline:jb.front, grain:[[4,10],[4,len*0.6]] },
        { key:"back", name:{en:"Kandura Back",ar:"خلفية الكندورة"}, desc:{en:"Long back panel to the hem.",ar:"خلفية طويلة حتى الحاشية."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Standing Collar",ar:"ياقة واقفة"}, desc:{en:"Structured standing collar band.",ar:"شريط ياقة واقف مهيكل."}, role:"collar-stand", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the front placket.",ar:"بطانة منحنية على فتحة المقدمة."}, role:"lapel-facing", outline:lapelFacing(m.neck*0.6, len*0.3), grain:[[3,3],[3,len*0.18]] },
        { key:"cuff", name:{en:"Sleeve Cuff",ar:"أسورة الكم"}, desc:{en:"Finishing band at the sleeve hem.",ar:"شريط تشطيب عند نهاية الكم."}, role:"cuff", outline:cuffPc(q(m.bicep)*0.7), grain:[[3,1],[3,4]] },
        { key:"cape", name:{en:"Draped Back Cape",ar:"كاب خلفي منسدل"}, desc:{en:"Ceremonial cape draping from the shoulders.",ar:"كاب احتفالي ينسدل من الكتفين."}, role:"cape-overlay", outline:capePc(q(m.shoulder)*0.9, 50), grain:[[6,6],[6,36]] },
        { key:"pocket", name:{en:"Side Seam Pocket",ar:"جيب الخط الجانبي"}, desc:{en:"Hidden pocket set into the side seam.",ar:"جيب مخفي داخل الخط الجانبي."}, role:"pocket", outline:pocketPc(10,14), grain:[[4,4],[4,10]] },
        { key:"sash", name:{en:"Ceremonial Waist Cord",ar:"حزام خصر احتفالي"}, desc:{en:"Decorative tie cord accenting the waist.",ar:"حزام زخرفي يُربط ويبرز الخصر."}, role:"sash", outline:sashPc(q(m.waist)*0.3, 35), grain:[[6,2],[22,2]] },
      ];
    });

  def("mf15", "men", "Blazer & Vest Combo", "طقم بليزر وصدرية",
    "Suit", "بدلة", "suit",
    "A structured blazer worn over a fitted vest, fully lined at the back.",
    "بليزر مهيكل يُرتدى فوق صدرية ضيقة، مبطّن بالكامل عند الظهر.",
    (m) => {
      const jLen = m.backLen*1.5, vLen = m.backLen*1.02;
      const jb = jacketFrontBack(m, jLen, { hemFlareF:1.0 });
      const vb = jacketFrontBack(m, vLen, { hemFlareF:0.9, closureX:q(m.chest)*0.06 });
      const sl = sleeve2pc(m.bicep, m.sleeve);
      return [
        { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored jacket front.",ar:"مقدمة جاكيت مفصّلة."}, role:"front-panel", outline:jb.front, grain:[[4,8],[4,jLen*0.6]] },
        { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored jacket back panel.",ar:"لوحة خلفية مفصّلة للجاكيت."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,8],[4,jLen*0.6]] },
        { key:"collar", name:{en:"Jacket Collar",ar:"ياقة الجاكيت"}, desc:{en:"Notch-ready jacket collar.",ar:"ياقة جاكيت جاهزة للفتحة."}, role:"collar", outline:shawlCollar(m.neck, 18), grain:[[4,4],[4,13]] },
        { key:"facing", name:{en:"Jacket Facing",ar:"بطانة الجاكيت"}, desc:{en:"Curved front facing.",ar:"بطانة أمامية منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck, jLen*0.5), grain:[[4,4],[4,jLen*0.3]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"vestFront", name:{en:"Vest Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted sleeveless vest front.",ar:"مقدمة صدرية ضيقة بلا أكمام."}, role:"front-panel", outline:vb.front, grain:[[2,6],[2,vLen*0.6]] },
        { key:"vestBack", name:{en:"Vest Back",ar:"خلفية الصدرية"}, desc:{en:"Vest back panel.",ar:"لوحة خلفية الصدرية."}, role:"back-panel", cutOnFold:true, outline:vb.back, grain:[[2,6],[2,vLen*0.6]] },
        { key:"pocket", name:{en:"Jacket Welt Pocket",ar:"جيب مطوي في الجاكيت"}, desc:{en:"Curved welt pocket at the jacket hip.",ar:"جيب مطوي منحنٍ عند ورك الجاكيت."}, role:"pocket", outline:pocketPc(11,4.5), grain:[[5,1],[5,3]] },
        { key:"backLining", name:{en:"Jacket Back Lining",ar:"بطانة ظهر الجاكيت"}, desc:{en:"Full back body lining.",ar:"بطانة كاملة لظهر الجاكيت."}, role:"lining", outline:jb.back, grain:[[4,8],[4,jLen*0.6]] },
      ];
    });

  def("mf16", "men", "Hooded Winter Parka", "معطف شتوي بقبعة",
    "Coat", "معطف", "coat",
    "An insulated winter parka with a two-piece hood, ribbed cuffs and a chest pocket.",
    "معطف شتوي معزول بقبعة من قطعتين وأساور ريب وجيب صدر.",
    (m) => {
      const len = m.backLen*1.55;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.08, closureX:q(m.chest)*0.1 });
      return [
        { key:"front", name:{en:"Parka Front",ar:"مقدمة المعطف"}, desc:{en:"Insulated front panel.",ar:"لوحة أمامية معزولة."}, role:"front-panel", outline:jb.front, grain:[[4,10],[4,len*0.6]] },
        { key:"back", name:{en:"Parka Back",ar:"خلفية المعطف"}, desc:{en:"Insulated back panel.",ar:"لوحة خلفية معزولة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Roomy curved-cap sleeve.",ar:"كم واسع برأس منحنٍ."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep*1.15, m.sleeve, 1.05), grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.7]] },
        { key:"hoodL", name:{en:"Hood Left",ar:"القبعة اليسرى"}, desc:{en:"Left half of the two-piece hood.",ar:"النصف الأيسر من القبعة ذات القطعتين."}, role:"hood", outline:hoodHalf(m.neck*2.15, 34), grain:[[6,4],[6,22]] },
        { key:"hoodR", name:{en:"Hood Right",ar:"القبعة اليمنى"}, desc:{en:"Right half of the two-piece hood.",ar:"النصف الأيمن من القبعة ذات القطعتين."}, role:"hood", outline:hoodHalf(m.neck*2.15, 34), grain:[[6,4],[6,22]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff sealing the sleeve hem.",ar:"أسورة ريب تُغلق نهاية الكم."}, role:"rib-cuff", outline:cuffPc(q(m.bicep)*0.85), grain:[[3,1],[3,4]] },
        { key:"waistband", name:{en:"Ribbed Hem Band",ar:"شريط حاشية من الريب"}, desc:{en:"Ribbed band sealing the coat hem.",ar:"شريط ريب يُغلق حاشية المعطف."}, role:"hem-band", outline:waistbandPc(q(m.waist)*0.98, 7), grain:[[6,2],[6,5]] },
        { key:"pocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Flapped chest pocket.",ar:"جيب صدر بغطاء."}, role:"pocket", outline:pocketPc(11,4.5), grain:[[4,1],[4,3]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke.",ar:"كوة كتف منحنية."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.25, 10), grain:[[5,2],[5,7]] },
        { key:"epaulette", name:{en:"Shoulder Epaulette",ar:"شريط الكتف"}, desc:{en:"Buttoned shoulder tab.",ar:"شريط كتف بزر."}, role:"epaulette", outline:pocketPc(6,2.5), grain:[[3,1],[3,2]] },
      ];
    });

  // ================= GIRLS — 10 more professional designs =================

  def("gf07", "girls", "Kimono-Sleeve Party Dress", "فستان حفلة بأكمام كيمونو",
    "Dress", "فستان", "dress",
    "A wrap-front party dress with wide kimono sleeves over a tiered skirt.",
    "فستان حفلة بمقدمة ملفوفة وأكمام كيمونو عريضة فوق تنورة بطبقات.",
    (m) => {
      const qc = q(m.chest), qw = q(m.waist), bodiceLen = m.backLen*0.85;
      const tierLen = (m.height*0.55 - bodiceLen) / 3;
      const t1w = qw*1.7, t2w = qw*2.05, t3w = qw*2.45;
      return [
        { key:"frontL", name:{en:"Front Wrap Left",ar:"المقدمة الملفوفة اليسرى"}, desc:{en:"Left wrap panel crossing to the opposite hip.",ar:"لوحة ملفوفة يسرى تعبر إلى الورك المقابل."}, role:"front-panel", outline:wrapPanel(qc, qw, bodiceLen, "L"), grain:[[3,6],[3,bodiceLen-8]] },
        { key:"frontR", name:{en:"Front Wrap Right",ar:"المقدمة الملفوفة اليمنى"}, desc:{en:"Right wrap panel crossing to the opposite hip.",ar:"لوحة ملفوفة يمنى تعبر إلى الورك المقابل."}, role:"front-panel", outline:wrapPanel(qc, qw, bodiceLen, "R"), grain:[[-3,6],[-3,bodiceLen-8]] },
        { key:"back", name:{en:"Bodice Back",ar:"خلفية الصدرية"}, desc:{en:"Curved back bodice panel.",ar:"لوحة خلفية منحنية للصدرية."}, role:"back-panel", cutOnFold:true, outline:[[0,0],[qc*0.95,2],...qBez([qc*0.95,2],[qc*1.0,bodiceLen*0.5],[qw*0.85,bodiceLen],8),[0,bodiceLen]], grain:[[3,6],[3,bodiceLen-8]] },
        { key:"sleeve", name:{en:"Kimono Sleeve",ar:"كم كيمونو"}, desc:{en:"Wide flowing kimono-style sleeve.",ar:"كم واسع انسيابي بطراز الكيمونو."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.5, 1.8), grain:[[q(m.bicep)*0.6,3],[q(m.bicep)*0.6,m.sleeve*0.4]] },
        { key:"facing", name:{en:"Neckline Facing",ar:"بطانة خط الرقبة"}, desc:{en:"Curved facing strip finishing the wrap neckline.",ar:"شريط بطانة منحنٍ لتشطيب خط الرقبة الملفوف."}, role:"lapel-facing", outline:[[0,0],...qBez([0,0],[qc*0.4,3],[qc*0.8,1],6),[qc*0.8,5],[0,5]], grain:[[3,2],[qc*0.5,2]] },
        { key:"tier1", name:{en:"Skirt Tier 1",ar:"الطبقة الأولى من التنورة"}, desc:{en:"Top tier gathered at the waist.",ar:"الطبقة العلوية مجمّعة عند الخصر."}, role:"tier", outline:tierPc(t1w, t2w, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"tier2", name:{en:"Skirt Tier 2",ar:"الطبقة الثانية من التنورة"}, desc:{en:"Middle tier.",ar:"الطبقة الوسطى."}, role:"tier", outline:tierPc(t2w, t3w, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"tier3", name:{en:"Skirt Tier 3",ar:"الطبقة الثالثة من التنورة"}, desc:{en:"Hem tier, fullest of the three.",ar:"طبقة الحاشية، الأوسع من الثلاث."}, role:"tier", outline:tierPc(t3w, t3w*1.25, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"sash", name:{en:"Wrap Tie",ar:"رباط الالتفاف"}, desc:{en:"Bow tie securing the wrap closure.",ar:"رباط بفيونكة لتثبيت الإغلاق الملفوف."}, role:"wrap-tie", outline:sashPc(qw*0.3, 38), grain:[[6,1.5],[24,1.5]] },
        { key:"pocket", name:{en:"Side Seam Pocket",ar:"جيب خط الجانب"}, desc:{en:"Hidden pocket set into the skirt side seam.",ar:"جيب مخفي داخل خط جانب التنورة."}, role:"pocket", outline:pocketPc(8,10), grain:[[3,3],[3,7]] },
      ];
    });

  def("gf08", "girls", "Ruffled Off-Shoulder Party Gown", "فستان حفلة بكشكش وكتف مكشوف",
    "Gown", "فستان سهرة", "gown",
    "A party gown with a ruffled off-shoulder neckline and a full tiered skirt.",
    "فستان حفلة بخط كتف مكشوف مكشكش وتنورة كاملة بطبقات.",
    (m) => {
      const b = princessBodice(m, { neckline:"offshoulder", hipY:m.backLen*0.9+4, hemY:m.backLen*0.9+6 });
      const waistW = q(m.waist), tierLen = (m.height*0.6 - b.hemY) / 3;
      const t1w = waistW*1.85, t2w = waistW*2.3, t3w = waistW*2.85;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a curved off-shoulder line.",ar:"مقدمة وسطى بخط كتف مكشوف منحنٍ."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"ruffle", name:{en:"Off-Shoulder Ruffle Band",ar:"شريط كشكش الكتف المكشوف"}, desc:{en:"Gathered ruffle draping across both shoulders.",ar:"شريط كشكش مجمّع ينسدل عبر الكتفين."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.2, 1.4), grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.16]] },
        { key:"tier1", name:{en:"Skirt Tier 1",ar:"الطبقة الأولى من التنورة"}, desc:{en:"Top tier gathered at the waist.",ar:"الطبقة العلوية مجمّعة عند الخصر."}, role:"tier", outline:tierPc(t1w, t2w, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"tier2", name:{en:"Skirt Tier 2",ar:"الطبقة الثانية من التنورة"}, desc:{en:"Middle tier.",ar:"الطبقة الوسطى."}, role:"tier", outline:tierPc(t2w, t3w, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"tier3", name:{en:"Skirt Tier 3",ar:"الطبقة الثالثة من التنورة"}, desc:{en:"Hem tier, fullest of the three.",ar:"طبقة الحاشية، الأوسع من الثلاث."}, role:"tier", outline:tierPc(t3w, t3w*1.2, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"godetL", name:{en:"Hem Godet Left",ar:"مروحة الحاشية اليسرى"}, desc:{en:"Flare insert adding fullness at the hem.",ar:"إدراج مروحي يضيف اتساعًا عند الحاشية."}, role:"godet", outline:godetPc(q(m.hips)*0.18, tierLen*1.3), grain:[[3,5],[3,tierLen]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Bow sash tying at the back.",ar:"حزام بفيونكة يُربط خلفيًا."}, role:"sash", outline:sashPc(waistW*0.4, 34), grain:[[6,1.5],[21,1.5]] },
      ];
    });

  def("gf09", "girls", "Structured Winter Coat with Hood", "معطف شتوي مهيكل بقبعة",
    "Coat", "معطف", "coat",
    "A cozy hooded winter coat with a two-piece hood and a ribbed hem band.",
    "معطف شتوي دافئ بقبعة من قطعتين وشريط حاشية من الريب.",
    (m) => {
      const len = m.backLen*1.35;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.1, closureX:q(m.chest)*0.1 });
      return [
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Insulated front panel.",ar:"لوحة أمامية معزولة."}, role:"front-panel", outline:jb.front, grain:[[3,8],[3,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Insulated back panel.",ar:"لوحة خلفية معزولة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,8],[3,len*0.6]] },
        { key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Roomy curved-cap sleeve.",ar:"كم واسع برأس منحنٍ."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep*1.1, m.sleeve, 1.05), grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.7]] },
        { key:"hoodL", name:{en:"Hood Left",ar:"القبعة اليسرى"}, desc:{en:"Left half of the two-piece hood.",ar:"النصف الأيسر من القبعة ذات القطعتين."}, role:"hood", outline:hoodHalf(m.neck*2.0, 28), grain:[[5,4],[5,18]] },
        { key:"hoodR", name:{en:"Hood Right",ar:"القبعة اليمنى"}, desc:{en:"Right half of the two-piece hood.",ar:"النصف الأيمن من القبعة ذات القطعتين."}, role:"hood", outline:hoodHalf(m.neck*2.0, 28), grain:[[5,4],[5,18]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff sealing the sleeve hem.",ar:"أسورة ريب تُغلق نهاية الكم."}, role:"rib-cuff", outline:cuffPc(q(m.bicep)*0.85), grain:[[3,1],[3,4]] },
        { key:"waistband", name:{en:"Ribbed Hem Band",ar:"شريط حاشية من الريب"}, desc:{en:"Ribbed band sealing the coat hem.",ar:"شريط ريب يُغلق حاشية المعطف."}, role:"hem-band", outline:waistbandPc(q(m.waist)*0.95, 6), grain:[[5,2],[5,4]] },
        { key:"pocket", name:{en:"Patch Pocket",ar:"جيب ملصق"}, desc:{en:"Curved patch pocket.",ar:"جيب ملصق منحنٍ."}, role:"pocket", outline:pocketPc(9,3.5), grain:[[4,1],[4,2.5]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke.",ar:"كوة كتف منحنية."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.2, 9), grain:[[4,2],[4,6]] },
        { key:"epaulette", name:{en:"Shoulder Tab",ar:"شريط الكتف"}, desc:{en:"Decorative buttoned shoulder tab.",ar:"شريط كتف زخرفي بزر."}, role:"epaulette", outline:pocketPc(5,2), grain:[[2,1],[2,1.5]] },
      ];
    });

  def("gf10", "girls", "Ballerina Tutu Dress", "فستان باليرينا توتو",
    "Gown", "فستان سهرة", "gown",
    "A ballerina-inspired dress with a fitted princess bodice and four layered tulle-look tiers.",
    "فستان مستوحى من الباليرينا بصدرية أميرة ضيقة وأربع طبقات تول متراصة.",
    (m) => {
      const b = princessBodice(m, { neckline:"round", hipY:m.backLen*0.85+3, hemY:m.backLen*0.85+5 });
      const waistW = q(m.waist), tierLen = (m.height*0.5 - b.hemY) / 4;
      const widths = [waistW*1.9, waistW*2.3, waistW*2.7, waistW*3.2];
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Fitted center front panel.",ar:"مقدمة وسطى ضيقة."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,7],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[3,7],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,7],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[3,7],[3,b.hemY-3]] },
        { key:"sleeve", name:{en:"Cap Sleeve",ar:"كم قصير"}, desc:{en:"Tiny curved cap sleeve.",ar:"كم قصير صغير منحنٍ."}, role:"cap-sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.2, 1.0), grain:[[q(m.bicep)*0.5,2],[q(m.bicep)*0.5,m.sleeve*0.16]] },
        { key:"tier1", name:{en:"Tutu Tier 1",ar:"طبقة التوتو الأولى"}, desc:{en:"Top tulle-look tier.",ar:"الطبقة العلوية بمظهر التول."}, role:"tier", outline:tierPc(widths[0], widths[1], tierLen), grain:[[4,3],[4,tierLen-3]] },
        { key:"tier2", name:{en:"Tutu Tier 2",ar:"طبقة التوتو الثانية"}, desc:{en:"Second tulle-look tier.",ar:"الطبقة الثانية بمظهر التول."}, role:"tier", outline:tierPc(widths[1], widths[2], tierLen), grain:[[4,3],[4,tierLen-3]] },
        { key:"tier3", name:{en:"Tutu Tier 3",ar:"طبقة التوتو الثالثة"}, desc:{en:"Third tulle-look tier.",ar:"الطبقة الثالثة بمظهر التول."}, role:"tier", outline:tierPc(widths[2], widths[3], tierLen), grain:[[4,3],[4,tierLen-3]] },
        { key:"tier4", name:{en:"Tutu Tier 4",ar:"طبقة التوتو الرابعة"}, desc:{en:"Fullest hem tier.",ar:"طبقة الحاشية الأوسع."}, role:"tier", outline:tierPc(widths[3], widths[3]*1.3, tierLen), grain:[[4,3],[4,tierLen-3]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Bow sash at the waist seam.",ar:"حزام بفيونكة عند خط الخصر."}, role:"sash", outline:sashPc(waistW*0.35, 30), grain:[[5,1.5],[19,1.5]] },
      ];
    });

  def("gf11", "girls", "Cape-Sleeve Formal Dress", "فستان رسمي بكم كاب",
    "Dress", "فستان", "dress",
    "A formal princess-seam dress with a curved cape sleeve and a soft gored skirt.",
    "فستان رسمي بقصات أميرة وكم كاب منحنٍ وتنورة مروحية ناعمة.",
    (m) => {
      const b = princessBodice(m, { neckline:"scoop", hipY:m.backLen*0.88+3, hemY:m.backLen*0.88+5 });
      const waistW = q(m.waist), hemLen = m.height*0.58 - b.hemY, hemW = q(m.hips)*1.75;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel.",ar:"لوحة المقدمة الوسطى."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,7],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[3,7],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,7],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[3,7],[3,b.hemY-3]] },
        { key:"capeSleeveL", name:{en:"Cape Sleeve Left",ar:"كم الكاب الأيسر"}, desc:{en:"Curved cape-style sleeve panel.",ar:"لوحة كم بطراز الكاب منحنية."}, role:"cape-sleeve", outline:capePc(q(m.shoulder)*0.32, 20), grain:[[3,3],[3,14]] },
        { key:"capeSleeveR", name:{en:"Cape Sleeve Right",ar:"كم الكاب الأيمن"}, desc:{en:"Curved cape-style sleeve panel.",ar:"لوحة كم بطراز الكاب منحنية."}, role:"cape-sleeve", outline:capePc(q(m.shoulder)*0.32, 20), grain:[[3,3],[3,14]] },
        { key:"facing", name:{en:"Neckline Facing",ar:"بطانة خط الرقبة"}, desc:{en:"Curved facing finishing the neckline.",ar:"بطانة منحنية لتشطيب خط الرقبة."}, role:"lapel-facing", outline:[[0,0],...qBez([0,0],[m.neck*0.28,3],[m.neck*0.49,1],6),[m.neck*0.49,5],[0,5]], grain:[[3,2],[m.neck*0.28,2]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore.",ar:"مروحة أمامية."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 5), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore.",ar:"مروحة خلفية."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 5), grain:[[3,8],[3,hemLen-8]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Bow sash at the waist.",ar:"حزام بفيونكة عند الخصر."}, role:"sash", outline:sashPc(waistW*0.4, 32), grain:[[6,1.5],[20,1.5]] },
      ];
    });

  def("gf12", "girls", "Puff-Sleeve Godet Ballgown", "فستان سهرة بأكمام منتفخة ومروحات",
    "Gown", "فستان سهرة", "gown",
    "A ballgown with puffed sleeves, a wide sash, and flare godets adding fullness at the hem.",
    "فستان سهرة بأكمام منتفخة وحزام عريض ومروحات اتساع عند الحاشية.",
    (m) => {
      const b = princessBodice(m, { neckline:"round", hipY:m.backLen*0.88+3, hemY:m.backLen*0.88+5 });
      const waistW = q(m.waist), hemLen = m.height*0.58 - b.hemY;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel.",ar:"لوحة المقدمة الوسطى."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,7],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[3,7],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,7],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[3,7],[3,b.hemY-3]] },
        { key:"sleeve", name:{en:"Puff Sleeve",ar:"كم منتفخ"}, desc:{en:"Full puffed sleeve gathered at the cuff.",ar:"كم منتفخ مجمّع عند الأسورة."}, role:"puff-sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.35, 1.6), grain:[[q(m.bicep)*0.6,3],[q(m.bicep)*0.6,m.sleeve*0.28]] },
        { key:"cuff", name:{en:"Sleeve Cuff",ar:"أسورة الكم"}, desc:{en:"Fitted band gathering the puff sleeve.",ar:"شريط ضيق يجمع الكم المنتفخ."}, role:"cuff", outline:cuffPc(q(m.bicep)*0.5), grain:[[2,1],[2,3]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore.",ar:"مروحة أمامية."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.55, waistW*0.65, hemLen, 3), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore.",ar:"مروحة خلفية."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.55, waistW*0.65, hemLen, 3), grain:[[3,8],[3,hemLen-8]] },
        { key:"godetL", name:{en:"Flare Godet Left",ar:"مروحة اتساع يسرى"}, desc:{en:"Triangular flare insert at the side hem.",ar:"إدراج مروحي مثلث عند الحاشية الجانبية."}, role:"godet", outline:godetPc(q(m.hips)*0.22, hemLen*0.6), grain:[[3,5],[3,hemLen*0.4]] },
        { key:"godetR", name:{en:"Flare Godet Right",ar:"مروحة اتساع يمنى"}, desc:{en:"Triangular flare insert at the side hem.",ar:"إدراج مروحي مثلث عند الحاشية الجانبية."}, role:"godet", outline:godetPc(q(m.hips)*0.22, hemLen*0.6), grain:[[3,5],[3,hemLen*0.4]] },
        { key:"sash", name:{en:"Wide Waist Sash",ar:"حزام خصر عريض"}, desc:{en:"Wide sash tying at the back.",ar:"حزام عريض يُربط خلفيًا."}, role:"sash", outline:sashPc(waistW*0.5, 42), grain:[[7,2],[26,2]] },
      ];
    });

  def("gf13", "girls", "Peplum Jumpsuit", "أفرول بيبلوم",
    "Jumpsuit", "أفرول", "suit",
    "A dressy jumpsuit with a fitted collared bodice, a flared peplum waist, and wide-leg trousers.",
    "أفرول أنيق بصدرية ضيقة بياقة وخصر بيبلوم متسع وبنطلون واسع الساق.",
    (m) => {
      const jb = jacketFrontBack(m, m.backLen*0.5, { hemFlareF:0.95 });
      const qw = q(m.waist), qh = q(m.hips);
      const cs = collarStand(m.neck);
      return [
        { key:"front", name:{en:"Bodice Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted front bodice with a collared neckline.",ar:"صدرية أمامية ضيقة بخط رقبة مع ياقة."}, role:"front-panel", outline:jb.front, grain:[[3,7],[3,m.backLen*0.35]] },
        { key:"back", name:{en:"Bodice Back",ar:"خلفية الصدرية"}, desc:{en:"Fitted back bodice panel.",ar:"لوحة خلفية ضيقة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,7],[3,m.backLen*0.35]] },
        { key:"collar", name:{en:"Peter Pan Collar",ar:"ياقة بيتر بان"}, desc:{en:"Rounded curved collar.",ar:"ياقة مدورة منحنية."}, role:"collar", outline:collarStand(m.neck).collar, grain:[[3,2],[3,5]] },
        { key:"facing", name:{en:"Neckline Facing",ar:"بطانة خط الرقبة"}, desc:{en:"Curved facing finishing the collar seam.",ar:"بطانة منحنية لتشطيب خط الياقة."}, role:"lapel-facing", outline:[[0,0],...qBez([0,0],[m.neck*0.24,3],[m.neck*0.42,1],6),[m.neck*0.42,5],[0,5]], grain:[[3,2],[m.neck*0.24,2]] },
        { key:"peplumF", name:{en:"Peplum Front",ar:"بيبلوم أمامي"}, desc:{en:"Flared peplum flounce at the front waist.",ar:"كشكش بيبلوم متسع عند الخصر الأمامي."}, role:"peplum-front", outline:peplumPc(qw*0.5, 16), grain:[[5,3],[5,11]] },
        { key:"peplumB", name:{en:"Peplum Back",ar:"بيبلوم خلفي"}, desc:{en:"Flared peplum flounce at the back waist.",ar:"كشكش بيبلوم متسع عند الخصر الخلفي."}, role:"peplum-back", outline:peplumPc(qw*0.48, 15), grain:[[5,3],[5,10]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Wide-leg front panel.",ar:"لوحة ساق أمامية واسعة."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,6],[qw*0.3,m.inseam*0.5]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Wide-leg back panel.",ar:"لوحة ساق خلفية واسعة."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,6],[qw*0.3,m.inseam*0.5]] },
        { key:"sash", name:{en:"Waist Tie",ar:"رباط الخصر"}, desc:{en:"Thin tie finishing the peplum seam.",ar:"رباط رفيع يُنهي خط البيبلوم."}, role:"sash", outline:sashPc(qw*0.3, 26), grain:[[4,1.5],[16,1.5]] },
        { key:"pocket", name:{en:"Side Pocket",ar:"الجيب الجانبي"}, desc:{en:"Hidden side-seam pocket on the trouser.",ar:"جيب مخفي داخل الخط الجانبي للبنطلون."}, role:"pocket", outline:pocketPc(8,10), grain:[[3,3],[3,7]] },
      ];
    });

  def("gf14", "girls", "Pinafore Coat Dress", "فستان معطف صدارية",
    "Coat", "فستان معطف", "coat",
    "A pinafore-style coat dress with a wide collar, patch pockets and a flared peplum hem.",
    "فستان معطف بطراز الصدارية بياقة عريضة وجيوب ملصقة وحاشية بيبلوم متسعة.",
    (m) => {
      const qc = q(m.chest), qw = q(m.waist), len = m.backLen*1.15;
      const cs = collarStand(m.neck);
      return [
        { key:"frontL", name:{en:"Front Left",ar:"المقدمة اليسرى"}, desc:{en:"Left front closure panel.",ar:"لوحة إغلاق يسرى."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "L"), grain:[[3,7],[3,len*0.55]] },
        { key:"frontR", name:{en:"Front Right",ar:"المقدمة اليمنى"}, desc:{en:"Right front underlapping panel.",ar:"لوحة يمنى تحت الإغلاق."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "R"), grain:[[-3,7],[-3,len*0.55]] },
        { key:"back", name:{en:"Back Panel",ar:"لوحة الظهر"}, desc:{en:"Curved back panel.",ar:"لوحة ظهر منحنية."}, role:"back-panel", cutOnFold:true, outline:jacketFrontBack(m, len, {hemFlareF:1.0}).back, grain:[[3,7],[3,len*0.55]] },
        { key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Curved-cap sleeve.",ar:"كم برأس منحنٍ."}, role:"sleeve", bilateral:true, outline:sleeve1pc(m.bicep, m.sleeve*0.8), grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.65]] },
        { key:"collar", name:{en:"Wide Collar",ar:"ياقة عريضة"}, desc:{en:"Wide rounded collar piece.",ar:"قطعة ياقة عريضة مدورة."}, role:"collar", outline:cs.collar, grain:[[3,2],[3,5]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the front closure.",ar:"بطانة منحنية على حافة الإغلاق الأمامية."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.4), grain:[[3,3],[3,len*0.25]] },
        { key:"peplumF", name:{en:"Peplum Front",ar:"بيبلوم أمامي"}, desc:{en:"Flared peplum at the front waist.",ar:"بيبلوم متسع عند الخصر الأمامي."}, role:"peplum-front", outline:peplumPc(qw*0.5, 15), grain:[[4,3],[4,10]] },
        { key:"peplumB", name:{en:"Peplum Back",ar:"بيبلوم خلفي"}, desc:{en:"Flared peplum at the back waist.",ar:"بيبلوم متسع عند الخصر الخلفي."}, role:"peplum-back", outline:peplumPc(qw*0.48, 14), grain:[[4,3],[4,9]] },
        { key:"pocketL", name:{en:"Patch Pocket Left",ar:"الجيب الملصق الأيسر"}, desc:{en:"Curved patch pocket.",ar:"جيب ملصق منحنٍ."}, role:"pocket", outline:pocketPc(8,7), grain:[[3,2],[3,5]] },
        { key:"pocketR", name:{en:"Patch Pocket Right",ar:"الجيب الملصق الأيمن"}, desc:{en:"Curved patch pocket.",ar:"جيب ملصق منحنٍ."}, role:"pocket", outline:pocketPc(8,7), grain:[[3,2],[3,5]] },
      ];
    });

  def("gf15", "girls", "Empire-Waist Flower-Girl Gown", "فستان طفلة الزهور بخصر إمبراطوري",
    "Gown", "فستان سهرة", "gown",
    "A flower-girl gown with a raised empire waist, long sleeves and a soft flowing skirt.",
    "فستان طفلة الزهور بخصر إمبراطوري مرتفع وأكمام طويلة وتنورة انسيابية ناعمة.",
    (m) => {
      const b = princessBodice(m, { neckline:"scoop", bustY:m.backLen*0.3, waistY:m.backLen*0.45, hipY:m.backLen*0.85+4, hemY:m.backLen*0.85+6 });
      const waistW = q(m.chest)*0.85, hemLen = m.height*0.55 - b.hemY, hemW = q(m.hips)*1.9;
      return [
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a raised empire seam.",ar:"مقدمة وسطى بخط خصر إمبراطوري مرتفع."}, ...b.meta.frontCenter, outline:b.frontCenter, grain:[[2,7],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, ...b.meta.frontSide, outline:b.frontSide, grain:[[3,7],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel with a button-loop opening.",ar:"لوحة خلفية وسطى بفتحة أزرار وعُرى."}, ...b.meta.backCenter, outline:b.backCenter, grain:[[2,7],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, ...b.meta.backSide, outline:b.backSide, grain:[[3,7],[3,b.hemY-3]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer long sleeve panel.",ar:"اللوحة الخارجية للكم الطويل."}, role:"sleeve-upper", bilateral:true, outline:sleeve2pc(m.bicep, m.sleeve).upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner long sleeve panel.",ar:"اللوحة الداخلية للكم الطويل."}, role:"sleeve-under", bilateral:true, outline:sleeve2pc(m.bicep, m.sleeve).under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore flowing from the empire seam.",ar:"مروحة أمامية تنسدل من خط الخصر الإمبراطوري."}, role:"skirt-front-gore", outline:gorePanel(waistW*0.5, hemW*0.3, hemLen, 5), grain:[[3,8],[3,hemLen-9]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore flowing from the empire seam.",ar:"مروحة خلفية تنسدل من خط الخصر الإمبراطوري."}, role:"skirt-back-gore", outline:gorePanel(waistW*0.5, hemW*0.32, hemLen, 5), grain:[[3,8],[3,hemLen-9]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore adding fullness.",ar:"مروحة جانبية تضيف اتساعًا."}, role:"skirt-side-gore-left", outline:gorePanel(waistW*0.4, hemW*0.32, hemLen, 6), grain:[[3,8],[3,hemLen-9]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore adding fullness.",ar:"مروحة جانبية تضيف اتساعًا."}, role:"skirt-side-gore-right", outline:gorePanel(waistW*0.4, hemW*0.32, hemLen, 6), grain:[[3,8],[3,hemLen-9]] },
        { key:"sash", name:{en:"Empire Sash",ar:"حزام الخصر الإمبراطوري"}, desc:{en:"Delicate sash marking the raised waist seam.",ar:"حزام رقيق يبرز خط الخصر المرتفع."}, role:"sash", outline:sashPc(waistW*0.35, 34), grain:[[5,1.5],[22,1.5]] },
      ];
    });

  def("gf16", "girls", "Structured Blazer Party Dress", "فستان حفلة ببليزر مهيكل",
    "Dress", "فستان", "dress",
    "A blazer-front party dress with a tailored collar and a flared peplum hem.",
    "فستان حفلة بمقدمة بليزر وياقة مفصّلة وحاشية بيبلوم متسعة.",
    (m) => {
      const jb = jacketFrontBack(m, m.backLen*0.5, { hemFlareF:1.0 });
      const waistW = q(m.waist);
      return [
        { key:"front", name:{en:"Bodice Front",ar:"مقدمة الصدرية"}, desc:{en:"Structured front with a tailored closure.",ar:"مقدمة مهيكلة بإغلاق مفصّل."}, role:"front-panel", outline:jb.front, grain:[[3,7],[3,m.backLen*0.35]] },
        { key:"back", name:{en:"Bodice Back",ar:"خلفية الصدرية"}, desc:{en:"Tailored back panel.",ar:"لوحة خلفية مفصّلة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,7],[3,m.backLen*0.35]] },
        { key:"collar", name:{en:"Shawl Collar",ar:"ياقة شال"}, desc:{en:"Curved shawl collar.",ar:"ياقة شال منحنية."}, role:"collar", outline:shawlCollar(m.neck, 13), grain:[[3,3],[3,10]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved lapel facing.",ar:"بطانة صدر منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck, m.backLen*0.4), grain:[[3,3],[3,m.backLen*0.25]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sleeve2pc(m.bicep, m.sleeve).upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sleeve2pc(m.bicep, m.sleeve).under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"peplumF", name:{en:"Peplum Front",ar:"بيبلوم أمامي"}, desc:{en:"Flared peplum flounce at the front waist.",ar:"كشكش بيبلوم متسع عند الخصر الأمامي."}, role:"peplum-front", outline:peplumPc(waistW*0.55, 18), grain:[[5,3],[5,13]] },
        { key:"peplumB", name:{en:"Peplum Back",ar:"بيبلوم خلفي"}, desc:{en:"Flared peplum flounce at the back waist.",ar:"كشكش بيبلوم متسع عند الخصر الخلفي."}, role:"peplum-back", outline:peplumPc(waistW*0.5, 16), grain:[[5,3],[5,12]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket.",ar:"جيب مطوي منحني."}, role:"pocket", outline:pocketPc(8,3.5), grain:[[3,1],[3,2.5]] },
        { key:"belt", name:{en:"Waist Tie",ar:"رباط الخصر"}, desc:{en:"Thin tie finishing the peplum seam.",ar:"رباط رفيع يُنهي خط البيبلوم."}, role:"sash", outline:sashPc(waistW*0.3, 26), grain:[[4,1.5],[16,1.5]] },
      ];
    });

  // ================= BOYS — 10 more professional designs =================

  def("bf07", "boys", "Formal Waistcoat & Trouser Set", "طقم صدرية وبنطلون رسمي",
    "Suit", "بدلة", "suit",
    "A formal waistcoat and matching trousers, fully lined, with a shirt collar.",
    "صدرية رسمية وبنطلون مطابق، مبطّنة بالكامل، بياقة قميص.",
    (m) => {
      const vLen = m.backLen*1.0;
      const vb = jacketFrontBack(m, vLen, { hemFlareF:0.9, closureX:q(m.chest)*0.06 });
      const qw = q(m.waist), qh = q(m.hips);
      const cs = collarStand(m.neck);
      return [
        { key:"vestFront", name:{en:"Vest Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted sleeveless vest front.",ar:"مقدمة صدرية ضيقة بلا أكمام."}, role:"front-panel", outline:vb.front, grain:[[2,6],[2,vLen*0.6]] },
        { key:"vestBack", name:{en:"Vest Back",ar:"خلفية الصدرية"}, desc:{en:"Vest back panel.",ar:"لوحة خلفية الصدرية."}, role:"back-panel", cutOnFold:true, outline:vb.back, grain:[[2,6],[2,vLen*0.6]] },
        { key:"backLining", name:{en:"Vest Back Lining",ar:"بطانة ظهر الصدرية"}, desc:{en:"Satin-ready back lining panel.",ar:"لوحة بطانة ظهر جاهزة للساتان."}, role:"lining", outline:vb.back, grain:[[2,6],[2,vLen*0.6]] },
        { key:"collar", name:{en:"Shirt Collar",ar:"ياقة قميص"}, desc:{en:"Curved shirt-style collar.",ar:"ياقة بطراز القميص منحنية."}, role:"collar", outline:cs.collar, grain:[[3,2],[3,5]] },
        { key:"collarStandPc", name:{en:"Collar Stand",ar:"قاعدة الياقة"}, desc:{en:"Standing band beneath the collar.",ar:"شريط واقف أسفل الياقة."}, role:"collar-stand", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"facing", name:{en:"Vest Facing",ar:"بطانة الصدرية"}, desc:{en:"Curved facing along the vest opening.",ar:"بطانة منحنية على فتحة الصدرية."}, role:"lapel-facing", outline:lapelFacing(m.neck*0.7, vLen*0.5), grain:[[2,3],[2,vLen*0.3]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket at the vest hem.",ar:"جيب مطوي منحنٍ عند حاشية الصدرية."}, role:"pocket", outline:pocketPc(7,2.5), grain:[[3,1],[3,2]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Front leg panel with a curved crotch seam.",ar:"لوحة الساق الأمامية بخط تفصيل منحنٍ."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,6],[qw*0.3,m.inseam*0.5]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Back leg panel with a curved seat curve.",ar:"لوحة الساق الخلفية بمنحنى مقعد."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,6],[qw*0.3,m.inseam*0.5]] },
        { key:"waistband", name:{en:"Trouser Waistband",ar:"حزام خصر البنطلون"}, desc:{en:"Fitted waistband finishing the trouser top.",ar:"حزام خصر مضبوط يُنهي أعلى البنطلون."}, role:"waistband", outline:waistbandPc(qw*0.95, 5), grain:[[5,2],[5,3]] },
      ];
    });

  def("bf08", "boys", "Classic Denim Jacket (Kids)", "جاكيت جينز كلاسيكي للأطفال",
    "Jacket", "جاكيت", "jacket",
    "A trucker-style denim jacket for kids with a shoulder yoke and ribbed hem.",
    "جاكيت جينز للأطفال بطراز تراكر بكوة كتف وحاشية ريب.",
    (m) => {
      const len = m.backLen*0.85;
      const jb = jacketFrontBack(m, len, { hemFlareF:0.92, closureX:q(m.chest)*0.08 });
      const sl = sleeve2pc(m.bicep, m.sleeve-2);
      const cs = collarStand(m.neck);
      return [
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Front panel with a button-front closure.",ar:"مقدمة بإغلاق أزرار أمامي."}, role:"front-panel", outline:jb.front, grain:[[3,6],[3,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Back panel below the shoulder yoke.",ar:"لوحة خلفية أسفل كوة الكتف."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,6],[3,len*0.6]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved western-style shoulder yoke.",ar:"كوة كتف منحنية بطراز غربي."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.2, 8), grain:[[4,2],[4,5]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.4]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.4]] },
        { key:"collarBand", name:{en:"Collar Band",ar:"شريط الياقة"}, desc:{en:"Standing collar band.",ar:"شريط ياقة واقف."}, role:"collar-band", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"cuff", name:{en:"Cuff",ar:"الأسورة"}, desc:{en:"Buttoned cuff at the sleeve hem.",ar:"أسورة بزر عند نهاية الكم."}, role:"cuff", outline:cuffPc(q(m.bicep)*0.75), grain:[[3,1],[3,4]] },
        { key:"waistband", name:{en:"Hem Waistband",ar:"حزام الحاشية"}, desc:{en:"Buttoned waistband finishing the hem.",ar:"حزام بزر يُنهي الحاشية."}, role:"waistband", outline:waistbandPc(q(m.waist)*0.9, 6), grain:[[5,2],[5,4]] },
        { key:"pocketChestL", name:{en:"Chest Pocket Left",ar:"جيب الصدر الأيسر"}, desc:{en:"Flapped chest pocket.",ar:"جيب صدر بغطاء."}, role:"pocket", outline:pocketPc(7,3), grain:[[3,1],[3,2]] },
        { key:"pocketChestR", name:{en:"Chest Pocket Right",ar:"جيب الصدر الأيمن"}, desc:{en:"Flapped chest pocket.",ar:"جيب صدر بغطاء."}, role:"pocket", outline:pocketPc(7,3), grain:[[3,1],[3,2]] },
      ];
    });

  def("bf09", "boys", "Four-Pocket Safari Jacket (Kids)", "جاكيت سفاري بأربعة جيوب للأطفال",
    "Jacket", "جاكيت", "jacket",
    "A kids' safari jacket with four patch pockets and a belted waist.",
    "جاكيت سفاري للأطفال بأربعة جيوب ملصقة وخصر بحزام.",
    (m) => {
      const len = m.backLen*1.0;
      const jb = jacketFrontBack(m, len, { hemFlareF:0.95, closureX:q(m.chest)*0.1 });
      const sl = sleeve2pc(m.bicep, m.sleeve);
      const cs = collarStand(m.neck);
      return [
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Front panel with a shirt-style closure.",ar:"مقدمة بإغلاق بطراز القميص."}, role:"front-panel", outline:jb.front, grain:[[3,7],[3,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Back panel with a shoulder yoke seam.",ar:"لوحة خلفية بخط كوة الكتف."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,7],[3,len*0.6]] },
        { key:"collar", name:{en:"Shirt Collar",ar:"ياقة قميص"}, desc:{en:"Curved shirt-style collar.",ar:"ياقة بطراز القميص منحنية."}, role:"collar", outline:cs.collar, grain:[[3,2],[3,5]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"belt", name:{en:"Waist Belt",ar:"حزام الخصر"}, desc:{en:"Self-fabric belt with a buckle loop.",ar:"حزام من نفس القماش بحلقة إبزيم."}, role:"belt", outline:waistbandPc(q(m.waist)*0.6, 5), grain:[[4,2],[4,3]] },
        { key:"pocketChestL", name:{en:"Chest Pocket Left",ar:"جيب الصدر الأيسر"}, desc:{en:"Flapped patch pocket at the chest.",ar:"جيب صدر ملصق بغطاء."}, role:"pocket", outline:pocketPc(7,3), grain:[[3,1],[3,2]] },
        { key:"pocketChestR", name:{en:"Chest Pocket Right",ar:"جيب الصدر الأيمن"}, desc:{en:"Flapped patch pocket at the chest.",ar:"جيب صدر ملصق بغطاء."}, role:"pocket", outline:pocketPc(7,3), grain:[[3,1],[3,2]] },
        { key:"pocketHipL", name:{en:"Hip Pocket Left",ar:"جيب الورك الأيسر"}, desc:{en:"Large flapped hip pocket.",ar:"جيب ورك كبير بغطاء."}, role:"pocket", outline:pocketPc(9,4.5), grain:[[4,1],[4,3]] },
        { key:"pocketHipR", name:{en:"Hip Pocket Right",ar:"جيب الورك الأيمن"}, desc:{en:"Large flapped hip pocket.",ar:"جيب ورك كبير بغطاء."}, role:"pocket", outline:pocketPc(9,4.5), grain:[[4,1],[4,3]] },
      ];
    });

  def("bf10", "boys", "Formal Overcoat with Half Belt", "معطف رسمي بنصف حزام",
    "Coat", "معطف", "coat",
    "A kids' formal overcoat with a wide collar, a decorative half-belt back and flap pockets.",
    "معطف رسمي للأطفال بياقة عريضة ونصف حزام خلفي زخرفي وجيوب بغطاء.",
    (m) => {
      const len = m.backLen*1.5;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.0, closureX:q(m.chest)*0.2 });
      const sl = sleeve2pc(m.bicep, m.sleeve+1);
      return [
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Front panel with a wide overlap closure.",ar:"مقدمة بإغلاق متراكب عريض."}, role:"front-panel", outline:jb.front, grain:[[4,9],[4,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Back panel with a center vent.",ar:"لوحة خلفية بفتحة وسطى."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[4,9],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer coat sleeve panel.",ar:"اللوحة الخارجية لكم المعطف."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner coat sleeve panel.",ar:"اللوحة الداخلية لكم المعطف."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"facing", name:{en:"Lapel Facing",ar:"بطانة الصدر"}, desc:{en:"Wide curved lapel facing.",ar:"بطانة صدر عريضة منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck*1.05, len*0.5), grain:[[3,3],[3,len*0.3]] },
        { key:"collarStandPc", name:{en:"Collar Stand",ar:"قاعدة الياقة"}, desc:{en:"Standing collar band beneath the lapel.",ar:"شريط ياقة واقف أسفل الصدر."}, role:"collar-stand", outline:collarStand(m.neck).stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"flapPocket", name:{en:"Flap Pocket",ar:"جيب بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, role:"pocket", outline:pocketPc(9,3.5), grain:[[4,1],[4,2.5]] },
        { key:"chestPocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Small welt pocket at the chest.",ar:"جيب صغير مطوي عند الصدر."}, role:"pocket", outline:pocketPc(6,2.5), grain:[[3,1],[3,2]] },
        { key:"backBelt", name:{en:"Half Belt",ar:"نصف حزام"}, desc:{en:"Decorative half-belt tab at the back waist.",ar:"شريط نصف حزام زخرفي عند خصر الظهر."}, role:"belt", outline:waistbandPc(q(m.waist)*0.5, 4), grain:[[5,1],[5,2.5]] },
        { key:"backLining", name:{en:"Back Lining",ar:"بطانة الظهر"}, desc:{en:"Full back body lining.",ar:"بطانة كاملة للظهر."}, role:"lining", outline:jb.back, grain:[[4,9],[4,len*0.6]] },
      ];
    });

  def("bf11", "boys", "Kids Trench Coat", "معطف ترنش للأطفال",
    "Coat", "معطف", "coat",
    "A double-breasted trench coat for kids with a storm collar and a tie belt.",
    "معطف ترنش للأطفال بصفين من الأزرار وياقة عاصفة وحزام يُربط.",
    (m) => {
      const len = m.backLen*1.4;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.0, closureX:q(m.chest)*0.22 });
      const sl = sleeve2pc(m.bicep, m.sleeve+1);
      return [
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Front panel with a storm-flap edge.",ar:"مقدمة بحافة غطاء عاصفة."}, role:"front-panel", outline:jb.front, grain:[[3,8],[3,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Back panel with a center vent.",ar:"لوحة خلفية بفتحة وسطى."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,8],[3,len*0.6]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved yoke for extra coverage.",ar:"كوة كتف منحنية لتغطية إضافية."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.25, 9), grain:[[4,2],[4,6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Storm Collar",ar:"ياقة عاصفة"}, desc:{en:"Wide curved collar buttoning to the throat.",ar:"ياقة عريضة منحنية تُغلق حتى الرقبة."}, role:"collar", outline:shawlCollar(m.neck, 16), grain:[[3,3],[3,12]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the closure.",ar:"بطانة منحنية على حافة الإغلاق."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.45), grain:[[3,3],[3,len*0.28]] },
        { key:"epaulette", name:{en:"Shoulder Epaulette",ar:"شريط الكتف"}, desc:{en:"Buttoned shoulder tab.",ar:"شريط كتف بزر."}, role:"epaulette", outline:pocketPc(5,2), grain:[[2,1],[2,1.5]] },
        { key:"belt", name:{en:"Tie Belt",ar:"حزام يُربط"}, desc:{en:"Belt with a buckle loop.",ar:"حزام بحلقة إبزيم."}, role:"belt", outline:waistbandPc(q(m.waist)*0.5, 5), grain:[[5,2],[5,3]] },
        { key:"pocket", name:{en:"Flap Pocket",ar:"جيب بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, role:"pocket", outline:pocketPc(10,4), grain:[[4,1],[4,2.5]] },
      ];
    });

  def("bf12", "boys", "Two-Piece Blazer Suit", "بدلة بليزر من قطعتين",
    "Suit", "بدلة", "suit",
    "A smart two-piece suit — tailored blazer and matching trousers — fully lined.",
    "بدلة أنيقة من قطعتين — بليزر مفصّل وبنطلون مطابق — مبطّنة بالكامل.",
    (m) => {
      const len = m.backLen*1.3;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.0 });
      const sl = sleeve2pc(m.bicep, m.sleeve);
      const qw = q(m.waist), qh = q(m.hips);
      return [
        { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored suit jacket front.",ar:"مقدمة جاكيت البدلة المفصّلة."}, role:"front-panel", outline:jb.front, grain:[[3,7],[3,len*0.6]] },
        { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored suit jacket back.",ar:"خلفية جاكيت البدلة المفصّلة."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,7],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Jacket Collar",ar:"ياقة الجاكيت"}, desc:{en:"Notch-ready jacket collar.",ar:"ياقة جاكيت جاهزة للفتحة."}, role:"collar", outline:shawlCollar(m.neck, 14), grain:[[3,3],[3,10]] },
        { key:"facing", name:{en:"Jacket Facing",ar:"بطانة الجاكيت"}, desc:{en:"Curved front facing.",ar:"بطانة أمامية منحنية."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.5), grain:[[3,3],[3,len*0.3]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket.",ar:"جيب مطوي منحنٍ."}, role:"pocket", outline:pocketPc(8,3), grain:[[3,1],[3,2]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Front leg panel with a curved crotch seam.",ar:"لوحة الساق الأمامية بخط تفصيل منحنٍ."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,6],[qw*0.3,m.inseam*0.5]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Back leg panel with a curved seat curve.",ar:"لوحة الساق الخلفية بمنحنى مقعد."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,6],[qw*0.3,m.inseam*0.5]] },
        { key:"waistband", name:{en:"Trouser Waistband",ar:"حزام خصر البنطلون"}, desc:{en:"Fitted waistband finishing the trouser top.",ar:"حزام خصر مضبوط يُنهي أعلى البنطلون."}, role:"waistband", outline:waistbandPc(qw*0.95, 5), grain:[[5,2],[5,3]] },
      ];
    });

  def("bf13", "boys", "Ethnic Kandura with Vest", "كندورة تراثية بصدرية",
    "Robe", "كندورة", "robe",
    "A traditional kids' kandura layered with a fitted embroidered-ready vest.",
    "كندورة تقليدية للأطفال مع صدرية ضيقة جاهزة للتطريز.",
    (m) => {
      const len = m.height*0.8;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.1, closureX:q(m.chest)*0.06 });
      const sl = sleeve2pc(m.bicep, m.sleeve+1);
      const cs = collarStand(m.neck);
      const vLen = m.backLen*0.85;
      const vb = jacketFrontBack(m, vLen, { hemFlareF:0.85, closureX:q(m.chest)*0.05 });
      return [
        { key:"front", name:{en:"Kandura Front",ar:"مقدمة الكندورة"}, desc:{en:"Long front panel to the hem.",ar:"مقدمة طويلة حتى الحاشية."}, role:"front-panel", cutOnFold:true, outline:jb.front, grain:[[3,8],[3,len*0.6]] },
        { key:"back", name:{en:"Kandura Back",ar:"خلفية الكندورة"}, desc:{en:"Long back panel to the hem.",ar:"خلفية طويلة حتى الحاشية."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,8],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Standing Collar",ar:"ياقة واقفة"}, desc:{en:"Structured standing collar band.",ar:"شريط ياقة واقف مهيكل."}, role:"collar-stand", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"vestFront", name:{en:"Vest Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted vest front, embroidery-ready.",ar:"مقدمة صدرية ضيقة جاهزة للتطريز."}, role:"front-panel", outline:vb.front, grain:[[2,6],[2,vLen*0.6]] },
        { key:"vestBack", name:{en:"Vest Back",ar:"خلفية الصدرية"}, desc:{en:"Vest back panel.",ar:"لوحة خلفية الصدرية."}, role:"back-panel", cutOnFold:true, outline:vb.back, grain:[[2,6],[2,vLen*0.6]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the front placket.",ar:"بطانة منحنية على فتحة المقدمة."}, role:"lapel-facing", outline:lapelFacing(m.neck*0.6, len*0.28), grain:[[3,3],[3,len*0.16]] },
        { key:"cuff", name:{en:"Sleeve Cuff",ar:"أسورة الكم"}, desc:{en:"Finishing band at the sleeve hem.",ar:"شريط تشطيب عند نهاية الكم."}, role:"cuff", outline:cuffPc(q(m.bicep)*0.7), grain:[[3,1],[3,4]] },
        { key:"pocket", name:{en:"Side Seam Pocket",ar:"جيب الخط الجانبي"}, desc:{en:"Hidden pocket set into the side seam.",ar:"جيب مخفي داخل الخط الجانبي."}, role:"pocket", outline:pocketPc(8,11), grain:[[3,3],[3,7]] },
      ];
    });

  def("bf14", "boys", "Double-Breasted Hooded Coat", "معطف بقبعة وصفين من الأزرار",
    "Coat", "معطف", "coat",
    "A double-breasted winter coat with an attached two-piece hood and ribbed cuffs.",
    "معطف شتوي بصفين من الأزرار وقبعة متصلة من قطعتين وأساور ريب.",
    (m) => {
      const len = m.backLen*1.35;
      const jb = jacketFrontBack(m, len, { hemFlareF:1.05, closureX:q(m.chest)*0.26 });
      const sl = sleeve2pc(m.bicep, m.sleeve+1);
      return [
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Wide double-breasted overlap front.",ar:"مقدمة عريضة بتراكب صفين من الأزرار."}, role:"front-panel", outline:jb.front, grain:[[3,8],[3,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Back panel with a center vent.",ar:"لوحة خلفية بفتحة وسطى."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,8],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"hoodL", name:{en:"Hood Left",ar:"القبعة اليسرى"}, desc:{en:"Left half of the two-piece hood.",ar:"النصف الأيسر من القبعة ذات القطعتين."}, role:"hood", outline:hoodHalf(m.neck*2.05, 30), grain:[[5,4],[5,19]] },
        { key:"hoodR", name:{en:"Hood Right",ar:"القبعة اليمنى"}, desc:{en:"Right half of the two-piece hood.",ar:"النصف الأيمن من القبعة ذات القطعتين."}, role:"hood", outline:hoodHalf(m.neck*2.05, 30), grain:[[5,4],[5,19]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the front closure.",ar:"بطانة منحنية على حافة الإغلاق الأمامية."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.45), grain:[[3,3],[3,len*0.28]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff sealing the sleeve hem.",ar:"أسورة ريب تُغلق نهاية الكم."}, role:"rib-cuff", outline:cuffPc(q(m.bicep)*0.85), grain:[[3,1],[3,4]] },
        { key:"pocket", name:{en:"Flap Pocket",ar:"جيب بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, role:"pocket", outline:pocketPc(10,4), grain:[[4,1],[4,2.5]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke.",ar:"كوة كتف منحنية."}, role:"yoke", outline:yokePc(q(m.shoulder)*1.2, 9), grain:[[4,2],[4,6]] },
      ];
    });

  def("bf15", "boys", "Bomber & Cargo Trouser Combo", "طقم بومبر وبنطلون كارجو",
    "Suit", "بدلة", "suit",
    "A ribbed bomber jacket paired with matching wide-pocket cargo trousers.",
    "جاكيت بومبر بريب مع بنطلون كارجو مطابق بجيوب عريضة.",
    (m) => {
      const len = m.backLen*0.95;
      const jb = jacketFrontBack(m, len, { hemFlareF:0.9, closureX:q(m.chest)*0.08 });
      const sl = sleeve2pc(m.bicep, m.sleeve-2);
      const cs = collarStand(m.neck);
      const qw = q(m.waist), qh = q(m.hips);
      return [
        { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Front panel with a zip closure edge.",ar:"مقدمة بحافة إغلاق سحاب."}, role:"front-panel", outline:jb.front, grain:[[3,6],[3,len*0.6]] },
        { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Back panel gathered to the waistband.",ar:"لوحة خلفية مجمّعة عند حزام الخصر."}, role:"back-panel", cutOnFold:true, outline:jb.back, grain:[[3,6],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.4]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.4]] },
        { key:"collarBand", name:{en:"Rib Collar Band",ar:"شريط ياقة ريب"}, desc:{en:"Stretch ribbed collar band.",ar:"شريط ياقة مطاطي من الريب."}, role:"collar-band", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff at the sleeve hem.",ar:"أسورة ريب عند نهاية الكم."}, role:"rib-cuff", outline:cuffPc(q(m.bicep)*0.8), grain:[[3,1],[3,4]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Front leg panel with a curved crotch seam.",ar:"لوحة الساق الأمامية بخط تفصيل منحنٍ."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,6],[qw*0.3,m.inseam*0.5]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Back leg panel with a curved seat curve.",ar:"لوحة الساق الخلفية بمنحنى مقعد."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,6],[qw*0.3,m.inseam*0.5]] },
        { key:"cargoPocketL", name:{en:"Cargo Pocket Left",ar:"جيب الكارجو الأيسر"}, desc:{en:"Wide flapped cargo pocket on the trouser leg.",ar:"جيب كارجو عريض بغطاء على ساق البنطلون."}, role:"pocket", outline:pocketPc(9,8), grain:[[4,2],[4,6]] },
        { key:"cargoPocketR", name:{en:"Cargo Pocket Right",ar:"جيب الكارجو الأيمن"}, desc:{en:"Wide flapped cargo pocket on the trouser leg.",ar:"جيب كارجو عريض بغطاء على ساق البنطلون."}, role:"pocket", outline:pocketPc(9,8), grain:[[4,2],[4,6]] },
        { key:"waistband", name:{en:"Trouser Waistband",ar:"حزام خصر البنطلون"}, desc:{en:"Elasticated waistband finishing the trouser top.",ar:"حزام خصر مطاطي يُنهي أعلى البنطلون."}, role:"waistband", outline:waistbandPc(qw*0.9, 5), grain:[[5,2],[5,3]] },
      ];
    });

  def("bf16", "boys", "Formal Sherwani Set", "طقم شيرواني رسمي",
    "Suit", "بدلة", "suit",
    "A formal sherwani coat with a Nehru collar, paired with matching straight trousers.",
    "معطف شيرواني رسمي بياقة نهرو مع بنطلون مستقيم مطابق.",
    (m) => {
      const len = m.backLen*1.6;
      const qc = q(m.chest), qw = q(m.waist), qh = q(m.hips);
      const cs = collarStand(m.neck);
      const sl = sleeve2pc(m.bicep, m.sleeve+1);
      return [
        { key:"frontL", name:{en:"Coat Front Left",ar:"مقدمة المعطف اليسرى"}, desc:{en:"Left front with the closure curve.",ar:"مقدمة يسرى بمنحنى الإغلاق."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "L"), grain:[[3,8],[3,len*0.6]] },
        { key:"frontR", name:{en:"Coat Front Right",ar:"مقدمة المعطف اليمنى"}, desc:{en:"Right front underlapping the closure.",ar:"مقدمة يمنى تحت الإغلاق."}, role:"front-panel", outline:wrapPanel(qc, qw, len, "R"), grain:[[-3,8],[-3,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Back panel to the hem.",ar:"لوحة ظهر حتى الحاشية."}, role:"back-panel", cutOnFold:true, outline:jacketFrontBack(m, len, {hemFlareF:1.05}).back, grain:[[3,8],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, role:"sleeve-upper", bilateral:true, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, role:"sleeve-under", bilateral:true, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Nehru Collar",ar:"ياقة نهرو"}, desc:{en:"Standing Nehru-style collar band.",ar:"ياقة واقفة بطراز نهرو."}, role:"collar-stand", outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the closure edge.",ar:"بطانة منحنية على حافة الإغلاق."}, role:"lapel-facing", outline:lapelFacing(m.neck, len*0.4), grain:[[3,3],[3,len*0.25]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket at the hip.",ar:"جيب مطوي منحنٍ عند الورك."}, role:"pocket", outline:pocketPc(8,3), grain:[[3,1],[3,2]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Straight-leg front panel with a curved crotch seam.",ar:"لوحة ساق أمامية مستقيمة بخط تفصيل منحنٍ."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,6],[qw*0.3,m.inseam*0.5]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Straight-leg back panel with a curved seat curve.",ar:"لوحة ساق خلفية مستقيمة بمنحنى مقعد."}, role:"other", outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,6],[qw*0.3,m.inseam*0.5]] },
      ];
    });

})();
