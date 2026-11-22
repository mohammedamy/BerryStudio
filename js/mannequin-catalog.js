/* ============================================================
   BerryStudio Studio Mannequin Catalog — Single Source of Truth
   44 curated size-specific fit models across 4 categories:
     - 11 Women  (XXS, XS, S, M, L, XL, XXL, XXXL, 4XL, 5XL, 6XL)
     - 11 Girls  (XXS, XS, S, M, L, XL, XXL, XXXL, 4XL, 5XL, 6XL)
     - 11 Men    (XXS, XS, S, M, L, XL, XXL, XXXL, 4XL, 5XL, 6XL)
     - 11 Boys   (XXS, XS, S, M, L, XL, XXL, XXXL, 4XL, 5XL, 6XL)
   Pure zero-dependency ES module shared across the main app,
   3D Preview, Cloth Lab, and BodyForm.
   ============================================================ */

export const MANNEQUIN_CATEGORIES = Object.freeze(["women", "girls", "men", "boys"]);

export const ACTIVE_MANNEQUIN_SIZES = Object.freeze(["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL"]);

export const PLANNED_MANNEQUIN_SIZES = Object.freeze([]);

export const MANNEQUIN_SIZE_ALIASES = Object.freeze({
  XXXXL: "4XL",
});

const CATEGORY_BASE_LABELS = Object.freeze({
  women: { en: "Women", ar: "حريمي" },
  girls: { en: "Girls", ar: "بناتي" },
  men: { en: "Men", ar: "رجالي" },
  boys: { en: "Boys", ar: "ولادي" },
});

const STANDARD_DEFS = Object.freeze({
  intl: { chest: 0, waist: 0, hips: 0, ease: 1.0 },
  egypt: { chest: 1, waist: 2, hips: 1, ease: 1.04 },
  saudi: { chest: 2, waist: 1, hips: 2, ease: 1.06 },
});

function toHexCss(n) {
  return "#" + Number(n).toString(16).padStart(6, "0");
}

function entry({ id, category, size, isBase = false, buildLabel, measurements, morph, hairStyle, skinColor, hairColor }) {
  const catLbl = CATEGORY_BASE_LABELS[category];
  return Object.freeze({
    id,
    category,
    size,
    isBase,
    name: Object.freeze({
      en: `${catLbl.en} · ${size}`,
      ar: `${catLbl.ar} · ${size}`,
    }),
    buildLabel: Object.freeze({ ...buildLabel }),
    measurements: Object.freeze({ ...measurements }),
    morph: Object.freeze({ ...morph }),
    hairStyle,
    skinColor,
    skinHex: toHexCss(skinColor),
    hairColor,
    hairHex: toHexCss(hairColor),
  });
}

export const MANNEQUIN_CATALOG = Object.freeze([
  // ---------------- WOMEN (11: XXS..6XL) ----------------
  entry({
    id: "women_xxs",
    category: "women",
    size: "XXS",
    buildLabel: { en: "Petite Slim", ar: "نحيف جداً" },
    measurements: { chest: 76, waist: 58, hips: 84, shoulder: 36, backLen: 38.3, sleeve: 54.2, neck: 34.6, bicep: 24.4, inseam: 73.0, thigh: 47.4, height: 158 },
    morph: { bustScale: 0.82, bellyFullness: 0.55, gluteFullness: 0.85, lumbarScale: 1.07, headRatio: null, cheekFullness: -0.08 },
    hairStyle: "pixie_crop",
    skinColor: 0xedc2aa,
    hairColor: 0x462a18,
  }),
  entry({
    id: "women_xs",
    category: "women",
    size: "XS",
    buildLabel: { en: "Petite", ar: "صغير جداً" },
    measurements: { chest: 80, waist: 62, hips: 88, shoulder: 37, backLen: 39.2, sleeve: 55.5, neck: 35.4, bicep: 25.6, inseam: 74.5, thigh: 49.0, height: 161 },
    morph: { bustScale: 0.88, bellyFullness: 0.65, gluteFullness: 0.90, lumbarScale: 1.05, headRatio: null, cheekFullness: -0.06 },
    hairStyle: "high_bun",
    skinColor: 0xe7baa2,
    hairColor: 0x3b2314,
  }),
  entry({
    id: "women_s",
    category: "women",
    size: "S",
    buildLabel: { en: "Slim", ar: "رشيق" },
    measurements: { chest: 84, waist: 66, hips: 92, shoulder: 38, backLen: 40.1, sleeve: 56.8, neck: 36.2, bicep: 26.8, inseam: 76.2, thigh: 50.5, height: 164 },
    morph: { bustScale: 0.94, bellyFullness: 0.82, gluteFullness: 0.95, lumbarScale: 1.02, headRatio: null, cheekFullness: -0.03 },
    hairStyle: "bob",
    skinColor: 0xdba487,
    hairColor: 0x4c2d19,
  }),
  entry({
    id: "women_m",
    category: "women",
    size: "M",
    isBase: true,
    buildLabel: { en: "Classic", ar: "قياسي" },
    measurements: { chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 52, height: 167 },
    morph: { bustScale: 1.0, bellyFullness: 1.0, gluteFullness: 1.0, lumbarScale: 1.0, headRatio: null, cheekFullness: 0 },
    hairStyle: "chignon",
    skinColor: 0xdca98e,
    hairColor: 0x261812,
  }),
  entry({
    id: "women_l",
    category: "women",
    size: "L",
    buildLabel: { en: "Standard", ar: "متوسط ممتلئ" },
    measurements: { chest: 92.5, waist: 74.5, hips: 100.5, shoulder: 40.2, backLen: 42, sleeve: 59.4, neck: 37.9, bicep: 29.6, inseam: 79.5, thigh: 54.0, height: 170 },
    morph: { bustScale: 1.08, bellyFullness: 1.24, gluteFullness: 1.08, lumbarScale: 0.96, headRatio: null, cheekFullness: 0.04 },
    hairStyle: "waves",
    skinColor: 0xd09878,
    hairColor: 0x321c12,
  }),
  entry({
    id: "women_xl",
    category: "women",
    size: "XL",
    buildLabel: { en: "Curvy", ar: "كيرفي ممتلئ" },
    measurements: { chest: 97, waist: 80, hips: 105, shoulder: 41.4, backLen: 43, sleeve: 60.8, neck: 38.9, bicep: 31.4, inseam: 80.5, thigh: 56.4, height: 172 },
    morph: { bustScale: 1.15, bellyFullness: 1.48, gluteFullness: 1.15, lumbarScale: 0.92, headRatio: null, cheekFullness: 0.09 },
    hairStyle: "side_chignon",
    skinColor: 0xc28969,
    hairColor: 0x1f1410,
  }),
  entry({
    id: "women_xxl",
    category: "women",
    size: "XXL",
    buildLabel: { en: "Plus", ar: "مقاس خاص" },
    measurements: { chest: 102, waist: 85.5, hips: 110, shoulder: 42.6, backLen: 44, sleeve: 62, neck: 39.9, bicep: 33.4, inseam: 81.5, thigh: 59.0, height: 174 },
    morph: { bustScale: 1.22, bellyFullness: 1.72, gluteFullness: 1.22, lumbarScale: 0.88, headRatio: null, cheekFullness: 0.14 },
    hairStyle: "voluminous_updo",
    skinColor: 0xb67b5b,
    hairColor: 0x1a110d,
  }),
  entry({
    id: "women_xxxl",
    category: "women",
    size: "XXXL",
    buildLabel: { en: "Plus Curvy", ar: "مقاس كبير 3XL" },
    measurements: { chest: 108, waist: 92, hips: 116, shoulder: 43.8, backLen: 45, sleeve: 63.2, neck: 41.0, bicep: 35.6, inseam: 82.2, thigh: 62.0, height: 175.5 },
    morph: { bustScale: 1.28, bellyFullness: 1.94, gluteFullness: 1.28, lumbarScale: 0.84, headRatio: null, cheekFullness: 0.16 },
    hairStyle: "crown_braid",
    skinColor: 0xd59d7d,
    hairColor: 0x2b1910,
  }),
  entry({
    id: "women_4xl",
    category: "women",
    size: "4XL",
    buildLabel: { en: "Extended Plus", ar: "مقاس ممتد 4XL" },
    measurements: { chest: 114, waist: 98.5, hips: 122, shoulder: 45.0, backLen: 46, sleeve: 64.4, neck: 42.1, bicep: 37.8, inseam: 82.9, thigh: 65.0, height: 177 },
    morph: { bustScale: 1.34, bellyFullness: 2.16, gluteFullness: 1.34, lumbarScale: 0.81, headRatio: null, cheekFullness: 0.18 },
    hairStyle: "low_ponytail",
    skinColor: 0xc88f6f,
    hairColor: 0x1e130e,
  }),
  entry({
    id: "women_5xl",
    category: "women",
    size: "5XL",
    buildLabel: { en: "Full Plus", ar: "مقاس ممتلئ 5XL" },
    measurements: { chest: 120, waist: 105, hips: 128, shoulder: 46.2, backLen: 47, sleeve: 65.5, neck: 43.2, bicep: 40.0, inseam: 83.6, thigh: 68.0, height: 178.5 },
    morph: { bustScale: 1.40, bellyFullness: 2.38, gluteFullness: 1.40, lumbarScale: 0.78, headRatio: null, cheekFullness: 0.20 },
    hairStyle: "french_twist",
    skinColor: 0xaa7052,
    hairColor: 0x170f0b,
  }),
  entry({
    id: "women_6xl",
    category: "women",
    size: "6XL",
    buildLabel: { en: "Grand Plus", ar: "مقاس واسع 6XL" },
    measurements: { chest: 126, waist: 111.5, hips: 134, shoulder: 47.4, backLen: 48, sleeve: 66.6, neck: 44.3, bicep: 42.2, inseam: 84.3, thigh: 71.0, height: 180 },
    morph: { bustScale: 1.46, bellyFullness: 2.58, gluteFullness: 1.45, lumbarScale: 0.76, headRatio: null, cheekFullness: 0.22 },
    hairStyle: "glam_bun",
    skinColor: 0x9b6346,
    hairColor: 0x140d0a,
  }),

  // ---------------- GIRLS (11: XXS..6XL, toddler to youth/junior progression) ----------------
  entry({
    id: "girls_xxs",
    category: "girls",
    size: "XXS",
    buildLabel: { en: "2–3Y", ar: "٢–٣ سنوات" },
    measurements: { chest: 54, waist: 50, hips: 56.5, shoulder: 24.5, backLen: 23.8, sleeve: 33.0, neck: 25.0, bicep: 16.6, inseam: 41.5, thigh: 29.2, height: 98 },
    morph: { bustScale: 0.60, bellyFullness: 1.15, gluteFullness: 0.86, lumbarScale: 1.0, headRatio: null, cheekFullness: 0.11 },
    hairStyle: "toddler_puffs",
    skinColor: 0xf0c9b2,
    hairColor: 0x593a24,
  }),
  entry({
    id: "girls_xs",
    category: "girls",
    size: "XS",
    buildLabel: { en: "4–5Y", ar: "٤–٥ سنوات" },
    measurements: { chest: 58, waist: 53, hips: 61, shoulder: 26.5, backLen: 26, sleeve: 36.5, neck: 26.5, bicep: 18, inseam: 47, thigh: 32, height: 110 },
    morph: { bustScale: 0.70, bellyFullness: 1.10, gluteFullness: 0.90, lumbarScale: 1.0, headRatio: null, cheekFullness: 0.08 },
    hairStyle: "twin_buns",
    skinColor: 0xebc1a8,
    hairColor: 0x4f321e,
  }),
  entry({
    id: "girls_s",
    category: "girls",
    size: "S",
    buildLabel: { en: "6–7Y", ar: "٦–٧ سنوات" },
    measurements: { chest: 63, waist: 56.5, hips: 66.5, shoulder: 28.8, backLen: 28.5, sleeve: 40, neck: 28.2, bicep: 19.5, inseam: 52.5, thigh: 35, height: 122 },
    morph: { bustScale: 0.85, bellyFullness: 1.04, gluteFullness: 0.95, lumbarScale: 1.0, headRatio: null, cheekFullness: 0.04 },
    hairStyle: "headband_bob",
    skinColor: 0xe6b99f,
    hairColor: 0x3b2416,
  }),
  entry({
    id: "girls_m",
    category: "girls",
    size: "M",
    isBase: true,
    buildLabel: { en: "8–9Y", ar: "٨–٩ سنوات" },
    measurements: { chest: 68, waist: 60, hips: 72, shoulder: 31, backLen: 31, sleeve: 44, neck: 30, bicep: 21, inseam: 58, thigh: 38, height: 134 },
    morph: { bustScale: 1.0, bellyFullness: 1.0, gluteFullness: 1.0, lumbarScale: 1.0, headRatio: null, cheekFullness: 0 },
    hairStyle: "ponytails",
    skinColor: 0xe3b59b,
    hairColor: 0x3b2416,
  }),
  entry({
    id: "girls_l",
    category: "girls",
    size: "L",
    buildLabel: { en: "10–11Y", ar: "١٠–١١ سنة" },
    measurements: { chest: 73, waist: 63, hips: 78, shoulder: 33, backLen: 33.5, sleeve: 48, neck: 31.5, bicep: 22.8, inseam: 63, thigh: 41.5, height: 144 },
    morph: { bustScale: 1.15, bellyFullness: 0.96, gluteFullness: 1.04, lumbarScale: 1.0, headRatio: null, cheekFullness: -0.02 },
    hairStyle: "single_ponytail",
    skinColor: 0xd9a88c,
    hairColor: 0x2d1b12,
  }),
  entry({
    id: "girls_xl",
    category: "girls",
    size: "XL",
    buildLabel: { en: "12–13Y", ar: "١٢–١٣ سنة" },
    measurements: { chest: 78, waist: 66, hips: 84, shoulder: 35, backLen: 36, sleeve: 51.5, neck: 33, bicep: 24.5, inseam: 68, thigh: 45, height: 153 },
    morph: { bustScale: 1.30, bellyFullness: 0.94, gluteFullness: 1.08, lumbarScale: 1.0, headRatio: null, cheekFullness: -0.03 },
    hairStyle: "half_up",
    skinColor: 0xcf9c7f,
    hairColor: 0x241610,
  }),
  entry({
    id: "girls_xxl",
    category: "girls",
    size: "XXL",
    buildLabel: { en: "14–15Y", ar: "١٤–١٥ سنة" },
    measurements: { chest: 83, waist: 68.5, hips: 89, shoulder: 36.8, backLen: 38.5, sleeve: 54.5, neck: 34.2, bicep: 26, inseam: 72, thigh: 48, height: 160 },
    morph: { bustScale: 1.45, bellyFullness: 0.95, gluteFullness: 1.12, lumbarScale: 1.0, headRatio: null, cheekFullness: -0.03 },
    hairStyle: "teen_bun",
    skinColor: 0xc49072,
    hairColor: 0x1d130e,
  }),
  entry({
    id: "girls_xxxl",
    category: "girls",
    size: "XXXL",
    buildLabel: { en: "16Y / Jr L", ar: "١٦ سنة" },
    measurements: { chest: 88, waist: 73, hips: 94.5, shoulder: 38.2, backLen: 40.0, sleeve: 56.5, neck: 35.4, bicep: 27.6, inseam: 74.5, thigh: 51.0, height: 164 },
    morph: { bustScale: 1.55, bellyFullness: 1.02, gluteFullness: 1.16, lumbarScale: 0.98, headRatio: null, cheekFullness: 0.0 },
    hairStyle: "ribbon_ponytail",
    skinColor: 0xdca98d,
    hairColor: 0x342014,
  }),
  entry({
    id: "girls_4xl",
    category: "girls",
    size: "4XL",
    buildLabel: { en: "Jr XL", ar: "شبابي 4XL" },
    measurements: { chest: 93, waist: 78, hips: 100, shoulder: 39.6, backLen: 41.2, sleeve: 58.0, neck: 36.6, bicep: 29.4, inseam: 76.0, thigh: 54.0, height: 167 },
    morph: { bustScale: 1.65, bellyFullness: 1.10, gluteFullness: 1.20, lumbarScale: 0.95, headRatio: null, cheekFullness: 0.03 },
    hairStyle: "side_braid_bun",
    skinColor: 0xcf9b7e,
    hairColor: 0x281810,
  }),
  entry({
    id: "girls_5xl",
    category: "girls",
    size: "5XL",
    buildLabel: { en: "Jr XXL", ar: "شبابي 5XL" },
    measurements: { chest: 98.5, waist: 83.5, hips: 105.5, shoulder: 41.0, backLen: 42.4, sleeve: 59.5, neck: 37.8, bicep: 31.4, inseam: 77.5, thigh: 57.0, height: 169.5 },
    morph: { bustScale: 1.75, bellyFullness: 1.20, gluteFullness: 1.24, lumbarScale: 0.92, headRatio: null, cheekFullness: 0.06 },
    hairStyle: "high_pony_wave",
    skinColor: 0xb98568,
    hairColor: 0x1e130d,
  }),
  entry({
    id: "girls_6xl",
    category: "girls",
    size: "6XL",
    buildLabel: { en: "Jr Plus", ar: "شبابي 6XL" },
    measurements: { chest: 104, waist: 89, hips: 111, shoulder: 42.4, backLen: 43.6, sleeve: 61.0, neck: 39.0, bicep: 33.4, inseam: 79.0, thigh: 60.0, height: 172 },
    morph: { bustScale: 1.85, bellyFullness: 1.32, gluteFullness: 1.28, lumbarScale: 0.90, headRatio: null, cheekFullness: 0.09 },
    hairStyle: "double_braid_buns",
    skinColor: 0xa97659,
    hairColor: 0x170f0b,
  }),

  // ---------------- MEN (11: XXS..6XL) ----------------
  entry({
    id: "men_xxs",
    category: "men",
    size: "XXS",
    buildLabel: { en: "Extra Slim", ar: "نحيف جداً" },
    measurements: { chest: 85, waist: 70, hips: 86.5, shoulder: 41.8, backLen: 41.7, sleeve: 59.5, neck: 36.4, bicep: 28.2, inseam: 76.0, thigh: 48.8, height: 167 },
    morph: { bustScale: 0.82, bellyFullness: 0.50, gluteFullness: 0.86, lumbarScale: 1.06, headRatio: null, cheekFullness: -0.07 },
    hairStyle: "textured_crop",
    skinColor: 0xe2ae90,
    hairColor: 0x3b2619,
  }),
  entry({
    id: "men_xs",
    category: "men",
    size: "XS",
    buildLabel: { en: "Slim", ar: "نحيف" },
    measurements: { chest: 90, waist: 75, hips: 91, shoulder: 43.2, backLen: 42.8, sleeve: 61, neck: 37.6, bicep: 29.8, inseam: 78, thigh: 50.8, height: 171 },
    morph: { bustScale: 0.88, bellyFullness: 0.60, gluteFullness: 0.90, lumbarScale: 1.04, headRatio: null, cheekFullness: -0.05 },
    hairStyle: "side_crop",
    skinColor: 0xd9a486,
    hairColor: 0x2e1e15,
  }),
  entry({
    id: "men_s",
    category: "men",
    size: "S",
    buildLabel: { en: "Tailored", ar: "رشيق" },
    measurements: { chest: 95, waist: 80.5, hips: 95.5, shoulder: 44.6, backLen: 43.9, sleeve: 62.5, neck: 38.8, bicep: 31.4, inseam: 80, thigh: 52.9, height: 175 },
    morph: { bustScale: 0.94, bellyFullness: 0.80, gluteFullness: 0.95, lumbarScale: 1.02, headRatio: null, cheekFullness: -0.02 },
    hairStyle: "quiff",
    skinColor: 0xd29c7e,
    hairColor: 0x3c271a,
  }),
  entry({
    id: "men_m",
    category: "men",
    size: "M",
    isBase: true,
    buildLabel: { en: "Classic", ar: "قياسي" },
    measurements: { chest: 100, waist: 86, hips: 100, shoulder: 46, backLen: 45, sleeve: 64, neck: 40, bicep: 33, inseam: 82, thigh: 55, height: 178 },
    morph: { bustScale: 1.0, bellyFullness: 1.0, gluteFullness: 1.0, lumbarScale: 1.0, headRatio: null, cheekFullness: 0 },
    hairStyle: "classic_men",
    skinColor: 0xcb9578,
    hairColor: 0x201610,
  }),
  entry({
    id: "men_l",
    category: "men",
    size: "L",
    buildLabel: { en: "Athletic", ar: "رياضي" },
    measurements: { chest: 105, waist: 91.5, hips: 104.5, shoulder: 47.4, backLen: 46, sleeve: 65.5, neck: 41.2, bicep: 34.6, inseam: 83.5, thigh: 57.0, height: 181 },
    morph: { bustScale: 1.08, bellyFullness: 1.24, gluteFullness: 1.07, lumbarScale: 0.96, headRatio: null, cheekFullness: 0.04 },
    hairStyle: "swept_back",
    skinColor: 0xc08a6c,
    hairColor: 0x2a1b13,
  }),
  entry({
    id: "men_xl",
    category: "men",
    size: "XL",
    buildLabel: { en: "Broad", ar: "عريض" },
    measurements: { chest: 110, waist: 97, hips: 109.5, shoulder: 48.8, backLen: 47, sleeve: 67, neck: 42.4, bicep: 36.4, inseam: 84.5, thigh: 59.2, height: 184 },
    morph: { bustScale: 1.14, bellyFullness: 1.50, gluteFullness: 1.14, lumbarScale: 0.92, headRatio: null, cheekFullness: 0.08 },
    hairStyle: "short_taper",
    skinColor: 0xb27b5e,
    hairColor: 0x19120e,
  }),
  entry({
    id: "men_xxl",
    category: "men",
    size: "XXL",
    buildLabel: { en: "Full", ar: "ممتلئ كبير" },
    measurements: { chest: 114, waist: 101, hips: 114, shoulder: 50.0, backLen: 48, sleeve: 68, neck: 43.6, bicep: 38.0, inseam: 85.5, thigh: 61.2, height: 186 },
    morph: { bustScale: 1.18, bellyFullness: 1.75, gluteFullness: 1.20, lumbarScale: 0.88, headRatio: null, cheekFullness: 0.13 },
    hairStyle: "classic_wave",
    skinColor: 0xa46f53,
    hairColor: 0x241913,
  }),
  entry({
    id: "men_xxxl",
    category: "men",
    size: "XXXL",
    buildLabel: { en: "Big & Broad", ar: "مقاس كبير 3XL" },
    measurements: { chest: 120, waist: 108, hips: 119.5, shoulder: 51.4, backLen: 49.2, sleeve: 69.2, neck: 44.8, bicep: 39.8, inseam: 86.5, thigh: 63.6, height: 188 },
    morph: { bustScale: 1.24, bellyFullness: 1.98, gluteFullness: 1.25, lumbarScale: 0.85, headRatio: null, cheekFullness: 0.16 },
    hairStyle: "buzz_fade",
    skinColor: 0xc89274,
    hairColor: 0x221711,
  }),
  entry({
    id: "men_4xl",
    category: "men",
    size: "4XL",
    buildLabel: { en: "Extended Big", ar: "مقاس ممتد 4XL" },
    measurements: { chest: 126, waist: 115, hips: 125, shoulder: 52.8, backLen: 50.4, sleeve: 70.4, neck: 46.0, bicep: 41.6, inseam: 87.5, thigh: 66.0, height: 190 },
    morph: { bustScale: 1.30, bellyFullness: 2.22, gluteFullness: 1.30, lumbarScale: 0.82, headRatio: null, cheekFullness: 0.18 },
    hairStyle: "parted_pomp",
    skinColor: 0xb78062,
    hairColor: 0x1d140f,
  }),
  entry({
    id: "men_5xl",
    category: "men",
    size: "5XL",
    buildLabel: { en: "Full Big", ar: "مقاس ممتلئ 5XL" },
    measurements: { chest: 132, waist: 122, hips: 130.5, shoulder: 54.2, backLen: 51.6, sleeve: 71.6, neck: 47.2, bicep: 43.4, inseam: 88.5, thigh: 68.4, height: 192 },
    morph: { bustScale: 1.36, bellyFullness: 2.45, gluteFullness: 1.35, lumbarScale: 0.79, headRatio: null, cheekFullness: 0.20 },
    hairStyle: "executive_comb",
    skinColor: 0x9c684d,
    hairColor: 0x16100c,
  }),
  entry({
    id: "men_6xl",
    category: "men",
    size: "6XL",
    buildLabel: { en: "Grand Big", ar: "مقاس واسع 6XL" },
    measurements: { chest: 138, waist: 129, hips: 136, shoulder: 55.6, backLen: 52.8, sleeve: 72.8, neck: 48.4, bicep: 45.2, inseam: 89.5, thigh: 70.8, height: 194 },
    morph: { bustScale: 1.42, bellyFullness: 2.66, gluteFullness: 1.40, lumbarScale: 0.77, headRatio: null, cheekFullness: 0.22 },
    hairStyle: "classic_crown",
    skinColor: 0x8e5c43,
    hairColor: 0x130e0b,
  }),

  // ---------------- BOYS (11: XXS..6XL, toddler to youth/junior progression) ----------------
  entry({
    id: "boys_xxs",
    category: "boys",
    size: "XXS",
    buildLabel: { en: "2–3Y", ar: "٢–٣ سنوات" },
    measurements: { chest: 55, waist: 52, hips: 57.5, shoulder: 25, backLen: 24.5, sleeve: 34.0, neck: 25.5, bicep: 17.0, inseam: 42.5, thigh: 30.0, height: 100 },
    morph: { bustScale: 0.72, bellyFullness: 1.15, gluteFullness: 0.86, lumbarScale: 1.0, headRatio: null, cheekFullness: 0.11 },
    hairStyle: "toddler_curls",
    skinColor: 0xe9bca1,
    hairColor: 0x523420,
  }),
  entry({
    id: "boys_xs",
    category: "boys",
    size: "XS",
    buildLabel: { en: "4–5Y", ar: "٤–٥ سنوات" },
    measurements: { chest: 59, waist: 55, hips: 62, shoulder: 27, backLen: 27, sleeve: 37.5, neck: 27, bicep: 18.5, inseam: 48, thigh: 33, height: 112 },
    morph: { bustScale: 0.80, bellyFullness: 1.10, gluteFullness: 0.90, lumbarScale: 1.0, headRatio: null, cheekFullness: 0.08 },
    hairStyle: "soft_fringe",
    skinColor: 0xe2b296,
    hairColor: 0x452b1b,
  }),
  entry({
    id: "boys_s",
    category: "boys",
    size: "S",
    buildLabel: { en: "6–7Y", ar: "٦–٧ سنوات" },
    measurements: { chest: 64.5, waist: 59, hips: 67.5, shoulder: 29.5, backLen: 30, sleeve: 41.5, neck: 29, bicep: 20.2, inseam: 54, thigh: 36, height: 125 },
    morph: { bustScale: 0.90, bellyFullness: 1.04, gluteFullness: 0.95, lumbarScale: 1.0, headRatio: null, cheekFullness: 0.04 },
    hairStyle: "sport_crop",
    skinColor: 0xdba98d,
    hairColor: 0x352216,
  }),
  entry({
    id: "boys_m",
    category: "boys",
    size: "M",
    isBase: true,
    buildLabel: { en: "8–9Y", ar: "٨–٩ سنوات" },
    measurements: { chest: 70, waist: 63, hips: 73, shoulder: 32, backLen: 33, sleeve: 46, neck: 31, bicep: 22, inseam: 60, thigh: 39, height: 138 },
    morph: { bustScale: 1.0, bellyFullness: 1.0, gluteFullness: 1.0, lumbarScale: 1.0, headRatio: null, cheekFullness: 0 },
    hairStyle: "boys_crop",
    skinColor: 0xd5a286,
    hairColor: 0x2a1c13,
  }),
  entry({
    id: "boys_l",
    category: "boys",
    size: "L",
    buildLabel: { en: "10–11Y", ar: "١٠–١١ سنة" },
    measurements: { chest: 75.5, waist: 66.5, hips: 79, shoulder: 34.5, backLen: 35.5, sleeve: 50, neck: 32.8, bicep: 24, inseam: 65, thigh: 42.5, height: 148 },
    morph: { bustScale: 1.08, bellyFullness: 0.98, gluteFullness: 1.04, lumbarScale: 1.0, headRatio: null, cheekFullness: -0.02 },
    hairStyle: "youth_fade",
    skinColor: 0xc9967a,
    hairColor: 0x241711,
  }),
  entry({
    id: "boys_xl",
    category: "boys",
    size: "XL",
    buildLabel: { en: "12–13Y", ar: "١٢–١٣ سنة" },
    measurements: { chest: 81.5, waist: 70.5, hips: 85, shoulder: 37, backLen: 38.5, sleeve: 54, neck: 34.6, bicep: 26, inseam: 70.5, thigh: 46, height: 158 },
    morph: { bustScale: 1.18, bellyFullness: 0.98, gluteFullness: 1.08, lumbarScale: 1.0, headRatio: null, cheekFullness: -0.03 },
    hairStyle: "teen_wave",
    skinColor: 0xbe896d,
    hairColor: 0x1d130e,
  }),
  entry({
    id: "boys_xxl",
    category: "boys",
    size: "XXL",
    buildLabel: { en: "14–15Y", ar: "١٤–١٥ سنة" },
    measurements: { chest: 88, waist: 75, hips: 91, shoulder: 39.8, backLen: 41, sleeve: 58, neck: 36.5, bicep: 28.5, inseam: 75, thigh: 49.5, height: 166 },
    morph: { bustScale: 1.28, bellyFullness: 1.0, gluteFullness: 1.12, lumbarScale: 1.0, headRatio: null, cheekFullness: -0.03 },
    hairStyle: "athletic_cut",
    skinColor: 0xb17d61,
    hairColor: 0x17100c,
  }),
  entry({
    id: "boys_xxxl",
    category: "boys",
    size: "XXXL",
    buildLabel: { en: "16Y / Jr L", ar: "١٦ سنة" },
    measurements: { chest: 94, waist: 80, hips: 96.5, shoulder: 41.8, backLen: 43.0, sleeve: 60.5, neck: 38.0, bicep: 30.5, inseam: 78.0, thigh: 52.5, height: 171 },
    morph: { bustScale: 1.35, bellyFullness: 1.06, gluteFullness: 1.15, lumbarScale: 0.98, headRatio: null, cheekFullness: 0.0 },
    hairStyle: "varsity_crop",
    skinColor: 0xd29f82,
    hairColor: 0x2b1d14,
  }),
  entry({
    id: "boys_4xl",
    category: "boys",
    size: "4XL",
    buildLabel: { en: "Jr XL", ar: "شبابي 4XL" },
    measurements: { chest: 100, waist: 86, hips: 102, shoulder: 43.6, backLen: 44.5, sleeve: 62.5, neck: 39.4, bicep: 32.5, inseam: 80.0, thigh: 55.5, height: 175 },
    morph: { bustScale: 1.42, bellyFullness: 1.14, gluteFullness: 1.19, lumbarScale: 0.95, headRatio: null, cheekFullness: 0.03 },
    hairStyle: "side_sweep_jr",
    skinColor: 0xc28e71,
    hairColor: 0x221610,
  }),
  entry({
    id: "boys_5xl",
    category: "boys",
    size: "5XL",
    buildLabel: { en: "Jr XXL", ar: "شبابي 5XL" },
    measurements: { chest: 106, waist: 92, hips: 107.5, shoulder: 45.4, backLen: 46.0, sleeve: 64.5, neck: 40.8, bicep: 34.5, inseam: 82.0, thigh: 58.5, height: 178 },
    morph: { bustScale: 1.48, bellyFullness: 1.24, gluteFullness: 1.23, lumbarScale: 0.92, headRatio: null, cheekFullness: 0.06 },
    hairStyle: "taper_quiff_jr",
    skinColor: 0xae7b5f,
    hairColor: 0x1b120d,
  }),
  entry({
    id: "boys_6xl",
    category: "boys",
    size: "6XL",
    buildLabel: { en: "Jr Plus", ar: "شبابي 6XL" },
    measurements: { chest: 112, waist: 98, hips: 113, shoulder: 47.2, backLen: 47.5, sleeve: 66.5, neck: 42.2, bicep: 36.5, inseam: 84.0, thigh: 61.5, height: 181 },
    morph: { bustScale: 1.54, bellyFullness: 1.36, gluteFullness: 1.27, lumbarScale: 0.90, headRatio: null, cheekFullness: 0.09 },
    hairStyle: "classic_jr_wave",
    skinColor: 0x9f6d52,
    hairColor: 0x150f0b,
  }),
]);

export const MANNEQUINS_BY_ID = Object.freeze(
  Object.fromEntries(MANNEQUIN_CATALOG.map((m) => [m.id, m]))
);

export const MANNEQUINS_BY_CATEGORY = Object.freeze(
  Object.fromEntries(
    MANNEQUIN_CATEGORIES.map((cat) => [
      cat,
      Object.freeze(MANNEQUIN_CATALOG.filter((m) => m.category === cat)),
    ])
  )
);

export function normalizeMannequinSize(size) {
  if (!size) return "M";
  const upper = String(size).trim().toUpperCase();
  return MANNEQUIN_SIZE_ALIASES[upper] || upper;
}

export function toPatternSize(size) {
  const norm = normalizeMannequinSize(size);
  return norm === "4XL" ? "XXXXL" : norm;
}

export function isActiveMannequinSize(size) {
  return ACTIVE_MANNEQUIN_SIZES.includes(normalizeMannequinSize(size));
}

export function getMannequinById(id) {
  if (!id) return null;
  return MANNEQUINS_BY_ID[String(id).trim().toLowerCase()] || null;
}

export function getMannequinsByCategory(category = "women") {
  return MANNEQUINS_BY_CATEGORY[category] || MANNEQUINS_BY_CATEGORY.women;
}

const PLANNED_STEP_OFFSET = Object.freeze({
  XXXS: -1,
  "7XL": 1,
  "8XL": 2,
});

const PLANNED_EXTRA_DELTA = Object.freeze({
  chest: 4,
  waist: 4,
  hips: 4,
  shoulder: 1,
  backLen: 1,
  sleeve: 1.5,
  neck: 0.8,
  bicep: 1.2,
  inseam: 1.5,
  thigh: 1.6,
  height: 2.5,
});

function buildExtrapolatedMannequin(category, normSize) {
  const stepOff = PLANNED_STEP_OFFSET[normSize];
  if (stepOff == null) return null;
  const isSmall = stepOff < 0;
  const catList = getMannequinsByCategory(category);
  const anchor = catList[isSmall ? 0 : catList.length - 1];
  const isKid = category === "girls" || category === "boys";
  const meas = {};
  for (const [k, baseVal] of Object.entries(anchor.measurements)) {
    const step = (PLANNED_EXTRA_DELTA[k] || 0) * stepOff;
    meas[k] = +Math.max(isSmall ? baseVal * 0.72 : baseVal, baseVal + step).toFixed(1);
  }
  const factor = stepOff;
  const morph = {
    bustScale: +(anchor.morph.bustScale + (isSmall ? -0.05 : 0.05 * factor)).toFixed(3),
    bellyFullness: +(Math.max(0.5, anchor.morph.bellyFullness + (isKid ? 0.02 : 0.16) * factor)).toFixed(3),
    gluteFullness: +(anchor.morph.gluteFullness + 0.05 * factor).toFixed(3),
    lumbarScale: +(Math.max(0.78, anchor.morph.lumbarScale - (isKid ? 0 : 0.03) * factor)).toFixed(3),
    headRatio: anchor.morph.headRatio,
    cheekFullness: +(Math.max(-0.1, Math.min(0.18, (anchor.morph.cheekFullness || 0) + 0.03 * factor))).toFixed(3),
  };
  return entry({
    id: `${category}_${normSize.toLowerCase()}`,
    category,
    size: normSize,
    isBase: false,
    buildLabel: { en: normSize, ar: normSize },
    measurements: meas,
    morph,
    hairStyle: anchor.hairStyle,
    skinColor: anchor.skinColor,
    hairColor: anchor.hairColor,
  });
}

export function getMannequinFor(category = "women", size = "M") {
  const catList = getMannequinsByCategory(category);
  const norm = normalizeMannequinSize(size);
  const direct = catList.find((m) => m.size === norm);
  if (direct) return direct;
  const extrapolated = buildExtrapolatedMannequin(category, norm);
  if (extrapolated) return extrapolated;
  return catList.find((m) => m.size === "M") || catList[0];
}

export function resolveMannequinMeasurements(category = "women", size = "M", { standard = "intl", custom = null } = {}) {
  const mq = getMannequinFor(category, size);
  const std = STANDARD_DEFS[standard] || STANDARD_DEFS.intl;
  const out = {};
  for (const [k, baseVal] of Object.entries(mq.measurements)) {
    let v = baseVal;
    if (std[k] != null) v += std[k];
    if (k === "chest" || k === "waist" || k === "hips") v *= std.ease;
    out[k] = +v.toFixed(1);
  }
  if (custom) {
    for (const [k, val] of Object.entries(custom)) {
      if (val != null && val !== "" && Number.isFinite(+val)) out[k] = +val;
    }
  }
  return out;
}
