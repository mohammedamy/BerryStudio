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
    const coverage = opts.coverage || 1.0;
    const legLength = opts.legLength || 0; // >0 = boxer-brief/trunk hem extension down the thigh

    const waistX = (front ? qw * 0.52 : qw * 0.56);
    const sideDX = rise * 0.35, sideDY = rise * 0.42; // shared side-seam vector, front == back
    const cornerX = waistX + sideDX, cornerY = 1.2 + sideDY;
    const hipX = (front ? qh * 0.58 : qh * 0.64) * coverage;
    const crotchDepth = qh * 0.32 * legF + legLength;
    const crotchY = cornerY + crotchDepth + (front ? 0 : 2);
    const crotchX = qh * 0.13;

    const waistSeg = [[0, 0], [waistX * 0.55, -1.4], [waistX, 1.2]];
    const legSeg = [[hipX, cornerY], [hipX * 0.5, crotchY * 0.68], [crotchX, crotchY]];

    const outline = [
      [0, 0],
      ...qBez(...waistSeg, 6),
      [cornerX, cornerY],
      [hipX, cornerY],
      ...qBez(...legSeg, 7),
      [0, crotchY],
    ];
    withCurves(outline, [
      { fromIdx: 0, toIdx: 6, ...qBezToCubic(...waistSeg) },
      { fromIdx: 8, toIdx: 15, ...qBezToCubic(...legSeg) },
    ]);
    outline.edges = [{ fromIdx: 6, toIdx: 7, seamId: 'briefSide' }];
    return outline;
  }
  function briefPieces(m, opts) {
    const qw = q(m.waist), qh = q(m.hips);
    const front = briefPanel(qw, qh, true, opts);
    const back = briefPanel(qw, qh, false, opts);
    const legLength = opts.legLength || 0;
    const frontLen = front[front.length - 1][1], backLen = back[back.length - 1][1];
    const gW = qh * 0.30, gH = qh * 0.34;
    const waistCirc = (qw * 2) * 1.85; // finished elastic waist, relaxed-to-stretched allowance
    const legCirc = (qh * 0.62 * (LEG_F[opts.legCut] || LEG_F.full) + legLength) * 2.3;

    const pieces = [
      // WP-58: grain used to be fixed cm points (y:4 to y:frontLen-4) —
      // for the shortest real style combination (low rise + bikini leg
      // cut, e.g. gu03), `frontLen` itself comes out under 8cm, so the
      // 2nd point landed ABOVE the 1st — the exact same "reads as 180°,
      // not 0°" symptom WP-57 already fixed on the bra Center Bridge
      // piece, same fix: proportional to the piece's own length instead
      // of a fixed cm margin.
      { key: "front", name: { en: "Front Panel", ar: "القطعة الأمامية" },
        desc: { en: "Front panel with a curved waist edge and a curved leg opening.", ar: "قطعة أمامية بحافة خصر منحنية وفتحة ساق منحنية." },
        outline: front, role: "brief-front", cutOnFold: true, edges: front.edges,
        grain: [[qw * 0.15, frontLen * 0.2], [qw * 0.15, frontLen * 0.85]] },
      { key: "back", name: { en: "Back Panel", ar: "القطعة الخلفية" },
        desc: { en: "Back panel, cut higher at the waist and deeper at the crotch than the front for real seat coverage.", ar: "قطعة خلفية أعلى عند الخصر وأعمق عند خط الجسم من الأمامية لتغطية حقيقية للمقعد." },
        outline: back, role: "brief-back", cutOnFold: true, edges: back.edges,
        grain: [[qw * 0.15, backLen * 0.2], [qw * 0.15, backLen * 0.85]] },
      { key: "gusset", name: { en: "Crotch Gusset", ar: "دكة الجسم" },
        desc: { en: "Curved cotton-lining gusset seamed into the crotch, cut on the fold.", ar: "دكة قطنية منحنية تُخاط عند خط الجسم، تُقص على الطية." },
        outline: gussetOval(gW, gH), role: "gusset", cutOnFold: true,
        grain: [[gW / 4, 2], [gW / 4, gH - 2]] },
      { key: "gussetLining", name: { en: "Gusset Lining", ar: "بطانة الدكة" },
        desc: { en: "Second gusset layer for opacity and comfort, cut on the fold.", ar: "طبقة ثانية للدكة لمزيد من التغطية والراحة، تُقص على الطية." },
        outline: gussetOval(gW, gH), role: "lining", cutOnFold: true,
        grain: [[gW / 4, 2], [gW / 4, gH - 2]] },
      { key: "waistElastic", name: { en: "Waist Elastic", ar: "أستك الخصر" },
        desc: { en: "Soft knit elastic stitched to the waist edge.", ar: "أستك ناعم يُخاط على حافة الخصر." },
        outline: elasticStrip(waistCirc), role: "elastic-band",
        grain: [[waistCirc / 2, 0.6], [waistCirc / 2, 1.6]] },
      { key: "legElastic", name: { en: "Leg Elastic", ar: "أستك فتحة الساق" },
        desc: { en: "Soft knit elastic stitched to each leg opening.", ar: "أستك ناعم يُخاط على كل فتحة ساق." },
        outline: elasticStrip(legCirc, 1.6), role: "elastic-band", bilateral: true,
        grain: [[legCirc / 2, 0.4], [legCirc / 2, 1.2]] },
    ];
    return pieces;
  }

  // ---------------- bras ----------------
  // Single-piece soft/molded cup (curved top/neckline edge, curved
  // side/armhole edge, curved bottom/band edge, straight inner edge against
  // the bridge) — a real, common commercial construction (most bralettes
  // and many everyday bras use exactly one visible cup panel), chosen over
  // a hand-split 2-piece seamed cup specifically to keep every curve
  // independently verifiable against self-intersection rather than relying
  // on an unverified hand-derived split of a more complex shape. Style
  // variety comes from real shape parameters, not a name change alone.
  function braCup(cupW, cupD, o) {
    o = o || {};
    const innerTopY = cupD * (o.plunge ? 0.30 : 0.12);
    const strapX = cupW * (o.wide ? 0.72 : 0.50);
    const sideY = cupD * (o.high ? 0.30 : 0.46);
    const sideCtrlX = o.triangle ? cupW * 1.0 : cupW * 1.08; // triangle: flatter side curve, less bowed out
    const bandCtrlY = o.triangle ? cupD * 0.92 : cupD * 1.05;

    const topSeg = [[0, innerTopY], [cupW * 0.35, -cupD * 0.06], [strapX, -cupD * 0.08]];
    const sideSeg = [[strapX, -cupD * 0.08], [sideCtrlX, cupD * 0.10], [cupW, sideY]];
    const botSeg = [[cupW, sideY], [cupW * 0.55, bandCtrlY], [cupW * 0.32, cupD]];

    const outline = [
      [0, innerTopY],
      ...qBez(...topSeg, 6),
      ...qBez(...sideSeg, 6),
      ...qBez(...botSeg, 7),
      [0, cupD * 0.80],
    ];
    return withCurves(outline, [
      { fromIdx: 0, toIdx: 6, ...qBezToCubic(...topSeg) },
      { fromIdx: 6, toIdx: 12, ...qBezToCubic(...sideSeg) },
      { fromIdx: 12, toIdx: 19, ...qBezToCubic(...botSeg) },
    ]);
  }
  // Band/wing strip with one gently curved top edge (follows the underbust
  // curve) and a straight bottom edge — same family used for the narrower
  // center-front bridge/gore piece (just a smaller w/h).
  function curvedBandPc(w, h, dip) {
    dip = dip != null ? dip : h * 0.18;
    const seg = [[0, 0], [w * 0.5, -dip], [w, 0]];
    const outline = [[0, h], [0, 0], ...qBez(...seg, 6), [w, h]];
    return withCurves(outline, [{ fromIdx: 1, toIdx: 7, ...qBezToCubic(...seg) }]);
  }
  function strapPc(len, w) { return [[0, 0], [w, 0], [w, len], [0, len]]; }

  function braPieces(m, opts) {
    const chestW = q(m.chest);
    const cupW = chestW * 0.34 * (opts.cupDepthF || 1);
    const cupD = chestW * 0.42 * (opts.cupDepthF || 1);
    const bandH = 5.5 * (opts.bandWidthF || 1) + (opts.longline ? 9 : 0);
    const cup = braCup(cupW, cupD, opts);
    const bridgeW = opts.plunge ? cupW * 0.18 : cupW * 0.30;
    const bandW = chestW * 0.62 * (opts.bandWidthF || 1);

    const pieces = [
      { key: "cup", name: { en: "Cup", ar: "الكأس" },
        desc: { en: "Curved soft cup, seamed at the underarm, top, and band edges; straight along the inner edge against the bridge.", ar: "كأس ناعم منحنٍ، مخيط عند الإبط والأعلى وحافة الحزام؛ مستقيم عند الحافة الداخلية الملاصقة للجسر." },
        outline: cup, role: "cup", bilateral: true,
        grain: [[cupW * 0.4, cupD * 0.1], [cupW * 0.4, cupD * 0.7]] },
      { key: "bridge", name: { en: "Center Bridge", ar: "الجسر الأوسط" },
        desc: { en: "Narrow center-front panel joining the two cups.", ar: "قطعة ضيقة في مقدمة الوسط تصل بين الكأسين." },
        outline: curvedBandPc(bridgeW, cupD * 0.55, cupD * 0.04), role: "other", cutOnFold: true,
        // WP-57 (docs/plan 4.md Phase 5): both grain points used to be
        // fixed cm values (y:2 and y:cupD*0.4) sized for a full-depth
        // adult cup. This piece's own height is `cupD * 0.55`, which for
        // six real shallow-cup patterns (cupDepthF <= ~0.7 — wb08,
        // gb01/02/05/06/10, mostly girls' training styles) is itself
        // BELOW 2cm — so the 1st point already sat outside the piece,
        // and for some of those six the 2nd point (cupD*0.4) landed
        // above the 1st, which checkGrainline's atan2 reads as 180°
        // rather than 0° (same vertical axis, but direction isn't
        // normalized) — the reported "90° off cardinal" symptom. Real
        // fix is proportional to this piece's own height, like the cup
        // piece just above already does, not another fixed-cm patch —
        // guarantees both points stay inside the piece and p2.y > p1.y
        // (matching every other grain declaration in this file) at any
        // size.
        grain: [[bridgeW / 2, cupD * 0.55 * 0.2], [bridgeW / 2, cupD * 0.55 * 0.8]] },
      { key: "band", name: { en: opts.longline ? "Longline Band" : "Band", ar: opts.longline ? "حزام ممتد" : "الحزام" },
        desc: { en: "Band/wing panel from the cup side around to the center back, with a curved top edge following the underbust.", ar: "قطعة الحزام/الجانب من جانب الكأس حتى وسط الظهر، بحافة علوية منحنية تتبع أسفل الصدر." },
        outline: curvedBandPc(bandW, bandH), role: "band", bilateral: true,
        grain: [[bandW / 2, 1.5], [bandW / 2, bandH - 1.5]] },
    ];
    if (opts.strap !== "none") {
      pieces.push({ key: "strap", name: { en: "Strap", ar: "الحمالة" },
        desc: { en: opts.strap === "racerback" ? "Racerback strap, angled in toward the center back." : "Adjustable shoulder strap.",
                ar: opts.strap === "racerback" ? "حمالة رياضية بظهر متقاطع، مائلة نحو وسط الظهر." : "حمالة كتف قابلة للتعديل." },
        outline: strapPc(opts.longline ? 14 : 18, opts.wideStrap ? 2.6 : 1.6), role: "strap", bilateral: true,
        grain: [[0.8, 3], [0.8, (opts.longline ? 14 : 18) - 3]] });
    }
    return pieces;
  }

  // Sport bra: a genuinely different construction (front + back panel
  // joined at the sides, elastic band at the bottom, no separate cups) —
  // most real sport bras are drafted this way, not as a cup-based design.
  function sportBraFront(chestW, depth) {
    const seg1 = [[0, depth * 0.15], [chestW * 0.35, -depth * 0.05], [chestW * 0.75, depth * 0.10]];
    const seg2 = [[chestW * 0.75, depth * 0.10], [chestW * 1.05, depth * 0.4], [chestW * 0.9, depth]];
    const outline = [[0, depth * 0.15], ...qBez(...seg1, 6), ...qBez(...seg2, 6), [0, depth]];
    return withCurves(outline, [
      { fromIdx: 0, toIdx: 6, ...qBezToCubic(...seg1) },
      { fromIdx: 6, toIdx: 12, ...qBezToCubic(...seg2) },
    ]);
  }
  function sportBraBack(chestW, depth, racer) {
    const topW = racer ? chestW * 0.18 : chestW * 0.55;
    const seg1 = [[0, depth * 0.05], [topW * 0.5, -depth * 0.02], [topW, depth * 0.12]];
    const seg2 = [[topW, depth * 0.12], [chestW * 1.0, depth * 0.35], [chestW * 0.88, depth]];
    const outline = [[0, depth * 0.05], ...qBez(...seg1, 6), ...qBez(...seg2, 6), [0, depth]];
    return withCurves(outline, [
      { fromIdx: 0, toIdx: 6, ...qBezToCubic(...seg1) },
      { fromIdx: 6, toIdx: 12, ...qBezToCubic(...seg2) },
    ]);
  }
  function sportBraPieces(m, opts) {
    const chestW = q(m.chest) * 0.92; // negative ease — compression-style fit
    const depth = m.backLen * 0.42;
    const front = sportBraFront(chestW, depth);
    const back = sportBraBack(chestW, depth, opts.racer);
    const bandCirc = q(m.chest) * 2 * 0.94;
    return [
      { key: "front", name: { en: "Front Panel", ar: "القطعة الأمامية" },
        desc: { en: "Compression-fit front panel with a curved scoop neckline.", ar: "قطعة أمامية ضاغطة بفتحة رقبة منحنية." },
        outline: front, role: "band", cutOnFold: true,
        grain: [[chestW * 0.4, depth * 0.2], [chestW * 0.4, depth - 3]] },
      { key: "back", name: { en: opts.racer ? "Racerback Panel" : "Back Panel", ar: opts.racer ? "قطعة الظهر الرياضي" : "القطعة الخلفية" },
        desc: { en: opts.racer ? "Narrow racerback panel crossing high between the shoulder blades." : "Back panel with a plain scoop.", ar: opts.racer ? "قطعة ظهر رياضي ضيقة تتقاطع عاليًا بين لوحي الكتف." : "قطعة خلفية بفتحة بسيطة." },
        outline: back, role: "band", cutOnFold: true,
        grain: [[chestW * 0.3, depth * 0.2], [chestW * 0.3, depth - 3]] },
      { key: "bandElastic", name: { en: "Band Elastic", ar: "أستك الحزام" },
        desc: { en: "Wide elastic band finishing the bottom edge.", ar: "أستك عريض يُنهي الحافة السفلية." },
        outline: elasticStrip(bandCirc, 3.5), role: "elastic-band",
        grain: [[bandCirc / 2, 1], [bandCirc / 2, 2.5]] },
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
  def("wu01", "women", "Classic Brief", "سروال داخلي كلاسيكي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise brief with full coverage and a curved leg opening.", "سروال داخلي متوسط الارتفاع بتغطية كاملة وفتحة ساق منحنية.",
    (m) => briefPieces(m, { rise: "mid", legCut: "full", coverage: 1.0 }));
  def("wu02", "women", "High-Waist Brief", "سروال داخلي عالي الخصر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "High-rise brief that sits above the natural waist, full coverage.", "سروال داخلي عالي يجلس فوق الخصر الطبيعي بتغطية كاملة.",
    (m) => briefPieces(m, { rise: "high", legCut: "full", coverage: 1.0 }));
  def("wu03", "women", "Bikini-Cut Brief", "سروال داخلي قصة بيكيني", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise brief with a bikini-cut leg opening, curved in at the hip.", "سروال داخلي منخفض بفتحة ساق بقصة بيكيني منحنية عند الورك.",
    (m) => briefPieces(m, { rise: "low", legCut: "bikini", coverage: 0.95 }));
  def("wu04", "women", "Hipster Brief", "سروال داخلي هيبستر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise brief that sits on the hips with a moderate leg cut.", "سروال داخلي منخفض يجلس على الورك بفتحة ساق معتدلة.",
    (m) => briefPieces(m, { rise: "low", legCut: "hipster", coverage: 1.0 }));
  def("wu05", "women", "Boyshort Brief", "سروال داخلي بويشورت", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise brief with a squared, longer leg line for extra coverage.", "سروال داخلي متوسط الارتفاع بخط ساق مربّع وأطول لتغطية إضافية.",
    (m) => briefPieces(m, { rise: "mid", legCut: "boyshort", coverage: 1.1 }));
  def("wu06", "women", "Full-Coverage Brief", "سروال داخلي بتغطية كاملة", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "High-rise brief with maximum hip and seat coverage.", "سروال داخلي عالي الخصر بأقصى تغطية للورك والمقعد.",
    (m) => briefPieces(m, { rise: "high", legCut: "full", coverage: 1.15 }));

  // ================= MEN'S BRIEFS/TRUNKS (6) =================
  def("mu01", "men", "Classic Brief", "سروال داخلي كلاسيكي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise brief with full coverage and a curved leg opening.", "سروال داخلي متوسط الارتفاع بتغطية كاملة وفتحة ساق منحنية.",
    (m) => briefPieces(m, { rise: "mid", legCut: "full", coverage: 1.0 }));
  def("mu02", "men", "Low-Rise Brief", "سروال داخلي منخفض الخصر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise brief, full coverage through the seat.", "سروال داخلي منخفض الخصر بتغطية كاملة للمقعد.",
    (m) => briefPieces(m, { rise: "low", legCut: "full", coverage: 1.0 }));
  def("mu03", "men", "Boxer Brief", "بوكسر داخلي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise brief with the leg panel extended down the thigh to a hemmed edge.", "سروال داخلي متوسط الارتفاع بامتداد الساق حتى الفخذ بحافة مطوية.",
    (m) => briefPieces(m, { rise: "mid", legCut: "full", coverage: 1.0, legLength: 9 }));
  def("mu04", "men", "Trunk", "ترنك داخلي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise, squared boyshort-style leg with a short hemmed extension.", "سروال داخلي منخفض بخط ساق مربّع وامتداد قصير مطوي.",
    (m) => briefPieces(m, { rise: "low", legCut: "boyshort", coverage: 1.0, legLength: 5 }));
  def("mu05", "men", "Athletic Brief", "سروال داخلي رياضي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise brief with a higher-cut leg opening for freer movement.", "سروال داخلي متوسط الارتفاع بفتحة ساق أعلى لحرية حركة أكبر.",
    (m) => briefPieces(m, { rise: "mid", legCut: "bikini", coverage: 1.0 }));
  def("mu06", "men", "Full-Rise Brief", "سروال داخلي عالي الخصر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "High-rise brief with maximum coverage.", "سروال داخلي عالي الخصر بأقصى تغطية.",
    (m) => briefPieces(m, { rise: "high", legCut: "full", coverage: 1.15 }));

  // ================= GIRLS' BRIEFS (6) =================
  def("gu01", "girls", "Classic Brief", "سروال داخلي كلاسيكي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise brief with full coverage and a curved leg opening.", "سروال داخلي متوسط الارتفاع بتغطية كاملة وفتحة ساق منحنية.",
    (m) => briefPieces(m, { rise: "mid", legCut: "full", coverage: 1.0 }));
  def("gu02", "girls", "High-Waist Brief", "سروال داخلي عالي الخصر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "High-rise brief that sits above the natural waist, full coverage.", "سروال داخلي عالي يجلس فوق الخصر الطبيعي بتغطية كاملة.",
    (m) => briefPieces(m, { rise: "high", legCut: "full", coverage: 1.0 }));
  def("gu03", "girls", "Bikini-Cut Brief", "سروال داخلي قصة بيكيني", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise brief with a bikini-cut leg opening.", "سروال داخلي منخفض بفتحة ساق بقصة بيكيني.",
    (m) => briefPieces(m, { rise: "low", legCut: "bikini", coverage: 0.95 }));
  def("gu04", "girls", "Hipster Brief", "سروال داخلي هيبستر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise brief that sits on the hips with a moderate leg cut.", "سروال داخلي منخفض يجلس على الورك بفتحة ساق معتدلة.",
    (m) => briefPieces(m, { rise: "low", legCut: "hipster", coverage: 1.0 }));
  def("gu05", "girls", "Boyshort Brief", "سروال داخلي بويشورت", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise brief with a squared, longer leg line for extra coverage.", "سروال داخلي متوسط الارتفاع بخط ساق مربّع وأطول لتغطية إضافية.",
    (m) => briefPieces(m, { rise: "mid", legCut: "boyshort", coverage: 1.1 }));
  def("gu06", "girls", "Full-Coverage Brief", "سروال داخلي بتغطية كاملة", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "High-rise brief with maximum coverage.", "سروال داخلي عالي الخصر بأقصى تغطية.",
    (m) => briefPieces(m, { rise: "high", legCut: "full", coverage: 1.15 }));

  // ================= BOYS' BRIEFS/TRUNKS (6) =================
  def("bu01", "boys", "Classic Brief", "سروال داخلي كلاسيكي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise brief with full coverage and a curved leg opening.", "سروال داخلي متوسط الارتفاع بتغطية كاملة وفتحة ساق منحنية.",
    (m) => briefPieces(m, { rise: "mid", legCut: "full", coverage: 1.0 }));
  def("bu02", "boys", "Low-Rise Brief", "سروال داخلي منخفض الخصر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise brief, full coverage through the seat.", "سروال داخلي منخفض الخصر بتغطية كاملة للمقعد.",
    (m) => briefPieces(m, { rise: "low", legCut: "full", coverage: 1.0 }));
  def("bu03", "boys", "Boxer Brief", "بوكسر داخلي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise brief with the leg panel extended down the thigh to a hemmed edge.", "سروال داخلي متوسط الارتفاع بامتداد الساق حتى الفخذ بحافة مطوية.",
    (m) => briefPieces(m, { rise: "mid", legCut: "full", coverage: 1.0, legLength: 9 }));
  def("bu04", "boys", "Trunk", "ترنك داخلي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Low-rise, squared boyshort-style leg with a short hemmed extension.", "سروال داخلي منخفض بخط ساق مربّع وامتداد قصير مطوي.",
    (m) => briefPieces(m, { rise: "low", legCut: "boyshort", coverage: 1.0, legLength: 5 }));
  def("bu05", "boys", "Athletic Brief", "سروال داخلي رياضي", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "Mid-rise brief with a higher-cut leg opening for freer movement.", "سروال داخلي متوسط الارتفاع بفتحة ساق أعلى لحرية حركة أكبر.",
    (m) => briefPieces(m, { rise: "mid", legCut: "bikini", coverage: 1.0 }));
  def("bu06", "boys", "Full-Rise Brief", "سروال داخلي عالي الخصر", UNDERWEAR_TAG.en, UNDERWEAR_TAG.ar, "underwear",
    "High-rise brief with maximum coverage.", "سروال داخلي عالي الخصر بأقصى تغطية.",
    (m) => briefPieces(m, { rise: "high", legCut: "full", coverage: 1.15 }));

  // ================= WOMEN'S BRAS (10) =================
  def("wb01", "women", "Classic Soft-Cup Bra", "حمالة صدر كلاسيكية بكأس ناعم", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Everyday soft-cup bra with a round cup and standard straps.", "حمالة صدر يومية بكأس دائري ناعم وحمالات كتف عادية.",
    (m) => braPieces(m, { cupDepthF: 1.0, strap: "standard" }));
  def("wb02", "women", "Balconette Bra", "حمالة صدر بالكونيت", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Wide-set straps and a shallow, horizontal-top cup for a lifted, uplifted line under fitted necklines.", "حمالات كتف واسعة وكأس ضحل بأعلى أفقي يمنح خطاً مرفوعاً تحت الفتحات الضيقة.",
    (m) => braPieces(m, { cupDepthF: 0.85, wide: true, strap: "standard" }));
  def("wb03", "women", "Plunge Bra", "حمالة صدر بلانج", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Deep V bridge and cup for low necklines.", "جسر وكأس بعمق V للفتحات المنخفضة.",
    (m) => braPieces(m, { cupDepthF: 1.0, plunge: true, strap: "standard" }));
  def("wb04", "women", "Full-Coverage Bra", "حمالة صدر بتغطية كاملة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Deeper cup and a wider band for maximum coverage and support.", "كأس أعمق وحزام أعرض لأقصى تغطية ودعم.",
    (m) => braPieces(m, { cupDepthF: 1.25, bandWidthF: 1.25, strap: "standard" }));
  def("wb05", "women", "Racerback Bralette", "بروليت بظهر رياضي", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Soft bralette with straps angled in toward the center back.", "بروليت ناعمة بحمالات مائلة نحو وسط الظهر.",
    (m) => braPieces(m, { cupDepthF: 0.9, strap: "racerback" }));
  def("wb06", "women", "Triangle Bralette", "بروليت مثلثة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Simple triangle-shaped cup with minimal structure.", "كأس بشكل مثلث بسيط وحد أدنى من التجهيز.",
    (m) => braPieces(m, { cupDepthF: 0.75, triangle: true, strap: "standard" }));
  def("wb07", "women", "Longline Bralette", "بروليت ممتدة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Band extends down over the ribs for extra coverage and smoothing.", "الحزام يمتد لأسفل فوق الأضلاع لتغطية وتنعيم إضافيين.",
    (m) => braPieces(m, { cupDepthF: 0.9, longline: true, strap: "standard" }));
  def("wb08", "women", "Bandeau Bra", "حمالة صدر باندو", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Straight band with a shallow cup, no straps.", "حزام مستقيم بكأس ضحل، بلا حمالات.",
    (m) => braPieces(m, { cupDepthF: 0.4, strap: "none" }));
  def("wb09", "women", "Sport Bra", "حمالة صدر رياضية", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Compression-fit front and racerback panel construction, no separate cups — a real sport-bra draft, not a cup-based design.", "قطعة أمامية ضاغطة وظهر رياضي متقاطع بدون كؤوس منفصلة — تفصيل رياضي حقيقي وليس تصميماً قائماً على الكأس.",
    (m) => sportBraPieces(m, { racer: true }));
  def("wb10", "women", "Strapless Bra", "حمالة صدر بدون حمالات", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Structured cup and a wider band for support without straps.", "كأس مجهّز وحزام أعرض للدعم بدون حمالات.",
    (m) => braPieces(m, { cupDepthF: 1.05, bandWidthF: 1.3, strap: "none" }));

  // ================= GIRLS' BRAS (10) — soft training styles =================
  def("gb01", "girls", "Classic Training Bralette", "بروليت تدريب كلاسيكية", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Simple triangle-cup training bralette, soft and unstructured.", "بروليت تدريب بكأس مثلث بسيط وناعم وبدون تجهيز.",
    (m) => braPieces(m, { cupDepthF: 0.7, triangle: true, strap: "standard" }));
  def("gb02", "girls", "Racerback Training Bralette", "بروليت تدريب بظهر رياضي", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Triangle-cup training bralette with racerback straps.", "بروليت تدريب بكأس مثلث وحمالات ظهر رياضي.",
    (m) => braPieces(m, { cupDepthF: 0.7, triangle: true, strap: "racerback" }));
  def("gb03", "girls", "Seamed Soft-Cup Bralette", "بروليت بكأس ناعم مخيط", BRA_TAG.en, BRA_TAG.ar, "bra",
    "A little more shaping than a triangle cut, still fully soft/wireless.", "تشكيل أكبر قليلاً من القصة المثلثة، وتبقى ناعمة بالكامل بدون سلك.",
    (m) => braPieces(m, { cupDepthF: 0.8, strap: "standard" }));
  def("gb04", "girls", "Crop-Style Longline Bralette", "بروليت كروب ممتدة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Band extends down like a fitted crop top.", "الحزام يمتد لأسفل كأنه توب كروب ضيق.",
    (m) => braPieces(m, { cupDepthF: 0.75, longline: true, strap: "standard" }));
  def("gb05", "girls", "Bandeau Training Bra", "حمالة صدر باندو تدريب", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Simple straight band, no straps.", "حزام مستقيم بسيط بلا حمالات.",
    (m) => braPieces(m, { cupDepthF: 0.35, strap: "none" }));
  def("gb06", "girls", "Cotton Everyday Bralette", "بروليت قطنية يومية", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Everyday triangle-cup bralette in a comfortable cotton weight.", "بروليت مثلثة للاستخدام اليومي بوزن قطني مريح.",
    (m) => braPieces(m, { cupDepthF: 0.7, triangle: true, strap: "standard" }));
  def("gb07", "girls", "Sport Bralette", "بروليت رياضية", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Compression-fit front and racerback panel construction, sized down from the women's Sport Bra.", "قطعة أمامية ضاغطة وظهر رياضي متقاطع، بمقاس أصغر من الحمالة الرياضية الحريمي.",
    (m) => sportBraPieces(m, { racer: true }));
  def("gb08", "girls", "Scoop-Neck Bralette", "بروليت برقبة سكوب", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Wide, shallow scoop-shaped cup top.", "أعلى كأس واسع وضحل بشكل سكوب.",
    (m) => braPieces(m, { cupDepthF: 0.72, wide: true, strap: "standard" }));
  def("gb09", "girls", "Wide-Strap Bralette", "بروليت بحمالات عريضة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "Triangle cup with extra-wide, comfortable straps.", "كأس مثلث بحمالات عريضة ومريحة.",
    (m) => braPieces(m, { cupDepthF: 0.72, triangle: true, strap: "standard", wideStrap: true }));
  def("gb10", "girls", "Seamless-Style Soft Bralette", "بروليت ناعمة بلا خياطة ظاهرة", BRA_TAG.en, BRA_TAG.ar, "bra",
    "The simplest, softest cut in the collection — minimal shaping, minimal seams.", "أبسط وأنعم قصة في المجموعة — بأقل تشكيل وأقل عدد من الخياطات.",
    (m) => braPieces(m, { cupDepthF: 0.65, triangle: true, strap: "standard" }));

  if (typeof window !== 'undefined') window.UnderwearLibrary = true;
})();
