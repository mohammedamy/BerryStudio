/* ============================================================
   Reference Pattern Set — Phase 2 of docs/plan 4.md (Professional
   Pattern Library Rebuild). 12 patterns, 3 per category (women / men /
   girls / boys), each spanning one of three garment types: a fitted
   bodice+sleeve, a skirt/trouser, and a multi-piece tailored garment.

   Purpose (docs/plan 4.md §9 Phase 2): establish the drafting idiom,
   helper vocabulary and file conventions the later phases (3: the
   100-pattern core catalogue; 4: the Fancy/Leotards/Underwear
   collections) extend to the rest of the library. These 12 are NEW
   pattern ids, added alongside — not replacing — the existing 264
   registered patterns; nothing about the existing library changes.

   Every design here, unlike the five-scalar AIGen.build() catalogue in
   js/library.js, is individually drafted: named drafting basis stated
   in each pattern's own comment (block + ease budget in cm at chest/
   bust, waist, hip), real construction pieces (yokes, plackets, collar
   stands, two-piece sleeves, cuffs, waistbands, pockets — whatever the
   design calls for), real suppression (darts or princess/raglan seams —
   never a plain unshaped panel on a fitted garment), notches at every
   seam needing registration, `curves` metadata on every armhole,
   neckline, sleeve cap, crotch curve and princess/raglan seam (never a
   dense sampled polyline pretending to be straight), and explicit
   `seamEdges` declarations (docs/plan 4.md §5.2 / Phase 1) on the seams
   that are genuinely measurable that way.

   Any two designs below differ in at least two of: piece count, seam
   architecture, suppression method, sleeve construction, neckline
   construction, closure type (docs/plan 4.md §7.1's differentiation
   requirement) — e.g. the women's blouse uses princess seams + a plain
   set-in sleeve; the girls' top uses the SAME princess-seam suppression
   but a gathered puff sleeve instead (sleeve construction differs); the
   boys' tee uses a raglan seam instead of princess seams at all
   (suppression method AND sleeve construction both differ).

   Construction geometry (curve sampling, princess/raglan/plain bodice
   panels, trouser legs, gored skirts, collars, sleeves, yokes) lives in
   js/pattern-builders.js — a real shared module, not a per-file local
   copy, because Phase 3 (the 100-pattern core catalogue) reuses this
   exact vocabulary across ~100 more patterns; see that file's own header
   for why this crosses the line from "cheap to duplicate" (js/fancy-
   patterns.js's/js/underwear-library.js's own ~20-line curve-math
   copies) to "should be a real shared module."

   Relies on q(), PATTERNS, LIBRARY from data.js, and the pure pleat-
   width math in js/pleats.js (computePleats) — reused rather than
   re-derived, per docs/plan 4.md §10's "read before writing" rule.
   ============================================================ */
import { q, PATTERNS, LIBRARY } from './data.js';
import { computePleats } from './pleats.js';
import {
  qBez, qBezToCubic, withCurves, hoistCurves,
  bandPc, pointedCollar, collarStand, setInSleeve,
  princessCurve, legPanel, princessPanel, gorePanel, sideGorePanel,
  plainBodicePanel, yokeCurvePc, pocketPatch, sleeveUpperPc, sleeveUnderPc,
  puffSleevePc, roundCollarPc, raglanBodyPanel, raglanSleevePc,
} from './pattern-builders.js';

(function () {
  "use strict";









  // ============================================================
  // 1. WOMEN — Princess-Seam Blouse (bodice + sleeve)
  // Drafting basis: misses' princess-seam block (bust dart rotated fully
  // into the princess seam — no separate bust dart). Ease budget: bust
  // +8cm, waist +8cm, hip +8cm (semi-fitted blouse). 3/4-length set-in
  // sleeve, plain round neckline finished with a self-facing (no collar).
  // ============================================================
  PATTERNS.ref_w_blouse = {
    id: 'ref_w_blouse', category: 'women',
    name: { en: 'Princess-Seam Blouse', ar: 'بلوزة بقصة أميرة' },
    desc: {
      en: 'Semi-fitted blouse shaped entirely by princess seams (no bust dart) with a 3/4-length set-in sleeve and a self-faced round neckline. Ease: +8cm bust/waist/hip.',
      ar: 'بلوزة شبه ضيقة يتشكل قصّها بالكامل عبر خطوط الأميرة (بدون بنسة صدر) مع كم مركّب بطول ثلاثة أرباع وخط رقبة مستدير ببطانة ذاتية. سماحية: +٨سم عند الصدر والخصر والورك.',
    },
    pieces: (m) => {
      const chest = q(m.chest), waist = q(m.waist), hips = q(m.hips);
      const b = princessPanel({ chest, waist, hips, backLen: m.backLen, necklineDepth: 7, hemBelowHip: 22 });
      const sleeveLen = m.sleeve * 0.6;
      const sleeve = setInSleeve(q(m.bicep) * 2, sleeveLen);

      const pieces = [
        {
          key: 'front_center', name: { en: 'Blouse Front Center', ar: 'وسط مقدمة البلوزة' },
          desc: { en: 'Center-front panel; princess seam carries all bust shaping.', ar: 'لوحة وسط المقدمة؛ يحمل خط الأميرة كامل تشكيل الصدر.' },
          outline: b.frontCenter, darts: [], notches: [b.frontCenter[b.frontCenter.bustNotchIdx], b.frontCenter[b.frontCenter.waistNotchIdx]],
          grain: [[b.shoulderX * 0.4, 10], [b.shoulderX * 0.4, b.hemY - 10]],
          role: 'bodice-front-center', cutOnFold: true,
          edges: [{ fromIdx: b.frontCenter.princessFromIdx, toIdx: b.frontCenter.princessToIdx, seamId: 'blousePrincessFront' }],
        },
        {
          key: 'front_side', name: { en: 'Blouse Front Side', ar: 'جانب مقدمة البلوزة' },
          desc: { en: 'Side-front panel joining the armhole to the princess seam.', ar: 'لوحة الجانب الأمامي، تصل فتحة الإبط بخط الأميرة.' },
          outline: b.frontSide, darts: [], notches: [b.frontSide[b.frontSide.armholeFromIdx]],
          grain: [[b.sideX * 0.9, 15], [b.sideX * 0.9, b.hemY - 15]],
          role: 'bodice-front-side', bilateral: true,
          edges: [
            { fromIdx: b.frontSide.princessFromIdx, toIdx: b.frontSide.princessToIdx, seamId: 'blousePrincessFront' },
            { fromIdx: b.frontSide.length - 1, toIdx: b.frontSide.armholeFromIdx, seamId: 'blouseSide' },
          ],
        },
        {
          key: 'back_center', name: { en: 'Blouse Back Center', ar: 'وسط خلفية البلوزة' },
          desc: { en: 'Center-back panel on the fold.', ar: 'لوحة وسط الخلفية على الطية.' },
          outline: b.backCenter, darts: [], notches: [b.backCenter[b.backCenter.bustNotchIdx], b.backCenter[b.backCenter.waistNotchIdx]],
          grain: [[b.shoulderX * 0.4, 10], [b.shoulderX * 0.4, b.hemY - 10]],
          role: 'bodice-back-center', cutOnFold: true,
          edges: [{ fromIdx: b.backCenter.princessFromIdx, toIdx: b.backCenter.princessToIdx, seamId: 'blousePrincessBack' }],
        },
        {
          key: 'back_side', name: { en: 'Blouse Back Side', ar: 'جانب خلفية البلوزة' },
          desc: { en: 'Side-back panel joining the armhole to the princess seam.', ar: 'لوحة الجانب الخلفي، تصل فتحة الإبط بخط الأميرة.' },
          outline: b.backSide, darts: [], notches: [b.backSide[b.backSide.armholeFromIdx]],
          grain: [[b.sideX * 0.9, 15], [b.sideX * 0.9, b.hemY - 15]],
          role: 'bodice-back-side', bilateral: true,
          edges: [
            { fromIdx: b.backSide.princessFromIdx, toIdx: b.backSide.princessToIdx, seamId: 'blousePrincessBack' },
            { fromIdx: b.backSide.length - 1, toIdx: b.backSide.armholeFromIdx, seamId: 'blouseSide' },
          ],
        },
        {
          key: 'sleeve', name: { en: '3/4 Set-in Sleeve', ar: 'كم مركّب بطول ثلاثة أرباع' },
          desc: { en: 'Set-in sleeve, curved cap eased into the armhole; front single notch, back double notch.', ar: 'كم مركّب برأس منحنٍ يُركّب في فتحة الإبط؛ علامة تطابق واحدة أمامًا واثنتان خلفًا.' },
          outline: sleeve, darts: [], notches: [sleeve[sleeve.frontNotchIdx], sleeve[sleeve.backNotchIdx1], sleeve[sleeve.backNotchIdx2]],
          grain: [[q(m.bicep), 4], [q(m.bicep), sleeveLen - 4]],
          role: 'sleeve', bilateral: true,
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_w_blouse', cat: 'women', tag: { en: 'Reference · Bodice+Sleeve', ar: 'مرجعي · قصة وكم' }, type: 'top' });


  // ============================================================
  // 2. WOMEN — A-Line Gored Skirt with Waistband (skirt)
  // Drafting basis: 4-gore A-line skirt block (front/back center gores on
  // the fold + two side gores), each gore ~1/4 of the body circumference.
  // Ease: waist +2cm (held snug by the waistband), hip +4cm. Suppression
  // is the gores' own angled seams (waist narrower than hip) PLUS a small
  // back waist dart on each side for a closer waist fit — a genuinely
  // different suppression method from the blouse's princess seams.
  // Straight waistband, centered back zip.
  // ============================================================
  PATTERNS.ref_w_skirt = {
    id: 'ref_w_skirt', category: 'women',
    name: { en: 'A-Line Gored Skirt', ar: 'تنورة بقصة A بأربع قطع' },
    desc: {
      en: 'Knee-length 4-gore A-line skirt: front and back center gores on the fold, two side gores, a small back waist dart, straight waistband and centered back zip. Ease: +2cm waist, +4cm hip.',
      ar: 'تنورة بقصة A بطول الركبة من أربع قطع: قطعتا المنتصف الأمامية والخلفية على الطية، وقطعتان جانبيتان، مع بنسة خصر خلفية صغيرة، وحزام خصر مستقيم وسحاب خلفي في المنتصف. سماحية: +٢سم عند الخصر و+٤سم عند الورك.',
    },
    pieces: (m) => {
      const qw = q(m.waist), qh = q(m.hips);
      const hipDrop = 18, hemLen = 55;
      const frontW = gorePanel(qw * 0.52, qh * 0.58, qh * 0.68, hipDrop, hemLen - hipDrop);
      const backW = gorePanel(qw * 0.48, qh * 0.54, qh * 0.64, hipDrop, hemLen - hipDrop);
      // Small back waist dart: real suppression, distinct from the gore
      // shaping itself — placed just off-center on the back gore.
      const backDart = [[qw * 0.24, 0], [qw * 0.24 - 1.5, 8], [qw * 0.24 + 1.5, 8]];
      const sideW = qw * 0.5, sideHipW = qh * 0.56, sideHemW = qh * 0.66;
      const sideGore = sideGorePanel(sideW, sideHipW, sideHemW, hipDrop, hemLen - hipDrop);
      const waistCirc = (qw * 0.52 * 2) + (qw * 0.48 * 2) + (sideW * 2);
      const waistband = bandPc(waistCirc / 2, 4); // cut on the fold, doubled to the full waist
      const placket = [[0, 0], [4, 0], [4, hipDrop + 10], [0, hipDrop + 10]];

      const pieces = [
        {
          key: 'front_gore', name: { en: 'Front Gore', ar: 'القطعة الأمامية' },
          desc: { en: 'Center-front gore on the fold; angled side seams flare from waist to hem.', ar: 'قطعة المنتصف الأمامي على الطية؛ خطوطها الجانبية مائلة تتسع من الخصر إلى الحاشية.' },
          outline: frontW, darts: [], notches: [[frontW[2][0], frontW[2][1]]],
          grain: [[qw * 0.15, 6], [qw * 0.15, hemLen - 6]],
          role: 'skirt-front-gore', cutOnFold: true,
        },
        {
          key: 'back_gore', name: { en: 'Back Gore', ar: 'القطعة الخلفية' },
          desc: { en: 'Center-back gore on the fold with a small waist dart for a closer fit, and a centered back zip opening.', ar: 'قطعة المنتصف الخلفي على الطية مع بنسة خصر صغيرة لضبط القياس، وفتحة سحاب خلفية في المنتصف.' },
          outline: backW, darts: [backDart], notches: [[backW[2][0], backW[2][1]]],
          grain: [[qw * 0.14, 6], [qw * 0.14, hemLen - 6]],
          role: 'skirt-back-gore', cutOnFold: true,
        },
        {
          key: 'side_gore_left', name: { en: 'Left Side Gore', ar: 'القطعة الجانبية اليسرى' },
          desc: { en: 'Side gore, both edges angled, joining the front and back gores.', ar: 'قطعة جانبية بخطين مائلين، تصل القطعتين الأمامية والخلفية.' },
          outline: sideGore, darts: [], notches: [[sideGore[2][0], sideGore[2][1]], [sideGore[5][0], sideGore[5][1]]],
          grain: [[sideW * 0.5, 6], [sideW * 0.5, hemLen - 6]],
          role: 'skirt-side-gore-left',
        },
        {
          key: 'side_gore_right', name: { en: 'Right Side Gore', ar: 'القطعة الجانبية اليمنى' },
          desc: { en: 'Side gore, both edges angled, joining the front and back gores.', ar: 'قطعة جانبية بخطين مائلين، تصل القطعتين الأمامية والخلفية.' },
          outline: sideGore.map((p) => [p[0], p[1]]), darts: [], notches: [[sideGore[2][0], sideGore[2][1]], [sideGore[5][0], sideGore[5][1]]],
          grain: [[sideW * 0.5, 6], [sideW * 0.5, hemLen - 6]],
          role: 'skirt-side-gore-right',
        },
        {
          key: 'waistband', name: { en: 'Waistband', ar: 'حزام الخصر' },
          desc: { en: 'Straight waistband, cut on the fold.', ar: 'حزام خصر مستقيم مقصوص على الطية.' },
          outline: waistband, darts: [], notches: [[waistCirc / 4, 0]],
          grain: [[2, 2], [waistCirc / 2 - 2, 2]],
          role: 'waistband', cutOnFold: true,
        },
        {
          key: 'placket', name: { en: 'Back Zip Placket Facing', ar: 'بطانة فتحة السحاب الخلفية' },
          desc: { en: 'Facing strip behind the centered back zip.', ar: 'شريط بطانة خلف السحاب الخلفي في المنتصف.' },
          outline: placket, darts: [], notches: [],
          grain: [[2, 2], [2, hipDrop + 6]],
          role: 'placket-facing',
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_w_skirt', cat: 'women', tag: { en: 'Reference · Skirt', ar: 'مرجعي · تنورة' }, type: 'skirt' });




  // ============================================================
  // 3. WOMEN — Tailored Shirt Dress (multi-piece tailored)
  // Drafting basis: classic tailored shirt block extended to dress
  // length. Ease: bust +10cm, waist +8cm, hip +8cm (loose, belted-or-not
  // tailored fit). Suppression: a single waist dart front and back (NOT
  // princess seams — a genuinely different method from pattern 1). Real
  // construction: back yoke, front button placket, collar + collar
  // stand, long sleeve with a barrel cuff and sleeve placket, chest
  // patch pocket.
  // ============================================================
  PATTERNS.ref_w_shirtdress = {
    id: 'ref_w_shirtdress', category: 'women',
    name: { en: 'Tailored Shirt Dress', ar: 'فستان قميص مفصّل' },
    desc: {
      en: 'Shirt-dress with a curved back yoke, front button placket, collar and stand, long sleeve with barrel cuff, and a chest patch pocket. Waist shaping by dart, not princess seams. Ease: +10cm bust, +8cm waist/hip.',
      ar: 'فستان قميص بكوّة ظهر منحنية، وحاشية أزرار أمامية، وياقة مع قاعدتها، وكم طويل بأسورة برميلية، وجيب ملصق عند الصدر. تشكيل الخصر ببنسة وليس بخطوط أميرة. سماحية: +١٠سم عند الصدر و+٨سم عند الخصر والورك.',
    },
    pieces: (m) => {
      const qc = q(m.chest), qw = q(m.waist), qh = q(m.hips);
      const shoulderX = qc * 0.27;
      const waistY = m.backLen, hipY = waistY + 20, hemY = hipY + 35;
      const front = plainBodicePanel(shoulderX, 8, qc + 3, m.backLen * 0.3, qw + 3, waistY, qh + 3, hipY, qh + 3, hemY);
      const frontDart = [[qw * 0.55, waistY - 10], [qw * 0.55 - 1.8, waistY], [qw * 0.55 + 1.8, waistY]];
      // Back is joined to a yoke at the shoulder, so its own outline
      // starts at the yoke-seam edge (a straight line at yokeDepth*1.6),
      // not at a neckline/shoulder point the way plainBodicePanel()'s
      // un-yoked fronts do.
      const yokeDepth = 9;
      const yoke = yokeCurvePc(qc * 0.35, yokeDepth);
      const sleeve = setInSleeve(q(m.bicep) * 2, m.sleeve - 6);
      const cuff = bandPc(q(m.bicep) * 1.5, 6);
      const collar = pointedCollar(m.neck / 2 + 1, 4, 6);
      const stand = collarStand(m.neck / 2 + 1, 3.2);
      const pocket = pocketPatch(10, 11);
      const placket = bandPc(4, hipY - 4);

      // Back body panel, below the yoke seam: its own local top (Y=0)
      // IS the yoke seam. The underarm-to-waist/hip/hem deltas are kept
      // identical to the front panel's own deltas (front's underarm sits
      // at m.backLen*0.3, waist at waistY, etc.) so the two side seams
      // come out genuinely equal in length, not just visually similar —
      // built explicitly here rather than via plainBodicePanel(), which
      // assumes an un-yoked neckline/shoulder start this piece doesn't
      // have.
      const yokeSeamY = 0;
      const underarmToWaist = waistY - m.backLen * 0.3, waistToHip = hipY - waistY, hipToHem = hemY - hipY;
      const backUnderarmY = yokeSeamY + 8;
      const backWaistY = backUnderarmY + underarmToWaist, backHipY = backWaistY + waistToHip, backHemY = backHipY + hipToHem;
      const backWaistSeg = [[qc + 2, backUnderarmY], [qc + 2, (backUnderarmY + backWaistY) / 2], [qw + 2, backWaistY]];
      const backWaistPts = qBez(...backWaistSeg, 6);
      const backOutline = [[0, yokeSeamY], [qc + 2, yokeSeamY], [qc + 2, backUnderarmY], ...backWaistPts, [qh + 2, backHipY], [qh + 2, backHemY], [0, backHemY]];
      withCurves(backOutline, [{ fromIdx: 2, toIdx: 2 + backWaistPts.length, ...qBezToCubic(...backWaistSeg) }]);

      const pieces = [
        {
          key: 'front', name: { en: 'Shirt-Dress Front', ar: 'مقدمة فستان القميص' },
          desc: { en: 'Center-front panel with a button placket edge and a single waist dart.', ar: 'لوحة المقدمة مع حاشية الأزرار وبنسة خصر واحدة.' },
          outline: front, darts: [frontDart], notches: [[front[front.waistIdx][0], front[front.waistIdx][1]]],
          grain: [[shoulderX * 0.5, 10], [shoulderX * 0.5, hemY - 10]],
          role: 'bodice-front-center', cutOnFold: true, chestEdgeIndices: [front.chestIdx],
          // The back panel sits below a separate yoke piece, so its own
          // bounding box will never match the un-yoked front's (the front
          // includes its own shoulder/neckline height; the back doesn't) —
          // the bounding-box PROXY genuinely doesn't apply here. A real
          // declared seam edge (underarm through the waist curve to hem)
          // is the honest way to check this specific pair.
          edges: [{ fromIdx: front.chestIdx, toIdx: front.chestIdx + 3, seamId: 'shirtdressSide' }],
        },
        {
          key: 'back', name: { en: 'Shirt-Dress Back', ar: 'خلفية فستان القميص' },
          desc: { en: 'Back panel joined to a curved yoke at the shoulder, with a single waist dart.', ar: 'لوحة الخلفية متصلة بكوّة منحنية عند الكتف، مع بنسة خصر واحدة.' },
          outline: backOutline,
          darts: [[[qw * 0.5, backWaistY - 10], [qw * 0.5 - 1.8, backWaistY], [qw * 0.5 + 1.8, backWaistY]]],
          notches: [[qw + 2, backWaistY]],
          grain: [[shoulderX * 0.5, yokeSeamY + 6], [shoulderX * 0.5, backHemY - 10]],
          role: 'bodice-back-center', cutOnFold: true, chestEdgeIndices: [2],
          edges: [{ fromIdx: 2, toIdx: 2 + backWaistPts.length + 2, seamId: 'shirtdressSide' }],
        },
        {
          key: 'yoke', name: { en: 'Back Yoke', ar: 'كوّة الظهر' },
          desc: { en: 'Curved shoulder yoke, cut on the fold.', ar: 'كوّة كتف منحنية، مقصوصة على الطية.' },
          outline: yoke, darts: [], notches: [yoke[yoke.shoulderIdx]],
          grain: [[qc * 0.15, 2], [qc * 0.15, yokeDepth * 1.4]],
          role: 'yoke', cutOnFold: true,
        },
        {
          key: 'sleeve', name: { en: 'Long Sleeve', ar: 'كم طويل' },
          desc: { en: 'Long set-in sleeve finished with a barrel cuff; front single notch, back double notch.', ar: 'كم طويل مركّب ينتهي بأسورة برميلية؛ علامة تطابق واحدة أمامًا واثنتان خلفًا.' },
          outline: sleeve, darts: [], notches: [sleeve[sleeve.frontNotchIdx], sleeve[sleeve.backNotchIdx1], sleeve[sleeve.backNotchIdx2]],
          grain: [[q(m.bicep), 6], [q(m.bicep), m.sleeve - 12]],
          role: 'sleeve', bilateral: true,
        },
        {
          key: 'cuff', name: { en: 'Barrel Cuff', ar: 'أسورة برميلية' },
          desc: { en: 'Buttoned barrel cuff at the sleeve hem.', ar: 'أسورة برميلية بأزرار عند نهاية الكم.' },
          outline: cuff, darts: [], notches: [[cuff[1][0] / 2, 0]],
          grain: [[2, 1], [2, 5]],
          role: 'cuff', bilateral: true,
        },
        {
          key: 'collar', name: { en: 'Collar', ar: 'الياقة' },
          desc: { en: 'Two-point collar, cut on the fold.', ar: 'ياقة بطرفين، مقصوصة على الطية.' },
          outline: collar, darts: [], notches: [collar[collar.frontIdx]],
          grain: [[2, 2], [2, 5]],
          role: 'collar', cutOnFold: true,
        },
        {
          key: 'stand', name: { en: 'Collar Stand', ar: 'قاعدة الياقة' },
          desc: { en: 'Standing band the collar attaches to, cut on the fold.', ar: 'شريط واقف تُركَّب عليه الياقة، مقصوص على الطية.' },
          outline: stand, darts: [], notches: [stand[stand.shoulderIdx]],
          grain: [[2, 1], [2, 2.2]],
          role: 'collar-stand', cutOnFold: true,
        },
        {
          key: 'pocket', name: { en: 'Chest Pocket', ar: 'جيب الصدر' },
          desc: { en: 'Patch pocket at the chest.', ar: 'جيب ملصق عند الصدر.' },
          outline: pocket, darts: [], notches: [[pocket[1][0] / 2, 0]],
          grain: [[5, 1], [5, 8]],
          role: 'pocket',
        },
        {
          key: 'placket', name: { en: 'Front Placket Facing', ar: 'بطانة حاشية الأزرار' },
          desc: { en: 'Button placket facing behind the front opening.', ar: 'بطانة حاشية أزرار خلف فتحة المقدمة.' },
          outline: placket, darts: [], notches: [],
          grain: [[2, 4], [2, hipY - 8]],
          role: 'placket-facing',
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_w_shirtdress', cat: 'women', tag: { en: 'Reference · Tailored', ar: 'مرجعي · تفصيل' }, type: 'dress' });

  // ============================================================
  // 4. MEN — Fitted Crew-Neck Tee (bodice + sleeve)
  // Drafting basis: knit crew-neck block. Ease: chest +4cm (close,
  // stretch-friendly fit). Suppression: a small BACK SHOULDER dart (not
  // a waist dart, and not princess seams) — a genuinely different
  // suppression method and placement from every other design so far.
  // Short set-in sleeve, ribbed crew neckband.
  // ============================================================
  PATTERNS.ref_m_tee = {
    id: 'ref_m_tee', category: 'men',
    name: { en: "Men's Fitted Crew-Neck Tee", ar: 'تيشيرت رجالي ضيق برقبة دائرية' },
    desc: {
      en: 'Close-fitting knit tee shaped by a back shoulder dart, ribbed crew neckband, short set-in sleeve. Ease: +4cm chest.',
      ar: 'تيشيرت محبوك ضيق يتشكل عبر بنسة كتف خلفية، مع شريط رقبة ريب دائري وكم مركّب قصير. سماحية: +٤سم عند الصدر.',
    },
    pieces: (m) => {
      const qc = q(m.chest);
      const hemY = m.backLen + 24;
      const front = plainBodicePanel(qc * 0.26, 6, qc + 1, m.backLen * 0.32, qc + 0.5, m.backLen, qc + 1, hemY - 12, qc + 1, hemY);
      const back = plainBodicePanel(qc * 0.26, 3, qc + 1, m.backLen * 0.32, qc + 0.5, m.backLen, qc + 1, hemY - 12, qc + 1, hemY);
      const shoulderDart = [[qc * 0.18, 1], [qc * 0.18 - 1.2, -0.5], [qc * 0.18 + 1.2, -0.5]];
      const sleeve = setInSleeve(q(m.bicep) * 2, m.sleeve * 0.32);
      const neckband = bandPc(m.neck * 0.52, 3.5);

      const pieces = [
        {
          key: 'front', name: { en: 'Tee Front', ar: 'مقدمة التيشيرت' },
          desc: { en: 'Center-front panel, cut on the fold.', ar: 'لوحة المقدمة، مقصوصة على الطية.' },
          outline: front, darts: [], notches: [[front[front.chestIdx][0], front[front.chestIdx][1]]],
          grain: [[qc * 0.15, 8], [qc * 0.15, hemY - 8]],
          role: 'bodice-front-center', cutOnFold: true, chestEdgeIndices: [front.chestIdx],
        },
        {
          key: 'back', name: { en: 'Tee Back', ar: 'خلفية التيشيرت' },
          desc: { en: 'Center-back panel with a small shoulder dart for a closer fit across the shoulder blades.', ar: 'لوحة الخلفية مع بنسة كتف صغيرة لضبط القياس عند لوحي الكتف.' },
          outline: back, darts: [shoulderDart], notches: [[back[back.chestIdx][0], back[back.chestIdx][1]]],
          grain: [[qc * 0.15, 8], [qc * 0.15, hemY - 8]],
          role: 'bodice-back-center', cutOnFold: true, chestEdgeIndices: [back.chestIdx],
        },
        {
          key: 'sleeve', name: { en: 'Short Sleeve', ar: 'كم قصير' },
          desc: { en: 'Short set-in sleeve; front single notch, back double notch.', ar: 'كم مركّب قصير؛ علامة تطابق واحدة أمامًا واثنتان خلفًا.' },
          outline: sleeve, darts: [], notches: [sleeve[sleeve.frontNotchIdx], sleeve[sleeve.backNotchIdx1], sleeve[sleeve.backNotchIdx2]],
          grain: [[q(m.bicep), 3], [q(m.bicep), m.sleeve * 0.32 - 3]],
          role: 'sleeve', bilateral: true,
        },
        {
          key: 'neckband', name: { en: 'Rib Crew Neckband', ar: 'شريط رقبة ريب دائري' },
          desc: { en: 'Stretch ribbed band finishing the neckline.', ar: 'شريط مطاطي من الريب لتشطيب خط الرقبة.' },
          outline: neckband, darts: [], notches: [[neckband[1][0] / 2, 0]],
          grain: [[2, 1], [m.neck * 0.4, 1]],
          role: 'collar-band', cutOnFold: true,
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_m_tee', cat: 'men', tag: { en: 'Reference · Bodice+Sleeve', ar: 'مرجعي · قصة وكم' }, type: 'top' });

  // ============================================================
  // 5. MEN — Flat-Front Trousers (trouser)
  // Drafting basis: classic trouser block. Ease: waist +2cm (held by the
  // waistband), hip +4cm. Suppression: a single front waist dart (real,
  // legs-and-apex dart — the ONLY named suppression method on this
  // panel, since flat-front trousers deliberately have no pleats).
  // Straight waistband, front fly placket facing, welt side pockets.
  // ============================================================
  PATTERNS.ref_m_trousers = {
    id: 'ref_m_trousers', category: 'men',
    name: { en: "Men's Flat-Front Trousers", ar: 'بنطلون رجالي أمامي مسطّح' },
    desc: {
      en: 'Straight-leg flat-front trousers: a curved crotch seam (deeper on the back panel, per real block convention), a single front waist dart, straight waistband, front fly facing, welt side pockets. Ease: +2cm waist, +4cm hip.',
      ar: 'بنطلون مستقيم الساق بمقدمة مسطّحة: خط تفصيل منحنٍ (أعمق في القطعة الخلفية حسب القاعدة الحقيقية)، وبنسة خصر أمامية واحدة، وحزام خصر مستقيم، وبطانة سحاب أمامية، وجيوب جانبية مطوية. سماحية: +٢سم عند الخصر و+٤سم عند الورك.',
    },
    pieces: (m) => {
      const qw = q(m.waist), qh = q(m.hips), qt = q(m.thigh);
      const riseLen = 27, legLen = m.inseam;
      const front = legPanel(qw * 0.52 + 0.5, qh * 0.58 + 1, qt * 1.5, riseLen, legLen, true);
      const back = legPanel(qw * 0.48 + 0.5, qh * 0.54 + 1, qt * 1.5, riseLen, legLen, false);
      const frontDart = [[qw * 0.3, 1], [qw * 0.3 - 1.5, 9], [qw * 0.3 + 1.5, 9]];
      const waistCirc = (qw * 0.52 + 0.5 + qw * 0.2) * 2 + (qw * 0.48 + 0.5 + qw * 0.2) * 2;
      const waistband = bandPc(waistCirc / 2, 4);
      const fly = bandPc(3.5, riseLen - 4);
      const pocket = pocketPatch(9, 3);

      const pieces = [
        {
          key: 'front', name: { en: 'Trouser Front', ar: 'مقدمة البنطلون' },
          desc: { en: 'Front leg panel with a curved crotch seam and a single waist dart.', ar: 'لوحة الساق الأمامية بخط تفصيل منحنٍ وبنسة خصر واحدة.' },
          outline: front, darts: [frontDart], notches: [[front[front.crotchIdx][0], front[front.crotchIdx][1]], [front[front.hemOutIdx][0], front[front.hemOutIdx][1]]],
          grain: [[qt * 0.6, riseLen + 10], [qt * 0.6, riseLen + legLen - 10]],
          role: 'other', bilateral: true,
          edges: [{ fromIdx: 0, toIdx: front.hemOutIdx, seamId: 'trouserOutseam' }],
        },
        {
          key: 'back', name: { en: 'Trouser Back', ar: 'خلفية البنطلون' },
          desc: { en: 'Back leg panel with a deeper curved crotch seam, per real block convention.', ar: 'لوحة الساق الخلفية بخط تفصيل منحنٍ أعمق، حسب القاعدة الحقيقية.' },
          outline: back, darts: [], notches: [[back[back.crotchIdx][0], back[back.crotchIdx][1]], [back[back.hemOutIdx][0], back[back.hemOutIdx][1]]],
          grain: [[qt * 0.6, riseLen + 10], [qt * 0.6, riseLen + legLen - 10]],
          role: 'other', bilateral: true,
          edges: [{ fromIdx: 0, toIdx: back.hemOutIdx, seamId: 'trouserOutseam' }],
        },
        {
          key: 'waistband', name: { en: 'Waistband', ar: 'حزام الخصر' },
          desc: { en: 'Straight waistband, cut on the fold.', ar: 'حزام خصر مستقيم مقصوص على الطية.' },
          outline: waistband, darts: [], notches: [[waistCirc / 4, 0]],
          grain: [[2, 2], [waistCirc / 2 - 2, 2]],
          role: 'waistband', cutOnFold: true,
        },
        {
          key: 'fly', name: { en: 'Fly Placket Facing', ar: 'بطانة سحاب الفتحة الأمامية' },
          desc: { en: 'Facing strip behind the front fly zip.', ar: 'شريط بطانة خلف سحاب الفتحة الأمامية.' },
          outline: fly, darts: [], notches: [],
          grain: [[1.5, 2], [1.5, riseLen - 8]],
          role: 'placket-facing',
        },
        {
          key: 'pocket', name: { en: 'Welt Side Pocket', ar: 'جيب جانبي مطوي' },
          desc: { en: 'Welt pocket facing at the side seam.', ar: 'بطانة جيب مطوي عند الخط الجانبي.' },
          outline: pocket, darts: [], notches: [[pocket[1][0] / 2, 0]],
          grain: [[4.5, 1], [4.5, 2]],
          role: 'pocket', bilateral: true,
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_m_trousers', cat: 'men', tag: { en: 'Reference · Trouser', ar: 'مرجعي · بنطلون' }, type: 'trousers' });


  // ============================================================
  // 6. MEN — Classic Dress Shirt (multi-piece tailored)
  // Drafting basis: tailored dress-shirt block. Ease: chest +12cm, waist
  // +14cm, hip +10cm (classic, non-fitted cut). Ease/fullness at the
  // back is a real center-back box pleat (js/pleats.js's computePleats —
  // reused, not re-derived) rather than a dart or princess seam — the
  // THIRD distinct suppression/fullness method in this set. Real
  // construction: curved back yoke, TWO-PIECE sleeve (upper+under) with
  // barrel cuff, collar + stand, front button placket, chest pocket.
  // ============================================================
  PATTERNS.ref_m_shirt = {
    id: 'ref_m_shirt', category: 'men',
    name: { en: "Men's Classic Dress Shirt", ar: 'قميص رجالي كلاسيكي مفصّل' },
    desc: {
      en: 'Tailored dress shirt: curved back yoke over a center-back box pleat (real pleat-width math, not a dart), two-piece sleeve with barrel cuff, collar and stand, front button placket, chest pocket. Ease: +12cm chest.',
      ar: 'قميص رجالي مفصّل: كوّة ظهر منحنية فوق طية صندوقية في منتصف الظهر (بحساب اتساع حقيقي للطية، وليس بنسة)، وكم من قطعتين بأسورة برميلية، وياقة مع قاعدتها، وحاشية أزرار أمامية، وجيب صدر. سماحية: +١٢سم عند الصدر.',
    },
    pieces: (m) => {
      const qc = q(m.chest), qw = q(m.waist), qh = q(m.hips);
      const shoulderX = qc * 0.28;
      const waistY = m.backLen, hipY = waistY + 22, hemY = hipY + 8;
      // Center-back box pleat: computePleats gives the real extra width
      // one box pleat adds; split across both sides of center-back so
      // the piece stays cut-on-fold (half the added width per side).
      // Front and back share the SAME underarm/waist/hip widths (chestX/
      // waistX/hipX below) so their side seam is genuinely, not just
      // approximately, equal in length — the pleat's added width lives
      // ABOVE the underarm line (in the yoke-seam-to-underarm run), not
      // in the side seam itself.
      const pleat = computePleats(qc + 4, 1, 2.2);
      const chestX = qc + 5, waistX = qw + 5, hipX = qh + 4;
      const front = plainBodicePanel(shoulderX, 8, chestX, m.backLen * 0.3, waistX, waistY, hipX, hipY, hipX, hemY);
      const yokeDepth = 9;
      const yokeSeamY = 0, backUnderarmY = 8;
      const underarmToWaist = waistY - m.backLen * 0.3, waistToHip = hipY - waistY, hipToHem = hemY - hipY;
      const backWaistY = backUnderarmY + underarmToWaist, backHipY = backWaistY + waistToHip, backHemY = backHipY + hipToHem;
      const backHalfW = chestX + pleat.addedWidthCm / 2;
      const backWaistSeg = [[chestX, backUnderarmY], [chestX, (backUnderarmY + backWaistY) / 2], [waistX, backWaistY]];
      const backWaistPts = qBez(...backWaistSeg, 6);
      // idx1->idx2 tapers from the pleat-widened yoke-seam width
      // (backHalfW) back down to the true underarm width (chestX,
      // matching the front's own chestX) — the pleat's extra fullness is
      // absorbed above the underarm line, not carried into the side seam.
      const back = [[0, yokeSeamY], [backHalfW, yokeSeamY], [chestX, backUnderarmY], ...backWaistPts, [hipX, backHipY], [hipX, backHemY], [0, backHemY]];
      withCurves(back, [{ fromIdx: 2, toIdx: 2 + backWaistPts.length, ...qBezToCubic(...backWaistSeg) }]);
      const yoke = yokeCurvePc(qc * 0.36, yokeDepth);
      const sleeveLen = m.sleeve - 6;
      const sleeveUpper = sleeveUpperPc(q(m.bicep) * 2, sleeveLen);
      const sleeveUnder = sleeveUnderPc(q(m.bicep) * 2, sleeveLen);
      const cuff = bandPc(q(m.bicep) * 1.5, 6);
      const collar = pointedCollar(m.neck / 2 + 1, 4, 6);
      const stand = collarStand(m.neck / 2 + 1, 3.2);
      const pocket = pocketPatch(10, 11);
      const placket = bandPc(4, hipY - 4);

      const pieces = [
        {
          key: 'front', name: { en: 'Shirt Front', ar: 'مقدمة القميص' },
          desc: { en: 'Center-front panel with a button placket edge.', ar: 'لوحة المقدمة مع حاشية الأزرار.' },
          outline: front, darts: [], notches: [[front[front.chestIdx][0], front[front.chestIdx][1]]],
          grain: [[shoulderX * 0.5, 10], [shoulderX * 0.5, hemY - 10]],
          role: 'bodice-front-center', cutOnFold: true, chestEdgeIndices: [front.chestIdx],
          edges: [{ fromIdx: front.chestIdx, toIdx: front.chestIdx + 3, seamId: 'shirtSide' }],
        },
        {
          key: 'back', name: { en: 'Shirt Back with Center Pleat', ar: 'خلفية القميص بطية وسطية' },
          desc: { en: 'Back panel joined to the yoke, with a center-back box pleat for ease of movement (not a dart).', ar: 'لوحة الخلفية متصلة بالكوّة، مع طية صندوقية في المنتصف لإتاحة الحركة (وليست بنسة).' },
          // Pleat-fold notches sit on the yoke seam itself (the pleat's
          // extra width is folded in right where the back attaches to
          // the yoke — see the back outline's own idx0/idx1), not at the
          // underarm line, where the outline has already tapered back
          // down to chestX (matching the front's own width, per the
          // seamLengthParity fix above).
          outline: back, darts: [], notches: [[0, yokeSeamY], [backHalfW, yokeSeamY]],
          grain: [[backHalfW * 0.5, yokeSeamY + 6], [backHalfW * 0.5, backHemY - 10]],
          role: 'bodice-back-center', cutOnFold: true, chestEdgeIndices: [2],
          edges: [{ fromIdx: 2, toIdx: 2 + backWaistPts.length + 2, seamId: 'shirtSide' }],
        },
        {
          key: 'yoke', name: { en: 'Back Yoke', ar: 'كوّة الظهر' },
          desc: { en: 'Curved shoulder yoke, cut on the fold.', ar: 'كوّة كتف منحنية، مقصوصة على الطية.' },
          outline: yoke, darts: [], notches: [yoke[yoke.shoulderIdx]],
          grain: [[qc * 0.15, 2], [qc * 0.15, yokeDepth * 1.4]],
          role: 'yoke', cutOnFold: true,
        },
        {
          key: 'sleeve_upper', name: { en: 'Sleeve Upper', ar: 'الكم العلوي' },
          desc: { en: 'Outer sleeve panel carrying the full cap curve; front single notch, back double notch.', ar: 'اللوحة الخارجية للكم وتحمل منحنى الرأس كاملًا؛ علامة تطابق واحدة أمامًا واثنتان خلفًا.' },
          outline: sleeveUpper, darts: [], notches: [sleeveUpper[sleeveUpper.frontNotchIdx], sleeveUpper[sleeveUpper.backNotchIdx1], sleeveUpper[sleeveUpper.backNotchIdx2]],
          grain: [[q(m.bicep) * 0.5, 4], [q(m.bicep) * 0.5, sleeveLen - 6]],
          role: 'sleeve-upper', bilateral: true,
        },
        {
          key: 'sleeve_under', name: { en: 'Sleeve Under', ar: 'الكم السفلي' },
          desc: { en: 'Inner underarm gusset panel completing the sleeve tube.', ar: 'لوحة الإبط الداخلية المكمّلة لأنبوب الكم.' },
          outline: sleeveUnder, darts: [], notches: [sleeveUnder[0]],
          grain: [[q(m.bicep) * 0.12, 2], [q(m.bicep) * 0.12, sleeveLen * 0.7]],
          role: 'sleeve-under', bilateral: true,
        },
        {
          key: 'cuff', name: { en: 'Barrel Cuff', ar: 'أسورة برميلية' },
          desc: { en: 'Buttoned barrel cuff at the sleeve hem.', ar: 'أسورة برميلية بأزرار عند نهاية الكم.' },
          outline: cuff, darts: [], notches: [[cuff[1][0] / 2, 0]],
          grain: [[2, 1], [2, 5]],
          role: 'cuff', bilateral: true,
        },
        {
          key: 'collar', name: { en: 'Collar', ar: 'الياقة' },
          desc: { en: 'Two-point collar, cut on the fold.', ar: 'ياقة بطرفين، مقصوصة على الطية.' },
          outline: collar, darts: [], notches: [collar[collar.frontIdx]],
          grain: [[2, 2], [2, 5]],
          role: 'collar', cutOnFold: true,
        },
        {
          key: 'stand', name: { en: 'Collar Stand', ar: 'قاعدة الياقة' },
          desc: { en: 'Standing band the collar attaches to, cut on the fold.', ar: 'شريط واقف تُركَّب عليه الياقة، مقصوص على الطية.' },
          outline: stand, darts: [], notches: [stand[stand.shoulderIdx]],
          grain: [[2, 1], [2, 2.2]],
          role: 'collar-stand', cutOnFold: true,
        },
        {
          key: 'pocket', name: { en: 'Chest Pocket', ar: 'جيب الصدر' },
          desc: { en: 'Patch pocket at the chest.', ar: 'جيب ملصق عند الصدر.' },
          outline: pocket, darts: [], notches: [[pocket[1][0] / 2, 0]],
          grain: [[5, 1], [5, 8]],
          role: 'pocket',
        },
        {
          key: 'placket', name: { en: 'Front Placket Facing', ar: 'بطانة حاشية الأزرار' },
          desc: { en: 'Button placket facing behind the front opening.', ar: 'بطانة حاشية أزرار خلف فتحة المقدمة.' },
          outline: placket, darts: [], notches: [],
          grain: [[2, 4], [2, hipY - 8]],
          role: 'placket-facing',
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_m_shirt', cat: 'men', tag: { en: 'Reference · Tailored', ar: 'مرجعي · تفصيل' }, type: 'shirt' });


  // ============================================================
  // 7. GIRLS — Puff-Sleeve Princess Top (bodice + sleeve)
  // Drafting basis: same princess-seam block as pattern 1 (bust dart
  // rotated into the princess seam), scaled to the girls' body. Ease:
  // +6cm chest/waist/hip (comfortable kids fit). Sleeve construction
  // DIFFERS from the women's blouse: a gathered puff sleeve (1.6x gather
  // ratio) with a cuff band, not a plain set-in sleeve — same
  // suppression method, different sleeve construction (docs/plan 4.md
  // §7.1 differentiation).
  // ============================================================
  PATTERNS.ref_g_top = {
    id: 'ref_g_top', category: 'girls',
    name: { en: 'Puff-Sleeve Princess Top', ar: 'بلوزة بناتي بقصة أميرة وكم منتفخ' },
    desc: {
      en: 'Girls’ top shaped by princess seams (no bust dart) with a gathered puff sleeve and cuff band, round neckline. Ease: +6cm chest/waist/hip.',
      ar: 'بلوزة بناتي يتشكل قصّها عبر خطوط الأميرة (بدون بنسة صدر)، مع كم منتفخ مجمّع وأسورة، وخط رقبة مستدير. سماحية: +٦سم عند الصدر والخصر والورك.',
    },
    pieces: (m) => {
      const chest = q(m.chest), waist = q(m.waist), hips = q(m.hips);
      const b = princessPanel({ chest, waist, hips, backLen: m.backLen, necklineDepth: 6, hemBelowHip: 12 });
      const sleeveLen = m.sleeve * 0.4;
      const sleeve = puffSleevePc(q(m.bicep) * 2, sleeveLen, 1.6);
      const cuff = bandPc(q(m.bicep) * 1.3, 3.5);

      const pieces = [
        {
          key: 'front_center', name: { en: 'Top Front Center', ar: 'وسط مقدمة البلوزة' },
          desc: { en: 'Center-front panel; princess seam carries all bust shaping.', ar: 'لوحة وسط المقدمة؛ يحمل خط الأميرة كامل تشكيل الصدر.' },
          outline: b.frontCenter, darts: [], notches: [b.frontCenter[b.frontCenter.bustNotchIdx], b.frontCenter[b.frontCenter.waistNotchIdx]],
          grain: [[b.shoulderX * 0.4, 8], [b.shoulderX * 0.4, b.hemY - 8]],
          role: 'bodice-front-center', cutOnFold: true,
          edges: [{ fromIdx: b.frontCenter.princessFromIdx, toIdx: b.frontCenter.princessToIdx, seamId: 'topPrincessFront' }],
        },
        {
          key: 'front_side', name: { en: 'Top Front Side', ar: 'جانب مقدمة البلوزة' },
          desc: { en: 'Side-front panel joining the armhole to the princess seam.', ar: 'لوحة الجانب الأمامي، تصل فتحة الإبط بخط الأميرة.' },
          outline: b.frontSide, darts: [], notches: [b.frontSide[b.frontSide.armholeFromIdx]],
          grain: [[b.sideX * 0.9, 10], [b.sideX * 0.9, b.hemY - 10]],
          role: 'bodice-front-side', bilateral: true,
          edges: [
            { fromIdx: b.frontSide.princessFromIdx, toIdx: b.frontSide.princessToIdx, seamId: 'topPrincessFront' },
            { fromIdx: b.frontSide.length - 1, toIdx: b.frontSide.armholeFromIdx, seamId: 'topSide' },
          ],
        },
        {
          key: 'back_center', name: { en: 'Top Back Center', ar: 'وسط خلفية البلوزة' },
          desc: { en: 'Center-back panel on the fold.', ar: 'لوحة وسط الخلفية على الطية.' },
          outline: b.backCenter, darts: [], notches: [b.backCenter[b.backCenter.bustNotchIdx], b.backCenter[b.backCenter.waistNotchIdx]],
          grain: [[b.shoulderX * 0.4, 8], [b.shoulderX * 0.4, b.hemY - 8]],
          role: 'bodice-back-center', cutOnFold: true,
          edges: [{ fromIdx: b.backCenter.princessFromIdx, toIdx: b.backCenter.princessToIdx, seamId: 'topPrincessBack' }],
        },
        {
          key: 'back_side', name: { en: 'Top Back Side', ar: 'جانب خلفية البلوزة' },
          desc: { en: 'Side-back panel joining the armhole to the princess seam.', ar: 'لوحة الجانب الخلفي، تصل فتحة الإبط بخط الأميرة.' },
          outline: b.backSide, darts: [], notches: [b.backSide[b.backSide.armholeFromIdx]],
          grain: [[b.sideX * 0.9, 10], [b.sideX * 0.9, b.hemY - 10]],
          role: 'bodice-back-side', bilateral: true,
          edges: [
            { fromIdx: b.backSide.princessFromIdx, toIdx: b.backSide.princessToIdx, seamId: 'topPrincessBack' },
            { fromIdx: b.backSide.length - 1, toIdx: b.backSide.armholeFromIdx, seamId: 'topSide' },
          ],
        },
        {
          key: 'sleeve', name: { en: 'Gathered Puff Sleeve', ar: 'كم منتفخ مجمّع' },
          desc: { en: 'Cap cut wider than the armhole and gathered in (1.6x), finished with a cuff band.', ar: 'رأس الكم مقصوص أوسع من فتحة الإبط ومجمّع فيها (بنسبة ١.٦)، ينتهي بأسورة.' },
          outline: sleeve, darts: [], notches: [sleeve[sleeve.capCenterIdx]],
          grain: [[sleeve[0][0] * 0.5, 3], [sleeve[0][0] * 0.5, sleeveLen - 3]],
          role: 'puff-sleeve', bilateral: true,
        },
        {
          key: 'cuff', name: { en: 'Sleeve Cuff', ar: 'أسورة الكم' },
          desc: { en: 'Band finishing the puff sleeve hem.', ar: 'شريط لتشطيب نهاية الكم المنتفخ.' },
          outline: cuff, darts: [], notches: [[cuff[1][0] / 2, 0]],
          grain: [[2, 1], [2, 2.5]],
          role: 'cuff', bilateral: true,
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_g_top', cat: 'girls', tag: { en: 'Reference · Bodice+Sleeve', ar: 'مرجعي · قصة وكم' }, type: 'top' });

  // ============================================================
  // 8. GIRLS — Knife-Pleated Skirt with Waistband (skirt)
  // Drafting basis: flat knife-pleated skirt block — each panel is cut
  // as a flat rectangle WIDER than its finished waist measurement, with
  // the excess folded into evenly-spaced knife pleats (js/pleats.js's
  // computePleats — real added-width math, reused not re-derived). A
  // genuinely different fullness method from pattern 2's gore-shaping.
  // Ease: +2cm waist (held by the waistband). Straight waistband,
  // centered back zip.
  // ============================================================
  PATTERNS.ref_g_skirt = {
    id: 'ref_g_skirt', category: 'girls',
    name: { en: 'Knife-Pleated Skirt', ar: 'تنورة بناتي بطيات سكينية' },
    desc: {
      en: 'Flat-panel skirt with 3 evenly-spaced knife pleats per half (front and back), straight waistband, centered back zip. Ease: +2cm waist.',
      ar: 'تنورة من لوحتين مسطّحتين بثلاث طيات سكينية متساوية التباعد لكل نصف (أمام وخلف)، مع حزام خصر مستقيم وسحاب خلفي في المنتصف. سماحية: +٢سم عند الخصر.',
    },
    pieces: (m) => {
      const qw = q(m.waist);
      const hemLen = 38;
      const frontPleat = computePleats(qw, 3, 1.8);
      const backPleat = computePleats(qw, 3, 1.6);
      const frontHalfW = qw + frontPleat.addedWidthCm;
      const backHalfW = qw + backPleat.addedWidthCm;
      const front = [[0, 0], [frontHalfW, 0], [frontHalfW, hemLen], [0, hemLen]];
      const back = [[0, 0], [backHalfW, 0], [backHalfW, hemLen], [0, hemLen]];
      const frontNotches = frontPleat.pleats.map((pl) => [pl.positionOnEdge * frontHalfW, 0]);
      const backNotches = backPleat.pleats.map((pl) => [pl.positionOnEdge * backHalfW, 0]);
      const waistCirc = (qw * 2) + (qw * 2); // finished (post-pleat) waist, front+back doubled
      const waistband = bandPc(waistCirc / 2, 4);
      const placket = bandPc(3.5, 12);

      const pieces = [
        {
          key: 'front', name: { en: 'Front Panel', ar: 'اللوحة الأمامية' },
          desc: { en: 'Flat front panel cut wider than finished, with 3 knife pleats folded in at the waist.', ar: 'لوحة أمامية مسطّحة مقصوصة أوسع من المقاس النهائي، مع ثلاث طيات سكينية مطوية عند الخصر.' },
          outline: front, darts: [], notches: frontNotches,
          grain: [[frontHalfW * 0.5, 6], [frontHalfW * 0.5, hemLen - 6]],
          role: 'skirt-front-gore', cutOnFold: true,
        },
        {
          key: 'back', name: { en: 'Back Panel', ar: 'اللوحة الخلفية' },
          desc: { en: 'Flat back panel cut wider than finished, with 3 knife pleats folded in at the waist, and a centered back zip opening.', ar: 'لوحة خلفية مسطّحة مقصوصة أوسع من المقاس النهائي، مع ثلاث طيات سكينية مطوية عند الخصر، وفتحة سحاب خلفية في المنتصف.' },
          outline: back, darts: [], notches: backNotches,
          grain: [[backHalfW * 0.5, 6], [backHalfW * 0.5, hemLen - 6]],
          role: 'skirt-back-gore', cutOnFold: true,
        },
        {
          key: 'waistband', name: { en: 'Waistband', ar: 'حزام الخصر' },
          desc: { en: 'Straight waistband, cut on the fold.', ar: 'حزام خصر مستقيم مقصوص على الطية.' },
          outline: waistband, darts: [], notches: [[waistCirc / 4, 0]],
          grain: [[2, 2], [waistCirc / 2 - 2, 2]],
          role: 'waistband', cutOnFold: true,
        },
        {
          key: 'placket', name: { en: 'Back Zip Placket Facing', ar: 'بطانة فتحة السحاب الخلفية' },
          desc: { en: 'Facing strip behind the centered back zip.', ar: 'شريط بطانة خلف السحاب الخلفي في المنتصف.' },
          outline: placket, darts: [], notches: [],
          grain: [[1.75, 1], [1.75, 10]],
          role: 'placket-facing',
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_g_skirt', cat: 'girls', tag: { en: 'Reference · Skirt', ar: 'مرجعي · تنورة' }, type: 'skirt' });


  // ============================================================
  // 9. GIRLS — Collared Shirtdress (multi-piece tailored)
  // Drafting basis: same tailored shirt block as pattern 3, scaled to
  // the girls' body. Ease: +8cm chest, +7cm waist/hip. Suppression: a
  // single waist dart (not princess seams — same method as pattern 3,
  // but a DIFFERENT neckline/closure/sleeve set). Real construction:
  // curved back yoke, round Peter-Pan collar (no stand — a genuinely
  // different collar construction from pattern 3's two-point collar +
  // stand), short gathered puff sleeves (not long cuffed sleeves), front
  // button placket, chest patch pocket.
  // ============================================================
  PATTERNS.ref_g_shirtdress = {
    id: 'ref_g_shirtdress', category: 'girls',
    name: { en: 'Collared Shirtdress', ar: 'فستان قميص بناتي بياقة مستديرة' },
    desc: {
      en: 'Girls’ shirtdress with a curved back yoke, round Peter-Pan collar, short gathered puff sleeves, front button placket, and a chest patch pocket. Waist shaping by dart. Ease: +8cm chest, +7cm waist/hip.',
      ar: 'فستان قميص بناتي بكوّة ظهر منحنية، وياقة مستديرة بطراز بيتر بان، وكم قصير منتفخ مجمّع، وحاشية أزرار أمامية، وجيب ملصق عند الصدر. تشكيل الخصر ببنسة. سماحية: +٨سم عند الصدر و+٧سم عند الخصر والورك.',
    },
    pieces: (m) => {
      const qc = q(m.chest), qw = q(m.waist), qh = q(m.hips);
      const shoulderX = qc * 0.27;
      const waistY = m.backLen, hipY = waistY + 14, hemY = hipY + 20;
      const chestX = qc + 4, waistX = qw + 3.5, hipX = qh + 3.5;
      const front = plainBodicePanel(shoulderX, 7, chestX, m.backLen * 0.3, waistX, waistY, hipX, hipY, hipX, hemY);
      const frontDart = [[qw * 0.5, waistY - 7], [qw * 0.5 - 1.3, waistY], [qw * 0.5 + 1.3, waistY]];
      const yokeDepth = 7;
      const yokeSeamY = 0, backUnderarmY = 6;
      const underarmToWaist = waistY - m.backLen * 0.3, waistToHip = hipY - waistY, hipToHem = hemY - hipY;
      const backWaistY = backUnderarmY + underarmToWaist, backHipY = backWaistY + waistToHip, backHemY = backHipY + hipToHem;
      const backWaistSeg = [[chestX, backUnderarmY], [chestX, (backUnderarmY + backWaistY) / 2], [waistX, backWaistY]];
      const backWaistPts = qBez(...backWaistSeg, 6);
      const back = [[0, yokeSeamY], [chestX, yokeSeamY], [chestX, backUnderarmY], ...backWaistPts, [hipX, backHipY], [hipX, backHemY], [0, backHemY]];
      withCurves(back, [{ fromIdx: 2, toIdx: 2 + backWaistPts.length, ...qBezToCubic(...backWaistSeg) }]);
      const yoke = yokeCurvePc(qc * 0.34, yokeDepth);
      const sleeveLen = m.sleeve * 0.32;
      const sleeve = puffSleevePc(q(m.bicep) * 2, sleeveLen, 1.4);
      const collar = roundCollarPc(m.neck / 2 + 1, 6);
      const pocket = pocketPatch(7, 7);
      const placket = bandPc(3, hipY - 3);

      const pieces = [
        {
          key: 'front', name: { en: 'Shirtdress Front', ar: 'مقدمة فستان القميص' },
          desc: { en: 'Center-front panel with a button placket edge and a single waist dart.', ar: 'لوحة المقدمة مع حاشية الأزرار وبنسة خصر واحدة.' },
          outline: front, darts: [frontDart], notches: [[front[front.chestIdx][0], front[front.chestIdx][1]]],
          grain: [[shoulderX * 0.5, 8], [shoulderX * 0.5, hemY - 8]],
          role: 'bodice-front-center', cutOnFold: true, chestEdgeIndices: [front.chestIdx],
          edges: [{ fromIdx: front.chestIdx, toIdx: front.chestIdx + 3, seamId: 'gdressSide' }],
        },
        {
          key: 'back', name: { en: 'Shirtdress Back', ar: 'خلفية فستان القميص' },
          desc: { en: 'Back panel joined to a curved yoke at the shoulder, with a single waist dart.', ar: 'لوحة الخلفية متصلة بكوّة منحنية عند الكتف، مع بنسة خصر واحدة.' },
          outline: back, darts: [[[qw * 0.48, backWaistY - 7], [qw * 0.48 - 1.3, backWaistY], [qw * 0.48 + 1.3, backWaistY]]],
          notches: [[chestX, backUnderarmY]],
          grain: [[shoulderX * 0.5, yokeSeamY + 5], [shoulderX * 0.5, backHemY - 8]],
          role: 'bodice-back-center', cutOnFold: true, chestEdgeIndices: [2],
          edges: [{ fromIdx: 2, toIdx: 2 + backWaistPts.length + 2, seamId: 'gdressSide' }],
        },
        {
          key: 'yoke', name: { en: 'Back Yoke', ar: 'كوّة الظهر' },
          desc: { en: 'Curved shoulder yoke, cut on the fold.', ar: 'كوّة كتف منحنية، مقصوصة على الطية.' },
          outline: yoke, darts: [], notches: [yoke[yoke.shoulderIdx]],
          grain: [[qc * 0.15, 2], [qc * 0.15, yokeDepth * 1.4]],
          role: 'yoke', cutOnFold: true,
        },
        {
          key: 'sleeve', name: { en: 'Gathered Puff Sleeve', ar: 'كم منتفخ مجمّع' },
          desc: { en: 'Short cap cut wider than the armhole and gathered in.', ar: 'رأس كم قصير مقصوص أوسع من فتحة الإبط ومجمّع فيها.' },
          outline: sleeve, darts: [], notches: [sleeve[sleeve.capCenterIdx]],
          grain: [[sleeve[0][0] * 0.5, 2], [sleeve[0][0] * 0.5, sleeveLen - 2]],
          role: 'puff-sleeve', bilateral: true,
        },
        {
          key: 'collar', name: { en: 'Round Collar', ar: 'الياقة المستديرة' },
          desc: { en: 'Peter Pan-style round collar, no stand, cut on the fold.', ar: 'ياقة مستديرة بطراز بيتر بان بلا قاعدة، مقصوصة على الطية.' },
          outline: collar, darts: [], notches: [collar[collar.frontIdx]],
          grain: [[2, 1], [2, 4]],
          role: 'collar', cutOnFold: true,
        },
        {
          key: 'pocket', name: { en: 'Chest Pocket', ar: 'جيب الصدر' },
          desc: { en: 'Small patch pocket at the chest.', ar: 'جيب صغير ملصق عند الصدر.' },
          outline: pocket, darts: [], notches: [[pocket[1][0] / 2, 0]],
          grain: [[3.5, 1], [3.5, 5]],
          role: 'pocket',
        },
        {
          key: 'placket', name: { en: 'Front Placket Facing', ar: 'بطانة حاشية الأزرار' },
          desc: { en: 'Button placket facing behind the front opening.', ar: 'بطانة حاشية أزرار خلف فتحة المقدمة.' },
          outline: placket, darts: [], notches: [],
          grain: [[1.5, 3], [1.5, hipY - 6]],
          role: 'placket-facing',
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_g_shirtdress', cat: 'girls', tag: { en: 'Reference · Tailored', ar: 'مرجعي · تفصيل' }, type: 'dress' });


  // ============================================================
  // 10. BOYS — Raglan-Sleeve Tee (bodice + sleeve)
  // Drafting basis: knit raglan-tee block. Ease: chest +6cm (relaxed
  // kids fit). Suppression/shaping: the raglan seam itself (no dart, no
  // princess seam, no back yoke) — a genuinely different construction
  // from every other design in this set. Ribbed crew neckband.
  // ============================================================
  PATTERNS.ref_b_tee = {
    id: 'ref_b_tee', category: 'boys',
    name: { en: 'Raglan-Sleeve Tee', ar: 'تيشيرت ولادي بكم راغلان' },
    desc: {
      en: 'Knit tee with a raglan sleeve — a diagonal seam from the neckline to the underarm replaces the usual shoulder seam and set-in armhole. Ribbed crew neckband. Ease: +6cm chest.',
      ar: 'تيشيرت محبوك بكم راغلان — خط مائل من الرقبة إلى الإبط يحل محل خط الكتف المعتاد وفتحة الإبط المركّبة. شريط رقبة ريب دائري. سماحية: +٦سم عند الصدر.',
    },
    pieces: (m) => {
      const qc = q(m.chest);
      const neckX = qc * 0.2, chestX = qc + 2, underarmY = m.backLen * 0.34;
      const hemY = m.backLen + 20;
      const front = raglanBodyPanel(neckX, 6, chestX, underarmY, chestX - 1, m.backLen, chestX, hemY - 10, chestX, hemY);
      const back = raglanBodyPanel(neckX, 3, chestX, underarmY, chestX - 0.5, m.backLen, chestX, hemY - 10, chestX, hemY);
      const sleeveLen = m.sleeve * 0.68;
      const sleeve = raglanSleevePc(neckX, chestX, underarmY, sleeveLen);
      const neckband = bandPc(m.neck * 0.55, 3.2);

      const pieces = [
        {
          key: 'front', name: { en: 'Tee Front', ar: 'مقدمة التيشيرت' },
          desc: { en: 'Center-front panel; the raglan seam runs from the neckline to the underarm.', ar: 'لوحة المقدمة؛ يمتد خط الراغلان من الرقبة إلى الإبط.' },
          outline: front, darts: [], notches: [[front[front.raglanFromIdx][0], front[front.raglanFromIdx][1]]],
          grain: [[chestX * 0.4, hemY * 0.3], [chestX * 0.4, hemY - 8]],
          role: 'bodice-front-center', cutOnFold: true, chestEdgeIndices: [front.chestIdx],
          edges: [
            { fromIdx: front.raglanFromIdx, toIdx: front.raglanToIdx, seamId: 'raglanFront' },
            // Side seam (underarm to hem) — a real seam between front and
            // back that the bounding-box proxy can't see past their
            // different neckline depths (docs/plan 4.md §5.2's exact
            // "deeper neckline" scenario).
            { fromIdx: front.chestIdx, toIdx: front.chestIdx + 3, seamId: 'teeSide' },
          ],
        },
        {
          key: 'back', name: { en: 'Tee Back', ar: 'خلفية التيشيرت' },
          desc: { en: 'Center-back panel; the raglan seam runs from the neckline to the underarm.', ar: 'لوحة الخلفية؛ يمتد خط الراغلان من الرقبة إلى الإبط.' },
          outline: back, darts: [], notches: [[back[back.raglanFromIdx][0], back[back.raglanFromIdx][1]]],
          grain: [[chestX * 0.4, hemY * 0.3], [chestX * 0.4, hemY - 8]],
          role: 'bodice-back-center', cutOnFold: true, chestEdgeIndices: [back.chestIdx],
          edges: [
            { fromIdx: back.raglanFromIdx, toIdx: back.raglanToIdx, seamId: 'raglanBack' },
            { fromIdx: back.chestIdx, toIdx: back.chestIdx + 3, seamId: 'teeSide' },
          ],
        },
        {
          key: 'sleeve', name: { en: 'Raglan Sleeve', ar: 'كم راغلان' },
          desc: { en: 'Raglan sleeve with two diagonal seams (front and back) meeting the body panels at the neckline and underarm.', ar: 'كم راغلان بخطين مائلين (أمامي وخلفي) يلتقيان بلوحتي الجسم عند الرقبة والإبط.' },
          outline: sleeve, darts: [], notches: [sleeve[sleeve.frontRaglanToIdx]],
          grain: [[chestX * 0.3, underarmY + 4], [chestX * 0.3, underarmY + sleeveLen - 4]],
          role: 'sleeve', bilateral: true,
          edges: [
            { fromIdx: sleeve.frontRaglanFromIdx, toIdx: sleeve.frontRaglanToIdx, seamId: 'raglanFront' },
            { fromIdx: sleeve.backRaglanFromIdx, toIdx: sleeve.backRaglanToIdx, seamId: 'raglanBack' },
          ],
        },
        {
          key: 'neckband', name: { en: 'Rib Crew Neckband', ar: 'شريط رقبة ريب دائري' },
          desc: { en: 'Stretch ribbed band finishing the neckline.', ar: 'شريط مطاطي من الريب لتشطيب خط الرقبة.' },
          outline: neckband, darts: [], notches: [[neckband[1][0] / 2, 0]],
          grain: [[2, 1], [m.neck * 0.4, 1]],
          role: 'collar-band', cutOnFold: true,
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_b_tee', cat: 'boys', tag: { en: 'Reference · Bodice+Sleeve', ar: 'مرجعي · قصة وكم' }, type: 'top' });

  // ============================================================
  // 11. BOYS — Cargo Shorts (trouser)
  // Drafting basis: same leg-panel block as pattern 5, shortened to
  // above-knee length. Ease: waist +3cm (elastic-backed, so held looser
  // than pattern 5's fitted waistband), hip +5cm. A flat elastic-back
  // waistband (no dart — the elastic itself is the fit mechanism, a
  // genuinely different approach from pattern 5's dart), front fly
  // facing, side cargo pocket with a flap.
  // ============================================================
  PATTERNS.ref_b_shorts = {
    id: 'ref_b_shorts', category: 'boys',
    name: { en: 'Cargo Shorts', ar: 'شورت ولادي بجيوب كارغو' },
    desc: {
      en: 'Above-knee shorts with a curved crotch seam, flat elastic-back waistband (no dart — the elastic provides the fit), front fly facing, and a flapped cargo pocket at the side seam. Ease: +3cm waist, +5cm hip.',
      ar: 'شورت فوق الركبة بخط تفصيل منحنٍ، وحزام خصر مسطّح بمطاط خلفي (بلا بنسة — يوفر المطاط الملاءمة)، وبطانة سحاب أمامية، وجيب كارغو بغطاء عند الخط الجانبي. سماحية: +٣سم عند الخصر و+٥سم عند الورك.',
    },
    pieces: (m) => {
      const qw = q(m.waist), qh = q(m.hips), qt = q(m.thigh);
      const riseLen = 22, legLen = m.inseam * 0.42;
      const front = legPanel(qw * 0.52 + 0.75, qh * 0.58 + 1.25, qt * 1.3, riseLen, legLen, true);
      const back = legPanel(qw * 0.48 + 0.75, qh * 0.54 + 1.25, qt * 1.3, riseLen, legLen, false);
      const waistCirc = (qw * 0.52 + 0.75 + qw * 0.2) * 2 + (qw * 0.48 + 0.75 + qw * 0.2) * 2;
      const waistband = bandPc(waistCirc / 2, 4.5); // flat elastic-back band — see header
      const fly = bandPc(3, riseLen - 4);
      const cargoPocket = pocketPatch(8, 8);
      const cargoFlap = pocketPatch(8.5, 3);

      const pieces = [
        {
          key: 'front', name: { en: 'Shorts Front', ar: 'مقدمة الشورت' },
          desc: { en: 'Front leg panel with a curved crotch seam.', ar: 'لوحة الساق الأمامية بخط تفصيل منحنٍ.' },
          outline: front, darts: [], notches: [[front[front.crotchIdx][0], front[front.crotchIdx][1]], [front[front.hemOutIdx][0], front[front.hemOutIdx][1]]],
          grain: [[qt * 0.6, riseLen + 6], [qt * 0.6, riseLen + legLen - 6]],
          role: 'other', bilateral: true,
          edges: [{ fromIdx: 0, toIdx: front.hemOutIdx, seamId: 'shortsOutseam' }],
        },
        {
          key: 'back', name: { en: 'Shorts Back', ar: 'خلفية الشورت' },
          desc: { en: 'Back leg panel with a deeper curved crotch seam, per real block convention.', ar: 'لوحة الساق الخلفية بخط تفصيل منحنٍ أعمق، حسب القاعدة الحقيقية.' },
          outline: back, darts: [], notches: [[back[back.crotchIdx][0], back[back.crotchIdx][1]], [back[back.hemOutIdx][0], back[back.hemOutIdx][1]]],
          grain: [[qt * 0.6, riseLen + 6], [qt * 0.6, riseLen + legLen - 6]],
          role: 'other', bilateral: true,
          edges: [{ fromIdx: 0, toIdx: back.hemOutIdx, seamId: 'shortsOutseam' }],
        },
        {
          key: 'waistband', name: { en: 'Elastic-Back Waistband', ar: 'حزام خصر بمطاط خلفي' },
          desc: { en: 'Flat waistband with a back elastic insert — no waist dart needed.', ar: 'حزام خصر مسطّح بإدراج مطاطي خلفي — دون حاجة لبنسة خصر.' },
          outline: waistband, darts: [], notches: [[waistCirc / 4, 0]],
          grain: [[2, 2], [waistCirc / 2 - 2, 2]],
          role: 'waistband', cutOnFold: true,
        },
        {
          key: 'fly', name: { en: 'Fly Placket Facing', ar: 'بطانة سحاب الفتحة الأمامية' },
          desc: { en: 'Facing strip behind the front fly zip.', ar: 'شريط بطانة خلف سحاب الفتحة الأمامية.' },
          outline: fly, darts: [], notches: [],
          grain: [[1.5, 2], [1.5, riseLen - 8]],
          role: 'placket-facing',
        },
        {
          key: 'cargo_pocket', name: { en: 'Cargo Pocket', ar: 'جيب كارغو' },
          desc: { en: 'Patch pocket at the side seam.', ar: 'جيب ملصق عند الخط الجانبي.' },
          outline: cargoPocket, darts: [], notches: [[cargoPocket[1][0] / 2, 0]],
          grain: [[4, 1], [4, 6]],
          role: 'pocket', bilateral: true,
        },
        {
          key: 'cargo_flap', name: { en: 'Cargo Pocket Flap', ar: 'غطاء جيب الكارغو' },
          desc: { en: 'Buttoned flap covering the cargo pocket.', ar: 'غطاء بزر يغطي جيب الكارغو.' },
          outline: cargoFlap, darts: [], notches: [[cargoFlap[1][0] / 2, 0]],
          grain: [[4.25, 0.7], [4.25, 2.3]],
          role: 'pocket', bilateral: true,
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_b_shorts', cat: 'boys', tag: { en: 'Reference · Trouser', ar: 'مرجعي · بنطلون' }, type: 'trousers' });

  // ============================================================
  // 12. BOYS — Button-Front Shirt with Yoke (multi-piece tailored)
  // Drafting basis: same tailored shirt block as patterns 3/6/9, scaled
  // to the boys' body. Ease: +9cm chest, +9cm waist/hip. Suppression: a
  // single back waist dart (not a pleat, not princess seams). DIFFERS
  // from pattern 6 (men's dress shirt) in sleeve construction (one-piece
  // short sleeve, not two-piece), closure (hem-band cuff, not a barrel
  // cuff) and suppression (dart, not a box pleat) — real construction:
  // curved back yoke, collar + stand, front button placket, chest patch
  // pocket.
  // ============================================================
  PATTERNS.ref_b_shirt = {
    id: 'ref_b_shirt', category: 'boys',
    name: { en: "Boys' Button-Front Shirt", ar: 'قميص ولادي بأزرار أمامية' },
    desc: {
      en: 'Boys’ shirt with a curved back yoke over a single waist dart, one-piece short sleeve finished with a hem band, collar and stand, front button placket, chest pocket. Ease: +9cm chest.',
      ar: 'قميص ولادي بكوّة ظهر منحنية فوق بنسة خصر واحدة، وكم قصير من قطعة واحدة ينتهي بشريط حاشية، وياقة مع قاعدتها، وحاشية أزرار أمامية، وجيب صدر. سماحية: +٩سم عند الصدر.',
    },
    pieces: (m) => {
      const qc = q(m.chest), qw = q(m.waist), qh = q(m.hips);
      const shoulderX = qc * 0.28;
      const waistY = m.backLen, hipY = waistY + 12, hemY = hipY + 10;
      const chestX = qc + 4, waistX = qw + 3.5, hipX = qh + 3.5;
      const front = plainBodicePanel(shoulderX, 7, chestX, m.backLen * 0.3, waistX, waistY, hipX, hipY, hipX, hemY);
      const yokeDepth = 7;
      const yokeSeamY = 0, backUnderarmY = 6;
      const underarmToWaist = waistY - m.backLen * 0.3, waistToHip = hipY - waistY, hipToHem = hemY - hipY;
      const backWaistY = backUnderarmY + underarmToWaist, backHipY = backWaistY + waistToHip, backHemY = backHipY + hipToHem;
      const backWaistSeg = [[chestX, backUnderarmY], [chestX, (backUnderarmY + backWaistY) / 2], [waistX, backWaistY]];
      const backWaistPts = qBez(...backWaistSeg, 6);
      const back = [[0, yokeSeamY], [chestX, yokeSeamY], [chestX, backUnderarmY], ...backWaistPts, [hipX, backHipY], [hipX, backHemY], [0, backHemY]];
      withCurves(back, [{ fromIdx: 2, toIdx: 2 + backWaistPts.length, ...qBezToCubic(...backWaistSeg) }]);
      const yoke = yokeCurvePc(qc * 0.34, yokeDepth);
      const sleeveLen = m.sleeve * 0.34;
      const sleeve = setInSleeve(q(m.bicep) * 2, sleeveLen);
      const hemBand = bandPc(q(m.bicep) * 1.6, 3);
      const collar = pointedCollar(m.neck / 2 + 1, 3.5, 5);
      const stand = collarStand(m.neck / 2 + 1, 2.8);
      const pocket = pocketPatch(7.5, 7.5);
      const placket = bandPc(3, hipY - 3);

      const pieces = [
        {
          key: 'front', name: { en: 'Shirt Front', ar: 'مقدمة القميص' },
          desc: { en: 'Center-front panel with a button placket edge.', ar: 'لوحة المقدمة مع حاشية الأزرار.' },
          outline: front, darts: [], notches: [[front[front.chestIdx][0], front[front.chestIdx][1]]],
          grain: [[shoulderX * 0.5, 8], [shoulderX * 0.5, hemY - 8]],
          role: 'bodice-front-center', cutOnFold: true, chestEdgeIndices: [front.chestIdx],
          edges: [{ fromIdx: front.chestIdx, toIdx: front.chestIdx + 3, seamId: 'bshirtSide' }],
        },
        {
          key: 'back', name: { en: 'Shirt Back', ar: 'خلفية القميص' },
          desc: { en: 'Back panel joined to a curved yoke at the shoulder, with a single waist dart.', ar: 'لوحة الخلفية متصلة بكوّة منحنية عند الكتف، مع بنسة خصر واحدة.' },
          outline: back, darts: [[[qw * 0.48, backWaistY - 6], [qw * 0.48 - 1.2, backWaistY], [qw * 0.48 + 1.2, backWaistY]]],
          notches: [[chestX, backUnderarmY]],
          grain: [[shoulderX * 0.5, yokeSeamY + 5], [shoulderX * 0.5, backHemY - 8]],
          role: 'bodice-back-center', cutOnFold: true, chestEdgeIndices: [2],
          edges: [{ fromIdx: 2, toIdx: 2 + backWaistPts.length + 2, seamId: 'bshirtSide' }],
        },
        {
          key: 'yoke', name: { en: 'Back Yoke', ar: 'كوّة الظهر' },
          desc: { en: 'Curved shoulder yoke, cut on the fold.', ar: 'كوّة كتف منحنية، مقصوصة على الطية.' },
          outline: yoke, darts: [], notches: [yoke[yoke.shoulderIdx]],
          grain: [[qc * 0.15, 2], [qc * 0.15, yokeDepth * 1.4]],
          role: 'yoke', cutOnFold: true,
        },
        {
          key: 'sleeve', name: { en: 'Short Sleeve', ar: 'كم قصير' },
          desc: { en: 'One-piece short sleeve finished with a hem band; front single notch, back double notch.', ar: 'كم قصير من قطعة واحدة ينتهي بشريط حاشية؛ علامة تطابق واحدة أمامًا واثنتان خلفًا.' },
          outline: sleeve, darts: [], notches: [sleeve[sleeve.frontNotchIdx], sleeve[sleeve.backNotchIdx1], sleeve[sleeve.backNotchIdx2]],
          grain: [[q(m.bicep), 3], [q(m.bicep), sleeveLen - 3]],
          role: 'sleeve', bilateral: true,
        },
        {
          key: 'hem_band', name: { en: 'Sleeve Hem Band', ar: 'شريط حاشية الكم' },
          desc: { en: 'Band finishing the short-sleeve hem.', ar: 'شريط لتشطيب حاشية الكم القصير.' },
          outline: hemBand, darts: [], notches: [[hemBand[1][0] / 2, 0]],
          grain: [[2, 0.7], [2, 2.3]],
          role: 'hem-band', bilateral: true,
        },
        {
          key: 'collar', name: { en: 'Collar', ar: 'الياقة' },
          desc: { en: 'Two-point collar, cut on the fold.', ar: 'ياقة بطرفين، مقصوصة على الطية.' },
          outline: collar, darts: [], notches: [collar[collar.frontIdx]],
          grain: [[2, 1.5], [2, 4]],
          role: 'collar', cutOnFold: true,
        },
        {
          key: 'stand', name: { en: 'Collar Stand', ar: 'قاعدة الياقة' },
          desc: { en: 'Standing band the collar attaches to, cut on the fold.', ar: 'شريط واقف تُركَّب عليه الياقة، مقصوص على الطية.' },
          outline: stand, darts: [], notches: [stand[stand.shoulderIdx]],
          grain: [[2, 0.8], [2, 1.8]],
          role: 'collar-stand', cutOnFold: true,
        },
        {
          key: 'pocket', name: { en: 'Chest Pocket', ar: 'جيب الصدر' },
          desc: { en: 'Patch pocket at the chest.', ar: 'جيب ملصق عند الصدر.' },
          outline: pocket, darts: [], notches: [[pocket[1][0] / 2, 0]],
          grain: [[3.75, 1], [3.75, 5.5]],
          role: 'pocket',
        },
        {
          key: 'placket', name: { en: 'Front Placket Facing', ar: 'بطانة حاشية الأزرار' },
          desc: { en: 'Button placket facing behind the front opening.', ar: 'بطانة حاشية أزرار خلف فتحة المقدمة.' },
          outline: placket, darts: [], notches: [],
          grain: [[1.5, 3], [1.5, hipY - 6]],
          role: 'placket-facing',
        },
      ];
      return hoistCurves(pieces);
    },
  };
  LIBRARY.push({ id: 'ref_b_shirt', cat: 'boys', tag: { en: 'Reference · Tailored', ar: 'مرجعي · تفصيل' }, type: 'shirt' });
})();

