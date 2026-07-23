/* ============================================================
   Fancy Pattern Library — 24 elaborate, multi-piece designs
   (6 per category: women / men / girls / boys). Each design has
   8+ real pattern pieces and genuinely curved seams (necklines,
   armholes, lapels, princess seams, godets, hoods) built from
   bezier curves sampled into the polyline outlines the rest of
   the app already understands — NOT the AIGen.build() pipeline
   used by library.js, which tops out at ~5 straight-edged pieces.

   Relies on globals already defined by data.js (loaded first):
   q(), PATTERNS, LIBRARY.
   ============================================================ */
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

  // Shared S-curve for a princess seam: 4 waypoints (shoulder→bust→waist→hip→hem),
  // out at bust/hip, in at waist. Reused as the shared edge between a bodice's
  // center panel and side panel — one curve, two panels, always seam-consistent.
  function princessCurve(topX, topY, bustX, bustY, waistX, waistY, hipX, hipY, hemX, hemY) {
    const pts = [[topX, topY]];
    pts.push(...cBez([topX, topY], [lerp(topX,bustX,0.3), lerp(topY,bustY,0.6)], [lerp(topX,bustX,0.85), bustY-3], [bustX, bustY], 6));
    pts.push(...cBez([bustX, bustY], [lerp(bustX,waistX,0.3), lerp(bustY,waistY,0.5)], [lerp(bustX,waistX,0.85), waistY-4], [waistX, waistY], 6));
    pts.push(...cBez([waistX, waistY], [lerp(waistX,hipX,0.3), lerp(waistY,hipY,0.5)], [lerp(waistX,hipX,0.85), hipY-3], [hipX, hipY], 6));
    pts.push(...cBez([hipX, hipY], [lerp(hipX,hemX,0.3), lerp(hipY,hemY,0.5)], [lerp(hipX,hemX,0.85), hemY-2], [hemX, hemY], 6));
    return pts;
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
    return [
      [0,0],[topW,0],
      ...qBez([topW,0], [topW*0.85, len*0.6], bottom, 7),
      ...qBez(bottom, [topW*0.15, len*0.6], [0,0], 7),
    ];
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
    return [
      [0,0],[waistW,0],
      ...qBez([waistW,0], [waistW*1.3,flareLen*0.6], [waistW*1.05,flareLen], 6),
      ...qBez([waistW*1.05,flareLen], [waistW*0.5,flareLen+bulge], [-waistW*0.05,flareLen], 6),
      ...qBez([-waistW*0.05,flareLen], [-waistW*0.3,flareLen*0.6], [0,0], 6),
    ];
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
    return [
      [0,0],[neckW,0],
      ...qBez([neckW,0], [neckW*1.8,len*0.5], [neckW*1.5,len], 8),
      ...qBez([neckW*1.5,len], [neckW*0.7,len+6], [0,len*0.85], 8),
      ...qBez([0,len*0.85], [-neckW*0.1,len*0.4], [0,0], 5),
    ];
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

    const frontCurve = princessCurve(shoulderX, topY, fBustX, bustY, fWaistX, waistY, fHipX, hipY, fHemX, hemY);
    const backCurve  = princessCurve(shoulderX, topY, bBustX, bustY, bWaistX, waistY, bHipX, hipY, bHemX, hemY);

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

    const frontCenter = [ [0, necklineY], ...neckPts, ...frontCurve, [0, hemY] ];
    const frontSide = [
      ...frontCurve.slice().reverse(),
      [shoulderX + shoulderW, topY - 2],
      ...qBez([shoulderX+shoulderW, topY-2], [sideX*0.9, bustY*0.55], [sideX, bustY], 6),
      [sideX*1.02, waistY],
      [sideX*1.04, hipY],
      [fHemX + (sideX*1.04 - fHipX), hemY],
    ];
    const backNeckPts = qBez([0, necklineY*0.4], [shoulderX*0.5, -1], [shoulderX, topY], 5);
    const backCenter = [ [0, necklineY*0.4], ...backNeckPts, ...backCurve, [0, hemY] ];
    const backSide = [
      ...backCurve.slice().reverse(),
      [shoulderX + shoulderW, topY - 2],
      ...qBez([shoulderX+shoulderW, topY-2], [sideX*0.88, bustY*0.55], [sideX*0.98, bustY], 6),
      [sideX*1.0, waistY],
      [sideX*1.02, hipY],
      [bHemX + (sideX*1.02 - bHipX), hemY],
    ];
    return { frontCenter, frontSide, backCenter, backSide, hemY, sideX };
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
      { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a curved neckline.",ar:"لوحة المقدمة الوسطى بخط رقبة منحنٍ."}, outline:b.frontCenter },
      { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel joined at the princess seam.",ar:"لوحة جانبية منحنية تلتقي بخط قصة الأميرة."}, outline:b.frontSide },
      { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, outline:b.backCenter },
      { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, outline:b.backSide },
      { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore flaring to the hem.",ar:"مروحة أمامية تتسع نحو الحاشية."}, outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 6) },
      { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore flaring to the hem.",ar:"مروحة خلفية تتسع نحو الحاشية."}, outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 6) },
      { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة جانبية يسرى"}, desc:{en:"Side gore adding fullness.",ar:"مروحة جانبية تضيف اتساعًا."}, outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8) },
      { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة جانبية يمنى"}, desc:{en:"Side gore adding fullness.",ar:"مروحة جانبية تضيف اتساعًا."}, outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8) },
    ];
    if (!opts.sleeveless) pieces.push({ key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Curved cap sleeve.",ar:"كم برأس منحنٍ."}, outline: sleeve1pc(m.bicep, m.sleeve * (opts.sleeveLong ? 0.85 : 0.35), 1.1) });
    pieces.push({ key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Tie sash with a pointed tail.",ar:"حزام بطرف مدبب."}, outline: sashPc(waistW*0.4, 45) });
    return pieces;
  }

  function buildFancyJacket(m, opts) {
    opts = opts || {};
    const len = m.backLen * (JLEN_F[opts.length] || JLEN_F.medium);
    const jb = jacketFrontBack(m, len, { hemFlareF: 1.0 });
    const sl = sleeve2pc(m.bicep, m.sleeve);
    return [
      { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored front panel.",ar:"مقدمة مفصّلة."}, outline: jb.front },
      { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored back panel.",ar:"خلفية مفصّلة."}, outline: jb.back },
      { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, outline: sl.upper },
      { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, outline: sl.under },
      { key:"collar", name:{en:"Collar",ar:"الياقة"}, desc:{en:"Curved collar.",ar:"ياقة منحنية."}, outline: shawlCollar(m.neck, 18) },
      { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved lapel facing.",ar:"بطانة صدر منحنية."}, outline: lapelFacing(m.neck, len*0.5) },
      { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket.",ar:"جيب مطوي منحنٍ."}, outline: pocketPc(10,3.5) },
      { key:"backLining", name:{en:"Back Lining",ar:"بطانة الظهر"}, desc:{en:"Full back body lining.",ar:"بطانة كاملة للظهر."}, outline: jb.back },
    ];
  }

  function buildFancyCoat(m, opts) {
    opts = opts || {};
    const len = m.backLen * (CLEN_F[opts.length] || CLEN_F.medium);
    const jb = jacketFrontBack(m, len, { hemFlareF: 1.05, closureX: q(m.chest)*0.22 });
    const sl = sleeve2pc(m.bicep, m.sleeve+2);
    return [
      { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Long front panel with a curved lapel.",ar:"لوحة أمامية طويلة بياقة منحنية."}, outline: jb.front },
      { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Long back panel.",ar:"لوحة خلفية طويلة."}, outline: jb.back },
      { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, outline: sl.upper },
      { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, outline: sl.under },
      { key:"collar", name:{en:"Wide Collar",ar:"ياقة عريضة"}, desc:{en:"Wide curved collar.",ar:"ياقة عريضة منحنية."}, outline: shawlCollar(m.neck*1.05, 20) },
      { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the front edge.",ar:"بطانة منحنية على حافة المقدمة."}, outline: lapelFacing(m.neck, len*0.45) },
      { key:"chestPocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Welt chest pocket.",ar:"جيب صدر مطوي."}, outline: pocketPc(10,3.5) },
      { key:"hipFlap", name:{en:"Hip Flap Pocket",ar:"جيب ورك بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, outline: pocketPc(14,5.5) },
      { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke reinforcing the back.",ar:"كوة كتف منحنية تعزز الظهر."}, outline: yokePc(q(m.shoulder)*1.3, 10) },
    ];
  }

  function buildFancySuit(m) {
    const jLen = m.backLen*1.55, vLen = m.backLen*1.05;
    const jb = jacketFrontBack(m, jLen, { hemFlareF: 1.0 });
    const vb = jacketFrontBack(m, vLen, { hemFlareF: 0.9, closureX: q(m.chest)*0.06 });
    const sl = sleeve2pc(m.bicep, m.sleeve);
    const qw = q(m.waist), qh = q(m.hips);
    return [
      { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored suit jacket front.",ar:"مقدمة جاكيت البدلة المفصّلة."}, outline: jb.front },
      { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored suit jacket back.",ar:"خلفية جاكيت البدلة المفصّلة."}, outline: jb.back },
      { key:"sleeveU", name:{en:"Jacket Sleeve Upper",ar:"الكم العلوي للجاكيت"}, desc:{en:"Outer jacket sleeve panel.",ar:"اللوحة الخارجية لكم الجاكيت."}, outline: sl.upper },
      { key:"sleeveD", name:{en:"Jacket Sleeve Under",ar:"الكم السفلي للجاكيت"}, desc:{en:"Inner jacket sleeve panel.",ar:"اللوحة الداخلية لكم الجاكيت."}, outline: sl.under },
      { key:"collar", name:{en:"Jacket Collar",ar:"ياقة الجاكيت"}, desc:{en:"Notch-ready jacket collar.",ar:"ياقة جاكيت جاهزة للفتحة."}, outline: shawlCollar(m.neck, 20) },
      { key:"facing", name:{en:"Jacket Facing",ar:"بطانة الجاكيت"}, desc:{en:"Curved front facing.",ar:"بطانة أمامية منحنية."}, outline: lapelFacing(m.neck, jLen*0.5) },
      { key:"vestFront", name:{en:"Vest Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted sleeveless vest front.",ar:"مقدمة صدرية ضيقة بلا أكمام."}, outline: vb.front },
      { key:"vestBack", name:{en:"Vest Back",ar:"خلفية الصدرية"}, desc:{en:"Vest back panel.",ar:"لوحة خلفية الصدرية."}, outline: vb.back },
      { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Front leg panel with a curved crotch seam.",ar:"لوحة الساق الأمامية بخط تفصيل منحنٍ."}, outline: trouserPanel(qw, qh, m.thigh, m.inseam, true) },
      { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Back leg panel with a curved seat curve.",ar:"لوحة الساق الخلفية بمنحنى مقعد."}, outline: trouserPanel(qw, qh, m.thigh, m.inseam, false) },
    ];
  }

  window.FancyGen = {
    build(kind, m, opts) {
      if (kind === "gown") return buildFancyGown(m, opts);
      if (kind === "jacket") return buildFancyJacket(m, opts);
      if (kind === "coat") return buildFancyCoat(m, opts);
      if (kind === "suit") return buildFancySuit(m);
      return [];
    },
  };

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
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a curved scoop neckline.",ar:"لوحة المقدمة الوسطى بخط رقبة منحنٍ."}, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel joined at the princess seam.",ar:"لوحة جانبية منحنية تلتقي بخط قصة الأميرة."}, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Center front gore flaring to the hem.",ar:"مروحة أمامية وسطى تتسع نحو الحاشية."}, outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 6), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Center back gore flaring to the hem.",ar:"مروحة خلفية وسطى تتسع نحو الحاشية."}, outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 6), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore adding fullness to the skirt.",ar:"مروحة جانبية تضيف اتساعًا للتنورة."}, outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore adding fullness to the skirt.",ar:"مروحة جانبية تضيف اتساعًا للتنورة."}, outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8), grain:[[4,10],[4,hemLen-10]] },
        { key:"sleeve", name:{en:"Cap Sleeve",ar:"كم قصير"}, desc:{en:"Short curved cap sleeve.",ar:"كم قصير منحنٍ."}, outline:sleeve1pc(m.bicep, m.sleeve*0.35, 1.1), grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.3]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Long tie sash with a pointed tail.",ar:"حزام طويل بطرف مدبب."}, outline:sashPc(waistW*0.5, 55), grain:[[10,2],[40,2]] },
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
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Fitted center front with a sweetheart curve.",ar:"مقدمة ضيقة بخط قلب منحنٍ."}, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel, fitted through the waist.",ar:"لوحة جانبية ضيقة عند الخصر."}, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Fitted center back panel.",ar:"لوحة خلفية وسطى ضيقة."}, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Fitted back side panel.",ar:"لوحة جانبية خلفية ضيقة."}, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"skirtF", name:{en:"Mermaid Skirt Front",ar:"تنورة الحورية الأمامية"}, desc:{en:"Narrow through the knee before flaring.",ar:"ضيقة عند الركبة ثم تتسع."}, outline:gorePanel(waistW*0.52, waistW*0.62, kneeLen, 1), grain:[[4,10],[4,kneeLen-8]] },
        { key:"skirtB", name:{en:"Mermaid Skirt Back",ar:"تنورة الحورية الخلفية"}, desc:{en:"Narrow through the knee before flaring.",ar:"ضيقة عند الركبة ثم تتسع."}, outline:gorePanel(waistW*0.5, waistW*0.6, kneeLen, 1), grain:[[4,10],[4,kneeLen-8]] },
        { key:"godetL", name:{en:"Hem Godet Left",ar:"مروحة الحاشية اليسرى"}, desc:{en:"Flare insert at the hem for walking ease.",ar:"إدراج مروحي عند الحاشية لسهولة الحركة."}, outline:godetPc(q(m.hips)*0.22, hemLen-kneeLen+18), grain:[[3,6],[3,hemLen-kneeLen]] },
        { key:"godetR", name:{en:"Hem Godet Right",ar:"مروحة الحاشية اليمنى"}, desc:{en:"Flare insert at the hem for walking ease.",ar:"إدراج مروحي عند الحاشية لسهولة الحركة."}, outline:godetPc(q(m.hips)*0.22, hemLen-kneeLen+18), grain:[[3,6],[3,hemLen-kneeLen]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Slim tie sash accenting the waist.",ar:"حزام رفيع يبرز الخصر."}, outline:sashPc(waistW*0.4, 45), grain:[[8,2],[30,2]] },
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
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Corset-fitted center front panel.",ar:"مقدمة وسطى بقصة كورسيه ضيقة."}, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Boned side panel shaping the waist.",ar:"لوحة جانبية مقوّاة تشكّل الخصر."}, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel, lace-up ready.",ar:"لوحة خلفية وسطى جاهزة للرباط."}, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Boned back side panel.",ar:"لوحة جانبية خلفية مقوّاة."}, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"shoulderBand", name:{en:"Off-Shoulder Band",ar:"شريط الكتف المكشوف"}, desc:{en:"Curved band draping over both shoulders.",ar:"شريط منحنٍ ينسدل على الكتفين."}, outline:sleeve1pc(m.bicep, m.sleeve*0.18, 1.3), grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.14]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Full front gore.",ar:"مروحة أمامية كاملة الاتساع."}, outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 7), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Full back gore.",ar:"مروحة خلفية كاملة الاتساع."}, outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 7), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 8), grain:[[4,10],[4,hemLen-10]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Tie sash finishing the waist seam.",ar:"حزام يُنهي خط الخصر."}, outline:sashPc(waistW*0.4, 50), grain:[[8,2],[35,2]] },
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
        { key:"frontL", name:{en:"Front Wrap Left",ar:"المقدمة الملفوفة اليسرى"}, desc:{en:"Left wrap panel crossing to the opposite hip.",ar:"لوحة ملفوفة يسرى تعبر إلى الورك المقابل."}, outline:wrapPanel(qc, qw, bodiceLen, "L"), grain:[[4,8],[4,bodiceLen-10]] },
        { key:"frontR", name:{en:"Front Wrap Right",ar:"المقدمة الملفوفة اليمنى"}, desc:{en:"Right wrap panel crossing to the opposite hip.",ar:"لوحة ملفوفة يمنى تعبر إلى الورك المقابل."}, outline:wrapPanel(qc, qw, bodiceLen, "R"), grain:[[-4,8],[-4,bodiceLen-10]] },
        { key:"back", name:{en:"Bodice Back",ar:"خلفية الصدرية"}, desc:{en:"Curved back bodice panel.",ar:"لوحة خلفية منحنية للصدرية."}, outline:[[0,0],[qc*0.95,2],...qBez([qc*0.95,2],[qc*1.0,bodiceLen*0.5],[qw*0.85,bodiceLen],8),[0,bodiceLen]], grain:[[4,8],[4,bodiceLen-10]] },
        { key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Softly gathered sleeve.",ar:"كم مجمّع برفق."}, outline:sleeve1pc(m.bicep, m.sleeve*0.45), grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.4]] },
        { key:"facing", name:{en:"Neckline Facing",ar:"بطانة خط الرقبة"}, desc:{en:"Curved facing strip finishing the wrap neckline.",ar:"شريط بطانة منحنٍ لتشطيب خط الرقبة الملفوف."}, outline:[[0,0],...qBez([0,0],[qc*0.4,3],[qc*0.8,1],6),[qc*0.8,6],[0,6]], grain:[[4,2],[qc*0.5,2]] },
        { key:"tier1", name:{en:"Ruffle Tier 1",ar:"الطبقة الأولى من الكشكش"}, desc:{en:"Top tier, gathered at the waist seam.",ar:"الطبقة العلوية مجمّعة عند خط الخصر."}, outline:tierPc(t1w, t2w, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"tier2", name:{en:"Ruffle Tier 2",ar:"الطبقة الثانية من الكشكش"}, desc:{en:"Middle tier, wider than the first.",ar:"الطبقة الوسطى أوسع من الأولى."}, outline:tierPc(t2w, t3w, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"tier3", name:{en:"Ruffle Tier 3",ar:"الطبقة الثالثة من الكشكش"}, desc:{en:"Hem tier with the fullest curved sweep.",ar:"طبقة الحاشية الأوسع بانسيابة منحنية."}, outline:tierPc(t3w, t3w*1.25, tierLen), grain:[[6,4],[6,tierLen-6]] },
        { key:"sash", name:{en:"Wrap Tie",ar:"رباط الالتفاف"}, desc:{en:"Long tie securing the wrap closure.",ar:"رباط طويل لتثبيت الإغلاق الملفوف."}, outline:sashPc(qw*0.3, 60), grain:[[8,2],[40,2]] },
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
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel.",ar:"لوحة المقدمة الوسطى."}, outline:b.frontCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, outline:b.frontSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, outline:b.backCenter, grain:[[2,10],[2,b.hemY-4]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, outline:b.backSide, grain:[[4,10],[4,b.hemY-4]] },
        { key:"cape", name:{en:"Draped Cape Overlay",ar:"طبقة الكاب المنسدلة"}, desc:{en:"Sweeping curved cape draping from the shoulders.",ar:"كاب منحنٍ ينسدل من الكتفين."}, outline:capePc(q(m.shoulder)*0.9, 55), grain:[[6,6],[6,40]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore.",ar:"مروحة أمامية."}, outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 5), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore.",ar:"مروحة خلفية."}, outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 5), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, outline:gorePanel(waistW*0.45, hemW*0.3, hemLen, 7), grain:[[4,10],[4,hemLen-10]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, outline:gorePanel(waistW*0.45, hemW*0.3, hemLen, 7), grain:[[4,10],[4,hemLen-10]] },
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
        { key:"front", name:{en:"Bodice Front",ar:"مقدمة الصدرية"}, desc:{en:"Structured front with a tailored closure.",ar:"مقدمة مهيكلة بإغلاق مفصّل."}, outline:jb.front, grain:[[4,8],[4,m.backLen*0.4]] },
        { key:"back", name:{en:"Bodice Back",ar:"خلفية الصدرية"}, desc:{en:"Tailored back panel.",ar:"لوحة خلفية مفصّلة."}, outline:jb.back, grain:[[4,8],[4,m.backLen*0.4]] },
        { key:"collar", name:{en:"Shawl Collar",ar:"ياقة شال"}, desc:{en:"Curved shawl collar.",ar:"ياقة شال منحنية."}, outline:shawlCollar(m.neck, 16), grain:[[4,4],[4,12]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved lapel facing.",ar:"بطانة صدر منحنية."}, outline:lapelFacing(m.neck, m.backLen*0.5), grain:[[4,4],[4,m.backLen*0.3]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"peplumF", name:{en:"Peplum Front",ar:"بيبلوم أمامي"}, desc:{en:"Flared peplum flounce at the front waist.",ar:"كشكش بيبلوم متسع عند الخصر الأمامي."}, outline:peplumPc(waistW*0.55, 22), grain:[[6,4],[6,16]] },
        { key:"peplumB", name:{en:"Peplum Back",ar:"بيبلوم خلفي"}, desc:{en:"Flared peplum flounce at the back waist.",ar:"كشكش بيبلوم متسع عند الخصر الخلفي."}, outline:peplumPc(waistW*0.5, 20), grain:[[6,4],[6,15]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket.",ar:"جيب مطوي منحني."}, outline:pocketPc(11,4), grain:[[5,1],[5,3]] },
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
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored front with a curved hem sweep.",ar:"مقدمة مفصّلة بحاشية منحنية."}, outline:jb.front, grain:[[4,10],[4,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Center back panel with a shaped waist.",ar:"لوحة الخلفية الوسطى بخصر مشكّل."}, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel with a curved cap.",ar:"اللوحة الخارجية للكم برأس منحنٍ."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Shawl Collar",ar:"ياقة شال"}, desc:{en:"Smooth curved shawl collar, no notch.",ar:"ياقة شال منحنية بلا فتحة."}, outline:shawlCollar(m.neck, 22), grain:[[4,4],[4,16]] },
        { key:"facing", name:{en:"Lapel Facing",ar:"بطانة الصدر"}, desc:{en:"Curved facing along the lapel roll-line.",ar:"بطانة منحنية على خط انثناء الصدر."}, outline:lapelFacing(m.neck, len*0.55), grain:[[4,4],[4,len*0.35]] },
        { key:"pocketWelt", name:{en:"Chest Welt Pocket",ar:"جيب صدر مطوي"}, desc:{en:"Curved welt pocket at the chest.",ar:"جيب مطوي منحنٍ عند الصدر."}, outline:pocketPc(10,3.5), grain:[[5,1],[5,2.5]] },
        { key:"pocketFlap", name:{en:"Hip Pocket Flap",ar:"غطاء جيب الورك"}, desc:{en:"Curved flap for the hip pocket.",ar:"غطاء منحنٍ لجيب الورك."}, outline:pocketPc(13,5), grain:[[6,1.5],[6,3.5]] },
        { key:"backLining", name:{en:"Back Lining",ar:"بطانة الظهر"}, desc:{en:"Full back body lining.",ar:"بطانة كاملة للظهر."}, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
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
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Wide double-breasted overlap front.",ar:"مقدمة عريضة بتراكب صفين من الأزرار."}, outline:jb.front, grain:[[6,12],[6,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Long back panel with a center vent.",ar:"لوحة خلفية طويلة بفتحة وسطى."}, outline:jb.back, grain:[[6,12],[6,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer coat sleeve panel.",ar:"اللوحة الخارجية لكم المعطف."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner coat sleeve panel.",ar:"اللوحة الداخلية لكم المعطف."}, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"facing", name:{en:"Wide Lapel Facing",ar:"بطانة الصدر العريضة"}, desc:{en:"Wide curved lapel facing.",ar:"بطانة صدر عريضة منحنية."}, outline:lapelFacing(m.neck*1.15, len*0.5), grain:[[4,4],[4,len*0.3]] },
        { key:"undercollar", name:{en:"Undercollar",ar:"تحت الياقة"}, desc:{en:"Curved undercollar piece.",ar:"قطعة تحت الياقة المنحنية."}, outline:shawlCollar(m.neck, 14), grain:[[4,3],[4,10]] },
        { key:"backBelt", name:{en:"Half Belt",ar:"نصف حزام"}, desc:{en:"Decorative half-belt tab at the back waist.",ar:"شريط نصف حزام زخرفي عند خصر الظهر."}, outline:waistbandPc(q(m.waist)*0.5, 6), grain:[[8,1],[8,4]] },
        { key:"chestPocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Curved welt chest pocket.",ar:"جيب صدر مطوي منحنٍ."}, outline:pocketPc(10,3.5), grain:[[5,1],[5,2.5]] },
        { key:"hipFlap", name:{en:"Hip Flap Pocket",ar:"جيب ورك بغطاء"}, desc:{en:"Flap pocket at the hip.",ar:"جيب بغطاء عند الورك."}, outline:pocketPc(14,5.5), grain:[[6,1.5],[6,3.5]] },
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
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Front panel with a zip closure edge.",ar:"مقدمة بحافة إغلاق سحاب."}, outline:jb.front, grain:[[4,8],[4,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Back panel gathered to the waistband.",ar:"لوحة خلفية مجمّعة عند حزام الخصر."}, outline:jb.back, grain:[[4,8],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.4]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.4]] },
        { key:"collarBand", name:{en:"Rib Collar Band",ar:"شريط ياقة ريب"}, desc:{en:"Stretch ribbed collar band.",ar:"شريط ياقة مطاطي من الريب."}, outline:cs.stand, grain:[[4,1],[m.neck/2,1]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff gathering the sleeve hem.",ar:"أسورة ريب تجمع نهاية الكم."}, outline:cuffPc(q(m.bicep)*0.8), grain:[[4,1],[4,5]] },
        { key:"waistband", name:{en:"Rib Waistband",ar:"حزام خصر ريب"}, desc:{en:"Ribbed waistband cinching the hem.",ar:"حزام خصر من الريب يجمع الحاشية."}, outline:waistbandPc(q(m.waist)*0.9, 8), grain:[[8,2],[8,6]] },
        { key:"placket", name:{en:"Zip Placket Facing",ar:"بطانة فتحة السحاب"}, desc:{en:"Facing strip behind the zip.",ar:"شريط بطانة خلف السحاب."}, outline:lapelFacing(m.neck*0.5, len*0.4), grain:[[3,3],[3,len*0.25]] },
        { key:"pocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Zippered chest pocket panel.",ar:"لوحة جيب صدر بسحاب."}, outline:pocketPc(11,4), grain:[[5,1],[5,3]] },
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
        { key:"frontL", name:{en:"Front Left",ar:"المقدمة اليسرى"}, desc:{en:"Left front with the asymmetric closure curve.",ar:"مقدمة يسرى بمنحنى إغلاق غير متماثل."}, outline:wrapPanel(qc, qw, len, "L"), grain:[[4,10],[4,len*0.6]] },
        { key:"frontR", name:{en:"Front Right",ar:"المقدمة اليمنى"}, desc:{en:"Right front underlapping the closure.",ar:"مقدمة يمنى تحت الإغلاق."}, outline:wrapPanel(qc, qw, len, "R"), grain:[[-4,10],[-4,len*0.6]] },
        { key:"back", name:{en:"Back Panel",ar:"لوحة الظهر"}, desc:{en:"Long back panel to the hem.",ar:"لوحة ظهر طويلة حتى الحاشية."}, outline:jacketFrontBack(m, len, {hemFlareF:1.05}).back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Nehru Collar",ar:"ياقة نهرو"}, desc:{en:"Standing Nehru-style collar band.",ar:"ياقة واقفة بطراز نهرو."}, outline:cs.stand, grain:[[4,1],[m.neck/2,1]] },
        { key:"godetL", name:{en:"Hem Godet Left",ar:"مروحة الحاشية اليسرى"}, desc:{en:"Flare insert for a graceful hem sweep.",ar:"إدراج مروحي لانسيابة أنيقة عند الحاشية."}, outline:godetPc(q(m.hips)*0.3, len*0.32), grain:[[5,8],[5,len*0.2]] },
        { key:"godetR", name:{en:"Hem Godet Right",ar:"مروحة الحاشية اليمنى"}, desc:{en:"Flare insert for a graceful hem sweep.",ar:"إدراج مروحي لانسيابة أنيقة عند الحاشية."}, outline:godetPc(q(m.hips)*0.3, len*0.32), grain:[[5,8],[5,len*0.2]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket at the hip.",ar:"جيب مطوي منحنٍ عند الورك."}, outline:pocketPc(11,4), grain:[[5,1],[5,3]] },
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
        { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored suit jacket front.",ar:"مقدمة جاكيت البدلة المفصّلة."}, outline:jb.front, grain:[[4,10],[4,jLen*0.6]] },
        { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored suit jacket back.",ar:"خلفية جاكيت البدلة المفصّلة."}, outline:jb.back, grain:[[4,10],[4,jLen*0.6]] },
        { key:"sleeveU", name:{en:"Jacket Sleeve Upper",ar:"الكم العلوي للجاكيت"}, desc:{en:"Outer jacket sleeve panel.",ar:"اللوحة الخارجية لكم الجاكيت."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Jacket Sleeve Under",ar:"الكم السفلي للجاكيت"}, desc:{en:"Inner jacket sleeve panel.",ar:"اللوحة الداخلية لكم الجاكيت."}, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Jacket Collar",ar:"ياقة الجاكيت"}, desc:{en:"Notch-ready jacket collar.",ar:"ياقة جاكيت جاهزة للفتحة."}, outline:shawlCollar(m.neck, 20), grain:[[4,4],[4,14]] },
        { key:"facing", name:{en:"Jacket Facing",ar:"بطانة الجاكيت"}, desc:{en:"Curved front facing.",ar:"بطانة أمامية منحنية."}, outline:lapelFacing(m.neck, jLen*0.5), grain:[[4,4],[4,jLen*0.3]] },
        { key:"vestFront", name:{en:"Vest Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted sleeveless vest front.",ar:"مقدمة صدرية ضيقة بلا أكمام."}, outline:vb.front, grain:[[3,8],[3,vLen*0.6]] },
        { key:"vestBack", name:{en:"Vest Back",ar:"خلفية الصدرية"}, desc:{en:"Vest back, often cut in lining fabric.",ar:"خلفية الصدرية، تُقص عادة من قماش البطانة."}, outline:vb.back, grain:[[3,8],[3,vLen*0.6]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Front leg panel with a curved crotch seam.",ar:"لوحة الساق الأمامية بخط تفصيل منحنٍ."}, outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,10],[qw*0.3,m.inseam*0.6]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Back leg panel with a deeper curved seat curve.",ar:"لوحة الساق الخلفية بمنحنى مقعد أعمق."}, outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,10],[qw*0.3,m.inseam*0.6]] },
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
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Double-layered front with a wide lapel.",ar:"مقدمة مزدوجة الطبقة بياقة عريضة."}, outline:jb.front, grain:[[5,10],[5,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Back panel joined below the yoke.",ar:"لوحة خلفية توصل أسفل الكوة."}, outline:jb.back, grain:[[5,10],[5,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, outline:sl.under, grain:[[q(m.bicep)*0.3,4],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Wide Collar",ar:"ياقة عريضة"}, desc:{en:"Wide curved storm collar.",ar:"ياقة عاصفة عريضة منحنية."}, outline:shawlCollar(m.neck*1.05, 20), grain:[[4,4],[4,14]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved facing along the front edge.",ar:"بطانة منحنية على حافة المقدمة."}, outline:lapelFacing(m.neck, len*0.45), grain:[[4,4],[4,len*0.28]] },
        { key:"chestPocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Welt chest pocket.",ar:"جيب صدر مطوي."}, outline:pocketPc(10,3.5), grain:[[5,1],[5,2.5]] },
        { key:"hipFlap", name:{en:"Hip Flap Pocket",ar:"جيب ورك بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, outline:pocketPc(14,5.5), grain:[[6,1.5],[6,3.5]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke reinforcing the back.",ar:"كوة كتف منحنية تعزز الظهر."}, outline:yokePc(q(m.shoulder)*1.3, 10), grain:[[6,2],[6,7]] },
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
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel with a curved neckline.",ar:"لوحة المقدمة الوسطى بخط رقبة منحنٍ."}, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"tier1", name:{en:"Skirt Tier 1",ar:"طبقة التنورة الأولى"}, desc:{en:"Top tier gathered at the waist.",ar:"الطبقة العلوية مجمّعة عند الخصر."}, outline:tierPc(t1w, t2w, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"tier2", name:{en:"Skirt Tier 2",ar:"طبقة التنورة الثانية"}, desc:{en:"Middle tier.",ar:"الطبقة الوسطى."}, outline:tierPc(t2w, t3w, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"tier3", name:{en:"Skirt Tier 3",ar:"طبقة التنورة الثالثة"}, desc:{en:"Hem tier, fullest of the three.",ar:"طبقة الحاشية، الأوسع من الثلاث."}, outline:tierPc(t3w, t3w*1.3, tierLen), grain:[[5,3],[5,tierLen-5]] },
        { key:"sleeve", name:{en:"Cap Sleeve",ar:"كم قصير"}, desc:{en:"Puffed curved cap sleeve.",ar:"كم قصير منتفخ منحنٍ."}, outline:sleeve1pc(m.bicep, m.sleeve*0.3, 1.2), grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.24]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Bow sash tying at the back.",ar:"حزام بفيونكة يُربط خلفيًا."}, outline:sashPc(waistW*0.4, 40), grain:[[6,1.5],[25,1.5]] },
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
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front with a sweetheart curve.",ar:"مقدمة وسطى بخط قلب منحنٍ."}, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"sleeve", name:{en:"Butterfly Sleeve",ar:"كم فراشة"}, desc:{en:"Wide winged sleeve with a curved edge.",ar:"كم عريض بجناحين وحافة منحنية."}, outline:sleeve1pc(m.bicep, m.sleeve*0.32, 1.6), grain:[[q(m.bicep)*0.6,3],[q(m.bicep)*0.6,m.sleeve*0.25]] },
        { key:"facing", name:{en:"Neckline Facing",ar:"بطانة خط الرقبة"}, desc:{en:"Curved facing finishing the neckline.",ar:"بطانة منحنية لتشطيب خط الرقبة."}, outline:[[0,0],...qBez([0,0],[q(m.chest)*0.4,3],[q(m.chest)*0.7,1],6),[q(m.chest)*0.7,5],[0,5]], grain:[[3,2],[q(m.chest)*0.4,2]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore.",ar:"مروحة أمامية."}, outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 6), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore.",ar:"مروحة خلفية."}, outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 6), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 7), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, outline:gorePanel(waistW*0.45, hemW*0.32, hemLen, 7), grain:[[3,8],[3,hemLen-8]] },
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
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel.",ar:"لوحة المقدمة الوسطى."}, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"cape", name:{en:"Attached Cape",ar:"كاب متصل"}, desc:{en:"Sweeping cape draping from the shoulders.",ar:"كاب منسدل من الكتفين."}, outline:capePc(q(m.shoulder)*0.85, 42), grain:[[5,5],[5,30]] },
        { key:"skirtF", name:{en:"Skirt Front Gore",ar:"مروحة التنورة الأمامية"}, desc:{en:"Front gore.",ar:"مروحة أمامية."}, outline:gorePanel(waistW*0.55, hemW*0.3, hemLen, 5), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtB", name:{en:"Skirt Back Gore",ar:"مروحة التنورة الخلفية"}, desc:{en:"Back gore.",ar:"مروحة خلفية."}, outline:gorePanel(waistW*0.55, hemW*0.32, hemLen, 5), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtSL", name:{en:"Skirt Side Gore Left",ar:"مروحة التنورة الجانبية اليسرى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, outline:gorePanel(waistW*0.45, hemW*0.3, hemLen, 6), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtSR", name:{en:"Skirt Side Gore Right",ar:"مروحة التنورة الجانبية اليمنى"}, desc:{en:"Side gore.",ar:"مروحة جانبية."}, outline:gorePanel(waistW*0.45, hemW*0.3, hemLen, 6), grain:[[3,8],[3,hemLen-8]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Bow sash at the waist.",ar:"حزام بفيونكة عند الخصر."}, outline:sashPc(waistW*0.4, 38), grain:[[6,1.5],[24,1.5]] },
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
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel.",ar:"لوحة المقدمة الوسطى."}, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"tier1", name:{en:"Skirt Tier 1",ar:"طبقة التنورة الأولى"}, desc:{en:"Top tier.",ar:"الطبقة العلوية."}, outline:tierPc(widths[0], widths[1], tierLen), grain:[[4,3],[4,tierLen-4]] },
        { key:"tier2", name:{en:"Skirt Tier 2",ar:"طبقة التنورة الثانية"}, desc:{en:"Second tier.",ar:"الطبقة الثانية."}, outline:tierPc(widths[1], widths[2], tierLen), grain:[[4,3],[4,tierLen-4]] },
        { key:"tier3", name:{en:"Skirt Tier 3",ar:"طبقة التنورة الثالثة"}, desc:{en:"Third tier.",ar:"الطبقة الثالثة."}, outline:tierPc(widths[2], widths[3], tierLen), grain:[[4,3],[4,tierLen-4]] },
        { key:"tier4", name:{en:"Skirt Tier 4",ar:"طبقة التنورة الرابعة"}, desc:{en:"Hem tier.",ar:"طبقة الحاشية."}, outline:tierPc(widths[3], widths[3]*1.2, tierLen), grain:[[4,3],[4,tierLen-4]] },
        { key:"sleeve", name:{en:"Puff Sleeve",ar:"كم منتفخ"}, desc:{en:"Short puffed sleeve.",ar:"كم قصير منتفخ."}, outline:sleeve1pc(m.bicep, m.sleeve*0.28, 1.15), grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.22]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Bow sash at the waist seam.",ar:"حزام بفيونكة عند خط الخصر."}, outline:sashPc(waistW*0.4, 36), grain:[[6,1.5],[22,1.5]] },
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
        { key:"frontL", name:{en:"Front Left",ar:"المقدمة اليسرى"}, desc:{en:"Left front closure panel.",ar:"لوحة إغلاق يسرى."}, outline:wrapPanel(qc, qw, len, "L"), grain:[[3,8],[3,len*0.6]] },
        { key:"frontR", name:{en:"Front Right",ar:"المقدمة اليمنى"}, desc:{en:"Right front underlapping panel.",ar:"لوحة يمنى تحت الإغلاق."}, outline:wrapPanel(qc, qw, len, "R"), grain:[[-3,8],[-3,len*0.6]] },
        { key:"back", name:{en:"Back Panel",ar:"لوحة الظهر"}, desc:{en:"Curved back panel.",ar:"لوحة ظهر منحنية."}, outline:jacketFrontBack(m, len, {hemFlareF:1.0}).back, grain:[[3,8],[3,len*0.6]] },
        { key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Curved-cap sleeve.",ar:"كم برأس منحنٍ."}, outline:sleeve1pc(m.bicep, m.sleeve*0.85), grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.7]] },
        { key:"collar", name:{en:"Velvet Collar",ar:"ياقة مخملية"}, desc:{en:"Contrast velvet collar piece.",ar:"قطعة ياقة مخملية متباينة."}, outline:shawlCollar(m.neck, 12), grain:[[3,3],[3,9]] },
        { key:"peplumF", name:{en:"Peplum Front",ar:"بيبلوم أمامي"}, desc:{en:"Flared peplum at the front waist.",ar:"بيبلوم متسع عند الخصر الأمامي."}, outline:peplumPc(qw*0.5, 16), grain:[[5,3],[5,11]] },
        { key:"peplumB", name:{en:"Peplum Back",ar:"بيبلوم خلفي"}, desc:{en:"Flared peplum at the back waist.",ar:"بيبلوم متسع عند الخصر الخلفي."}, outline:peplumPc(qw*0.48, 15), grain:[[5,3],[5,10]] },
        { key:"pocket", name:{en:"Patch Pocket",ar:"جيب ملصق"}, desc:{en:"Curved patch pocket.",ar:"جيب ملصق منحني."}, outline:pocketPc(9,3.5), grain:[[4,1],[4,2.5]] },
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
        { key:"bodiceFC", name:{en:"Bodice Front Center",ar:"مقدمة الصدرية الوسطى"}, desc:{en:"Center front panel.",ar:"لوحة المقدمة الوسطى."}, outline:b.frontCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceFS", name:{en:"Bodice Front Side",ar:"جانب الصدرية الأمامي"}, desc:{en:"Curved side panel.",ar:"لوحة جانبية منحنية."}, outline:b.frontSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"bodiceBC", name:{en:"Bodice Back Center",ar:"خلفية الصدرية الوسطى"}, desc:{en:"Center back panel.",ar:"لوحة الخلفية الوسطى."}, outline:b.backCenter, grain:[[2,8],[2,b.hemY-3]] },
        { key:"bodiceBS", name:{en:"Bodice Back Side",ar:"جانب الصدرية الخلفي"}, desc:{en:"Curved back side panel.",ar:"لوحة جانبية خلفية منحنية."}, outline:b.backSide, grain:[[3,8],[3,b.hemY-3]] },
        { key:"skirtF", name:{en:"Skirt Front",ar:"مقدمة التنورة"}, desc:{en:"Front skirt panel.",ar:"لوحة التنورة الأمامية."}, outline:gorePanel(waistW*0.55, waistW*0.65, hemLen, 2), grain:[[3,8],[3,hemLen-8]] },
        { key:"skirtB", name:{en:"Skirt Back",ar:"خلفية التنورة"}, desc:{en:"Back skirt panel.",ar:"لوحة التنورة الخلفية."}, outline:gorePanel(waistW*0.55, waistW*0.65, hemLen, 2), grain:[[3,8],[3,hemLen-8]] },
        { key:"godetL", name:{en:"Flare Godet Left",ar:"مروحة اتساع يسرى"}, desc:{en:"Triangular flare insert at the side hem.",ar:"إدراج مروحي مثلث عند الحاشية الجانبية."}, outline:godetPc(q(m.hips)*0.25, hemLen*0.55), grain:[[3,5],[3,hemLen*0.35]] },
        { key:"godetR", name:{en:"Flare Godet Right",ar:"مروحة اتساع يمنى"}, desc:{en:"Triangular flare insert at the side hem.",ar:"إدراج مروحي مثلث عند الحاشية الجانبية."}, outline:godetPc(q(m.hips)*0.25, hemLen*0.55), grain:[[3,5],[3,hemLen*0.35]] },
        { key:"sash", name:{en:"Waist Sash",ar:"حزام الخصر"}, desc:{en:"Tie sash at the waist.",ar:"حزام يُربط عند الخصر."}, outline:sashPc(waistW*0.4, 36), grain:[[6,1.5],[22,1.5]] },
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
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored blazer front.",ar:"مقدمة بليزر مفصّلة."}, outline:jb.front, grain:[[3,8],[3,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored blazer back.",ar:"خلفية بليزر مفصّلة."}, outline:jb.back, grain:[[3,8],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Shawl Collar",ar:"ياقة شال"}, desc:{en:"Curved shawl collar.",ar:"ياقة شال منحنية."}, outline:shawlCollar(m.neck, 15), grain:[[3,3],[3,11]] },
        { key:"facing", name:{en:"Front Facing",ar:"بطانة المقدمة"}, desc:{en:"Curved lapel facing.",ar:"بطانة صدر منحنية."}, outline:lapelFacing(m.neck, len*0.5), grain:[[3,3],[3,len*0.3]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket.",ar:"جيب مطوي منحنٍ."}, outline:pocketPc(8,3), grain:[[4,1],[4,2]] },
        { key:"cuff", name:{en:"Sleeve Cuff Detail",ar:"تفصيلة أسورة الكم"}, desc:{en:"Decorative cuff band at the sleeve hem.",ar:"شريط أسورة زخرفي عند نهاية الكم."}, outline:cuffPc(q(m.bicep)*0.7), grain:[[3,1],[3,4]] },
        { key:"backLining", name:{en:"Back Lining",ar:"بطانة الظهر"}, desc:{en:"Full back body lining.",ar:"بطانة كاملة للظهر."}, outline:jb.back, grain:[[3,8],[3,len*0.6]] },
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
        { key:"front", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Front panel with a zip closure edge.",ar:"مقدمة بحافة إغلاق سحاب."}, outline:jb.front, grain:[[3,7],[3,len*0.6]] },
        { key:"back", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Back panel gathered to the waistband.",ar:"لوحة خلفية مجمّعة عند حزام الخصر."}, outline:jb.back, grain:[[3,7],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.4]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.4]] },
        { key:"collarBand", name:{en:"Rib Collar Band",ar:"شريط ياقة ريب"}, desc:{en:"Stretch ribbed collar band.",ar:"شريط ياقة مطاطي من الريب."}, outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff at the sleeve hem.",ar:"أسورة ريب عند نهاية الكم."}, outline:cuffPc(q(m.bicep)*0.8), grain:[[3,1],[3,4]] },
        { key:"waistband", name:{en:"Rib Waistband",ar:"حزام خصر ريب"}, desc:{en:"Ribbed waistband cinching the hem.",ar:"حزام خصر من الريب يجمع الحاشية."}, outline:waistbandPc(q(m.waist)*0.9, 7), grain:[[6,2],[6,5]] },
        { key:"placket", name:{en:"Zip Placket Facing",ar:"بطانة فتحة السحاب"}, desc:{en:"Facing strip behind the zip.",ar:"شريط بطانة خلف السحاب."}, outline:lapelFacing(m.neck*0.5, len*0.4), grain:[[2,3],[2,len*0.25]] },
        { key:"pocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Zippered chest pocket panel.",ar:"لوحة جيب صدر بسحاب."}, outline:pocketPc(9,3.5), grain:[[4,1],[4,2.5]] },
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
        { key:"frontL", name:{en:"Front Left",ar:"المقدمة اليسرى"}, desc:{en:"Left front with the asymmetric closure curve.",ar:"مقدمة يسرى بمنحنى إغلاق غير متماثل."}, outline:wrapPanel(qc, qw, len, "L"), grain:[[3,8],[3,len*0.6]] },
        { key:"frontR", name:{en:"Front Right",ar:"المقدمة اليمنى"}, desc:{en:"Right front underlapping the closure.",ar:"مقدمة يمنى تحت الإغلاق."}, outline:wrapPanel(qc, qw, len, "R"), grain:[[-3,8],[-3,len*0.6]] },
        { key:"back", name:{en:"Back Panel",ar:"لوحة الظهر"}, desc:{en:"Back panel to the hem.",ar:"لوحة ظهر حتى الحاشية."}, outline:jacketFrontBack(m, len, {hemFlareF:1.05}).back, grain:[[3,8],[3,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer sleeve panel.",ar:"اللوحة الخارجية للكم."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner sleeve panel.",ar:"اللوحة الداخلية للكم."}, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Nehru Collar",ar:"ياقة نهرو"}, desc:{en:"Standing Nehru-style collar band.",ar:"ياقة واقفة بطراز نهرو."}, outline:cs.stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"godetL", name:{en:"Hem Godet Left",ar:"مروحة الحاشية اليسرى"}, desc:{en:"Flare insert at the hem.",ar:"إدراج مروحي عند الحاشية."}, outline:godetPc(q(m.hips)*0.28, len*0.3), grain:[[4,6],[4,len*0.18]] },
        { key:"godetR", name:{en:"Hem Godet Right",ar:"مروحة الحاشية اليمنى"}, desc:{en:"Flare insert at the hem.",ar:"إدراج مروحي عند الحاشية."}, outline:godetPc(q(m.hips)*0.28, len*0.3), grain:[[4,6],[4,len*0.18]] },
        { key:"pocket", name:{en:"Welt Pocket",ar:"جيب مطوي"}, desc:{en:"Curved welt pocket at the hip.",ar:"جيب مطوي منحنٍ عند الورك."}, outline:pocketPc(9,3.5), grain:[[4,1],[4,2.5]] },
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
        { key:"jacketFront", name:{en:"Jacket Front",ar:"مقدمة الجاكيت"}, desc:{en:"Tailored suit jacket front.",ar:"مقدمة جاكيت البدلة المفصّلة."}, outline:jb.front, grain:[[3,8],[3,jLen*0.6]] },
        { key:"jacketBack", name:{en:"Jacket Back",ar:"خلفية الجاكيت"}, desc:{en:"Tailored suit jacket back.",ar:"خلفية جاكيت البدلة المفصّلة."}, outline:jb.back, grain:[[3,8],[3,jLen*0.6]] },
        { key:"sleeveU", name:{en:"Jacket Sleeve Upper",ar:"الكم العلوي للجاكيت"}, desc:{en:"Outer jacket sleeve panel.",ar:"اللوحة الخارجية لكم الجاكيت."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Jacket Sleeve Under",ar:"الكم السفلي للجاكيت"}, desc:{en:"Inner jacket sleeve panel.",ar:"اللوحة الداخلية لكم الجاكيت."}, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"collar", name:{en:"Jacket Collar",ar:"ياقة الجاكيت"}, desc:{en:"Notch-ready jacket collar.",ar:"ياقة جاكيت جاهزة للفتحة."}, outline:shawlCollar(m.neck, 14), grain:[[3,3],[3,10]] },
        { key:"facing", name:{en:"Jacket Facing",ar:"بطانة الجاكيت"}, desc:{en:"Curved front facing.",ar:"بطانة أمامية منحنية."}, outline:lapelFacing(m.neck, jLen*0.5), grain:[[3,3],[3,jLen*0.3]] },
        { key:"vestFront", name:{en:"Vest Front",ar:"مقدمة الصدرية"}, desc:{en:"Fitted sleeveless vest front.",ar:"مقدمة صدرية ضيقة بلا أكمام."}, outline:vb.front, grain:[[2,6],[2,vLen*0.6]] },
        { key:"vestBack", name:{en:"Vest Back",ar:"خلفية الصدرية"}, desc:{en:"Vest back panel.",ar:"لوحة خلفية الصدرية."}, outline:vb.back, grain:[[2,6],[2,vLen*0.6]] },
        { key:"trouserFront", name:{en:"Trouser Front",ar:"مقدمة البنطلون"}, desc:{en:"Front leg panel with a curved crotch seam.",ar:"لوحة الساق الأمامية بخط تفصيل منحنٍ."}, outline:trouserPanel(qw, qh, m.thigh, m.inseam, true), grain:[[qw*0.3,8],[qw*0.3,m.inseam*0.6]] },
        { key:"trouserBack", name:{en:"Trouser Back",ar:"خلفية البنطلون"}, desc:{en:"Back leg panel with a curved seat curve.",ar:"لوحة الساق الخلفية بمنحنى مقعد."}, outline:trouserPanel(qw, qh, m.thigh, m.inseam, false), grain:[[qw*0.3,8],[qw*0.3,m.inseam*0.6]] },
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
        { key:"front", name:{en:"Parka Front",ar:"مقدمة المعطف"}, desc:{en:"Insulated front panel.",ar:"لوحة أمامية معزولة."}, outline:jb.front, grain:[[4,10],[4,len*0.6]] },
        { key:"back", name:{en:"Parka Back",ar:"خلفية المعطف"}, desc:{en:"Insulated back panel.",ar:"لوحة خلفية معزولة."}, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeve", name:{en:"Sleeve",ar:"الكم"}, desc:{en:"Roomy curved-cap sleeve.",ar:"كم واسع برأس منحنٍ."}, outline:sleeve1pc(m.bicep*1.15, m.sleeve, 1.05), grain:[[q(m.bicep)*0.5,4],[q(m.bicep)*0.5,m.sleeve*0.7]] },
        { key:"hoodL", name:{en:"Hood Left",ar:"القبعة اليسرى"}, desc:{en:"Left half of the two-piece hood.",ar:"النصف الأيسر من القبعة ذات القطعتين."}, outline:hoodHalf(m.neck*2.1, 30), grain:[[6,4],[6,20]] },
        { key:"hoodR", name:{en:"Hood Right",ar:"القبعة اليمنى"}, desc:{en:"Right half of the two-piece hood.",ar:"النصف الأيمن من القبعة ذات القطعتين."}, outline:hoodHalf(m.neck*2.1, 30), grain:[[6,4],[6,20]] },
        { key:"cuff", name:{en:"Rib Cuff",ar:"أسورة ريب"}, desc:{en:"Ribbed cuff sealing the sleeve hem.",ar:"أسورة ريب تُغلق نهاية الكم."}, outline:cuffPc(q(m.bicep)*0.85), grain:[[3,1],[3,4]] },
        { key:"waistband", name:{en:"Ribbed Hem Band",ar:"شريط حاشية من الريب"}, desc:{en:"Ribbed band sealing the coat hem.",ar:"شريط ريب يُغلق حاشية المعطف."}, outline:waistbandPc(q(m.waist)*0.95, 7), grain:[[6,2],[6,5]] },
        { key:"pocket", name:{en:"Chest Pocket",ar:"جيب الصدر"}, desc:{en:"Flapped chest pocket.",ar:"جيب صدر بغطاء."}, outline:pocketPc(10,4), grain:[[4,1],[4,3]] },
        { key:"backYoke", name:{en:"Back Yoke",ar:"كوة الظهر"}, desc:{en:"Curved shoulder yoke.",ar:"كوة كتف منحنية."}, outline:yokePc(q(m.shoulder)*1.2, 9), grain:[[5,2],[5,6]] },
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
        { key:"front", name:{en:"Coat Front",ar:"مقدمة المعطف"}, desc:{en:"Wide double-breasted overlap front.",ar:"مقدمة عريضة بتراكب صفين من الأزرار."}, outline:jb.front, grain:[[4,10],[4,len*0.6]] },
        { key:"back", name:{en:"Coat Back",ar:"خلفية المعطف"}, desc:{en:"Back panel with a center vent.",ar:"لوحة خلفية بفتحة وسطى."}, outline:jb.back, grain:[[4,10],[4,len*0.6]] },
        { key:"sleeveU", name:{en:"Sleeve Upper",ar:"الكم العلوي"}, desc:{en:"Outer coat sleeve panel.",ar:"اللوحة الخارجية لكم المعطف."}, outline:sl.upper, grain:[[q(m.bicep)*0.5,3],[q(m.bicep)*0.5,m.sleeve*0.5]] },
        { key:"sleeveD", name:{en:"Sleeve Under",ar:"الكم السفلي"}, desc:{en:"Inner coat sleeve panel.",ar:"اللوحة الداخلية لكم المعطف."}, outline:sl.under, grain:[[q(m.bicep)*0.3,3],[q(m.bicep)*0.3,m.sleeve*0.5]] },
        { key:"facing", name:{en:"Wide Lapel Facing",ar:"بطانة الصدر العريضة"}, desc:{en:"Wide curved lapel facing.",ar:"بطانة صدر عريضة منحنية."}, outline:lapelFacing(m.neck*1.1, len*0.5), grain:[[3,3],[3,len*0.3]] },
        { key:"collarStand", name:{en:"Collar Stand",ar:"قاعدة الياقة"}, desc:{en:"Standing collar band beneath the lapel.",ar:"شريط ياقة واقف أسفل الصدر."}, outline:collarStand(m.neck).stand, grain:[[3,1],[m.neck/2,1]] },
        { key:"flapPocket", name:{en:"Flap Pocket",ar:"جيب بغطاء"}, desc:{en:"Flap-covered hip pocket.",ar:"جيب ورك مغطى بغطاء."}, outline:pocketPc(11,4.5), grain:[[5,1],[5,3]] },
        { key:"backBelt", name:{en:"Half Belt",ar:"نصف حزام"}, desc:{en:"Decorative half-belt tab at the back waist.",ar:"شريط نصف حزام زخرفي عند خصر الظهر."}, outline:waistbandPc(q(m.waist)*0.5, 5), grain:[[6,1],[6,3]] },
      ];
    });

})();
