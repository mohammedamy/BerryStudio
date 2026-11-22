/* ============================================================
   Mannequin Hair & Headwear Styling Registry — BerryStudio
   Pure ES module (Node + Browser + Cloth Lab compatible).

   Defines:
   - Category-specific haircuts (existing + new cuts + bald)
   - Hair texture types (straight, wavy, curly, coily, braided)
   - Salon hair coloring swatches + hex normalization
   - Category-appropriate 3D headwear:
     * Women / Girls: Classic Draped Hijab, Turkish Silk Hijab,
       Draped Turban Hijab, Gulf Shayla, Long Modest Khimar,
       Hijab & Niqab, Sport Pull-On Hijab, Sun Hat, Beret, Beanie
     * Men / Boys: White Ghutra & Iqal, Red Shemagh & Iqal,
       Black & White Shemagh & Iqal, Hamdaniyah Wrapped Ghutra,
       Embroidered Taqiyah, Traditional Wrapped Shawl, Fedora,
       Baseball Cap, Beanie, Beret
   ============================================================ */

export function normalizeHexColor(val, fallback = null) {
  if (val == null || val === "") return fallback;
  if (typeof val === "number" && Number.isFinite(val)) {
    return "#" + Math.max(0, Math.min(0xffffff, Math.round(val))).toString(16).padStart(6, "0");
  }
  const s = String(val).trim();
  if (/^#?[0-9a-f]{6}$/i.test(s)) {
    return (s.startsWith("#") ? s : `#${s}`).toLowerCase();
  }
  if (/^#?[0-9a-f]{3}$/i.test(s)) {
    const raw = s.startsWith("#") ? s.slice(1) : s;
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
  }
  return fallback;
}

export function hexToInt(hex, fallback = 0x241913) {
  const norm = normalizeHexColor(hex, null);
  if (!norm) return fallback;
  const parsed = parseInt(norm.slice(1), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const HAIR_TYPES = Object.freeze([
  {
    id: "straight",
    label: { en: "Straight", ar: "ناعم أملس" },
    strandFreqMult: 1.0,
    strandDepthMult: 1.0,
    loftMult: 1.0,
    curlFreq: 0,
    curlAmp: 0,
    braidBands: 0,
    roughness: 0.48,
    sheen: 0.44,
    sheenRoughness: 0.42,
    shininess: 34,
  },
  {
    id: "wavy",
    label: { en: "Wavy", ar: "مموج" },
    strandFreqMult: 0.80,
    strandDepthMult: 1.55,
    loftMult: 1.16,
    curlFreq: 4.5,
    curlAmp: 0.011,
    braidBands: 0,
    roughness: 0.56,
    sheen: 0.38,
    sheenRoughness: 0.48,
    shininess: 28,
  },
  {
    id: "curly",
    label: { en: "Curly", ar: "كيرلي" },
    strandFreqMult: 0.68,
    strandDepthMult: 2.05,
    loftMult: 1.38,
    curlFreq: 10.5,
    curlAmp: 0.022,
    braidBands: 0,
    roughness: 0.68,
    sheen: 0.30,
    sheenRoughness: 0.56,
    shininess: 22,
  },
  {
    id: "coily",
    label: { en: "Coily / Afro", ar: "أفرو مجعد" },
    strandFreqMult: 1.35,
    strandDepthMult: 2.25,
    loftMult: 1.58,
    curlFreq: 18.0,
    curlAmp: 0.030,
    braidBands: 0,
    roughness: 0.80,
    sheen: 0.22,
    sheenRoughness: 0.64,
    shininess: 16,
  },
  {
    id: "braided",
    label: { en: "Braided", ar: "ضفائر" },
    strandFreqMult: 0.52,
    strandDepthMult: 2.15,
    loftMult: 1.18,
    curlFreq: 0,
    curlAmp: 0,
    braidBands: 16,
    roughness: 0.62,
    sheen: 0.34,
    sheenRoughness: 0.50,
    shininess: 24,
  },
]);

export const HAIR_TYPE_MAP = Object.freeze(Object.fromEntries(HAIR_TYPES.map((t) => [t.id, t])));

export function getHairTypeSpec(hairType) {
  return HAIR_TYPE_MAP[hairType] || HAIR_TYPE_MAP.straight;
}

export const HAIR_COLOR_PRESETS = Object.freeze([
  { id: "jet_black", hex: "#171311", label: { en: "Jet Black", ar: "أسود فاحم" } },
  { id: "espresso", hex: "#2c1e16", label: { en: "Dark Espresso", ar: "بني داكن" } },
  { id: "chocolate", hex: "#3f281b", label: { en: "Chocolate", ar: "شوكولاتة" } },
  { id: "chestnut", hex: "#523222", label: { en: "Chestnut", ar: "كستنائي" } },
  { id: "auburn", hex: "#7a311d", label: { en: "Auburn", ar: "أحمر نحاسي" } },
  { id: "caramel", hex: "#8b5e34", label: { en: "Caramel", ar: "كراميل" } },
  { id: "honey_blonde", hex: "#b88b4a", label: { en: "Honey Blonde", ar: "أشقر عسلي" } },
  { id: "ash_blonde", hex: "#c7b08b", label: { en: "Ash Blonde", ar: "أشقر رمادي" } },
  { id: "platinum", hex: "#e6dccb", label: { en: "Platinum", ar: "بلاتيني" } },
  { id: "silver", hex: "#a5a9b0", label: { en: "Silver Grey", ar: "فضي رمادي" } },
  { id: "burgundy", hex: "#581c2b", label: { en: "Burgundy", ar: "عنابي" } },
  { id: "rose_gold", hex: "#c27d78", label: { en: "Rose Gold", ar: "ذهبي وردي" } },
]);

export const HAIRCUT_CATALOG = Object.freeze({
  women: Object.freeze([
    { id: "chignon", label: { en: "Classic Chignon", ar: "شينيون كلاسيكي" } },
    { id: "long_straight", label: { en: "Long Layered", ar: "طويل منسدل" } },
    { id: "long_wavy", label: { en: "Long Cascading Waves", ar: "طويل مموج" } },
    { id: "bob", label: { en: "Sleek Bob", ar: "كاريه قصير" } },
    { id: "waves", label: { en: "Shoulder Waves", ar: "موجات للكتف" } },
    { id: "high_bun", label: { en: "High Top Bun", ar: "كعكة مرتفعة" } },
    { id: "low_ponytail", label: { en: "Low Ponytail", ar: "ذيل حصان منخفض" } },
    { id: "pixie_crop", label: { en: "Pixie Crop", ar: "قصة بيكسي قصيرة" } },
    { id: "curly_afro", label: { en: "Voluminous Afro Curls", ar: "كيرلي كثيف" } },
    { id: "crown_braid", label: { en: "Crown Braid", ar: "ضفيرة التاج" } },
    { id: "french_twist", label: { en: "French Twist", ar: "لفة فرنسية" } },
    { id: "voluminous_updo", label: { en: "Couture Updo", ar: "تسريحة كوتور مرفوعة" } },
    { id: "side_chignon", label: { en: "Side Chignon", ar: "شينيون جانبي" } },
    { id: "glam_bun", label: { en: "Editorial Glam Bun", ar: "كعكة فاخرة" } },
    { id: "bald", label: { en: "Clean Shaved / Bare", ar: "حليق بالكامل" } },
  ]),
  girls: Object.freeze([
    { id: "ponytails", label: { en: "Twin Ponytails", ar: "ضفيرتان جانبيتان" } },
    { id: "long_straight", label: { en: "Long Sleek", ar: "شعر طويل أملس" } },
    { id: "long_wavy", label: { en: "Long Soft Waves", ar: "شعر طويل مموج" } },
    { id: "single_ponytail", label: { en: "Single Ponytail", ar: "ذيل حصان" } },
    { id: "half_up", label: { en: "Half-Up Style", ar: "نصف مرفوع" } },
    { id: "double_braid_buns", label: { en: "Double Braid Buns", ar: "كعكتا ضفائر" } },
    { id: "twin_buns", label: { en: "Twin Top Buns", ar: "كعكتان علويتان" } },
    { id: "ribbon_ponytail", label: { en: "Ribbon Ponytail", ar: "ذيل حصان بشريطة" } },
    { id: "headband_bob", label: { en: "Headband Bob", ar: "كاريه بطوق" } },
    { id: "toddler_puffs", label: { en: "Playful Puffs", ar: "نفشتان علويتان" } },
    { id: "side_braid_bun", label: { en: "Side Braid Bun", ar: "كعكة ضفيرة جانبية" } },
    { id: "high_pony_wave", label: { en: "High Wavy Pony", ar: "ذيل حصان عالٍ مموج" } },
    { id: "teen_bun", label: { en: "Sleek Low Bun", ar: "كعكة ناعمة" } },
    { id: "curly_afro", label: { en: "Full Curly Halo", ar: "كيرلي كثيف" } },
    { id: "bald", label: { en: "Clean Shaved / Bare", ar: "حليق بالكامل" } },
  ]),
  men: Object.freeze([
    { id: "classic_men", label: { en: "Classic Tailored", ar: "كلاسيكي مرتب" } },
    { id: "textured_crop", label: { en: "Textured Crop", ar: "قصّة متدرجة" } },
    { id: "buzz_fade", label: { en: "Buzz Fade", ar: "حلاقة خفيفة متدرجة" } },
    { id: "quiff", label: { en: "Volume Quiff", ar: "كويف أمامي" } },
    { id: "parted_pomp", label: { en: "Parted Pompadour", ar: "بومبادور مفرق" } },
    { id: "swept_back", label: { en: "Swept Back", ar: "مسحوب للخلف" } },
    { id: "executive_comb", label: { en: "Executive Side Part", ar: "فرق جانبي أنيق" } },
    { id: "short_taper", label: { en: "Short Taper", ar: "قصير متدرج" } },
    { id: "curly_fade", label: { en: "Curly Crown Fade", ar: "كيرلي بتدريج جانبي" } },
    { id: "long_men", label: { en: "Shoulder Sweep", ar: "شعر طويل للكتف" } },
    { id: "man_bun", label: { en: "Tied Top Knot", ar: "كعكة علوية" } },
    { id: "classic_wave", label: { en: "Natural Wave", ar: "موج طبيعي" } },
    { id: "side_crop", label: { en: "Side Crop", ar: "قصة جانبية" } },
    { id: "classic_crown", label: { en: "Full Crown Wave", ar: "تاج مموج" } },
    { id: "bald", label: { en: "Clean Shaved / Bald", ar: "أصلع / حليق" } },
  ]),
  boys: Object.freeze([
    { id: "boys_crop", label: { en: "Classic Boys Crop", ar: "قصّة ولادي كلاسيكية" } },
    { id: "toddler_curls", label: { en: "Soft Crown Curls", ar: "تجعدات ناعمة" } },
    { id: "varsity_crop", label: { en: "Varsity Part", ar: "قصة مدرسية" } },
    { id: "side_sweep_jr", label: { en: "Side Sweep", ar: "تمشيطة جانبية" } },
    { id: "taper_quiff_jr", label: { en: "Junior Quiff", ar: "كويف شبابي" } },
    { id: "classic_jr_wave", label: { en: "Junior Wave", ar: "موجة ناعمة" } },
    { id: "soft_fringe", label: { en: "Textured Fringe", ar: "غرة متدرجة" } },
    { id: "sport_crop", label: { en: "Sport Buzz", ar: "قصّة رياضية" } },
    { id: "youth_fade", label: { en: "Youth Fade", ar: "تدريج شبابي" } },
    { id: "teen_wave", label: { en: "Teen Wave", ar: "موجة عصرية" } },
    { id: "athletic_cut", label: { en: "Athletic Crop", ar: "قصة رياضية قصيرة" } },
    { id: "curly_fade", label: { en: "Curly Top Fade", ar: "كيرلي بتدريج" } },
    { id: "long_men", label: { en: "Medium Shag", ar: "شعر متوسط الطول" } },
    { id: "bald", label: { en: "Clean Shaved / Buzz", ar: "حليق بالكامل" } },
  ]),
});

export function getHaircutsForCategory(category) {
  return HAIRCUT_CATALOG[category] || HAIRCUT_CATALOG.women;
}

export const HEADWEAR_CATALOG = Object.freeze([
  {
    id: "none",
    categories: ["women", "girls", "men", "boys"],
    label: { en: "None (Hair Visible)", ar: "بدون غطاء رأس" },
    defaultColor: null,
    hidesHair: false,
    coversCrown: false,
    pattern: null,
  },
  // ---- Women & Girls Hijabs ----
  {
    id: "hijab_classic",
    categories: ["women", "girls"],
    label: { en: "Classic Draped Hijab", ar: "حجاب كلاسيكي منسدل" },
    defaultColor: "#f3ece4",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "hijab_turkish",
    categories: ["women", "girls"],
    label: { en: "Turkish Silk Hijab", ar: "حجاب تركي حريري" },
    defaultColor: "#c8a99a",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "hijab_turban",
    categories: ["women", "girls"],
    label: { en: "Pleated Turban Hijab", ar: "توربان حجاب مطوي" },
    defaultColor: "#2e473b",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "hijab_shayla",
    categories: ["women", "girls"],
    label: { en: "Gulf Shayla Wrap", ar: "شيلة خليجية منسدلة" },
    defaultColor: "#1b1c20",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "hijab_khimar",
    categories: ["women", "girls"],
    label: { en: "Long Modest Khimar", ar: "خمار طويل ساتر" },
    defaultColor: "#2b2930",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "hijab_niqab",
    categories: ["women", "girls"],
    label: { en: "Hijab & Niqab", ar: "حجاب ونقاب" },
    defaultColor: "#18191d",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "hijab_sport",
    categories: ["women", "girls"],
    label: { en: "Sport Pull-On Hijab", ar: "حجاب رياضي عملي" },
    defaultColor: "#334155",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "sun_hat",
    categories: ["women", "girls"],
    label: { en: "Wide-Brim Sun Hat", ar: "قبعة شمس عريضة" },
    defaultColor: "#e4cfa9",
    hidesHair: false,
    coversCrown: true,
    pattern: null,
  },
  // ---- Men & Boys Traditional & Classic Headwear ----
  {
    id: "ghutra_iqal",
    categories: ["men", "boys"],
    label: { en: "White Ghutra & Iqal", ar: "غترة بيضاء وعقال" },
    defaultColor: "#f6f5f1",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "shemagh_iqal",
    categories: ["men", "boys"],
    label: { en: "Red Shemagh & Iqal", ar: "شماغ أحمر وعقال" },
    defaultColor: "#b8232c",
    hidesHair: true,
    coversCrown: true,
    pattern: "shemagh_red",
  },
  {
    id: "shemagh_black_iqal",
    categories: ["men", "boys"],
    label: { en: "Black & White Shemagh", ar: "شماغ أسود وأبيض وعقال" },
    defaultColor: "#222428",
    hidesHair: true,
    coversCrown: true,
    pattern: "shemagh_dark",
  },
  {
    id: "ghutra_hamdaniyah",
    categories: ["men", "boys"],
    label: { en: "Hamdaniyah Wrapped Ghutra", ar: "غترة حمدانية ملفوفة" },
    defaultColor: "#f3f1ea",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "taqiyah",
    categories: ["men", "boys"],
    label: { en: "Embroidered Taqiyah", ar: "طاقية مطرّزة" },
    defaultColor: "#f4f2ec",
    hidesHair: false,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "shawl_wrap",
    categories: ["men", "boys"],
    label: { en: "Wrapped Heritage Shawl", ar: "شال تقليدي ملفوف" },
    defaultColor: "#8b6f4e",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "fedora",
    categories: ["men", "boys"],
    label: { en: "Tailored Fedora Hat", ar: "قبعة فيدورا كلاسيكية" },
    defaultColor: "#3b3530",
    hidesHair: false,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "baseball_cap",
    categories: ["men", "boys"],
    label: { en: "Baseball Cap", ar: "كاب رياضي" },
    defaultColor: "#1e3a5f",
    hidesHair: false,
    coversCrown: true,
    pattern: null,
  },
  // ---- Shared Classic Hats ----
  {
    id: "beret",
    categories: ["women", "girls", "men", "boys"],
    label: { en: "Tailored Beret", ar: "قبعة بيريه" },
    defaultColor: "#692232",
    hidesHair: false,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "beanie",
    categories: ["women", "girls", "men", "boys"],
    label: { en: "Ribbed Knit Beanie", ar: "قبعة شتوية محبوكة" },
    defaultColor: "#334155",
    hidesHair: false,
    coversCrown: true,
    pattern: null,
  },
]);

export const HEADWEAR_MAP = Object.freeze(Object.fromEntries(HEADWEAR_CATALOG.map((h) => [h.id, h])));

export function getHeadwearSpec(headwearId) {
  return HEADWEAR_MAP[headwearId] || HEADWEAR_MAP.none;
}

export function getHeadwearForCategory(category) {
  const cat = category || "women";
  return HEADWEAR_CATALOG.filter((h) => h.categories.includes(cat));
}

export const HEADWEAR_COLOR_PRESETS = Object.freeze([
  { id: "ivory", hex: "#f5f1e8", label: { en: "Ivory White", ar: "أبيض عاجي" } },
  { id: "onyx", hex: "#1b1c20", label: { en: "Obsidian Black", ar: "أسود فاحم" } },
  { id: "crimson", hex: "#b8232c", label: { en: "Heritage Red", ar: "أحمر تراثي" } },
  { id: "sand", hex: "#d7c3a3", label: { en: "Desert Sand", ar: "بيج رملي" } },
  { id: "mocha", hex: "#9c8472", label: { en: "Warm Taupe", ar: "موكا دافئ" } },
  { id: "navy", hex: "#1e3252", label: { en: "Midnight Navy", ar: "كحلي" } },
  { id: "emerald", hex: "#1f513f", label: { en: "Deep Emerald", ar: "أخضر زمردي" } },
  { id: "burgundy", hex: "#692232", label: { en: "Royal Burgundy", ar: "عنابي ملكي" } },
  { id: "rose", hex: "#c48b91", label: { en: "Dusty Rose", ar: "وردي هادئ" } },
  { id: "sage", hex: "#66755e", label: { en: "Sage Olive", ar: "زيتوني ناعم" } },
  { id: "gold", hex: "#c69a47", label: { en: "Ochre Gold", ar: "ذهبي دافئ" } },
  { id: "slate", hex: "#4a5568", label: { en: "Charcoal Slate", ar: "رمادي داكن" } },
]);

/**
 * Merges preset mannequin hair attributes with user customizations for a given category.
 * Headwear choices are validated against the active category so switching Woman -> Man
 * cleanly falls back rather than dressing a male mannequin in a niqab (or vice versa).
 */
export function resolveMannequinStyling(category, preset = null, overrides = null) {
  const cat = category || preset?.category || "women";
  const ov = overrides && typeof overrides === "object" ? overrides : {};

  const validHaircuts = getHaircutsForCategory(cat);
  const presetHairStyle = preset?.hairStyle || validHaircuts[0]?.id || "chignon";
  const hairStyle = ov.hairStyle && validHaircuts.some((c) => c.id === ov.hairStyle)
    ? ov.hairStyle
    : presetHairStyle;

  const hairType = HAIR_TYPE_MAP[ov.hairType]?.id || HAIR_TYPE_MAP[preset?.hairType]?.id || "straight";

  const presetHairHex = normalizeHexColor(preset?.hairHex ?? preset?.hairColor, "#241913");
  const hairHex = normalizeHexColor(ov.hairColor ?? ov.hairHex, presetHairHex);
  const hairColor = hexToInt(hairHex, 0x241913);

  const validHeadwear = getHeadwearForCategory(cat);
  const requestedHw = ov.headwear || preset?.headwear || "none";
  const hwSpec = validHeadwear.find((h) => h.id === requestedHw) || HEADWEAR_MAP.none;
  const headwear = hwSpec.id;

  const headwearHex = headwear === "none"
    ? null
    : normalizeHexColor(ov.headwearColor ?? ov.headwearHex, hwSpec.defaultColor || "#f3ece4");
  const headwearColor = headwearHex ? hexToInt(headwearHex, 0xf3ece4) : null;

  const hasOverrides = Boolean(
    ov.hairStyle ||
    (ov.hairType && ov.hairType !== "straight") ||
    ov.hairColor ||
    (ov.headwear && ov.headwear !== "none") ||
    ov.headwearColor
  );

  return {
    category: cat,
    hairStyle,
    hairType,
    hairHex,
    hairColor,
    headwear,
    headwearHex,
    headwearColor,
    hasOverrides,
  };
}
