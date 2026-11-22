/* ============================================================
   Mannequin Hair & Headwear Styling Registry — BerryStudio
   Pure ES module (Node + Browser + Cloth Lab compatible).

   Defines:
   - Category-specific haircuts (classic, long cascading, braided, & bald)
   - Hair texture types (straight, wavy, curly, coily, braided)
   - Hair length presets (short, natural, long, extra_long)
   - Salon hair coloring & highlight/balayage swatches + hex normalization
   - Category-appropriate 3D headwear:
     * Women / Girls: Classic & Long Islamic Hijabs (Draped Hijab,
       Turkish Silk, Turban, Shayla, Long Khimar, French Jilbab,
       Long Layered Shayla), Islamic Niqabs (Classic Niqab, Long Saudi
       Niqab, Long 2-Layer Niqab, Long Khimar & Half-Niqab, Long Niqab
       with Sheer Eye Screen / Ghashwa), Sport Pull-On Hijab, Hats
     * Men / Boys: White Ghutra & Iqal, Red Shemagh & Iqal,
       Black & White Shemagh & Iqal, Hamdaniyah Wrapped Ghutra,
       Embroidered Taqiyah, Traditional Wrapped Shawl, Fedora,
       Baseball Cap, Beanie, Beret
   - Customizable headwear fabric finish, drape length, undercap color,
     and niqab sheer eye screen toggle
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
    roughness: 0.44,
    sheen: 0.48,
    sheenRoughness: 0.38,
    shininess: 36,
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
    roughness: 0.54,
    sheen: 0.40,
    sheenRoughness: 0.46,
    shininess: 30,
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
    roughness: 0.66,
    sheen: 0.32,
    sheenRoughness: 0.54,
    shininess: 24,
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
    roughness: 0.78,
    sheen: 0.24,
    sheenRoughness: 0.62,
    shininess: 18,
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
    roughness: 0.60,
    sheen: 0.36,
    sheenRoughness: 0.48,
    shininess: 26,
  },
]);

export const HAIR_TYPE_MAP = Object.freeze(Object.fromEntries(HAIR_TYPES.map((t) => [t.id, t])));

export function getHairTypeSpec(hairType) {
  return HAIR_TYPE_MAP[hairType] || HAIR_TYPE_MAP.straight;
}

export const HAIR_LENGTH_PRESETS = Object.freeze([
  { id: "short", label: { en: "Trimmed", ar: "مقصّر" }, dropMult: 0.78 },
  { id: "natural", label: { en: "Natural", ar: "طبيعي" }, dropMult: 1.0 },
  { id: "long", label: { en: "Long", ar: "طويل" }, dropMult: 1.20 },
  { id: "extra_long", label: { en: "Extra Long", ar: "طويل جداً" }, dropMult: 1.40 },
]);

export const HAIR_LENGTH_MAP = Object.freeze(Object.fromEntries(HAIR_LENGTH_PRESETS.map((l) => [l.id, l])));

export function getHairLengthSpec(hairLength) {
  return HAIR_LENGTH_MAP[hairLength] || HAIR_LENGTH_MAP.natural;
}

export const HAIR_HIGHLIGHT_PRESETS = Object.freeze([
  { id: "none", label: { en: "Solid Color", ar: "لون موحّد" }, hex: null, strength: 0 },
  { id: "warm_honey", label: { en: "Honey Balayage", ar: "خصل عسلية" }, hex: "#d4a662", strength: 0.44 },
  { id: "caramel", label: { en: "Caramel Ribbons", ar: "خصل كراميل" }, hex: "#a46a3b", strength: 0.44 },
  { id: "ash_pearl", label: { en: "Ash Pearl", ar: "خصل رمادية لؤلؤية" }, hex: "#d6cab8", strength: 0.42 },
  { id: "copper_auburn", label: { en: "Copper Glow", ar: "خصل نحاسية" }, hex: "#a64526", strength: 0.44 },
  { id: "rose_tint", label: { en: "Rose Tint", ar: "خصل وردية" }, hex: "#cf8286", strength: 0.40 },
  { id: "silver_frost", label: { en: "Silver Streaks", ar: "خصل فضية" }, hex: "#c8cdd6", strength: 0.42 },
]);

export const HAIR_HIGHLIGHT_MAP = Object.freeze(Object.fromEntries(HAIR_HIGHLIGHT_PRESETS.map((h) => [h.id, h])));

export function getHairHighlightSpec(idOrHex) {
  if (!idOrHex || idOrHex === "none") return HAIR_HIGHLIGHT_MAP.none;
  if (HAIR_HIGHLIGHT_MAP[idOrHex]) return HAIR_HIGHLIGHT_MAP[idOrHex];
  const hex = normalizeHexColor(idOrHex, null);
  if (hex) {
    return {
      id: hex,
      label: { en: "Custom Tint", ar: "خصل مخصصة" },
      hex,
      strength: 0.44,
    };
  }
  return HAIR_HIGHLIGHT_MAP.none;
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
    { id: "chignon", group: "classic", label: { en: "Classic Chignon", ar: "شينيون كلاسيكي" } },
    { id: "long_straight", group: "long", label: { en: "Long Layered", ar: "طويل منسدل" } },
    { id: "long_wavy", group: "long", label: { en: "Long Cascading Waves", ar: "طويل مموج" } },
    { id: "long_waist_straight", group: "long", label: { en: "Waist-Length Sleek Straight", ar: "طويل أملس حتى الخصر" } },
    { id: "long_hollywood_waves", group: "long", label: { en: "Long Hollywood Waves", ar: "موجات هوليوود طويلة" } },
    { id: "long_layered_curls", group: "long", label: { en: "Long Layered Curls", ar: "كيرلي طويل متدرج" } },
    { id: "long_half_up", group: "long", label: { en: "Long Half-Up Cascade", ar: "طويل نصف مرفوع منسدل" } },
    { id: "long_high_ponytail", group: "long", label: { en: "Long High Sleek Ponytail", ar: "ذيل حصان عالٍ طويل" } },
    { id: "long_side_sweep", group: "long", label: { en: "Long Side-Swept Cascade", ar: "طويل منسدل جانبي" } },
    { id: "long_twin_braids", group: "long", label: { en: "Long Sculpted Braids", ar: "ضفائر طويلة متدلية" } },
    { id: "bob", group: "classic", label: { en: "Sleek Bob", ar: "كاريه قصير" } },
    { id: "waves", group: "classic", label: { en: "Shoulder Waves", ar: "موجات للكتف" } },
    { id: "high_bun", group: "classic", label: { en: "High Top Bun", ar: "كعكة مرتفعة" } },
    { id: "low_ponytail", group: "classic", label: { en: "Low Ponytail", ar: "ذيل حصان منخفض" } },
    { id: "pixie_crop", group: "classic", label: { en: "Pixie Crop", ar: "قصة بيكسي قصيرة" } },
    { id: "curly_afro", group: "classic", label: { en: "Voluminous Afro Curls", ar: "كيرلي كثيف" } },
    { id: "crown_braid", group: "classic", label: { en: "Crown Braid", ar: "ضفيرة التاج" } },
    { id: "french_twist", group: "classic", label: { en: "French Twist", ar: "لفة فرنسية" } },
    { id: "voluminous_updo", group: "classic", label: { en: "Couture Updo", ar: "تسريحة كوتور مرفوعة" } },
    { id: "side_chignon", group: "classic", label: { en: "Side Chignon", ar: "شينيون جانبي" } },
    { id: "glam_bun", group: "classic", label: { en: "Editorial Glam Bun", ar: "كعكة فاخرة" } },
    { id: "bald", group: "classic", label: { en: "Clean Shaved / Bare", ar: "حليق بالكامل" } },
  ]),
  girls: Object.freeze([
    { id: "ponytails", group: "classic", label: { en: "Twin Ponytails", ar: "ضفيرتان جانبيتان" } },
    { id: "long_straight", group: "long", label: { en: "Long Sleek", ar: "شعر طويل أملس" } },
    { id: "long_wavy", group: "long", label: { en: "Long Soft Waves", ar: "شعر طويل مموج" } },
    { id: "long_waist_straight", group: "long", label: { en: "Extra-Long Sleek Straight", ar: "طويل جداً أملس" } },
    { id: "long_hollywood_waves", group: "long", label: { en: "Long Princess Waves", ar: "موجات طويلة ناعمة" } },
    { id: "long_layered_curls", group: "long", label: { en: "Long Bouncy Curls", ar: "كيرلي طويل متدرج" } },
    { id: "long_twin_braids", group: "long", label: { en: "Long Twin Braids", ar: "ضفيرتان طويلتان" } },
    { id: "long_high_ponytail", group: "long", label: { en: "Long High Ponytail", ar: "ذيل حصان عالٍ طويل" } },
    { id: "single_ponytail", group: "classic", label: { en: "Single Ponytail", ar: "ذيل حصان" } },
    { id: "half_up", group: "classic", label: { en: "Half-Up Style", ar: "نصف مرفوع" } },
    { id: "double_braid_buns", group: "classic", label: { en: "Double Braid Buns", ar: "كعكتا ضفائر" } },
    { id: "twin_buns", group: "classic", label: { en: "Twin Top Buns", ar: "كعكتان علويتان" } },
    { id: "ribbon_ponytail", group: "classic", label: { en: "Ribbon Ponytail", ar: "ذيل حصان بشريطة" } },
    { id: "headband_bob", group: "classic", label: { en: "Headband Bob", ar: "كاريه بطوق" } },
    { id: "toddler_puffs", group: "classic", label: { en: "Playful Puffs", ar: "نفشتان علويتان" } },
    { id: "side_braid_bun", group: "classic", label: { en: "Side Braid Bun", ar: "كعكة ضفيرة جانبية" } },
    { id: "high_pony_wave", group: "classic", label: { en: "High Wavy Pony", ar: "ذيل حصان عالٍ مموج" } },
    { id: "teen_bun", group: "classic", label: { en: "Sleek Low Bun", ar: "كعكة ناعمة" } },
    { id: "curly_afro", group: "classic", label: { en: "Full Curly Halo", ar: "كيرلي كثيف" } },
    { id: "bald", group: "classic", label: { en: "Clean Shaved / Bare", ar: "حليق بالكامل" } },
  ]),
  men: Object.freeze([
    { id: "classic_men", group: "classic", label: { en: "Classic Tailored", ar: "كلاسيكي مرتب" } },
    { id: "long_men", group: "long", label: { en: "Shoulder Sweep", ar: "شعر طويل للكتف" } },
    { id: "long_men_waves", group: "long", label: { en: "Long Flowing Waves", ar: "شعر طويل مموج" } },
    { id: "long_men_straight", group: "long", label: { en: "Long Straight Mid-Back", ar: "شعر طويل أملس" } },
    { id: "long_men_half_up", group: "long", label: { en: "Long Half-Up Knot", ar: "طويل نصف مرفوع" } },
    { id: "textured_crop", group: "classic", label: { en: "Textured Crop", ar: "قصّة متدرجة" } },
    { id: "buzz_fade", group: "classic", label: { en: "Buzz Fade", ar: "حلاقة خفيفة متدرجة" } },
    { id: "quiff", group: "classic", label: { en: "Volume Quiff", ar: "كويف أمامي" } },
    { id: "parted_pomp", group: "classic", label: { en: "Parted Pompadour", ar: "بومبادور مفرق" } },
    { id: "swept_back", group: "classic", label: { en: "Swept Back", ar: "مسحوب للخلف" } },
    { id: "executive_comb", group: "classic", label: { en: "Executive Side Part", ar: "فرق جانبي أنيق" } },
    { id: "short_taper", group: "classic", label: { en: "Short Taper", ar: "قصير متدرج" } },
    { id: "curly_fade", group: "classic", label: { en: "Curly Crown Fade", ar: "كيرلي بتدريج جانبي" } },
    { id: "man_bun", group: "classic", label: { en: "Tied Top Knot", ar: "كعكة علوية" } },
    { id: "classic_wave", group: "classic", label: { en: "Natural Wave", ar: "موج طبيعي" } },
    { id: "side_crop", group: "classic", label: { en: "Side Crop", ar: "قصة جانبية" } },
    { id: "classic_crown", group: "classic", label: { en: "Full Crown Wave", ar: "تاج مموج" } },
    { id: "bald", group: "classic", label: { en: "Clean Shaved / Bald", ar: "أصلع / حليق" } },
  ]),
  boys: Object.freeze([
    { id: "boys_crop", group: "classic", label: { en: "Classic Boys Crop", ar: "قصّة ولادي كلاسيكية" } },
    { id: "long_men", group: "long", label: { en: "Medium Shag", ar: "شعر متوسط الطول" } },
    { id: "long_men_waves", group: "long", label: { en: "Long Surfer Waves", ar: "طويل مموج" } },
    { id: "long_men_straight", group: "long", label: { en: "Long Straight Flow", ar: "طويل أملس" } },
    { id: "toddler_curls", group: "classic", label: { en: "Soft Crown Curls", ar: "تجعدات ناعمة" } },
    { id: "varsity_crop", group: "classic", label: { en: "Varsity Part", ar: "قصة مدرسية" } },
    { id: "side_sweep_jr", group: "classic", label: { en: "Side Sweep", ar: "تمشيطة جانبية" } },
    { id: "taper_quiff_jr", group: "classic", label: { en: "Junior Quiff", ar: "كويف شبابي" } },
    { id: "classic_jr_wave", group: "classic", label: { en: "Junior Wave", ar: "موجة ناعمة" } },
    { id: "soft_fringe", group: "classic", label: { en: "Textured Fringe", ar: "غرة متدرجة" } },
    { id: "sport_crop", group: "classic", label: { en: "Sport Buzz", ar: "قصّة رياضية" } },
    { id: "youth_fade", group: "classic", label: { en: "Youth Fade", ar: "تدريج شبابي" } },
    { id: "teen_wave", group: "classic", label: { en: "Teen Wave", ar: "موجة عصرية" } },
    { id: "athletic_cut", group: "classic", label: { en: "Athletic Crop", ar: "قصة رياضية قصيرة" } },
    { id: "curly_fade", group: "classic", label: { en: "Curly Top Fade", ar: "كيرلي بتدريج" } },
    { id: "bald", group: "classic", label: { en: "Clean Shaved / Buzz", ar: "حليق بالكامل" } },
  ]),
});

export function getHaircutsForCategory(category) {
  return HAIRCUT_CATALOG[category] || HAIRCUT_CATALOG.women;
}

export const HEADWEAR_FABRIC_PRESETS = Object.freeze([
  {
    id: "crepe",
    label: { en: "Matte Crepe", ar: "كريب مطفي" },
    roughness: 0.78,
    sheen: 0.28,
    sheenRoughness: 0.74,
    shininess: 14,
    pleatScale: 1.0,
    weaveStrength: 0.08,
  },
  {
    id: "silk",
    label: { en: "Soft Silk", ar: "حرير ناعم" },
    roughness: 0.34,
    sheen: 0.84,
    sheenRoughness: 0.34,
    shininess: 48,
    pleatScale: 0.88,
    weaveStrength: 0.03,
  },
  {
    id: "chiffon",
    label: { en: "Airy Chiffon", ar: "شيفون انسيابي" },
    roughness: 0.62,
    sheen: 0.54,
    sheenRoughness: 0.52,
    shininess: 24,
    pleatScale: 1.18,
    weaveStrength: 0.05,
  },
  {
    id: "jersey",
    label: { en: "Modal Jersey", ar: "جيرسي ناعم" },
    roughness: 0.70,
    sheen: 0.38,
    sheenRoughness: 0.64,
    shininess: 18,
    pleatScale: 0.92,
    weaveStrength: 0.06,
  },
]);

export const HEADWEAR_FABRIC_MAP = Object.freeze(Object.fromEntries(HEADWEAR_FABRIC_PRESETS.map((f) => [f.id, f])));

export function getHeadwearFabricSpec(fabricId) {
  return HEADWEAR_FABRIC_MAP[fabricId] || HEADWEAR_FABRIC_MAP.crepe;
}

export const HEADWEAR_LENGTH_PRESETS = Object.freeze([
  { id: "standard", label: { en: "Chest Length", ar: "طول للصدر" }, frontTarget: "upperChest", backTarget: "upperBack", dropScale: 0.88 },
  { id: "long", label: { en: "Long (Mid-Torso)", ar: "طويل لمنتصف الجسم" }, frontTarget: "underBust", backTarget: "midBack", dropScale: 1.08 },
  { id: "extra_long", label: { en: "Extra Long (Waist–Hip)", ar: "طويل جداً للخصر" }, frontTarget: "waist", backTarget: "hip", dropScale: 1.32 },
]);

export const HEADWEAR_LENGTH_MAP = Object.freeze(Object.fromEntries(HEADWEAR_LENGTH_PRESETS.map((l) => [l.id, l])));

export function getHeadwearLengthSpec(lengthId) {
  return HEADWEAR_LENGTH_MAP[lengthId] || HEADWEAR_LENGTH_MAP.standard;
}

export const UNDERCAP_COLOR_PRESETS = Object.freeze([
  { id: "jet_black", hex: "#131418", label: { en: "Jet Black", ar: "أسود فاحم" } },
  { id: "espresso", hex: "#2a211d", label: { en: "Dark Espresso", ar: "بني داكن" } },
  { id: "ivory", hex: "#f5f1e8", label: { en: "Ivory", ar: "عاجي" } },
  { id: "sand", hex: "#d7c3a3", label: { en: "Sand Beige", ar: "بيج رملي" } },
  { id: "charcoal", hex: "#3b414c", label: { en: "Charcoal", ar: "فحمي" } },
  { id: "navy", hex: "#1e3252", label: { en: "Midnight Navy", ar: "كحلي" } },
  { id: "burgundy", hex: "#5c2030", label: { en: "Burgundy", ar: "عنابي" } },
  { id: "rose", hex: "#c48b91", label: { en: "Soft Rose", ar: "وردي هادئ" } },
]);

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
  // ---- Women & Girls Classic & Long Islamic Hijabs ----
  {
    id: "hijab_classic",
    categories: ["women", "girls"],
    group: "hijab",
    label: { en: "Classic Draped Hijab", ar: "حجاب كلاسيكي منسدل" },
    defaultColor: "#f3ece4",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: false,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "jersey",
    defaultLength: "standard",
    defaultUndercapColor: "#232429",
  },
  {
    id: "hijab_turkish",
    categories: ["women", "girls"],
    group: "hijab",
    label: { en: "Turkish Silk Hijab", ar: "حجاب تركي حريري" },
    defaultColor: "#c8a99a",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: false,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "silk",
    defaultLength: "standard",
    defaultUndercapColor: "#2c2928",
  },
  {
    id: "hijab_turban",
    categories: ["women", "girls"],
    group: "hijab",
    label: { en: "Pleated Turban Hijab", ar: "توربان حجاب مطوي" },
    defaultColor: "#2e473b",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: false,
    supportsFabric: true,
    supportsLength: false,
    supportsUndercap: true,
    defaultFabric: "jersey",
    defaultLength: "standard",
    defaultUndercapColor: "#1b2922",
  },
  {
    id: "hijab_shayla",
    categories: ["women", "girls"],
    group: "hijab",
    label: { en: "Gulf Shayla Wrap", ar: "شيلة خليجية منسدلة" },
    defaultColor: "#1b1c20",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: false,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "chiffon",
    defaultLength: "standard",
    defaultUndercapColor: "#131418",
  },
  {
    id: "hijab_khimar",
    categories: ["women", "girls"],
    group: "hijab",
    label: { en: "Modest Khimar Cape", ar: "خمار ساتر للصدر" },
    defaultColor: "#2b2930",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: false,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "crepe",
    defaultLength: "long",
    defaultUndercapColor: "#1e1f24",
  },
  {
    id: "hijab_long_draped",
    categories: ["women", "girls"],
    group: "hijab",
    label: { en: "Long Islamic Draped Hijab", ar: "حجاب إسلامي طويل منسدل" },
    defaultColor: "#25262c",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: false,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "chiffon",
    defaultLength: "long",
    defaultUndercapColor: "#141519",
  },
  {
    id: "hijab_long_khimar",
    categories: ["women", "girls"],
    group: "hijab",
    label: { en: "Extra-Long Waist Khimar", ar: "خمار إسلامي طويل للخصر" },
    defaultColor: "#1e2028",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: false,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "crepe",
    defaultLength: "extra_long",
    defaultUndercapColor: "#131418",
  },
  {
    id: "hijab_french_jilbab",
    categories: ["women", "girls"],
    group: "hijab",
    label: { en: "French Jilbab / Overhead Khimar", ar: "جلباب فرنسي / خمار علوي" },
    defaultColor: "#2e3538",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: false,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "crepe",
    defaultLength: "extra_long",
    defaultUndercapColor: "#1a1d20",
  },
  {
    id: "hijab_long_shayla",
    categories: ["women", "girls"],
    group: "hijab",
    label: { en: "Long Gulf Layered Shayla", ar: "شيلة خليجية طويلة مزدوجة" },
    defaultColor: "#17181d",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: false,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "chiffon",
    defaultLength: "long",
    defaultUndercapColor: "#131418",
  },
  // ---- Women & Girls Islamic Niqab Versions ----
  {
    id: "hijab_niqab",
    categories: ["women", "girls"],
    group: "niqab",
    label: { en: "Classic Hijab & Niqab", ar: "حجاب ونقاب كلاسيكي" },
    defaultColor: "#18191d",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: true,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "crepe",
    defaultLength: "standard",
    defaultUndercapColor: "#101114",
    defaultEyeScreen: false,
  },
  {
    id: "niqab_long_saudi",
    categories: ["women", "girls"],
    group: "niqab",
    label: { en: "Long Saudi 1-Layer Niqab", ar: "نقاب سعودي طويل بطبقة واحدة" },
    defaultColor: "#141519",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: true,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "crepe",
    defaultLength: "extra_long",
    defaultUndercapColor: "#101114",
    defaultEyeScreen: false,
  },
  {
    id: "niqab_long_layered",
    categories: ["women", "girls"],
    group: "niqab",
    label: { en: "Long 2-Layer Gulf Niqab", ar: "نقاب خليجي طويل بطبقتين" },
    defaultColor: "#15161b",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: true,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "chiffon",
    defaultLength: "extra_long",
    defaultUndercapColor: "#101114",
    defaultEyeScreen: false,
  },
  {
    id: "niqab_khimar_long",
    categories: ["women", "girls"],
    group: "niqab",
    label: { en: "Long Khimar & Half-Niqab", ar: "خمار طويل مع نصف نقاب" },
    defaultColor: "#1e2530",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: true,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "crepe",
    defaultLength: "extra_long",
    defaultUndercapColor: "#13161d",
    defaultEyeScreen: false,
  },
  {
    id: "niqab_eye_screen",
    categories: ["women", "girls"],
    group: "niqab",
    label: { en: "Long Niqab & Eye Screen (Ghashwa)", ar: "نقاب طويل مع غشوة للعين" },
    defaultColor: "#131418",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: true,
    supportsFabric: true,
    supportsLength: true,
    supportsUndercap: true,
    defaultFabric: "chiffon",
    defaultLength: "extra_long",
    defaultUndercapColor: "#0e0f12",
    defaultEyeScreen: true,
  },
  {
    id: "hijab_sport",
    categories: ["women", "girls"],
    group: "hijab",
    label: { en: "Sport Pull-On Hijab", ar: "حجاب رياضي عملي" },
    defaultColor: "#334155",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
    isHijab: true,
    isNiqab: false,
    supportsFabric: true,
    supportsLength: false,
    supportsUndercap: true,
    defaultFabric: "jersey",
    defaultLength: "standard",
    defaultUndercapColor: "#e2e8f0",
  },
  {
    id: "sun_hat",
    categories: ["women", "girls"],
    group: "hat",
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
    group: "traditional",
    label: { en: "White Ghutra & Iqal", ar: "غترة بيضاء وعقال" },
    defaultColor: "#f6f5f1",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "shemagh_iqal",
    categories: ["men", "boys"],
    group: "traditional",
    label: { en: "Red Shemagh & Iqal", ar: "شماغ أحمر وعقال" },
    defaultColor: "#b8232c",
    hidesHair: true,
    coversCrown: true,
    pattern: "shemagh_red",
  },
  {
    id: "shemagh_black_iqal",
    categories: ["men", "boys"],
    group: "traditional",
    label: { en: "Black & White Shemagh", ar: "شماغ أسود وأبيض وعقال" },
    defaultColor: "#222428",
    hidesHair: true,
    coversCrown: true,
    pattern: "shemagh_dark",
  },
  {
    id: "ghutra_hamdaniyah",
    categories: ["men", "boys"],
    group: "traditional",
    label: { en: "Hamdaniyah Wrapped Ghutra", ar: "غترة حمدانية ملفوفة" },
    defaultColor: "#f3f1ea",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "taqiyah",
    categories: ["men", "boys"],
    group: "traditional",
    label: { en: "Embroidered Taqiyah", ar: "طاقية مطرّزة" },
    defaultColor: "#f4f2ec",
    hidesHair: false,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "shawl_wrap",
    categories: ["men", "boys"],
    group: "traditional",
    label: { en: "Wrapped Heritage Shawl", ar: "شال تقليدي ملفوف" },
    defaultColor: "#8b6f4e",
    hidesHair: true,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "fedora",
    categories: ["men", "boys"],
    group: "hat",
    label: { en: "Tailored Fedora Hat", ar: "قبعة فيدورا كلاسيكية" },
    defaultColor: "#3b3530",
    hidesHair: false,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "baseball_cap",
    categories: ["men", "boys"],
    group: "hat",
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
    group: "hat",
    label: { en: "Tailored Beret", ar: "قبعة بيريه" },
    defaultColor: "#692232",
    hidesHair: false,
    coversCrown: true,
    pattern: null,
  },
  {
    id: "beanie",
    categories: ["women", "girls", "men", "boys"],
    group: "hat",
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
  const hairLength = HAIR_LENGTH_MAP[ov.hairLength]?.id || HAIR_LENGTH_MAP[preset?.hairLength]?.id || "natural";
  const highlightSpec = getHairHighlightSpec(ov.hairHighlight ?? preset?.hairHighlight);
  const hairHighlight = highlightSpec.id;

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

  const defaultFabric = hwSpec.defaultFabric || "crepe";
  const headwearFabric = headwear === "none"
    ? defaultFabric
    : (HEADWEAR_FABRIC_MAP[ov.headwearFabric]?.id || HEADWEAR_FABRIC_MAP[preset?.headwearFabric]?.id || defaultFabric);

  const defaultLength = hwSpec.defaultLength || "standard";
  const headwearLength = headwear === "none"
    ? defaultLength
    : (HEADWEAR_LENGTH_MAP[ov.headwearLength]?.id || HEADWEAR_LENGTH_MAP[preset?.headwearLength]?.id || defaultLength);

  const undercapHex = headwear === "none" || !hwSpec.supportsUndercap
    ? null
    : normalizeHexColor(ov.undercapColor ?? ov.undercapHex, hwSpec.defaultUndercapColor || "#1a1b20");
  const undercapColor = undercapHex ? hexToInt(undercapHex, 0x1a1b20) : null;

  const niqabEyeScreen = Boolean(
    hwSpec.isNiqab && (ov.niqabEyeScreen != null ? ov.niqabEyeScreen : (preset?.niqabEyeScreen ?? hwSpec.defaultEyeScreen))
  );

  const hasOverrides = Boolean(
    ov.hairStyle ||
    (ov.hairType && ov.hairType !== "straight") ||
    (ov.hairLength && ov.hairLength !== "natural") ||
    (ov.hairHighlight && ov.hairHighlight !== "none") ||
    ov.hairColor ||
    (ov.headwear && ov.headwear !== "none") ||
    ov.headwearColor ||
    ov.headwearFabric ||
    ov.headwearLength ||
    ov.undercapColor ||
    ov.niqabEyeScreen != null
  );

  return {
    category: cat,
    hairStyle,
    hairType,
    hairLength,
    hairHighlight,
    hairHex,
    hairColor,
    headwear,
    headwearHex,
    headwearColor,
    headwearFabric,
    headwearLength,
    undercapHex,
    undercapColor,
    niqabEyeScreen,
    hasOverrides,
  };
}
