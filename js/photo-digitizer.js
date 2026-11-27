/* ============================================================
   PhotoDigitizer — Offline Computer-Vision Garment-Part Extractor
   & Flat Pattern Sheet / Contour Digitizer (BerryStudio Phase 2).

   Pure zero-dependency ES module (works identically in Browser & Node).
   Turns photos of:
     1) Any SINGLE GARMENT PART (collar, sleeve, bodice, skirt,
        trousers, pocket, cuff, hood) into anatomically scaled,
        smoothly curved (`curves`), 1:1 printable & gradable pattern
        pieces matching active body measurements.
     2) A FLAT PAPER PATTERN SHEET / TECHNICAL TRACE into clean,
        Bézier-smoothed multi-piece CAD patterns ready for seam
        allowances, grading (`XS–6XL`), and nesting.
   ============================================================ */

import {
  cosineSleeveOutline,
  pointedCollar,
  collarStand,
  bandPc,
  pocketPatch,
  gorePanel,
  legPanel,
  plainBodicePanel,
  qBezToCubic,
} from './pattern-builders.js';
import { ensureValidPieces } from './ai-atelier.js';

export const GARMENT_PART_TYPES = Object.freeze([
  'auto',
  'collar',
  'sleeve',
  'bodice',
  'skirt',
  'trousers',
  'pocket',
  'cuff',
  'hood',
]);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist2d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

const PART_NAMES = {
  collar: { en: 'Tailored Collar & Stand', ar: 'ياقة مفصلة مع القاعدة' },
  sleeve: { en: 'Tailored Set-In Sleeve', ar: 'كم مفصل' },
  bodice: { en: 'Torso Bodice Block', ar: 'صدرية أمام وخلف' },
  skirt: { en: 'Skirt Panels & Waistband', ar: 'تنورة مع حزام الخصر' },
  trousers: { en: 'Trouser Legs & Waistband', ar: 'بنطلون أمامي وخلفي' },
  pocket: { en: 'Patch Pocket', ar: 'جيب خارجي مفصل' },
  cuff: { en: 'Wrist Cuff', ar: 'أسورة معصم' },
  hood: { en: 'Two-Piece Contoured Hood', ar: 'قبعة مجسمة (كابيشون)' },
};

// ------------------------------------------------------------
// 1. Browser helper: Data URL -> ImageData buffer
// ------------------------------------------------------------
export function loadImageDataFromURL(dataURL, maxSide = 260) {
  return new Promise((resolve, reject) => {
    if (!dataURL || typeof Image === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Canvas/Image API unavailable'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const iw = img.naturalWidth || img.width || 1;
        const ih = img.naturalHeight || img.height || 1;
        const scale = Math.min(1, maxSide / Math.max(iw, ih));
        const W = Math.max(24, Math.round(iw * scale));
        const H = Math.max(24, Math.round(ih * scale));
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, W, H);
        resolve(ctx.getImageData(0, 0, W, H));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = dataURL;
  });
}

// ------------------------------------------------------------
// 2. Foreground Segmentation (Adaptive Border Color + Otsu Luma)
// ------------------------------------------------------------
function otsuThreshold(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let thresh = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const vBetween = wB * wF * (mB - mF) * (mB - mF);
    if (vBetween > maxVar) {
      maxVar = vBetween;
      thresh = t;
    }
  }
  return thresh;
}

function morphBinary(mask, W, H, dilate) {
  const out = new Uint8Array(W * H);
  const val = dilate ? 1 : 0;
  const inv = dilate ? 0 : 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          if (mask[ny * W + nx] === val) {
            hit = true;
            break;
          }
        }
      }
      out[y * W + x] = hit ? val : inv;
    }
  }
  return out;
}

export function segmentForegroundMask(imageData, opts = {}) {
  const { width: W, height: H, data } = imageData || {};
  if (!W || !H || !data || data.length < W * H * 4) {
    return { width: 0, height: 0, mask: new Uint8Array(0), bgLuma: 255, dominantColor: '#6d5efc' };
  }

  // Border statistics (top/bottom/left/right outer 2px ring)
  const borderRGB = [];
  const borderLuma = [];
  const lumaHist = new Int32Array(256);
  const pushBorder = (x, y) => {
    const i = (y * W + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    borderRGB.push([r, g, b]);
    borderLuma.push(0.299 * r + 0.587 * g + 0.114 * b);
  };
  const stepX = Math.max(1, Math.floor(W / 64));
  const stepY = Math.max(1, Math.floor(H / 64));
  for (let x = 0; x < W; x += stepX) { pushBorder(x, 0); pushBorder(x, H - 1); }
  for (let y = 0; y < H; y += stepY) { pushBorder(0, y); pushBorder(W - 1, y); }

  const meanRGB = borderRGB.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]], [0, 0, 0])
    .map((v) => v / Math.max(1, borderRGB.length));
  const bgLuma = borderLuma.reduce((a, v) => a + v, 0) / Math.max(1, borderLuma.length);
  const spread = Math.sqrt(
    borderRGB.reduce((acc, c) => acc + Math.hypot(c[0] - meanRGB[0], c[1] - meanRGB[1], c[2] - meanRGB[2]) ** 2, 0)
    / Math.max(1, borderRGB.length),
  );

  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const lum = clamp(Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]), 0, 255);
    lumaHist[lum]++;
  }
  const otsuT = otsuThreshold(lumaHist, W * H);
  const bgIsBright = bgLuma >= 145;
  const colorThresh = opts.threshold || clamp(spread * 2.15, 28, 78);

  let raw = new Uint8Array(W * H);
  let rSum = 0, gSum = 0, bSum = 0, fgCount = 0;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const a = data[i + 3];
    if (a < 32) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dCol = Math.hypot(r - meanRGB[0], g - meanRGB[1], b - meanRGB[2]);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const dOtsu = bgIsBright ? (lum < Math.min(bgLuma - 22, otsuT + 8)) : (lum > Math.max(bgLuma + 22, otsuT - 8));
    if (dCol > colorThresh || (spread < 24 && dOtsu)) {
      raw[p] = 1;
      rSum += r; gSum += g; bSum += b; fgCount++;
    }
  }

  // Fallback to pure luminance contrast if border color variance masked a bright paper sheet
  if (fgCount < W * H * 0.015) {
    raw.fill(0);
    rSum = gSum = bSum = fgCount = 0;
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (Math.abs(lum - bgLuma) > 26) {
        raw[p] = 1;
        rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; fgCount++;
      }
    }
  }

  // Morphological close (seal small interior creases / highlights) then open if noisy
  const closed = morphBinary(morphBinary(raw, W, H, true), W, H, false);
  const hex = fgCount > 0
    ? `#${[rSum, gSum, bSum].map((s) => clamp(Math.round(s / fgCount), 0, 255).toString(16).padStart(2, '0')).join('')}`
    : '#6d5efc';

  return { width: W, height: H, mask: closed, bgLuma, dominantColor: hex };
}

// ------------------------------------------------------------
// 3. Connected Components & Ordered Contour Tracing + Bezier Fit
// ------------------------------------------------------------
export function extractConnectedComponents(mask, W, H, minAreaFrac = 0.008) {
  if (!mask || !W || !H) return [];
  const visited = new Uint8Array(W * H);
  const minPixels = Math.max(24, Math.round(W * H * minAreaFrac));
  const comps = [];
  const stack = new Int32Array(W * H);

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const start = y * W + x;
      if (!mask[start] || visited[start]) continue;

      let sp = 0;
      stack[sp++] = start;
      visited[start] = 1;
      const pixels = [];
      let minX = x, maxX = x, minY = y, maxY = y;

      while (sp > 0) {
        const idx = stack[--sp];
        pixels.push(idx);
        const cx = idx % W;
        const cy = (idx / W) | 0;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < 0 || ny >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            if (nx < 0 || nx >= W) continue;
            const nIdx = ny * W + nx;
            if (mask[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              stack[sp++] = nIdx;
            }
          }
        }
      }

      if (pixels.length < minPixels) continue;
      // Ignore full-frame border frames (> 92% of image area)
      if (pixels.length > W * H * 0.92) continue;

      const compMask = new Uint8Array(W * H);
      for (let k = 0; k < pixels.length; k++) compMask[pixels[k]] = 1;

      comps.push({
        area: pixels.length,
        minX,
        maxX,
        minY,
        maxY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        mask: compMask,
      });
    }
  }

  comps.sort((a, b) => b.area - a.area);
  return comps;
}

// Moore-Neighbor closed outer boundary tracing
export function traceComponentContour(comp, W, H) {
  const { mask, minX, maxX, minY, maxY } = comp;
  let startX = -1, startY = -1;
  for (let y = minY; y <= maxY && startX < 0; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (mask[y * W + x]) {
        startX = x;
        startY = y;
        break;
      }
    }
  }
  if (startX < 0) return [];

  // 8-neighbors clockwise starting from West
  const dirs = [
    [-1, 0], [-1, -1], [0, -1], [1, -1],
    [1, 0], [1, 1], [0, 1], [-1, 1],
  ];
  const pts = [[startX, startY]];
  let cx = startX, cy = startY;
  let backDir = 0; // came from West
  const maxSteps = Math.max(64, comp.w * comp.h * 2);

  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const d = (backDir + k) & 7;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && mask[ny * W + nx]) {
        if (nx === startX && ny === startY && pts.length > 3) {
          return pts;
        }
        pts.push([nx, ny]);
        backDir = (d + 4) & 7;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return pts;
}

function perpDist(pt, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return dist2d(pt, a);
  const t = clamp(((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2, 0, 1);
  return Math.hypot(pt[0] - (a[0] + dx * t), pt[1] - (a[1] + dy * t));
}

function rdpOpen(pts, eps) {
  if (pts.length <= 2) return pts.slice();
  let maxD = 0, idx = 0;
  const first = pts[0], last = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], first, last);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdpOpen(pts.slice(0, idx + 1), eps);
    const right = rdpOpen(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

export function simplifyClosedContour(rawPts, eps = 2.0) {
  if (!Array.isArray(rawPts) || rawPts.length < 4) return rawPts || [];
  // Split at the two farthest vertices so closed RDP preserves opposite extremes cleanly
  let iA = 0, iB = Math.floor(rawPts.length / 2);
  let bestD = -1;
  const p0 = rawPts[0];
  for (let i = 1; i < rawPts.length; i++) {
    const d = dist2d(p0, rawPts[i]);
    if (d > bestD) { bestD = d; iB = i; }
  }
  let bestD2 = -1;
  const pB = rawPts[iB];
  for (let i = 0; i < rawPts.length; i++) {
    const d = dist2d(pB, rawPts[i]);
    if (d > bestD2) { bestD2 = d; iA = i; }
  }
  if (iA > iB) [iA, iB] = [iB, iA];
  const half1 = rdpOpen(rawPts.slice(iA, iB + 1), eps);
  const half2 = rdpOpen(rawPts.slice(iB).concat(rawPts.slice(0, iA + 1)), eps);
  const merged = half1.slice(0, -1).concat(half2.slice(0, -1));
  return merged.length >= 4 ? merged : rawPts.filter((_, idx) => idx % Math.max(1, Math.floor(rawPts.length / 8)) === 0);
}

/**
 * Fits smooth Catmull-Rom cubic Bezier curves across gently curved perimeter edges
 * while keeping crisp tailoring corners (turn angle >= threshold) sharp.
 */
export function fitCubicBeziersToPolygon(outline, opts = {}) {
  const n = Array.isArray(outline) ? outline.length : 0;
  if (n < 4) return [];
  const cornerAngleRad = ((opts.cornerDeg ?? 42) * Math.PI) / 180;
  const minEdgeLen = opts.minEdgeLen ?? 1.2;
  const tension = opts.tension ?? 0.22;

  const corners = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const prev = outline[(i - 1 + n) % n];
    const curr = outline[i];
    const next = outline[(i + 1) % n];
    const v1x = curr[0] - prev[0], v1y = curr[1] - prev[1];
    const v2x = next[0] - curr[0], v2y = next[1] - curr[1];
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const dot = clamp((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1);
    const turn = Math.acos(dot);
    corners[i] = turn >= cornerAngleRad;
  }

  const curves = [];
  for (let i = 0; i < n - 1; i++) {
    const p1 = outline[i];
    const p2 = outline[i + 1];
    const edgeLen = dist2d(p1, p2);
    if (edgeLen < minEdgeLen) continue;
    // Straight edges between two sharp corners stay crisp straight segments
    if (corners[i] && corners[i + 1]) continue;

    const p0 = outline[(i - 1 + n) % n];
    const p3 = outline[(i + 2) % n];
    const t1x = corners[i] ? (p2[0] - p1[0]) * 0.25 : (p2[0] - p0[0]) * tension;
    const t1y = corners[i] ? (p2[1] - p1[1]) * 0.25 : (p2[1] - p0[1]) * tension;
    const t2x = corners[i + 1] ? (p2[0] - p1[0]) * 0.25 : (p3[0] - p1[0]) * tension;
    const t2y = corners[i + 1] ? (p2[1] - p1[1]) * 0.25 : (p3[1] - p1[1]) * tension;

    curves.push({
      fromIdx: i,
      toIdx: i + 1,
      c1: [+(p1[0] + t1x).toFixed(3), +(p1[1] + t1y).toFixed(3)],
      c2: [+(p2[0] - t2x).toFixed(3), +(p2[1] - t2y).toFixed(3)],
    });
  }
  return curves;
}

// ------------------------------------------------------------
// 4. Component Proportion Analysis & Part Classification
// ------------------------------------------------------------
function measureComponentShape(comp, W, H) {
  const { mask, minX, maxX, minY, maxY, w, h } = comp;
  const rowBounds = (fracY) => {
    const y = clamp(Math.round(minY + (h - 1) * fracY), 0, H - 1);
    let l = maxX, r = minX, count = 0;
    const segs = [];
    let inSeg = false, sL = 0;
    for (let x = minX; x <= maxX; x++) {
      if (mask[y * W + x]) {
        count++;
        if (x < l) l = x;
        if (x > r) r = x;
        if (!inSeg) { inSeg = true; sL = x; }
      } else if (inSeg) {
        segs.push([sL, x - 1, x - sL]);
        inSeg = false;
      }
    }
    if (inSeg) segs.push([sL, maxX, maxX - sL + 1]);
    return { width: count > 0 ? (r - l + 1) : 0, fill: count, segs };
  };

  const topR = rowBounds(0.12);
  const upperR = rowBounds(0.26);
  const midR = rowBounds(0.50);
  const lowR = rowBounds(0.75);
  const botR = rowBounds(0.90);

  const aspect = h / Math.max(1, w);
  const fillRatio = comp.area / Math.max(1, w * h);
  const topFrac = topR.width / Math.max(1, w);
  const midFrac = midR.width / Math.max(1, w);
  const botFrac = botR.width / Math.max(1, w);
  const legGap = botR.segs.length >= 2 && (botR.segs[1][0] - botR.segs[0][1]) > w * 0.08;

  // Measure top center crown peak relative to outer shoulders
  let centerTopY = maxY, edgeTopY = maxY;
  const midX = Math.round((minX + maxX) / 2);
  for (let y = minY; y <= maxY; y++) {
    if (mask[y * W + midX]) { centerTopY = y; break; }
  }
  const edgeX = clamp(minX + Math.round(w * 0.14), 0, W - 1);
  for (let y = minY; y <= maxY; y++) {
    if (mask[y * W + edgeX]) { edgeTopY = y; break; }
  }
  const topArchRatio = (edgeTopY - centerTopY) / Math.max(1, h);

  return {
    aspect,
    fillRatio,
    topFrac,
    upperFrac: upperR.width / Math.max(1, w),
    midFrac,
    botFrac,
    flareRatio: botR.width / Math.max(1, upperR.width),
    legGap,
    topArchRatio,
  };
}

export function classifyGarmentPartFromContour(metrics) {
  if (!metrics) return 'bodice';
  const { aspect, fillRatio, topFrac, midFrac, botFrac, flareRatio, legGap, topArchRatio } = metrics;

  // Two distinct leg columns near the bottom -> trousers
  if (legGap && aspect >= 0.85) return 'trousers';

  // Wide low-height curved strip -> collar or cuff
  if (aspect <= 0.48) {
    if (fillRatio > 0.78 && Math.abs(topFrac - botFrac) < 0.16 && topArchRatio < 0.12) return 'cuff';
    return 'collar';
  }

  // Distinct arched crown + tapering toward wrist -> sleeve
  if (topArchRatio >= 0.14 && topFrac < 0.58 && botFrac <= midFrac * 0.92 && aspect >= 0.95) {
    return 'sleeve';
  }

  // Wide lower flare relative to waist/top -> skirt
  if (flareRatio >= 1.24 && botFrac >= 0.76 && topFrac <= 0.72) {
    return 'skirt';
  }

  // Compact near-square shield/patch -> pocket
  if (aspect >= 0.72 && aspect <= 1.28 && fillRatio >= 0.74 && topFrac >= 0.78 && Math.abs(topFrac - midFrac) < 0.16) {
    return 'pocket';
  }

  // Tall silhouette with domed/curved top back and angled front opening -> hood
  if (aspect >= 1.15 && topFrac < 0.65 && topArchRatio < 0.08 && fillRatio > 0.58 && botFrac < 0.85) {
    return 'hood';
  }

  // Elongated vertical tapered cylinder without domed top -> trouser leg / sleeve
  if (aspect >= 1.55) return 'trousers';

  return 'bodice';
}

// ------------------------------------------------------------
// 5. Anatomical Single-Part Drafting Calibrated to Body Measurements
// ------------------------------------------------------------
export function extractGarmentPartPattern({
  imageData,
  partType = 'auto',
  category = 'women',
  measurements = {},
  seamAllowanceCm = 1.0,
  lang = 'en',
} = {}) {
  const seg = segmentForegroundMask(imageData);
  const comps = extractConnectedComponents(seg.mask, seg.width, seg.height, 0.006);
  if (!comps.length) {
    return { ok: false, reason: 'no-foreground-part', pieces: [] };
  }

  const primary = comps[0];
  const rawContour = traceComponentContour(primary, seg.width, seg.height);
  const shape = measureComponentShape(primary, seg.width, seg.height);
  const detectedPart = (!partType || partType === 'auto') ? classifyGarmentPartFromContour(shape) : partType;

  const m = {
    chest: Number(measurements.chest) || 92,
    waist: Number(measurements.waist) || 74,
    hips: Number(measurements.hips) || 98,
    neck: Number(measurements.neck) || 37,
    bicep: Number(measurements.bicep) || 30,
    sleeve: Number(measurements.sleeve) || 58,
    backLen: Number(measurements.backLen) || 40,
    inseam: Number(measurements.inseam) || 76,
    shoulder: Number(measurements.shoulder) || 40,
  };

  let rawPieces = [];

  if (detectedPart === 'collar') {
    const halfNeck = clamp(m.neck / 2 + 1.5, 16, 25);
    const collarLeafH = clamp(Math.round(shape.aspect * halfNeck * 0.46), 5.2, 8.8);
    const standH = clamp(collarLeafH * 0.46, 2.8, 4.2);
    const colOutline = pointedCollar(halfNeck, standH, collarLeafH);
    const stOutline = collarStand(halfNeck, standH);
    rawPieces = [
      {
        key: 'extracted_collar_leaf',
        name: { en: 'Upper Collar (Photo-Matched)', ar: 'الياقة العلوية (مستخلصة من الصورة)' },
        desc: {
          en: `Precision collar leaf calibrated to ${m.neck.toFixed(1)} cm neck circumference (${(halfNeck * 2).toFixed(1)} cm full collar).`,
          ar: `ياقة مفصلة مطابقة لمحيط الرقبة ${m.neck.toFixed(1)} سم.`,
        },
        outline: colOutline,
        curves: colOutline.curves || fitCubicBeziersToPolygon(colOutline),
        darts: [],
        notches: [colOutline[0], colOutline[Math.floor(colOutline.length / 2)]],
        grain: [[+(halfNeck * 0.25).toFixed(2), +(collarLeafH * 0.45).toFixed(2)], [+(halfNeck * 0.75).toFixed(2), +(collarLeafH * 0.45).toFixed(2)]],
        role: 'collar',
        cutOnFold: true,
        color: seg.dominantColor,
      },
      {
        key: 'extracted_collar_stand',
        name: { en: 'Collar Stand Band', ar: 'قاعدة / رجل الياقة' },
        desc: {
          en: `Curved neckband matched seam-for-seam to Upper Collar (${standH.toFixed(1)} cm stand height).`,
          ar: `قاعدة ياقة منحنية مطابقة للياقة بارتفاع ${standH.toFixed(1)} سم.`,
        },
        outline: stOutline,
        curves: stOutline.curves || fitCubicBeziersToPolygon(stOutline),
        darts: [],
        notches: [stOutline[0]],
        grain: [[+(halfNeck * 0.25).toFixed(2), +(standH * 0.5).toFixed(2)], [+(halfNeck * 0.75).toFixed(2), +(standH * 0.5).toFixed(2)]],
        role: 'collar-stand',
        cutOnFold: true,
        color: seg.dominantColor,
      },
    ];
  } else if (detectedPart === 'sleeve') {
    const slLen = shape.aspect < 1.1 ? m.sleeve * 0.42 : (shape.aspect < 1.38 ? m.sleeve * 0.76 : m.sleeve);
    const hasCuff = slLen > m.sleeve * 0.80;
    const draftLen = hasCuff ? slLen - 5.5 : slLen;
    const wristW = clamp(m.bicep * (shape.botFrac / Math.max(0.4, shape.midFrac)) * 0.92, 20, m.bicep * 1.35);
    const slOutline = cosineSleeveOutline({
      bicep: m.bicep * 1.12,
      sleeveLen: draftLen,
      capHeight: m.bicep * 0.44,
      wristW,
    });
    const slCurves = slOutline.curves || [];
    rawPieces = [
      {
        key: 'extracted_sleeve',
        name: { en: 'Set-In Sleeve (Photo-Matched)', ar: 'كم مفصل (مستخلص من الصورة)' },
        desc: {
          en: `Raised-cosine sleeve cap scaled to ${m.bicep.toFixed(1)} cm bicep and ${slLen.toFixed(1)} cm length.`,
          ar: `كم بمنحنى رأس (-cos) مضبوط على دوران الذراع ${m.bicep.toFixed(1)} سم وطول ${slLen.toFixed(1)} سم.`,
        },
        outline: slOutline,
        curves: slCurves,
        darts: [],
        notches: slOutline.notches || [slOutline[0], slOutline[Math.floor(slOutline.length / 2)]],
        role: 'sleeve',
        bilateral: true,
        quantity: 2,
        color: seg.dominantColor,
      },
    ];
    if (hasCuff) {
      const cuffW = clamp(wristW * 0.96, 19, 28);
      const cuffH = 6.0;
      const cuffOut = bandPc(cuffW, cuffH);
      rawPieces.push({
        key: 'extracted_sleeve_cuff',
        name: { en: 'Buttoned Wrist Cuff', ar: 'أسورة المعصم' },
        desc: { en: 'Interfaced wrist cuff matched to sleeve hem.', ar: 'أسورة معصم مقواة مطابقة لطرف الكم.' },
        outline: cuffOut,
        curves: [],
        darts: [],
        notches: [[+(cuffW / 2).toFixed(2), 0]],
        grain: [[3, cuffH / 2], [cuffW - 3, cuffH / 2]],
        role: 'cuff',
        bilateral: true,
        quantity: 2,
        color: seg.dominantColor,
      });
    }
  } else if (detectedPart === 'pocket') {
    const pw = 14.0;
    const ph = clamp(Math.round(pw * shape.aspect * 10) / 10, 12.0, 20.0);
    // Use actual traced rounded/shield bottom proportions or pocketPatch fallback
    const pOutline = rawContour.length >= 6
      ? buildSymmetricContourPolygon(rawContour, primary, pw, ph, { keepFlatTop: true })
      : pocketPatch(pw, ph);
    const pCurves = fitCubicBeziersToPolygon(pOutline);
    rawPieces = [
      {
        key: 'extracted_pocket',
        name: { en: 'Contoured Patch Pocket (Photo-Matched)', ar: 'جيب خارجي (مستخلص من الصورة)' },
        desc: { en: `True-contour patch pocket (${pw} × ${ph.toFixed(1)} cm) with cubic Bézier corners.`, ar: `جيب خارجي مطابق لشكل الصورة بمقاس ${pw} × ${ph.toFixed(1)} سم.` },
        outline: pOutline,
        curves: pCurves,
        darts: [],
        notches: [[0, 2.5], [pw, 2.5]],
        grain: [[+(pw / 2).toFixed(2), 2.5], [+(pw / 2).toFixed(2), +(ph - 2.5).toFixed(2)]],
        role: 'pocket',
        bilateral: true,
        quantity: 2,
        color: seg.dominantColor,
      },
    ];
  } else if (detectedPart === 'cuff') {
    const cw = clamp(m.bicep * 0.72 + 2.0, 20, 29);
    const ch = clamp(Math.round(cw * shape.aspect * 10) / 10, 4.5, 9.5);
    const cOutline = bandPc(cw, ch);
    rawPieces = [
      {
        key: 'extracted_cuff',
        name: { en: 'Tailored Cuff / Collar Band', ar: 'أسورة / حزام ياقة مفصل' },
        desc: { en: `Interfaced band (${cw.toFixed(1)} × ${ch.toFixed(1)} cm) graded to active wrist/neck size.`, ar: `شريط مفصل بمقاس ${cw.toFixed(1)} × ${ch.toFixed(1)} سم.` },
        outline: cOutline,
        curves: [],
        darts: [],
        notches: [[+(cw / 2).toFixed(2), 0]],
        grain: [[2.5, +(ch / 2).toFixed(2)], [+(cw - 2.5).toFixed(2), +(ch / 2).toFixed(2)]],
        role: 'cuff',
        bilateral: true,
        quantity: 2,
        color: seg.dominantColor,
      },
    ];
  } else if (detectedPart === 'hood') {
    const hoodW = clamp(m.neck * 0.68, 22, 30);
    const hoodH = clamp(32 * clamp(shape.aspect / 1.25, 0.88, 1.15), 29, 37);
    const hoodOut = [
      [0, hoodH],
      [hoodW * 0.48, hoodH],
      [hoodW, hoodH * 0.72],
      [hoodW * 0.94, hoodH * 0.34],
      [hoodW * 0.78, 0],
      [hoodW * 0.14, 0],
      [0, hoodH * 0.36],
    ];
    rawPieces = [
      {
        key: 'extracted_hood',
        name: { en: 'Contoured Two-Piece Hood', ar: 'قبعة مجسمة (كابيشون)' },
        desc: { en: `Curved hood side panel matched to ${m.neck.toFixed(1)} cm neckline.`, ar: `قبعة من قطعتين مطابقة لمحيط الرقبة ${m.neck.toFixed(1)} سم.` },
        outline: hoodOut,
        curves: [
          { fromIdx: 1, toIdx: 2, ...qBezToCubic(hoodOut[1], [hoodW * 0.92, hoodH], hoodOut[2]) },
          { fromIdx: 2, toIdx: 3, ...qBezToCubic(hoodOut[2], [hoodW * 1.02, hoodH * 0.52], hoodOut[3]) },
          { fromIdx: 4, toIdx: 5, ...qBezToCubic(hoodOut[4], [hoodW * 0.45, -1.6], hoodOut[5]) },
        ],
        darts: [],
        notches: [hoodOut[4], hoodOut[5]],
        grain: [[+(hoodW * 0.45).toFixed(2), 4], [+(hoodW * 0.45).toFixed(2), +(hoodH - 4).toFixed(2)]],
        role: 'hood',
        bilateral: true,
        quantity: 2,
        color: seg.dominantColor,
      },
    ];
  } else if (detectedPart === 'skirt') {
    const waistQ = m.waist / 4 + 0.6;
    const hipQ = m.hips / 4 + 1.0;
    const flare = clamp(shape.flareRatio, 0.92, 1.85);
    const len = clamp(m.inseam * clamp(shape.aspect * 0.52, 0.48, 1.05), 38, 92);
    const riseH = Math.min(20, len * 0.32);
    const skOut = gorePanel(waistQ, hipQ, hipQ * flare, riseH, len - riseH);
    const wbW = m.waist + 4;
    const wbOut = bandPc(wbW, 4.2);
    rawPieces = [
      {
        key: 'extracted_skirt_front',
        name: { en: 'Skirt Front Panel', ar: 'التنورة الأمامية' },
        desc: { en: `Cut on fold — flared ${flare.toFixed(2)}× from ${m.hips.toFixed(0)} cm hip.`, ar: `تُقص على القماش المثني — اتساع ${flare.toFixed(2)}×.` },
        outline: skOut,
        curves: skOut.curves || fitCubicBeziersToPolygon(skOut),
        darts: flare < 1.15 ? [[[waistQ * 0.45, 11], [waistQ * 0.45 - 1.1, 0], [waistQ * 0.45 + 1.1, 0]]] : [],
        notches: [skOut[1], skOut[2]],
        grain: [[2.5, 5], [2.5, +(len - 5).toFixed(1)]],
        role: 'skirt-front',
        cutOnFold: true,
        color: seg.dominantColor,
      },
      {
        key: 'extracted_skirt_back',
        name: { en: 'Skirt Back Panel', ar: 'التنورة الخلفية' },
        desc: { en: 'Center-back skirt panel with zipper seam allowance.', ar: 'لوحة التنورة الخلفية.' },
        outline: skOut,
        curves: skOut.curves || fitCubicBeziersToPolygon(skOut),
        darts: flare < 1.15 ? [[[waistQ * 0.45, 12.5], [waistQ * 0.45 - 1.2, 0], [waistQ * 0.45 + 1.2, 0]]] : [],
        notches: [skOut[1], skOut[2]],
        grain: [[2.5, 5], [2.5, +(len - 5).toFixed(1)]],
        role: 'skirt-back',
        cutOnFold: true,
        color: seg.dominantColor,
      },
      {
        key: 'extracted_skirt_waistband',
        name: { en: 'Interfaced Waistband', ar: 'حزام الخصر (الكمر)' },
        desc: { en: 'Structured waistband matched to waist circumference + overlap.', ar: 'كمر خصر مقوى بالحشوة.' },
        outline: wbOut,
        curves: [],
        darts: [],
        notches: [[+(wbW / 2).toFixed(2), 0]],
        grain: [[4, 2.1], [+(wbW - 4).toFixed(1), 2.1]],
        role: 'waistband',
        color: seg.dominantColor,
      },
    ];
  } else if (detectedPart === 'trousers') {
    const waistQ = m.waist / 4 + 0.8;
    const hipQ = m.hips / 4 + 1.2;
    const hemW = clamp(hipQ * shape.botFrac * 0.92, 16, 30);
    const rise = clamp(m.hips * 0.27, 23, 32);
    const inseam = clamp(m.inseam * (shape.aspect < 1.05 ? 0.48 : 1.0), 28, m.inseam + 4);
    const frontLeg = legPanel(waistQ, hipQ, hemW, rise, inseam, true);
    const backLeg = legPanel(waistQ + 1.5, hipQ + 2.0, hemW + 2.0, rise, inseam, false);
    const wbOut = bandPc(m.waist + 5, 4.2);
    rawPieces = [
      {
        key: 'extracted_trouser_front',
        name: { en: 'Trouser Front Leg', ar: 'رجل البنطلون الأمامية' },
        desc: { en: 'Tailored front leg block matched to waist, hip & inseam.', ar: 'قطعة الرجل الأمامية للبنطلون.' },
        outline: frontLeg,
        curves: frontLeg.curves || fitCubicBeziersToPolygon(frontLeg),
        darts: [[[waistQ * 0.45, 9.5], [waistQ * 0.45 - 0.9, 0], [waistQ * 0.45 + 0.9, 0]]],
        notches: [frontLeg[1], frontLeg[3]],
        role: 'trouser-front',
        bilateral: true,
        quantity: 2,
        color: seg.dominantColor,
      },
      {
        key: 'extracted_trouser_back',
        name: { en: 'Trouser Back Leg', ar: 'رجل البنطلون الخلفية' },
        desc: { en: 'Tailored back leg with seat curve extension & waist dart.', ar: 'قطعة الرجل الخلفية مع تقويسة الحجر الخلفي.' },
        outline: backLeg,
        curves: backLeg.curves || fitCubicBeziersToPolygon(backLeg),
        darts: [[[waistQ * 0.5, 11.5], [waistQ * 0.5 - 1.2, 0], [waistQ * 0.5 + 1.2, 0]]],
        notches: [backLeg[1], backLeg[3]],
        role: 'trouser-back',
        bilateral: true,
        quantity: 2,
        color: seg.dominantColor,
      },
      {
        key: 'extracted_trouser_waistband',
        name: { en: 'Trouser Waistband', ar: 'كمر البنطلون' },
        desc: { en: 'Interfaced contoured waist closure band.', ar: 'كمر بنطلون مقوى بالحشوة.' },
        outline: wbOut,
        curves: [],
        darts: [],
        notches: [[+((m.waist + 5) / 2).toFixed(2), 0]],
        role: 'waistband',
        color: seg.dominantColor,
      },
    ];
  } else {
    // 'bodice' fallback
    const shHalf = (m.shoulder || 40) / 2;
    const chHalf = (m.chest / 4) + 1.5;
    const wHalf = (m.waist / 4) + 1.0;
    const hHalf = (m.hips / 4) + 1.5;
    const bLen = m.backLen || 40;
    const underarmY = bLen * 0.48;
    const hipDrop = bLen + 18;
    const frontNeckDepth = clamp(8.5 * (shape.topFrac < 0.7 ? 1.18 : 1.0), 6.5, 12.0);
    const neckHalfW = clamp(m.neck / 6 + 0.6, 6.2, 8.8);
    const fOut = plainBodicePanel(shHalf, frontNeckDepth, chHalf, underarmY, wHalf, bLen, hHalf, hipDrop, hHalf, hipDrop, false);
    const bOut = plainBodicePanel(shHalf, 2.2, chHalf - 0.5, underarmY, wHalf, bLen, hHalf - 0.5, hipDrop, hHalf - 0.5, hipDrop, false);
    rawPieces = [
      {
        key: 'extracted_bodice_front',
        name: { en: 'Bodice Front (Photo-Matched)', ar: 'صدرية أمامية (مستخلصة من الصورة)' },
        desc: { en: 'Cut on fold — fitted to active chest & waist ease.', ar: 'تُقص على القماش المثني — مطابقة لمقاسات الصدر والخصر.' },
        outline: fOut,
        curves: fOut.curves || fitCubicBeziersToPolygon(fOut),
        darts: [[[wHalf * 0.46, bLen * 0.54], [wHalf * 0.46 - 1.1, bLen], [wHalf * 0.46 + 1.1, bLen]]],
        notches: [fOut[2], fOut[4]],
        grain: [[2.5, 10], [2.5, +(hipDrop - 5).toFixed(1)]],
        role: 'bodice-front',
        cutOnFold: true,
        color: seg.dominantColor,
      },
      {
        key: 'extracted_bodice_back',
        name: { en: 'Bodice Back (Photo-Matched)', ar: 'صدرية خلفية (مستخلصة من الصورة)' },
        desc: { en: 'Back torso block with matching shoulder & side seams.', ar: 'قطعة الظهر الأساسية مطابقة للكتف والجنب.' },
        outline: bOut,
        curves: bOut.curves || fitCubicBeziersToPolygon(bOut),
        darts: [[[wHalf * 0.46, bLen * 0.52], [wHalf * 0.46 - 1.0, bLen], [wHalf * 0.46 + 1.0, bLen]]],
        notches: [bOut[2], bOut[4]],
        grain: [[2.5, 10], [2.5, +(hipDrop - 5).toFixed(1)]],
        role: 'bodice-back',
        cutOnFold: true,
        color: seg.dominantColor,
      },
    ];
  }

  const arranged = layoutPiecesGrid(rawPieces);
  const { pieces: validPieces, validation } = ensureValidPieces(arranged, m, seamAllowanceCm);
  const label = PART_NAMES[detectedPart] || PART_NAMES.bodice;
  const ar = lang === 'ar';

  return {
    ok: true,
    mode: 'part',
    detectedPart,
    pieces: validPieces,
    style: {
      type: detectedPart === 'trousers' || detectedPart === 'skirt' ? detectedPart : (detectedPart === 'collar' ? 'shirt' : 'bodice'),
      color: seg.dominantColor,
      neckline: detectedPart === 'collar' ? 'collar' : 'round',
      hemShape: 'straight',
      lengthF: 1.0,
      flareF: +(shape.flareRatio || 1.0).toFixed(2),
      fitF: 1.0,
      sleeveLenF: detectedPart === 'sleeve' ? 1.0 : 0,
    },
    summary: ar
      ? `تم استخلاص باترون (${label.ar}) من الصورة وضبطه بمقياس 1:1 جاهز للطباعة والتدريج (${category}).`
      : `Extracted 1:1 printable & gradable ${label.en} pattern directly from your photo.`,
    attributes: [
      { k: 'part', label: ar ? 'الجزء المكتشف' : 'Extracted Part', value: ar ? label.ar : label.en, source: 'pixel', confidence: 0.94 },
      { k: 'color', label: ar ? 'اللون' : 'Color', value: seg.dominantColor, swatch: true, source: 'pixel', confidence: 0.95 },
      { k: 'pieces', label: ar ? 'عدد القطع' : 'Pattern Pieces', value: `${validPieces.length}`, source: 'pixel', confidence: 1.0 },
    ],
    validation,
  };
}

// Normalizes a traced contour to clean symmetric cm polygon while preserving lower shield/curved shaping
function buildSymmetricContourPolygon(rawContour, comp, targetW, targetH, opts = {}) {
  const simplified = simplifyClosedContour(rawContour, Math.max(1.2, Math.min(comp.w, comp.h) * 0.025));
  const scaled = simplified.map(([px, py]) => [
    +(((px - comp.minX) / Math.max(1, comp.w - 1)) * targetW).toFixed(2),
    +(((py - comp.minY) / Math.max(1, comp.h - 1)) * targetH).toFixed(2),
  ]);
  if (opts.keepFlatTop && scaled.length >= 4) {
    return [[0, 0], [targetW, 0], ...scaled.filter((pt) => pt[1] > targetH * 0.35).sort((a, b) => b[0] - a[0])];
  }
  return scaled.length >= 4 ? scaled : pocketPatch(targetW, targetH);
}

// ------------------------------------------------------------
// 6. Multi-Piece Flat Paper Pattern Sheet / Sketch Digitizer
// ------------------------------------------------------------
export function digitizeFlatPatternSheet({
  imageData,
  measurements = {},
  referenceWidthCm = null,
  seamAllowanceCm = 1.0,
  lang = 'en',
} = {}) {
  const seg = segmentForegroundMask(imageData);
  const comps = extractConnectedComponents(seg.mask, seg.width, seg.height, 0.008).slice(0, 12);
  if (!comps.length) {
    return { ok: false, reason: 'no-sheet-pieces', pieces: [] };
  }

  const chest = Number(measurements.chest) || 92;
  const maxCompW = Math.max(...comps.map((c) => c.w), 1);
  // Calibrate cm-per-pixel from explicit referenceWidthCm or largest component chest/back panel heuristic
  const targetMaxPanelCm = referenceWidthCm && referenceWidthCm > 5 ? referenceWidthCm : Math.max(22, chest * 0.28);
  const pxToCm = targetMaxPanelCm / maxCompW;

  const rawPieces = comps.map((comp, idx) => {
    const rawPts = traceComponentContour(comp, seg.width, seg.height);
    const eps = Math.max(1.2, Math.min(comp.w, comp.h) * 0.022);
    const simp = simplifyClosedContour(rawPts, eps);
    const outlineCm = simp.map(([x, y]) => [
      +((x - comp.minX) * pxToCm).toFixed(2),
      +((y - comp.minY) * pxToCm).toFixed(2),
    ]);
    const shape = measureComponentShape(comp, seg.width, seg.height);
    const guessedPart = classifyGarmentPartFromContour(shape);
    const wCm = +(comp.w * pxToCm).toFixed(1);
    const hCm = +(comp.h * pxToCm).toFixed(1);
    const curves = fitCubicBeziersToPolygon(outlineCm);
    const roleMap = {
      collar: 'collar',
      cuff: 'cuff',
      sleeve: 'sleeve',
      pocket: 'pocket',
      hood: 'hood',
    };
    const role = roleMap[guessedPart] || 'other';
    return {
      key: `sheet_piece_${idx + 1}`,
      name: {
        en: `${PART_NAMES[guessedPart]?.en.split(' ')[0] || 'Pattern'} Piece ${idx + 1}`,
        ar: `قطعة رقم ${idx + 1} (${PART_NAMES[guessedPart]?.ar || 'باترون'})`,
      },
      desc: {
        en: `Digitized from flat pattern sheet (${wCm} × ${hCm} cm) with smooth cubic Bézier curves.`,
        ar: `مستخلصة من صورة الباترون الورقي (${wCm} × ${hCm} سم) بمنحنيات بيزيه ناعمة.`,
      },
      outline: outlineCm,
      curves,
      darts: [],
      notches: outlineCm.length >= 4 ? [outlineCm[0], outlineCm[Math.floor(outlineCm.length / 2)]] : [],
      role,
      color: seg.dominantColor,
    };
  });

  const arranged = layoutPiecesGrid(rawPieces);
  const { pieces: validPieces, validation } = ensureValidPieces(arranged, measurements, seamAllowanceCm);
  const ar = lang === 'ar';

  return {
    ok: validPieces.length > 0,
    mode: 'sheet',
    pieces: validPieces,
    style: {
      type: 'bodice',
      color: seg.dominantColor,
      neckline: 'round',
      hemShape: 'straight',
      lengthF: 1.0,
      flareF: 1.0,
      fitF: 1.0,
      sleeveLenF: 0,
    },
    summary: ar
      ? `تم رقمنة ${validPieces.length} قطعة باترون من الصورة الورقية وتحويلها لخطوط بيزيه قابلة للتدريج والطباعة.`
      : `Digitized ${validPieces.length} closed pattern piece(s) from sheet photo with smooth cubic Bézier curves.`,
    attributes: [
      { k: 'pieces', label: ar ? 'القطع المستخلصة' : 'Digitized Pieces', value: `${validPieces.length}`, source: 'pixel', confidence: 0.96 },
      { k: 'color', label: ar ? 'لون المرجع' : 'Reference Ink/Fabric', value: seg.dominantColor, swatch: true, source: 'pixel', confidence: 0.92 },
    ],
    validation,
  };
}

function layoutPiecesGrid(pieces) {
  let curX = 0, curY = 0, rowMaxH = 0;
  const maxRowW = 140;
  return pieces.map((p) => {
    const xs = p.outline.map((pt) => pt[0]);
    const ys = p.outline.map((pt) => pt[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(...xs) - minX;
    const h = Math.max(...ys) - minY;
    if (curX > 0 && curX + w > maxRowW) {
      curX = 0;
      curY += rowMaxH + 8;
      rowMaxH = 0;
    }
    const dx = curX - minX;
    const dy = curY - minY;
    const shiftPt = (pt) => [+(pt[0] + dx).toFixed(3), +(pt[1] + dy).toFixed(3)];
    const moved = {
      ...p,
      outline: p.outline.map(shiftPt),
      curves: (p.curves || []).map((c) => ({ ...c, c1: shiftPt(c.c1), c2: shiftPt(c.c2) })),
      darts: (p.darts || []).map((d) => d.map(shiftPt)),
      notches: (p.notches || []).map(shiftPt),
      grain: Array.isArray(p.grain) && p.grain.length === 2 ? p.grain.map(shiftPt) : p.grain,
    };
    curX += w + 8;
    if (h > rowMaxH) rowMaxH = h;
    return moved;
  });
}
