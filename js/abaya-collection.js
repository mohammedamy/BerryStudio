/* ============================================================
   Embroidered Modest & Hijab Women's Abayas Collection (wa01–wa20)
   20 Couture Gradable Abaya Patterns extending PATTERNS & LIBRARY.
   Pure ES module — zero DOM / window / Three.js dependencies.
   ============================================================ */

import { q, PATTERNS, LIBRARY } from './data.js';
import {
  qBez,
  qBezToCubic,
  cosineSleeveOutline,
  withCurves,
  hoistCurves,
  bandPc,
  collarStand,
  pointedCollar,
  pocketPatch,
} from './pattern-builders.js';

(() => {
  const ABAYA_TAG = { en: 'Embroidered Abaya', ar: 'عباية مطرزة' };

  function abayaBodicePair(m, o) {
    const neckW = +(q(m.neck) * (o.neckWF || 1.15)).toFixed(2);
    const fNeckD = +(o.fNeckD || 7.2);
    const bNeckD = +(o.bNeckD || 1.8);
    const shX = Math.max(neckW + 3.8, +(m.shoulder / 2 + (o.dropSh || 1.6)).toFixed(2));
    const shY = +(o.shY || 3.4);
    const chestW = +(q(m.chest) + (o.chestEase || 9.0)).toFixed(2);
    const armY = +(m.backLen * (o.armFrac || 0.56)).toFixed(2);
    const len = o.bodiceOnly
      ? +(m.backLen + (o.waistDrop || 12)).toFixed(2)
      : Math.max(armY + 45, +(m.height * (o.lenFrac || 0.89) - (o.lenSub || 0)).toFixed(2));
    const hemW = +(chestW + (o.hemFlare || 14)).toFixed(2);
    const waistW = +(chestW + (hemW - chestW) * (o.waistCurveF || 0.44)).toFixed(2);
    const waistY = +(armY + (len - armY) * 0.56).toFixed(2);

    const fNeck = [[0, fNeckD], [+(neckW * 0.60).toFixed(2), +(fNeckD * 0.68).toFixed(2)], [neckW, 0]];
    const bNeck = [[0, bNeckD], [+(neckW * 0.56).toFixed(2), +(bNeckD * 0.90).toFixed(2)], [neckW, 0]];
    const armSeg = [
      [shX, shY],
      [+(shX + (chestW - shX) * 0.68).toFixed(2), +(armY * 0.64).toFixed(2)],
      [chestW, armY],
    ];
    const sideSeg = [[chestW, armY], [waistW, waistY], [hemW, len]];

    const cfEndX = o.isOpen ? -(o.cfLap || 1.6) : 0;
    const frontOut = [
      fNeck[0],
      ...qBez(...fNeck, 5),
      armSeg[0],
      ...qBez(...armSeg, 6),
      ...qBez(...sideSeg, 6),
      [cfEndX, len],
    ];
    const backOut = [
      bNeck[0],
      ...qBez(...bNeck, 5),
      armSeg[0],
      ...qBez(...armSeg, 6),
      ...qBez(...sideSeg, 6),
      [0, len],
    ];

    const frontCurves = [
      { fromIdx: 0, toIdx: 5, ...qBezToCubic(...fNeck) },
      { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
      { fromIdx: 12, toIdx: 18, ...qBezToCubic(...sideSeg) },
    ];
    const backCurves = [
      { fromIdx: 0, toIdx: 5, ...qBezToCubic(...bNeck) },
      { fromIdx: 6, toIdx: 12, ...qBezToCubic(...armSeg) },
      { fromIdx: 12, toIdx: 18, ...qBezToCubic(...sideSeg) },
    ];

    const front = {
      key: 'front',
      name: o.frontName || { en: 'Abaya Front', ar: 'مقدمة العباية' },
      desc: o.frontDesc || (o.isOpen
        ? { en: 'Open front embroidered panel with fluid drape.', ar: 'لوحة أمامية مفتوحة مطرزة بانسدال انسيابي.' }
        : { en: 'Closed front panel cut on the fold with embroidered motif.', ar: 'لوحة أمامية مغلقة تُقص على الطية مع تطريز متقن.' }),
      outline: withCurves(frontOut, frontCurves),
      notches: [armSeg[0], [chestW, armY], frontOut[15]],
      grain: [[6, Math.min(10, armY * 0.4)], [6, len - 8]],
      role: 'front-panel',
      ...(o.isOpen ? {} : { cutOnFold: true, chestEdgeIndices: [12] }),
    };

    const back = {
      key: 'back',
      name: o.backName || { en: 'Abaya Back', ar: 'ظهر العباية' },
      desc: o.backDesc || { en: 'Full back panel cut on the fold.', ar: 'لوحة ظهر كاملة تُقص على الطية.' },
      outline: withCurves(backOut, backCurves),
      notches: [armSeg[0], [chestW, armY], backOut[15]],
      grain: [[4, Math.min(10, armY * 0.4)], [4, len - 8]],
      role: 'back-panel',
      cutOnFold: true,
      chestEdgeIndices: [12],
    };

    const slvW = +(q(m.bicep) * 2 + (o.slvEase || 14)).toFixed(2);
    const slvLen = +(m.sleeve * (o.slvLenF || 0.98) + (o.slvLenAdd || 0)).toFixed(2);
    const capH = +(o.capH || Math.max(5.5, slvW * 0.16)).toFixed(2);
    const bodySlvLen = Math.max(28, +(slvLen - capH * 0.35).toFixed(2));
    const cuffW = +(slvW * (o.cuffWF || 1.0) + (o.cuffAdd || 0)).toFixed(2);
    const slvOut = cosineSleeveOutline({
      width: slvW,
      sleeveLen: bodySlvLen,
      capHeight: capH,
      cuffWidth: cuffW,
      frontHollow: o.frontHollow !== false,
      cuffLeftDrop: o.cuffDrop || 0,
    });

    const sleeve = {
      key: 'sleeve',
      name: o.slvName || { en: 'Embroidered Sleeve', ar: 'كم مطرز' },
      desc: o.slvDesc || { en: 'Sculpted modest sleeve drafted for embroidered borders.', ar: 'كم محتشم مصمم بحواف مطرزة متناسقة.' },
      outline: slvOut,
      notches: [slvOut[slvOut.frontNotchIdx], slvOut[slvOut.crownIdx], slvOut[slvOut.backNotchIdx1]],
      grain: [[+(slvW * 0.5).toFixed(2), 2], [+(slvW * 0.5).toFixed(2), Math.max(12, +(bodySlvLen - 4).toFixed(2))]],
      role: o.slvRole || 'sleeve',
      bilateral: true,
    };

    return { front, back, sleeve, neckW, shX, chestW, len, slvW, slvLen, cuffW };
  }

  function curvedYokePc(halfW, depth) {
    const seg = [[halfW, +(depth * 0.62).toFixed(2)], [+(halfW * 0.5).toFixed(2), +(depth + 3.2).toFixed(2)], [0, +(depth * 0.62).toFixed(2)]];
    const pts = qBez(...seg, 6);
    const outline = [[0, 0], [halfW, 0], [halfW, +(depth * 0.62).toFixed(2)], ...pts];
    outline.notches = [[halfW, 0]];
    return withCurves(outline, [{ fromIdx: 2, toIdx: 8, ...qBezToCubic(...seg) }]);
  }

  function capeDrapePc(neckHalfW, len) {
    const seg1 = [[neckHalfW, 0], [+(neckHalfW * 1.75).toFixed(2), +(len * 0.48).toFixed(2)], [+(neckHalfW * 1.45).toFixed(2), len]];
    const seg2 = [[+(neckHalfW * 1.45).toFixed(2), len], [+(neckHalfW * 0.68).toFixed(2), +(len + 5).toFixed(2)], [0, +(len * 0.86).toFixed(2)]];
    const outline = [[0, 0], [neckHalfW, 0], ...qBez(...seg1, 7), ...qBez(...seg2, 7)];
    outline.notches = [[neckHalfW, 0]];
    return withCurves(outline, [
      { fromIdx: 1, toIdx: 8, ...qBezToCubic(...seg1) },
      { fromIdx: 8, toIdx: 15, ...qBezToCubic(...seg2) },
    ]);
  }

  function tierHalfPc(topHalfW, botHalfW, height) {
    const seg = [[botHalfW, height], [+(botHalfW * 0.5).toFixed(2), +(height + 3.2).toFixed(2)], [0, height]];
    const outline = [[0, 0], [topHalfW, 0], [botHalfW, height], ...qBez(...seg, 7)];
    outline.notches = [[topHalfW, 0]];
    return withCurves(outline, [{ fromIdx: 2, toIdx: 9, ...qBezToCubic(...seg) }]);
  }

  function makeCuff(circ, h, en, ar) {
    const len = +Math.max(18, circ).toFixed(2);
    return {
      key: 'cuff',
      name: { en: en || 'Embroidered Cuff', ar: ar || 'إسورة مطرزة' },
      desc: { en: 'Structured wrist cuff framed in metallic embroidery.', ar: 'إسورة معصم متماسكة بإطار مطرز.' },
      outline: bandPc(len, h),
      grain: [[2, +(h * 0.5).toFixed(2)], [+(len - 2).toFixed(2), +(h * 0.5).toFixed(2)]],
      role: 'cuff',
      bilateral: true,
    };
  }

  function makeSash(lenCm, wCm, role, en, ar) {
    const len = +Math.max(40, lenCm).toFixed(2);
    return {
      key: role === 'belt' ? 'belt' : 'sash',
      name: { en: en || 'Embroidered Waist Sash', ar: ar || 'حزام خصر مطرز' },
      desc: { en: 'Embroidered tie belt cinching the abaya silhouette.', ar: 'حزام خصر مطرز لتحديد قصة العباية بأناقة.' },
      outline: bandPc(len, wCm),
      grain: [[4, +(wCm * 0.5).toFixed(2)], [+(len - 4).toFixed(2), +(wCm * 0.5).toFixed(2)]],
      role: role || 'sash',
    };
  }

  function makePlacket(wCm, lenCm, en, ar) {
    const len = +Math.max(24, lenCm).toFixed(2);
    return {
      key: 'placket',
      name: { en: en || 'Embroidered Front Placket', ar: ar || 'مرد أمامي مطرز' },
      desc: { en: 'Long vertical front trim band receiving intricate embroidery.', ar: 'شريط مرد أمامي طويل مزين بتطريز متقن.' },
      outline: bandPc(wCm, len),
      notches: [[+(wCm * 0.5).toFixed(2), 0]],
      grain: [[+(wCm * 0.5).toFixed(2), 4], [+(wCm * 0.5).toFixed(2), +(len - 4).toFixed(2)]],
      role: 'placket-facing',
      bilateral: true,
    };
  }

  function makeStandCollar(neckW, h, en, ar) {
    const halfNeck = +Math.max(9, neckW * 1.02).toFixed(2);
    const out = collarStand(halfNeck, h);
    out.notches = [out[out.shoulderIdx]];
    return {
      key: 'collarBand',
      name: { en: en || 'Embroidered Mandarin Collar', ar: ar || 'ياقة صينية مطرزة' },
      desc: { en: 'Contoured stand collar band with fine edge embroidery.', ar: 'ياقة قائمة مقوسة بتطريز دقيق على الحافة.' },
      outline: out,
      grain: [[2, +(h * 0.5).toFixed(2)], [+(halfNeck - 2).toFixed(2), +(h * 0.5).toFixed(2)]],
      role: 'collar-band',
      cutOnFold: true,
    };
  }

  function makePocket(w, h, en, ar) {
    const out = pocketPatch(w, h);
    out.notches = [[+(w * 0.5).toFixed(2), 0]];
    return {
      key: 'pocket',
      name: { en: en || 'Embroidered Pocket', ar: ar || 'جيب مطرز' },
      desc: { en: 'Tailored hip pocket detailed with matching threadwork.', ar: 'جيب أمامي أنيق مزين بتطريز متطابق.' },
      outline: out,
      grain: [[+(w * 0.5).toFixed(2), 2], [+(w * 0.5).toFixed(2), +(h - 2).toFixed(2)]],
      role: 'pocket',
      bilateral: true,
    };
  }

  function reg(id, nameEn, nameAr, descEn, descAr, buildFn) {
    PATTERNS[id] = {
      id,
      category: 'women',
      name: { en: nameEn, ar: nameAr },
      desc: { en: descEn, ar: descAr },
      pieces: (m) => hoistCurves(buildFn(m)),
    };
    LIBRARY.push({ id, cat: 'women', tag: ABAYA_TAG, type: 'robe' });
  }

  // wa01: Royal Black Zari Open Abaya
  reg(
    'wa01',
    'Royal Black Zari Open Abaya',
    'عباية سوداء ملكية مطرزة بالزري الذهبي',
    'Flowing open-front obsidian satin abaya with voluminous bishop sleeves, contrast gold-zari embroidered cuffs, and matching waist sash.',
    'عباية مفتوحة انسيابية من الساتان الأسود الملكي بأكمام واسعة مزمومة، أساور مطرزة بالزري الذهبي، وحزام خصر متناسق.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: true, lenFrac: 0.90, hemFlare: 15, chestEase: 9.5, slvEase: 16, slvLenF: 0.96, cuffWF: 1.18, capH: 7.5, frontHollow: false,
        slvName: { en: 'Bishop Sleeve', ar: 'كم واسع مزموم' },
      });
      return [
        b.front, b.back, b.sleeve,
        makeCuff(24, 7.5, 'Gold Zari Wrist Cuff', 'إسورة مطرزة بالزري الذهبي'),
        makeSash(m.waist * 1.75, 6.5, 'sash', 'Gold Zari Waist Sash', 'حزام خصر مطرز بالزري'),
      ];
    },
  );

  // wa02: Emerald Gold Arabesque Open Bisht Abaya
  reg(
    'wa02',
    'Emerald Gold Arabesque Open Bisht Abaya',
    'عباية بشت زمردية مفتوحة بتطريز أرابيسك ذهبي',
    'Sweeping open-front emerald silk bisht abaya featuring wide butterfly sleeves and vertical gold arabesque embroidered front plackets.',
    'عباية بشت مفتوحة واسعة من الحرير الزمردي بأكمام فراشة منسدلة ومرد أمامي مطرز بنقوش الأرابيسك الذهبية.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: true, lenFrac: 0.91, hemFlare: 17, chestEase: 10.5, dropSh: 2.4, slvEase: 18, slvLenF: 0.92, cuffWF: 1.24, capH: 6.0, frontHollow: false,
        slvRole: 'butterfly-sleeve',
        slvName: { en: 'Butterfly Bisht Sleeve', ar: 'كم بشت فراشة واسع' },
      });
      return [
        b.front, b.back, b.sleeve,
        makePlacket(6.5, b.len * 0.46, 'Arabesque Placket Facing', 'بطانة مرد أرابيسك مطرزة'),
      ];
    },
  );

  // wa03: Levantine Palestinian Tatreez Abaya
  reg(
    'wa03',
    'Levantine Palestinian Tatreez Abaya',
    'عباية تطريز فلاحي تراثي فاخرة',
    'Tailored closed A-line linen abaya adorned with heritage Palestinian cross-stitch tatreez across a sculpted chest yoke and structured belt.',
    'عباية مغلقة بقصة A من الكتان الفاخر مزينة بالتطريز الفلسطيني التراثي المتقاطع على صدرية القبة وحزام الخصر.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: false, lenFrac: 0.89, hemFlare: 13, chestEase: 7.5, fNeckD: 6.5, slvEase: 10, slvLenF: 1.0, cuffWF: 0.88, capH: 9.0,
        slvName: { en: 'Tailored Tatreez Sleeve', ar: 'كم مطرز بتطريز فلاحي' },
      });
      return [
        b.front, b.back, b.sleeve,
        {
          key: 'yoke',
          name: { en: 'Tatreez Qabbeh Chest Yoke', ar: 'صدرية قبة التطريز التراثي' },
          desc: { en: 'Curved heritage chest panel designed for cross-stitch tatreez embroidery.', ar: 'قبة صدر مقوسة مخصصة للتطريز الفلاحي التراثي.' },
          outline: curvedYokePc(b.shX, 14),
          grain: [[3, 2], [3, 10]],
          role: 'yoke',
          cutOnFold: true,
        },
        makeSash(m.waist * 1.45, 5.5, 'belt', 'Embroidered Tatreez Belt', 'حزام تطريز تراثي'),
      ];
    },
  );

  // wa04: Midnight Navy Pearl-Beaded Cape Abaya
  reg(
    'wa04',
    'Midnight Navy Pearl-Beaded Cape Abaya',
    'عباية كيب كحلي مطرزة باللؤلؤ والفضة',
    'Column-cut midnight navy chiffon abaya topped with a sweeping pearl and silver-filigree embroidered shoulder cape overlay.',
    'عباية عمودية من الشيفون الكحلي الداكن تعلوها طبقة كيب منسدلة مطرزة باللؤلؤ الأبيض والفضي.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: false, lenFrac: 0.90, hemFlare: 10, chestEase: 8.0, fNeckD: 6.8, slvEase: 8, slvLenF: 1.0, cuffWF: 0.78, capH: 9.5,
        slvName: { en: 'Slim Chiffon Sleeve', ar: 'كم شيفون انسيابي' },
      });
      return [
        b.front, b.back, b.sleeve,
        {
          key: 'capeOverlay',
          name: { en: 'Pearl-Beaded Cape Overlay', ar: 'طبقة كيب مطرزة باللؤلؤ' },
          desc: { en: 'Draped shoulder cape overlay trimmed in celestial pearl and silver beadwork.', ar: 'كيب كتف منسدل بحواف مطرزة باللؤلؤ والخيوط الفضية.' },
          outline: capeDrapePc(b.neckW * 1.45, 36),
          grain: [[3, 4], [3, 26]],
          role: 'cape-overlay',
          cutOnFold: true,
        },
      ];
    },
  );

  // wa05: Burgundy Velvet Ottoman Brocade Coat Abaya
  reg(
    'wa05',
    'Burgundy Velvet Ottoman Brocade Coat Abaya',
    'عباية مخمل عنابي مطرزة بالبروكار العثماني',
    'Open-front plush burgundy velvet abaya with mandarin stand collar, flared bell sleeves, and champagne-gold Ottoman brocade waist sash.',
    'عباية مفتوحة من المخمل العنابي الفاخر بياقة قائمة وأكمام جرس متسعة مع حزام مطرز بالبروكار العثماني الذهبي.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: true, lenFrac: 0.90, hemFlare: 16, chestEase: 9.5, fNeckD: 7.4, slvEase: 12, slvLenF: 0.97, cuffWF: 1.28, capH: 8.2,
        slvName: { en: 'Bell Velvet Sleeve', ar: 'كم جرس مخملي' },
      });
      return [
        b.front, b.back, b.sleeve,
        makeStandCollar(b.neckW, 4.2, 'Ottoman Brocade Stand Collar', 'ياقة قائمة مطرزة بالبروكار'),
        makeSash(m.waist * 1.80, 7.0, 'sash', 'Velvet Brocade Sash', 'حزام مخمل بالبروكار الذهبي'),
      ];
    },
  );

  // wa06: Ivory Champagne Bridal Lace Abaya
  reg(
    'wa06',
    'Ivory Champagne Bridal Lace Abaya',
    'عباية عرائس عاجية بالدانتيل والتطريز الذهبي',
    'Graceful closed A-line bridal abaya in ivory lace with bishop sleeves, champagne-gold embroidered tall cuffs, and waist sash.',
    'عباية عرائس مغلقة بقصة A من الدانتيل العاجي بأكمام واسعة وأساور عالية مطرزة بخيوط الشمبانيا الذهبية.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: false, lenFrac: 0.92, hemFlare: 19, chestEase: 9.5, fNeckD: 6.4, slvEase: 18, slvLenF: 0.95, cuffWF: 1.24, capH: 8.0, frontHollow: false,
        slvName: { en: 'Bridal Bishop Sleeve', ar: 'كم عرائس واسع بأساور' },
      });
      return [
        b.front, b.back, b.sleeve,
        makeCuff(23, 9.5, 'Tall Champagne Embroidered Cuff', 'إسورة عالية مطرزة بالشمبانيا'),
        makeSash(m.waist * 1.70, 5.5, 'sash', 'Bridal Satin Waist Sash', 'حزام خصر ساتان للعرائس'),
      ];
    },
  );

  // wa07: Moroccan Forest Green Sfifa Kaftan Abaya
  reg(
    'wa07',
    'Moroccan Forest Green Sfifa Kaftan Abaya',
    'عباية قفطان مغربي أخضر بسفيفة ذهبية',
    'Regal closed Moroccan kaftan abaya in deep forest green silk featuring traditional gold sfifa placket strips and embroidered mdamma belt.',
    'عباية قفطان مغربي من الحرير الأخضر الزمردي بمرد سفيفة ذهبية تقليدية وحزام مضمة مطرز.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: false, lenFrac: 0.91, hemFlare: 18, chestEase: 10.5, fNeckD: 7.0, slvEase: 14, slvLenF: 0.99, cuffWF: 1.22, capH: 7.6,
        slvName: { en: 'Flared Kaftan Sleeve', ar: 'كم قفطان متسع بسفيفة' },
      });
      return [
        b.front, b.back, b.sleeve,
        makePlacket(5.0, b.len * 0.44, 'Moroccan Gold Sfifa Placket Facing', 'بطانة مرد سفيفة مغربية ذهبية'),
        makeSash(m.waist * 1.48, 8.0, 'belt', 'Mdamma Embroidered Belt', 'حزام مضمة مغربية مطرز'),
      ];
    },
  );

  // wa08: Dusty Rose Botanical Threadwork Kimono Abaya
  reg(
    'wa08',
    'Dusty Rose Botanical Threadwork Kimono Abaya',
    'عباية كيمونو وردي داكن بتطريز نباتي ناعم',
    'Relaxed open-front dusty rose silk kimono abaya with sweeping kimono sleeves and pastel floral vine embroidered sash.',
    'عباية كيمونو مفتوحة من الحرير الوردي الداكن بأكمام كيمونو واسعة وحزام خصر مطرز بفروع نباتية ناعمة.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: true, lenFrac: 0.88, hemFlare: 14, chestEase: 11.5, dropSh: 2.2, fNeckD: 8.2, slvEase: 18, slvLenF: 0.90, cuffWF: 1.24, capH: 6.2, frontHollow: false,
        slvName: { en: 'Wide Kimono Sleeve', ar: 'كم كيمونو عريض' },
      });
      return [
        b.front, b.back, b.sleeve,
        makeSash(m.waist * 1.85, 6.0, 'sash', 'Botanical Embroidered Sash', 'حزام مطرز بأغصان نباتية'),
      ];
    },
  );

  // wa09: Desert Sand Tonal Geometric Embroidered Abaya
  reg(
    'wa09',
    'Desert Sand Tonal Geometric Embroidered Abaya',
    'عباية رملية بتطريز هندسي ناعم من نفس اللون',
    'Breathable closed A-line desert sand linen abaya with mandarin collar band, cuffed sleeves, and geometric embroidered patch pockets.',
    'عباية كتان رملية مغلقة بقصة A مريحة بياقة قائمة وأساور أكمام وجيوب رقعة بتطريز هندسي ناعم.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: false, lenFrac: 0.87, hemFlare: 11, chestEase: 8.5, fNeckD: 5.8, slvEase: 9, slvLenF: 0.96, cuffWF: 0.86, capH: 8.8,
        slvName: { en: 'Cuffed Linen Sleeve', ar: 'كم كتان بأساور' },
      });
      return [
        b.front, b.back, b.sleeve,
        makeStandCollar(b.neckW, 3.8, 'Linen Mandarin Collar', 'ياقة صينية من الكتان'),
        makeCuff(24.5, 6.0, 'Geometric Embroidered Cuff', 'إسورة بتطريز هندسي'),
        makePocket(14.5, 17.0, 'Geometric Hip Pocket', 'جيب ورك مطرز هندسياً'),
      ];
    },
  );

  // wa10: Royal Plum Silver Filigree Kimono Abaya
  reg(
    'wa10',
    'Royal Plum Silver Filigree Kimono Abaya',
    'عباية كيمونو بنفسجي ملكي بتطريز فضي',
    'Statement open-front royal plum satin kimono abaya with extra-wide silver filigree sleeves, contrast cuffs, and waist sash.',
    'عباية كيمونو مفتوحة من الساتان البنفسجي الملكي بأكمام عريضة وأساور فضية متباينة وحزام خصر مطرز.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: true, lenFrac: 0.90, hemFlare: 17, chestEase: 12.0, dropSh: 2.4, fNeckD: 8.0, slvEase: 19, slvLenF: 0.94, cuffWF: 1.26, capH: 6.5, frontHollow: false,
        slvName: { en: 'Silver Filigree Kimono Sleeve', ar: 'كم كيمونو بتطريز فضي' },
      });
      return [
        b.front, b.back, b.sleeve,
        makeCuff(26, 8.5, 'Silver Filigree Contrast Cuff', 'إسورة فضية متباينة مطرزة'),
        makeSash(m.waist * 1.78, 6.8, 'sash', 'Royal Plum Silk Sash', 'حزام ساتان بنفسجي ملكي'),
      ];
    },
  );

  // wa11: Teal Peacock Feather Embroidered Abaya
  reg(
    'wa11',
    'Teal Peacock Feather Embroidered Abaya',
    'عباية تركواز داكن بتطريز ريش الطاووس',
    'Umbrella-flared closed satin abaya in deep peacock teal featuring gathered puff sleeves, stand collar, and tall cuffs.',
    'عباية مغلقة بقصة مظلة واسعة من الساتان التركوازي الداكن بأكمام منفوشة وياقة قائمة وتطريز ريش الطاووس.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: false, lenFrac: 0.91, hemFlare: 22, chestEase: 8.5, fNeckD: 6.0, slvEase: 19, slvLenF: 0.96, cuffWF: 0.72, capH: 10.5, frontHollow: false,
        slvRole: 'puff-sleeve',
        slvName: { en: 'Puff Peacock Sleeve', ar: 'كم منفوش مطرز بالطاووس' },
      });
      return [
        b.front, b.back, b.sleeve,
        makeStandCollar(b.neckW, 4.0, 'Teal Mandarin Collar', 'ياقة قائمة تركواز مطرزة'),
        makeCuff(22.5, 7.0, 'Peacock Embroidered Cuff', 'إسورة مطرزة بريش الطاووس'),
      ];
    },
  );

  // wa12: Espresso Mocha Bronze Soutache Coat Abaya
  reg(
    'wa12',
    'Espresso Mocha Bronze Soutache Coat Abaya',
    'عباية موكا إسبريسو بتطريز سوتاج برونزي',
    'Structured open-front espresso coat abaya finished with tailored shirt collar, bronze soutache embroidered pockets, and waist belt.',
    'عباية معطف مفتوحة أنيقة بلون الموكا بياقة كلاسيكية وجيوب مطرزة بسوتاج برونزي وحزام خصر محدد.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: true, lenFrac: 0.89, hemFlare: 12, chestEase: 8.0, fNeckD: 7.5, slvEase: 8.5, slvLenF: 1.0, cuffWF: 0.82, capH: 9.2,
        slvName: { en: 'Tailored Coat Sleeve', ar: 'كم معطف مفصل بسوتاج' },
      });
      const halfNeck = +Math.max(9, b.neckW * 1.05).toFixed(2);
      const collarOut = pointedCollar(halfNeck, 4.5, 6.2);
      collarOut.notches = [collarOut[collarOut.shoulderIdx]];
      return [
        b.front, b.back, b.sleeve,
        {
          key: 'collar',
          name: { en: 'Soutache Tailored Collar', ar: 'ياقة معطف بسوتاج برونزي' },
          desc: { en: 'Two-point coat collar accented with bronze soutache cordwork.', ar: 'ياقة معطف كلاسيكية مزينة بتطريز سوتاج برونزي.' },
          outline: collarOut,
          grain: [[2, 2.2], [+(halfNeck - 2).toFixed(2), 2.2]],
          role: 'collar',
          cutOnFold: true,
        },
        makePocket(15.5, 18.0, 'Soutache Welt Hip Pocket', 'جيب ورك مطرز بالسوتاج'),
        makeSash(m.waist * 1.50, 5.8, 'belt', 'Bronze Embroidered Coat Belt', 'حزام معطف مطرز بالبرونز'),
      ];
    },
  );

  // wa13: Pearl Grey Crystal-Stitched Tiered Abaya
  reg(
    'wa13',
    'Pearl Grey Crystal-Stitched Tiered Abaya',
    'عباية رمادي لؤلؤي بطبقات وتطريز كريستال',
    'Romantic closed tiered chiffon abaya with shaped upper bodice, two cascading gathered tiers, bishop sleeves, and crystal-stitched cuffs.',
    'عباية رومانسية مغلقة من الشيفون الرمادي اللؤلؤي بطبقتين متدرجتين وأكمام مزمومة وتطريز كريستال فضي.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: false, bodiceOnly: true, waistDrop: 15, chestEase: 7.5, hemFlare: 6, slvEase: 16, slvLenF: 0.95, cuffWF: 1.15, capH: 7.8, frontHollow: false,
        frontName: { en: 'Tiered Abaya Bodice Front', ar: 'صدرية عباية الطبقات - أمام' },
        backName: { en: 'Tiered Abaya Bodice Back', ar: 'صدرية عباية الطبقات - خلف' },
        slvName: { en: 'Crystal Bishop Sleeve', ar: 'كم واسع مطرز بالكريستال' },
      });
      const tier1H = +Math.max(36, (m.height - m.backLen - 26) * 0.48).toFixed(2);
      const tier2H = +Math.max(38, (m.height - m.backLen - 26) * 0.52).toFixed(2);
      return [
        b.front, b.back, b.sleeve,
        {
          key: 'tierUpper',
          name: { en: 'Crystal Gathered Upper Tier', ar: 'طبقة تنورة عليا مطرزة' },
          desc: { en: 'Gathered upper skirt tier cut on the fold with embroidered waist join.', ar: 'طبقة تنورة علوية مزمومة تُقص على الطية مع خط تطريز.' },
          outline: tierHalfPc(b.chestW + 10, b.chestW + 22, tier1H),
          grain: [[6, 4], [6, tier1H - 4]],
          role: 'tier',
          cutOnFold: true,
        },
        {
          key: 'tierLower',
          name: { en: 'Crystal Flared Lower Tier', ar: 'طبقة حاشية سفلية متسعة' },
          desc: { en: 'Voluminous lower ruffle tier framed in crystal-stitched silver thread.', ar: 'طبقة حاشية سفلية واسعة مطرزة بخيوط الكريستال الفضية.' },
          outline: tierHalfPc(b.chestW + 22, b.chestW + 38, tier2H),
          grain: [[6, 4], [6, tier2H - 4]],
          role: 'tier',
          cutOnFold: true,
        },
        makeCuff(23.5, 8.0, 'Crystal Beaded Bishop Cuff', 'إسورة مطرزة بالكريستال'),
      ];
    },
  );

  // wa14: Khaleeji Onyx & Copper Metallic Sleeve Open Abaya
  reg(
    'wa14',
    'Khaleeji Onyx & Copper Metallic Sleeve Open Abaya',
    'عباية خليجية سوداء بأكمام مطرزة بالنحاسي',
    'Modern Khaleeji open-front onyx silk abaya showcasing bold bell sleeves, copper embroidered contrast cuffs, and sleek front placket trim.',
    'عباية خليجية عصرية مفتوحة من الحرير الأسود بأكمام جرس وأساور نحاسية مطرزة ومرد أمامي متناسق.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: true, lenFrac: 0.90, hemFlare: 13, chestEase: 10.0, fNeckD: 7.0, slvEase: 14, slvLenF: 0.98, cuffWF: 1.30, capH: 7.2,
        slvName: { en: 'Copper Geometric Bell Sleeve', ar: 'كم جرس مطرز بالنحاسي' },
      });
      return [
        b.front, b.back, b.sleeve,
        makeCuff(30, 10.0, 'Copper Embroidered Bell Cuff', 'إسورة جرس مطرزة بالنحاسي'),
        makePlacket(5.5, b.len * 0.42, 'Copper Trim Placket Facing', 'بطانة مرد بحافة نحاسية'),
      ];
    },
  );

  // wa15: Olive Sage Leaf-Vine Embroidered Abaya
  reg(
    'wa15',
    'Olive Sage Leaf-Vine Embroidered Abaya',
    'عباية زيتوني بتطريز أوراق وأغصان ذهبية',
    'Refined closed A-line olive sage linen abaya with curved mandarin collar band, relaxed draped sleeves, and leaf-vine embroidered sash.',
    'عباية مغلقة بقصة A من الكتان الزيتوني بياقة قائمة مقوسة وأكمام منسدلة وحزام مطرز بأغصان وأوراق ذهبية.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: false, lenFrac: 0.88, hemFlare: 15, chestEase: 9.0, fNeckD: 6.2, slvEase: 13, slvLenF: 0.97, cuffWF: 1.08, capH: 7.8,
        slvName: { en: 'Draped Olive-Vine Sleeve', ar: 'كم منسدل مطرز بالأغصان' },
      });
      return [
        b.front, b.back, b.sleeve,
        makeStandCollar(b.neckW, 3.6, 'Olive Leaf Stand Collar', 'ياقة قائمة بتطريز أوراق'),
        makeSash(m.waist * 1.72, 6.2, 'sash', 'Gold Vine Embroidered Sash', 'حزام مطرز بأغصان ذهبية'),
      ];
    },
  );

  // wa16: Sapphire Blue Damask Ceremonial Abaya
  reg(
    'wa16',
    'Sapphire Blue Damask Ceremonial Abaya',
    'عباية سهرة أزرق ياقوتي مطرزة بالداماسك',
    'Ceremonial closed sapphire satin abaya crafted with butterfly sleeves, carved chest yoke for damask medallions, and structured cuffs.',
    'عباية سهرة مغلقة من الساتان الأزرق الياقوتي بأكمام فراشة وصدرية مخصصة لتطريز الداماسك الذهبي.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: false, lenFrac: 0.91, hemFlare: 20, chestEase: 10.0, fNeckD: 7.0, slvEase: 22, slvLenF: 0.94, cuffWF: 1.34, capH: 6.8, frontHollow: false,
        slvRole: 'butterfly-sleeve',
        slvName: { en: 'Damask Butterfly Sleeve', ar: 'كم فراشة مطرز بالداماسك' },
      });
      return [
        b.front, b.back, b.sleeve,
        {
          key: 'yoke',
          name: { en: 'Damask Ceremonial Chest Yoke', ar: 'صدرية داماسك ملكية' },
          desc: { en: 'Structured chest yoke framing antique gold damask motifs.', ar: 'صدرية كتف أمامية لتطريز زخارف الداماسك الذهبية.' },
          outline: curvedYokePc(b.shX, 15.5),
          grain: [[3, 2], [3, 11]],
          role: 'yoke',
          cutOnFold: true,
        },
        makeCuff(29, 8.5, 'Damask Contrast Sleeve Cuff', 'إسورة داماسك عريضة مطرزة'),
      ];
    },
  );

  // wa17: Soft Blush & Gold Scalloped Pleat Open Abaya
  reg(
    'wa17',
    'Soft Blush & Gold Scalloped Pleat Open Abaya',
    'عباية وردي باستيل بتطريز قواقع ذهبي وكسرات',
    'Airy open-front blush chiffon abaya with flared drape, gathered bishop sleeves, antique gold embroidered satin cuffs, and waist sash.',
    'عباية مفتوحة ناعمة من الشيفون الوردي الباستيل بأكمام مزمومة وأساور ساتان مطرزة بحواف ذهبية وحزام خصر.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: true, lenFrac: 0.89, hemFlare: 19, chestEase: 11.0, fNeckD: 7.8, slvEase: 17, slvLenF: 0.96, cuffWF: 1.20, capH: 7.4, frontHollow: false,
        slvName: { en: 'Pleated Blush Bishop Sleeve', ar: 'كم واسع ناعم بأساور' },
      });
      return [
        b.front, b.back, b.sleeve,
        makeCuff(23, 7.2, 'Scalloped Gold Satin Cuff', 'إسورة ساتان بتطريز ذهبي'),
        makeSash(m.waist * 1.82, 5.2, 'sash', 'Delicate Blush Tie Sash', 'حزام شيفون وردي رفيع'),
      ];
    },
  );

  // wa18: Charcoal Silver Geometric Tatreez Cape Abaya
  reg(
    'wa18',
    'Charcoal Silver Geometric Tatreez Cape Abaya',
    'عباية عباءة فحمي بتطريز هندسي فضي',
    'Architectural open-front charcoal cloak abaya featuring wide flared sleeves, draped shoulder cape, and silver geometric front placket facing.',
    'عباية عباءة مفتوحة بلون رمادي فحمي بأكمام واسعة وكيب كتف منسدل ومرد أمامي مطرز بنقوش هندسية فضية.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: true, lenFrac: 0.90, hemFlare: 15, chestEase: 11.5, dropSh: 2.0, fNeckD: 7.2, slvEase: 15, slvLenF: 0.98, cuffWF: 1.25, capH: 7.5,
        slvName: { en: 'Flared Cloak Sleeve', ar: 'كم عباءة متسع مطرز' },
      });
      return [
        b.front, b.back, b.sleeve,
        {
          key: 'cape',
          name: { en: 'Architectural Shoulder Cape', ar: 'كيب كتف هندسي منسدل' },
          desc: { en: 'Draped charcoal shoulder cape edged in silver diamond geometry.', ar: 'كيب كتف فحمي منسدل محاط بتطريز فضي هندسي.' },
          outline: capeDrapePc(b.neckW * 1.5, 32),
          grain: [[3, 4], [3, 24]],
          role: 'cape',
          cutOnFold: true,
        },
        makePlacket(6.0, b.len * 0.44, 'Silver Geometric Placket Facing', 'بطانة مرد هندسية فضية'),
      ];
    },
  );

  // wa19: Terracotta Sunset Folk Embroidered Abaya
  reg(
    'wa19',
    'Terracotta Sunset Folk Embroidered Abaya',
    'عباية تيراكوتا بتطريز شعبي ملون فاخر',
    'Earthy closed A-line terracotta linen abaya combining a folk botanical embroidered yoke, structured cuffs, and colorful woven waist belt.',
    'عباية مغلقة بلون التيراكوتا الدافئ من الكتان الطبيعي مع صدرية تطريز شعبي ملونة وأساور وحزام متطابق.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: false, lenFrac: 0.88, hemFlare: 14, chestEase: 9.0, fNeckD: 6.4, slvEase: 11, slvLenF: 0.98, cuffWF: 0.90, capH: 8.6,
        slvName: { en: 'Folk Embroidered Sleeve', ar: 'كم كتان بتطريز شعبي' },
      });
      return [
        b.front, b.back, b.sleeve,
        {
          key: 'yoke',
          name: { en: 'Folk Botanical Chest Yoke', ar: 'صدرية تطريز شعبي ملونة' },
          desc: { en: 'Curved yoke panel decorated in saffron, cream, and teal folk florals.', ar: 'صدرية مقوسة مزينة بتطريز نباتي بألوان الزعفران والكريمي.' },
          outline: curvedYokePc(b.shX, 13.5),
          grain: [[3, 2], [3, 9.5]],
          role: 'yoke',
          cutOnFold: true,
        },
        makeCuff(24, 6.8, 'Folk Trim Linen Cuff', 'إسورة كتان مطرزة'),
        makeSash(m.waist * 1.46, 6.0, 'belt', 'Saffron Embroidered Belt', 'حزام خصر مطرز بالزعفران'),
      ];
    },
  );

  // wa20: Champagne Gold Haute Couture Cape Open Abaya
  reg(
    'wa20',
    'Champagne Gold Haute Couture Cape Open Abaya',
    'عباية كوتور شامبين ذهبي مطرزة بالزهور واللؤلؤ',
    'Haute couture open-front champagne silk evening abaya with flared bell sleeves, sweeping floral-pearl cape overlay, and silk waist sash.',
    'عباية كوتور مسائية مفتوحة من الحرير الشامبين الذهبي بأكمام جرس وكيب كتف مطرز بالزهور واللؤلؤ وحزام حرير.',
    (m) => {
      const b = abayaBodicePair(m, {
        isOpen: true, lenFrac: 0.92, hemFlare: 20, chestEase: 11.5, dropSh: 2.0, fNeckD: 7.6, slvEase: 15, slvLenF: 0.99, cuffWF: 1.32, capH: 7.6, frontHollow: false,
        slvName: { en: 'Couture Bell Sleeve', ar: 'كم جرس كوتور مطرز' },
      });
      return [
        b.front, b.back, b.sleeve,
        {
          key: 'capeOverlay',
          name: { en: 'Couture Floral-Pearl Cape Overlay', ar: 'طبقة كيب كوتور باللؤلؤ والزهور' },
          desc: { en: 'Sweeping evening shoulder cape embroidered with antique gold vines and ivory pearls.', ar: 'كيب مسائي فخم مطرز بأزهار ذهبية ولؤلؤ عاجي.' },
          outline: capeDrapePc(b.neckW * 1.55, 40),
          grain: [[3, 4], [3, 28]],
          role: 'cape-overlay',
          cutOnFold: true,
        },
        makeSash(m.waist * 1.88, 7.5, 'sash', 'Champagne Couture Silk Sash', 'حزام حرير شامبين كوتور'),
      ];
    },
  );
})();
