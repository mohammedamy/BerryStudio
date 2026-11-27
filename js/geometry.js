/* ============================================================
   WP-14: polygon offsetting — per-edge seam allowance + real join
   styles. Pure, DOM-free (unlike most of js/canvas.js) so it's
   unit-testable directly, matching the extraction pattern WP-11/WP-12
   used for js/nesting-core.js and js/pattern-export.js.
   ============================================================ */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

// The original single-distance, miter-only offset, moved here verbatim
// from js/canvas.js EXCEPT for one real bug fixed in the move: `sign`
// was `area>0?1:-1`, which for every real pattern piece in this app
// (outline arrays all wind with positive shoelace area, e.g.
// data.js's front_bodice) produced normals pointing INWARD, not
// outward — confirmed against live app data: offsetting a real bodice
// piece by the app's own default seamCm=1 shrank its area from ~488
// to ~376 instead of growing it to ~610. That made both the dashed
// "seam allowance" preview on the 2D canvas and PatternValidator's
// seamAllowance check silently backward (inward) for every pattern
// this app has ever shipped. Fixed by flipping the sign; the rest of
// the algorithm (clamped-bisector miter, cosA floor of 0.3 to cap
// spike length at sharp angles) is unchanged.
function offsetUniformMiter(poly, d) {
  const n = poly.length, out = [];
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n]; area += x1 * y2 - x2 * y1; }
  const sign = area > 0 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const e1 = norm(sub(p1, p0)), e2 = norm(sub(p2, p1));
    const nrm1 = [-e1[1] * sign, e1[0] * sign], nrm2 = [-e2[1] * sign, e2[0] * sign];
    const bis = norm([nrm1[0] + nrm2[0], nrm1[1] + nrm2[1]]);
    const cosA = Math.max(0.3, bis[0] * nrm1[0] + bis[1] * nrm1[1]);
    out.push([p1[0] + bis[0] * d / cosA, p1[1] + bis[1] * d / cosA]);
  }
  return out;
}

// General offset: `opts.perEdge` is an array parallel to the polygon's
// edges (index i = the edge from poly[i] to poly[i+1]) giving a distance
// override for that edge, falling back to the uniform `d` where absent.
// `opts.join` adds 'round' (arc fillet) and 'bevel' (single chamfer)
// alongside the default 'miter', applied only at CONVEX corners — reflex
// (concave) corners always resolve via line-line intersection regardless
// of join style, since a "join style" is a treatment for an outward
// corner; applying a fillet/chamfer to an inward corner would carve a
// notch into the offset polygon rather than smooth a corner of it (the
// same convention libraries like Clipper2 use).
// WP-14: "walk the seam" support — given an outline and an inclusive
// index range [fromIdx, toIdx] (following the outline's own point
// order, wrapping past the end if toIdx < fromIdx — the same
// convention js/fancy-patterns.js's `edges[].seamId` metadata uses),
// return the point at `fraction` (0-1) of that sub-path's own arc
// length. This is the same "walk segments, accumulate cumulative
// distance" technique js/validate.js's arcPositionFraction uses for
// notch-alignment checking, just inverted (fraction -> point instead
// of point -> fraction) and scoped to a declared seam edge rather than
// the whole outline's perimeter.
export function seamPointAtFraction(outline, fromIdx, toIdx, fraction) {
  const n = outline.length;
  const idxList = [fromIdx];
  let i = fromIdx;
  while (i !== toIdx) { i = (i + 1) % n; idxList.push(i); }
  const pts = idxList.map((idx) => outline[idx]);
  const segLens = [];
  let total = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const l = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
    segLens.push(l); total += l;
  }
  if (total === 0) return pts[0].slice();
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let walked = 0;
  for (let k = 0; k < segLens.length; k++) {
    if (walked + segLens[k] >= target || k === segLens.length - 1) {
      const t = segLens[k] > 0 ? Math.max(0, Math.min(1, (target - walked) / segLens[k])) : 0;
      return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t];
    }
    walked += segLens[k];
  }
  return pts[pts.length - 1].slice();
}

export function offsetPoly(poly, d, opts = {}) {
  const { join = 'miter', perEdge = null } = opts;
  if (join === 'miter' && !perEdge) return offsetUniformMiter(poly, d);

  const n = poly.length;
  if (n < 3) return poly.slice();
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n]; area += x1 * y2 - x2 * y1; }
  const windingSign = area > 0 ? 1 : -1;   // raw winding direction — used only for convexity
  const sign = -windingSign;               // outward-normal direction — see offsetUniformMiter's fix above
  const distAt = (edgeIdx) => (perEdge && perEdge[edgeIdx] != null) ? perEdge[edgeIdx] : d;

  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const dir = norm(sub(b, a));
    const nrm = [-dir[1] * sign, dir[0] * sign];
    const di = distAt(i);
    return { a: [a[0] + nrm[0] * di, a[1] + nrm[1] * di], b: [b[0] + nrm[0] * di, b[1] + nrm[1] * di], dir };
  });

  const lineIntersect = (p1, d1, p2, d2) => {
    const denom = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / denom;
    return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
  };

  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = edges[(i - 1 + n) % n], curr = edges[i];
    const cross = prev.dir[0] * curr.dir[1] - prev.dir[1] * curr.dir[0];
    const convex = windingSign > 0 ? cross > 0 : cross < 0;
    if (!convex || join === 'miter') {
      out.push(lineIntersect(prev.a, prev.dir, curr.a, curr.dir) || curr.a.slice());
    } else if (join === 'bevel') {
      out.push(prev.b.slice(), curr.a.slice());
    } else { // round
      const center = poly[i];
      const r = distAt(i);
      const a0 = Math.atan2(prev.b[1] - center[1], prev.b[0] - center[0]);
      const a1 = Math.atan2(curr.a[1] - center[1], curr.a[0] - center[0]);
      let da = a1 - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const steps = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 8)));
      for (let s = 0; s <= steps; s++) {
        const a = a0 + da * (s / steps);
        out.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r]);
      }
    }
  }
  return out;
}

// Signed double shoelace area (positive in CW screen/Y-down coords for BerryStudio pieces).
function signedDoubleArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return area;
}

// Even-odd raycast point-in-polygon check (pattern cm space).
function pointInPoly(pt, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  const [px, py] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Detects which outline edge index acts as the Cut-on-Fold line for a piece.
 * Checks explicit `piece.foldEdgeIndex` first, then the longest vertical edge along
 * the left (or right) bounding edge when `piece.cutOnFold` is true. Returns -1 if none.
 */
export function detectFoldEdgeIndex(piece) {
  const o = piece?.outline;
  if (!piece?.cutOnFold || !Array.isArray(o) || o.length < 3) return -1;
  if (Number.isInteger(piece.foldEdgeIndex) && piece.foldEdgeIndex >= 0 && piece.foldEdgeIndex < o.length) {
    return piece.foldEdgeIndex;
  }
  const xs = o.map((p) => p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const w = Math.max(maxX - minX, 1);
  const xTol = Math.max(0.35, w * 0.025);
  const dxTol = Math.max(0.25, w * 0.02);

  let bestLeftIdx = -1, bestLeftLen = -1;
  let bestRightIdx = -1, bestRightLen = -1;
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    const dx = Math.abs(a[0] - b[0]);
    const dy = Math.abs(a[1] - b[1]);
    if (dx > dxTol || dy < 2) continue;
    const avgX = (a[0] + b[0]) * 0.5;
    if (Math.abs(avgX - minX) <= xTol && dy > bestLeftLen) {
      bestLeftLen = dy; bestLeftIdx = i;
    } else if (Math.abs(avgX - maxX) <= xTol && dy > bestRightLen) {
      bestRightLen = dy; bestRightIdx = i;
    }
  }
  return bestLeftIdx >= 0 ? bestLeftIdx : bestRightIdx;
}

const TIGHT_CURVE_ROLES = /(collar|stand|neck|facing|placket|cuff|waistband|belt|pocket|strap|tab|gusset|fly|yoke)/i;
const HEM_CANDIDATE_ROLES = /(bodice|front|back|skirt|dress|trouser|pant|short|sleeve|peplum|coat|jacket|shirt|blouse|abaya|kaftan|panel|gown|tunic|top)/i;

/**
 * Resolves per-edge seam allowances (cm) for a piece:
 *  - 0 cm on Cut-on-Fold edge
 *  - `hemCm` (default 3.0 cm) on bottom hem edges of main garment pieces
 *  - min(default, 1.0 cm) on tight curves / collars / facings / necklines
 *  - explicit `piece.edgeSeamAllowances[i]` when declared
 */
export function resolvePieceSeamAllowances(piece, defaultSeamCm = 1.0, opts = {}) {
  const o = piece?.outline;
  if (!Array.isArray(o) || o.length < 3) return [];
  const n = o.length;
  const base = Math.max(0, Number(defaultSeamCm) || 0);
  if (base === 0) return new Array(n).fill(0);

  const variable = opts.variable !== false;
  const zeroFold = opts.zeroFold !== false;
  const foldIdx = zeroFold ? detectFoldEdgeIndex(piece) : -1;

  if (!variable) {
    return o.map((_, i) => {
      if (Array.isArray(piece.edgeSeamAllowances) && Number.isFinite(piece.edgeSeamAllowances[i])) {
        return Math.max(0, piece.edgeSeamAllowances[i]);
      }
      return i === foldIdx ? 0 : base;
    });
  }

  const roleStr = `${piece.role || ''} ${(piece.name && piece.name.en) || ''} ${piece.key || ''}`;
  const isTightPiece = TIGHT_CURVE_ROLES.test(roleStr) && !/(dress|bodice|skirt|front_panel|back_panel)/i.test(piece.role || '');
  const isHemPiece = !isTightPiece && (HEM_CANDIDATE_ROLES.test(roleStr) || !piece.role);
  const hemCm = Number.isFinite(opts.hemCm) ? opts.hemCm : Math.max(base, 3.0);
  const curveAllowanceCm = Math.min(base, 1.0);

  const ys = o.map((p) => p[1]);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const h = Math.max(maxY - minY, 1);

  const curveEdgeSet = new Set();
  (piece.curves || []).forEach((c) => {
    if (c && Number.isInteger(c.fromIdx) && Number.isInteger(c.toIdx)) {
      let idx = c.fromIdx;
      let guard = 0;
      while (idx !== c.toIdx && guard++ < n) {
        curveEdgeSet.add(idx);
        idx = (idx + 1) % n;
      }
    }
  });

  const hemEdgeSet = new Set();
  (piece.edges || []).forEach((e) => {
    if (e && /hem/i.test(e.seamId || e.role || '')) {
      let idx = e.fromIdx;
      let guard = 0;
      while (idx !== e.toIdx && guard++ < n) {
        hemEdgeSet.add(idx);
        idx = (idx + 1) % n;
      }
    }
  });

  return o.map((a, i) => {
    if (Array.isArray(piece.edgeSeamAllowances) && Number.isFinite(piece.edgeSeamAllowances[i])) {
      return Math.max(0, piece.edgeSeamAllowances[i]);
    }
    if (i === foldIdx) return 0;
    const b = o[(i + 1) % n];
    const edgeLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const isBottomHoriz = isHemPiece &&
      a[1] >= maxY - Math.max(1.6, h * 0.06) &&
      b[1] >= maxY - Math.max(1.6, h * 0.06) &&
      Math.abs(a[0] - b[0]) >= Math.abs(a[1] - b[1]) * 1.4 &&
      edgeLen >= 4;
    if (hemEdgeSet.has(i) || isBottomHoriz) return hemCm;
    if (isTightPiece) return curveAllowanceCm;
    const midY = (a[1] + b[1]) * 0.5;
    if (curveEdgeSet.has(i) && midY <= minY + h * 0.45) return curveAllowanceCm;
    return base;
  });
}

/**
 * Offsets a pattern piece's outline outward using resolved per-edge seam allowances
 * (keeping Cut-on-Fold edges at 0 cm and preventing extreme acute miter spikes).
 */
export function offsetPieceOutline(piece, defaultSeamCm = 1.0, opts = {}) {
  const o = piece?.outline;
  if (!Array.isArray(o) || o.length < 3) return [];
  const perEdge = resolvePieceSeamAllowances(piece, defaultSeamCm, opts);
  const maxD = Math.max(...perEdge);
  if (maxD <= 1e-6) return o.map((pt) => [pt[0], pt[1]]);
  const raw = offsetPoly(o, defaultSeamCm, { perEdge, join: 'miter' });
  const miterCap = Math.max(1.5, maxD * 3.5);
  return raw.map((pt, i) => {
    const src = o[i % o.length];
    const dx = pt[0] - src[0], dy = pt[1] - src[1];
    const dist = Math.hypot(dx, dy);
    if (dist > miterCap && dist > 1e-6) {
      const k = miterCap / dist;
      return [src[0] + dx * k, src[1] + dy * k];
    }
    return pt;
  });
}

/**
 * Finds the closest outline edge to `pt` and returns its tangent, guaranteed inward unit
 * normal (pointing into the piece interior), and outward unit normal.
 */
export function edgeNormalAtPoint(outline, pt) {
  if (!Array.isArray(outline) || outline.length < 3 || !Array.isArray(pt)) {
    return { edgeIdx: 0, dist: 0, proj: pt ? pt.slice() : [0, 0], tangent: [1, 0], inward: [0, 1], outward: [0, -1] };
  }
  const n = outline.length;
  let bestIdx = 0, bestDist = Infinity, bestProj = outline[0].slice();
  for (let i = 0; i < n; i++) {
    const a = outline[i], b = outline[(i + 1) % n];
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * abx + (pt[1] - a[1]) * aby) / len2)) : 0;
    const px = a[0] + abx * t, py = a[1] + aby * t;
    const d = Math.hypot(pt[0] - px, pt[1] - py);
    if (d < bestDist) {
      bestDist = d; bestIdx = i; bestProj = [px, py];
    }
  }
  const a = outline[bestIdx], b = outline[(bestIdx + 1) % n];
  const txLen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const tx = (b[0] - a[0]) / txLen, ty = (b[1] - a[1]) / txLen;
  const area = signedDoubleArea(outline);
  const outSign = area > 0 ? -1 : 1;
  let outX = -ty * outSign, outY = tx * outSign;
  let inX = -outX, inY = -outY;
  // Verify inward candidate lands inside the polygon for short non-degenerate pieces.
  const eps = Math.min(0.4, Math.max(0.05, txLen * 0.1));
  if (!pointInPoly([bestProj[0] + inX * eps, bestProj[1] + inY * eps], outline) &&
      pointInPoly([bestProj[0] + outX * eps, bestProj[1] + outY * eps], outline)) {
    [inX, inY, outX, outY] = [outX, outY, inX, inY];
  }
  return {
    edgeIdx: bestIdx,
    dist: bestDist,
    proj: bestProj,
    tangent: [tx, ty],
    inward: [inX, inY],
    outward: [outX, outY],
  };
}

function pointToOutlineDist(pt, outline) {
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * abx + (pt[1] - a[1]) * aby) / len2)) : 0;
    const d = Math.hypot(pt[0] - (a[0] + abx * t), pt[1] - (a[1] + aby * t));
    if (d < best) best = d;
  }
  return best;
}

/**
 * Computes a safe visual anchor inside a pattern piece (approximate pole of inaccessibility)
 * so text stamps stay inside curved collars, crescent pieces, and narrow strips.
 */
export function findVisualLabelAnchor(outline) {
  if (!Array.isArray(outline) || outline.length < 3) {
    return { x: 0, y: 0, maxRadius: 2, width: 4, height: 4 };
  }
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1e-3), height = Math.max(maxY - minY, 1e-3);
  const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const cy = ys.reduce((s, v) => s + v, 0) / ys.length;

  let bestX = cx, bestY = cy;
  let bestScore = pointInPoly([cx, cy], outline) ? pointToOutlineDist([cx, cy], outline) : -1;

  const steps = 6;
  for (let gx = 1; gx < steps; gx++) {
    for (let gy = 1; gy < steps; gy++) {
      const px = minX + (gx / steps) * width;
      const py = minY + (gy / steps) * height;
      if (!pointInPoly([px, py], outline)) continue;
      const d = pointToOutlineDist([px, py], outline);
      if (d > bestScore) {
        bestScore = d; bestX = px; bestY = py;
      }
    }
  }
  // Prefer slightly above vertical center on tall pieces when clearance is still generous.
  const upperY = minY + height * 0.42;
  if (pointInPoly([bestX, upperY], outline)) {
    const dUp = pointToOutlineDist([bestX, upperY], outline);
    if (dUp >= Math.max(2.5, bestScore * 0.72)) {
      bestY = upperY;
    }
  }
  return {
    x: bestX,
    y: bestY,
    maxRadius: Math.max(0.8, bestScore > 0 ? bestScore : Math.min(width, height) * 0.25),
    width,
    height,
  };
}

/**
 * Infers clear bilingual cutting instructions (Cut Qty, Fold, Mirrored, Interfacing).
 */
export function inferPieceCutInstruction(piece) {
  const roleStr = `${piece?.role || ''} ${(piece?.name && piece.name.en) || ''} ${piece?.key || ''}`;
  const interfacing = piece?.interfacing !== undefined
    ? !!piece.interfacing
    : /(collar|stand|cuff|waistband|facing|placket|lapel|belt|neckband)/i.test(roleStr);
  const onFold = !!piece?.cutOnFold;
  const qty = Number.isInteger(piece?.quantity)
    ? piece.quantity
    : (onFold ? 1 : (piece?.bilateral === true || (piece?.bilateral !== false && /(sleeve|trouser|pant|side|leg|pocket|panel|cuff)/i.test(roleStr) && !onFold) ? 2 : 1));

  let en, ar;
  if (onFold) {
    en = `Cut ${qty} on Fold`;
    ar = `قص ${qty} على الثنية`;
  } else if (qty >= 2) {
    en = `Cut ${qty} (Pair)`;
    ar = `قص ${qty} (يمين ويسار)`;
  } else {
    en = `Cut ${qty} Self`;
    ar = `قص ${qty}`;
  }
  if (interfacing) {
    en += ' + Interfacing';
    ar += ' + فازلين';
  }
  return { qty, onFold, interfacing, en, ar };
}

/**
 * Measures the arc length (cm) along `piece.outline` from `fromIdx` to `toIdx`.
 */
export function measureSeamArcLength(piece, fromIdx, toIdx) {
  const o = piece?.outline;
  if (!Array.isArray(o) || o.length < 2) return 0;
  const n = o.length;
  const idxList = [((fromIdx % n) + n) % n];
  const end = ((toIdx % n) + n) % n;
  let i = idxList[0], guard = 0;
  while (i !== end && guard++ < n) {
    i = (i + 1) % n;
    idxList.push(i);
  }
  let total = 0;
  for (let k = 0; k < idxList.length - 1; k++) {
    const a = o[idxList[k]], b = o[idxList[k + 1]];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

function edgeMidY(o, i) { return (o[i][1] + o[(i + 1) % o.length][1]) * 0.5; }
function edgeMidX(o, i) { return (o[i][0] + o[(i + 1) % o.length][0]) * 0.5; }
function edgeLen(o, i) { const a = o[i], b = o[(i + 1) % o.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); }

// Heuristic topological seam detector for patterns lacking explicit edges[].seamId metadata.
function inferEdgeCandidate(piece, kind) {
  const o = piece?.outline;
  if (!Array.isArray(o) || o.length < 3) return null;
  const n = o.length;
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);

  if (kind === 'shoulder') {
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = o[i], b = o[(i + 1) % n];
      const len = edgeLen(o, i);
      const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
      if (len < 3 || dx < len * 0.65) continue;
      if (edgeMidY(o, i) > minY + h * 0.25) continue;
      const midX = edgeMidX(o, i);
      const score = (midX - minX) / w * 2 - (edgeMidY(o, i) - minY) / h * 3 + (dy > 0.2 ? 0.5 : 0);
      if (score > bestScore) { bestScore = score; best = { fromIdx: i, toIdx: (i + 1) % n }; }
    }
    return best;
  }
  if (kind === 'side') {
    const idxs = [];
    for (let i = 0; i < n; i++) {
      const a = o[i], b = o[(i + 1) % n];
      const len = edgeLen(o, i);
      const dy = Math.abs(b[1] - a[1]);
      if (len < 1 || dy < len * 0.55) continue;
      if (edgeMidX(o, i) < minX + w * 0.52) continue;
      if (edgeMidY(o, i) < minY + h * 0.38) continue;
      idxs.push(i);
    }
    if (idxs.length >= 1) return { fromIdx: idxs[0], toIdx: (idxs[idxs.length - 1] + 1) % n };
  }
  if (kind === 'armhole') {
    const idxs = [];
    for (let i = 0; i < n; i++) {
      if (edgeMidX(o, i) >= minX + w * 0.55 && edgeMidY(o, i) >= minY + h * 0.06 && edgeMidY(o, i) <= minY + h * 0.52) {
        idxs.push(i);
      }
    }
    if (idxs.length >= 1) return { fromIdx: idxs[0], toIdx: (idxs[idxs.length - 1] + 1) % n };
  }
  if (kind === 'sleevecap') {
    const idxs = [];
    for (let i = 0; i < n; i++) {
      if (edgeMidY(o, i) <= minY + h * 0.42) idxs.push(i);
    }
    if (idxs.length >= 2) return { fromIdx: idxs[0], toIdx: (idxs[idxs.length - 1] + 1) % n };
  }
  return null;
}

/**
 * Analyzes seam balance across all pieces — combining declared `edges[].seamId` pairs
 * and auto-inferred shoulder, side-seam, and armhole/sleeve-cap pairs.
 */
export function analyzeSeamBalance(pieces) {
  if (!Array.isArray(pieces) || pieces.length < 2) return [];
  const pairs = [];
  const seenKeys = new Set();
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

  const bySeam = {};
  pieces.forEach((p, i) => {
    (p.edges || []).forEach((e) => {
      if (e?.seamId) (bySeam[e.seamId] ||= []).push({ pieceIdx: i, edge: e });
    });
  });

  Object.entries(bySeam).forEach(([seamId, entries]) => {
    for (let a = 0; a < entries.length; a++) {
      for (let b = a + 1; b < entries.length; b++) {
        if (entries[a].pieceIdx === entries[b].pieceIdx) continue;
        const A = entries[a], B = entries[b];
        const oA = pieces[A.pieceIdx].outline, oB = pieces[B.pieceIdx].outline;
        const sameDir = dist(oA[A.edge.fromIdx], oB[B.edge.fromIdx]) + dist(oA[A.edge.toIdx], oB[B.edge.toIdx]);
        const oppDir = dist(oA[A.edge.fromIdx], oB[B.edge.toIdx]) + dist(oB[B.edge.fromIdx], oA[A.edge.toIdx]);
        const lenA = measureSeamArcLength(pieces[A.pieceIdx], A.edge.fromIdx, A.edge.toIdx);
        const lenB = measureSeamArcLength(pieces[B.pieceIdx], B.edge.fromIdx, B.edge.toIdx);
        const diffCm = +(lenB - lenA).toFixed(2);
        const absDiff = Math.abs(diffCm);
        const status = absDiff <= 0.45 ? 'ok' : (absDiff <= 1.2 ? 'ease' : 'warn');
        const pAName = pieces[A.pieceIdx].name || {};
        const pBName = pieces[B.pieceIdx].name || {};
        pairs.push({
          id: seamId,
          labelEn: `${pAName.en || seamId} ↔ ${pBName.en || seamId}`,
          labelAr: `${pAName.ar || seamId} ↔ ${pBName.ar || seamId}`,
          source: 'declared',
          a: A,
          b: B,
          bReversed: oppDir < sameDir,
          lenA: +lenA.toFixed(2),
          lenB: +lenB.toFixed(2),
          diffCm,
          status,
        });
        seenKeys.add(`${Math.min(A.pieceIdx, B.pieceIdx)}-${Math.max(A.pieceIdx, B.pieceIdx)}-${seamId}`);
      }
    }
  });

  // Auto-inferred structural seams (Shoulder, Side Seam, Armhole ↔ Sleeve Cap)
  const frontIdx = pieces.findIndex((p) => /front|bodice_front|shirt_front/i.test(`${p.role || ''} ${p.key || ''} ${p.name?.en || ''}`) && !/back|skirt|trouser|pant|sleeve/i.test(`${p.role || ''} ${p.key || ''}`));
  const backIdx = pieces.findIndex((p) => /back|bodice_back|shirt_back/i.test(`${p.role || ''} ${p.key || ''} ${p.name?.en || ''}`) && !/front|skirt|trouser|pant|sleeve/i.test(`${p.role || ''} ${p.key || ''}`));
  const sleeveIdx = pieces.findIndex((p) => /sleeve/i.test(`${p.role || ''} ${p.key || ''} ${p.name?.en || ''}`));

  if (frontIdx >= 0 && backIdx >= 0) {
    const shF = inferEdgeCandidate(pieces[frontIdx], 'shoulder');
    const shB = inferEdgeCandidate(pieces[backIdx], 'shoulder');
    if (shF && shB && !pairs.some((p) => /shoulder/i.test(p.id))) {
      const lenA = measureSeamArcLength(pieces[frontIdx], shF.fromIdx, shF.toIdx);
      const lenB = measureSeamArcLength(pieces[backIdx], shB.fromIdx, shB.toIdx);
      const diffCm = +(lenB - lenA).toFixed(2);
      pairs.push({
        id: 'shoulder',
        labelEn: 'Front ↔ Back Shoulder Seam',
        labelAr: 'خياطة الكتف (الأمام ↔ الخلف)',
        source: 'inferred',
        a: { pieceIdx: frontIdx, edge: shF },
        b: { pieceIdx: backIdx, edge: shB },
        bReversed: false,
        lenA: +lenA.toFixed(2),
        lenB: +lenB.toFixed(2),
        diffCm,
        status: Math.abs(diffCm) <= 0.45 ? 'ok' : (Math.abs(diffCm) <= 1.2 ? 'ease' : 'warn'),
      });
    }
    const sdF = inferEdgeCandidate(pieces[frontIdx], 'side');
    const sdB = inferEdgeCandidate(pieces[backIdx], 'side');
    if (sdF && sdB && !pairs.some((p) => /side/i.test(p.id))) {
      const lenA = measureSeamArcLength(pieces[frontIdx], sdF.fromIdx, sdF.toIdx);
      const lenB = measureSeamArcLength(pieces[backIdx], sdB.fromIdx, sdB.toIdx);
      const diffCm = +(lenB - lenA).toFixed(2);
      pairs.push({
        id: 'side_seam',
        labelEn: 'Front ↔ Back Side Seam',
        labelAr: 'خياطة الجنب (الأمام ↔ الخلف)',
        source: 'inferred',
        a: { pieceIdx: frontIdx, edge: sdF },
        b: { pieceIdx: backIdx, edge: sdB },
        bReversed: false,
        lenA: +lenA.toFixed(2),
        lenB: +lenB.toFixed(2),
        diffCm,
        status: Math.abs(diffCm) <= 0.5 ? 'ok' : (Math.abs(diffCm) <= 1.3 ? 'ease' : 'warn'),
      });
    }
    if (sleeveIdx >= 0) {
      const armF = inferEdgeCandidate(pieces[frontIdx], 'armhole');
      const slCap = inferEdgeCandidate(pieces[sleeveIdx], 'sleevecap');
      if (armF && slCap) {
        const lenF = measureSeamArcLength(pieces[frontIdx], armF.fromIdx, armF.toIdx);
        const armB = inferEdgeCandidate(pieces[backIdx], 'armhole');
        const lenB_arm = armB ? measureSeamArcLength(pieces[backIdx], armB.fromIdx, armB.toIdx) : lenF;
        const totalArmhole = +(lenF + lenB_arm).toFixed(2);
        const capLen = +measureSeamArcLength(pieces[sleeveIdx], slCap.fromIdx, slCap.toIdx).toFixed(2);
        const ease = +(capLen - totalArmhole).toFixed(2);
        pairs.push({
          id: 'armhole_sleeve_cap',
          labelEn: 'Armhole (F+B) ↔ Sleeve Cap Ease',
          labelAr: 'حردة الإبط (أمام+خلف) ↔ تشريب الكم',
          source: 'inferred',
          a: { pieceIdx: frontIdx, edge: armF },
          b: { pieceIdx: sleeveIdx, edge: slCap },
          bReversed: false,
          lenA: totalArmhole,
          lenB: capLen,
          diffCm: ease,
          status: ease >= -0.3 && ease <= 4.5 ? 'ease' : (Math.abs(ease) > 4.5 ? 'warn' : 'ok'),
        });
      }
    }
  }
  return pairs;
}
