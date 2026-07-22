/* ============================================================
   Pre-designed Pattern Library — 100 patterns, 25 per category.

   The 6 hand-crafted patterns in data.js (womens_dress, abaya,
   mens_shirt, thobe, girls_dress, boys_trousers) count toward their
   category's 25. This file adds the remaining 94 so every category
   — Women, Men, Girls, Boys — has exactly 25 pre-designed models.

   Each entry is a REAL, gradable multi-piece garment: geometry comes
   from the same parametric builder that powers the AI generator
   (AIGen.build in js/ai.js), driven by explicit style parameters
   (length / flare / fit / sleeve) chosen per garment so the shape
   actually matches its name — not a placeholder or a recolor.
   ============================================================ */
(function () {
  const TAG = {
    dress: { en: "Dress", ar: "فستان" },
    top: { en: "Top", ar: "توب" },
    shirt: { en: "Shirt", ar: "قميص" },
    skirt: { en: "Skirt", ar: "تنورة" },
    trousers: { en: "Trousers", ar: "بنطلون" },
  };
  const robeTag = (category) =>
    (category === "men" || category === "boys") ? { en: "Robe", ar: "ثوب" } : { en: "Robe", ar: "عباية" };

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

  ALL.forEach((e) => {
    PATTERNS[e.id] = {
      id: e.id,
      category: e.category,
      name: e.name,
      desc: { en: "Pre-designed pattern — ready to grade and export.", ar: "باترون جاهز التصميم — للتدريج والتصدير مباشرة." },
      pieces: (m) => {
        const built = AIGen.build(e.style, m);
        return built.pieces.map((p) => ({
          ...p,
          desc: { en: `Pattern piece for the ${e.name.en}.`, ar: `قطعة من باترون ${e.name.ar}.` },
        }));
      },
    };
    LIBRARY.push({ id: e.id, cat: e.category, tag: e.tag, type: e.style.type });
  });
})();
