/* ============================================================
   Shared 3D Sewing Stitches Configuration & Color Resolution
   Pure ES module (zero DOM or Three.js globals) shared across
   3D Preview (js/three-view.js), Studio UI (js/app.js), and
   Cloth Lab (cloth-lab/src/).
   ============================================================ */

export const STITCH_PARTS = [
  { id: "bodice", label: { en: "Bodice / Top", ar: "الصدرية / التوب" } },
  { id: "sleeve", label: { en: "Sleeves", ar: "الأكمام" } },
  { id: "skirt", label: { en: "Skirt", ar: "التنورة" } },
  { id: "trousers", label: { en: "Trousers / Brief", ar: "البنطلون / الشورت" } },
  { id: "outer", label: { en: "Outer Layer", ar: "الطبقة الخارجية" } },
  { id: "trim", label: { en: "Collar, Cuffs & Waistband", ar: "الياقة والأساور والكمر" } },
];

export const STITCH_PART_INDEX = {
  bodice: 0,
  sleeve: 1,
  skirt: 2,
  trousers: 3,
  outer: 4,
  trim: 5,
};

export const STITCH_STYLES = {
  lockstitch: {
    id: "lockstitch",
    label: { en: "Single Topstitch", ar: "غرزة مفردة" },
    dashMm: 3.4,
    gapMm: 1.5,
    widthMm: 0.72,
    insetMm: 3.0,
    rows: 1,
    amplitudeMm: 0.0,
    liftMm: 1.25,
  },
  twin: {
    id: "twin",
    label: { en: "Twin-Needle", ar: "غرزة مزدوجة" },
    dashMm: 3.2,
    gapMm: 1.4,
    widthMm: 0.68,
    insetMm: 2.2,
    rowSpacingMm: 3.2,
    rows: 2,
    amplitudeMm: 0.0,
    liftMm: 1.25,
  },
  zigzag: {
    id: "zigzag",
    label: { en: "Zigzag / Overlock", ar: "زجزاج / أوفر" },
    dashMm: 2.8,
    gapMm: 0.8,
    widthMm: 0.70,
    insetMm: 3.6,
    rows: 1,
    amplitudeMm: 2.6,
    liftMm: 1.25,
  },
  saddle: {
    id: "saddle",
    label: { en: "Bold Saddle", ar: "سراجة بارزة" },
    dashMm: 5.5,
    gapMm: 2.4,
    widthMm: 1.05,
    insetMm: 4.0,
    rows: 1,
    amplitudeMm: 0.0,
    liftMm: 1.55,
  },
};

export const THREAD_COLOR_PRESETS = [
  { hex: "#d99b38", label: { en: "Denim Gold", ar: "ذهبي جينز" } },
  { hex: "#f5f1e6", label: { en: "Ivory", ar: "عاجي" } },
  { hex: "#ffffff", label: { en: "Pure White", ar: "أبيض ناصع" } },
  { hex: "#27292e", label: { en: "Charcoal", ar: "فحمي" } },
  { hex: "#111215", label: { en: "Jet Black", ar: "أسود داكن" } },
  { hex: "#b8bec8", label: { en: "Silver", ar: "فضي" } },
  { hex: "#7a1c2e", label: { en: "Burgundy", ar: "عنابي" } },
  { hex: "#1d3557", label: { en: "Navy", ar: "كحلي" } },
  { hex: "#b86b3a", label: { en: "Copper", ar: "نحاسي" } },
  { hex: "#1b6b4c", label: { en: "Emerald", ar: "زمردي" } },
  { hex: "#d47488", label: { en: "Rose", ar: "وردي" } },
];

const HEX_RE = /^#([0-9a-f]{6})$/i;

export function normalizeThreadHex(val, fallback = null) {
  if (typeof val === "number" && Number.isFinite(val)) {
    return "#" + (val & 0xffffff).toString(16).padStart(6, "0");
  }
  if (typeof val !== "string") return fallback;
  const s = val.trim();
  const m3 = /^#([0-9a-f]{3})$/i.exec(s);
  if (m3) {
    const [, h] = m3;
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  const m6 = HEX_RE.exec(s);
  return m6 ? `#${m6[1].toLowerCase()}` : fallback;
}

export function createDefaultStitchConfig(overrides = {}) {
  const parts = {};
  for (const part of STITCH_PARTS) {
    parts[part.id] = { enabled: true, color: null };
  }
  const base = {
    enabled: false,
    style: "lockstitch",
    visibility: "external",
    defaultColor: "#d99b38",
    autoContrast: false,
    parts,
    pieceColors: {},
  };
  return normalizeStitchConfig({ ...base, ...overrides });
}

export function normalizeStitchConfig(raw) {
  const parts = {};
  const rawParts = raw && typeof raw.parts === "object" ? raw.parts : {};
  for (const part of STITCH_PARTS) {
    const rp = rawParts[part.id];
    parts[part.id] = {
      enabled: rp && typeof rp.enabled === "boolean" ? rp.enabled : true,
      color: normalizeThreadHex(rp?.color, null),
    };
  }

  const pieceColors = {};
  if (raw && raw.pieceColors && typeof raw.pieceColors === "object") {
    for (const [k, v] of Object.entries(raw.pieceColors)) {
      if (!k) continue;
      const hx = normalizeThreadHex(v, null);
      if (hx) pieceColors[k] = hx;
    }
  }

  const style = raw && STITCH_STYLES[raw.style] ? raw.style : "lockstitch";
  const visibility = raw?.visibility === "all" ? "all" : "external";
  const defaultColor = normalizeThreadHex(raw?.defaultColor, "#d99b38") || "#d99b38";

  return {
    enabled: Boolean(raw?.enabled),
    style,
    visibility,
    defaultColor,
    autoContrast: Boolean(raw?.autoContrast),
    parts,
    pieceColors,
  };
}

export function computeAutoContrastThreadHex(baseFabricHex) {
  const hex = normalizeThreadHex(baseFabricHex, "#6d5efc");
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma < 0.22) return "#e2b259"; // rich warm gold thread on very dark fabrics
  if (luma < 0.42) return "#f5efe2"; // bright ivory contrast on medium-dark fabrics
  if (luma < 0.70) return "#f8f5ec"; // crisp warm cream on mid-tones
  return "#343238"; // deep charcoal thread on pale/white fabrics
}

export function resolveStitchThreadColor({
  partKey = "bodice",
  pieceId = null,
  baseFabricHex = null,
  stitchConfig = null,
  lookbookContrastHex = null,
} = {}) {
  const cfg = normalizeStitchConfig(stitchConfig);
  if (pieceId && cfg.pieceColors[pieceId]) {
    return cfg.pieceColors[pieceId];
  }
  const partColor = cfg.parts[partKey]?.color;
  if (partColor) {
    return partColor;
  }
  const lbHex = normalizeThreadHex(lookbookContrastHex, null);
  if (lbHex && cfg.defaultColor === "#d99b38" && !cfg.autoContrast) {
    return lbHex;
  }
  if (cfg.autoContrast && baseFabricHex != null) {
    return computeAutoContrastThreadHex(baseFabricHex);
  }
  return cfg.defaultColor || "#d99b38";
}

const VISIBLE_TRIM_RE = /\b(placket|lapel|collar|cuff|waistband|belt|sash|pocket)\b|مرد|طية|ياقة|أسورة|كمر|حزام|جيب/i;
const INTERIOR_HIDDEN_RE = /\b(lining|undercollar|interfacing|gusset[-\s]*lining|inner[-\s]*lining|backing)\b|بطانة|فازلين|سجاف/i;

export function isExternalStitchPiece(piece) {
  if (!piece) return true;
  if (piece.visible === false) return false;
  const role = String(piece.role || "").toLowerCase();
  if (role === "lining" || role === "interfacing" || role === "undercollar" || role === "gusset-lining" || role === "underlining") {
    return false;
  }
  if (role === "facing" || role === "placket-facing" || role === "lapel-facing") {
    if (role === "placket-facing" || role === "lapel-facing") return true;
    const labelStr = typeof piece.label === "string"
      ? piece.label
      : `${piece.label?.en || ""} ${piece.label?.ar || ""} ${piece.name?.en || ""} ${piece.name?.ar || ""} ${piece.id || piece.key || ""}`;
    return VISIBLE_TRIM_RE.test(labelStr);
  }
  const txt = typeof piece.label === "string"
    ? piece.label
    : `${piece.label?.en || ""} ${piece.label?.ar || ""} ${piece.name?.en || ""} ${piece.name?.ar || ""} ${piece.id || piece.key || ""}`;
  if (INTERIOR_HIDDEN_RE.test(txt) && !VISIBLE_TRIM_RE.test(txt)) {
    return false;
  }
  return true;
}

export function mapClothPieceToStitchPart(piece) {
  if (!piece) return "bodice";
  const role = String(piece.role || "").toLowerCase();
  const txt = `${role} ${piece.id || piece.key || ""} ${piece.label?.en || piece.name?.en || ""} ${piece.label?.ar || piece.name?.ar || ""}`.toLowerCase();

  if (
    role.includes("outer") || role.includes("blazer") || role.includes("coat") ||
    role.includes("cape") || role.includes("vest") || role.includes("abaya") || role.includes("bisht") ||
    /\b(outer|blazer|jacket|coat|cape|vest|pinafore|abaya|bisht|trench)\b|معطف|بليزر|جاكيت|عباية|بشت|كاب/.test(txt)
  ) {
    return "outer";
  }
  if (
    role === "collar" || role === "collar-stand" || role === "collar-band" || role === "undercollar" ||
    role === "cuff" || role === "rib-cuff" || role === "waistband" || role === "elastic-band" ||
    role === "belt" || role === "sash" || role === "wrap-tie" || role === "pocket" || role === "placket-facing" ||
    role === "lapel-facing" || role === "hood" || role === "yoke" ||
    /\b(collar|cuff|waistband|elastic|belt|sash|pocket|placket|hood|binding|trim)\b|ياقة|أسورة|أساور|كمر|أستك|حزام|جيب|مرد|قلنسوة/.test(txt)
  ) {
    return "trim";
  }
  if (
    role.includes("sleeve") ||
    (/\bsleeves?\b/.test(txt) && !/sleeveless/.test(txt)) ||
    /(?:^|[\s\-_/])(?:كم|الكم|أكمام)(?=$|[\s\-_/])/.test(txt)
  ) {
    return "sleeve";
  }
  if (
    role.includes("skirt") || role.includes("peplum") || role === "tier" || role === "godet" ||
    /\b(skirt|peplum|flounce|godet|tutu|tier)\b|تنورة|كشكش|بيبلوم/.test(txt)
  ) {
    return "skirt";
  }
  if (
    role.includes("trouser") || role.includes("pant") || role.includes("brief") || role.includes("shorts") ||
    role.includes("legging") || role.includes("boxer") || role.includes("trunk") ||
    /\b(trouser|pant|brief|shorts|legging|boxer|trunk|culotte|palazzo|jogger)\b|بنطل|سروال|شورت|كيلوت|ليجنز|بوكسر/.test(txt)
  ) {
    return "trousers";
  }
  if (piece.bodyZone === "lower") {
    return "trousers";
  }
  return "bodice";
}
