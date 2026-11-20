/* ============================================================
   2D-to-3D Pattern Part Classifier, Color Coherency & Silhouette
   Metrics Analyzer — BerryStudio 3D System.

   Pure ES module (zero DOM or Three.js globals) so unit tests can
   verify part isolation, trim routing, color coherency, and dynamic
   garment proportions across every pattern family.
   ============================================================ */

import { inferBodyZone, SLEEVE_ROLES } from "./body-zone.js";

const SLEEVE_EXCLUDE_RE = /sleeveless|بدون\s*أكمام|بلا\s*أكمام|كمر|محكم|كمثر|مكتمل/i;
const NON_SLEEVE_PART_RE = /\b(front|back|bodice|dress|blouse|shirt|t-shirt|tee|top|tunic|vest|jacket|coat|skirt|trouser|pant|shorts|hem\s*band|binding|cuff|placket|facing|collar|yoke|pocket|lining)\b|مقدمة|خلفية|صدرية|فستان|بلوزة|قميص|توب|صديري|فانلة|تنورة|تحبيك|شريط|بطانة|ياقة/i;
const EXPLICIT_SLEEVE_TAIL_RE = /\bsleeve(?:\s+(?:upper|under|front|back|panel|cap|top))?s?\s*$/i;
const AR_SLEEVE_LEAD_RE = /^[\s\-_/]*(?:كم|الكم)(?=$|[\s\-_/])/;

export function isSleevePieceName(name) {
  const s = String(name || "").trim();
  if (!s || SLEEVE_EXCLUDE_RE.test(s)) return false;
  if (/\b(?:hem\s*band|binding|cuff|placket|facing)\b|تحبيك|شريط|أسورة/i.test(s)) return false;
  if (EXPLICIT_SLEEVE_TAIL_RE.test(s) || AR_SLEEVE_LEAD_RE.test(s)) return true;
  if (NON_SLEEVE_PART_RE.test(s)) return false;
  return /\bsleeves?\b/i.test(s) || /(?:^|[\s\-_/])(كم|الكم)(?=$|[\s\-_/])/.test(s);
}

const SKIRT_NAME_RE = /skirt|peplum|flounce|tier|godet|تنور|كشكش/i;
const TROUSERS_NAME_RE = /trouser|بنطل|pant|\bleg\s*(?:panel|front|back|seam)|\bleg\b(?!\s*opening)|\blegging\b|brief|panties|boxer|trunk|short|culotte|palazzo|jean|jogger|سروال|شورت|كيلوت/i;
const CUFF_NAME_RE = /\bcuff\b|أساور|اسورة|إسورة/i;
const COLLAR_NAME_RE = /collar|lapel|neckband|stand|hood|ياقة|قبة|غطاء رأس/i;
const LOWER_TRIM_ROLES = new Set([
  "waistband", "pocket", "gusset", "fly", "elastic-band",
  "belt", "sash", "wrap-tie", "hem-band", "placket-facing", "facing", "lining",
]);
const CONTEXT_TRIM_NAME_RE = /waistband|pocket|gusset|\bfly\b|belt\s*loop|elastic|drawstring|placket|facing|lining|hem\s*band|sash|wrap\s*tie|حزام|كمر|جيب|دكة|سحاب|أستك|مطاط|مرد|بطانة|سجاف/i;
const BRA_NAME_RE = /\bbra\b|bralette|bandeau|bustier|حمالة|براليت/i;
const BRIEF_NAME_RE = /brief|panties|bikini|thong|hipster|كيلوت|سروال داخلي/i;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function getPieceDisplayName(p) {
  if (!p) return "";
  if (typeof p === "string") return p;
  if (p.name && typeof p.name === "object") return p.name.en || p.name.ar || p.key || "";
  if (typeof p.name === "string") return p.name;
  return p.key || "";
}

function getPieceSearchText(p) {
  if (!p) return "";
  if (typeof p === "string") return p;
  const parts = [
    p.key || "",
    p.role || "",
    typeof p.name === "string" ? p.name : ((p.name && (p.name.en || "")) + " " + (p.name && (p.name.ar || ""))),
    typeof p.desc === "string" ? p.desc : ((p.desc && (p.desc.en || "")) + " " + (p.desc && (p.desc.ar || ""))),
  ];
  return parts.join(" ").trim();
}

export function isBackPieceName(nameOrPiece) {
  const txt = typeof nameOrPiece === "string"
    ? nameOrPiece
    : ((nameOrPiece?.name?.en || "") + " " + (nameOrPiece?.name?.ar || "") + " " + (nameOrPiece?.key || "") + " " + (nameOrPiece?.role || ""));
  return /\bback\b|خلفي|خلفية/.test(txt.toLowerCase());
}

function classifyDirectOrTrim(p, category = "women") {
  const name = getPieceDisplayName(p);
  const fullTxt = getPieceSearchText(p);
  const role = p && p.role;
  const isMenOrBoys = category === "men" || category === "boys";

  // 1. Explicit user-set bodyZone always wins (keeping sleeve role distinct inside upper zone)
  if (p && (p.bodyZone === "upper" || p.bodyZone === "lower")) {
    if (p.bodyZone === "lower") {
      if (SKIRT_NAME_RE.test(name)) return "skirt";
      if (isMenOrBoys) return "trousers";
      return (TROUSERS_NAME_RE.test(name) || role === "brief-front" || role === "brief-back") ? "trousers" : "skirt";
    }
    return (role && SLEEVE_ROLES.has(role)) ? "sleeve" : "bodice";
  }

  // 2. Declared sleeve roles & cuffs (authoritative schema roles before name heuristics)
  if (p && SLEEVE_ROLES.has(role)) return "sleeve";
  if (role === "cuff" || role === "rib-cuff" || CUFF_NAME_RE.test(name)) return "trim:sleeve";

  // 3. Role-derived zone from body-zone.js (guarantees bodice-* / front-panel / back-panel stay bodice even if pattern title says "Long-Sleeve" or "Sleeveless")
  const zone = inferBodyZone(p);
  if (zone === "lower") {
    if (SKIRT_NAME_RE.test(name)) return "skirt";
    if (isMenOrBoys) return "trousers";
    return (TROUSERS_NAME_RE.test(name) || role === "brief-front" || role === "brief-back") ? "trousers" : "skirt";
  }
  if (zone === "upper") return "bodice";

  // 4. Context-dependent trims (waistband, pocket, gusset, fly, hem-band, facing, lining)
  if ((role && LOWER_TRIM_ROLES.has(role)) || CONTEXT_TRIM_NAME_RE.test(name) || CONTEXT_TRIM_NAME_RE.test(p?.key || "")) {
    if (/underarm|إبط/i.test(fullTxt)) return "bodice";
    if (/trouser|pant|fly|بنطل|سروال/i.test(fullTxt)) return "trim:trousers";
    if (/skirt|تنور/i.test(fullTxt)) return "trim:skirt";
    if (/sleeve|كم|أكمام/i.test(fullTxt) && !/sleeveless|بدون\s*أكمام|بلا\s*أكمام/i.test(fullTxt)) return "trim:sleeve";
    return "trim:context";
  }

  // 5. Legacy fallback for un-roled pieces: safe sleeve-name classifier
  if (isSleevePieceName(name)) return "sleeve";

  // 6. Explicit lower-body names/roles
  if (TROUSERS_NAME_RE.test(name) || TROUSERS_NAME_RE.test(p?.key || "") || role === "brief-front" || role === "brief-back") {
    return "trousers";
  }
  if (SKIRT_NAME_RE.test(name) || SKIRT_NAME_RE.test(p?.key || "") || role === "peplum-front" || role === "peplum-back") {
    return "skirt";
  }

  return "bodice";
}

/**
 * Classifies a pattern piece into one of View3D's 4 garment groups:
 * `'bodice' | 'sleeve' | 'skirt' | 'trousers'`, routing shared trims
 * (`waistband`, `pocket`, `gusset`, `fly`, `cuff`) to the active host garment
 * instead of blindly defaulting to `'bodice'`.
 */
export function classifyPiecePart(piece, allPieces = [], category = "women") {
  const raw = classifyDirectOrTrim(piece, category);
  if (!raw.startsWith("trim:")) return raw;

  const present = { bodice: false, sleeve: false, skirt: false, trousers: false };
  for (const other of allPieces || []) {
    if (!other || other === piece) continue;
    const r = classifyDirectOrTrim(other, category);
    if (!r.startsWith("trim:")) present[r] = true;
  }

  if (raw === "trim:sleeve") {
    return present.sleeve ? "sleeve" : "bodice";
  }
  if (raw === "trim:trousers") {
    return present.trousers ? "trousers" : (present.skirt ? "skirt" : "bodice");
  }
  if (raw === "trim:skirt") {
    return present.skirt ? "skirt" : (present.trousers ? "trousers" : "bodice");
  }
  // Generic waistband / pocket / gusset: attach to lower garment when no bodice is present,
  // or to trousers/skirt for waistbands when lower garment exists.
  const isWaistbandOrGusset = piece?.role === "waistband" || piece?.role === "gusset" || /waistband|gusset|حزام|كمر/i.test(getPieceDisplayName(piece));
  if (isWaistbandOrGusset) {
    if (present.trousers) return "trousers";
    if (present.skirt) return "skirt";
    if (present.bodice) return "bodice";
  }
  if (!present.bodice) {
    if (present.trousers) return "trousers";
    if (present.skirt) return "skirt";
  }
  if (present.bodice) return "bodice";
  if (present.trousers) return "trousers";
  if (present.skirt) return "skirt";
  return (category === "men" || category === "boys") ? "trousers" : "bodice";
}

/**
 * Resolves per-part `{ front, back }` materials for 3D rendering.
 * Prevents 2D drafting `PALETTE` rainbow colors from turning a single dress or
 * suit into a multi-colored patchwork unless the user explicitly customized
 * piece colors (`piece.customColor === true`).
 */
export function resolvePartsFabric3D(pieces = [], opts = {}) {
  const {
    category = "women",
    defaultColor = 0x4f46e5,
    defaultMaterial = "cotton",
    defaultTexture = null,
    lookbookStyle = null,
    colorToInt = (c) => (typeof c === "number" ? c : defaultColor),
  } = opts;

  const visiblePieces = (pieces || []).filter((p) => p && p.visible !== false);
  const allLookbookCleared = visiblePieces.length > 0 && visiblePieces.every((p) => p.lookbookColor === false && !p.customColor);
  const effectiveLookbookStyle = allLookbookCleared ? null : lookbookStyle;
  const hasLookbook = Boolean(effectiveLookbookStyle || visiblePieces.some((p) => p && p.lookbookColor));
  const buckets = {};

  // Pick unified garment base color from the first primary panel (or explicit defaultColor)
  const primaryLead = visiblePieces.find((p) => p.customColor) || visiblePieces[0];
  const unifiedColor = opts.unifiedColor != null
    ? colorToInt(opts.unifiedColor)
    : (effectiveLookbookStyle && effectiveLookbookStyle.primaryColor && !(primaryLead && primaryLead.customColor)
      ? colorToInt(effectiveLookbookStyle.primaryColor)
      : (primaryLead && primaryLead.color ? colorToInt(primaryLead.color) : colorToInt(defaultColor)));

  for (const p of visiblePieces) {
    const part = classifyPiecePart(p, pieces, category);
    const back = isBackPieceName(p);
    // Prioritize main structural panels ahead of small trims (collar/cuff/waistband/pocket/yoke/binding)
    const isTrim = classifyDirectOrTrim(p, category).startsWith("trim:")
      || p.role === "yoke" || p.role === "other" || p.role === "strap"
      || COLLAR_NAME_RE.test(getPieceDisplayName(p));
    const slotArr = ((buckets[part] ||= { front: [], back: [] })[back ? "back" : "front"]);
    if (isTrim) slotArr.push(p);
    else slotArr.unshift(p);
  }

  const lbPartColors = effectiveLookbookStyle?.partColors || {};
  const parts = {};
  for (const [part, { front, back }] of Object.entries(buckets)) {
    const primary = front[0] || back[0];
    if (!primary) continue;
    let fCol = unifiedColor;
    if (primary.customColor) {
      fCol = colorToInt(primary.color);
    } else if (hasLookbook) {
      if (lbPartColors[part]) fCol = colorToInt(lbPartColors[part]);
      else if (primary.lookbookColor && primary.color) fCol = colorToInt(primary.color);
    }
    const frontDesc = {
      color: fCol,
      material: primary.material || defaultMaterial || "cotton",
      textureDataURL: primary.textureDataURL || defaultTexture || null,
    };
    parts[part] = { front: frontDesc };

    if (back.length) {
      const bp = back[0];
      const bCol = bp.customColor
        ? colorToInt(bp.color)
        : (hasLookbook && bp.lookbookColor && bp.color ? colorToInt(bp.color) : fCol);
      const backDesc = {
        color: bCol,
        material: bp.material || defaultMaterial || "cotton",
        textureDataURL: bp.textureDataURL || defaultTexture || null,
      };
      const sameAsFront = front.length
        && backDesc.color === frontDesc.color
        && backDesc.material === frontDesc.material
        && backDesc.textureDataURL === frontDesc.textureDataURL;
      if (!sameAsFront) parts[part].back = backDesc;
    }
  }

  if (effectiveLookbookStyle?.silhouette?.outerLayer?.enabled) {
    const ol = effectiveLookbookStyle.silhouette.outerLayer;
    parts.outer = {
      front: {
        color: colorToInt(ol.color || lbPartColors.outer || effectiveLookbookStyle.primaryColor || defaultColor),
        material: ol.fabric || effectiveLookbookStyle.fabric || defaultMaterial || "wool",
        textureDataURL: null,
      },
    };
    if (ol.innerColor && parts.bodice && !(visiblePieces.some((p) => p.customColor))) {
      parts.bodice.front.color = colorToInt(ol.innerColor);
      if (ol.style === "pinafore" || ol.style === "vest" || ol.style === "bisht") {
        // Inner shirt under vest/pinafore/bisht stays crisp poplin/jersey when outer is textured
        parts.bodice.front.material = ol.style === "vest" ? "cotton" : (ol.innerNeckline === "high" ? "jersey" : "cotton");
      }
    }
  }

  const trimHex = lbPartColors.trim || effectiveLookbookStyle?.trimColor;
  if (hasLookbook && trimHex) {
    parts.trim = {
      front: {
        color: colorToInt(trimHex),
        material: effectiveLookbookStyle?.fabric || defaultMaterial || "cotton",
        textureDataURL: null,
      },
    };
  }

  return parts;
}

/**
 * Measures a 2D piece outline (in cm), extracting bounding box and top/mid/bottom widths.
 */
export function measureOutlineCm(outline) {
  if (!Array.isArray(outline) || outline.length < 3) {
    return null;
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of outline) {
    if (!pt || pt.length < 2) continue;
    const x = Number(pt[0]), y = Number(pt[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || maxY <= minY) return null;

  const width = maxX - minX;
  const height = maxY - minY;

  function bandSpanX(yLo, yHi) {
    let bMin = Infinity, bMax = -Infinity;
    // Sample both vertices and edge crossings for accuracy on sparse 4-point outlines
    const n = outline.length;
    for (let i = 0; i < n; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % n];
      if (!a || !b) continue;
      const ax = Number(a[0]), ay = Number(a[1]);
      const bx = Number(b[0]), by = Number(b[1]);
      if (ay >= yLo && ay <= yHi) {
        if (ax < bMin) bMin = ax;
        if (ax > bMax) bMax = ax;
      }
      const dy = by - ay;
      if (Math.abs(dy) > 1e-6) {
        for (const yTarget of [yLo, (yLo + yHi) * 0.5, yHi]) {
          const t = (yTarget - ay) / dy;
          if (t >= 0 && t <= 1) {
            const ix = ax + (bx - ax) * t;
            if (ix < bMin) bMin = ix;
            if (ix > bMax) bMax = ix;
          }
        }
      }
    }
    return bMax > bMin ? (bMax - bMin) : width;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    topWidth: bandSpanX(minY, minY + height * 0.22),
    midWidth: bandSpanX(minY + height * 0.40, minY + height * 0.60),
    bottomWidth: bandSpanX(maxY - height * 0.16, maxY),
  };
}

/**
 * Analyzes active 2D pattern pieces (in cm) against body measurements to drive
 * responsive, tailored 3D garment geometry in `View3D.buildGarment()`.
 */
export function computePatternMetrics3D(pieces = [], measurements = {}, category = "women", patternMeta = null, lookbookStyle = null) {
  const m = {
    height: Number(measurements?.height) || (category === "girls" || category === "boys" ? 136 : category === "men" ? 178 : 167),
    chest: Number(measurements?.chest) || 88,
    waist: Number(measurements?.waist) || 70,
    hips: Number(measurements?.hips) || 96,
    backLen: Number(measurements?.backLen) || 41,
    sleeve: Number(measurements?.sleeve) || 58,
    inseam: Number(measurements?.inseam) || 78,
  };

  const lbSil = lookbookStyle?.silhouette || {};
  const visible = (pieces || []).filter((p) => p && p.visible !== false);
  const byPart = { bodice: [], sleeve: [], skirt: [], trousers: [] };
  for (const p of visible) {
    const part = classifyPiecePart(p, pieces, category);
    if (byPart[part]) byPart[part].push(p);
  }

  const allText = [
    patternMeta?.id || "",
    patternMeta?.name?.en || patternMeta?.name || "",
    patternMeta?.desc?.en || patternMeta?.desc || "",
    ...visible.map(getPieceSearchText),
  ].join(" ");

  // ---------- 1. BODICE / TOP / ROBE / OUTERWEAR METRICS ----------
  const hasSeparateSkirt = byPart.skirt.length > 0;
  const hasSeparateTrousers = byPart.trousers.length > 0;
  const isBra = lbSil.style === "bra" || (
    !hasSeparateSkirt && !hasSeparateTrousers && byPart.bodice.some((p) =>
      p.role === "cup" || p.role === "band" || p.role === "strap" || BRA_NAME_RE.test(getPieceDisplayName(p))
    )
  );
  const hasCollar = lbSil.hasCollar != null
    ? Boolean(lbSil.hasCollar)
    : (visible.some((p) => p.role === "collar" || p.role === "collar-stand" || p.role === "undercollar" || COLLAR_NAME_RE.test(getPieceDisplayName(p)))
      || Boolean(lbSil.collarStyle && lbSil.collarStyle !== "none")
      || /\bshirt\b|collar|polo|blazer|lapel|thobe|kandura|sherwani|nehru|قميص|ثوب|كندورة|بليزر|ياقة/i.test(allText));
  const hasCuffs = visible.some((p) => p.role === "cuff" || p.role === "rib-cuff" || CUFF_NAME_RE.test(getPieceDisplayName(p)));
  const isOpenFront = lbSil.isOpenFront != null
    ? Boolean(lbSil.isOpenFront)
    : /cardigan|blazer|\bjacket\b|\bcoat\b|kimono|bolero|abaya|bisht|جاكيت|بليزر|معطف|كارديغان|عباية|بشت/i.test(allText);

  let neckline = lbSil.neckline || "crew";
  if (!lbSil.neckline) {
    if (/strapless|bandeau|bustier|tube\s*top|بدون حمالات/i.test(allText)) neckline = "strapless";
    else if (/sweetheart/i.test(allText)) neckline = "sweetheart";
    else if (/halter/i.test(allText)) neckline = "halter";
    else if (/off[-\s]?shoulder/i.test(allText)) neckline = "off-shoulder";
    else if (/cold[-\s]?shoulder/i.test(allText)) neckline = "cold-shoulder";
    else if (/v-neck|v\s*neck|wrap|surplice|سبعة|ملفوف/i.test(allText)) neckline = "v-neck";
    else if (/boat|bateau|sabrina|قارب/i.test(allText)) neckline = "boat";
    else if (/square|مربعة/i.test(allText)) neckline = "square";
    else if (/scoop|camisole|tank|leotard|مدورة واسعة|ليوتارد/i.test(allText)) neckline = "scoop";
    else if (/turtleneck|mock\s*neck|high\s*neck|thobe|kandura|mandarin|sherwani|nehru|رقبة عالية|ثوب/i.test(allText)) neckline = "high";
    else if (hasCollar) neckline = "collar";
  }

  const bodicePanels = byPart.bodice
    .filter((p) => !COLLAR_NAME_RE.test(getPieceDisplayName(p)) && !CONTEXT_TRIM_NAME_RE.test(getPieceDisplayName(p)))
    .map((p) => ({ piece: p, box: measureOutlineCm(p.outline) }))
    .filter((x) => x.box && x.box.height > 10);

  let bodiceLengthCm = m.backLen + 14;
  let bodiceEaseRatio = 1.04;
  let bodiceHemFlare = 1.0;

  if (bodicePanels.length > 0) {
    bodiceLengthCm = Math.max(...bodicePanels.map((x) => x.box.height));
    const mainB = bodicePanels[0].box;
    const quarterChest = Math.max(12, m.chest / 4);
    const normalizedQuarterW = mainB.midWidth > quarterChest * 1.75 ? mainB.midWidth * 0.5 : mainB.midWidth;
    bodiceEaseRatio = clamp(normalizedQuarterW / quarterChest, 0.96, 1.32);
    bodiceHemFlare = clamp(mainB.bottomWidth / Math.max(8, mainB.topWidth), 0.88, 1.65);
  }

  const isLeotard = lbSil.style === "leotard" || /leotard|bodysuit|swimsuit|مايوه|ليوتارد/i.test(allText);

  const hasPeplum = Boolean(lbSil.hasPeplum || (
    /peplum|بيبلوم/i.test(`${patternMeta?.name?.en || ""} ${patternMeta?.desc?.en || ""} ${visible.map(getPieceDisplayName).join(" ")}`)
    && visible.some((p) => p.role === "peplum-front" || p.role === "peplum-back")
  ));

  let bodiceStyle = "hip";
  if (isBra) bodiceStyle = "bra";
  else if (isLeotard) bodiceStyle = "leotard";
  else if (hasSeparateSkirt && !hasPeplum && lbSil.style !== "hip" && lbSil.style !== "tunic") {
    bodiceStyle = "waist";
    bodiceLengthCm = m.backLen + 2;
    bodiceHemFlare = 1.02;
  } else if (lbSil.style && ["crop", "waist", "hip", "tunic", "robe"].includes(lbSil.style)) {
    bodiceStyle = lbSil.style;
  } else if (bodiceLengthCm < m.backLen * 0.80) bodiceStyle = "crop";
  else if (bodiceLengthCm <= m.backLen * 1.16) bodiceStyle = "waist";
  else if (bodiceLengthCm <= m.backLen + 26) bodiceStyle = "hip";
  else if (bodiceLengthCm <= m.backLen + 48 && !hasSeparateSkirt) bodiceStyle = "tunic";
  else if (!hasSeparateSkirt && !hasSeparateTrousers) bodiceStyle = "robe";

  const collarStyle = lbSil.collarStyle
    || (hasCollar ? (/thobe|kandura|kurta|mandarin|nehru|sherwani|jubba|bomber/i.test(allText) ? "mandarin" : (/sailor/i.test(allText) ? "sailor" : (/peter/i.test(allText) ? "peter-pan" : "pointed"))) : "none");
  const lapelStyle = lbSil.lapelStyle
    || (/tuxedo|shawl/i.test(allText) ? "shawl" : (/blazer|trench|overcoat|peacoat|lapel/i.test(allText) ? "notched" : "none"));
  const hasHood = Boolean(lbSil.hasHood || visible.some((p) => p.role === "hood"));
  const hasCape = Boolean(lbSil.hasCape || visible.some((p) => p.role === "cape" || p.role === "cape-overlay"));

  // ---------- 2. SLEEVE METRICS ----------
  const sleevePanels = byPart.sleeve
    .filter((p) => p.role !== "cuff" && p.role !== "rib-cuff" && !CUFF_NAME_RE.test(getPieceDisplayName(p)))
    .map((p) => ({ piece: p, box: measureOutlineCm(p.outline) }))
    .filter((x) => x.box && x.box.height > 5);

  let sleeveLengthFrac = category === "girls" ? 0.36 : (category === "boys" ? 0.44 : 0.92);
  let sleeveStyle = "fitted";
  let sleeveHemRatio = 0.72;

  if (sleevePanels.length > 0) {
    const sb = sleevePanels[0].box;
    const sp = sleevePanels[0].piece;
    const sText = getPieceSearchText(sp);
    let yBicep = null;
    if (Array.isArray(sp.outline)) {
      const upperCutoff = sb.minY + sb.height * 0.55;
      const cornerYs = sp.outline
        .filter((pt) => pt && pt[1] <= upperCutoff && (Math.abs(pt[0] - sb.minX) < 1.5 || Math.abs(pt[0] - sb.maxX) < 1.5))
        .map((pt) => pt[1]);
      if (cornerYs.length > 0) {
        const avgCornerY = cornerYs.reduce((a, b) => a + b, 0) / cornerYs.length;
        if (avgCornerY > sb.minY + 1.0 && avgCornerY < sb.maxY - 2.0) yBicep = avgCornerY;
      }
    }
    const underarmToHemCm = yBicep != null ? (sb.maxY - yBicep) : (sb.height * 0.86);
    sleeveLengthFrac = clamp(underarmToHemCm / Math.max(24, m.sleeve), 0.18, 1.04);
    sleeveHemRatio = clamp(sb.bottomWidth / Math.max(10, sb.topWidth), 0.50, 1.45);

    if (sp.role === "puff-sleeve" || /puff|منفوش/i.test(sText)) sleeveStyle = "puff";
    else if (sp.role === "cap-sleeve" || /cap\s*sleeve|كاب/i.test(sText) || sleeveLengthFrac < 0.25) sleeveStyle = "cap";
    else if (sp.role === "butterfly-sleeve" || /bishop|bell|flare|kimono|butterfly|cape|واسع|جرس|فراشة/i.test(sText) || sleeveHemRatio > 1.02) {
      sleeveStyle = hasCuffs || /bishop|بأساور/i.test(sText) ? "bishop" : "bell";
    }
  }

  // ---------- 3. SKIRT METRICS ----------
  const skirtPanels = byPart.skirt
    .filter((p) => !CONTEXT_TRIM_NAME_RE.test(getPieceDisplayName(p)))
    .map((p) => ({ piece: p, box: measureOutlineCm(p.outline) }))
    .filter((x) => x.box && x.box.height > 8);

  let skirtLengthCm = m.inseam * 0.68;
  let skirtFlare = 1.55;
  let skirtPleats = 0;

  if (skirtPanels.length > 0) {
    const tierPanels = skirtPanels.filter((x) => x.piece.role === "tier");
    skirtLengthCm = tierPanels.length >= 2
      ? tierPanels.reduce((sum, x) => sum + x.box.height * 0.94, 0)
      : Math.max(...skirtPanels.map((x) => x.box.height));
    const skBox = skirtPanels[0].box;
    const skText = skirtPanels.map((x) => getPieceSearchText(x.piece)).join(" ");
    const rawRatio = skBox.bottomWidth / Math.max(8, skBox.topWidth);
    const isGatheredRect = skBox.topWidth > m.waist * 0.65 || /gather|pleat|circle|flared|tier|مكشكش|كسرات|كلوش/i.test(skText);

    if (/pencil|bodycon|ضيق|بنسل/i.test(skText) || (!isGatheredRect && rawRatio < 1.05)) {
      skirtFlare = 1.02;
    } else if (/straight|مستقيم/i.test(skText) || (!isGatheredRect && rawRatio < 1.18)) {
      skirtFlare = 1.18;
    } else if (isGatheredRect || rawRatio > 1.45) {
      skirtFlare = clamp(Math.max(1.72, rawRatio * 1.18), 1.65, 2.20);
      skirtPleats = /pleat|كسرات/i.test(skText) ? 14 : 8;
    } else {
      skirtFlare = clamp(rawRatio * 1.15, 1.28, 1.75);
      skirtPleats = 4;
    }
  } else if (bodiceStyle === "robe") {
    skirtPleats = /abaya|thobe|kaftan|kandura|bisht|عباية|ثوب|قفطان|بشت/i.test(allText) ? 6 : 0;
  }
  if (lbSil.pleats != null) skirtPleats = lbSil.pleats;

  // ---------- 4. TROUSER / SHORTS / BRIEFS METRICS ----------
  const isBrief = byPart.trousers.some((p) => p.role === "brief-front" || p.role === "brief-back" || BRIEF_NAME_RE.test(getPieceSearchText(p)));
  const trouserPanels = byPart.trousers
    .filter((p) => !CONTEXT_TRIM_NAME_RE.test(getPieceDisplayName(p)))
    .map((p) => ({ piece: p, box: measureOutlineCm(p.outline) }))
    .filter((x) => x.box && x.box.height > 8);

  let trouserInseamFrac = isBrief ? 0.04 : 0.95;
  let trouserHemMult = 0.96; // 0.76 = skinny/legging, 0.96 = straight/chino, 1.35 = palazzo/wide

  if (!isBrief && trouserPanels.length > 0) {
    const maxLegH = Math.max(...trouserPanels.map((x) => x.box.height));
    const tb = trouserPanels[0].box;
    const tText = trouserPanels.map((x) => getPieceSearchText(x.piece)).join(" ");
    const riseCm = Math.max(15, m.hips * 0.20);
    const estInseam = Math.max(2, maxLegH - riseCm);
    trouserInseamFrac = clamp(estInseam / Math.max(30, m.inseam), 0.14, 1.0);

    if (/trunk|boxer|short|شورت|بوكسر/i.test(tText) && trouserInseamFrac > 0.42 && maxLegH < m.inseam * 0.72) {
      trouserInseamFrac = 0.28;
    }

    const taperRatio = tb.bottomWidth / Math.max(10, tb.topWidth);
    if (/palazzo|wide|culotte|flare|واسع|شارلستون/i.test(tText) || taperRatio > 1.05) {
      trouserHemMult = 1.34;
    } else if (/skinny|legging|slim|jogger|ضيق|ليجنز/i.test(tText) || taperRatio < 0.68) {
      trouserHemMult = 0.78;
    } else {
      trouserHemMult = clamp(0.75 + taperRatio * 0.28, 0.84, 1.12);
    }
  }

  return {
    present: {
      bodice: byPart.bodice.length > 0,
      sleeve: byPart.sleeve.length > 0,
      skirt: byPart.skirt.length > 0,
      trousers: byPart.trousers.length > 0,
    },
    bodice: {
      style: bodiceStyle, // 'bra' | 'crop' | 'waist' | 'hip' | 'tunic' | 'robe' | 'leotard'
      lengthCm: bodiceLengthCm,
      easeRatio: bodiceEaseRatio,
      hemFlare: bodiceHemFlare,
      neckline,
      backStyle: lbSil.backStyle || "full",
      hasCollar,
      collarStyle,
      lapelStyle,
      contrastCollar: Boolean(lbSil.contrastCollar),
      isOpenFront,
      hasHood,
      furTrim: Boolean(lbSil.furTrim),
      hasCape,
      hasPeplum,
      hasSash: Boolean(lbSil.sash),
      sashColor: lbSil.sashColor || lookbookStyle?.trimColor || null,
      outerLayer: lbSil.outerLayer || null,
      leotard: bodiceStyle === "leotard"
        ? (lbSil.leotard || {
            neckline,
            backStyle: /racer/i.test(allText) ? "racerback" : (/cross/i.test(allText) ? "crossback" : "full"),
            legHeight: "classic",
            skirt: hasSeparateSkirt,
            skirtSheer: true,
            colorBlock: "none",
          })
        : null,
      bra: bodiceStyle === "bra"
        ? (lbSil.bra || {
            style: /sport/i.test(allText) ? "sport" : (/bandeau|strapless/i.test(allText) ? "bandeau" : "soft-cup"),
            cupDepthF: 1.0,
            longline: /longline/i.test(allText),
            strapStyle: /racer/i.test(allText) ? "racerback" : (/bandeau|strapless/i.test(allText) ? "none" : "standard"),
            wideStrap: /wide/i.test(allText),
            bow: false,
          })
        : null,
    },
    sleeve: {
      lengthFrac: sleeveLengthFrac,
      style: sleeveStyle, // 'cap' | 'fitted' | 'puff' | 'bell' | 'bishop'
      hemRatio: sleeveHemRatio,
      hasCuffs,
      contrastCuffs: Boolean(lbSil.contrastCuffs),
      cuffColor: lbSil.cuffColor || lookbookStyle?.trimColor || null,
      isCapeSleeve: Boolean(hasCape || (visible.some((p) => p.role === "butterfly-sleeve") && /cape/i.test(allText))),
      isOffShoulder: neckline === "off-shoulder",
      isColdShoulder: neckline === "cold-shoulder",
    },
    skirt: {
      lengthCm: skirtLengthCm,
      flare: skirtFlare,
      pleats: skirtPleats,
      tiers: lbSil.tiers || (visible.filter((p) => p.role === "tier").length),
      isSheerOverlay: Boolean(lbSil.isSheerOverlay),
      isBallerinaTutu: Boolean(lbSil.isBallerinaTutu),
      waistbandColor: lbSil.waistbandColor || null,
    },
    trousers: {
      isBrief,
      inseamFrac: trouserInseamFrac, // 0.04 brief, ~0.25 shorts, ~0.48 bermuda, ~0.72 capri, ~0.96 full
      hemMult: trouserHemMult,
      hasWaistband: visible.some((p) => p.role === "waistband" || /waistband|حزام|كمر/i.test(getPieceDisplayName(p))),
      briefRise: lbSil.briefRise || (/high/i.test(allText) ? "high" : (/low/i.test(allText) ? "low" : "mid")),
      briefCut: lbSil.briefCut || (/boxer/i.test(allText) ? "boxer" : (/trunk/i.test(allText) ? "trunk" : (/boyshort/i.test(allText) ? "boyshort" : (/bikini/i.test(allText) ? "bikini" : (/hipster/i.test(allText) ? "hipster" : "full"))))),
      briefLegDropFrac: lbSil.briefLegDropFrac ?? (/boxer/i.test(allText) ? 0.25 : (/trunk/i.test(allText) ? 0.16 : (/boyshort/i.test(allText) ? 0.14 : 0.04))),
      waistbandColor: lbSil.waistbandColor || null,
      contrastStitch: lbSil.contrastStitch || null,
    },
  };
}
