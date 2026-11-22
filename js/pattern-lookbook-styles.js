/* ============================================================
   Curated Lookbook Styles Registry — 340 Pre-Designed Patterns
   Pure ES module (zero DOM / window / Three.js globals).
   Maps every pattern ID to its editorial lookbook colors, fabric,
   procedural print, silhouette enhancements, and 3D trims.
   ============================================================ */

const VALID_FABRICS = new Set([
  "cotton", "denim", "silk", "satin", "chiffon", "wool",
  "linen", "leather", "jersey", "scuba", "tulle", "velvet", "lace",
]);

function leo(primaryColor, fabric, neckline, backStyle, legHeight, skirt, colorBlock, sleeveKey, extra = {}) {
  const {
    secondaryColor = null,
    trimColor = null,
    skirtColor = null,
    print = null,
    skirtSheer = true,
  } = extra;
  const partColors = { bodice: primaryColor };
  if (sleeveKey && sleeveKey !== "none") {
    partColors.sleeve = extra.sleeveColor || (colorBlock === "mesh" ? secondaryColor || primaryColor : primaryColor);
  }
  if (skirt) {
    partColors.skirt = skirtColor || secondaryColor || primaryColor;
  }
  if (trimColor) partColors.trim = trimColor;

  return {
    primaryColor,
    ...(secondaryColor ? { secondaryColor } : {}),
    ...(trimColor ? { trimColor } : {}),
    partColors,
    fabric: VALID_FABRICS.has(fabric) ? fabric : "scuba",
    ...(print ? { print } : {}),
    silhouette: {
      style: "leotard",
      neckline: neckline === "v" ? "v-neck" : (neckline === "offshoulder" ? "off-shoulder" : neckline),
      backStyle,
      legHeight,
      leotard: {
        neckline,
        backStyle,
        legHeight,
        skirt: !!skirt,
        skirtSheer,
        skirtColor: skirt ? (skirtColor || secondaryColor || primaryColor) : null,
        colorBlock,
        sleeveKey,
      },
      ...(skirt ? { tiers: extra.tiers || 0, isSheerOverlay: skirtSheer } : {}),
    },
  };
}

export const PATTERN_LOOKBOOK_STYLES = {
  // ==================== CORE 6 (js/data.js) ====================
  womens_dress: {
    primaryColor: "#141f3c",
    partColors: { bodice: "#141f3c", sleeve: "#141f3c", skirt: "#141f3c" },
    fabric: "scuba",
    silhouette: { neckline: "boat", style: "waist" },
  },
  mens_shirt: {
    primaryColor: "#f3f5f8",
    partColors: { bodice: "#f3f5f8", sleeve: "#f3f5f8" },
    fabric: "cotton",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 7 } },
  },
  abaya: {
    primaryColor: "#0a3b2c",
    trimColor: "#13523d",
    partColors: { bodice: "#0a3b2c", sleeve: "#0a3b2c", trim: "#13523d" },
    fabric: "satin",
    silhouette: { isOpenFront: false, contrastCuffs: true, cuffColor: "#13523d" },
  },

  // ==================== EMBROIDERED HIJAB ABAYAS (wa01–wa20) ====================
  wa01: {
    primaryColor: "#141518",
    secondaryColor: "#1f2228",
    trimColor: "#d4af37",
    partColors: { bodice: "#141518", sleeve: "#141518", outer: "#141518", trim: "#d4af37" },
    fabric: "satin",
    print: { preset: "zari_border", target: ["outer", "sleeve"], palette: ["#141518", "#d4af37", "#a67c2e", "#f3df98"], repeat: 5 },
    silhouette: {
      style: "robe", isOpenFront: true, contrastCuffs: true, cuffColor: "#d4af37", sash: true, sashColor: "#d4af37", pleats: 6,
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#141518", fabric: "satin", trimColor: "#d4af37", innerColor: "#18191d", innerNeckline: "high", lengthStyle: "robe" },
    },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#d4af37" } },
  },
  wa02: {
    primaryColor: "#084c38",
    secondaryColor: "#053325",
    trimColor: "#d9b650",
    partColors: { bodice: "#084c38", sleeve: "#084c38", outer: "#084c38", trim: "#d9b650" },
    fabric: "silk",
    print: { preset: "arabesque", target: ["outer", "sleeve"], palette: ["#084c38", "#d9b650", "#8e7330", "#f7ecd0"], repeat: 5 },
    silhouette: {
      style: "robe", isOpenFront: true, pleats: 6,
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#084c38", fabric: "silk", trimColor: "#d9b650", innerColor: "#063b2b", innerNeckline: "high", lengthStyle: "robe" },
    },
  },
  wa03: {
    primaryColor: "#1c1817",
    secondaryColor: "#b91c1c",
    trimColor: "#b91c1c",
    partColors: { bodice: "#1c1817", sleeve: "#1c1817", trim: "#b91c1c" },
    fabric: "linen",
    print: { preset: "tatreez", target: "all", palette: ["#1c1817", "#b91c1c", "#d4af37", "#f3ead8"], repeat: 5 },
    silhouette: { style: "robe", isOpenFront: false, neckline: "crew", contrastCollar: true, sash: true, sashColor: "#b91c1c", pleats: 6 },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#b91c1c" } },
  },
  wa04: {
    primaryColor: "#132247",
    secondaryColor: "#cbd5e1",
    trimColor: "#e5e7eb",
    partColors: { bodice: "#132247", sleeve: "#132247", trim: "#e5e7eb" },
    fabric: "silk",
    print: { preset: "arabesque", target: "all", palette: ["#132247", "#e5e7eb", "#94a3b8", "#ffffff"], repeat: 5 },
    silhouette: { style: "robe", isOpenFront: false, neckline: "high", hasCape: true, pleats: 4 },
  },
  wa05: {
    primaryColor: "#590d22",
    secondaryColor: "#3d0817",
    trimColor: "#e2bc6b",
    partColors: { bodice: "#590d22", sleeve: "#590d22", outer: "#590d22", trim: "#e2bc6b" },
    fabric: "velvet",
    print: { preset: "brocade", target: ["outer", "sleeve"], palette: ["#590d22", "#3d0817", "#e2bc6b"], repeat: 5 },
    silhouette: {
      style: "robe", isOpenFront: true, collarStyle: "mandarin", hasCollar: true, contrastCollar: true, sash: true, sashColor: "#e2bc6b", pleats: 6,
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#590d22", fabric: "velvet", trimColor: "#e2bc6b", innerColor: "#460a1b", innerNeckline: "high", lengthStyle: "robe" },
    },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#e2bc6b" } },
  },
  wa06: {
    primaryColor: "#f5efe6",
    secondaryColor: "#dfd3be",
    trimColor: "#e5c88c",
    partColors: { bodice: "#f5efe6", sleeve: "#f5efe6", trim: "#e5c88c" },
    fabric: "satin",
    print: { preset: "floral_embroidery", target: "all", palette: ["#f5efe6", "#e5c88c", "#c6a35a", "#ffffff"], repeat: 6 },
    silhouette: { style: "robe", isOpenFront: false, contrastCuffs: true, cuffColor: "#e5c88c", sash: true, sashColor: "#e5c88c", pleats: 6 },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "narrow", color: "#e5c88c" } },
  },
  wa07: {
    primaryColor: "#134e3a",
    secondaryColor: "#0b3627",
    trimColor: "#eab308",
    partColors: { bodice: "#134e3a", sleeve: "#134e3a", trim: "#eab308" },
    fabric: "silk",
    print: { preset: "zari_border", target: "all", palette: ["#134e3a", "#eab308", "#a16207", "#fef08a"], repeat: 5 },
    silhouette: { style: "robe", isOpenFront: false, sash: true, sashColor: "#eab308", pleats: 6 },
    accessories: {
      belt: { enabled: true, style: "fabric_sash", width: "wide", color: "#eab308" },
      buttons: { enabled: true, style: "gold", placement: "front_placket", count: 8 },
    },
  },
  wa08: {
    primaryColor: "#b57c84",
    secondaryColor: "#dfd6cc",
    trimColor: "#f3e5ab",
    partColors: { bodice: "#b57c84", sleeve: "#b57c84", outer: "#b57c84", trim: "#f3e5ab" },
    fabric: "silk",
    print: { preset: "floral_embroidery", target: ["outer", "sleeve"], palette: ["#b57c84", "#f3e5ab", "#d4af37", "#e8dcd0"], repeat: 5 },
    silhouette: {
      style: "robe", isOpenFront: true, sash: true, sashColor: "#b57c84", pleats: 6,
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#b57c84", fabric: "silk", trimColor: "#f3e5ab", innerColor: "#dfd6cc", innerNeckline: "high", lengthStyle: "robe" },
    },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#b57c84" } },
  },
  wa09: {
    primaryColor: "#d4c2a8",
    secondaryColor: "#b8a286",
    trimColor: "#a89070",
    partColors: { bodice: "#d4c2a8", sleeve: "#d4c2a8", trim: "#a89070" },
    fabric: "linen",
    print: { preset: "embroidery", target: "all", palette: ["#d4c2a8", "#a89070", "#8b7355", "#ebe0cf"], repeat: 5 },
    silhouette: { style: "robe", isOpenFront: false, collarStyle: "mandarin", hasCollar: true, contrastCuffs: true, cuffColor: "#a89070", pleats: 4 },
  },
  wa10: {
    primaryColor: "#4a1d54",
    secondaryColor: "#35123d",
    trimColor: "#e2e8f0",
    partColors: { bodice: "#4a1d54", sleeve: "#4a1d54", outer: "#4a1d54", trim: "#e2e8f0" },
    fabric: "satin",
    print: { preset: "arabesque", target: ["outer", "sleeve"], palette: ["#4a1d54", "#e2e8f0", "#cbd5e1", "#ffffff"], repeat: 5 },
    silhouette: {
      style: "robe", isOpenFront: true, contrastCuffs: true, cuffColor: "#e2e8f0", sash: true, sashColor: "#4a1d54", pleats: 6,
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#4a1d54", fabric: "satin", trimColor: "#e2e8f0", innerColor: "#3a1542", innerNeckline: "high", lengthStyle: "robe" },
    },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#4a1d54" } },
  },
  wa11: {
    primaryColor: "#0f5257",
    secondaryColor: "#09363a",
    trimColor: "#d4af37",
    partColors: { bodice: "#0f5257", sleeve: "#0f5257", trim: "#d4af37" },
    fabric: "satin",
    print: { preset: "brocade", target: "all", palette: ["#0f5257", "#14b8a6", "#d4af37"], repeat: 5 },
    silhouette: { style: "robe", isOpenFront: false, collarStyle: "mandarin", hasCollar: true, contrastCuffs: true, cuffColor: "#d4af37", pleats: 8 },
  },
  wa12: {
    primaryColor: "#4a3228",
    secondaryColor: "#d9c8b4",
    trimColor: "#b47844",
    partColors: { bodice: "#4a3228", sleeve: "#4a3228", outer: "#4a3228", trim: "#b47844" },
    fabric: "wool",
    print: { preset: "zari_border", target: ["outer", "sleeve"], palette: ["#4a3228", "#b47844", "#7c4d26", "#e3b888"], repeat: 5 },
    silhouette: {
      style: "robe", isOpenFront: true, collarStyle: "pointed", hasCollar: true, sash: true, sashColor: "#4a3228", pleats: 4,
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#4a3228", fabric: "wool", trimColor: "#b47844", innerColor: "#d9c8b4", innerNeckline: "high", lengthStyle: "robe" },
    },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#4a3228" } },
  },
  wa13: {
    primaryColor: "#c7ccd4",
    secondaryColor: "#e2e8f0",
    trimColor: "#f8fafc",
    partColors: { bodice: "#c7ccd4", sleeve: "#c7ccd4", skirt: "#c7ccd4", trim: "#f8fafc" },
    fabric: "silk",
    print: { preset: "embroidery", target: "all", palette: ["#c7ccd4", "#f8fafc", "#94a3b8", "#ffffff"], repeat: 6 },
    silhouette: { style: "robe", isOpenFront: false, contrastCuffs: true, cuffColor: "#e2e8f0", tiers: 2, pleats: 10 },
  },
  wa14: {
    primaryColor: "#18181b",
    secondaryColor: "#27272a",
    trimColor: "#c8743c",
    partColors: { bodice: "#18181b", sleeve: "#18181b", outer: "#18181b", trim: "#c8743c" },
    fabric: "silk",
    print: { preset: "zari_border", target: ["outer", "sleeve"], palette: ["#18181b", "#c8743c", "#8a4820", "#eab082"], repeat: 5 },
    silhouette: {
      style: "robe", isOpenFront: true, contrastCuffs: true, cuffColor: "#c8743c", pleats: 6,
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#18181b", fabric: "silk", trimColor: "#c8743c", innerColor: "#141416", innerNeckline: "high", lengthStyle: "robe" },
    },
  },
  wa15: {
    primaryColor: "#556347",
    secondaryColor: "#3d4832",
    trimColor: "#d9c07e",
    partColors: { bodice: "#556347", sleeve: "#556347", trim: "#d9c07e" },
    fabric: "linen",
    print: { preset: "floral_embroidery", target: "all", palette: ["#556347", "#d9c07e", "#bfa256", "#ece5c8"], repeat: 5 },
    silhouette: { style: "robe", isOpenFront: false, collarStyle: "mandarin", hasCollar: true, sash: true, sashColor: "#556347", pleats: 6 },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#556347" } },
  },
  wa16: {
    primaryColor: "#16336e",
    secondaryColor: "#0e224b",
    trimColor: "#e5c158",
    partColors: { bodice: "#16336e", sleeve: "#16336e", trim: "#e5c158" },
    fabric: "satin",
    print: { preset: "brocade", target: "all", palette: ["#16336e", "#224691", "#e5c158"], repeat: 5 },
    silhouette: { style: "robe", isOpenFront: false, contrastCuffs: true, cuffColor: "#e5c158", pleats: 8 },
  },
  wa17: {
    primaryColor: "#e4c3be",
    secondaryColor: "#f2e7e4",
    trimColor: "#d4af37",
    partColors: { bodice: "#e4c3be", sleeve: "#e4c3be", outer: "#e4c3be", trim: "#d4af37" },
    fabric: "silk",
    print: { preset: "embroidery", target: ["outer", "sleeve"], palette: ["#e4c3be", "#d4af37", "#b89336", "#f9ebe8"], repeat: 5 },
    silhouette: {
      style: "robe", isOpenFront: true, contrastCuffs: true, cuffColor: "#f2e7e4", sash: true, sashColor: "#e4c3be", pleats: 12,
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#e4c3be", fabric: "silk", trimColor: "#d4af37", innerColor: "#f2e7e4", innerNeckline: "high", lengthStyle: "robe" },
    },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "narrow", color: "#e4c3be" } },
  },
  wa18: {
    primaryColor: "#333740",
    secondaryColor: "#1f242c",
    trimColor: "#cbd5e1",
    partColors: { bodice: "#333740", sleeve: "#333740", outer: "#333740", trim: "#cbd5e1" },
    fabric: "wool",
    print: { preset: "tatreez", target: ["outer", "sleeve"], palette: ["#333740", "#cbd5e1", "#94a3b8", "#f1f5f9"], repeat: 5 },
    silhouette: {
      style: "robe", isOpenFront: true, hasCape: true, pleats: 6,
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#333740", fabric: "wool", trimColor: "#cbd5e1", innerColor: "#262930", innerNeckline: "high", lengthStyle: "robe" },
    },
  },
  wa19: {
    primaryColor: "#9f4228",
    secondaryColor: "#752c18",
    trimColor: "#f3c77c",
    partColors: { bodice: "#9f4228", sleeve: "#9f4228", trim: "#f3c77c" },
    fabric: "linen",
    print: { preset: "tatreez", target: "all", palette: ["#9f4228", "#f3c77c", "#0f766e", "#f7ecd6"], repeat: 5 },
    silhouette: { style: "robe", isOpenFront: false, contrastCuffs: true, cuffColor: "#752c18", sash: true, sashColor: "#9f4228", pleats: 6 },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#9f4228" } },
  },
  wa20: {
    primaryColor: "#dfd0b8",
    secondaryColor: "#f4efe6",
    trimColor: "#b8934c",
    partColors: { bodice: "#dfd0b8", sleeve: "#dfd0b8", outer: "#dfd0b8", trim: "#b8934c" },
    fabric: "silk",
    print: { preset: "floral_embroidery", target: ["outer", "sleeve"], palette: ["#dfd0b8", "#b8934c", "#8f6f33", "#ffffff"], repeat: 5 },
    silhouette: {
      style: "robe", isOpenFront: true, hasCape: true, sash: true, sashColor: "#dfd0b8", pleats: 6,
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#dfd0b8", fabric: "silk", trimColor: "#b8934c", innerColor: "#f4efe6", innerNeckline: "high", lengthStyle: "robe" },
    },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#dfd0b8" } },
  },
  thobe: {
    primaryColor: "#f7f7f5",
    partColors: { bodice: "#f7f7f5", sleeve: "#f7f7f5" },
    fabric: "cotton",
    silhouette: { collarStyle: "mandarin", neckline: "high", hasCollar: true },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 2 } },
  },
  girls_dress: {
    primaryColor: "#ede3d4",
    secondaryColor: "#c8a98a",
    trimColor: "#9c7858",
    partColors: { bodice: "#ede3d4", sleeve: "#ede3d4", skirt: "#ede3d4", trim: "#c8a98a" },
    fabric: "cotton",
    print: { preset: "floral", target: "all", palette: ["#ede3d4", "#c89b84", "#8e6b4f", "#d7ba9e"], repeat: 6 },
    silhouette: { neckline: "round", tiers: 2, sash: true, sashColor: "#c8a98a" },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "narrow", color: "#c8a98a" } },
  },
  boys_trousers: {
    primaryColor: "#c7b699",
    partColors: { trousers: "#c7b699" },
    fabric: "cotton",
    accessories: { buttons: { enabled: true, style: "horn", placement: "waistband", count: 1 } },
  },

  // ==================== WOMEN (w01–w23) ====================
  w01: { primaryColor: "#d99ea2", fabric: "scuba", silhouette: { neckline: "round", hasSash: false } },
  w02: {
    primaryColor: "#536449", trimColor: "#425138",
    partColors: { bodice: "#536449", sleeve: "#536449", trim: "#425138" },
    fabric: "satin",
    silhouette: { neckline: "surplice", sash: true, sashColor: "#425138" },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#425138" } },
  },
  w03: {
    primaryColor: "#f8f7f5", fabric: "cotton",
    silhouette: { neckline: "square", hasCollar: false },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 5 } },
  },
  w04: { primaryColor: "#0e49a8", fabric: "scuba", silhouette: { neckline: "round" } },
  w05: {
    primaryColor: "#c19668", trimColor: "#a87d52",
    partColors: { skirt: "#c19668", trim: "#a87d52" },
    fabric: "satin",
    silhouette: { pleats: 18 },
  },
  w06: { primaryColor: "#bc9872", fabric: "wool" },
  w07: {
    primaryColor: "#636569", secondaryColor: "#9a9ca0", trimColor: "#2a2b2e",
    partColors: { skirt: "#636569", trim: "#414347" },
    fabric: "wool",
    print: { preset: "plaid", target: "skirt", palette: ["#636569", "#9a9ca0", "#2f3136", "#d8d8dc"], repeat: 8 },
  },
  w08: {
    primaryColor: "#064935", trimColor: "#0b6e4f",
    partColors: { bodice: "#064935", sleeve: "#064935", trim: "#0b6e4f" },
    fabric: "silk",
    silhouette: { neckline: "v-neck", sash: true, sashColor: "#064935" },
  },
  w09: { primaryColor: "#c4aad4", fabric: "chiffon", silhouette: { neckline: "round", hasCape: true } },
  w10: { primaryColor: "#a03b25", fabric: "satin", silhouette: { neckline: "off-shoulder" } },
  w11: { primaryColor: "#141416", fabric: "jersey", silhouette: { neckline: "high" } },
  w12: { primaryColor: "#8a0c1c", fabric: "scuba" },
  w13: { primaryColor: "#c8b59f", fabric: "linen", silhouette: { neckline: "round" } },
  w14: { primaryColor: "#131c36", fabric: "wool" },
  w15: { primaryColor: "#dbaea8", fabric: "chiffon", silhouette: { tiers: 0, pleats: 14 } },
  w16: { primaryColor: "#ece7dc", fabric: "linen", silhouette: { neckline: "mandarin", collarStyle: "mandarin" } },
  w17: { primaryColor: "#4f1833", fabric: "scuba", silhouette: { neckline: "boat" } },
  w18: { primaryColor: "#4b596d", fabric: "jersey", silhouette: { neckline: "cold-shoulder" } },
  w19: { primaryColor: "#5b5c37", fabric: "linen", silhouette: { neckline: "round" } },
  w20: { primaryColor: "#b44d28", fabric: "linen" },
  w21: {
    primaryColor: "#756e65", trimColor: "#5c554c",
    fabric: "wool",
    silhouette: { neckline: "round", collarStyle: "none" },
  },
  w22: { primaryColor: "#c5b39b", fabric: "jersey", silhouette: { neckline: "boat" } },
  w23: { primaryColor: "#8f341f", fabric: "cotton", silhouette: { neckline: "v-neck", tiers: 3 } },

  // ==================== MEN (m01–m23) ====================
  m01: { primaryColor: "#141f35", fabric: "wool" },
  m02: { primaryColor: "#b59369", fabric: "cotton" },
  m03: {
    primaryColor: "#7b8064", fabric: "linen", silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "tortoise", placement: "front_placket", count: 5 } },
  },
  m04: {
    primaryColor: "#a4bed6", fabric: "cotton", silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 7 } },
  },
  m05: {
    primaryColor: "#ede8de", fabric: "linen", silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "wood", placement: "front_placket", count: 6 } },
  },
  m06: { primaryColor: "#555c42", fabric: "cotton" },
  m07: {
    primaryColor: "#f7f7f8", fabric: "cotton",
    silhouette: { collarStyle: "mandarin", neckline: "high" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 3 } },
  },
  m08: {
    primaryColor: "#5a5c41", fabric: "linen",
    silhouette: { collarStyle: "mandarin", neckline: "high" },
    accessories: { buttons: { enabled: true, style: "horn", placement: "front_placket", count: 4 } },
  },
  m09: { primaryColor: "#52555a", fabric: "jersey", print: { preset: "ribbed", target: "bodice", palette: ["#52555a", "#414449"], repeat: 6 }, silhouette: { neckline: "round" } },
  m10: {
    primaryColor: "#303337", fabric: "jersey",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "front_placket", count: 3 } },
  },
  m11: {
    primaryColor: "#1d2a3d", trimColor: "#c89248",
    partColors: { trousers: "#1d2a3d", trim: "#c89248" },
    fabric: "denim",
    print: { preset: "denim_stitch", target: "trousers", palette: ["#1d2a3d", "#2c3f5a", "#c89248"], repeat: 4 },
    accessories: { buttons: { enabled: true, style: "silver", placement: "waistband", count: 1 } },
  },
  m12: { primaryColor: "#cbb9a3", fabric: "jersey", silhouette: { neckline: "round" } },
  m13: {
    primaryColor: "#f3f1eb", fabric: "cotton",
    silhouette: { collarStyle: "mandarin", neckline: "high" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 4 } },
  },
  m14: { primaryColor: "#25262a", fabric: "wool" },
  m15: { primaryColor: "#cbbba0", fabric: "cotton" },
  m16: {
    primaryColor: "#465869", fabric: "linen",
    silhouette: { collarStyle: "mandarin", neckline: "high" },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "front_placket", count: 4 } },
  },
  m17: {
    primaryColor: "#9eb8ce", fabric: "linen",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 6 } },
  },
  m18: { primaryColor: "#1a2a47", fabric: "linen", silhouette: { neckline: "mandarin", collarStyle: "mandarin" } },
  m19: { primaryColor: "#3a3b40", fabric: "wool" },
  m20: { primaryColor: "#dfd8cc", secondaryColor: "#a8a298", fabric: "jersey", silhouette: { neckline: "round" } },
  m21: { primaryColor: "#8b633c", fabric: "linen", silhouette: { neckline: "v-neck" } },
  m22: { primaryColor: "#cfc3b0", fabric: "cotton" },
  m23: {
    primaryColor: "#f7f8fa", fabric: "cotton",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 7 } },
  },

  // ==================== GIRLS (g01–g24) ====================
  g01: {
    primaryColor: "#b8d6ca", trimColor: "#9ec2b4",
    partColors: { bodice: "#b8d6ca", sleeve: "#b8d6ca", skirt: "#c8e3d8", trim: "#9ec2b4" },
    fabric: "tulle",
    print: { preset: "lace", target: "all", palette: ["#b8d6ca", "#eef7f3", "#98bcae"], repeat: 6 },
    silhouette: { neckline: "round", tiers: 2, isBallerinaTutu: true },
  },
  g02: {
    primaryColor: "#1b2640", secondaryColor: "#f8fafc",
    partColors: { bodice: "#1b2640", sleeve: "#f8fafc", skirt: "#1b2640", outer: "#1b2640" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "pinafore", openFront: false, color: "#1b2640", fabric: "wool", innerColor: "#f8fafc", innerNeckline: "collar", lengthStyle: "dress" },
      collarStyle: "peter-pan",
    },
  },
  g03: {
    primaryColor: "#f3cf56", trimColor: "#d99d1c",
    fabric: "cotton",
    print: { preset: "floral", target: "all", palette: ["#f3cf56", "#fff6d6", "#e09f1f", "#6a994e"], repeat: 7 },
    silhouette: { neckline: "scoop" },
  },
  g04: {
    primaryColor: "#f5948f", fabric: "cotton",
    print: { preset: "floral", target: "all", palette: ["#f5948f", "#ffe3e0", "#d94f4a", "#ffffff"], repeat: 7 },
    silhouette: { neckline: "round", tiers: 3 },
  },
  g05: { primaryColor: "#17254d", fabric: "wool", silhouette: { pleats: 16 } },
  g06: { primaryColor: "#920c22", fabric: "scuba" },
  g07: { primaryColor: "#c5b2cf", fabric: "jersey", silhouette: { neckline: "round" } },
  g08: {
    primaryColor: "#f6cbb9", fabric: "cotton",
    print: { preset: "floral", target: "all", palette: ["#f6cbb9", "#fff4ee", "#e28876", "#8ca88a"], repeat: 7 },
    silhouette: { neckline: "scoop", tiers: 3 },
  },
  g09: {
    primaryColor: "#9ec9b8", secondaryColor: "#f5fbf8",
    fabric: "cotton",
    print: { preset: "plaid", target: "all", palette: ["#9ec9b8", "#f5fbf8", "#6da18e"], repeat: 8 },
    silhouette: { collarStyle: "peter-pan", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 4 } },
  },
  g10: { primaryColor: "#bd8b88", fabric: "cotton" },
  g11: { primaryColor: "#9a999c", fabric: "jersey" },
  g12: { primaryColor: "#b4cde0", fabric: "chiffon", silhouette: { neckline: "round", hasCape: true } },
  g13: {
    primaryColor: "#2e4b70", trimColor: "#c99248",
    partColors: { skirt: "#2e4b70", trim: "#c99248" },
    fabric: "denim",
    print: { preset: "denim_stitch", target: "skirt", palette: ["#2e4b70", "#456896", "#c99248"], repeat: 4 },
    accessories: { buttons: { enabled: true, style: "gold", placement: "front_placket", count: 5 } },
  },
  g14: { primaryColor: "#f0b94b", fabric: "jersey", silhouette: { neckline: "round" } },
  g15: {
    primaryColor: "#c79495", trimColor: "#b07678",
    fabric: "cotton",
    silhouette: { neckline: "round", sash: true, sashColor: "#b07678" },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#b07678" } },
  },
  g16: { primaryColor: "#f46342", fabric: "jersey", silhouette: { neckline: "round" } },
  g17: { primaryColor: "#e6afb0", fabric: "cotton" },
  g18: { primaryColor: "#b4dbdd", fabric: "cotton", silhouette: { neckline: "round" } },
  g19: {
    primaryColor: "#294637", secondaryColor: "#ede8de",
    partColors: { bodice: "#294637", sleeve: "#ede8de", skirt: "#294637", outer: "#294637" },
    fabric: "cotton",
    silhouette: {
      outerLayer: { enabled: true, style: "pinafore", openFront: false, color: "#294637", fabric: "cotton", innerColor: "#ede8de", innerNeckline: "high", lengthStyle: "dress" },
    },
  },
  g20: { primaryColor: "#d1c5b2", fabric: "linen" },
  g21: {
    primaryColor: "#c3a9d6", trimColor: "#a88bc0",
    partColors: { skirt: "#c3a9d6", trim: "#a88bc0" },
    fabric: "tulle",
    silhouette: { tiers: 3, isBallerinaTutu: true },
  },
  g22: {
    primaryColor: "#ede28d", secondaryColor: "#f9f6dc",
    fabric: "cotton",
    print: { preset: "plaid", target: "all", palette: ["#ede28d", "#faf8e8", "#d4c35e"], repeat: 10 },
    silhouette: { neckline: "square" },
  },
  g23: { primaryColor: "#f69e8e", fabric: "jersey", silhouette: { neckline: "round" } },
  g24: { primaryColor: "#e2aa24", fabric: "linen", silhouette: { neckline: "scoop" } },

  // ==================== BOYS (b01–b24) ====================
  b01: {
    primaryColor: "#7c9eb8", fabric: "cotton",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 5 } },
  },
  b02: {
    primaryColor: "#f5f6f8", fabric: "cotton",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 6 } },
  },
  b03: { primaryColor: "#6e684d", fabric: "cotton" },
  b04: { primaryColor: "#c8b295", fabric: "cotton" },
  b05: { primaryColor: "#1d57ab", trimColor: "#f8fafc", partColors: { bodice: "#1d57ab", trim: "#f8fafc" }, fabric: "jersey", silhouette: { neckline: "scoop" } },
  b06: { primaryColor: "#bfb09c", fabric: "jersey", silhouette: { hasHood: true, neckline: "round" } },
  b07: { primaryColor: "#d63643", fabric: "cotton" },
  b08: { primaryColor: "#2aa8b8", fabric: "jersey", silhouette: { neckline: "round" } },
  b09: { primaryColor: "#1f283d", fabric: "cotton" },
  b10: {
    primaryColor: "#06755a", fabric: "jersey",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 3 } },
  },
  b11: {
    primaryColor: "#f7f7f9", fabric: "cotton",
    silhouette: { collarStyle: "mandarin", neckline: "high" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 2 } },
  },
  b12: { primaryColor: "#4f4e53", fabric: "jersey" },
  b13: { primaryColor: "#c9b394", fabric: "cotton" },
  b14: {
    primaryColor: "#24314a", secondaryColor: "#9b9da2",
    partColors: { bodice: "#24314a", sleeve: "#9b9da2" },
    fabric: "jersey",
    silhouette: { neckline: "round" },
  },
  b15: {
    primaryColor: "#aec6df", fabric: "cotton",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 6 } },
  },
  b16: { primaryColor: "#c9b293", fabric: "cotton" },
  b17: {
    primaryColor: "#27334b", secondaryColor: "#f4f5f7",
    partColors: { bodice: "#27334b", sleeve: "#f4f5f7", outer: "#27334b" },
    fabric: "scuba",
    silhouette: {
      outerLayer: { enabled: true, style: "vest", openFront: true, color: "#27334b", fabric: "scuba", innerColor: "#f4f5f7", innerNeckline: "round", lengthStyle: "hip" },
    },
    accessories: { zipper: { enabled: true, style: "matte_black", placement: "center_front", openPct: 0.1 } },
  },
  b18: {
    primaryColor: "#e6decb", fabric: "linen",
    silhouette: { collarStyle: "mandarin", neckline: "high" },
    accessories: { buttons: { enabled: true, style: "wood", placement: "front_placket", count: 3 } },
  },
  b19: {
    primaryColor: "#385675", trimColor: "#c99248",
    partColors: { trousers: "#385675", trim: "#c99248" },
    fabric: "denim",
    print: { preset: "denim_stitch", target: "trousers", palette: ["#385675", "#4f7296", "#c99248"], repeat: 4 },
  },
  b20: { primaryColor: "#c98520", fabric: "jersey", silhouette: { neckline: "round" } },
  b21: { primaryColor: "#0e51ad", trimColor: "#f8fafc", partColors: { trousers: "#0e51ad", trim: "#f8fafc" }, fabric: "cotton" },
  b22: { primaryColor: "#f6f5f7", fabric: "cotton", silhouette: { collarStyle: "mandarin", neckline: "high" } },
  b23: { primaryColor: "#757054", fabric: "jersey", silhouette: { neckline: "round" } },
  b24: { primaryColor: "#232838", fabric: "wool" },

  // ==================== WOMEN'S FORMAL & COUTURE (wf01–wf16) ====================
  wf01: {
    primaryColor: "#045a41", trimColor: "#d4af37",
    partColors: { bodice: "#045a41", skirt: "#045a41", trim: "#d4af37" },
    fabric: "satin",
    silhouette: { neckline: "sweetheart" },
    accessories: { belt: { enabled: true, style: "leather_gold", width: "narrow", color: "#03422f" } },
  },
  wf02: { primaryColor: "#9c0a19", fabric: "satin", silhouette: { neckline: "strapless" } },
  wf03: { primaryColor: "#ba8389", fabric: "satin", silhouette: { neckline: "off-shoulder", sash: true, sashColor: "#ba8389" } },
  wf04: { primaryColor: "#1443a3", fabric: "chiffon", silhouette: { neckline: "surplice", tiers: 3, sash: true, sashColor: "#1443a3" } },
  wf05: { primaryColor: "#03583a", fabric: "silk", silhouette: { neckline: "boat", hasCape: true } },
  wf06: {
    primaryColor: "#ede8de", trimColor: "#d4af37",
    fabric: "wool",
    silhouette: { lapelStyle: "notched", hasPeplum: true, isOpenFront: false },
    accessories: { buttons: { enabled: true, style: "gold", placement: "double_breasted", count: 6 } },
  },
  wf07: {
    primaryColor: "#8f3c29", trimColor: "#742c1c",
    fabric: "linen",
    silhouette: { neckline: "surplice", sash: true, sashColor: "#742c1c" },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#742c1c" } },
  },
  wf08: {
    primaryColor: "#161618", trimColor: "#26262b",
    partColors: { bodice: "#161618", sleeve: "#161618", trousers: "#161618", outer: "#161618", trim: "#0a0a0c" },
    fabric: "wool",
    silhouette: { lapelStyle: "shawl", neckline: "v-neck" },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "front_placket", count: 2 } },
  },
  wf09: {
    primaryColor: "#a98159", trimColor: "#5c3b24",
    fabric: "wool",
    silhouette: { lapelStyle: "notched", isOpenFront: false },
    accessories: {
      buttons: { enabled: true, style: "tortoise", placement: "double_breasted", count: 6 },
      belt: { enabled: true, style: "fabric_sash", width: "wide", color: "#b59d84" },
    },
  },
  wf10: { primaryColor: "#dec19f", fabric: "satin", silhouette: { neckline: "halter" } },
  wf11: { primaryColor: "#e6c5c2", fabric: "scuba", silhouette: { neckline: "sweetheart", hasPeplum: true } },
  wf12: {
    primaryColor: "#bfae93", trimColor: "#5a4932",
    fabric: "cotton",
    silhouette: { lapelStyle: "notched", isOpenFront: false },
    accessories: {
      buttons: { enabled: true, style: "tortoise", placement: "double_breasted", count: 8 },
      belt: { enabled: true, style: "fabric_sash", width: "wide", color: "#bfae93" },
    },
  },
  wf13: {
    primaryColor: "#c9addb", trimColor: "#b18dc7",
    fabric: "tulle",
    silhouette: { neckline: "off-shoulder", tiers: 4, isBallerinaTutu: true },
  },
  wf14: { primaryColor: "#f2efe6", fabric: "silk", silhouette: { neckline: "boat", hasCape: true } },
  wf15: {
    primaryColor: "#f5f3ee", trimColor: "#e8e3d8",
    partColors: { bodice: "#f5f3ee", sleeve: "#f5f3ee", skirt: "#f8f6f2" },
    fabric: "lace",
    print: { preset: "lace", target: "bodice", palette: ["#f5f3ee", "#ffffff", "#dfd7c8"], repeat: 6 },
    silhouette: { neckline: "sweetheart" },
  },
  wf16: {
    primaryColor: "#17233b", secondaryColor: "#f8fafc",
    partColors: { bodice: "#f8fafc", sleeve: "#17233b", trousers: "#17233b", outer: "#17233b" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "blazer", openFront: true, lapelStyle: "notched", color: "#17233b", fabric: "wool", innerColor: "#f8fafc", innerNeckline: "collar", lengthStyle: "hip" },
    },
    accessories: { buttons: { enabled: true, style: "horn", placement: "front_placket", count: 2 } },
  },

  // ==================== MEN'S TAILORED & OUTERWEAR (mf01–mf16) ====================
  mf01: {
    primaryColor: "#141416", secondaryColor: "#f8fafc", trimColor: "#0a0a0c",
    partColors: { bodice: "#f8fafc", sleeve: "#141416", trousers: "#141416", outer: "#141416", trim: "#0a0a0c" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "tuxedo", openFront: true, lapelStyle: "shawl", color: "#141416", fabric: "satin", innerColor: "#f8fafc", innerNeckline: "collar", lengthStyle: "hip" },
    },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "front_placket", count: 2 } },
  },
  mf02: {
    primaryColor: "#3b4042", secondaryColor: "#18181a",
    partColors: { bodice: "#18181a", sleeve: "#3b4042", outer: "#3b4042" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "overcoat", openFront: false, lapelStyle: "notched", color: "#3b4042", fabric: "wool", innerColor: "#18181a", innerNeckline: "high", lengthStyle: "coat" },
    },
    accessories: { buttons: { enabled: true, style: "horn", placement: "double_breasted", count: 6 } },
  },
  mf03: {
    primaryColor: "#3f432c", secondaryColor: "#f4f4f2", trimColor: "#18181b",
    partColors: { bodice: "#f4f4f2", sleeve: "#3f432c", outer: "#3f432c", trim: "#18181b" },
    fabric: "cotton",
    silhouette: {
      contrastCuffs: true, cuffColor: "#18181b",
      outerLayer: { enabled: true, style: "bomber", openFront: true, collarStyle: "mandarin", color: "#3f432c", fabric: "cotton", innerColor: "#f4f4f2", innerNeckline: "round", lengthStyle: "waist" },
    },
    accessories: { zipper: { enabled: true, style: "silver", placement: "center_front", openPct: 0.15 } },
  },
  mf04: {
    primaryColor: "#efeae0", trimColor: "#d4af37",
    partColors: { bodice: "#efeae0", sleeve: "#efeae0", trim: "#d4af37" },
    fabric: "silk",
    print: { preset: "brocade", target: "all", palette: ["#efeae0", "#dfd3be", "#d4af37"], repeat: 6 },
    silhouette: { collarStyle: "mandarin", neckline: "high" },
    accessories: { buttons: { enabled: true, style: "gold", placement: "front_placket", count: 7 } },
  },
  mf05: {
    primaryColor: "#1f263a", secondaryColor: "#f8fafc",
    partColors: { bodice: "#f8fafc", sleeve: "#1f263a", trousers: "#1f263a", outer: "#1f263a" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "blazer", openFront: true, lapelStyle: "notched", color: "#1f263a", fabric: "wool", innerColor: "#f8fafc", innerNeckline: "collar", lengthStyle: "hip" },
    },
    accessories: { buttons: { enabled: true, style: "horn", placement: "front_placket", count: 2 } },
  },
  mf06: {
    primaryColor: "#171c28", secondaryColor: "#f3f4f6",
    partColors: { bodice: "#f3f4f6", sleeve: "#171c28", trousers: "#171c28", outer: "#171c28" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "peacoat", openFront: false, lapelStyle: "notched", color: "#171c28", fabric: "wool", innerColor: "#f3f4f6", innerNeckline: "high", lengthStyle: "tunic" },
    },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "double_breasted", count: 6 } },
  },
  mf07: {
    primaryColor: "#b89572", secondaryColor: "#18181b",
    partColors: { bodice: "#18181b", sleeve: "#b89572", trousers: "#18181b", outer: "#b89572" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "overcoat", openFront: false, lapelStyle: "notched", color: "#b89572", fabric: "wool", innerColor: "#18181b", innerNeckline: "high", lengthStyle: "coat" },
    },
    accessories: { buttons: { enabled: true, style: "tortoise", placement: "double_breasted", count: 6 } },
  },
  mf08: {
    primaryColor: "#6e654b", secondaryColor: "#ebe8e0",
    partColors: { bodice: "#ebe8e0", sleeve: "#6e654b", outer: "#6e654b" },
    fabric: "cotton",
    silhouette: {
      outerLayer: { enabled: true, style: "jacket", openFront: true, collarStyle: "pointed", color: "#6e654b", fabric: "cotton", innerColor: "#ebe8e0", innerNeckline: "round", lengthStyle: "hip" },
    },
    accessories: { buttons: { enabled: true, style: "horn", placement: "front_placket", count: 5 } },
  },
  mf09: {
    primaryColor: "#c8b08e", secondaryColor: "#1f2937",
    partColors: { bodice: "#1f2937", sleeve: "#c8b08e", outer: "#c8b08e" },
    fabric: "cotton",
    silhouette: {
      outerLayer: { enabled: true, style: "trench", openFront: false, lapelStyle: "notched", color: "#c8b08e", fabric: "cotton", innerColor: "#1f2937", innerNeckline: "collar", lengthStyle: "coat" },
    },
    accessories: {
      buttons: { enabled: true, style: "tortoise", placement: "double_breasted", count: 8 },
      belt: { enabled: true, style: "fabric_sash", width: "wide", color: "#c8b08e" },
    },
  },
  mf10: {
    primaryColor: "#0a2a22", trimColor: "#d4af37", secondaryColor: "#f3f1eb",
    partColors: { bodice: "#0a2a22", sleeve: "#0a2a22", trim: "#d4af37", trousers: "#f3f1eb" },
    fabric: "velvet",
    print: { preset: "brocade", target: "bodice", palette: ["#0a2a22", "#144235", "#d4af37"], repeat: 6 },
    silhouette: { collarStyle: "mandarin", neckline: "high" },
    accessories: { buttons: { enabled: true, style: "gold", placement: "front_placket", count: 7 } },
  },
  mf11: {
    primaryColor: "#334b66", secondaryColor: "#f4f5f6", trimColor: "#c89248",
    partColors: { bodice: "#f4f5f6", sleeve: "#334b66", trousers: "#1f2633", outer: "#334b66", trim: "#c89248" },
    fabric: "denim",
    print: { preset: "denim_stitch", target: "outer", palette: ["#334b66", "#4b6787", "#c89248"], repeat: 4 },
    silhouette: {
      outerLayer: { enabled: true, style: "jacket", openFront: true, collarStyle: "pointed", color: "#334b66", fabric: "denim", innerColor: "#f4f5f6", innerNeckline: "round", lengthStyle: "waist" },
    },
    accessories: { buttons: { enabled: true, style: "silver", placement: "front_placket", count: 6 } },
  },
  mf12: {
    primaryColor: "#171c2b", secondaryColor: "#f8fafc", trimColor: "#9ca3af",
    partColors: { bodice: "#f8fafc", sleeve: "#171c2b", trousers: "#171c2b", outer: "#171c2b" },
    fabric: "wool",
    print: { preset: "stripes", target: "outer", palette: ["#171c2b", "#46506b"], repeat: 10 },
    silhouette: {
      outerLayer: { enabled: true, style: "blazer", openFront: true, lapelStyle: "notched", color: "#171c2b", fabric: "wool", innerColor: "#f8fafc", innerNeckline: "collar", lengthStyle: "hip" },
    },
    accessories: { buttons: { enabled: true, style: "horn", placement: "front_placket", count: 2 } },
  },
  mf13: {
    primaryColor: "#635b43", secondaryColor: "#18181b", trimColor: "#26282a",
    partColors: { bodice: "#18181b", sleeve: "#635b43", outer: "#635b43", trim: "#26282a" },
    fabric: "scuba",
    silhouette: {
      contrastCuffs: true, cuffColor: "#26282a",
      outerLayer: { enabled: true, style: "bomber", openFront: true, collarStyle: "mandarin", color: "#635b43", fabric: "scuba", innerColor: "#18181b", innerNeckline: "round", lengthStyle: "waist" },
    },
    accessories: { zipper: { enabled: true, style: "silver", placement: "center_front", openPct: 0.1 } },
  },
  mf14: {
    primaryColor: "#ebe8e0", secondaryColor: "#f7f7f9", trimColor: "#d4af37",
    partColors: { bodice: "#f7f7f9", sleeve: "#ebe8e0", outer: "#ebe8e0", trim: "#d4af37" },
    fabric: "wool",
    print: { preset: "embroidery", target: "outer", palette: ["#ebe8e0", "#d4af37", "#bfa054"], repeat: 4 },
    silhouette: {
      outerLayer: { enabled: true, style: "bisht", openFront: true, color: "#ebe8e0", fabric: "wool", trimColor: "#d4af37", innerColor: "#f7f7f9", innerNeckline: "high", lengthStyle: "robe" },
    },
  },
  mf15: {
    primaryColor: "#75787d", secondaryColor: "#f6f7f9", trimColor: "#383a3e",
    partColors: { bodice: "#f6f7f9", sleeve: "#75787d", trousers: "#2b2c30", vest: "#383a3e", outer: "#75787d" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "blazer", openFront: true, lapelStyle: "notched", color: "#75787d", fabric: "wool", innerColor: "#f6f7f9", innerNeckline: "collar", lengthStyle: "hip" },
    },
    accessories: { buttons: { enabled: true, style: "horn", placement: "front_placket", count: 2 } },
  },
  mf16: {
    primaryColor: "#262729", secondaryColor: "#141416", trimColor: "#4f4338",
    partColors: { bodice: "#141416", sleeve: "#262729", trousers: "#1e1f22", outer: "#262729", trim: "#4f4338" },
    fabric: "cotton",
    silhouette: {
      hasHood: true, furTrim: true,
      outerLayer: { enabled: true, style: "parka", openFront: false, color: "#262729", fabric: "cotton", innerColor: "#141416", innerNeckline: "high", lengthStyle: "tunic" },
    },
    accessories: { zipper: { enabled: true, style: "matte_black", placement: "center_front", openPct: 0.05 } },
  },

  // ==================== GIRLS' FORMAL & OUTERWEAR (gf01–gf16) ====================
  gf01: {
    primaryColor: "#ccb7dd", trimColor: "#b59ac9",
    fabric: "tulle",
    print: { preset: "lace", target: "bodice", palette: ["#ccb7dd", "#ede4f5", "#b194c7"], repeat: 6 },
    silhouette: { neckline: "round", tiers: 3, isBallerinaTutu: true },
  },
  gf02: {
    primaryColor: "#a9cce2", trimColor: "#84afc9",
    fabric: "satin",
    silhouette: { neckline: "round", tiers: 2 },
  },
  gf03: {
    primaryColor: "#9396c9", trimColor: "#c8cae8",
    fabric: "tulle",
    silhouette: { neckline: "round", hasCape: true },
  },
  gf04: {
    primaryColor: "#f26f55", trimColor: "#cc4e3a",
    fabric: "satin",
    silhouette: { neckline: "round", tiers: 3 },
  },
  gf05: {
    primaryColor: "#242a46", trimColor: "#0e1220",
    partColors: { bodice: "#242a46", sleeve: "#242a46", skirt: "#242a46", trim: "#0e1220" },
    fabric: "wool",
    silhouette: { collarStyle: "peter-pan", contrastCollar: true, lapelStyle: "notched" },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "double_breasted", count: 6 } },
  },
  gf06: {
    primaryColor: "#12214b", trimColor: "#d4af37",
    partColors: { bodice: "#12214b", sleeve: "#12214b", skirt: "#12214b", trim: "#d4af37" },
    fabric: "satin",
    print: { preset: "brocade", target: "all", palette: ["#12214b", "#1e346e", "#d4af37"], repeat: 5 },
    silhouette: { neckline: "round" },
  },
  gf07: {
    primaryColor: "#850d20", trimColor: "#630715",
    fabric: "satin",
    print: { preset: "brocade", target: "all", palette: ["#850d20", "#a61c31", "#e5c17d"], repeat: 5 },
    silhouette: { neckline: "surplice", sash: true, sashColor: "#630715" },
  },
  gf08: {
    primaryColor: "#a2c2b7", trimColor: "#86a89c",
    fabric: "tulle",
    silhouette: { neckline: "off-shoulder", tiers: 3 },
  },
  gf09: {
    primaryColor: "#a97e52", trimColor: "#24201c",
    fabric: "wool",
    silhouette: { hasHood: true, isOpenFront: false },
    accessories: { buttons: { enabled: true, style: "horn", placement: "front_placket", count: 4 } },
  },
  gf10: {
    primaryColor: "#dfb8b6", trimColor: "#c89b99",
    fabric: "tulle",
    silhouette: { neckline: "round", tiers: 3, isBallerinaTutu: true },
  },
  gf11: {
    primaryColor: "#172756", fabric: "chiffon",
    silhouette: { neckline: "round", hasCape: true },
  },
  gf12: {
    primaryColor: "#dfc29f", trimColor: "#c8a37b",
    fabric: "satin",
    silhouette: { neckline: "round" },
  },
  gf13: {
    primaryColor: "#efede6", fabric: "cotton",
    silhouette: { lapelStyle: "notched", hasPeplum: true, sash: true, sashColor: "#efede6" },
    accessories: { belt: { enabled: true, style: "fabric_sash", width: "narrow", color: "#efede6" } },
  },
  gf14: {
    primaryColor: "#54706a", trimColor: "#3c544f",
    fabric: "wool",
    silhouette: { collarStyle: "sailor", hasPeplum: true },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "double_breasted", count: 6 } },
  },
  gf15: {
    primaryColor: "#ece7dc", trimColor: "#d9cfbe",
    fabric: "lace",
    print: { preset: "lace", target: "bodice", palette: ["#ece7dc", "#ffffff", "#d5cab6"], repeat: 6 },
    silhouette: { neckline: "round", sash: true, sashColor: "#e0d5c3" },
  },
  gf16: {
    primaryColor: "#ceb8d0", fabric: "wool",
    silhouette: { lapelStyle: "notched", hasPeplum: true, pleats: 10 },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "double_breasted", count: 6 } },
  },

  // ==================== BOYS' FORMAL & OUTERWEAR (bf01–bf16) ====================
  bf01: {
    primaryColor: "#141416", secondaryColor: "#f8fafc",
    partColors: { bodice: "#f8fafc", sleeve: "#141416", trousers: "#141416", outer: "#141416" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "tuxedo", openFront: true, lapelStyle: "shawl", color: "#141416", fabric: "satin", innerColor: "#f8fafc", innerNeckline: "collar", lengthStyle: "hip" },
    },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "front_placket", count: 2 } },
  },
  bf02: {
    primaryColor: "#152538", secondaryColor: "#ece8df", trimColor: "#1e2a3a",
    partColors: { bodice: "#152538", sleeve: "#ece8df", trousers: "#324966", trim: "#152538" },
    fabric: "wool",
    silhouette: { collarStyle: "mandarin", contrastCuffs: true, cuffColor: "#152538" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 6 } },
  },
  bf03: {
    primaryColor: "#dfc7af", trimColor: "#c49c68",
    fabric: "silk",
    print: { preset: "brocade", target: "all", palette: ["#dfc7af", "#f0e3d4", "#c49c68"], repeat: 6 },
    silhouette: { collarStyle: "mandarin", neckline: "high" },
    accessories: { buttons: { enabled: true, style: "gold", placement: "front_placket", count: 6 } },
  },
  bf04: {
    primaryColor: "#46474b", secondaryColor: "#f8fafc",
    partColors: { bodice: "#f8fafc", sleeve: "#46474b", trousers: "#46474b", outer: "#46474b" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "blazer", openFront: true, lapelStyle: "notched", color: "#46474b", fabric: "wool", innerColor: "#f8fafc", innerNeckline: "collar", lengthStyle: "hip" },
    },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "front_placket", count: 2 } },
  },
  bf05: {
    primaryColor: "#484534", trimColor: "#635444",
    fabric: "cotton",
    silhouette: { hasHood: true, furTrim: true },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "front_placket", count: 5 } },
  },
  bf06: {
    primaryColor: "#a87e58", secondaryColor: "#18181b",
    partColors: { bodice: "#18181b", sleeve: "#a87e58", trousers: "#18181b", outer: "#a87e58" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "overcoat", openFront: false, lapelStyle: "notched", color: "#a87e58", fabric: "wool", innerColor: "#18181b", innerNeckline: "high", lengthStyle: "coat" },
    },
    accessories: {
      buttons: { enabled: true, style: "tortoise", placement: "double_breasted", count: 6 },
      belt: { enabled: true, style: "fabric_sash", width: "wide", color: "#a87e58" },
    },
  },
  bf07: {
    primaryColor: "#222940", secondaryColor: "#f8fafc",
    partColors: { bodice: "#f8fafc", sleeve: "#f8fafc", trousers: "#222940", outer: "#222940" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "vest", openFront: false, lapelStyle: "none", color: "#222940", fabric: "wool", innerColor: "#f8fafc", innerNeckline: "collar", lengthStyle: "waist" },
    },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "front_placket", count: 4 } },
  },
  bf08: {
    primaryColor: "#2e4157", secondaryColor: "#f4f5f7", trimColor: "#c89248",
    partColors: { bodice: "#f4f5f7", sleeve: "#2e4157", outer: "#2e4157", trim: "#c89248" },
    fabric: "denim",
    print: { preset: "denim_stitch", target: "outer", palette: ["#2e4157", "#486382", "#c89248"], repeat: 4 },
    silhouette: {
      outerLayer: { enabled: true, style: "jacket", openFront: true, collarStyle: "pointed", color: "#2e4157", fabric: "denim", innerColor: "#f4f5f7", innerNeckline: "round", lengthStyle: "waist" },
    },
    accessories: { buttons: { enabled: true, style: "silver", placement: "front_placket", count: 5 } },
  },
  bf09: {
    primaryColor: "#d3c1aa", fabric: "cotton",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: {
      buttons: { enabled: true, style: "horn", placement: "front_placket", count: 5 },
      belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#d3c1aa" },
    },
  },
  bf10: {
    primaryColor: "#505054", secondaryColor: "#f4f4f6", trimColor: "#1c1c20",
    partColors: { bodice: "#f4f4f6", sleeve: "#505054", trousers: "#1f2024", outer: "#505054", trim: "#1c1c20" },
    fabric: "wool",
    silhouette: {
      contrastCollar: true,
      outerLayer: { enabled: true, style: "overcoat", openFront: false, lapelStyle: "notched", color: "#505054", fabric: "wool", trimColor: "#1c1c20", innerColor: "#f4f4f6", innerNeckline: "collar", lengthStyle: "coat" },
    },
    accessories: { buttons: { enabled: true, style: "matte_black", placement: "front_placket", count: 3 } },
  },
  bf11: {
    primaryColor: "#d2b48c", secondaryColor: "#1f2937",
    partColors: { bodice: "#1f2937", sleeve: "#d2b48c", trousers: "#1f2937", outer: "#d2b48c" },
    fabric: "cotton",
    silhouette: {
      outerLayer: { enabled: true, style: "trench", openFront: false, lapelStyle: "notched", color: "#d2b48c", fabric: "cotton", innerColor: "#1f2937", innerNeckline: "collar", lengthStyle: "coat" },
    },
    accessories: {
      buttons: { enabled: true, style: "tortoise", placement: "double_breasted", count: 6 },
      belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#d2b48c" },
    },
  },
  bf12: {
    primaryColor: "#21273b", secondaryColor: "#f8fafc",
    partColors: { bodice: "#f8fafc", sleeve: "#21273b", trousers: "#21273b", outer: "#21273b" },
    fabric: "wool",
    silhouette: {
      outerLayer: { enabled: true, style: "blazer", openFront: true, lapelStyle: "notched", color: "#21273b", fabric: "wool", innerColor: "#f8fafc", innerNeckline: "collar", lengthStyle: "hip" },
    },
    accessories: { buttons: { enabled: true, style: "horn", placement: "front_placket", count: 2 } },
  },
  bf13: {
    primaryColor: "#1c3369", secondaryColor: "#f7f7f9", trimColor: "#d4af37",
    partColors: { bodice: "#f7f7f9", sleeve: "#f7f7f9", outer: "#1c3369", trim: "#d4af37" },
    fabric: "silk",
    print: { preset: "brocade", target: "outer", palette: ["#1c3369", "#284890", "#d4af37"], repeat: 5 },
    silhouette: {
      outerLayer: { enabled: true, style: "vest", openFront: true, collarStyle: "mandarin", color: "#1c3369", fabric: "silk", trimColor: "#d4af37", innerColor: "#f7f7f9", innerNeckline: "high", lengthStyle: "tunic" },
    },
  },
  bf14: {
    primaryColor: "#202638", trimColor: "#4f3a27",
    fabric: "wool",
    silhouette: { hasHood: true },
    accessories: { buttons: { enabled: true, style: "horn", placement: "front_placket", count: 4 } },
  },
  bf15: {
    primaryColor: "#635c43", secondaryColor: "#b8a383", trimColor: "#252624",
    partColors: { bodice: "#635c43", sleeve: "#635c43", trousers: "#b8a383", trim: "#252624" },
    fabric: "cotton",
    silhouette: { contrastCuffs: true, cuffColor: "#252624", collarStyle: "mandarin" },
    accessories: { zipper: { enabled: true, style: "silver", placement: "center_front", openPct: 0.1 } },
  },
  bf16: {
    primaryColor: "#f2efe9", trimColor: "#d4af37",
    partColors: { bodice: "#f2efe9", sleeve: "#f2efe9", trousers: "#f7f6f2", trim: "#d4af37" },
    fabric: "silk",
    print: { preset: "brocade", target: "bodice", palette: ["#f2efe9", "#ffffff", "#d4af37"], repeat: 6 },
    silhouette: { collarStyle: "mandarin", neckline: "high" },
    accessories: { buttons: { enabled: true, style: "gold", placement: "front_placket", count: 6 } },
  },

  // ==================== GIRLS' GYMNASTICS LEOTARDS (gy001–gy100) ====================
  gy001: leo("#92132c", "jersey", "v", "full", "classic", false, "none", "long", { trimColor: "#d4d4d8" }),
  gy002: leo("#aeb2b8", "scuba", "mock", "racerback", "classic", false, "none", "none", { print: { preset: "shimmer", target: "all", palette: ["#aeb2b8", "#e5e7eb", "#6b7280"] } }),
  gy003: leo("#a4c8dc", "scuba", "halter", "racerback", "classic", true, "mesh", "none", { secondaryColor: "#cde4f2", skirtColor: "#a4c8dc", print: { preset: "mesh_inset", target: "bodice", palette: ["#a4c8dc", "#dbeefa"] } }),
  gy004: leo("#f4623a", "scuba", "halter", "lowscoop", "classic", false, "diagonal", "none", { secondaryColor: "#fbbf24", trimColor: "#be185d", print: { preset: "ombre", target: "all", palette: ["#db2777", "#f4623a", "#facc15"] } }),
  gy005: leo("#0e327d", "scuba", "halter", "racerback", "classic", false, "none", "none", { print: { preset: "shimmer", target: "all", palette: ["#0e327d", "#2563eb", "#071a45"] } }),
  gy006: leo("#432568", "scuba", "mock", "crossback", "classic", true, "mesh", "long", { secondaryColor: "#141029", skirtColor: "#3b235c", print: { preset: "galaxy", target: "all", palette: ["#141029", "#5b21b6", "#db2777", "#93c5fd"] } }),
  gy007: leo("#0d8a7e", "scuba", "boat", "racerback", "highcut", true, "mesh", "long", { secondaryColor: "#67d2dc", skirtColor: "#248f8b", print: { preset: "aurora", target: "all", palette: ["#064e3b", "#10b981", "#38bdf8", "#818cf8"] } }),
  gy008: leo("#df3a93", "scuba", "boat", "racerback", "highcut", true, "diagonal", "short", { secondaryColor: "#f3f4f8", skirtColor: "#df3a93", print: { preset: "colorblock_diagonal", target: "bodice", palette: ["#df3a93", "#f3f4f8", "#c4b5fd"] } }),
  gy009: leo("#f472b6", "scuba", "halter", "keyhole", "highcut", true, "sideInsert", "none", { secondaryColor: "#2dd4bf", skirtColor: "#38bdf8", print: { preset: "rainbow", target: "all", palette: ["#f472b6", "#facc15", "#4ade80", "#38bdf8", "#a855f7"] } }),
  gy010: leo("#929c86", "jersey", "v", "full", "highcut", true, "yoke", "cap", { secondaryColor: "#f3f1ea", skirtColor: "#89947c", print: { preset: "floral", target: "bodice", palette: ["#f3f1ea", "#c88d8f", "#7d8870"] } }),
  gy011: leo("#0f172e", "velvet", "round", "racerback", "classic", false, "none", "none"),
  gy012: leo("#c4a193", "scuba", "mock", "keyhole", "highcut", true, "none", "none", { secondaryColor: "#e8d8d0", skirtColor: "#caa79a", print: { preset: "shimmer", target: "all", palette: ["#c4a193", "#f3e3db", "#9c786a"] } }),
  gy013: leo("#efe8da", "lace", "offshoulder", "lowscoop", "classic", true, "yoke", "short", { secondaryColor: "#faf8f3", skirtColor: "#f5efe4", print: { preset: "lace", target: "bodice", palette: ["#efe8da", "#ffffff", "#d7cbb8"] } }),
  gy014: leo("#8f78c4", "scuba", "v", "lowscoop", "highcut", false, "none", "none", { secondaryColor: "#93c5fd", print: { preset: "marble", target: "all", palette: ["#8f78c4", "#c4b5fd", "#60a5fa", "#f5f3ff"] } }),
  gy015: leo("#eabfc2", "jersey", "v", "keyhole", "classic", true, "diagonal", "short", { secondaryColor: "#e6f2ef", skirtColor: "#eabfc2", print: { preset: "floral", target: "bodice", palette: ["#e6f2ef", "#eabfc2", "#7ab39b", "#d94f70"] } }),
  gy016: leo("#2563eb", "scuba", "halter", "keyhole", "highcut", false, "diagonal", "none", { secondaryColor: "#f59e0b", print: { preset: "prism", target: "all", palette: ["#2563eb", "#7c3aed", "#ec4899", "#f59e0b", "#06b6d4"] } }),
  gy017: leo("#9e7a4f", "scuba", "offshoulder", "keyhole", "classic", false, "sideInsert", "short", { trimColor: "#1f1c18", print: { preset: "leopard", target: "all", palette: ["#9e7a4f", "#c9a473", "#1f1c18"] } }),
  gy018: leo("#d8c2ea", "scuba", "v", "crossback", "classic", false, "sideInsert", "threeQuarter", { secondaryColor: "#f9c6d7", print: { preset: "tiedye", target: "all", palette: ["#d8c2ea", "#f9c6d7", "#93c5fd", "#fde68a"] } }),
  gy019: leo("#171719", "scuba", "mock", "crossback", "classic", false, "sideInsert", "threeQuarter", { secondaryColor: "#ec4899", print: { preset: "prism", target: "all", palette: ["#171719", "#171719", "#39e639", "#ec4899"] } }),
  gy020: leo("#16347e", "scuba", "mock", "keyhole", "highcut", true, "diagonal", "short", { secondaryColor: "#f8fafc", skirtColor: "#16347e", print: { preset: "colorblock_diagonal", target: "bodice", palette: ["#16347e", "#f8fafc", "#93c5fd"] } }),
  gy021: leo("#673063", "scuba", "halter", "lowscoop", "highcut", true, "mesh", "none", { secondaryColor: "#9c6293", skirtColor: "#673063", print: { preset: "shimmer", target: "bodice", palette: ["#673063", "#c084fc", "#4a1d48"] } }),
  gy022: leo("#f3d9cf", "jersey", "offshoulder", "racerback", "highcut", false, "yoke", "cap", { secondaryColor: "#fef6f3", print: { preset: "floral", target: "all", palette: ["#f3d9cf", "#f9a8d4", "#86efac", "#fef08a"] } }),
  gy023: leo("#054d38", "velvet", "mock", "lowscoop", "classic", true, "sideInsert", "threeQuarter", { secondaryColor: "#25705a", skirtColor: "#054d38", print: { preset: "mesh_inset", target: "bodice", palette: ["#054d38", "#10b981"] } }),
  gy024: leo("#1a2847", "scuba", "mock", "racerback", "classic", true, "sideInsert", "threeQuarter", { secondaryColor: "#d1d5db", skirtColor: "#1a2847", print: { preset: "stripes", target: "bodice", palette: ["#1a2847", "#d1d5db"] } }),
  gy025: leo("#241b4b", "scuba", "round", "full", "highcut", false, "mesh", "long", { secondaryColor: "#9d174d", print: { preset: "galaxy", target: "all", palette: ["#111025", "#4c1d95", "#be185d", "#60a5fa"] } }),
  gy026: leo("#1a1a1f", "scuba", "v", "keyhole", "classic", false, "mesh", "long", { secondaryColor: "#9ca3af", print: { preset: "shimmer", target: "bodice", palette: ["#1a1a1f", "#e5e7eb", "#374151"] } }),
  gy027: leo("#2d2459", "scuba", "boat", "racerback", "classic", false, "sideInsert", "threeQuarter", { secondaryColor: "#f3a86b", print: { preset: "ombre", target: "all", palette: ["#f3a86b", "#7c3aed", "#1e1b4b"] } }),
  gy028: leo("#cbb2dc", "jersey", "offshoulder", "keyhole", "highcut", true, "sideInsert", "short", { secondaryColor: "#e9d5ff", skirtColor: "#cbb2dc", print: { preset: "floral", target: "bodice", palette: ["#cbb2dc", "#f9a8d4", "#ffffff"] } }),
  gy029: leo("#0b6142", "scuba", "offshoulder", "keyhole", "classic", false, "yoke", "none", { secondaryColor: "#e6c768", print: { preset: "atelier", target: "bodice", palette: ["#0b6142", "#e6c768", "#06402b"] } }),
  gy030: leo("#c7c9ce", "scuba", "offshoulder", "crossback", "classic", false, "yoke", "short", { secondaryColor: "#18181b", print: { preset: "marble", target: "all", palette: ["#e5e7eb", "#3f3f46", "#18181b"] } }),
  gy031: leo("#c89393", "velvet", "offshoulder", "full", "classic", true, "none", "short", { secondaryColor: "#dfc0bf", skirtColor: "#c89393" }),
  gy032: leo("#9e226b", "scuba", "v", "lowscoop", "highcut", true, "yoke", "cap", { secondaryColor: "#d977a8", skirtColor: "#9e226b", print: { preset: "shimmer", target: "bodice", palette: ["#9e226b", "#f472b6", "#581c87"] } }),
  gy033: leo("#2e256b", "scuba", "v", "racerback", "classic", false, "mesh", "long", { secondaryColor: "#6366f1", print: { preset: "galaxy", target: "all", palette: ["#1e1b4b", "#4f46e5", "#c026d3", "#38bdf8"] } }),
  gy034: leo("#1646a8", "scuba", "v", "keyhole", "highcut", false, "diagonal", "short", { secondaryColor: "#22d3ee", print: { preset: "prism", target: "all", palette: ["#1646a8", "#06b6d4", "#a855f7", "#0f172a"] } }),
  gy035: leo("#542166", "velvet", "round", "crossback", "classic", true, "none", "none", { skirtColor: "#542166" }),
  gy036: leo("#0f6f7d", "scuba", "v", "keyhole", "highcut", true, "sideInsert", "threeQuarter", { secondaryColor: "#5eead4", skirtColor: "#0e7482", print: { preset: "aurora", target: "all", palette: ["#0f6f7d", "#2dd4bf", "#38bdf8", "#0f172a"] } }),
  gy037: leo("#b6b3ce", "scuba", "boat", "crossback", "highcut", false, "yoke", "cap", { secondaryColor: "#f0abfc", print: { preset: "shimmer", target: "all", palette: ["#b6b3ce", "#f0abfc", "#93c5fd"] } }),
  gy038: leo("#e66a2c", "scuba", "offshoulder", "racerback", "highcut", true, "sideInsert", "short", { secondaryColor: "#0284c7", skirtColor: "#16a34a", print: { preset: "rainbow", target: "all", palette: ["#ef4444", "#facc15", "#22c55e", "#0284c7", "#8b5cf6"] } }),
  gy039: leo("#9bc5db", "scuba", "v", "crossback", "classic", true, "none", "none", { skirtColor: "#b8daec", print: { preset: "shimmer", target: "bodice", palette: ["#9bc5db", "#e0f2fe", "#7dd3fc"] } }),
  gy040: leo("#27272e", "jersey", "mock", "full", "classic", false, "yoke", "cap", { secondaryColor: "#9ca3af", print: { preset: "houndstooth", target: "bodice", palette: ["#27272e", "#d1d5db"] } }),
  gy041: leo("#c9833d", "scuba", "boat", "keyhole", "highcut", false, "sideInsert", "threeQuarter", { trimColor: "#241911", print: { preset: "leopard", target: "all", palette: ["#c9833d", "#f59e0b", "#241911"] } }),
  gy042: leo("#2b123f", "scuba", "offshoulder", "crossback", "highcut", false, "sideInsert", "short", { secondaryColor: "#facc15", print: { preset: "prism", target: "all", palette: ["#2b123f", "#facc15", "#ec4899", "#06b6d4"] } }),
  gy043: leo("#c9c2d6", "jersey", "round", "lowscoop", "classic", true, "sideInsert", "threeQuarter", { secondaryColor: "#e2c8ca", skirtColor: "#cfc9da", print: { preset: "marble", target: "all", palette: ["#c9c2d6", "#f5d0fe", "#bae6fd", "#fef3c7"] } }),
  gy044: leo("#16295c", "scuba", "halter", "keyhole", "highcut", false, "mesh", "none", { secondaryColor: "#facc15", print: { preset: "ombre", target: "all", palette: ["#16295c", "#f97316", "#fde047"] } }),
  gy045: leo("#f6cab6", "jersey", "round", "crossback", "classic", true, "yoke", "cap", { secondaryColor: "#e8edf0", skirtColor: "#f6cab6", print: { preset: "floral", target: "bodice", palette: ["#e8edf0", "#f6cab6", "#9ae6b4"] } }),
  gy046: leo("#18191e", "velvet", "offshoulder", "full", "classic", true, "mesh", "cap", { secondaryColor: "#6b7280", skirtColor: "#4b4d54", print: { preset: "shimmer", target: "skirt", palette: ["#3f4148", "#d1d5db", "#18191e"] } }),
  gy047: leo("#202022", "scuba", "halter", "keyhole", "classic", false, "sideInsert", "none", { trimColor: "#d1d5db" }),
  gy048: leo("#ea6a54", "scuba", "mock", "lowscoop", "classic", false, "sideInsert", "threeQuarter", { secondaryColor: "#d68f48", print: { preset: "tiedye", target: "all", palette: ["#ea6a54", "#fb923c", "#facc15", "#9333ea"] } }),
  gy049: leo("#6e081a", "scuba", "halter", "racerback", "highcut", false, "diagonal", "none", { secondaryColor: "#9c1f35", print: { preset: "colorblock_diagonal", target: "all", palette: ["#6e081a", "#b43144", "#45030e"] } }),
  gy050: leo("#162347", "scuba", "mock", "keyhole", "highcut", true, "mesh", "long", { secondaryColor: "#334673", skirtColor: "#1a284f", print: { preset: "shimmer", target: "bodice", palette: ["#162347", "#e5e7eb", "#273a69"] } }),
  gy051: leo("#e45680", "jersey", "boat", "full", "classic", true, "diagonal", "short", { secondaryColor: "#f5b5c8", skirtColor: "#e45680", print: { preset: "colorblock_diagonal", target: "bodice", palette: ["#e45680", "#f5b5c8"] } }),
  gy052: leo("#844d2a", "scuba", "mock", "lowscoop", "classic", false, "none", "none", { print: { preset: "shimmer", target: "all", palette: ["#844d2a", "#d99b66", "#5c3318"] } }),
  gy053: leo("#103b9c", "scuba", "halter", "racerback", "classic", false, "none", "none"),
  gy054: leo("#8c919b", "jersey", "mock", "racerback", "classic", false, "sideInsert", "threeQuarter", { secondaryColor: "#d1d5db", print: { preset: "marble", target: "all", palette: ["#8c919b", "#d1d5db", "#4b5563"] } }),
  gy055: leo("#3c112e", "velvet", "boat", "full", "classic", false, "sideInsert", "threeQuarter"),
  gy056: leo("#151518", "scuba", "round", "full", "highcut", false, "sideInsert", "threeQuarter", { secondaryColor: "#e5e7eb", print: { preset: "stripes", target: "bodice", palette: ["#151518", "#d1d5db"] } }),
  gy057: leo("#eac3c5", "jersey", "offshoulder", "lowscoop", "highcut", false, "none", "cap"),
  gy058: leo("#dfc39f", "lace", "boat", "lowscoop", "highcut", true, "none", "cap", { secondaryColor: "#ede0cc", skirtColor: "#e3caa8", print: { preset: "lace", target: "bodice", palette: ["#dfc39f", "#faf4ea", "#c8a97e"] } }),
  gy059: leo("#151e3b", "scuba", "mock", "crossback", "highcut", false, "mesh", "long", { secondaryColor: "#d4af37", print: { preset: "shimmer", target: "all", palette: ["#151e3b", "#fde68a", "#0f172a"] } }),
  gy060: leo("#066d5a", "scuba", "v", "racerback", "classic", false, "yoke", "cap", { secondaryColor: "#141418", print: { preset: "prism", target: "bodice", palette: ["#066d5a", "#34d399", "#141418"] } }),
  gy061: leo("#dc5b3c", "scuba", "halter", "crossback", "highcut", true, "diagonal", "none", { secondaryColor: "#f59e0b", skirtColor: "#dc5b3c", print: { preset: "ombre", target: "all", palette: ["#dc2626", "#f97316", "#facc15"] } }),
  gy062: leo("#a5b2d6", "lace", "offshoulder", "racerback", "classic", true, "mesh", "short", { secondaryColor: "#d8dff2", skirtColor: "#aebce3", print: { preset: "lace", target: "bodice", palette: ["#a5b2d6", "#eef2ff", "#7b8bb8"] } }),
  gy063: leo("#12121a", "scuba", "halter", "lowscoop", "classic", false, "mesh", "none", { secondaryColor: "#06b6d4", print: { preset: "aurora", target: "all", palette: ["#12121a", "#06b6d4", "#10b981", "#6366f1"] } }),
  gy064: leo("#c7b0d6", "scuba", "boat", "full", "highcut", true, "diagonal", "short", { secondaryColor: "#e5e7eb", skirtColor: "#cbb5da", print: { preset: "colorblock_diagonal", target: "bodice", palette: ["#c7b0d6", "#e9d5ff", "#e5e7eb"] } }),
  gy065: leo("#f1f2f6", "jersey", "boat", "lowscoop", "highcut", false, "sideInsert", "threeQuarter", { secondaryColor: "#38bdf8", print: { preset: "rainbow", target: "bodice", palette: ["#ef4444", "#facc15", "#22c55e", "#0284c7", "#a855f7"] } }),
  gy066: leo("#c98232", "scuba", "boat", "crossback", "classic", false, "sideInsert", "threeQuarter", { secondaryColor: "#181412", print: { preset: "tiger", target: "all", palette: ["#c98232", "#f59e0b", "#181412"] } }),
  gy067: leo("#132654", "scuba", "offshoulder", "keyhole", "highcut", true, "diagonal", "cap", { secondaryColor: "#274382", skirtColor: "#132654", print: { preset: "colorblock_diagonal", target: "bodice", palette: ["#132654", "#3b82f6", "#0b1633"] } }),
  gy068: leo("#a47ec4", "scuba", "round", "crossback", "highcut", false, "mesh", "long", { secondaryColor: "#67e8f9", print: { preset: "tiedye", target: "all", palette: ["#67e8f9", "#c084fc", "#f472b6", "#3b82f6"] } }),
  gy069: leo("#cfa132", "scuba", "halter", "keyhole", "highcut", false, "none", "none", { print: { preset: "shimmer", target: "all", palette: ["#cfa132", "#fde047", "#9a7116"] } }),
  gy070: leo("#121314", "scuba", "v", "racerback", "classic", false, "sideInsert", "threeQuarter", { secondaryColor: "#22c55e", print: { preset: "prism", target: "bodice", palette: ["#121314", "#22c55e", "#ec4899", "#38bdf8"] } }),
  gy071: leo("#1f2024", "scuba", "v", "full", "highcut", false, "mesh", "long", { secondaryColor: "#d1d5db", print: { preset: "shimmer", target: "all", palette: ["#1f2024", "#d1d5db", "#4b5563"] } }),
  gy072: leo("#8ac2de", "scuba", "mock", "keyhole", "classic", false, "diagonal", "short", { secondaryColor: "#e0f2fe", print: { preset: "marble", target: "all", palette: ["#0284c7", "#8ac2de", "#e0f2fe"] } }),
  gy073: leo("#b420a2", "jersey", "round", "lowscoop", "highcut", false, "yoke", "cap", { secondaryColor: "#d864cc", print: { preset: "colorblock_yoke", target: "bodice", palette: ["#b420a2", "#e879f9"] } }),
  gy074: leo("#b58f42", "scuba", "round", "racerback", "highcut", false, "yoke", "cap", { secondaryColor: "#ebd7a0", print: { preset: "shimmer", target: "all", palette: ["#b58f42", "#fef08a", "#785a1c"] } }),
  gy075: leo("#cbb2cf", "jersey", "offshoulder", "keyhole", "highcut", true, "yoke", "short", { secondaryColor: "#e5d5ea", skirtColor: "#cbb2cf", print: { preset: "colorblock_yoke", target: "bodice", palette: ["#cbb2cf", "#e5d5ea"] } }),
  gy076: leo("#e6e0d4", "scuba", "v", "crossback", "highcut", true, "sideInsert", "threeQuarter", { secondaryColor: "#cbbba4", skirtColor: "#ebe6dc", print: { preset: "marble", target: "bodice", palette: ["#e6e0d4", "#ffffff", "#c8b9a3"] } }),
  gy077: leo("#561726", "velvet", "halter", "crossback", "highcut", true, "sideInsert", "none", { skirtColor: "#561726" }),
  gy078: leo("#2e214d", "scuba", "boat", "keyhole", "classic", false, "mesh", "long", { secondaryColor: "#7e22ce", print: { preset: "galaxy", target: "all", palette: ["#140f29", "#5b21b6", "#be185d", "#93c5fd"] } }),
  gy079: leo("#2aa9cf", "scuba", "halter", "full", "highcut", false, "mesh", "none", { secondaryColor: "#bae6fd", print: { preset: "mesh_inset", target: "bodice", palette: ["#2aa9cf", "#bae6fd"] } }),
  gy080: leo("#d98b24", "jersey", "offshoulder", "crossback", "highcut", false, "none", "short"),
  gy081: leo("#1f7d7a", "scuba", "boat", "lowscoop", "classic", false, "mesh", "long", { secondaryColor: "#67e8f9", print: { preset: "shimmer", target: "all", palette: ["#1f7d7a", "#5eead4", "#0f4e4d"] } }),
  gy082: leo("#4f5766", "scuba", "boat", "crossback", "highcut", false, "sideInsert", "threeQuarter", { secondaryColor: "#1f242e", print: { preset: "colorblock_diagonal", target: "bodice", palette: ["#4f5766", "#1f242e", "#9ca3af"] } }),
  gy083: leo("#dbd6e6", "scuba", "halter", "racerback", "classic", false, "yoke", "none", { secondaryColor: "#f3f0f8", print: { preset: "shimmer", target: "bodice", palette: ["#dbd6e6", "#ffffff", "#b8afc9"] } }),
  gy084: leo("#dec294", "scuba", "halter", "crossback", "highcut", true, "yoke", "none", { secondaryColor: "#f0dfc0", skirtColor: "#e4c99b", print: { preset: "shimmer", target: "bodice", palette: ["#dec294", "#fef3c7", "#b89658"] } }),
  gy085: leo("#9e6e70", "lace", "boat", "keyhole", "classic", true, "none", "none", { skirtColor: "#b8898b", print: { preset: "lace", target: "bodice", palette: ["#9e6e70", "#d8b4b5", "#7a4c4e"] } }),
  gy086: leo("#eb504c", "scuba", "halter", "keyhole", "classic", false, "diagonal", "none", { secondaryColor: "#fca5a5", print: { preset: "ombre", target: "all", palette: ["#fca5a5", "#eb504c", "#b91c1c"] } }),
  gy087: leo("#ece0ad", "scuba", "round", "keyhole", "highcut", false, "mesh", "long", { secondaryColor: "#f8f3d8", print: { preset: "shimmer", target: "all", palette: ["#ece0ad", "#ffffff", "#d4bf7a"] } }),
  gy088: leo("#df87a6", "scuba", "mock", "crossback", "highcut", true, "sideInsert", "threeQuarter", { secondaryColor: "#f4c2d4", skirtColor: "#e69db6", print: { preset: "tiedye", target: "bodice", palette: ["#e11d8f", "#f9a8d4", "#ffffff", "#a855f7"] } }),
  gy089: leo("#383a42", "scuba", "offshoulder", "racerback", "highcut", false, "mesh", "cap", { secondaryColor: "#d1d5db", print: { preset: "shimmer", target: "bodice", palette: ["#383a42", "#e5e7eb", "#18181b"] } }),
  gy090: leo("#e6a4a8", "scuba", "v", "lowscoop", "classic", true, "mesh", "threeQuarter", { secondaryColor: "#93c5fd", skirtColor: "#f9c6cf", print: { preset: "rainbow", target: "all", palette: ["#fda4af", "#fde047", "#86efac", "#93c5fd", "#d8b4fe"] } }),
  gy091: leo("#0a7d66", "jersey", "v", "keyhole", "classic", false, "yoke", "cap", { secondaryColor: "#86efac", print: { preset: "colorblock_yoke", target: "bodice", palette: ["#0a7d66", "#a7f3d0"] } }),
  gy092: leo("#c6b3cd", "scuba", "boat", "full", "highcut", false, "sideInsert", "threeQuarter", { secondaryColor: "#e9d5ff", print: { preset: "marble", target: "all", palette: ["#c6b3cd", "#f5d0fe", "#a78bfa"] } }),
  gy093: leo("#b6b8be", "scuba", "boat", "full", "highcut", false, "none", "none", { print: { preset: "shimmer", target: "all", palette: ["#b6b8be", "#f3f4f6", "#6b7280"] } }),
  gy094: leo("#f6cfc1", "jersey", "v", "full", "highcut", false, "yoke", "cap", { secondaryColor: "#fae8e0", print: { preset: "floral", target: "bodice", palette: ["#f6cfc1", "#f472b6", "#86efac", "#fff5f0"] } }),
  gy095: leo("#b2d6c4", "jersey", "boat", "lowscoop", "classic", false, "yoke", "cap", { secondaryColor: "#dcf2e7", print: { preset: "colorblock_yoke", target: "bodice", palette: ["#b2d6c4", "#e6f7ef"] } }),
  gy096: leo("#bad4e6", "scuba", "round", "racerback", "highcut", true, "yoke", "cap", { secondaryColor: "#e0eff9", skirtColor: "#c4deee", print: { preset: "colorblock_yoke", target: "bodice", palette: ["#bad4e6", "#f0f9ff"] } }),
  gy097: leo("#eed349", "scuba", "boat", "racerback", "classic", true, "diagonal", "short", { secondaryColor: "#fef08a", skirtColor: "#f3dc6b", print: { preset: "shimmer", target: "bodice", palette: ["#eed349", "#fef9c3", "#ca8a04"] } }),
  gy098: leo("#58259c", "scuba", "offshoulder", "lowscoop", "classic", false, "diagonal", "short", { secondaryColor: "#e9d5ff", print: { preset: "colorblock_diagonal", target: "all", palette: ["#58259c", "#e9d5ff", "#7e22ce"] } }),
  gy099: leo("#0e9fd4", "scuba", "halter", "lowscoop", "highcut", false, "diagonal", "none", { secondaryColor: "#7dd3fc", print: { preset: "marble", target: "all", palette: ["#0284c7", "#38bdf8", "#e0f2fe"] } }),
  gy100: leo("#472670", "scuba", "halter", "racerback", "classic", false, "mesh", "none", { secondaryColor: "#c084fc", print: { preset: "galaxy", target: "all", palette: ["#1e1b4b", "#581c87", "#9333ea", "#38bdf8"] } }),

  // ==================== UNDERWEAR: WOMEN (wu01–wu06) ====================
  wu01: { primaryColor: "#141416", trimColor: "#26262a", fabric: "jersey", silhouette: { briefRise: "mid", briefCut: "full" } },
  wu02: { primaryColor: "#dab4a2", trimColor: "#c89e8c", fabric: "scuba", silhouette: { briefRise: "high", briefCut: "full" } },
  wu03: { primaryColor: "#d9b7b0", trimColor: "#c29e96", fabric: "cotton", silhouette: { briefRise: "low", briefCut: "bikini" } },
  wu04: {
    primaryColor: "#728072", trimColor: "#5c6a5c", fabric: "jersey",
    print: { preset: "ribbed", target: "trousers", palette: ["#728072", "#596659"], repeat: 6 },
    silhouette: { briefRise: "low", briefCut: "hipster" },
  },
  wu05: { primaryColor: "#1a223a", trimColor: "#2e3959", fabric: "jersey", silhouette: { briefRise: "mid", briefCut: "boyshort", briefLegDropFrac: 0.14 } },
  wu06: { primaryColor: "#ded3be", trimColor: "#c7b89c", fabric: "cotton", silhouette: { briefRise: "high", briefCut: "full" } },

  // ==================== UNDERWEAR: MEN (mu01–mu06) ====================
  mu01: {
    primaryColor: "#1c2b4a", trimColor: "#dfe4ec",
    partColors: { trousers: "#1c2b4a", trim: "#dfe4ec" },
    fabric: "cotton",
    silhouette: { briefRise: "mid", briefCut: "full", waistbandColor: "#dfe4ec" },
  },
  mu02: {
    primaryColor: "#48484c", trimColor: "#142038",
    partColors: { trousers: "#48484c", trim: "#142038" },
    fabric: "jersey",
    silhouette: { briefRise: "low", briefCut: "hipster", waistbandColor: "#142038" },
  },
  mu03: {
    primaryColor: "#172740", trimColor: "#a1a8b5",
    partColors: { trousers: "#172740", trim: "#a1a8b5" },
    fabric: "jersey",
    silhouette: { briefRise: "mid", briefCut: "boxer", briefLegDropFrac: 0.25, waistbandColor: "#a1a8b5" },
  },
  mu04: {
    primaryColor: "#581726", trimColor: "#1a1a1d",
    partColors: { trousers: "#581726", trim: "#1a1a1d" },
    fabric: "jersey",
    silhouette: { briefRise: "low", briefCut: "trunk", briefLegDropFrac: 0.16, waistbandColor: "#1a1a1d" },
  },
  mu05: {
    primaryColor: "#32343a", trimColor: "#84cc16",
    partColors: { trousers: "#32343a", trim: "#84cc16" },
    fabric: "scuba",
    silhouette: { briefRise: "mid", briefCut: "bikini", contrastStitch: "#84cc16", waistbandColor: "#18181b" },
  },
  mu06: {
    primaryColor: "#f4f4f6", trimColor: "#dfe1e6",
    partColors: { trousers: "#f4f4f6", trim: "#dfe1e6" },
    fabric: "cotton",
    print: { preset: "ribbed", target: "trousers", palette: ["#f4f4f6", "#dfe1e6"], repeat: 6 },
    silhouette: { briefRise: "high", briefCut: "full", waistbandColor: "#e6e7eb" },
  },

  // ==================== UNDERWEAR: GIRLS (gu01–gu06) ====================
  gu01: { primaryColor: "#e6d8d4", trimColor: "#d3b5b2", fabric: "cotton", silhouette: { briefRise: "mid", briefCut: "full" } },
  gu02: {
    primaryColor: "#e6d28e", trimColor: "#c9b065", fabric: "cotton",
    silhouette: { briefRise: "high", briefCut: "full" },
    accessories: { bow: { enabled: true, color: "#f6e8b8", placement: "waist" } },
  },
  gu03: {
    primaryColor: "#82a8ca", trimColor: "#f8fafc",
    partColors: { trousers: "#82a8ca", trim: "#f8fafc" },
    fabric: "cotton",
    print: { preset: "polka", target: "trousers", palette: ["#82a8ca", "#f8fafc"], repeat: 8 },
    silhouette: { briefRise: "low", briefCut: "bikini", waistbandColor: "#f8fafc" },
    accessories: { bow: { enabled: true, color: "#f8fafc", placement: "waist" } },
  },
  gu04: {
    primaryColor: "#b6b1c7", trimColor: "#a2c4bc",
    fabric: "cotton",
    print: { preset: "stripes", target: "trousers", palette: ["#b6b1c7", "#b8d6cd", "#eef2f6"], repeat: 8 },
    silhouette: { briefRise: "low", briefCut: "hipster" },
  },
  gu05: {
    primaryColor: "#9a9a9c", trimColor: "#ef7a7a",
    partColors: { trousers: "#9a9a9c", trim: "#ef7a7a" },
    fabric: "jersey",
    silhouette: { briefRise: "mid", briefCut: "boyshort", briefLegDropFrac: 0.14, contrastStitch: "#ef7a7a" },
  },
  gu06: {
    primaryColor: "#dbb9af", trimColor: "#c79e92", fabric: "cotton",
    silhouette: { briefRise: "high", briefCut: "full" },
    accessories: { bow: { enabled: true, color: "#c79e92", placement: "waist" } },
  },

  // ==================== UNDERWEAR: BOYS (bu01–bu06) ====================
  bu01: {
    primaryColor: "#8e9094", trimColor: "#1b2847",
    partColors: { trousers: "#8e9094", trim: "#1b2847" },
    fabric: "jersey",
    silhouette: { briefRise: "mid", briefCut: "boxer", briefLegDropFrac: 0.24, waistbandColor: "#1b2847" },
  },
  bu02: {
    primaryColor: "#7ca5c8", trimColor: "#e8eef5",
    partColors: { trousers: "#7ca5c8", trim: "#1f304d" },
    fabric: "cotton",
    silhouette: { briefRise: "low", briefCut: "full", waistbandColor: "#f1f5f9" },
  },
  bu03: {
    primaryColor: "#38383c", trimColor: "#161618",
    partColors: { trousers: "#38383c", trim: "#161618" },
    fabric: "jersey",
    silhouette: { briefRise: "mid", briefCut: "boxer", briefLegDropFrac: 0.26, waistbandColor: "#161618" },
  },
  bu04: {
    primaryColor: "#0e439c", trimColor: "#c4c7ce",
    partColors: { trousers: "#0e439c", trim: "#c4c7ce" },
    fabric: "jersey",
    silhouette: { briefRise: "low", briefCut: "trunk", briefLegDropFrac: 0.16, waistbandColor: "#c4c7ce" },
  },
  bu05: {
    primaryColor: "#841727", trimColor: "#202024",
    partColors: { trousers: "#841727", trim: "#202024" },
    fabric: "scuba",
    silhouette: { briefRise: "mid", briefCut: "bikini", waistbandColor: "#202024" },
  },
  bu06: {
    primaryColor: "#f4f4f6", trimColor: "#dfe1e6",
    fabric: "cotton",
    print: { preset: "ribbed", target: "trousers", palette: ["#f4f4f6", "#dfe1e6"], repeat: 6 },
    silhouette: { briefRise: "high", briefCut: "full" },
  },

  // ==================== BRAS: WOMEN (wb01–wb10) ====================
  wb01: {
    primaryColor: "#be8c7d", trimColor: "#9c6d5f", fabric: "satin",
    print: { preset: "lace", target: "bodice", palette: ["#be8c7d", "#e3c5bb", "#9c6d5f"], repeat: 7 },
    silhouette: { style: "bra", bra: { style: "soft-cup", cupDepthF: 1.0, longline: false, strapStyle: "standard", wideStrap: false, bow: true } },
    accessories: { bow: { enabled: true, color: "#e8cbbf", placement: "center_chest" } },
  },
  wb02: {
    primaryColor: "#dac5ae", trimColor: "#c2a588", fabric: "lace",
    print: { preset: "lace", target: "bodice", palette: ["#dac5ae", "#f2e7d8", "#b99c7f"], repeat: 7 },
    silhouette: { style: "bra", bra: { style: "balconette", cupDepthF: 0.85, longline: false, strapStyle: "standard", wideStrap: false, bow: true } },
  },
  wb03: {
    primaryColor: "#5c1726", trimColor: "#400d17", fabric: "satin",
    silhouette: { style: "bra", bra: { style: "plunge", cupDepthF: 1.0, longline: false, strapStyle: "standard", wideStrap: false, bow: false } },
  },
  wb04: {
    primaryColor: "#435169", trimColor: "#2d3748", fabric: "scuba",
    silhouette: { style: "bra", bra: { style: "full-coverage", cupDepthF: 1.25, longline: false, strapStyle: "standard", wideStrap: true, bow: false } },
  },
  wb05: {
    primaryColor: "#cf9298", trimColor: "#b5747b", fabric: "jersey",
    print: { preset: "ribbed", target: "bodice", palette: ["#cf9298", "#b3737a"], repeat: 6 },
    silhouette: { style: "bra", bra: { style: "soft-cup", cupDepthF: 0.9, longline: false, strapStyle: "racerback", wideStrap: false, bow: false } },
  },
  wb06: {
    primaryColor: "#efeae0", trimColor: "#dcd4c6", fabric: "cotton",
    silhouette: { style: "bra", bra: { style: "triangle", cupDepthF: 0.75, longline: false, strapStyle: "standard", wideStrap: false, bow: false } },
  },
  wb07: {
    primaryColor: "#0b4e3e", trimColor: "#146e59", fabric: "lace",
    print: { preset: "lace", target: "bodice", palette: ["#0b4e3e", "#1d7a64", "#06362b"], repeat: 7 },
    silhouette: { style: "bra", bra: { style: "soft-cup", cupDepthF: 0.9, longline: true, strapStyle: "standard", wideStrap: false, bow: false } },
  },
  wb08: {
    primaryColor: "#18181a", trimColor: "#2c2c30", fabric: "jersey",
    print: { preset: "ribbed", target: "bodice", palette: ["#18181a", "#2b2b30"], repeat: 7 },
    silhouette: { style: "bra", bra: { style: "bandeau", cupDepthF: 0.4, longline: false, strapStyle: "none", wideStrap: false, bow: false } },
  },
  wb09: {
    primaryColor: "#1449a3", trimColor: "#1e293b",
    partColors: { bodice: "#1449a3", trim: "#1e293b" },
    fabric: "scuba",
    silhouette: { style: "bra", bra: { style: "sport", cupDepthF: 0.95, longline: false, strapStyle: "racerback", wideStrap: true, bow: false } },
  },
  wb10: {
    primaryColor: "#c7a07e", trimColor: "#b08968", fabric: "scuba",
    silhouette: { style: "bra", bra: { style: "strapless", cupDepthF: 1.05, longline: false, strapStyle: "none", wideStrap: false, bow: false } },
  },

  // ==================== BRAS: GIRLS (gb01–gb10) ====================
  gb01: {
    primaryColor: "#f5f5f5", trimColor: "#e2e2e4", fabric: "cotton",
    silhouette: { style: "bra", bra: { style: "triangle", cupDepthF: 0.7, longline: false, strapStyle: "standard", wideStrap: false, bow: true } },
    accessories: { bow: { enabled: true, color: "#ffffff", placement: "center_chest" } },
  },
  gb02: {
    primaryColor: "#b3b4b7", trimColor: "#e8b4be",
    partColors: { bodice: "#b3b4b7", trim: "#e8b4be" },
    fabric: "jersey",
    silhouette: { style: "bra", bra: { style: "triangle", cupDepthF: 0.7, longline: false, strapStyle: "racerback", wideStrap: true, bow: false } },
  },
  gb03: {
    primaryColor: "#b0d8cb", trimColor: "#89baa9", fabric: "cotton",
    silhouette: { style: "bra", bra: { style: "soft-cup", cupDepthF: 0.8, longline: false, strapStyle: "standard", wideStrap: false, bow: false } },
  },
  gb04: {
    primaryColor: "#d9a9a7", trimColor: "#c28c8a", fabric: "jersey",
    print: { preset: "ribbed", target: "bodice", palette: ["#d9a9a7", "#be8886"], repeat: 6 },
    silhouette: { style: "bra", bra: { style: "soft-cup", cupDepthF: 0.75, longline: true, strapStyle: "standard", wideStrap: true, bow: false } },
  },
  gb05: {
    primaryColor: "#d9c2e3", trimColor: "#bfa2cd", fabric: "jersey",
    silhouette: { style: "bra", bra: { style: "bandeau", cupDepthF: 0.35, longline: false, strapStyle: "none", wideStrap: false, bow: false } },
  },
  gb06: {
    primaryColor: "#ebc4b4", trimColor: "#f8fafc",
    partColors: { bodice: "#ebc4b4", trim: "#f8fafc" },
    fabric: "cotton",
    silhouette: { style: "bra", bra: { style: "triangle", cupDepthF: 0.7, longline: false, strapStyle: "standard", wideStrap: false, bow: false } },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 2 } },
  },
  gb07: {
    primaryColor: "#14a6bf", trimColor: "#f8fafc",
    partColors: { bodice: "#14a6bf", trim: "#f8fafc" },
    fabric: "scuba",
    silhouette: { style: "bra", bra: { style: "sport", cupDepthF: 0.9, longline: false, strapStyle: "racerback", wideStrap: true, bow: false } },
  },
  gb08: {
    primaryColor: "#e6d18a", trimColor: "#cbb264", fabric: "cotton",
    silhouette: { style: "bra", bra: { style: "balconette", cupDepthF: 0.72, longline: false, strapStyle: "standard", wideStrap: true, bow: false } },
  },
  gb09: {
    primaryColor: "#8fb3d4", trimColor: "#6d91b5", fabric: "jersey",
    silhouette: { style: "bra", bra: { style: "triangle", cupDepthF: 0.72, longline: false, strapStyle: "standard", wideStrap: true, bow: false } },
  },
  gb10: {
    primaryColor: "#e5dac8", trimColor: "#cdbfa8", fabric: "jersey",
    silhouette: { style: "bra", bra: { style: "triangle", cupDepthF: 0.65, longline: false, strapStyle: "standard", wideStrap: false, bow: false } },
  },

  // ==================== 12 REFERENCE PATTERNS (ref_*) ====================
  ref_w_blouse: { primaryColor: "#ece7dc", fabric: "silk", silhouette: { neckline: "round" } },
  ref_w_skirt: { primaryColor: "#141c33", fabric: "wool" },
  ref_w_shirtdress: {
    primaryColor: "#545838", trimColor: "#3e4228",
    fabric: "linen",
    silhouette: { collarStyle: "pointed", neckline: "collar", sash: true, sashColor: "#464a2e" },
    accessories: {
      buttons: { enabled: true, style: "tortoise", placement: "front_placket", count: 7 },
      belt: { enabled: true, style: "fabric_sash", width: "medium", color: "#464a2e" },
    },
  },
  ref_m_tee: { primaryColor: "#252933", fabric: "jersey", silhouette: { neckline: "round" } },
  ref_m_trousers: { primaryColor: "#8f7e6e", fabric: "wool" },
  ref_m_shirt: {
    primaryColor: "#bdd0e5", fabric: "cotton",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 7 } },
  },
  ref_g_top: { primaryColor: "#cab6c9", fabric: "cotton", silhouette: { neckline: "round", hasPeplum: true } },
  ref_g_skirt: {
    primaryColor: "#ea6d6a", trimColor: "#f7f6f2",
    partColors: { skirt: "#ea6d6a", trim: "#f7f6f2" },
    fabric: "cotton",
    silhouette: { pleats: 14, waistbandColor: "#f7f6f2" },
  },
  ref_g_shirtdress: {
    primaryColor: "#bedcc9", trimColor: "#f8faf8",
    partColors: { bodice: "#bedcc9", sleeve: "#bedcc9", skirt: "#bedcc9", trim: "#f8faf8" },
    fabric: "cotton",
    silhouette: { collarStyle: "peter-pan", contrastCollar: true, neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 5 } },
  },
  ref_b_tee: {
    primaryColor: "#d6d5d2", secondaryColor: "#15253b",
    partColors: { bodice: "#d6d5d2", sleeve: "#15253b", trim: "#15253b" },
    fabric: "jersey",
    silhouette: { neckline: "round", contrastCollar: true },
  },
  ref_b_shorts: { primaryColor: "#cbbba0", fabric: "cotton" },
  ref_b_shirt: {
    primaryColor: "#9ccfc9", fabric: "linen",
    silhouette: { collarStyle: "pointed", neckline: "collar" },
    accessories: { buttons: { enabled: true, style: "pearl", placement: "front_placket", count: 5 } },
  },
};

const TRIM_ROLE_SET = new Set([
  "collar-stand", "collar-band", "cuff", "rib-cuff",
  "waistband", "elastic-band", "sash", "wrap-tie", "belt", "hem-band",
]);

function inferFallbackColor(patternMeta, pieces) {
  const lead = (pieces || []).find((p) => p && p.visible !== false && p.color);
  if (lead && typeof lead.color === "string" && lead.color.startsWith("#")) return lead.color;
  if (patternMeta?.category === "men") return "#334155";
  if (patternMeta?.category === "boys") return "#1d4ed8";
  if (patternMeta?.category === "girls") return "#e11d48";
  return "#1e293b";
}

export function getPatternLookbookStyle(id, patternMeta = null, pieces = []) {
  if (id && PATTERN_LOOKBOOK_STYLES[id]) {
    return PATTERN_LOOKBOOK_STYLES[id];
  }
  const color = inferFallbackColor(patternMeta, pieces);
  return {
    primaryColor: color,
    partColors: { bodice: color, sleeve: color, skirt: color, trousers: color },
    fabric: "cotton",
  };
}

function resolvePieceTargetKey(piece, pieces, style = null) {
  const role = piece?.role || "";
  const txt = `${piece?.key || ""} ${piece?.name?.en || ""}`.toLowerCase();
  if (style?.silhouette?.style === "leotard" && (role === "yoke" || /mesh|side\s*insert|cross[-\s]?back|\bstrap\b|yoke/.test(txt))) {
    return "secondary";
  }
  if (role === "collar") {
    if (style?.silhouette?.contrastCollar || style?.partColors?.trim || style?.silhouette?.outerLayer?.lapelColor) {
      return "trim";
    }
    return style?.partColors?.outer ? "outer" : "bodice";
  }
  if (TRIM_ROLE_SET.has(role)) return "trim";
  if (role === "undercollar" || role === "lapel-facing" || role === "pocket" || role === "flap") {
    return style?.partColors?.outer ? "outer" : "bodice";
  }
  if (role === "sleeve" || role === "sleeve-upper" || role === "sleeve-under" || role === "cap-sleeve" || role === "puff-sleeve" || role === "butterfly-sleeve") {
    return "sleeve";
  }
  if (role.startsWith("skirt-") || role === "tier" || role === "godet" || /skirt|peplum/.test(txt)) {
    return "skirt";
  }
  if (role.startsWith("trouser-") || role.startsWith("brief-") || role === "hip-panel-front" || role === "hip-panel-back" || /trouser|pant|short|brief/.test(txt)) {
    return "trousers";
  }
  if (/vest|jacket|blazer|coat|pinafore|outer|over/.test(txt) && pieces.length > 2) {
    if (/\bvest\b/.test(txt) && style?.partColors?.vest) return "vest";
    return "outer";
  }
  return "bodice";
}

export function applyLookbookPieceColors(pieces = [], id, patternMeta = null) {
  const style = getPatternLookbookStyle(id, patternMeta, pieces);
  const pc = style.partColors || {};
  return (pieces || []).map((piece) => {
    if (!piece) return piece;
    if (piece.customColor) return piece;
    const part = resolvePieceTargetKey(piece, pieces, style);
    const chosenColor = pc[part]
      || (part === "secondary" ? style.secondaryColor || pc.trim || style.primaryColor : null)
      || (part === "outer" ? pc.outer || style.primaryColor : null)
      || (part === "trim" ? style.trimColor || pc.trim || pc.bodice || style.primaryColor : null)
      || style.primaryColor;

    // Distinct sheer skirt material for skirted velvet/lace/scuba leotards,
    // and opaque satin bodice + sleeves beneath tulle overlay skirts (gf01, wf13, etc.)
    const isLeotardSkirt = style.silhouette?.style === "leotard" && part === "skirt";
    const pieceMat = isLeotardSkirt && style.silhouette?.leotard?.skirtSheer
      ? "tulle"
      : (style.fabric === "tulle" && part !== "skirt" && part !== "trim"
        ? "satin"
        : (style.fabric || piece.material || null));

    return {
      ...piece,
      color: chosenColor,
      lookbookColor: true,
      customColor: false,
      ...(pieceMat ? { material: pieceMat } : {}),
    };
  });
}
