/* ============================================================
   Measurement standards, size grading engine & parametric
   pattern definitions. All measurements in centimetres.
   ============================================================ */

import { cosineSleeveOutline, hoistCurves, qBezToCubic } from "./pattern-builders.js";

function qBez(p0, c, p1, n = 6) {
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ]);
  }
  return pts;
}

export const SIZES = ["XXS","XS","S","M","L","XL","XXL","XXXL","XXXXL","5XL","6XL"];
// Grade step relative to M (index 3). Each step = one size.
export const SIZE_STEP = SIZES.reduce((o,s,i)=>(o[s]=i-3,o),{});

export const KIDS_AGES = [
  { id:"2-3",   label:{en:"2–3Y",  ar:"٢-٣ سنة"},  height:98 },
  { id:"4-5",   label:{en:"4–5Y",  ar:"٤-٥ سنة"},  height:110 },
  { id:"6-7",   label:{en:"6–7Y",  ar:"٦-٧ سنة"},  height:122 },
  { id:"8-9",   label:{en:"8–9Y",  ar:"٨-٩ سنة"},  height:134 },
  { id:"10-12", label:{en:"10–12Y",ar:"١٠-١٢ سنة"},height:150 },
  { id:"13-14", label:{en:"13–14Y",ar:"١٣-١٤ سنة"},height:162 },
  { id:"15-16", label:{en:"15–16Y",ar:"١٥-١٦ سنة"},height:170 },
];

/* Base body (size M / mid-age) per category. */
export const BASE = {
  women: { chest:88, waist:70, hips:96, shoulder:39, backLen:41, sleeve:58, neck:37, bicep:28, inseam:78, thigh:52, height:167 },
  men:   { chest:100,waist:86, hips:100,shoulder:46, backLen:45, sleeve:64, neck:40, bicep:33, inseam:82, thigh:55, height:178 },
  girls: { chest:68, waist:60, hips:72, shoulder:31, backLen:31, sleeve:44, neck:30, bicep:21, inseam:58, thigh:38, height:134 },
  boys:  { chest:70, waist:63, hips:73, shoulder:32, backLen:33, sleeve:46, neck:31, bicep:22, inseam:60, thigh:39, height:138 },
};

/* Per-size-step grade increments (cm) — proportion-perfect. */
export const GRADE = {
  chest:4, waist:4, hips:4, shoulder:1, backLen:1, sleeve:1.5, neck:0.8, bicep:1.2, inseam:2, thigh:1.4, height:4
};

/* Standard offsets — Egyptian & Gulf blocks run slightly different
   ease and rise vs. ASTM/ISO. Applied as small proportional shifts. */
export const STANDARDS = {
  intl:  { name:{en:"International (ASTM/ISO)",ar:"عالمي"}, chest:0, waist:0, hips:0, ease:1.00 },
  egypt: { name:{en:"Egyptian",ar:"مصري"},                 chest:1, waist:2, hips:1, ease:1.04 },
  saudi: { name:{en:"Saudi / Gulf",ar:"سعودي / خليجي"},    chest:2, waist:1, hips:2, ease:1.06 },
};

/* Compute a full measurement set for the given selection. */
export function computeMeasurements({ category, size, standard, kids, custom }) {
  const base = { ...BASE[category] };
  let step = SIZE_STEP[size] ?? 0;

  // Kids mode overrides the block by height ratio.
  if (kids) {
    const age = KIDS_AGES.find(a => a.id === kids) || KIDS_AGES[2];
    const ratio = age.height / base.height;
    for (const k in base) base[k] = +(base[k] * ratio).toFixed(1);
    base.height = age.height;
    step = 0;
  }

  const std = STANDARDS[standard] || STANDARDS.intl;
  const out = {};
  for (const k in base) {
    let v = base[k] + (GRADE[k] || 0) * step;
    if (std[k] != null) v += std[k];          // standard body offset
    if (["chest","waist","hips"].includes(k)) v *= std.ease; // ease factor
    out[k] = +v.toFixed(1);
  }
  // Manual custom overrides win.
  if (custom) for (const k in custom) if (custom[k] != null && custom[k] !== "") out[k] = +custom[k];
  return out;
}

/* ============================================================
   PARAMETRIC PATTERNS
   Each piece is a function(m) -> geometry in cm (drafting space).
   The canvas renderer scales & positions pieces automatically.
   ============================================================ */

// small helper — quarter measurements for front/back blocks
export const q = v => v / 4;

export const PATTERNS = {
  /* -------- WOMEN'S FITTED DRESS (multi-piece) -------- */
  womens_dress: {
    id: "womens_dress",
    category: "women",
    name: { en: "Fit & Flare Midi Dress", ar: "فستان ميدي متسع الخصر" },
    desc: { en: "Fit-and-flare midi dress with boat neck, 3/4 sleeves, and flared skirt.", ar: "فستان ميدي أنيق بخصر مجسم وفتحة قارب وأكمام ثلاثة أرباع وتنورة متسعة." },
    pieces: (m) => {
      const cF = q(m.chest) + 1.5, wF = q(m.waist) + 2, hF = q(m.hips) + 1.5;
      const bodLen = m.backLen;
      const skLen = 58;
      const neckW = +(q(m.neck) * 1.18).toFixed(2);
      const shX = Math.max(neckW + 2.5, +(m.shoulder / 2).toFixed(2));
      const armY = +(bodLen * 0.52).toFixed(2);
      const armCtrl = [+(shX - 1.2).toFixed(2), +(armY * 0.62).toFixed(2)];
      const sideCtrl = [+(cF - 0.5).toFixed(2), +(armY + (bodLen - armY) * 0.55).toFixed(2)];
      const sleeve34Len = Math.round(m.sleeve * 0.72);
      const slvW = q(m.bicep) * 2;
      const slvOutline = cosineSleeveOutline({ width: slvW, sleeveLen: sleeve34Len, capHeight: 6, cuffWidth: slvW - 2, frontHollow: true });

      const frontNeck = [[0, 3.0], [neckW * 0.58, 3.0], [neckW, 0]];
      const backNeck = [[0, 1.4], [neckW * 0.55, 1.4], [neckW, 0]];
      const armSeg = [[shX, 1.8], armCtrl, [cF, armY]];
      const sideSeg = [[cF, armY], sideCtrl, [wF + 1, bodLen]];

      const frontBodiceOut = [
        frontNeck[0], ...qBez(...frontNeck, 5),
        armSeg[0], ...qBez(...armSeg, 6),
        ...qBez(...sideSeg, 4),
        [0, bodLen],
      ];
      const backBodiceOut = [
        backNeck[0], ...qBez(...backNeck, 5),
        armSeg[0], ...qBez(...armSeg, 6),
        ...qBez(...sideSeg, 4),
        [0, bodLen],
      ];

      const skHemX = +(hF + 14).toFixed(2);
      const skWaistF = [[0, 0.8], [(wF + 1) * 0.55, 0.8], [wF + 1, 0]];
      const skWaistB = [[0, 0.4], [(wF + 1) * 0.55, 0.4], [wF + 1, 0]];
      const skSide = [[wF + 1, 0], [+(hF + 2.5).toFixed(2), +(skLen * 0.42).toFixed(2)], [skHemX, skLen - 1.6]];
      const skHem = [[skHemX, skLen - 1.6], [+(skHemX * 0.55).toFixed(2), skLen + 0.4], [0, skLen]];

      const skirtFrontOut = [skWaistF[0], ...qBez(...skWaistF, 5), ...qBez(...skSide, 6), ...qBez(...skHem, 5)];
      const skirtBackOut = [skWaistB[0], ...qBez(...skWaistB, 5), ...qBez(...skSide, 6), ...qBez(...skHem, 5)];

      return hoistCurves([
        {
          key:"front_bodice",
          name:{en:"Front Bodice",ar:"قصة أمامية"},
          desc:{en:"Contoured front bodice ending at the natural waist.",ar:"صدرية أمامية مجسمة تنتهي عند خط الخصر الطبيعي."},
          outline:frontBodiceOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...frontNeck) },
            { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
            { fromIdx: 12, toIdx: 16, ...qBezToCubic(...sideSeg) },
          ],
          darts:[[[wF*0.5,bodLen-9],[wF*0.5-1.6,bodLen],[wF*0.5+1.6,bodLen]]],
          notches:[[shX,1.8],[cF,armY],[wF+1,bodLen]],
          grain:[[wF*0.25,8],[wF*0.25,bodLen-6]],
          role:"bodice-front-center", cutOnFold:true,
          chestEdgeIndices:[12],
        },
        {
          key:"back_bodice",
          name:{en:"Back Bodice",ar:"قصة خلفية"},
          desc:{en:"Tailored back bodice matching front shoulder, armhole, and waist.",ar:"صدرية خلفية مطابقة لخط الكتف وحردة الكم والخصر."},
          outline:backBodiceOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...backNeck) },
            { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
            { fromIdx: 12, toIdx: 16, ...qBezToCubic(...sideSeg) },
          ],
          darts:[[[wF*0.5,bodLen-11],[wF*0.5-1.6,bodLen],[wF*0.5+1.6,bodLen]]],
          notches:[[shX,1.8],[cF,armY],[wF+1,bodLen]],
          grain:[[wF*0.25,8],[wF*0.25,bodLen-6]],
          role:"bodice-back-center", cutOnFold:true,
          chestEdgeIndices:[12],
        },
        {
          key:"sleeve",
          name:{en:"3/4 Sleeve",ar:"كم ثلاثة أرباع"},
          desc:{en:"Fitted 3/4 sleeve ending below the elbow.",ar:"كم ضيق ثلاثة أرباع ينتهي أسفل الكوع."},
          outline:slvOutline,
          notches:[slvOutline[slvOutline.frontNotchIdx], slvOutline[slvOutline.crownIdx], slvOutline[slvOutline.backNotchIdx1], slvOutline[slvOutline.backNotchIdx2]],
          grain:[[q(m.bicep),4],[q(m.bicep),sleeve34Len-4]],
          role:"sleeve", bilateral:true,
        },
        {
          key:"skirt_front",
          name:{en:"Front Skirt Panel",ar:"بنل التنورة الأمامي"},
          desc:{en:"Flared midi front skirt panel cut on the fold.",ar:"لوحة أمامية متسعة لتنورة الميدي تُقص على الطية."},
          outline:skirtFrontOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...skWaistF) },
            { fromIdx: 5, toIdx: 11, ...qBezToCubic(...skSide) },
            { fromIdx: 11, toIdx: 16, ...qBezToCubic(...skHem) },
          ],
          notches:[[wF+1,0], skirtFrontOut[8]],
          grain:[[wF*0.35,6],[wF*0.35,skLen-6]],
          role:"hip-panel-front", cutOnFold:true,
        },
        {
          key:"skirt_back",
          name:{en:"Back Skirt Panel",ar:"بنل التنورة الخلفي"},
          desc:{en:"Flared midi back skirt panel cut on the fold.",ar:"لوحة خلفية متسعة لتنورة الميدي تُقص على الطية."},
          outline:skirtBackOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...skWaistB) },
            { fromIdx: 5, toIdx: 11, ...qBezToCubic(...skSide) },
            { fromIdx: 11, toIdx: 16, ...qBezToCubic(...skHem) },
          ],
          notches:[[wF+1,0], skirtBackOut[8]],
          grain:[[wF*0.35,6],[wF*0.35,skLen-6]],
          role:"hip-panel-back", cutOnFold:true,
        },
      ]);
    }
  },

  /* -------- MEN'S CLASSIC SHIRT -------- */
  mens_shirt: {
    id: "mens_shirt",
    category: "men",
    name: { en: "Men's Classic Shirt", ar: "قميص رجالي كلاسيكي" },
    desc: { en: "Tailored button-down dress shirt with spread collar and cuffs.", ar: "قميص رجالي مفصّل بأزرار وياقة ممتدة وأساور أزرار." },
    pieces: (m) => {
      const cF = q(m.chest) + 3, len = m.backLen + 32;
      const neckW = +(q(m.neck) * 1.12).toFixed(2);
      const shX = Math.max(neckW + 3, +(m.shoulder / 2 + 0.8).toFixed(2));
      const armY = +(m.backLen * 0.52).toFixed(2);
      const armCtrl = [+(shX - 1.2).toFixed(2), +(armY * 0.64).toFixed(2)];
      const sideSeg = [[cF, armY], [+(cF - 0.5).toFixed(2), m.backLen], [cF, len]];
      const slvW = q(m.bicep) * 2 + 4, slvLen = m.sleeve - 6;
      const slvOutline = cosineSleeveOutline({ width: slvW, sleeveLen: slvLen, capHeight: 7, cuffWidth: q(m.bicep) * 2, frontHollow: true });

      const fNeck = [[0, 3.4], [neckW * 0.58, 3.2], [neckW, 0]];
      const bNeck = [[0, 1.4], [neckW * 0.55, 1.4], [neckW, 0]];
      const armSeg = [[shX, 2.0], armCtrl, [cF, armY]];
      const frontOut = [fNeck[0], ...qBez(...fNeck, 5), armSeg[0], ...qBez(...armSeg, 6), ...qBez(...sideSeg, 6), [0, len]];
      const backOut = [bNeck[0], ...qBez(...bNeck, 5), armSeg[0], ...qBez(...armSeg, 6), ...qBez(...sideSeg, 6), [0, len]];

      const colW = +(m.neck / 2 + 3).toFixed(2);
      const colNeck = [[0, 0], [colW * 0.5, 1.0], [colW, 0]];
      const colTop = [[colW + 0.8, 7.2], [colW * 0.55, 8.2], [0, 8]];
      const collarOut = [colNeck[0], ...qBez(...colNeck, 6), colTop[0], ...qBez(...colTop, 6)];

      return hoistCurves([
        { key:"front", name:{en:"Shirt Front",ar:"مقدمة القميص"},
          desc:{en:"Front with tailored armhole and curved shirt side.",ar:"المقدمة مع حردة كم وتجسيم جانبي."},
          outline:frontOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...fNeck) },
            { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
            { fromIdx: 12, toIdx: 18, ...qBezToCubic(...sideSeg) },
          ],
          notches:[[shX, 2.0], [cF, armY], frontOut[15]], grain:[[3,8],[3,len-8]],
          role:"bodice-front-center", cutOnFold:true, chestEdgeIndices:[12] },
        { key:"back", name:{en:"Shirt Back with Yoke",ar:"ظهر القميص مع الكوة"},
          desc:{en:"Back panel joined to shoulder yoke and tailored sides.",ar:"الظهر متصل بالكتف والجوانب المفصّلة."},
          outline:backOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...bNeck) },
            { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
            { fromIdx: 12, toIdx: 18, ...qBezToCubic(...sideSeg) },
          ],
          grain:[[3,8],[3,len-8]],
          notches:[[shX, 2.0], [cF, armY], backOut[15]],
          role:"bodice-back-center", cutOnFold:true, chestEdgeIndices:[12] },
        { key:"sleeve", name:{en:"Shirt Sleeve",ar:"كم القميص"},
          desc:{en:"Full sleeve with placket for the cuff.",ar:"كم كامل مع فتحة للأساور."},
          outline:slvOutline,
          notches:[slvOutline[slvOutline.frontNotchIdx], slvOutline[slvOutline.crownIdx], slvOutline[slvOutline.backNotchIdx1], slvOutline[slvOutline.backNotchIdx2]],
          grain:[[q(m.bicep)+2,4],[q(m.bicep)+2,slvLen-4]],
          role:"sleeve", bilateral:true },
        { key:"collar", name:{en:"Collar & Stand",ar:"الياقة والقاعدة"},
          desc:{en:"Two-piece contoured collar with band.",ar:"ياقة من قطعتين مع القاعدة المنحنية."},
          outline:collarOut,
          curves:[
            { fromIdx: 0, toIdx: 6, ...qBezToCubic(...colNeck) },
            { fromIdx: 7, toIdx: 13, ...qBezToCubic(...colTop) },
          ],
          notches:[collarOut[3]],
          grain:[[2,2],[colW*0.8,2]],
          role:"collar" },
        { key:"cuff", name:{en:"Cuff",ar:"الأساور"},
          desc:{en:"Buttoned wrist cuff.",ar:"أساور المعصم بالأزرار."},
          outline:[[0,0],[m.neck/2+6,0],[m.neck/2+6,7],[0,7]],
          notches:[[(m.neck/2+6)*0.5,0]],
          grain:[[2,2],[m.neck/2,2]],
          role:"cuff" },
      ]);
    }
  },

  /* -------- WOMEN'S ABAYA -------- */
  abaya: {
    id:"abaya", category:"women",
    name:{en:"Classic Abaya",ar:"عباية كلاسيكية"},
    desc:{en:"Flowing open-front abaya block with bishop sleeves.",ar:"بلوك عباية مفتوحة انسيابية بأكمام واسعة."},
    pieces:(m)=>{
      const w=q(m.chest)+10, len=m.height-18;
      const neckW = +(q(m.neck) * 1.16).toFixed(2);
      const shX = Math.max(neckW + 4, +(m.shoulder / 2 + 1.2).toFixed(2));
      const armY = +(m.backLen * 0.56).toFixed(2);
      const armSeg = [[shX, 2.8], [+(w - 1).toFixed(2), +(armY * 0.65).toFixed(2)], [w, armY]];
      const sideSeg = [[w, armY], [+(w + 5.5).toFixed(2), +(len * 0.60).toFixed(2)], [w + 14, len]];
      const fNeck = [[0, 7.0], [+(neckW * 0.6).toFixed(2), 4.8], [neckW, 0]];
      const bNeck = [[0, 1.5], [+(neckW * 0.55).toFixed(2), 1.5], [neckW, 0]];
      const frontOut = [fNeck[0], ...qBez(...fNeck, 5), armSeg[0], ...qBez(...armSeg, 6), ...qBez(...sideSeg, 6), [-2, len]];
      const backOut = [bNeck[0], ...qBez(...bNeck, 5), armSeg[0], ...qBez(...armSeg, 6), ...qBez(...sideSeg, 6), [0, len]];
      const slvW = q(m.bicep) * 2 + 16;
      const slvOutline = cosineSleeveOutline({ width: slvW, sleeveLen: m.sleeve, capHeight: 8, cuffWidth: slvW + 8, frontHollow: false });
      return hoistCurves([
        { key:"front", name:{en:"Abaya Front",ar:"مقدمة العباية"},
          desc:{en:"Open front panel with draped fall.",ar:"بنل أمامي مفتوح بانسدال."},
          outline:frontOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...fNeck) },
            { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
            { fromIdx: 12, toIdx: 18, ...qBezToCubic(...sideSeg) },
          ],
          notches:[[shX, 2.8], [w, armY], frontOut[15]],
          grain:[[6,8],[6,len-8]],
          role:"front-panel" },
        { key:"back", name:{en:"Abaya Back",ar:"ظهر العباية"},
          desc:{en:"Full back on the fold.",ar:"ظهر كامل على الطية."},
          outline:backOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...bNeck) },
            { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
            { fromIdx: 12, toIdx: 18, ...qBezToCubic(...sideSeg) },
          ],
          notches:[[shX, 2.8], [w, armY], backOut[15]],
          grain:[[4,8],[4,len-8]],
          role:"back-panel", cutOnFold:true, chestEdgeIndices:[12] },
        { key:"sleeve", name:{en:"Bishop Sleeve",ar:"كم واسع بأساور"},
          desc:{en:"Loose flared bishop sleeve with wrist gathering.",ar:"كم واسع منسدل مع كشكشة عند المعصم."},
          outline:slvOutline,
          notches:[slvOutline[slvOutline.frontNotchIdx], slvOutline[slvOutline.crownIdx], slvOutline[slvOutline.backNotchIdx1]],
          grain:[[q(m.bicep)+8,4],[q(m.bicep)+8,m.sleeve-4]],
          role:"sleeve", bilateral:true },
      ]);
    }
  },

  /* -------- MEN'S THOBE -------- */
  thobe: {
    id:"thobe", category:"men",
    name:{en:"Men's Classic Thobe",ar:"ثوب رجالي كلاسيكي"},
    desc:{en:"Traditional Gulf thobe with stand collar, chest placket, and patch pockets.",ar:"ثوب خليجي تقليدي بياقة قائمة وحاشية صدر وجيوب رقعة."},
    pieces:(m)=>{
      const w=q(m.chest)+6, len=m.height-16;
      const neckW = +(q(m.neck) * 1.10).toFixed(2);
      const shX = Math.max(neckW + 2.5, +(m.shoulder / 2 + 0.5).toFixed(2));
      const armY = +(m.backLen * 0.54).toFixed(2);
      const armSeg = [[shX, 2.0], [+(w - 0.8).toFixed(2), +(armY * 0.65).toFixed(2)], [w, armY]];
      const sideSeg = [[w, armY], [+(w + 3.5).toFixed(2), +(len * 0.60).toFixed(2)], [w + 8, len]];
      const fNeck = [[0, 3.2], [+(neckW * 0.56).toFixed(2), 3.0], [neckW, 0]];
      const bNeck = [[0, 1.4], [+(neckW * 0.54).toFixed(2), 1.4], [neckW, 0]];
      const frontOut = [fNeck[0], ...qBez(...fNeck, 5), armSeg[0], ...qBez(...armSeg, 6), ...qBez(...sideSeg, 6), [0, len]];
      const backOut = [bNeck[0], ...qBez(...bNeck, 5), armSeg[0], ...qBez(...armSeg, 6), ...qBez(...sideSeg, 6), [0, len]];
      const slvW = q(m.bicep) * 2 + 8, slvLen = m.sleeve + 4;
      const slvOutline = cosineSleeveOutline({ width: slvW, sleeveLen: slvLen, capHeight: 6.5, cuffWidth: slvW - 4, frontHollow: true });
      return hoistCurves([
        { key:"front", name:{en:"Thobe Front",ar:"مقدمة الثوب"},
          desc:{en:"Front with placket and pocket.",ar:"المقدمة مع الحاشية والجيب."},
          outline:frontOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...fNeck) },
            { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
            { fromIdx: 12, toIdx: 18, ...qBezToCubic(...sideSeg) },
          ],
          grain:[[4,8],[4,len-8]],
          notches:[[shX, 2.0], [w, armY], frontOut[15]],
          role:"bodice-front-center", cutOnFold:true, chestEdgeIndices:[12] },
        { key:"back", name:{en:"Thobe Back",ar:"ظهر الثوب"},
          desc:{en:"Back on the fold.",ar:"الظهر على الطية."},
          outline:backOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...bNeck) },
            { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
            { fromIdx: 12, toIdx: 18, ...qBezToCubic(...sideSeg) },
          ],
          grain:[[4,8],[4,len-8]],
          notches:[[shX, 2.0], [w, armY], backOut[15]],
          role:"bodice-back-center", cutOnFold:true, chestEdgeIndices:[12] },
        { key:"sleeve", name:{en:"Thobe Sleeve",ar:"كم الثوب"},
          desc:{en:"Long straight sleeve.",ar:"كم طويل مستقيم."},
          outline:slvOutline,
          notches:[slvOutline[slvOutline.frontNotchIdx], slvOutline[slvOutline.crownIdx], slvOutline[slvOutline.backNotchIdx1], slvOutline[slvOutline.backNotchIdx2]],
          grain:[[q(m.bicep)+4,4],[q(m.bicep)+4,m.sleeve]],
          role:"sleeve", bilateral:true },
        { key:"gusset", name:{en:"Underarm Gusset",ar:"دكة تحت الإبط"},
          desc:{en:"Diamond gusset for ease of movement.",ar:"دكة ماسية لسهولة الحركة."},
          outline:[[6,0],[12,10],[6,20],[0,10]],
          notches:[[6,0]],
          grain:[[6,3],[6,17]],
          role:"other" },
      ]);
    }
  },

  /* -------- KIDS DRESS (girls) -------- */
  girls_dress: {
    id:"girls_dress", category:"girls",
    name:{en:"Girls' Party Dress",ar:"فستان بناتي للحفلات"},
    desc:{en:"Gathered-skirt girls party dress with short puff sleeves.",ar:"فستان بناتي للحفلات بتنورة مكشكشة وأكمام قصيرة منفوشة."},
    pieces:(m)=>{
      const cF=q(m.chest)+1.5, bod=m.backLen;
      const neckW = +(q(m.neck) * 1.14).toFixed(2);
      const shX = Math.max(neckW + 2, +(m.shoulder / 2).toFixed(2));
      const armY = +(bod * 0.52).toFixed(2);
      const armSeg = [[shX, 1.4], [+(shX - 0.8).toFixed(2), +(armY * 0.62).toFixed(2)], [cF, armY]];
      const fNeck = [[0, 2.8], [+(neckW * 0.55).toFixed(2), 2.6], [neckW, 0]];
      const bNeck = [[0, 1.2], [+(neckW * 0.55).toFixed(2), 1.2], [neckW, 0]];
      const bodFrontOut = [fNeck[0], ...qBez(...fNeck, 5), armSeg[0], ...qBez(...armSeg, 6), [cF, bod], [0, bod]];
      const bodBackOut = [bNeck[0], ...qBez(...bNeck, 5), armSeg[0], ...qBez(...armSeg, 6), [cF, bod], [0, bod]];

      const skW = +(m.waist * 1.6).toFixed(2), skH = +(m.inseam * 0.55).toFixed(2);
      const skHem = [[skW, skH], [+(skW * 0.5).toFixed(2), +(skH + 0.5).toFixed(2)], [0, skH]];
      const skOut = [[0, 0], [skW, 0], skHem[0], ...qBez(...skHem, 5)];

      const slvW = q(m.bicep) * 2 + 6, slvLen = 18;
      const slvOutline = cosineSleeveOutline({ width: slvW, sleeveLen: slvLen, capHeight: 5.5, cuffWidth: q(m.bicep) * 2, frontHollow: false });
      return hoistCurves([
        { key:"bodice_front", name:{en:"Bodice Front",ar:"صدرية أمامية"},
          desc:{en:"Fitted front bodice with scooped neck and armhole.",ar:"صدرية أمامية مجسمة بفتحة رقبة وحردة كم منحنية."},
          outline:bodFrontOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...fNeck) },
            { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
          ],
          grain:[[cF*0.35,4],[cF*0.35,bod-4]],
          notches:[[shX, 1.4], [cF, armY], [cF, bod]],
          role:"bodice-front-center", cutOnFold:true, chestEdgeIndices:[12] },
        { key:"bodice_back", name:{en:"Bodice Back",ar:"صدرية خلفية"},
          desc:{en:"Back bodice matching front shoulder, armhole, and waist.",ar:"صدرية خلفية مطابقة للكتف وحردة الكم والخصر."},
          outline:bodBackOut,
          curves:[
            { fromIdx: 0, toIdx: 5, ...qBezToCubic(...bNeck) },
            { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
          ],
          grain:[[cF*0.35,4],[cF*0.35,bod-4]],
          notches:[[shX, 1.4], [cF, armY], [cF, bod]],
          role:"bodice-back-center", cutOnFold:true, chestEdgeIndices:[12] },
        { key:"skirt", name:{en:"Gathered Skirt",ar:"تنورة مكشكشة"},
          desc:{en:"Full rectangle skirt with shaped sweep, gathered to waist.",ar:"تنورة كاملة بحاشية منحنية تُكشكش عند الوسط."},
          outline:skOut,
          curves:[{ fromIdx: 2, toIdx: 7, ...qBezToCubic(...skHem) }],
          notches:[[skW*0.5,0]],
          grain:[[8,4],[8,skH*0.9]],
          role:"hip-panel-front" },
        { key:"sleeve", name:{en:"Puff Sleeve",ar:"كم منفوش"},
          desc:{en:"Short gathered puff sleeve.",ar:"كم قصير منفوش."},
          outline:slvOutline,
          notches:[slvOutline[slvOutline.frontNotchIdx], slvOutline[slvOutline.crownIdx], slvOutline[slvOutline.backNotchIdx1]],
          grain:[[q(m.bicep)+3,3],[q(m.bicep)+3,15]],
          role:"puff-sleeve", bilateral:true },
      ]);
    }
  },

  /* -------- BOYS TROUSERS -------- */
  boys_trousers: {
    id:"boys_trousers", category:"boys",
    name:{en:"Boys' Chino Trousers",ar:"بنطلون تشينو ولادي"},
    desc:{en:"Straight-leg khaki chino trousers with waistband.",ar:"بنطلون كلاسيكي مستقيم من خامة الكاكي بحزام خصر."},
    pieces:(m)=>{
      const w=q(m.hips)+2, hemY = m.inseam + 18;
      const fHip = [[w, 0], [w + 2.4, 8], [w + 1.5, 16]];
      const fIns = [[2, hemY], [1.2, 24], [-2, 10]];
      const fRise = [[-2, 10], [-0.2, 6.2], [0, 0]];
      const frontOut = [[0, 0], fHip[0], ...qBez(...fHip, 5), [w, hemY], fIns[0], ...qBez(...fIns, 5), ...qBez(...fRise, 4).slice(0, 3)];

      const bHip = [[w + 3, 0], [w + 5.5, 8], [w + 4.5, 16]];
      const bIns = [[2, hemY], [0.8, 25], [-4, 12]];
      const bRise = [[-4, 12], [-0.3, 7.2], [0, 0]];
      const backOut = [[0, 0], bHip[0], ...qBez(...bHip, 5), [w + 2, hemY], bIns[0], ...qBez(...bIns, 5), ...qBez(...bRise, 4).slice(0, 3)];

      return hoistCurves([
        { key:"front_leg", name:{en:"Front Leg",ar:"الساق الأمامية"},
          desc:{en:"Front trouser leg with contoured hip, inseam, and fly rise.",ar:"الساق الأمامية بتشكيل الورك والساق وحجر البنطلون."},
          outline:frontOut,
          curves:[
            { fromIdx: 1, toIdx: 6, ...qBezToCubic(...fHip) },
            { fromIdx: 8, toIdx: 13, ...qBezToCubic(...fIns) },
            { fromIdx: 13, toIdx: 0, ...qBezToCubic(...fRise) },
          ],
          notches:[[w + 1.5, 16]],
          grain:[[w/2,6],[w/2,m.inseam+12]],
          role:"trouser-front", bilateral:true,
          edges:[{fromIdx:1,toIdx:7,seamId:"boysTrouserOutseam",reverse:false},{fromIdx:8,toIdx:13,seamId:"boysTrouserInseam",reverse:false},{fromIdx:13,toIdx:0,mirrorSelf:true}] },
        { key:"back_leg", name:{en:"Back Leg",ar:"الساق الخلفية"},
          desc:{en:"Back leg with contoured seat and outseam shaping.",ar:"الساق الخلفية مع تشكيل المقعد والخط الجانبي."},
          outline:backOut,
          curves:[
            { fromIdx: 1, toIdx: 6, ...qBezToCubic(...bHip) },
            { fromIdx: 8, toIdx: 13, ...qBezToCubic(...bIns) },
            { fromIdx: 13, toIdx: 0, ...qBezToCubic(...bRise) },
          ],
          notches:[[w + 4.5, 16]],
          grain:[[w/2,6],[w/2,m.inseam+12]],
          role:"trouser-back", bilateral:true,
          edges:[{fromIdx:1,toIdx:7,seamId:"boysTrouserOutseam",reverse:false},{fromIdx:8,toIdx:13,seamId:"boysTrouserInseam",reverse:false},{fromIdx:13,toIdx:0,mirrorSelf:true}] },
        { key:"waistband", name:{en:"Waistband",ar:"الحزام"},
          desc:{en:"Elastic waistband strip.",ar:"شريط حزام بأستك."},
          outline:[[0,0],[m.waist+4,0],[m.waist+4,7],[0,7]],
          notches:[[(m.waist+4)*0.5,0]],
          grain:[[3,2],[m.waist,2]],
          role:"waistband" },
      ]);
    }
  },
};

/* Library card list (order + tags for filtering). */
export const LIBRARY = [
  { id:"womens_dress", cat:"women",  tag:{en:"Dress",ar:"فستان"},   type:"dress" },
  { id:"abaya",        cat:"women",  tag:{en:"Abaya",ar:"عباية"},   type:"robe" },
  { id:"mens_shirt",   cat:"men",    tag:{en:"Shirt",ar:"قميص"},    type:"shirt" },
  { id:"thobe",        cat:"men",    tag:{en:"Thobe",ar:"ثوب"},     type:"robe" },
  { id:"girls_dress",  cat:"girls",  tag:{en:"Dress",ar:"فستان"},   type:"dress" },
  { id:"boys_trousers",cat:"boys",   tag:{en:"Trousers",ar:"بنطلون"},type:"trousers" },
];

// TEMP compat aliases for one release — see BerryStudio-Upgrade-Plan WP-0.1.
// Guarded: these modules also load under plain Node (node --test), where
// there is no `window`.
if (typeof window !== 'undefined') {
  window.SIZES = SIZES; window.SIZE_STEP = SIZE_STEP; window.KIDS_AGES = KIDS_AGES;
  window.BASE = BASE; window.GRADE = GRADE; window.STANDARDS = STANDARDS;
  window.computeMeasurements = computeMeasurements; window.q = q;
  window.PATTERNS = PATTERNS; window.LIBRARY = LIBRARY;
}
