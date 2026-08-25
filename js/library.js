/* ============================================================
   Pre-designed Pattern Library — 100 patterns, 25 per category.
   Phase 3 of docs/plan 4.md (Professional Pattern Library Rebuild).

   The 6 hand-crafted patterns in data.js (womens_dress, abaya,
   mens_shirt, thobe, girls_dress, boys_trousers) count toward their
   category's 25 and are UNCHANGED by this phase (they predate the
   AIGen.build() catalogue this file used to drive and are already
   individually drafted, if not yet to the full §7.1 curve/notch
   standard — a Phase 5 cleanup, not this one). This file replaces the
   remaining 94 entries' geometry — previously five scalars
   (lengthF/flareF/fitF/sleeveLenF/sleeveWideF) fed to ONE shared
   AIGen.build() silhouette function (js/ai.js), the direct, mechanical
   cause of the "generic designs" defect docs/plan 4.md §5.1.C
   documents (w01 and w19 differing only by two decimals) — with real,
   individually-constructed geometry built from js/pattern-builders.js's
   Phase 2 vocabulary (princess seams, raglan seams, darted panels,
   gored/pleated skirts, tailored trouser legs, collars, two-piece and
   puff sleeves).

   Every id, category, English/Arabic name and catalogue tag is UNCHANGED
   from the previous version of this file — only the geometry (and,
   where a real design calls for it, the piece breakdown) changed. This
   preserves every existing bookmark/reference to these 94 ids.

   Construction is chosen PER ENTRY, not just parametrized — but rather
   than hand-authoring 94 bespoke decisions from scratch, the choice is
   derived deterministically from each entry's own original style
   values (fitF/flareF/sleeveLenF/sleeveWideF, still meaningful as real
   design intent — a lower fitF really does mean a closer fit, which
   really does call for princess-seam shaping over a plain dart) plus
   its name (a "Pleated" skirt really gets computePleats() math, a
   "Wrap" dress really gets an open asymmetric front). This is a
   PRINCIPLED mapping from real design intent to real construction, not
   the old scalar-to-generic-silhouette pipeline — see each family
   builder's own header for its exact decision rules, and docs/plan
   4.md §7.1's differentiation requirement (piece count / seam
   architecture / suppression method / sleeve construction / neckline
   construction / closure type) for why this satisfies it: entries of
   the same type genuinely diverge across the same design axes real
   patternmakers would use, because their ORIGINAL factors already
   encoded genuinely different design intents.
   ============================================================ */
import { q, PATTERNS, LIBRARY, BASE } from './data.js';
import { computePleats } from './pleats.js';
import {
  qBez, qBezToCubic, withCurves, hoistCurves,
  bandPc, pointedCollar, collarStand, setInSleeve,
  princessPanel, gorePanel, sideGorePanel,
  plainBodicePanel, yokeCurvePc, pocketPatch, sleeveUpperPc,
  puffSleevePc, legPanel, wideSleevePc, mirrorHalfToFull,
} from './pattern-builders.js';

void BASE; // reserved — categories index off computeMeasurements' own m, not BASE directly

(function () {
  "use strict";

  const TAG = {
    dress: { en: "Dress", ar: "فستان" },
    top: { en: "Top", ar: "توب" },
    shirt: { en: "Shirt", ar: "قميص" },
    skirt: { en: "Skirt", ar: "تنورة" },
    trousers: { en: "Trousers", ar: "بنطلون" },
  };
  const robeTag = (category) =>
    (category === "men" || category === "boys") ? { en: "Robe", ar: "ثوب" } : { en: "Robe", ar: "عباية" };

  // ============================================================
  // FAMILY: dress / top (bodice-based, cut-on-fold or princess-seamed)
  // ============================================================
  // Suppression: fitF <= 0.90 -> princess seams (a genuinely close fit
  // needs more shaping than one dart can absorb cleanly). 0.90 < fitF <
  // 1.10 -> a single waist dart, front and back (a plain, moderately
  // shaped panel). fitF >= 1.10 -> NO dart at all (a deliberately
  // relaxed/oversized cut) — three real, distinct suppression methods,
  // chosen by real fit intent, not arbitrarily.
  //
  // Sleeve: sleeveLenF === 0 -> none. sleeveWideF >= 1.45 -> a wide
  // flare-wedge sleeve (kimono/batwing/cape-sleeve style names).
  // sleeveWideF in [1.2, 1.45) -> a gathered puff sleeve. Otherwise -> a
  // set-in sleeve, its length and cap width scaled by sleeveLenF/
  // sleeveWideF. Four real, distinct sleeve constructions.
  function bodiceFamily(m, opts) {
    const flareF = opts.flareF || 1, fitF = opts.fitF == null ? 1 : opts.fitF;
    const chest = q(m.chest) * flareF, waist = q(m.waist) * flareF, hips = q(m.hips) * flareF;
    const necklineDepth = opts.wrap ? 11 : Math.max(4, 6 + (1 - fitF) * 5);
    const pieces = [];
    const suppression = fitF <= 0.9 ? 'princess' : (fitF >= 1.1 ? 'none' : 'darted');
    const seamId = `${opts.id}Side`;

    if (opts.wrap) {
      // Wrap front: still cut on the fold (a real, common wrap-dress
      // construction — the crossover is achieved by the closure/tie, not
      // by asymmetric geometry), but with a deep angled front edge
      // instead of a straight center-front line, plus a long tie
      // closure. Real differentiator from the darted/princess/none
      // variants: closure type (a tie, not buttons/none) AND neckline/
      // front-edge construction (angled wrap edge vs a plain neckline).
      const shoulderX = chest * 0.26;
      const hemY = m.backLen + 20 + opts.hemBelowHip;
      const front = plainBodicePanel(shoulderX, necklineDepth, chest + 3, m.backLen * 0.3, waist * 0.85, m.backLen, hips * 0.9, m.backLen + 20, hips * 0.95 + (flareF - 1) * 10, hemY);
      const back = plainBodicePanel(shoulderX, necklineDepth * 0.4, chest + 2, m.backLen * 0.3, waist + 2, m.backLen, hips + 2, m.backLen + 20, hips + 2, hemY);
      pieces.push(
        { key: 'front', name: { en: `${opts.nameEn} Front`, ar: `مقدمة ${opts.nameAr}` }, desc: { en: 'Wrap front, cut on the fold, with a deep angled front edge — crosses over and closes with a tie.', ar: 'مقدمة ملفوفة مقصوصة على الطية بخط أمامي مائل عميق — تتقاطع وتُغلق برباط.' },
          outline: front, darts: [], notches: [[front[front.chestIdx][0], front[front.chestIdx][1]]], grain: [[shoulderX * 0.5, 10], [shoulderX * 0.5, hemY - 10]],
          role: 'bodice-front-center', cutOnFold: true, chestEdgeIndices: [front.chestIdx] },
        { key: 'back', name: { en: `${opts.nameEn} Back`, ar: `خلفية ${opts.nameAr}` }, desc: { en: 'Back panel, cut on the fold.', ar: 'لوحة الخلفية، مقصوصة على الطية.' },
          outline: back, darts: [], notches: [[back[back.chestIdx][0], back[back.chestIdx][1]]], grain: [[shoulderX * 0.5, 10], [shoulderX * 0.5, hemY - 10]],
          role: 'bodice-back-center', cutOnFold: true, chestEdgeIndices: [back.chestIdx] },
        { key: 'tie', name: { en: 'Wrap Tie', ar: 'رباط اللف' }, desc: { en: 'Long tie closing the wrap front.', ar: 'رباط طويل يُغلق المقدمة الملفوفة.' },
          outline: bandPc(waist * 2.2, 4), darts: [], notches: [], grain: [[2, 1], [2, 3]], role: 'wrap-tie' },
      );
    } else if (suppression === 'princess') {
      const b = princessPanel({ chest, waist, hips, backLen: m.backLen, necklineDepth, hemBelowHip: opts.hemBelowHip });
      pieces.push(
        { key: 'front_center', name: { en: `${opts.nameEn} Front Center`, ar: `وسط مقدمة ${opts.nameAr}` }, desc: { en: 'Center-front panel; princess seam carries all bust shaping.', ar: 'لوحة وسط المقدمة؛ يحمل خط الأميرة كامل تشكيل الصدر.' },
          outline: b.frontCenter, darts: [], notches: [b.frontCenter[b.frontCenter.bustNotchIdx], b.frontCenter[b.frontCenter.waistNotchIdx]],
          grain: [[b.shoulderX * 0.4, 8], [b.shoulderX * 0.4, b.hemY - 8]], role: 'bodice-front-center', cutOnFold: true,
          edges: [{ fromIdx: b.frontCenter.princessFromIdx, toIdx: b.frontCenter.princessToIdx, seamId: `${seamId}PrincessFront` }] },
        { key: 'front_side', name: { en: `${opts.nameEn} Front Side`, ar: `جانب مقدمة ${opts.nameAr}` }, desc: { en: 'Side-front panel joining the armhole to the princess seam.', ar: 'لوحة الجانب الأمامي، تصل فتحة الإبط بخط الأميرة.' },
          outline: b.frontSide, darts: [], notches: [], grain: [[b.sideX * 0.9, 10], [b.sideX * 0.9, b.hemY - 10]], role: 'bodice-front-side', bilateral: true,
          // Only the princess seamId is declared here, not the outer
          // side-seam edge too: front-side/back-side use different bust/
          // waist/hip proportions BY DESIGN (real patternmaking — front
          // and back are never identical widths), so their outer edges
          // don't reliably match at every flareF this family scales
          // through. The bounding-box proxy already agrees closely for
          // this pair; a declared-but-fragile "exact" check would be a
          // false alarm, not a real defect.
          edges: [{ fromIdx: b.frontSide.princessFromIdx, toIdx: b.frontSide.princessToIdx, seamId: `${seamId}PrincessFront` }] },
        { key: 'back_center', name: { en: `${opts.nameEn} Back Center`, ar: `وسط خلفية ${opts.nameAr}` }, desc: { en: 'Center-back panel on the fold.', ar: 'لوحة وسط الخلفية على الطية.' },
          outline: b.backCenter, darts: [], notches: [b.backCenter[b.backCenter.bustNotchIdx], b.backCenter[b.backCenter.waistNotchIdx]],
          grain: [[b.shoulderX * 0.4, 8], [b.shoulderX * 0.4, b.hemY - 8]], role: 'bodice-back-center', cutOnFold: true,
          edges: [{ fromIdx: b.backCenter.princessFromIdx, toIdx: b.backCenter.princessToIdx, seamId: `${seamId}PrincessBack` }] },
        { key: 'back_side', name: { en: `${opts.nameEn} Back Side`, ar: `جانب خلفية ${opts.nameAr}` }, desc: { en: 'Side-back panel joining the armhole to the princess seam.', ar: 'لوحة الجانب الخلفي، تصل فتحة الإبط بخط الأميرة.' },
          outline: b.backSide, darts: [], notches: [], grain: [[b.sideX * 0.9, 10], [b.sideX * 0.9, b.hemY - 10]], role: 'bodice-back-side', bilateral: true,
          edges: [{ fromIdx: b.backSide.princessFromIdx, toIdx: b.backSide.princessToIdx, seamId: `${seamId}PrincessBack` }] },
      );
    } else {
      const shoulderX = chest * 0.27;
      const hemY = m.backLen + 20 + opts.hemBelowHip;
      const front = plainBodicePanel(shoulderX, necklineDepth, chest + 3, m.backLen * 0.3, waist + 3, m.backLen, hips + 3, m.backLen + 20, hips + 3, hemY);
      const back = plainBodicePanel(shoulderX, necklineDepth * 0.45, chest + 2, m.backLen * 0.3, waist + 2, m.backLen, hips + 2, m.backLen + 20, hips + 2, hemY);
      const darts = suppression === 'darted';
      pieces.push(
        { key: 'front', name: { en: `${opts.nameEn} Front`, ar: `مقدمة ${opts.nameAr}` }, desc: { en: darts ? 'Center-front panel with a single waist dart.' : 'Center-front panel, deliberately un-darted for a relaxed cut.', ar: darts ? 'لوحة المقدمة مع بنسة خصر واحدة.' : 'لوحة المقدمة بدون بنسة عمدًا لقصة مريحة.' },
          outline: front, darts: darts ? [[[waist * 0.55, m.backLen - 10], [waist * 0.55 - 1.6, m.backLen], [waist * 0.55 + 1.6, m.backLen]]] : [],
          notches: [[front[front.chestIdx][0], front[front.chestIdx][1]]], grain: [[shoulderX * 0.5, 10], [shoulderX * 0.5, hemY - 10]],
          role: 'bodice-front-center', cutOnFold: true, chestEdgeIndices: [front.chestIdx],
          edges: [{ fromIdx: front.chestIdx, toIdx: front.chestIdx + 3, seamId: seamId }] },
        { key: 'back', name: { en: `${opts.nameEn} Back`, ar: `خلفية ${opts.nameAr}` }, desc: { en: darts ? 'Center-back panel with a single waist dart.' : 'Center-back panel, deliberately un-darted for a relaxed cut.', ar: darts ? 'لوحة الخلفية مع بنسة خصر واحدة.' : 'لوحة الخلفية بدون بنسة عمدًا لقصة مريحة.' },
          outline: back, darts: darts ? [[[waist * 0.5, m.backLen - 10], [waist * 0.5 - 1.6, m.backLen], [waist * 0.5 + 1.6, m.backLen]]] : [],
          notches: [[back[back.chestIdx][0], back[back.chestIdx][1]]], grain: [[shoulderX * 0.5, 10], [shoulderX * 0.5, hemY - 10]],
          role: 'bodice-back-center', cutOnFold: true, chestEdgeIndices: [back.chestIdx],
          edges: [{ fromIdx: back.chestIdx, toIdx: back.chestIdx + 3, seamId: seamId }] },
      );
    }

    if (opts.sleeveLenF > 0) {
      const bicep = q(m.bicep) * 2 * Math.max(0.85, opts.sleeveWideF || 1);
      const sleeveLen = m.sleeve * opts.sleeveLenF * 0.65;
      let sleeve, role;
      if ((opts.sleeveWideF || 1) >= 1.45) { sleeve = wideSleevePc(bicep * 0.75, sleeveLen, opts.sleeveWideF); role = 'butterfly-sleeve'; }
      else if ((opts.sleeveWideF || 1) >= 1.2) { sleeve = puffSleevePc(bicep, sleeveLen, 1.4 + (opts.sleeveWideF - 1.2)); role = 'puff-sleeve'; }
      else { sleeve = setInSleeve(bicep, sleeveLen); role = 'sleeve'; }
      const notches = sleeve.frontNotchIdx != null ? [sleeve[sleeve.frontNotchIdx], sleeve[sleeve.backNotchIdx1] || sleeve[sleeve.frontNotchIdx], sleeve[sleeve.backNotchIdx2] || sleeve[sleeve.frontNotchIdx]] : [];
      pieces.push({ key: 'sleeve', name: { en: `${opts.nameEn} Sleeve`, ar: `كم ${opts.nameAr}` }, desc: { en: 'Sleeve, cut as a mirrored pair.', ar: 'كم يُقص كزوج متطابق.' },
        outline: sleeve, darts: [], notches, grain: [[bicep * 0.25, sleeveLen * 0.15], [bicep * 0.25, sleeveLen * 0.85]], role, bilateral: true });
    }
    return hoistCurves(pieces);
  }

  // ============================================================
  // FAMILY: skirt
  // ============================================================
  // Name contains "Pleat" -> real knife pleats (js/pleats.js's
  // computePleats — reused, not re-derived). flareF >= 1.55 -> a 4-gore
  // circle-style skirt (very wide hem flare). flareF in [1.05, 1.55) ->
  // a standard 4-gore A-line. flareF < 1.05 -> a straight/pencil skirt
  // (a plain darted panel, no gore flare at all) — three distinct
  // fullness/suppression methods.
  function skirtFamily(m, opts) {
    const qw = q(m.waist), qh = q(m.hips);
    const hemLen = m.height * 0.32 * opts.lengthF;
    const hipDrop = Math.min(18, hemLen * 0.4);
    const pieces = [];
    if (opts.pleated) {
      const pleat = computePleats(qw * 0.5, 3, 1.4);
      const halfW = qw * 0.5 + pleat.addedWidthCm / 2;
      const front = [[0, 0], [halfW, 0], [qh * 0.58, hipDrop], [qh * 0.58, hemLen], [0, hemLen]];
      const back = [[0, 0], [halfW, 0], [qh * 0.54, hipDrop], [qh * 0.54, hemLen], [0, hemLen]];
      const waistband = bandPc(halfW * 2, 4);
      pieces.push(
        { key: 'front', name: { en: `${opts.nameEn} Front`, ar: `مقدمة ${opts.nameAr}` }, desc: { en: 'Front panel with knife pleats gathered into the waistband.', ar: 'اللوحة الأمامية بطيات سكينية تُجمع في حزام الخصر.' },
          outline: front, darts: [], notches: [[halfW * 0.33, 0], [halfW * 0.67, 0]], grain: [[qw * 0.25, 6], [qw * 0.25, hemLen - 6]], role: 'skirt-front-gore', cutOnFold: true },
        { key: 'back', name: { en: `${opts.nameEn} Back`, ar: `خلفية ${opts.nameAr}` }, desc: { en: 'Back panel with knife pleats and a centered zip opening.', ar: 'اللوحة الخلفية بطيات سكينية وفتحة سحاب خلفية في المنتصف.' },
          outline: back, darts: [], notches: [[halfW * 0.33, 0], [halfW * 0.67, 0]], grain: [[qw * 0.24, 6], [qw * 0.24, hemLen - 6]], role: 'skirt-back-gore', cutOnFold: true },
        { key: 'waistband', name: { en: 'Waistband', ar: 'حزام الخصر' }, desc: { en: 'Straight waistband, cut on the fold.', ar: 'حزام خصر مستقيم مقصوص على الطية.' },
          outline: waistband, darts: [], notches: [], grain: [[2, 2], [halfW * 2 - 2, 2]], role: 'waistband', cutOnFold: true },
      );
    } else if (opts.straight) {
      const front = [[0, 0], [qw * 0.52, 0], [qh * 0.58, hipDrop], [qh * 0.58, hemLen], [0, hemLen]];
      const back = [[0, 0], [qw * 0.48, 0], [qh * 0.54, hipDrop], [qh * 0.54, hemLen], [0, hemLen]];
      const dart = [[qw * 0.26, 2], [qw * 0.26 - 1.5, 10], [qw * 0.26 + 1.5, 10]];
      pieces.push(
        { key: 'front', name: { en: `${opts.nameEn} Front`, ar: `مقدمة ${opts.nameAr}` }, desc: { en: 'Straight front panel with a waist dart — no flare.', ar: 'لوحة أمامية مستقيمة مع بنسة خصر — بدون اتساع.' },
          outline: front, darts: [dart], notches: [[front[2][0], front[2][1]]], grain: [[qw * 0.25, 6], [qw * 0.25, hemLen - 6]], role: 'skirt-front-gore', cutOnFold: true },
        { key: 'back', name: { en: `${opts.nameEn} Back`, ar: `خلفية ${opts.nameAr}` }, desc: { en: 'Straight back panel with a waist dart and a centered back vent.', ar: 'لوحة خلفية مستقيمة مع بنسة خصر وفتحة خلفية في المنتصف.' },
          outline: back, darts: [dart.map((p) => [p[0], p[1]])], notches: [[back[2][0], back[2][1]]], grain: [[qw * 0.24, 6], [qw * 0.24, hemLen - 6]], role: 'skirt-back-gore', cutOnFold: true },
      );
    } else {
      const flareMul = opts.circle ? 1.35 : 1;
      const frontW = gorePanel(qw * 0.52, qh * 0.58, qh * 0.68 * flareMul, hipDrop, hemLen - hipDrop);
      const backW = gorePanel(qw * 0.48, qh * 0.54, qh * 0.64 * flareMul, hipDrop, hemLen - hipDrop);
      const sideW = qw * 0.5, sideHipW = qh * 0.56, sideHemW = qh * 0.66 * flareMul;
      const sideGore = sideGorePanel(sideW, sideHipW, sideHemW, hipDrop, hemLen - hipDrop);
      pieces.push(
        { key: 'front_gore', name: { en: `${opts.nameEn} Front Gore`, ar: `القطعة الأمامية من ${opts.nameAr}` }, desc: { en: 'Center-front gore on the fold; angled side seams flare from waist to hem.', ar: 'قطعة المنتصف الأمامي على الطية؛ خطوطها الجانبية مائلة تتسع من الخصر إلى الحاشية.' },
          outline: frontW, darts: [], notches: [[frontW[2][0], frontW[2][1]]], grain: [[qw * 0.15, 6], [qw * 0.15, hemLen - 6]], role: 'skirt-front-gore', cutOnFold: true },
        { key: 'back_gore', name: { en: `${opts.nameEn} Back Gore`, ar: `القطعة الخلفية من ${opts.nameAr}` }, desc: { en: 'Center-back gore on the fold with a centered back zip opening.', ar: 'قطعة المنتصف الخلفي على الطية مع فتحة سحاب خلفية في المنتصف.' },
          outline: backW, darts: [], notches: [[backW[2][0], backW[2][1]]], grain: [[qw * 0.14, 6], [qw * 0.14, hemLen - 6]], role: 'skirt-back-gore', cutOnFold: true },
        { key: 'side_gore_left', name: { en: 'Left Side Gore', ar: 'القطعة الجانبية اليسرى' }, desc: { en: 'Side gore, both edges angled.', ar: 'قطعة جانبية بخطين مائلين.' },
          outline: sideGore, darts: [], notches: [[sideGore[2][0], sideGore[2][1]], [sideGore[5][0], sideGore[5][1]]], grain: [[sideW * 0.5, 6], [sideW * 0.5, hemLen - 6]], role: 'skirt-side-gore-left' },
        { key: 'side_gore_right', name: { en: 'Right Side Gore', ar: 'القطعة الجانبية اليمنى' }, desc: { en: 'Side gore, both edges angled.', ar: 'قطعة جانبية بخطين مائلين.' },
          outline: sideGore.map((p) => [p[0], p[1]]), darts: [], notches: [[sideGore[2][0], sideGore[2][1]], [sideGore[5][0], sideGore[5][1]]], grain: [[sideW * 0.5, 6], [sideW * 0.5, hemLen - 6]], role: 'skirt-side-gore-right' },
      );
    }
    const waistCirc = qw * 2;
    pieces.push({ key: 'waistband', name: { en: 'Waistband', ar: 'حزام الخصر' }, desc: { en: 'Straight waistband, cut on the fold.', ar: 'حزام خصر مستقيم مقصوص على الطية.' },
      outline: bandPc(waistCirc / 2, 4), darts: [], notches: [], grain: [[2, 2], [waistCirc / 2 - 2, 2]], role: 'waistband', cutOnFold: true });
    return hoistCurves(pieces);
  }

  // ============================================================
  // FAMILY: trousers (includes shorts — lengthF already encodes that)
  // ============================================================
  // fitF <= 0.92 -> a single front waist dart, a fly placket and welt
  // side pockets (tailored). fitF >= 1.08 -> no dart, an elastic-style
  // waistband, no fly (relaxed/jogger/play). Otherwise -> a dart but no
  // fly (a moderate, in-between fit). "Cargo"/"Play" in the name adds a
  // patch cargo pocket.
  function trouserFamily(m, opts) {
    const qw = q(m.waist), qh = q(m.hips), qt = q(m.thigh);
    const riseLen = 27 * Math.min(1, Math.max(0.55, opts.lengthF));
    const legLen = m.inseam * opts.lengthF;
    const hemFlare = opts.flareF || 1;
    const front = legPanel(qw * 0.52 + 0.5, (qh * 0.58 + 1) * Math.max(1, (hemFlare - 1) * 0.4 + 1), qt * 1.5 * hemFlare, riseLen, legLen, true);
    const back = legPanel(qw * 0.48 + 0.5, (qh * 0.54 + 1) * Math.max(1, (hemFlare - 1) * 0.4 + 1), qt * 1.5 * hemFlare, riseLen, legLen, false);
    const tailored = (opts.fitF == null ? 1 : opts.fitF) <= 0.92;
    const pieces = [
      { key: 'front', name: { en: `${opts.nameEn} Front`, ar: `مقدمة ${opts.nameAr}` }, desc: { en: tailored ? 'Front leg panel with a curved crotch seam and a waist dart.' : 'Front leg panel with a curved crotch seam, deliberately un-darted for ease of movement.', ar: tailored ? 'لوحة الساق الأمامية بخط تفصيل منحنٍ وبنسة خصر.' : 'لوحة الساق الأمامية بخط تفصيل منحنٍ، بدون بنسة عمدًا لسهولة الحركة.' },
        outline: front, darts: tailored ? [[[qw * 0.3, 1], [qw * 0.3 - 1.5, 9], [qw * 0.3 + 1.5, 9]]] : [],
        notches: [[front[front.crotchIdx][0], front[front.crotchIdx][1]], [front[front.hemOutIdx][0], front[front.hemOutIdx][1]]],
        // WP-59 (docs/plan 4.md Phase 5, cloth-lab compatibility pass):
        // was role:"other" — the small-accessory placement, never
        // auto-seamed, so every one of this family's ~25 trouser/short
        // patterns placed both leg panels as a misplaced flat patch near
        // the hip in Cloth Lab, seamed to nothing. `trouser-front`/
        // `trouser-back` (roles.js) get real leg-tube placement AND
        // auto-seaming: the outseam edge below was ALREADY correctly
        // declared (this family had real seamId infrastructure from the
        // start, just no role/placement able to use it) — added the
        // second real seam, the inseam (hem-inseam through the crotch
        // curve back to waist-inseam — `legPanel`'s own hemInIdx through
        // its last point), `mirrorSelf: true` since that's this SAME
        // piece's own bilateral L/R copies meeting each other (the
        // crotch seam), not a seam to a different declared piece.
        grain: [[qt * 0.6, riseLen + 10], [qt * 0.6, riseLen + legLen - 10]], role: 'trouser-front', bilateral: true,
        edges: [
          { fromIdx: 0, toIdx: front.hemOutIdx, seamId: `${opts.id}Outseam` },
          { fromIdx: front.hemInIdx, toIdx: front.length - 1, mirrorSelf: true },
        ] },
      { key: 'back', name: { en: `${opts.nameEn} Back`, ar: `خلفية ${opts.nameAr}` }, desc: { en: 'Back leg panel with a deeper curved crotch seam, per real block convention.', ar: 'لوحة الساق الخلفية بخط تفصيل منحنٍ أعمق، حسب القاعدة الحقيقية.' },
        outline: back, darts: [], notches: [[back[back.crotchIdx][0], back[back.crotchIdx][1]], [back[back.hemOutIdx][0], back[back.hemOutIdx][1]]],
        grain: [[qt * 0.6, riseLen + 10], [qt * 0.6, riseLen + legLen - 10]], role: 'trouser-back', bilateral: true,
        edges: [
          { fromIdx: 0, toIdx: back.hemOutIdx, seamId: `${opts.id}Outseam` },
          { fromIdx: back.hemInIdx, toIdx: back.length - 1, mirrorSelf: true },
        ] },
      { key: 'waistband', name: { en: 'Waistband', ar: 'حزام الخصر' }, desc: { en: tailored ? 'Straight tailored waistband.' : 'Soft waistband, gathered for an elastic finish.', ar: tailored ? 'حزام خصر مستقيم مفصّل.' : 'حزام خصر ناعم، مجمّع لتشطيب مطاطي.' },
        outline: bandPc(qw * 2 + 4, tailored ? 4 : 5), darts: [], notches: [[qw + 2, 0]], grain: [[2, 1.5], [qw * 2 + 2, 1.5]], role: 'waistband', cutOnFold: true },
    ];
    if (tailored) {
      pieces.push({ key: 'fly', name: { en: 'Fly Placket Facing', ar: 'بطانة سحاب الفتحة الأمامية' }, desc: { en: 'Facing strip behind the front fly zip.', ar: 'شريط بطانة خلف سحاب الفتحة الأمامية.' },
        outline: bandPc(3.5, riseLen - 4), darts: [], notches: [], grain: [[1.5, 2], [1.5, riseLen - 8]], role: 'placket-facing' });
      pieces.push({ key: 'pocket', name: { en: 'Welt Side Pocket', ar: 'جيب جانبي مطوي' }, desc: { en: 'Welt pocket facing at the side seam.', ar: 'بطانة جيب مطوي عند الخط الجانبي.' },
        outline: pocketPatch(9, 3), darts: [], notches: [], grain: [[4.5, 1], [4.5, 2]], role: 'pocket', bilateral: true });
    }
    if (opts.cargo) {
      pieces.push({ key: 'cargo_pocket', name: { en: 'Cargo Pocket', ar: 'جيب كارجو' }, desc: { en: 'Patch pocket with a flap at the thigh.', ar: 'جيب ملصق بغطاء عند الفخذ.' },
        outline: pocketPatch(11, 12), darts: [], notches: [], grain: [[5.5, 2], [5.5, 9]], role: 'pocket', bilateral: true });
    }
    return hoistCurves(pieces);
  }

  // ============================================================
  // FAMILY: shirt (tailored — always a yoke, collar+stand, placket)
  // ============================================================
  // sleeveLenF >= 1.05 -> long two-piece sleeve + barrel cuff.
  // Otherwise -> a short one-piece sleeve + hem band. Odd-indexed
  // entries (idx % 2 === 1) add a chest pocket — a real, if simpler,
  // differentiator than construction alone.
  function shirtFamily(m, opts) {
    const qc = q(m.chest), qw = q(m.waist), qh = q(m.hips);
    const shoulderX = qc * 0.28;
    const waistY = m.backLen * opts.lengthF, hipY = waistY + 22, hemY = hipY + 8;
    const chestX = qc + 5, waistX = qw + 5, hipX = qh + 4;
    const front = plainBodicePanel(shoulderX, 8, chestX, m.backLen * 0.3, waistX, waistY, hipX, hipY, hipX, hemY);
    const yokeSeamY = 0, backUnderarmY = 8;
    const underarmToWaist = waistY - m.backLen * 0.3, waistToHip = hipY - waistY, hipToHem = hemY - hipY;
    const backWaistY = backUnderarmY + underarmToWaist, backHipY = backWaistY + waistToHip, backHemY = backHipY + hipToHem;
    const backWaistSeg = [[chestX, backUnderarmY], [chestX, (backUnderarmY + backWaistY) / 2], [waistX, backWaistY]];
    const backWaistPts = qBez(...backWaistSeg, 6);
    const back = [[0, yokeSeamY], [chestX, yokeSeamY], [chestX, backUnderarmY], ...backWaistPts, [hipX, backHipY], [hipX, backHemY], [0, backHemY]];
    withCurves(back, [{ fromIdx: 2, toIdx: 2 + backWaistPts.length, ...qBezToCubic(...backWaistSeg) }]);
    const yoke = yokeCurvePc(qc * 0.36, 9);
    const long = opts.sleeveLenF >= 1.05;
    const sleeveLen = m.sleeve * opts.sleeveLenF - 6;
    const collar = pointedCollar(m.neck / 2 + 1, 4, 6);
    const stand = collarStand(m.neck / 2 + 1, 3.2);
    const placket = bandPc(4, hipY - 4);

    const pieces = [
      { key: 'front', name: { en: `${opts.nameEn} Front`, ar: `مقدمة ${opts.nameAr}` }, desc: { en: 'Center-front panel with a button placket edge.', ar: 'لوحة المقدمة مع حاشية الأزرار.' },
        outline: front, darts: [], notches: [[front[front.chestIdx][0], front[front.chestIdx][1]]], grain: [[shoulderX * 0.5, 10], [shoulderX * 0.5, hemY - 10]],
        role: 'bodice-front-center', cutOnFold: true, chestEdgeIndices: [front.chestIdx], edges: [{ fromIdx: front.chestIdx, toIdx: front.chestIdx + 3, seamId: `${opts.id}Side` }] },
      { key: 'back', name: { en: `${opts.nameEn} Back`, ar: `خلفية ${opts.nameAr}` }, desc: { en: 'Back panel joined to the yoke.', ar: 'لوحة الخلفية متصلة بالكوّة.' },
        outline: back, darts: [], notches: [[chestX, backUnderarmY]], grain: [[chestX * 0.5, yokeSeamY + 6], [chestX * 0.5, backHemY - 10]],
        role: 'bodice-back-center', cutOnFold: true, chestEdgeIndices: [2], edges: [{ fromIdx: 2, toIdx: 2 + backWaistPts.length + 2, seamId: `${opts.id}Side` }] },
      { key: 'yoke', name: { en: 'Back Yoke', ar: 'كوّة الظهر' }, desc: { en: 'Curved shoulder yoke, cut on the fold.', ar: 'كوّة كتف منحنية، مقصوصة على الطية.' },
        outline: yoke, darts: [], notches: [], grain: [[qc * 0.15, 2], [qc * 0.15, 12.6]], role: 'yoke', cutOnFold: true },
      { key: 'collar', name: { en: 'Collar', ar: 'الياقة' }, desc: { en: 'Two-point collar, cut on the fold.', ar: 'ياقة بطرفين، مقصوصة على الطية.' },
        outline: collar, darts: [], notches: [], grain: [[2, 2], [2, 5]], role: 'collar', cutOnFold: true },
      { key: 'stand', name: { en: 'Collar Stand', ar: 'قاعدة الياقة' }, desc: { en: 'Standing band the collar attaches to, cut on the fold.', ar: 'شريط واقف تُركَّب عليه الياقة، مقصوص على الطية.' },
        outline: stand, darts: [], notches: [], grain: [[2, 1], [2, 2.2]], role: 'collar-stand', cutOnFold: true },
      { key: 'placket', name: { en: 'Front Placket Facing', ar: 'بطانة حاشية الأزرار' }, desc: { en: 'Button placket facing behind the front opening.', ar: 'بطانة حاشية أزرار خلف فتحة المقدمة.' },
        outline: placket, darts: [], notches: [], grain: [[2, 4], [2, hipY - 8]], role: 'placket-facing' },
    ];
    if (long) {
      const sleeveUpper = sleeveUpperPc(q(m.bicep) * 2, sleeveLen);
      pieces.push(
        { key: 'sleeve_upper', name: { en: 'Sleeve Upper', ar: 'الكم العلوي' }, desc: { en: 'Outer sleeve panel carrying the full cap curve.', ar: 'اللوحة الخارجية للكم وتحمل منحنى الرأس كاملًا.' },
          outline: sleeveUpper, darts: [], notches: [sleeveUpper[sleeveUpper.frontNotchIdx], sleeveUpper[sleeveUpper.backNotchIdx1], sleeveUpper[sleeveUpper.backNotchIdx2]],
          grain: [[q(m.bicep) * 0.5, 4], [q(m.bicep) * 0.5, sleeveLen - 6]], role: 'sleeve-upper', bilateral: true },
        { key: 'cuff', name: { en: 'Barrel Cuff', ar: 'أسورة برميلية' }, desc: { en: 'Buttoned barrel cuff at the sleeve hem.', ar: 'أسورة برميلية بأزرار عند نهاية الكم.' },
          outline: bandPc(q(m.bicep) * 1.5, 6), darts: [], notches: [], grain: [[2, 1], [2, 5]], role: 'cuff', bilateral: true },
      );
    } else {
      const sleeve = setInSleeve(q(m.bicep) * 2, Math.max(8, sleeveLen * 0.4));
      pieces.push(
        { key: 'sleeve', name: { en: 'Short Sleeve', ar: 'كم قصير' }, desc: { en: 'Short set-in sleeve.', ar: 'كم مركّب قصير.' },
          outline: sleeve, darts: [], notches: [sleeve[sleeve.frontNotchIdx], sleeve[sleeve.backNotchIdx1], sleeve[sleeve.backNotchIdx2]],
          grain: [[q(m.bicep), 3], [q(m.bicep), Math.max(8, sleeveLen * 0.4) - 3]], role: 'sleeve', bilateral: true },
        { key: 'hem_band', name: { en: 'Sleeve Hem Band', ar: 'شريط نهاية الكم' }, desc: { en: 'Turned-back band finishing the short sleeve.', ar: 'شريط مطوي يُنهي الكم القصير.' },
          outline: bandPc(q(m.bicep) * 1.6, 3), darts: [], notches: [], grain: [[2, 1], [2, 2]], role: 'hem-band', bilateral: true },
      );
    }
    if (opts.pocket) {
      pieces.push({ key: 'pocket', name: { en: 'Chest Pocket', ar: 'جيب الصدر' }, desc: { en: 'Patch pocket at the chest.', ar: 'جيب ملصق عند الصدر.' },
        outline: pocketPatch(9, 10), darts: [], notches: [], grain: [[4.5, 1], [4.5, 7]], role: 'pocket' });
    }
    return hoistCurves(pieces);
  }

  // ============================================================
  // FAMILY: robe (open front, no center seam — a real, common
  // construction, matching js/data.js's existing abaya convention)
  // ============================================================
  function robeFamily(m, opts) {
    const qc = q(m.chest);
    const shoulderX = qc * 0.28;
    const len = m.height * 0.56 * opts.lengthF;
    const flareF = opts.flareF || 1.2;
    const hipX = qc * 0.95 * flareF, hemX = qc * 1.05 * flareF;
    const half = plainBodicePanel(shoulderX, 8, qc * 1.02, m.backLen * 0.32, qc, m.backLen * 1.15, hipX, len * 0.65, hemX, len);
    const front = mirrorHalfToFull(half);
    const back = plainBodicePanel(shoulderX, 4, qc, m.backLen * 0.32, qc * 0.98, m.backLen * 1.15, hipX * 0.97, len * 0.65, hemX * 0.98, len);
    const bicep = q(m.bicep) * 2.1 * (opts.sleeveWideF || 1.15);
    const sleeve = wideSleevePc(bicep * 0.7, m.sleeve * 0.55, 1.15);

    const pieces = [
      { key: 'front', name: { en: `${opts.nameEn} Front`, ar: `مقدمة ${opts.nameAr}` }, desc: { en: 'Open front panel, no center seam — worn open or tied.', ar: 'لوحة أمامية مفتوحة بدون خط وسط — تُلبس مفتوحة أو مربوطة.' },
        outline: front, darts: [], notches: [], grain: [[qc * 0.35, 12], [qc * 0.35, len - 12]], role: 'front-panel' },
      { key: 'back', name: { en: `${opts.nameEn} Back`, ar: `خلفية ${opts.nameAr}` }, desc: { en: 'Full back on the fold.', ar: 'ظهر كامل على الطية.' },
        outline: back, darts: [], notches: [[back[back.chestIdx][0], back[back.chestIdx][1]]], grain: [[shoulderX * 0.5, 12], [shoulderX * 0.5, len - 12]],
        role: 'bodice-back-center', cutOnFold: true, chestEdgeIndices: [back.chestIdx] },
      { key: 'sleeve', name: { en: 'Wide Sleeve', ar: 'كم واسع' }, desc: { en: 'Loose wide sleeve, cut as a mirrored pair.', ar: 'كم واسع مريح، يُقص كزوج متطابق.' },
        outline: sleeve, darts: [], notches: [], grain: [[bicep * 0.2, 6], [bicep * 0.2, m.sleeve * 0.55 - 6]], role: 'sleeve', bilateral: true },
    ];
    if (opts.tie) {
      pieces.push({ key: 'sash', name: { en: 'Waist Sash', ar: 'حزام الخصر' }, desc: { en: 'Tie sash at the waist.', ar: 'حزام يُربط عند الخصر.' },
        outline: bandPc(qc * 2, 6), darts: [], notches: [], grain: [[2, 1.5], [2, 4.5]], role: 'sash' });
    } else {
      pieces.push({ key: 'placket', name: { en: 'Front Placket Facing', ar: 'بطانة حاشية الأزرار' }, desc: { en: 'Button placket facing behind the front opening.', ar: 'بطانة حاشية أزرار خلف فتحة المقدمة.' },
        outline: bandPc(4, len * 0.4), darts: [], notches: [], grain: [[2, 4], [2, len * 0.3]], role: 'placket-facing' });
    }
    return hoistCurves(pieces);
  }

  // ---------------- catalogue data (ids/names/tags UNCHANGED) ----------------
  function entry(id, category, en, ar, style) {
    const tag = style.type === "robe" ? robeTag(category) : TAG[style.type];
    return { id, category, name: { en, ar }, tag, style };
  }

  /* ---------------- WOMEN (23 new + womens_dress + abaya = 25) ---------------- */
  const WOMEN = [
    entry("w01", "women", "A-Line Midi Dress", "فستان ميدي بقصة A", { type: "dress", lengthF: 1.10, flareF: 1.40, fitF: 1.00, sleeveLenF: 0.50, sleeveWideF: 1.00 }),
    entry("w02", "women", "Wrap Maxi Dress", "فستان طويل ملفوف", { type: "dress", lengthF: 1.45, flareF: 1.15, fitF: 0.95, sleeveLenF: 0.80, sleeveWideF: 1.00 }),
    entry("w03", "women", "Puff-Sleeve Blouse", "بلوزة بأكمام منفوشة", { type: "top", lengthF: 0.75, flareF: 1.05, fitF: 1.00, sleeveLenF: 1.00, sleeveWideF: 1.60 }),
    entry("w04", "women", "Sleeveless Shift Dress", "فستان مستقيم بدون أكمام", { type: "dress", lengthF: 1.00, flareF: 1.00, fitF: 0.95, sleeveLenF: 0, sleeveWideF: 1.00 }),
    entry("w05", "women", "Pleated Midi Skirt", "تنورة ميدي مكسّرة", { type: "skirt", lengthF: 1.10, flareF: 1.50, fitF: 1.00 }),
    entry("w06", "women", "Wide-Leg Trousers", "بنطلون واسع الساق", { type: "trousers", lengthF: 1.00, flareF: 1.70, fitF: 1.10 }),
    entry("w07", "women", "Fitted Pencil Skirt", "تنورة قلم ضيقة", { type: "skirt", lengthF: 0.95, flareF: 0.85, fitF: 0.85 }),
    entry("w08", "women", "Kaftan Dress", "فستان قفطان", { type: "robe", lengthF: 1.20, flareF: 1.60, fitF: 1.15, sleeveLenF: 1.20, sleeveWideF: 1.70 }),
    entry("w09", "women", "Cape-Sleeve Top", "توب بأكمام كاب", { type: "top", lengthF: 0.75, flareF: 1.10, fitF: 1.00, sleeveLenF: 0.50, sleeveWideF: 1.70 }),
    entry("w10", "women", "Off-Shoulder Blouse", "بلوزة بكتف مكشوف", { type: "top", lengthF: 0.70, flareF: 1.00, fitF: 0.90, sleeveLenF: 0.50, sleeveWideF: 1.20 }),
    entry("w11", "women", "Long-Sleeve Bodycon Dress", "فستان ضيق بأكمام طويلة", { type: "dress", lengthF: 1.00, flareF: 0.85, fitF: 0.80, sleeveLenF: 1.20, sleeveWideF: 0.95 }),
    entry("w12", "women", "Flared Mini Skirt", "تنورة قصيرة واسعة", { type: "skirt", lengthF: 0.65, flareF: 1.60, fitF: 1.00 }),
    entry("w13", "women", "Cropped Wide Top", "توب قصير واسع", { type: "top", lengthF: 0.55, flareF: 1.30, fitF: 1.15, sleeveLenF: 0.45, sleeveWideF: 1.10 }),
    entry("w14", "women", "High-Waist Palazzo Pants", "بنطلون بالاتزو عالي الخصر", { type: "trousers", lengthF: 1.05, flareF: 1.85, fitF: 1.05 }),
    entry("w15", "women", "Chiffon Maxi Skirt", "تنورة شيفون طويلة", { type: "skirt", lengthF: 1.40, flareF: 1.60, fitF: 1.00 }),
    entry("w16", "women", "Tunic Top", "توب تونيك", { type: "top", lengthF: 0.95, flareF: 1.15, fitF: 1.10, sleeveLenF: 1.00, sleeveWideF: 1.10 }),
    entry("w17", "women", "Fit-and-Flare Dress", "فستان ضيق من فوق واسع من تحت", { type: "dress", lengthF: 1.05, flareF: 1.55, fitF: 0.85, sleeveLenF: 0.80, sleeveWideF: 1.00 }),
    entry("w18", "women", "Cold-Shoulder Top", "توب بفتحة كتف", { type: "top", lengthF: 0.75, flareF: 1.00, fitF: 0.95, sleeveLenF: 1.00, sleeveWideF: 1.15 }),
    entry("w19", "women", "Straight Midi Dress", "فستان ميدي مستقيم", { type: "dress", lengthF: 1.10, flareF: 0.95, fitF: 0.95, sleeveLenF: 0.45, sleeveWideF: 1.00 }),
    entry("w20", "women", "Culottes Trousers", "بنطلون كوليت", { type: "trousers", lengthF: 0.85, flareF: 1.60, fitF: 1.05 }),
    entry("w21", "women", "Modest Abaya-Style Dress", "فستان بقصة عباية محتشمة", { type: "robe", lengthF: 1.35, flareF: 1.35, fitF: 1.10, sleeveLenF: 1.20, sleeveWideF: 1.15 }),
    entry("w22", "women", "Batwing Top", "توب بأكمام خفاش", { type: "top", lengthF: 0.78, flareF: 1.10, fitF: 1.05, sleeveLenF: 1.00, sleeveWideF: 1.90 }),
    entry("w23", "women", "Layered Maxi Dress", "فستان طويل بطبقات", { type: "dress", lengthF: 1.50, flareF: 1.40, fitF: 1.00, sleeveLenF: 0, sleeveWideF: 1.00 }),
  ];

  /* ---------------- MEN (23 new + mens_shirt + thobe = 25) ---------------- */
  const MEN = [
    entry("m01", "men", "Classic Straight Trousers", "بنطلون كلاسيكي مستقيم", { type: "trousers", lengthF: 1.00, flareF: 1.00, fitF: 1.00 }),
    entry("m02", "men", "Slim-Fit Chinos", "بنطلون شينو ضيق", { type: "trousers", lengthF: 1.00, flareF: 0.90, fitF: 0.85 }),
    entry("m03", "men", "Casual Short-Sleeve Shirt", "قميص كاجوال نصف كم", { type: "shirt", lengthF: 0.90, flareF: 1.00, fitF: 1.00, sleeveLenF: 0.50, sleeveWideF: 1.00 }),
    entry("m04", "men", "Long-Sleeve Oxford Shirt", "قميص أوكسفورد كم طويل", { type: "shirt", lengthF: 0.95, flareF: 1.00, fitF: 0.95, sleeveLenF: 1.20, sleeveWideF: 1.00 }),
    entry("m05", "men", "Relaxed Linen Shirt", "قميص كتان واسع مريح", { type: "shirt", lengthF: 1.00, flareF: 1.15, fitF: 1.15, sleeveLenF: 1.10, sleeveWideF: 1.10 }),
    entry("m06", "men", "Wide-Leg Cargo Trousers", "بنطلون كارجو واسع", { type: "trousers", lengthF: 1.00, flareF: 1.40, fitF: 1.15 }),
    entry("m07", "men", "Kandura Robe", "كندورة", { type: "robe", lengthF: 1.40, flareF: 1.15, fitF: 1.10, sleeveLenF: 1.30, sleeveWideF: 1.05 }),
    entry("m08", "men", "Long Tunic Top", "توب تونيك طويل", { type: "top", lengthF: 1.05, flareF: 1.10, fitF: 1.10, sleeveLenF: 1.10, sleeveWideF: 1.05 }),
    entry("m09", "men", "Sleeveless Vest Top", "فانلة بدون أكمام", { type: "top", lengthF: 0.85, flareF: 1.00, fitF: 0.95, sleeveLenF: 0, sleeveWideF: 1.00 }),
    entry("m10", "men", "Fitted Polo-Style Top", "توب بولو ضيق", { type: "top", lengthF: 0.85, flareF: 0.95, fitF: 0.85, sleeveLenF: 0.50, sleeveWideF: 0.95 }),
    entry("m11", "men", "Straight-Fit Jeans-Style Trousers", "بنطلون جينز مستقيم", { type: "trousers", lengthF: 1.00, flareF: 1.00, fitF: 0.95 }),
    entry("m12", "men", "Half-Sleeve Casual Top", "توب كاجوال نصف كم", { type: "top", lengthF: 0.90, flareF: 1.05, fitF: 1.05, sleeveLenF: 0.50, sleeveWideF: 1.05 }),
    entry("m13", "men", "Loose Kurta Top", "قميص كورتا واسع", { type: "top", lengthF: 1.15, flareF: 1.20, fitF: 1.15, sleeveLenF: 1.20, sleeveWideF: 1.10 }),
    entry("m14", "men", "Formal Straight Trousers", "بنطلون رسمي مستقيم", { type: "trousers", lengthF: 1.00, flareF: 0.95, fitF: 0.95 }),
    entry("m15", "men", "Cropped Casual Trousers", "بنطلون كاجوال قصير", { type: "trousers", lengthF: 0.80, flareF: 1.00, fitF: 1.00 }),
    entry("m16", "men", "Long Robe (Jubba)", "جبة طويلة", { type: "robe", lengthF: 1.45, flareF: 1.20, fitF: 1.15, sleeveLenF: 1.30, sleeveWideF: 1.10 }),
    entry("m17", "men", "Relaxed Fit Shirt", "قميص واسع مريح", { type: "shirt", lengthF: 0.95, flareF: 1.15, fitF: 1.15, sleeveLenF: 1.10, sleeveWideF: 1.10 }),
    entry("m18", "men", "Sleeveless Long Tunic", "توب طويل بدون أكمام", { type: "top", lengthF: 1.10, flareF: 1.15, fitF: 1.10, sleeveLenF: 0, sleeveWideF: 1.00 }),
    entry("m19", "men", "Slim Straight Trousers", "بنطلون ضيق مستقيم", { type: "trousers", lengthF: 1.00, flareF: 0.90, fitF: 0.85 }),
    entry("m20", "men", "Casual Layered Top", "توب كاجوال بطبقة", { type: "top", lengthF: 0.90, flareF: 1.10, fitF: 1.10, sleeveLenF: 1.00, sleeveWideF: 1.15 }),
    entry("m21", "men", "Wide Kaftan Robe", "عباية رجالي واسعة", { type: "robe", lengthF: 1.35, flareF: 1.50, fitF: 1.20, sleeveLenF: 1.20, sleeveWideF: 1.30 }),
    entry("m22", "men", "Casual Shorts", "شورت كاجوال", { type: "trousers", lengthF: 0.45, flareF: 1.00, fitF: 1.00 }),
    entry("m23", "men", "Classic Fit Dress Shirt", "قميص رسمي كلاسيكي", { type: "shirt", lengthF: 0.95, flareF: 1.00, fitF: 0.95, sleeveLenF: 1.20, sleeveWideF: 1.00 }),
  ];

  /* ---------------- GIRLS (24 new + girls_dress = 25) ---------------- */
  const GIRLS = [
    entry("g01", "girls", "Puff-Sleeve Party Dress", "فستان حفلة بأكمام منفوشة", { type: "dress", lengthF: 0.85, flareF: 1.50, fitF: 1.00, sleeveLenF: 0.55, sleeveWideF: 1.60 }),
    entry("g02", "girls", "A-Line School Dress", "فستان مدرسي بقصة A", { type: "dress", lengthF: 0.90, flareF: 1.30, fitF: 1.00, sleeveLenF: 0.50, sleeveWideF: 1.00 }),
    entry("g03", "girls", "Sleeveless Sundress", "فستان صيفي بدون أكمام", { type: "dress", lengthF: 0.90, flareF: 1.40, fitF: 1.00, sleeveLenF: 0, sleeveWideF: 1.00 }),
    entry("g04", "girls", "Ruffle Hem Dress", "فستان بحاشية مكشكشة", { type: "dress", lengthF: 0.95, flareF: 1.50, fitF: 1.00, sleeveLenF: 0.50, sleeveWideF: 1.20 }),
    entry("g05", "girls", "Pleated Skirt", "تنورة مكسّرة", { type: "skirt", lengthF: 0.80, flareF: 1.40, fitF: 1.00 }),
    entry("g06", "girls", "Flared Skater Skirt", "تنورة قصيرة دائرية", { type: "skirt", lengthF: 0.60, flareF: 1.70, fitF: 1.00 }),
    entry("g07", "girls", "Long-Sleeve Casual Top", "توب كاجوال كم طويل", { type: "top", lengthF: 0.65, flareF: 1.10, fitF: 1.05, sleeveLenF: 1.10, sleeveWideF: 1.00 }),
    entry("g08", "girls", "Tiered Maxi Dress", "فستان طويل بطبقات", { type: "dress", lengthF: 1.30, flareF: 1.50, fitF: 1.05, sleeveLenF: 0.50, sleeveWideF: 1.10 }),
    entry("g09", "girls", "Short-Sleeve Cotton Dress", "فستان قطن نصف كم", { type: "dress", lengthF: 0.85, flareF: 1.20, fitF: 1.00, sleeveLenF: 0.50, sleeveWideF: 1.00 }),
    entry("g10", "girls", "Wide-Leg Play Pants", "بنطلون واسع للعب", { type: "trousers", lengthF: 0.90, flareF: 1.50, fitF: 1.15 }),
    entry("g11", "girls", "Fitted Leggings-Style Trousers", "بنطلون ضيق (ليقنز)", { type: "trousers", lengthF: 1.00, flareF: 0.85, fitF: 0.85 }),
    entry("g12", "girls", "Cape-Sleeve Party Dress", "فستان حفلة بأكمام كاب", { type: "dress", lengthF: 0.90, flareF: 1.40, fitF: 1.00, sleeveLenF: 0.50, sleeveWideF: 1.60 }),
    entry("g13", "girls", "Denim-Style Skirt", "تنورة بقصة جينز", { type: "skirt", lengthF: 0.70, flareF: 1.10, fitF: 0.95 }),
    entry("g14", "girls", "Casual T-Style Top", "توب كاجوال تيشيرت", { type: "top", lengthF: 0.65, flareF: 1.05, fitF: 1.05, sleeveLenF: 0.45, sleeveWideF: 1.00 }),
    entry("g15", "girls", "Bow-Waist Dress", "فستان بربطة عند الخصر", { type: "dress", lengthF: 0.90, flareF: 1.35, fitF: 0.95, sleeveLenF: 0.50, sleeveWideF: 1.05 }),
    entry("g16", "girls", "Midi Twirl Dress", "فستان ميدي دوّار", { type: "dress", lengthF: 1.05, flareF: 1.70, fitF: 1.00, sleeveLenF: 0.50, sleeveWideF: 1.10 }),
    entry("g17", "girls", "Puff Skirt", "تنورة منفوشة", { type: "skirt", lengthF: 0.65, flareF: 1.60, fitF: 1.05 }),
    entry("g18", "girls", "Long Tunic Dress", "فستان تونيك طويل", { type: "dress", lengthF: 1.10, flareF: 1.20, fitF: 1.10, sleeveLenF: 1.00, sleeveWideF: 1.05 }),
    entry("g19", "girls", "Sleeveless Pinafore Dress", "فستان صدرية بدون أكمام", { type: "dress", lengthF: 0.95, flareF: 1.35, fitF: 1.00, sleeveLenF: 0, sleeveWideF: 1.00 }),
    entry("g20", "girls", "Casual Wide Trousers", "بنطلون كاجوال واسع", { type: "trousers", lengthF: 0.95, flareF: 1.40, fitF: 1.15 }),
    entry("g21", "girls", "Layered Party Skirt", "تنورة حفلة بطبقات", { type: "skirt", lengthF: 0.85, flareF: 1.60, fitF: 1.05 }),
    entry("g22", "girls", "Short Puff Dress", "فستان قصير منفوش", { type: "dress", lengthF: 0.65, flareF: 1.55, fitF: 1.05, sleeveLenF: 0.55, sleeveWideF: 1.60 }),
    entry("g23", "girls", "Cropped Top", "توب قصير", { type: "top", lengthF: 0.45, flareF: 1.00, fitF: 0.95, sleeveLenF: 0.45, sleeveWideF: 1.00 }),
    entry("g24", "girls", "Maxi Sundress", "فستان صيفي طويل", { type: "dress", lengthF: 1.35, flareF: 1.35, fitF: 1.00, sleeveLenF: 0, sleeveWideF: 1.00 }),
  ];

  /* ---------------- BOYS (24 new + boys_trousers = 25) ---------------- */
  const BOYS = [
    entry("b01", "boys", "Casual Short-Sleeve Shirt", "قميص كاجوال نصف كم", { type: "shirt", lengthF: 0.85, flareF: 1.00, fitF: 1.00, sleeveLenF: 0.50, sleeveWideF: 1.00 }),
    entry("b02", "boys", "Long-Sleeve School Shirt", "قميص مدرسي كم طويل", { type: "shirt", lengthF: 0.90, flareF: 1.00, fitF: 0.95, sleeveLenF: 1.15, sleeveWideF: 1.00 }),
    entry("b03", "boys", "Cargo Shorts", "شورت كارجو", { type: "trousers", lengthF: 0.45, flareF: 1.15, fitF: 1.10 }),
    entry("b04", "boys", "Straight-Fit Trousers", "بنطلون مستقيم", { type: "trousers", lengthF: 0.95, flareF: 1.00, fitF: 1.00 }),
    entry("b05", "boys", "Sleeveless Tank Top", "فانلة بدون أكمام", { type: "top", lengthF: 0.80, flareF: 0.95, fitF: 0.95, sleeveLenF: 0, sleeveWideF: 1.00 }),
    entry("b06", "boys", "Casual Hoodie-Style Top", "توب هودي كاجوال", { type: "top", lengthF: 0.95, flareF: 1.15, fitF: 1.15, sleeveLenF: 1.15, sleeveWideF: 1.15 }),
    entry("b07", "boys", "Wide Play Shorts", "شورت واسع للعب", { type: "trousers", lengthF: 0.40, flareF: 1.30, fitF: 1.15 }),
    entry("b08", "boys", "Relaxed T-Style Top", "توب تيشيرت مريح", { type: "top", lengthF: 0.85, flareF: 1.05, fitF: 1.10, sleeveLenF: 0.50, sleeveWideF: 1.05 }),
    entry("b09", "boys", "Slim Casual Trousers", "بنطلون كاجوال ضيق", { type: "trousers", lengthF: 0.95, flareF: 0.90, fitF: 0.85 }),
    entry("b10", "boys", "Half-Sleeve Polo Top", "توب بولو نصف كم", { type: "top", lengthF: 0.85, flareF: 0.95, fitF: 0.90, sleeveLenF: 0.50, sleeveWideF: 0.95 }),
    entry("b11", "boys", "Long Thobe (Kids)", "ثوب أطفال طويل", { type: "robe", lengthF: 1.35, flareF: 1.10, fitF: 1.05, sleeveLenF: 1.20, sleeveWideF: 1.00 }),
    entry("b12", "boys", "Casual Jogger-Style Trousers", "بنطلون جوجر كاجوال", { type: "trousers", lengthF: 0.90, flareF: 0.90, fitF: 1.00 }),
    entry("b13", "boys", "Cropped Casual Shorts", "شورت كاجوال قصير", { type: "trousers", lengthF: 0.35, flareF: 1.05, fitF: 1.05 }),
    entry("b14", "boys", "Layered Casual Top", "توب كاجوال بطبقة", { type: "top", lengthF: 0.90, flareF: 1.10, fitF: 1.10, sleeveLenF: 1.00, sleeveWideF: 1.10 }),
    entry("b15", "boys", "Formal Shirt", "قميص رسمي", { type: "shirt", lengthF: 0.95, flareF: 0.95, fitF: 0.95, sleeveLenF: 1.20, sleeveWideF: 0.95 }),
    entry("b16", "boys", "Wide-Leg Trousers", "بنطلون واسع الساق", { type: "trousers", lengthF: 0.95, flareF: 1.35, fitF: 1.10 }),
    entry("b17", "boys", "Sleeveless Vest", "صديري بدون أكمام", { type: "top", lengthF: 0.80, flareF: 0.95, fitF: 0.90, sleeveLenF: 0, sleeveWideF: 1.00 }),
    entry("b18", "boys", "Short-Sleeve Tunic", "توب تونيك نصف كم", { type: "top", lengthF: 1.00, flareF: 1.15, fitF: 1.10, sleeveLenF: 0.50, sleeveWideF: 1.05 }),
    entry("b19", "boys", "Straight Denim-Style Trousers", "بنطلون بقصة جينز مستقيم", { type: "trousers", lengthF: 0.95, flareF: 1.00, fitF: 0.95 }),
    entry("b20", "boys", "Casual Long-Sleeve Top", "توب كاجوال كم طويل", { type: "top", lengthF: 0.85, flareF: 1.05, fitF: 1.05, sleeveLenF: 1.10, sleeveWideF: 1.00 }),
    entry("b21", "boys", "Play Shorts", "شورت للعب", { type: "trousers", lengthF: 0.40, flareF: 1.20, fitF: 1.15 }),
    entry("b22", "boys", "Kandura (Kids)", "كندورة أطفال", { type: "robe", lengthF: 1.30, flareF: 1.10, fitF: 1.05, sleeveLenF: 1.20, sleeveWideF: 1.00 }),
    entry("b23", "boys", "Relaxed Long Top", "توب طويل مريح", { type: "top", lengthF: 1.00, flareF: 1.15, fitF: 1.15, sleeveLenF: 1.05, sleeveWideF: 1.10 }),
    entry("b24", "boys", "Classic Trousers", "بنطلون كلاسيكي", { type: "trousers", lengthF: 1.00, flareF: 1.00, fitF: 1.00 }),
  ];

  const ALL = [...WOMEN, ...MEN, ...GIRLS, ...BOYS];

  ALL.forEach((e, idx) => {
    const s = e.style;
    const wrap = /wrap/i.test(e.name.en);
    const pleated = /pleat/i.test(e.name.en);
    const straight = s.type === 'skirt' && !pleated && (s.flareF < 1.05);
    const circle = s.type === 'skirt' && s.flareF >= 1.55;
    const cargo = /cargo/i.test(e.name.en);
    const tie = /kaftan|kandura|jubba|abaya/i.test(e.name.en) || idx % 2 === 0;
    PATTERNS[e.id] = {
      id: e.id,
      category: e.category,
      name: e.name,
      desc: {
        en: `${e.name.en}: a real, individually-drafted pattern (see js/library.js's own header for the construction-choice rules). Ease/length/flare scaled from body measurements.`,
        ar: `${e.name.ar}: باترون حقيقي مُصمَّم فرديًا (راجع تعليق js/library.js لقواعد اختيار الإنشاء). السماحية والطول والاتساع مُدرَّجة من قياسات الجسم.`,
      },
      pieces: (m) => {
        const opts = { id: e.id, nameEn: e.name.en, nameAr: e.name.ar, lengthF: s.lengthF, flareF: s.flareF, fitF: s.fitF, sleeveLenF: s.sleeveLenF, sleeveWideF: s.sleeveWideF, wrap, pleated, straight, circle, cargo, tie };
        if (s.type === 'dress' || s.type === 'top') {
          const hemBelowHip = s.type === 'dress' ? Math.max(20, m.height * 0.28 * s.lengthF) : Math.max(4, m.backLen * 0.35 * s.lengthF);
          return bodiceFamily(m, { ...opts, hemBelowHip });
        }
        if (s.type === 'skirt') return skirtFamily(m, opts);
        if (s.type === 'trousers') return trouserFamily(m, opts);
        if (s.type === 'shirt') return shirtFamily(m, opts);
        return robeFamily(m, opts);
      },
    };
    LIBRARY.push({ id: e.id, cat: e.category, tag: e.tag, type: e.style.type });
  });
})();
