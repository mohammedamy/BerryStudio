/* ============================================================
   Underwear & Bra Library — 44 pre-designed patterns.

   24 briefs/trunks (6 each: women, men, girls, boys) + 20 bras
   (10 each: women, girls). Every entry is a REAL, gradable
   multi-piece garment — geometry comes from the two parametric
   builders below (briefPieces / braPieces + sportBraPieces), not a
   recolored placeholder, and every curved seam (waist edge, leg
   opening, crotch curve, cup boundary, band top edge) is a real
   quadratic bezier sampled into the outline the same way
   js/fancy-patterns.js's qBez()/withCurves() convention already
   works — this file keeps its own small local copy of that same
   curve math rather than exporting it out of fancy-patterns.js,
   since it's ~20 lines of pure math and fancy-patterns.js's own
   module boundary (only `FancyGen` is exported) is deliberate.

   Deliberately does NOT include a thong-style cut in any category —
   every style below (brief/hipster/boyshort/trunk/bralette/bandeau/
   sport/etc.) is a real, common commercial pattern name, chosen so
   the same shared builder functions and construction conventions
   stay appropriate across all four body categories, including the
   two kids' ones.

   Bra construction is deliberately soft-cup/wireless throughout
   (no underwire channel piece) — a real, common commercial
   construction (most bralettes and many everyday bras are soft-cup),
   and the only sensible default for the girls' category; kept
   IDENTICAL in construction style for women so both categories share
   one builder rather than maintaining two.

   New roles introduced here (see js/app.js's buildSewingSteps()/
   buildBomItems() for what they actually trigger — extended
   alongside this file, not left to fall through as role:"other"):
   "gusset", "cup", "band", "strap", "elastic-band", "brief-front",
   "brief-back". The last two are deliberately NOT "front-panel"/
   "back-panel" — those roles trigger buildSewingSteps()'s generic
   "join at the shoulder seams" step, which is wrong for a brief (it
   joins at the side seams, and the crotch gusset is what actually
   goes between front and back) — a real, dedicated brief-front/
   brief-back check gets a real, dedicated, honest instruction instead.
   ============================================================ */
import { q, PATTERNS, LIBRARY } from './data.js';

(function () {
  "use strict";

  // ---------------- curve sampling (local copy — see header) ----------------
  function qBez(p0, c, p1, n) {
    n = n || 8;
    const pts = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
    }
    return pts;
  }
  // Degree-elevates a quadratic (p0,c,p1) to the identical cubic curve, so
  // every qBez()-built edge can carry real {c1,c2} metadata for the DXF
  // curve layer / Check Pattern — same technique js/fancy-patterns.js uses.
  function qBezToCubic(p0, c, p1) {
    return {
      c1: [p0[0] + (2 / 3) * (c[0] - p0[0]), p0[1] + (2 / 3) * (c[1] - p0[1])],
      c2: [p1[0] + (2 / 3) * (c[0] - p1[0]), p1[1] + (2 / 3) * (c[1] - p1[1])],
    };
  }
  function withCurves(outline, curves) {
    if (curves && curves.length) outline.curves = curves;
    return outline;
  }
  function hoistCurves(pieces) {
    for (const p of pieces) if (!p.curves && p.outline && p.outline.curves) p.curves = p.outline.curves;
    return pieces;
  }

  // ---------------- reusable mechanical components ----------------

  // Plain elastic/binding strip sized to a finished circumference — same
  // idiom js/ai.js's buildLeotard() uses for its neckline/armhole/leg
  // bindings (a straight strip, cut on the straight grain, stretched to
  // gather the edge it's stitched to).
  function elasticStrip(circCm, h) {
    h = h || 2.2;
    return [[0, 0], [circCm, 0], [circCm, h], [0, h]];
  }

  // Crotch gusset as a real curved oval/lens (4 quadratic beziers), not the
  // straight-edged diamond js/ai.js's leotard gusset uses — a genuinely
  // nicer, more precise curved shape for the one piece a wearer's body
  // actually contacts directly. The final curve segment's last sample lands
  // exactly on the outline's own start point by construction (it closes the
  // loop) — dropped before use, same reasoning js/fancy-patterns.js's
  // WP-26 dedupeClose()/dedupeCloseWithCurves() document for this identical
  // situation elsewhere in the codebase; its curve entry is omitted rather
  // than claiming a toIdx the trimmed array no longer has.
  // WP-57 (docs/plan 4.md Phase 4/5): previously drafted the FULL oval
  // (4 curve segments closing back to its own [0,0] origin) — never
  // declared cutOnFold anywhere it's used, but the closing curve's own
  // samples sat close enough to the piece's own min-X, for enough of its
  // height, to false-trigger checkFoldSymmetry's fold heuristic (48 real
  // failures across both call sites, Crotch Gusset and Gusset Lining, on
  // all 24 brief patterns). Real fix, same as peplumPc/capePc's WP-53
  // one: a crotch gusset really is conventionally symmetric, cut on the
  // fold — now a genuine cut-on-fold half with a real straight fold edge,
  // not a reshape to dodge the heuristic. `w` stays the FULL finished
  // width (unchanged call-site meaning); every call site now declares
  // `cutOnFold: true`.
  function gussetOval(w, h) {
    const halfW = w / 2;
    const seg1 = [[0, 0], [halfW, 0], [halfW, h / 2]];
    const seg2 = [[halfW, h / 2], [halfW, h], [0, h]];
    const outline = [[0, 0], ...qBez(...seg1, 6), ...qBez(...seg2, 6)];
    // seg2's own endpoint is exactly [0,h] — the outline's implicit
    // wraparound edge (last point back to [0,0]) is the fold itself.
    return withCurves(outline, [
      { fromIdx: 0, toIdx: 6, ...qBezToCubic(...seg1) },
      { fromIdx: 6, toIdx: 12, ...qBezToCubic(...seg2) },
    ]);
  }

  // ---------------- briefs / trunks ----------------
  // Front/back panel with a real curved waist edge and a real curved leg
  // opening (unlike js/ai.js's leotard leg opening, which is straight
  // segments through the same hip/leg/gusset waypoints — this samples an
  // actual bezier through them instead, per the user's own "precise, nice
  // curves" request). `front` toggles the front/back asymmetry every real
  // brief block has: the back drops slightly deeper than the front (more
  // seat coverage) and sits a touch wider at the waist.
  //
  // WP-58 (docs/plan 4.md Phase 5, full-sweep redesign): the real side
  // seam a brief's front and back panel are sewn together at is the
  // short straight corner edge from the waist curve's own end to the leg
  // curve's own start — physically a few cm, not the whole panel height
  // the old bounding-box proxy compared. That corner used to be placed
  // independently front vs back (`hipX`/`legTopY` each had their own
  // front/back formula), so the edge itself came out a different real
  // length on each side — not by design, just two unrelated formulas
  // that happened to both feed the same corner. Redrafted so that corner
  // is now `waistX + (sideDX, sideDY)` — ONE fixed vector, shared by
  // front and back — so the edge is the same real length by
  // construction regardless of `waistX` (which still differs front/back,
  // it just translates the corner rather than resizing the seam). The
  // "back covers more" difference this removed from `legTopY` still
  // lives on in `crotchY`'s existing `+2` for back, and in the leg
  // curve's own shape beyond this corner (undeclared, free to differ).
  const RISE_CM = { low: 7, mid: 12, high: 18 };
  const LEG_F = { bikini: 0.58, hipster: 0.70, full: 0.85, boyshort: 1.05 };
  function briefPanel(qw, qh, front, opts) {
    const rise = RISE_CM[opts.rise] || RISE_CM.mid;
    const legF = LEG_F[opts.legCut] || LEG_F.full;
    const legLength = opts.legLength || 0; // >0 = boxer-brief/trunk hem extension down the thigh

    const qScale = qh / 24;
    const isLegStyle = legLength > 0 || opts.legCut === "boyshort";
    const riseBlend = opts.rise === "low" ? 0.45 : opts.rise === "mid" ? 0.24 : 0.04;
    const topQ = qw + (qh - qw) * riseBlend;
    const waistX = topQ * (front ? 0.88 : 0.94);
    const sideDX = Math.max(1.0, (qh * 0.92 - topQ * 0.91) * 0.90);

    if (isLegStyle) {
      const legExt = legLength > 0 ? legLength : 4.5;
      const waistDropY = 1.2 * qScale;
      const inseamH = Math.max(3.8, (legLength > 0 ? legLength * 0.56 : 3.8) * qScale);
      const sideDY = Math.max(rise * 0.44 * qScale + inseamH + 1.8 * qScale, (rise * 0.48 + legExt) * qScale); // shared outer thigh side-seam vector
      const cornerX = waistX + sideDX, hemY = waistDropY + sideDY;
      const crotchX = Math.max(2.1, qh * 0.125);
      const inseamHemX = Math.max(crotchX + 2.1, qh * 0.21);
      const crotchY = hemY - inseamH - (front ? 0.65 * qScale : 0);
      const midHemX = 0.5 * (cornerX + inseamHemX);

      const waistSeg = [[0, 0], [waistX * 0.55, -1.0 * qScale], [waistX, waistDropY]];
      const legRise = hemY - crotchY;
      const inseamCtrlX = crotchX + (inseamHemX - crotchX) * (front ? 0.52 : 0.68);
      const inseamSeg = [[inseamHemX, hemY], [inseamCtrlX, crotchY + legRise * 0.28], [crotchX, crotchY]];

      const outline = [
        [0, 0],
        ...qBez(...waistSeg, 6),
        [cornerX, hemY],
        [midHemX, hemY],
        [inseamHemX, hemY],
        ...qBez(...inseamSeg, 4),
        [0, crotchY],
      ];
      withCurves(outline, [
        { fromIdx: 0, toIdx: 6, ...qBezToCubic(...waistSeg) },
        { fromIdx: 9, toIdx: 13, ...qBezToCubic(...inseamSeg) },
      ]);
      outline.edges = [{ fromIdx: 6, toIdx: 7, seamId: 'briefSide' }];
      outline.notches = [[cornerX, hemY]];
      outline.sideEndIdx = 6;
      return outline;
    }

    const waistDropY = 1.2 * qScale;
    const sideDY = rise * 0.44 * qScale; // shared side-seam vector, front == back
    const cornerX = waistX + sideDX, cornerY = waistDropY + sideDY;
    const crotchDepth = Math.max(4.2, qh * 0.38 * legF);
    const crotchY = cornerY + crotchDepth + (front ? 0 : 1.5 * qScale);
    const crotchX = qh * 0.135;

    const waistSeg = [[0, 0], [waistX * 0.55, -1.0 * qScale], [waistX, waistDropY]];
    const legCtrlX = crotchX + (cornerX - crotchX) * (front ? 0.26 : 0.58);
    const legCtrlY = cornerY + (crotchY - cornerY) * (front ? 0.56 : 0.48);
    const legSeg = [[cornerX, cornerY], [legCtrlX, legCtrlY], [crotchX, crotchY]];

    const outline = [
      [0, 0],
      ...qBez(...waistSeg, 6),
      [cornerX, cornerY],
      ...qBez(...legSeg, 8),
      [0, crotchY],
    ];
    withCurves(outline, [
      { fromIdx: 0, toIdx: 6, ...qBezToCubic(...waistSeg) },
      { fromIdx: 7, toIdx: 15, ...qBezToCubic(...legSeg) },
    ]);
    outline.edges = [{ fromIdx: 6, toIdx: 7, seamId: 'briefSide' }];
    outline.notches = [[cornerX, cornerY]];
    outline.sideEndIdx = 6;
    return outline;
  }
  function briefPieces(m, opts) {
    const qw = q(m.waist), qh = q(m.hips);
    const front = briefPanel(qw, qh, true, opts);
    const back = briefPanel(qw, qh, false, opts);
    const frontLen = front[front.length - 1][1], backLen = back[back.length - 1][1];
    const riseBlend = opts.rise === "low" ? 0.45 : opts.rise === "mid" ? 0.24 : 0.04;
    const topQ = qw + (qh - qw) * riseBlend;
    const qScale = qh / 24;
    const isLegStyle = (opts.legLength || 0) > 0 || opts.legCut === "boyshort";
    const gW = Math.max(4.6, qh * 0.26), gH = Math.max(5.8, qh * 0.34);
    const polyArc = (pts, a, b) => {
      let sum = 0;
      for (let i = a; i < b; i++) sum += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      return sum;
    };
    const waistCirc = Math.round(topQ * 3.55 * 10) / 10; // finished elastic waist (-10% negative stretch ease)
    const legCirc = isLegStyle
      ? Math.round(((polyArc(front, 7, 9) + polyArc(back, 7, 9)) * 2 * 0.94) * 10) / 10
      : Math.round(((polyArc(front, 7, 15) + polyArc(back, 7, 15)) * 0.94) * 10) / 10;

    const pieces = [
      {
        key: "front", name: opts.frontName || { en: "Front Panel", ar: "القطعة الأمامية" },
        desc: opts.frontDesc || { en: "Front panel with a curved waist edge and contoured leg cut.", ar: "قطعة أمامية بحافة خصر منحنية وقصة ساق مجسمة." },
        outline: front, role: "brief-front", cutOnFold: true, edges: front.edges, sideEndIdx: front.sideEndIdx, notches: front.notches,
        grain: [[qw * 0.15, Math.max(1.5, frontLen * 0.2)], [qw * 0.15, Math.min(frontLen - 1.2, frontLen * 0.82)]] },
      { key: "back", name: opts.backName || { en: "Back Panel", ar: "القطعة الخلفية" },
        desc: opts.backDesc || { en: "Back panel shaped for full anatomical seat coverage.", ar: "قطعة خلفية مصممة لتغطية مريحة وكاملة للمقعد." },
        outline: back, role: "brief-back", cutOnFold: true, edges: back.edges, sideEndIdx: back.sideEndIdx, notches: back.notches,
        grain: [[qw * 0.15, Math.max(1.5, backLen * 0.2)], [qw * 0.15, Math.min(backLen - 1.2, backLen * 0.82)]] },
      { key: "gusset", name: opts.gussetName || { en: "Crotch Gusset", ar: "دكة الجسم" },
        desc: opts.gussetDesc || { en: "Curved cotton-lining gusset seamed into the crotch, cut on the fold.", ar: "دكة قطنية منحنية تُخاط عند خط الجسم، تُقص على الطية." },
        outline: gussetOval(gW, gH), notches: [[gW / 2, gH / 2]], role: "gusset", cutOnFold: true,
        grain: [[gW / 4, 1.5 * qScale], [gW / 4, gH - 1.5 * qScale]] },
      { key: "gussetLining", name: opts.gussetLiningName || { en: "Gusset Lining", ar: "بطانة الدكة" },
        desc: opts.gussetLiningDesc || { en: "Second gusset layer for opacity and comfort, cut on the fold.", ar: "طبقة ثانية للدكة لمزيد من التغطية والراحة، تُقص على الطية." },
        outline: gussetOval(gW, gH), notches: [[gW / 2, gH / 2]], role: "lining", cutOnFold: true,
        grain: [[gW / 4, 1.5 * qScale], [gW / 4, gH - 1.5 * qScale]] },
      { key: "waistElastic", name: opts.waistElasticName || { en: "Waist Elastic", ar: "أستك الخصر" },
        desc: opts.waistElasticDesc || { en: "Soft knit elastic stitched to the waist edge.", ar: "أستك ناعم يُخاط على حافة الخصر." },
        outline: elasticStrip(waistCirc, Math.max(1.8, 2.4 * qScale)), notches: [[waistCirc, 0]], role: "elastic-band",
        grain: [[waistCirc / 2, 0.5], [waistCirc / 2, Math.max(1.4, 2.0 * qScale)]] },
      { key: "legElastic", name: opts.legElasticName || { en: isLegStyle ? "Thigh Hem Band" : "Leg Elastic", ar: isLegStyle ? "تشطيب حافة الفخذ" : "أستك فتحة الساق" },
        desc: opts.legElasticDesc || { en: "Soft knit binding finishing each leg opening.", ar: "تشطيب مرن ناعم يحيط بكل فتحة ساق." },
        outline: elasticStrip(legCirc, Math.max(1.4, 1.6 * qScale)), notches: [[legCirc, 0]], role: "elastic-band", bilateral: true,
        grain: [[legCirc / 2, 0.4], [legCirc / 2, Math.max(1.0, 1.2 * qScale)]] },
    ];
    return pieces;
  }

  // ---------------- bras ----------------
  function braCup(cupW, cupD, o) {
    o = o || {};
    const isBandeau = o.strap === "none" && (o.cupDepthF || 1) <= 0.5;
    const innerTopY = cupD * (o.plunge ? 0.42 : (isBandeau ? 0.12 : (o.wide ? 0.22 : 0.16)));
    const strapX = cupW * (isBandeau ? 0.66 : (o.wide ? 0.72 : 0.50));
    const topOuterY = isBandeau ? cupD * 0.04 : -cupD * 0.06;
    const sideY = cupD * (isBandeau ? 0.18 : (o.high ? 0.30 : (o.wide ? 0.36 : 0.44)));
    const topCtrl = o.triangle
      ? [cupW * 0.26, innerTopY * 0.46]
      : o.plunge
        ? [cupW * 0.25, innerTopY * 0.54]
        : o.wide
          ? [cupW * 0.38, cupD * 0.26]
          : isBandeau
            ? [cupW * 0.34, cupD * 0.06]
            : [cupW * 0.35, -cupD * 0.04];
    const sideCtrlX = o.triangle ? cupW * 0.90 : (isBandeau ? cupW * 0.98 : cupW * 1.06);
    const bandCtrlY = o.triangle ? cupD * 0.90 : cupD * 1.06;

    const topSeg = [[0, innerTopY], topCtrl, [strapX, topOuterY]];
    const sideSeg = [[strapX, topOuterY], [sideCtrlX, cupD * 0.12], [cupW, sideY]];
    const botSeg = [[cupW, sideY], [cupW * 0.56, bandCtrlY], [cupW * 0.26, cupD]];

    const outline = [
      [0, innerTopY],
      ...qBez(...topSeg, 6),
      ...qBez(...sideSeg, 6),
      ...qBez(...botSeg, 7),
      [0, cupD * (isBandeau ? 0.92 : 0.84)],
    ];
    return withCurves(outline, [
      { fromIdx: 0, toIdx: 6, ...qBezToCubic(...topSeg) },
      { fromIdx: 6, toIdx: 12, ...qBezToCubic(...sideSeg) },
      { fromIdx: 12, toIdx: 19, ...qBezToCubic(...botSeg) },
    ]);
  }
  // Tapered band/wing strip (or level center bridge when outerH === innerH):
  // keeps exact 9-vertex layout (0: bot-inner, 1: top-inner, 2..7: top underbust
  // curve, 8: bot-outer).
  function curvedBandPc(w, innerH, dip, outerH) {
    outerH = outerH != null ? outerH : innerH;
    dip = dip != null ? dip : innerH * 0.16;
    const topEndY = Math.max(0, innerH - outerH);
    const seg = [[0, 0], [w * 0.5, -dip + topEndY * 0.35], [w, topEndY]];
    const outline = [[0, innerH], [0, 0], ...qBez(...seg, 6), [w, innerH]];
    return withCurves(outline, [{ fromIdx: 1, toIdx: 7, ...qBezToCubic(...seg) }]);
  }
  function strapPc(len, w) { return [[0, 0], [w, 0], [w, len], [0, len]]; }

  function braPieces(m, opts) {
    const chestW = q(m.chest);
    const isBandeau = opts.strap === "none" && (opts.cupDepthF || 1) <= 0.5;
    const wScale = Math.max(0.78, Math.min(1.12, opts.cupDepthF || 1));
    const hScale = isBandeau ? 0.62 : Math.max(0.70, opts.cupDepthF || 1);
    const cupW = chestW * 0.52 * wScale;
    const cupD = chestW * 0.64 * hScale;
    const cup = braCup(cupW, cupD, opts);
    const cupDarts = (!opts.triangle && !isBandeau)
      ? [[[cupW * 0.46, cupD * 0.48], [cupW * 0.40, cupD * 0.96], [cupW * 0.52, cupD * 0.96]]]
      : [];

    const bridgeW = opts.plunge ? chestW * 0.075 : chestW * 0.11;
    const bridgeH = Math.max(cupD * 0.44, 4.2);
    const bridgeOut = curvedBandPc(bridgeW, bridgeH, cupD * 0.03, bridgeH);

    const bandH = (isBandeau ? cupD * 0.72 : 6.2 * (opts.bandWidthF || 1)) + (opts.longline ? chestW * 0.36 : 0);
    const outerBandH = opts.longline ? bandH * 0.85 : bandH * 0.64;
    const bandW = chestW * 0.88 + ((opts.bandWidthF || 1) - 1) * 1.8;
    const bandOut = curvedBandPc(bandW, bandH, bandH * 0.12, outerBandH);

    const pieces = [
      {
        key: "cup", name: { en: "Cup", ar: "الكأس" },
        desc: { en: "Anatomically proportioned soft cup with lower shaping dart, meeting bridge and side wing.", ar: "كأس ناعم بقياسات تشريحية وبنسة تشكيل سفلية يتصل بالجسر والجناح الجانبي." },
        outline: cup, darts: cupDarts, notches: [cup[6], cup[12]], role: "cup", bilateral: true,
        grain: [[cupW * 0.40, cupD * 0.20], [cupW * 0.40, cupD * 0.76]] },
      { key: "bridge", name: { en: "Center Bridge", ar: "الجسر الأوسط" },
        desc: { en: "Center-front gore joining the two cups.", ar: "قطعة الجسر الأمامي الوسطى تصل بين الكأسين." },
        outline: bridgeOut, notches: [bridgeOut[4]], role: "other", cutOnFold: true,
        grain: [[bridgeW / 2, bridgeH * 0.22], [bridgeW / 2, bridgeH * 0.78]] },
      { key: "band", name: { en: opts.longline ? "Longline Band" : "Band", ar: opts.longline ? "حزام ممتد" : "الحزام" },
        desc: { en: "Tapered underarm-to-back wing band following the ribcage line to the center back closure.", ar: "قطعة جناح الحزام المتدرجة من تحت الإبط حتى مشبك وسط الظهر." },
        outline: bandOut, notches: [bandOut[4]], role: "band", bilateral: true,
        grain: [[bandW * 0.5, bandH - outerBandH * 0.80], [bandW * 0.5, bandH - outerBandH * 0.20]] },
    ];
    if (opts.strap !== "none") {
      const sW = opts.wideStrap ? 2.6 : 1.6;
      const strapLen = Math.round(m.backLen * (opts.strap === "racerback" ? 0.88 : (opts.longline ? 0.76 : 0.82)) * 10) / 10;
      pieces.push({ key: "strap", name: { en: "Strap", ar: "الحمالة" },
        desc: { en: opts.strap === "racerback" ? "Racerback shoulder strap angling toward the center back." : "Full over-shoulder adjustable strap.",
                ar: opts.strap === "racerback" ? "حمالة كتف رياضية مائلة نحو وسط الظهر." : "حمالة كتف كاملة قابلة للتعديل." },
        outline: strapPc(strapLen, sW), notches: [[sW, 0]], role: "strap", bilateral: true,
        grain: [[sW / 2, 3], [sW / 2, strapLen - 3]] });
    }
    return pieces;
  }

  // Sport bra: sculpted compression front + Y-racerback panel joined cleanly
  // at declared shoulder (`5..6`) and side (`11..12`) seams, finished with a
  // full-circumference underbust elastic band (`bandCirc ≈ 0.80 * m.chest`).
  function sportBraFront(bandW, depth) {
    const neckW = bandW * 0.42;
    const shW = Math.max(2.6, bandW * 0.18);
    const scoopY = depth * 0.34;
    const neckSeg = [[0, scoopY], [neckW * 0.65, scoopY * 0.92], [neckW, 0]];
    const armSeg = [[neckW + shW, 1.4], [bandW * 0.78, depth * 0.44], [bandW, depth * 0.56]];
    const outline = [
      [0, scoopY],
      ...qBez(...neckSeg, 5),
      [neckW + shW, 1.4],
      ...qBez(...armSeg, 5),
      [bandW * 0.94, depth],
      [0, depth],
    ];
    withCurves(outline, [
      { fromIdx: 0, toIdx: 5, ...qBezToCubic(...neckSeg) },
      { fromIdx: 6, toIdx: 11, ...qBezToCubic(...armSeg) },
    ]);
    outline.edges = [
      { fromIdx: 5, toIdx: 6, seamId: 'sportBraShoulder' },
      { fromIdx: 11, toIdx: 12, seamId: 'sportBraSide' },
    ];
    outline.notches = [[bandW, depth * 0.56], [bandW * 0.94, depth]];
    return outline;
  }
  function sportBraBack(bandW, depth, racer) {
    const neckW = racer ? bandW * 0.32 : bandW * 0.42;
    const shW = Math.max(2.6, bandW * 0.18);
    const backNeckY = depth * 0.16;
    const neckSeg = [[0, backNeckY], [neckW * 0.65, backNeckY * 0.88], [neckW, 0]];
    const armCtrlX = racer ? bandW * 0.28 : bandW * 0.72;
    const armSeg = [[neckW + shW, 1.4], [armCtrlX, depth * 0.44], [bandW, depth * 0.56]];
    const outline = [
      [0, backNeckY],
      ...qBez(...neckSeg, 5),
      [neckW + shW, 1.4],
      ...qBez(...armSeg, 5),
      [bandW * 0.94, depth],
      [0, depth],
    ];
    withCurves(outline, [
      { fromIdx: 0, toIdx: 5, ...qBezToCubic(...neckSeg) },
      { fromIdx: 6, toIdx: 11, ...qBezToCubic(...armSeg) },
    ]);
    outline.edges = [
      { fromIdx: 5, toIdx: 6, seamId: 'sportBraShoulder' },
      { fromIdx: 11, toIdx: 12, seamId: 'sportBraSide' },
    ];
    outline.notches = [[bandW, depth * 0.56], [bandW * 0.94, depth]];
    return outline;
  }
  function sportBraPieces(m, opts) {
    const bandW = Math.round(q(m.chest) * 0.85 * 10) / 10; // compressive athletic fit (~0.85 quarter chest)
    const depth = Math.max(17, m.backLen * 0.50);
    const front = sportBraFront(bandW, depth);
    const back = sportBraBack(bandW, depth, opts.racer);
    const bandCirc = Math.round(m.chest * 0.80 * 10) / 10;
    return [
      {
        key: "front", name: { en: "Front Panel", ar: "القطعة الأمامية" },
        desc: { en: "Compression-fit front panel with scooped neckline, contoured armholes, and shoulder/side seams.", ar: "قطعة أمامية ضاغطة بفتحة رقبة مقوسة وفتحات ذراع محددة ودرزات كتف وجنب." },
        outline: front, edges: front.edges, notches: front.notches, role: "band", cutOnFold: true, necklineEndIdx: 5, sideEndIdx: 11,
        grain: [[bandW * 0.30, depth * 0.38], [bandW * 0.30, depth - 2]] },
      { key: "back", name: { en: opts.racer ? "Racerback Panel" : "Back Panel", ar: opts.racer ? "قطعة الظهر الرياضي" : "القطعة الخلفية" },
        desc: { en: opts.racer ? "Y-racerback athletic panel with shoulder-blade cutouts and matching shoulder/side seams." : "Athletic back panel with scooped neckline.", ar: opts.racer ? "قطعة ظهر رياضي بتفريغ لوحي الكتف ودرزات كتف وجنب متطابقة." : "قطعة خلفية رياضية بفتحة رقبة مقوسة." },
        outline: back, edges: back.edges, notches: back.notches, role: "band", cutOnFold: true, necklineEndIdx: 5, sideEndIdx: 11,
        grain: [[bandW * 0.18, depth * 0.32], [bandW * 0.18, depth - 2]] },
      { key: "bandElastic", name: { en: "Band Elastic", ar: "أستك الحزام" },
        desc: { en: "Wide brushed-back elastic band sewn around the underbust edge.", ar: "أستك عريض مبطن يُخاط على محيط أسفل الصدر." },
        outline: elasticStrip(bandCirc, 3.4), notches: [[bandCirc, 0]], role: "elastic-band",
        grain: [[bandCirc / 2, 0.8], [bandCirc / 2, 2.6]] },
    ];
  }

  // ---------------- registration ----------------
  function def(id, category, nameEn, nameAr, tagEn, tagAr, type, descEn, descAr, piecesFn) {
    PATTERNS[id] = {
      id, category, name: { en: nameEn, ar: nameAr },
      desc: { en: descEn, ar: descAr },
      pieces: (m) => hoistCurves(piecesFn(m)),
    };
    LIBRARY.push({ id, cat: category, tag: { en: tagEn, ar: tagAr }, type });
  }

  const UNDERWEAR_TAG = { en: "Underwear", ar: "ملابس داخلية" };
  const BRA_TAG = { en: "Bra", ar: "حمالة صدر" };

  // ================= WOMEN'S BRIEFS (6) =================
  def("wu01", "women", "Classic Black Picot-Trim Cotton Brief", "سروال داخلي كلاسيكي أسود بكنار دانتيل بيكو", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Everyday mid-rise women's brief in breathable black cotton jersey, featuring a flat plush waistband, delicate scalloped picot lace trim along the leg openings, and full seat coverage.",
    "سروال داخلي نسائي متوسط الارتفاع من قطن الجيرسيه الأسود عالي التهوية، بحزام خصر مسطح ناعم، وكنار دانتيل بيكو مقوس على فتحات الساق، وتغطية كاملة للمقعد.",
    (m) => briefPieces(m, {
      rise: "mid", legCut: "full", coverage: 1.0,
      frontDesc: { en: "Black cotton jersey front panel with gentle curved waist and picot lace leg opening.", ar: "لوحة أمامية من قطن الجيرسيه الأسود بخصر مقوس ناعم وفتحة ساق مزينة بالبيكو." },
      backDesc: { en: "Full-coverage black jersey back panel offering complete seat comfort.", ar: "لوحة خلفية من الجيرسيه الأسود بتغطية كاملة للمقعد لأقصى درجات الراحة." },
      gussetDesc: { en: "Soft 100% cotton double-layer crotch gusset for all-day breathability.", ar: "دكة قطنية نقية 100% مزدوجة الطبقة لراحة وتهوية طوال اليوم." },
      waistElasticDesc: { en: "Flat plush-back elastic waistband providing non-chafing hold.", ar: "حزام خصر مطاطي مسطح مبطن بالنعومة يمنع الاحتكاك ويثبت براحة." },
      legElasticDesc: { en: "Delicate scalloped picot elastic trim edging each leg opening.", ar: "كنار مطاطي من دانتيل البيكو المقوس يشطب حواف كل فتحة ساق بأناقة." },
    }));

  def("wu02", "women", "Seamless Nude High-Waist Smoothing Brief", "سروال داخلي عالي الخصر ناعم بلون نيود وبدون خياطة ظاهرة", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "High-rise women's brief in ultra-soft blush nude microfiber offering light tummy smoothing, a bonded comfort waistband, laser-cut leg openings, and full seat coverage.",
    "سروال داخلي نسائي عالي الخصر من المايكروفايبر بلون نيود وردي ناعم، يمنح تجسيماً خفيفاً للبطن مع حزام خصر مدمج مريح، وحواف ساق مقصوصة بالليزر بدون درزات وتغطية كاملة.",
    (m) => briefPieces(m, {
      rise: "high", legCut: "full", coverage: 1.0,
      frontDesc: { en: "Blush nude microfiber high-rise front panel designed for gentle abdominal smoothing.", ar: "لوحة أمامية عالية الخصر من المايكروفايبر النيود مصممة لدعم ونعومة البطن." },
      backDesc: { en: "Seamless-effect high back panel extending above the natural waist for smooth contours.", ar: "لوحة خلفية عالية تمتد فوق الخصر الطبيعي لتحديد انسيابي للمقعد دون بروز." },
      gussetDesc: { en: "Bonded breathable cotton gusset seamlessly fused for maximum comfort.", ar: "دكة قطنية مسامية مدمجة حرارياً دون درزات بارزة لراحة قصوى." },
      waistElasticDesc: { en: "Bonded flat comfort waist band sitting smoothly against the skin without rolling.", ar: "شريط خصر مدمج مسطح يستقر بنعومة على الجلد دون التواء." },
      legElasticDesc: { en: "Laser-cut clean finish leg edge with invisible interior grip.", ar: "حافة ساق مقصوصة بالليزر بنهاية نظيفة تثبت بنعومة دون درزات." },
    }));

  def("wu03", "women", "Powder Pink Cotton Bikini Brief", "سروال داخلي بيكيني وردي ناعم من القطن", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise women's bikini brief in delicate powder pink stretch cotton jersey, featuring slim self-fabric bound elastic waist and leg trims, narrow side hips, and a flattering contoured fit.",
    "سروال داخلي بيكيني نسائي منخفض الخصر من قطن الجيرسيه الوردي الناعم المرن، بشريط مطاطي مغلف على الخصر وفتحات الساق، وجوانب ورك رفيعة وقصة أنثوية رشيقة.",
    (m) => briefPieces(m, {
      rise: "low", legCut: "bikini", coverage: 0.95,
      frontDesc: { en: "Low-rise powder pink cotton front panel cut with slender hip bridges.", ar: "لوحة أمامية منخفضة من القطن الوردي بقصة بيكيني وجوانب ورك رفيعة." },
      backDesc: { en: "Flattering bikini back panel with moderate cheeky contour and high-cut leg curve.", ar: "لوحة خلفية بيكيني بقصة رشيقة ومنحنى ساق عالٍ يبرز القوام." },
      gussetDesc: { en: "Narrow breathable cotton crotch gusset tailored for bikini proportions.", ar: "دكة قطنية مسامية رفيعة ومفصلة بقياسات البيكيني الرشيقة." },
      waistElasticDesc: { en: "Ultra-slim encased elastic waistband lying flat on the lower hips.", ar: "شريط خصر مطاطي رفيع مغلف بالقماش يستقر مسطحاً على الورك المنخفض." },
      legElasticDesc: { en: "Narrow bound elastic edging following the curved bikini leg line.", ar: "شريط مطاطي رفيع مغلف يتبع انحناءات فتحة ساق البيكيني بدقة." },
    }));

  def("wu04", "women", "Sage Green Ribbed Cotton Hipster Brief", "سروال داخلي هيبستر أخضر مريمي من التريكو المضلع", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise hipster brief tailored from stretchy sage green ribbed cotton, featuring a wide supportive waistband, moderate hip bands, and clean coverstitched leg openings with full rear coverage.",
    "سروال داخلي هيبستر منخفض الخصر من قطن الريب الأخضر المريمي المطاطي، بحزام خصر عريض وداعم، وجوانب ورك متوسطة وفتحات ساق بدرزات تغطية مزدوجة متينة.",
    (m) => briefPieces(m, {
      rise: "low", legCut: "hipster", coverage: 1.0,
      frontDesc: { en: "Sage green textured ribbed cotton front panel sitting low on the hip bones.", ar: "لوحة أمامية من قطن الريب المضلع الأخضر تستقر على عظام الورك." },
      backDesc: { en: "Stretchy ribbed back panel offering flexible everyday hip and seat coverage.", ar: "لوحة خلفية مضلعة مرنة توفر تغطية مريحة وعملية للمقعد." },
      gussetDesc: { en: "Breathable smooth knit cotton gusset preventing ribbed texture contact.", ar: "دكة قطنية ناعمة ومسامية تمنع ملامسة الملمس المضلع للمناطق الحساسة." },
      waistElasticDesc: { en: "Wide ribbed knit elastic waistband providing secure athletic hold.", ar: "حزام خصر عريض من تريكو الريب المطاطي يمنح ثباتاً محكماً ورياضياً." },
      legElasticDesc: { en: "Twin-needle coverstitched elastic leg opening ensuring flexible retention.", ar: "فتحة ساق بدرزات تغطية مزدوجة مطاطية تضمن ثباتاً مرناً." },
    }));

  def("wu05", "women", "Navy Blue Modal Stretch Boyshort Brief", "سروال داخلي بويشورت كحلي من المودال المرن", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise women's boyshort brief crafted from buttery-soft deep navy modal jersey, featuring a squared horizontal leg line extending down the upper thigh, flat waistband, and full anti-chafing coverage.",
    "سروال داخلي بويشورت نسائي متوسط الارتفاع من جيرسيه المودال الكحلي فائق النعومة، بقصة ساق مربعة أفقية تمتد لأعلى الفخذ، وحزام خصر مسطح وتغطية كاملة مانعة للاحتكاك.",
    (m) => briefPieces(m, {
      rise: "mid", legCut: "boyshort", coverage: 1.1,
      frontDesc: { en: "Navy modal jersey front panel with squared horizontal upper-thigh extension.", ar: "لوحة أمامية من جيرسيه المودال الكحلي بامتداد أفقي مربع لأعلى الفخذ." },
      backDesc: { en: "Full boyshort back panel wrapping completely under the buttocks for anti-chafing comfort.", ar: "لوحة خلفية كاملة للبويشورت تلتف أسفل المقعد بالكامل لمنع الاحتكاك." },
      gussetDesc: { en: "Extended rectangular modal-lined crotch gusset for superior thigh freedom.", ar: "دكة مبطنة بالمودال ممتدة تمنح حرية استثنائية لحركة الفخذين." },
      waistElasticDesc: { en: "Enclosed flat modal waistband sitting snugly without digging into the waist.", ar: "حزام خصر مغلف من المودال المسطح يثبت بنعومة دون ضغط." },
      legElasticDesc: { en: "Coverstitched hemmed leg band sealing the lower thigh opening.", ar: "حاشية ساق بدرزة تغطية مزدوجة مطوية تثبت فتحة الفخذ السفلية." },
    }));

  def("wu06", "women", "Ivory High-Rise Full-Coverage Maxi Brief", "سروال داخلي ماكسي عاجي عالي الخصر بتغطية كاملة", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Comfortable high-rise maxi brief in premium ivory combed cotton, offering maximum hip and tummy coverage, an encased non-pinch waistband, soft bound leg bands, and a breathable double-layered gusset.",
    "سروال داخلي ماكسي عالي الخصر من القطن الممشط العاجي الفاخر، يوفر أقصى تغطية للورك والبطن، بحزام خصر مبطن مريح، وأشرطة ساق ناعمة ودكة مزدوجة مسامية.",
    (m) => briefPieces(m, {
      rise: "high", legCut: "full", coverage: 1.15,
      frontDesc: { en: "High-rise ivory combed cotton front panel offering generous abdominal coverage.", ar: "لوحة أمامية عالية الخصر من القطن العاجي الممشط بتغطية سخية للبطن." },
      backDesc: { en: "Deep maxi back panel with full seat wrap-around and ergonomic curve.", ar: "لوحة خلفية ماكسي عميقة تلتف بالكامل حول المقعد بانحناء مريح." },
      gussetDesc: { en: "Double-layered 100% combed cotton gusset for peak softness and absorption.", ar: "دكة قطنية ممشطة مزدوجة الطبقة بنعومة فائقة وامتصاص مثالي." },
      waistElasticDesc: { en: "Comfort encased non-pinch elastic waistband sitting at natural waist.", ar: "حزام خصر مطاطي مغلف بالقطن لا يضغط ويستقر عند الخصر الطبيعي." },
      legElasticDesc: { en: "Soft self-bound cotton elastic leg band preventing ride-up.", ar: "شريط ساق مطاطي ناعم مغلف بالقطن يمنع الارتفاع غير المريح." },
    }));

  // ================= MEN'S BRIEFS/TRUNKS (6) =================
  def("mu01", "men", "Navy Classic Jacquard-Waist Brief", "سروال داخلي كحلي كلاسيكي بحزام منسوج", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Classic mid-rise brief in combed navy cotton jersey, featuring a contrast woven jacquard waistband, contoured dual-layer front pouch, and full seat coverage.",
    "سروال داخلي كلاسيكي متوسط الارتفاع من قطن الجيرسيه الكحلي الممشط، بحزام خصر منسوج متباين، وجيب أمامي مزدوج مجسّم وتغطية كاملة للمقعد.",
    (m) => briefPieces(m, {
      rise: "mid", legCut: "full", coverage: 1.0,
      frontDesc: { en: "Navy cotton jersey contoured pouch front panel for breathable anatomical support.", ar: "لوحة أمامية من القطن الكحلي بجيب مجسم لدعم مسامي ومريح." },
      backDesc: { en: "Seamless-back full seat panel providing natural motion support.", ar: "لوحة خلفية كاملة للمقعد تمنح دعماً طبيعياً أثناء الحركة." },
      gussetDesc: { en: "Soft double-layer navy cotton crotch gusset.", ar: "دكة قطنية كحلية مزدوجة الطبقة عالية النعومة." },
      waistElasticDesc: { en: "Signature navy & slate woven jacquard plush waistband.", ar: "حزام خصر مطاطي منسوج بنقش جاكار كحلي ورمادي فخم." },
      legElasticDesc: { en: "Bound navy stretch leg trim preventing ride-up.", ar: "كنار ساق مطاطي كحلي مغلف يمنع الالتفاف." },
    }));
  def("mu02", "men", "Charcoal Heather Low-Rise Brief", "سروال داخلي رمادي فحمي منخفض الخصر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Modern low-rise brief in heathered charcoal cotton-elastane jersey trimmed with a crisp navy elastic waistband and contrast bound leg openings.",
    "سروال داخلي عصري منخفض الخصر من جيرسيه القطن والإيلاستين الرمادي الفحمي، بحزام خصر كحلي متباين وحواف ساق مقفلة بكنار نظيف.",
    (m) => briefPieces(m, {
      rise: "low", legCut: "hipster", coverage: 1.0,
      frontDesc: { en: "Charcoal heather low-rise contoured front panel.", ar: "لوحة أمامية منخفضة الخصر من الجيرسيه الرمادي الفحمي." },
      backDesc: { en: "Tailored low-rise charcoal heather seat panel.", ar: "لوحة خلفية مفصلة منخفضة الخصر للمقعد باللون الرمادي الفحمي." },
      gussetDesc: { en: "Cotton-modal lined gusset for softness.", ar: "دكة مبطنة بمزيج القطن والمودال للنعومة." },
      waistElasticDesc: { en: "Deep navy striped low-profile elastic waistband.", ar: "حزام خصر مطاطي رفيع بخطوط كحلية أنيقة." },
      legElasticDesc: { en: "Contrast navy bound stretch leg binding.", ar: "شريط ساق مطاطي بلون كحلي متباين." },
    }));
  def("mu03", "men", "Navy Performance Boxer Brief", "بوكسر داخلي كحلي رياضي متوسط الطول", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-thigh navy modal performance boxer brief with a brushed metallic-silver waistband, ergonomic front pouch, and flatlock no-chafe thigh hems.",
    "بوكسر داخلي كحلي بطول منتصف الفخذ من قماش المودال الرياضي، بحزام فضي مصقول وجيب أمامي مريح وحواف فخذ بدرزات مسطحة مانعة للاحتكاك.",
    (m) => briefPieces(m, {
      rise: "mid", legCut: "full", coverage: 1.0, legLength: 9,
      frontDesc: { en: "Navy modal performance front panel extended into contoured upper-thigh panels.", ar: "لوحة أمامية من المودال الكحلي تمتد بانتظام نحو أعلى الفخذ." },
      backDesc: { en: "No-center-seam navy modal seat panel preventing bunching.", ar: "لوحة مقعد بدون درزة وسطى تمنع التكتل." },
      gussetDesc: { en: "Breathable contoured crotch panel joining front and thigh lines.", ar: "دكة مسامية تصل بين المقدمة وامتداد الفخذ بسلاسة." },
      waistElasticDesc: { en: "Brushed silver-slate embossed elastic waistband.", ar: "حزام خصر مطاطي بلون فضي مصقول بنقش بارز." },
      legElasticDesc: { en: "Flatlock hemmed thigh cuffs preventing ride-up.", ar: "أساور فخذ بدرزة مسطحة تمنع ارتفاع البوكسر." },
    }));
  def("mu04", "men", "Burgundy Modal Stretch Trunk", "ترنك داخلي عنابي من المودال المرن", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Short square-leg trunk in rich burgundy micromodal jersey with a matte charcoal waistband and clean hemmed short thigh line.",
    "ترنك داخلي بقصة ساق مربعة قصيرة من المايكرومودال العنابي الغني، بحزام فحمي مطفي وامتداد فخذ قصير نظيف التشطيب.",
    (m) => briefPieces(m, {
      rise: "low", legCut: "boyshort", coverage: 1.0, legLength: 5,
      frontDesc: { en: "Burgundy micromodal low-rise trunk front panel.", ar: "لوحة أمامية من المودال العنابي منخفضة الخصر." },
      backDesc: { en: "Sculpted square-hem trunk seat panel.", ar: "لوحة خلفية مجسّمة بحافة مربعة للترنك." },
      gussetDesc: { en: "Flat-stitched modal crotch gusset.", ar: "دكة مودال مخيطة بدرزة مسطحة ناعمة." },
      waistElasticDesc: { en: "Matte charcoal & pinstripe waistband.", ar: "حزام خصر مطاطي فحمي بخط رفيع." },
      legElasticDesc: { en: "Twin-needle hemmed short trunk leg trim.", ar: "تشطيب ساق الترنك القصير بدرزة إبرتين." },
    }));
  def("mu05", "men", "Charcoal Contrast-Seam Athletic Brief", "سروال داخلي رياضي فحمي بدرزات متباينة", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "High-cut athletic sport brief in cool-touch charcoal microfiber highlighted with neon lime contrast flatlock seams and an active support pouch.",
    "سروال داخلي رياضي بفتحة ساق عالية من المايكروفايبر الفحمي سريع الجفاف، مزين بدرزات مسطحة متباينة بلون أخضر ليموني وجيب دعم رياضي.",
    (m) => briefPieces(m, {
      rise: "mid", legCut: "bikini", coverage: 1.0,
      frontDesc: { en: "Charcoal microfiber athletic front with neon-lime contrast pouch framing.", ar: "لوحة أمامية رياضية فحمية بتأطير درزات ليمونية متباينة." },
      backDesc: { en: "Active high-mobility seat panel with flatlock seam curves.", ar: "لوحة مقعد رياضية لحرية حركة قصوى مع درزات مسطحة." },
      gussetDesc: { en: "Ventilated stretch microfiber crotch gusset.", ar: "دكة مايكروفايبر مرنة عالية التهوية." },
      waistElasticDesc: { en: "High-recovery matte charcoal performance waistband.", ar: "حزام خصر رياضي فحمي عالي الثبات." },
      legElasticDesc: { en: "Smooth high-cut elastic binding with contrast stitching.", ar: "كنار ساق رياضي مرتفع بدرزات متباينة." },
    }));
  def("mu06", "men", "Crisp White Ribbed Full-Rise Brief", "سروال داخلي أبيض مضلع عالي الخصر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Traditional full-rise brief in crisp white combed rib cotton, designed with generous seat depth and an encased plush cotton-covered waistband.",
    "سروال داخلي كلاسيكي عالي الخصر من القطن الممشط المضلع الأبيض الناصع، بعمق مقعد سخي وحزام خصر مبطن ومغلف بالقطن.",
    (m) => briefPieces(m, {
      rise: "high", legCut: "full", coverage: 1.15,
      frontDesc: { en: "Full-rise crisp white ribbed cotton front panel with traditional vertical fly overlap.", ar: "لوحة أمامية عالية من القطن المضلع الأبيض." },
      backDesc: { en: "Full-coverage white rib-knit seat panel.", ar: "لوحة مقعد كاملة التغطية من القطن المضلع الأبيض." },
      gussetDesc: { en: "Soft double-layer combed white cotton gusset.", ar: "دكة قطنية بيضاء ناعمة مزدوجة الطبقة." },
      waistElasticDesc: { en: "Crisp white rib-trimmed tonal elastic waistband.", ar: "حزام خصر مطاطي أبيض ناعم ومتناسق." },
      legElasticDesc: { en: "Reinforced white rib-bound leg openings.", ar: "فتحات ساق مغلفة بشريط مضلع أبيض متين." },
    }));

  // ================= GIRLS' BRIEFS (6) =================
  def("gu01", "girls", "Blush Cotton Picot-Trim Brief", "سروال داخلي قطني وردي ناعم بحافة بيكو", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Soft everyday mid-rise girls' brief in breathable blush cotton knit edged with delicate picot lace at the waist and curved leg openings.",
    "سروال داخلي يومي ناعم للبنات متوسط الارتفاع من قطن التريكو الوردي الفاتح، مزين بحافة دانتيل بيكو رقيقة على الخصر وفتحات الساق.",
    (m) => briefPieces(m, {
      rise: "mid", legCut: "full", coverage: 1.0,
      frontDesc: { en: "Soft blush combed cotton front panel with gentle waist scoop.", ar: "لوحة أمامية من القطن الوردي الناعم بانحناء مريح للخصر." },
      backDesc: { en: "Full-coverage blush jersey seat panel for comfortable movement.", ar: "لوحة خلفية كاملة من الجيرسيه الوردي لحركة مريحة." },
      gussetDesc: { en: "100% pure soft cotton inner crotch gusset.", ar: "دكة قطنية نقية 100% فائقة النعومة." },
      waistElasticDesc: { en: "Delicate blush picot-edged soft elastic waistband.", ar: "حزام خصر مطاطي ناعم بحافة بيكو رقيقة." },
      legElasticDesc: { en: "Scalloped picot trim elastic edging each leg opening.", ar: "شريط مطاطي مقوس بالبيكو يشطب فتحة الساق بلطف." },
    }));
  def("gu02", "girls", "Butter-Yellow High-Waist Bow Brief", "سروال داخلي أصفر ناعم عالي الخصر بفيونكة", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "High-rise girls' brief in pastel butter-yellow cotton interlock with a sweet center-front satin ribbon bow and soft bound edges.",
    "سروال داخلي بناتي عالي الخصر من قطن الإنترلوك الأصفر الباستيلي، مزين بفيونكة ساتان رقيقة في الأمام وحواف مغلفة ناعمة.",
    (m) => briefPieces(m, {
      rise: "high", legCut: "full", coverage: 1.0,
      frontDesc: { en: "Pastel yellow high-rise cotton interlock front panel.", ar: "لوحة أمامية عالية الخصر من القطن الأصفر الناعم." },
      backDesc: { en: "Full high-rise back seat panel staying securely in place.", ar: "لوحة مقعد عالية التغطية تثبت براحة دون انزلاق." },
      gussetDesc: { en: "Soft ivory-yellow combed cotton crotch gusset.", ar: "دكة قطنية ممشطة فائقة النعومة." },
      waistElasticDesc: { en: "Wide butter-yellow comfort encased waistband.", ar: "حزام خصر عريض مغلف بالقطن الأصفر المريح." },
      legElasticDesc: { en: "Self-bound tonal stretch cotton leg openings.", ar: "فتحات ساق مغلفة بشريط قطني مرن متناغم." },
    }));
  def("gu03", "girls", "Sky-Blue Dot Cotton Bikini Brief", "سروال داخلي بيكيني أزرق سماوي منقّط", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Playful low-rise girls' bikini brief in sky-blue polka-dot cotton knit trimmed with crisp white elastic bands at the waist and legs.",
    "سروال داخلي بيكيني للبنات منخفض الخصر من قطن أزرق سماوي منقّط بأبيض ناعم، مع أشرطة مطاطية بيضاء نظيفة على الخصر والساق.",
    (m) => briefPieces(m, {
      rise: "low", legCut: "bikini", coverage: 0.95,
      frontDesc: { en: "Sky-blue polka-dot cotton bikini front panel.", ar: "لوحة أمامية بيكيني من القطن الأزرق السماوي المنقط." },
      backDesc: { en: "Contoured cotton bikini back panel.", ar: "لوحة خلفية بيكيني مفصلة من القطن المنقط." },
      gussetDesc: { en: "White combed cotton interior crotch gusset.", ar: "دكة داخلية من القطن الأبيض الممشط." },
      waistElasticDesc: { en: "Crisp white soft encased elastic waistband.", ar: "حزام خصر مطاطي أبيض ناعم التشطيب." },
      legElasticDesc: { en: "White stretch binding along the bikini leg curve.", ar: "شريط مطاطي أبيض رفيع يحدّد فتحة ساق البيكيني." },
    }));
  def("gu04", "girls", "Pastel Striped Cotton Hipster Brief", "سروال داخلي هيبستر قطني مقلم بألوان باستيل", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise hipster brief in yarn-dyed lavender and mint striped cotton jersey with a smooth pastel heather waistband and comfortable leg cut.",
    "سروال داخلي هيبستر منخفض الخصر من قطن الجيرسيه المقلم بدرجات اللافندر والنعناع، بحزام خصر ناعم وقصة ساق مريحة.",
    (m) => briefPieces(m, {
      rise: "low", legCut: "hipster", coverage: 1.0,
      frontDesc: { en: "Lavender and mint striped cotton hipster front panel.", ar: "لوحة أمامية هيبستر مقلمة بدرجات اللافندر والنعناع." },
      backDesc: { en: "Matching pastel striped hipster seat panel.", ar: "لوحة خلفية مقلمة متناسقة للورك والمقعد." },
      gussetDesc: { en: "Breathable plain-knit cotton crotch gusset.", ar: "دكة قطنية سادة عالية التهوية." },
      waistElasticDesc: { en: "Soft lavender heather covered elastic waistband.", ar: "حزام خصر مغلف بلون لافندر باهت مريح." },
      legElasticDesc: { en: "Flatlocked stretch leg trim aligned to the hip curve.", ar: "حافة ساق مطاطية مسطحة تتبع منحنى الورك." },
    }));
  def("gu05", "girls", "Heather Gray Contrast-Stitch Boyshort", "سروال داخلي بويشورت رمادي بدرزات مرجانية", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Active girls' boyshort brief in soft heather gray modal-cotton with playful coral-pink coverstitch seams and squared upper-thigh coverage.",
    "سروال داخلي بويشورت مريح للبنات من المودال والقطن الرمادي الميلانج، بدرزات تغطية مرجانية ناعمة وقصة مربعة لأعلى الفخذ.",
    (m) => briefPieces(m, {
      rise: "mid", legCut: "boyshort", coverage: 1.1,
      frontDesc: { en: "Heather gray modal-cotton boyshort front with squared thigh edges.", ar: "لوحة أمامية بويشورت رمادية بحواف فخذ مربعة مريحة." },
      backDesc: { en: "Full anti-chafe gray boyshort back panel.", ar: "لوحة خلفية كاملة تمنع الاحتكاك طوال اليوم." },
      gussetDesc: { en: "Smooth brushed cotton modal interior gusset.", ar: "دكة داخلية ناعمة من القطن والمودال." },
      waistElasticDesc: { en: "Coral-trimmed heather gray comfort waistband.", ar: "حزام خصر رمادي مريح بخط درزة مرجاني." },
      legElasticDesc: { en: "Twin-needle coral coverstitched lower thigh hems.", ar: "حواف فخذ سفلية بدرزات تغطية مرجانية مرنة." },
    }));
  def("gu06", "girls", "Dusty-Blush Full-Coverage Brief", "سروال داخلي وردي مغبر بتغطية كاملة", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Maximum-coverage high-rise brief in smooth dusty blush combed cotton jersey, finished with a dainty rosette bow and enclosed plush waistband.",
    "سروال داخلي عالي الخصر بتغطية كاملة من قطن الجيرسيه الوردي المغبر الممشط، مزين بفيونكة رقيقة وحزام خصر مبطن.",
    (m) => briefPieces(m, {
      rise: "high", legCut: "full", coverage: 1.15,
      frontDesc: { en: "Full high-rise dusty blush front panel with center-front bow detail.", ar: "لوحة أمامية عالية التغطية باللون الوردي المغبر." },
      backDesc: { en: "Generous full-seat panel offering soft all-day hold.", ar: "لوحة مقعد سخية توفر ثباتاً ناعماً طوال اليوم." },
      gussetDesc: { en: "Double-layer dusty blush cotton gusset.", ar: "دكة قطنية مزدوجة الطبقة متناسقة اللون." },
      waistElasticDesc: { en: "Enclosed soft dusty-blush elastic waistband.", ar: "حزام خصر مطاطي مبطن ومغلف بلطف." },
      legElasticDesc: { en: "Softly bound stretch leg trims preventing pinching.", ar: "أشرطة ساق ناعمة مرنة تمنع الضغط على الجلد." },
    }));

  // ================= BOYS' BRIEFS/TRUNKS (6) =================
  def("bu01", "boys", "Heather Gray Striped-Waist Boxer Brief", "بوكسر داخلي رمادي بحزام مخطط", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Everyday boys' mid-thigh boxer brief in soft heather gray cotton-stretch jersey with a bold navy-white striped elastic waistband and comfortable pouch.",
    "بوكسر داخلي يومي للأولاد بطول منتصف الفخذ من جيرسيه القطن المرن الرمادي الميلانج، بحزام خصر مطاطي مخطط بالكحلي والأبيض وقصة مريحة.",
    (m) => briefPieces(m, {
      rise: "mid", legCut: "full", coverage: 1.0, legLength: 8,
      frontDesc: { en: "Heather gray stretch cotton boxer-brief front panel extending down the upper thigh.", ar: "لوحة أمامية من القطن الرمادي الميلانج تمتد بنعومة لأعلى الفخذ." },
      backDesc: { en: "Contoured heather gray back seat panel without a rubbing center seam.", ar: "لوحة مقعد رمادية مفصلة بدون درزة وسطى مزعجة." },
      gussetDesc: { en: "Double-lined soft cotton-jersey crotch panel.", ar: "دكة قطنية مزدوجة التبطين عالية النعومة." },
      waistElasticDesc: { en: "Navy, white & charcoal striped jacquard waistband.", ar: "حزام خصر مطاطي مخطط بالكحلي والأبيض والفحمي." },
      legElasticDesc: { en: "Coverstitched heather gray thigh hems holding smoothly in place.", ar: "حاشية فخذ رمادية بدرزات مسطحة تثبت دون التفاف." },
    }));
  def("bu02", "boys", "Sky-Blue Heather Low-Rise Brief", "سروال داخلي أزرق سماوي منخفض الخصر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Soft low-rise boys' brief in sky-blue cotton jersey topped with a crisp white and navy striped waistband and smooth navy leg bindings.",
    "سروال داخلي للأولاد منخفض الخصر من قطن الجيرسيه الأزرق السماوي، بحزام خصر أبيض مخطط بالكحلي وحواف ساق كحلية مريحة.",
    (m) => briefPieces(m, {
      rise: "low", legCut: "full", coverage: 1.0,
      frontDesc: { en: "Sky-blue cotton low-rise front pouch panel.", ar: "لوحة أمامية منخفضة الخصر من القطن الأزرق السماوي." },
      backDesc: { en: "Smooth full-coverage sky-blue seat panel.", ar: "لوحة مقعد ناعمة كاملة التغطية باللون الأزرق السماوي." },
      gussetDesc: { en: "Breathable cotton-rich crotch gusset.", ar: "دكة قطنية عالية التهوية." },
      waistElasticDesc: { en: "White plush elastic waistband with navy stripe accent.", ar: "حزام خصر أبيض ناعم بخطوط كحلية متباينة." },
      legElasticDesc: { en: "Navy stretch-bound classic brief leg openings.", ar: "فتحات ساق كلاسيكية مغلفة بشريط كحلي مرن." },
    }));
  def("bu03", "boys", "Charcoal Embossed-Waist Boxer Brief", "بوكسر داخلي فحمي بحزام بارز", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Active boys' mid-thigh boxer brief in deep charcoal combed cotton stretch with a black tonal embossed waistband and stay-put leg hems.",
    "بوكسر داخلي للأولاد بطول منتصف الفخذ من القطن الممشط الفحمي الداكن، بحزام خصر أسود بنقش بارز وحواف فخذ ثابتة.",
    (m) => briefPieces(m, {
      rise: "mid", legCut: "full", coverage: 1.0, legLength: 9,
      frontDesc: { en: "Charcoal cotton-stretch mid-thigh boxer front with contoured pouch.", ar: "لوحة أمامية للبوكسر الفحمي بجيب مريح وامتداد للفخذ." },
      backDesc: { en: "Durable full seat panel engineered for school and sports.", ar: "لوحة مقعد متينة مصممة للنشاط والحركة اليومية." },
      gussetDesc: { en: "No-chafe charcoal cotton interior gusset.", ar: "دكة داخلية فحمية مانعة للاحتكاك." },
      waistElasticDesc: { en: "Tonal jet-black embossed stretch waistband.", ar: "حزام خصر أسود مطاطي بنقش متناغم." },
      legElasticDesc: { en: "Flat-hemmed mid-thigh openings with high recovery.", ar: "حواف فخذ مسطحة باسترجاع مرن ممتاز." },
    }));
  def("bu04", "boys", "Cobalt Blue Contrast-Waist Trunk", "ترنك داخلي أزرق كوبالت بحزام متباين", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Compact low-rise trunk in vibrant cobalt blue jersey with a light heather-gray elastic waistband and matching gray leg-hem bindings.",
    "ترنك داخلي قصير للأولاد من الجيرسيه الأزرق الكوبالت الحيوي، بحزام خصر رمادي فاتح متباين وحواف فخذ متناسقة.",
    (m) => briefPieces(m, {
      rise: "low", legCut: "boyshort", coverage: 1.0, legLength: 5,
      frontDesc: { en: "Cobalt blue compact low-rise trunk front panel.", ar: "لوحة أمامية قصيرة من الجيرسيه الأزرق الكوبالت." },
      backDesc: { en: "Square-cut blue trunk seat panel.", ar: "لوحة خلفية مربعة القصة للترنك الأزرق." },
      gussetDesc: { en: "Reinforced cobalt cotton crotch gusset.", ar: "دكة قطنية مقواة متناسقة اللون." },
      waistElasticDesc: { en: "Light heather-gray soft woven elastic waistband.", ar: "حزام خصر رمادي فاتح منسوج بنعومة." },
      legElasticDesc: { en: "Contrast heather-gray bound short-trunk hems.", ar: "حواف الترنك القصير محددة بشريط رمادي متباين." },
    }));
  def("bu05", "boys", "Crimson & Carbon Mesh Athletic Brief", "سروال داخلي رياضي قرمزي وأسود بشبك جانبي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Sport-cut boys' brief combining a crimson microfiber contoured body with carbon-black side mesh contrast and high-cut athletic leg freedom.",
    "سروال داخلي رياضي للأولاد يجمع بين المايكروفايبر القرمزي وجوانب شبكية فحمية سوداء بفتحة ساق رياضية حرة الحركة.",
    (m) => briefPieces(m, {
      rise: "mid", legCut: "bikini", coverage: 1.0,
      frontDesc: { en: "Crimson moisture-wicking microfiber athletic front panel.", ar: "لوحة أمامية رياضية قرمزية ماصة للرطوبة." },
      backDesc: { en: "Crimson & carbon mesh panel offering cooling ventilation.", ar: "لوحة خلفية تجمع القرمزي والأسود الشبكي لتهوية إضافية." },
      gussetDesc: { en: "Soft athletic cotton-lined interior gusset.", ar: "دكة داخلية رياضية مبطنة بالقطن الناعم." },
      waistElasticDesc: { en: "Carbon-black striped performance elastic waistband.", ar: "حزام خصر رياضي أسود فحمي متين." },
      legElasticDesc: { en: "High-cut black elastic leg binding for agile movement.", ar: "كنار ساق رياضي أسود مرتفع لحركة رشيقة." },
    }));
  def("bu06", "boys", "Crisp White Ribbed Full-Rise Brief", "سروال داخلي أبيض مضلع عالي الخصر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Classic boys' full-rise brief in breathable white ribbed cotton with a soft fabric-covered waistband and durable ribbed leg bindings.",
    "سروال داخلي كلاسيكي عالي الخصر للأولاد من القطن الأبيض المضلع، بحزام خصر مغلف ناعم وحواف ساق متينة.",
    (m) => briefPieces(m, {
      rise: "high", legCut: "full", coverage: 1.15,
      frontDesc: { en: "Crisp white ribbed cotton high-rise front panel.", ar: "لوحة أمامية عالية الخصر من القطن الأبيض المضلع." },
      backDesc: { en: "Full-rise white rib-knit seat coverage.", ar: "تغطية كاملة للمقعد من التريكو الأبيض المضلع." },
      gussetDesc: { en: "Pure white double-layer combed cotton gusset.", ar: "دكة قطنية بيضاء نقية مزدوجة الطبقة." },
      waistElasticDesc: { en: "Encased soft white cotton elastic waistband.", ar: "حزام خصر أبيض مغلف بالقطن لا يضغط." },
      legElasticDesc: { en: "White rib-trimmed curved leg openings.", ar: "فتحات ساق منحنية مشطبة بشريط مضلع أبيض." },
    }));

  // ================= WOMEN'S BRAS (10) =================
  def("wb01", "women", "Rose-Gold Satin & Lace Soft-Cup Bra", "حمالة صدر وردية ذهبية من الساتان والدانتيل", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Romantic soft-cup wireless bra in rose-gold silk satin layered with floral eyelash lace, finished with delicate scalloped edges and satin straps.",
    "حمالة صدر رومانسية بدون سلك من الساتان الوردي الذهبي المغطى بدانتيل زهري ناعم، بحواف مقوسة رقيقة وحمالات ساتان قابلة للتعديل.",
    (m) => braPieces(m, { cupDepthF: 1.0, strap: "standard" }));
  def("wb02", "women", "Champagne Lace Balconette Bra", "حمالة صدر بالكونيت شمبانيا بالدانتيل", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Uplifting wide-set champagne satin and sheer floral lace balconette bra with horizontal cup décolleté and delicate scalloped lace cradle.",
    "حمالة صدر بالكونيت بلون شمبانيا من الساتان والدانتيل الزهري الشفاف، بحمالات متباعدة وقصة أفقية تمنح رفعاً أنيقاً تحت الفتحات الواسعة.",
    (m) => braPieces(m, { cupDepthF: 0.85, wide: true, strap: "standard" }));
  def("wb03", "women", "Burgundy Satin Plunge Bra", "حمالة صدر بلانج عنابية من الساتان والدانتيل", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Alluring deep burgundy satin and geometric lace plunge bra with an ultra-low narrow center bridge engineered for deep-V necklines.",
    "حمالة صدر بلانج أنيقة بلون عنابي عميق من الساتان والدانتيل الهندسي، بجسر أوسط منخفض للغاية يناسب فتحات الرقبة العميقة على شكل V.",
    (m) => braPieces(m, { cupDepthF: 1.0, plunge: true, strap: "standard" }));
  def("wb04", "women", "Slate Blue Wide-Strap Full-Coverage Bra", "حمالة صدر زرقاء رمادية بتغطية كاملة وحمالات عريضة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Supportive full-coverage slate blue microfiber bra featuring deep contoured cups, an extra-wide smoothing wing band, and cushioned wide shoulder straps.",
    "حمالة صدر داعمة بتغطية كاملة من المايكروفايبر الأزرق الرمادي، بكؤوس عميقة مجسّمة وحزام جانبي عريض للتنعيم وحمالات كتف عريضة مريحة.",
    (m) => braPieces(m, { cupDepthF: 1.25, bandWidthF: 1.25, strap: "standard", wideStrap: true }));
  def("wb05", "women", "Dusty Mauve Ribbed Racerback Bralette", "بروليت مضلعة بلون موف بظهر رياضي", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Soft pull-on dusty mauve ribbed modal bralette with gentle bust shaping and center-angled racerback straps for sleeveless layering.",
    "بروليت ناعمة بلون موف مغبر من تريكو المودال المضلع، بتشكيل لطيف للصدر وحمالات ظهر متقاطعة مثالية تحت البلوزات بلا أكمام.",
    (m) => braPieces(m, { cupDepthF: 0.9, strap: "racerback" }));
  def("wb06", "women", "Ivory Cotton Triangle Bralette", "بروليت مثلثة عاجية من القطن", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Minimalist ivory organic combed cotton triangle bralette with dartless natural darts, slim plush underband, and delicate adjustable straps.",
    "بروليت مثلثة بسيطة من القطن العضوي الممشط العاجي، بقصة طبيعية خفيفة وشريط أسفل الصدر ناعم وحمالات رفيعة قابلة للتعديل.",
    (m) => braPieces(m, { cupDepthF: 0.75, triangle: true, strap: "standard" }));
  def("wb07", "women", "Emerald Satin & Lace Longline Bralette", "بروليت زمردية ممتدة من الساتان والدانتيل", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Luxurious deep emerald satin and scalloped eyelash lace longline bralette extending smoothly across the ribcage for graceful support.",
    "بروليت فاخرة ممتدة الخصر بلون زمردي عميق من الساتان والدانتيل المقوس، تمتد بأناقة فوق الأضلاع لتمنح دعماً ومظهراً راقياً.",
    (m) => braPieces(m, { cupDepthF: 0.9, longline: true, strap: "standard" }));
  def("wb08", "women", "Jet Black Ribbed Bandeau Bra", "حمالة صدر باندو سوداء مضلعة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Sleek strapless jet-black ribbed cotton-stretch bandeau bra with a shallow seamless silhouette tailored cleanly beneath bare-shoulder tops.",
    "حمالة صدر باندو سوداء أنيقة بدون حمالات من التريكو القطني المضلع، بقصة أفقية نظيفة تختفي بسلاسة تحت التوبات مكشوفة الكتفين.",
    (m) => braPieces(m, { cupDepthF: 0.4, strap: "none" }));
  def("wb09", "women", "Cobalt Mesh Racerback Sport Bra", "حمالة صدر رياضية زرقاء كوبالت بشبك متقاطع", BRA_TAG.en, BRA_TAG.ar, "bra",
    "High-support cobalt blue performance interlock sport bra accented with breathable black power-mesh racerback panels and a firm elastic bottom band.",
    "حمالة صدر رياضية عالية الدعم باللون الأزرق الكوبالت، مزودة بألواح شبك سوداء عالية التهوية في الظهر الرياضي وشريط سفلي مطاطي متين.",
    (m) => sportBraPieces(m, { racer: true }));
  def("wb10", "women", "Warm Nude Molded Strapless Bra", "حمالة صدر نيود بدون حمالات", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Smooth warm-nude brushed microfiber strapless bra featuring structured cup projection and an extra-wide gripper underband that stays securely in place.",
    "حمالة صدر ناعمة بدون حمالات بلون نيود دافئ من المايكروفايبر، بكؤوس مجسّمة وحزام عريض عالي الثبات يبقى ثابتاً دون انزلاق.",
    (m) => braPieces(m, { cupDepthF: 1.05, bandWidthF: 1.3, strap: "none" }));

  // ================= GIRLS' BRAS (10) — soft training styles =================
  def("gb01", "girls", "White Cotton Triangle Training Bralette", "بروليت تدريب بيضاء مثلثة من القطن", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Pure white breathable cotton-jersey triangle training bralette with a soft encased underband and delicate center satin bow.",
    "بروليت تدريب بيضاء نقية من قطن الجيرسيه بقصة مثلثة ناعمة، وشريط أسفل الصدر مغلف بالقطن وفيونكة وسطى رقيقة.",
    (m) => braPieces(m, { cupDepthF: 0.7, triangle: true, strap: "standard" }));
  def("gb02", "girls", "Heather Gray Pink-Trim Racerback Bralette", "بروليت رمادية بحافة وردية وظهر رياضي", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Soft heather-gray stretch cotton racerback training bralette edged with pastel rose pink binding and wide stay-put straps.",
    "بروليت تدريب ناعمة باللون الرمادي الميلانج مع حواف وردية رقيقة وظهر رياضي متقاطع بحمالات عريضة ثابتة.",
    (m) => braPieces(m, { cupDepthF: 0.7, triangle: true, strap: "racerback", wideStrap: true }));
  def("gb03", "girls", "Mint Seamed Soft-Cup Bralette", "بروليت خضراء نعناعية بكأس ناعم مخيط", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Gentle mint-green combed cotton soft-cup bralette featuring soft shaping seams without rigid wires for developing comfort.",
    "بروليت ناعمة بلون أخضر نعناعي من القطن الممشط، بقصات تشكيل رقيقة بدون أي أسلاك صلبة لراحة ونمو مريح.",
    (m) => braPieces(m, { cupDepthF: 0.8, strap: "standard" }));
  def("gb04", "girls", "Dusty Rose Ribbed Crop Longline Bralette", "بروليت كروب مضلعة وردية ممتدة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Comfortable dusty-rose ribbed modal longline crop bralette with a wide ribcage band and soft supportive tank-style straps.",
    "بروليت كروب ممتدة بلون وردي مغبر من المودال المضلع، بحزام مضلع عريض وحمالات مريحة على شكل تانك توب.",
    (m) => braPieces(m, { cupDepthF: 0.75, longline: true, strap: "standard", wideStrap: true }));
  def("gb05", "girls", "Lavender Ruched Bandeau Training Bra", "حمالة صدر باندو لافندر مزمومة للتدريب", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Feather-light lavender cotton-modal bandeau training bra with gentle center ruching and a soft wire-free strapless silhouette.",
    "حمالة صدر باندو خفيفة باللون اللافندر من القطن والمودال، بكشكشة رقيقة في الوسط وتصميم بدون حمالات مريح.",
    (m) => braPieces(m, { cupDepthF: 0.35, strap: "none" }));
  def("gb06", "girls", "Peach White-Trim Cotton Bralette", "بروليت خوخية قطنية بحافة بيضاء", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Soft pastel peach cotton training bralette detailed with crisp white elastic edge binding and twin center buttons.",
    "بروليت تدريب ناعمة بلون خوخي باستيلي من القطن، محددة بشريط أبيض نظيف وأزرار أمامية صغيرة أنيقة.",
    (m) => braPieces(m, { cupDepthF: 0.7, triangle: true, strap: "standard" }));
  def("gb07", "girls", "Turquoise Stripe-Band Sport Bralette", "بروليت رياضية تركواز بشريط أبيض", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Active turquoise stretch performance sport bralette featuring a breathable racerback cutout and crisp white athletic logo underband.",
    "بروليت رياضية نشطة باللون التركواز من قماش رياضي مرن، بظهر رياضي متقاطع وشريط أسفل الصدر أبيض متين.",
    (m) => sportBraPieces(m, { racer: true }));
  def("gb08", "girls", "Pastel Yellow Wide-Strap Scoop Bralette", "بروليت صفراء باستيل برقبة سكوب وحمالات عريضة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Sunny butter-yellow cotton knit scoop-neck training bralette with comfy wide shoulder straps and a soft covered bottom band.",
    "بروليت تدريب بلون أصفر باستيلي من التريكو القطني برقبة سكوب مريحة وحمالات كتف عريضة وشريط سفلي مغلف.",
    (m) => braPieces(m, { cupDepthF: 0.72, wide: true, strap: "standard", wideStrap: true }));
  def("gb09", "girls", "Sky-Blue Heather Wide-Strap Bralette", "بروليت زرقاء سماوية بحمالات عريضة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Breathable sky-blue heathered cotton bralette cut with extra-wide cushioned shoulder straps to prevent slipping during active days.",
    "بروليت من القطن السماوي الميلانج عالية التهوية، مفصلة بحمالات كتف عريضة مبطنة تمنع الانزلاق طوال اليوم.",
    (m) => braPieces(m, { cupDepthF: 0.72, triangle: true, strap: "standard", wideStrap: true }));
  def("gb10", "girls", "Oatmeal Seamless Soft Crop Bralette", "بروليت كروب ناعمة بلون شوفان بلا درزات ظاهرة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Ultra-soft oatmeal modal-blend training crop bralette with minimal seams, zero hardware, and gentle second-skin stretch.",
    "بروليت كروب للتدريب بلون الشوفان من مزيج المودال فائق النعومة، بأقل درزات وبدون مشابك معدنية لتنعمي بإحساس البشرة الثانية.",
    (m) => braPieces(m, { cupDepthF: 0.65, triangle: true, strap: "standard" }));

  if (typeof window !== 'undefined') window.UnderwearLibrary = true;
})();
