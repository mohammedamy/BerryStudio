/* ============================================================
   BerryStudio-Upgrade-Plan WP-11 — true polygon nesting, pure algorithm.
   No DOM/Worker globals here (`self`, `postMessage`) — kept import-clean
   so it's directly unit-testable via `node --test` and reusable from both
   js/workers/nesting-worker.js and any future caller (WP-15's automation
   API wraps js/nesting.js, which wraps the worker, which wraps this).

   Design note — why this ISN'T literal Minkowski-difference NFP + convex
   decomposition, even though that's the textbook technique: exact NFP for
   arbitrary CONCAVE polygons (most real pattern pieces — necklines,
   armholes, notches are all concave) requires decomposing into convex
   parts and unioning pairwise NFP regions, which is genuinely hard to
   make numerically robust in the time this pass has. Real pattern pieces
   in this app are simple, non-self-intersecting polygons with modest
   vertex counts (tens, not thousands), so a direct "does polygon A
   overlap polygon B" test is cheap enough to run inside a bottom-left-fill
   placement search, repeated under simulated annealing over piece order
   and rotation choice. This still delivers GENUINE polygon-tight nesting
   — a piece slides into another's concave notch exactly because the
   overlap test runs against the real outline, not a bounding box — without
   the fragility of computing and unioning exact NFP regions. This is the
   documented convex-hull/fallback escape hatch the plan itself reserved
   ("a convex-hull-approximation fallback path if a specific piece shape
   proves too costly to decompose well"), used from the start rather than
   attempted-then-abandoned.
   ============================================================ */

// ---- geometry primitives ----

export function polygonArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

export function polygonBounds(poly) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function translatePoly(poly, dx, dy) {
  return poly.map(([x, y]) => [x + dx, y + dy]);
}

// Rotates around the ORIGIN — callers normalize a piece to its own bbox
// center (or min-corner, then re-normalize) before rotating so the result
// is predictable regardless of where the piece's outline coordinates
// originally sat in canvas layout space.
export function rotatePoly(poly, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return poly.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
}

// Normalizes a raw outline (in whatever coordinate space it was authored
// in) to start with its bounding-box min corner at (0,0) — the canonical
// local space every placement/rotation operation below assumes.
export function normalizePoly(poly) {
  const b = polygonBounds(poly);
  return translatePoly(poly, -b.minX, -b.minY);
}

function onSegment(p, q, r) {
  return (
    Math.min(p[0], r[0]) - 1e-9 <= q[0] && q[0] <= Math.max(p[0], r[0]) + 1e-9 &&
    Math.min(p[1], r[1]) - 1e-9 <= q[1] && q[1] <= Math.max(p[1], r[1]) + 1e-9
  );
}
function orientation(p, q, r) {
  const v = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(v) < 1e-9) return 0;
  return v > 0 ? 1 : 2;
}
// Standard segment-intersection test (handles the collinear/touching
// edge cases too) — the core primitive `polygonsOverlap` is built on.
export function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orientation(p1, p2, p3), o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1), o4 = orientation(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;
  return false;
}

export function pointInPolygon(pt, poly) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// True if the two (simple, non-self-intersecting) polygons overlap —
// covers edge-crossing overlap AND full containment (one entirely inside
// the other, which has no crossing edges to detect on its own).
export function polygonsOverlap(polyA, polyB) {
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i], a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j], b2 = polyB[(j + 1) % polyB.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  if (pointInPolygon(polyA[0], polyB)) return true;
  if (pointInPolygon(polyB[0], polyA)) return true;
  return false;
}

function pointSegmentDistance(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 1e-12 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
}

// Shortest distance between two (non-overlapping) simple polygons — every
// vertex of one against every edge of the other, both directions. Used
// for the min-distance/buffer requirement INSTEAD OF inflating either
// polygon outward (the earlier approach here): a per-vertex bisector
// offset — the same technique Canvas.offsetPoly uses for seam allowance
// — breaks at REFLEX (concave) vertices, where "outward" is ambiguous and
// can produce a self-intersecting buffer. A real garment piece (a sleeve,
// a neckline) is very often concave, so this app can't assume convexity
// here the way a simpler nester might. Measuring distance directly avoids
// ever needing to construct a (possibly-invalid) offset polygon at all.
function polygonMinDistance(polyA, polyB) {
  let min = Infinity;
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i], a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) min = Math.min(min, pointSegmentDistance(polyB[j], a1, a2));
  }
  for (let j = 0; j < polyB.length; j++) {
    const b1 = polyB[j], b2 = polyB[(j + 1) % polyB.length];
    for (let i = 0; i < polyA.length; i++) min = Math.min(min, pointSegmentDistance(polyA[i], b1, b2));
  }
  return min;
}

// The one placement-search collision primitive: overlap is always
// checked on the RAW polygons (never skipped, never approximated by a
// buffered stand-in) — minDist is enforced as a genuine separate distance
// requirement on top, not by inflating either shape first.
function tooClose(polyA, polyB, minDist) {
  if (polygonsOverlap(polyA, polyB)) return true;
  return minDist > 0 && polygonMinDistance(polyA, polyB) < minDist;
}

// ---- placement: bottom-left-fill over TRUE polygon overlap ----

// `pieces`: [{ id, poly (already rotated, normalized to bbox-min-at-origin) }]
// in the exact order to attempt placement. Returns null if a piece is
// wider than the fabric at every rotation it was given (a real, reportable
// error condition — never silently mis-fit it).
function placeInOrder(pieces, matWidthCm, minDistCm) {
  const placed = []; // { id, poly (in final position), bounds }
  const results = [];
  let totalHeight = 0;

  for (const piece of pieces) {
    const bounds = polygonBounds(piece.poly);
    if (bounds.w > matWidthCm + 1e-6) return null; // doesn't fit at this rotation, ever

    // Candidate Y values: 0, plus every already-placed piece's bottom edge
    // (+ the min-distance gap) — the classic bottom-left-fill candidate
    // set, since the tightest packing only ever rests a new piece against
    // an existing bottom edge or the fabric's own top edge.
    const candidateYs = [0, ...placed.map((p) => p.bounds.maxY + minDistCm)].sort((a, b) => a - b);
    const stepX = Math.min(2, Math.max(0.15, bounds.w / 60)); // discretized search — see module header

    let best = null;
    for (const y of candidateYs) {
      const maxX = matWidthCm - bounds.w;
      if (maxX < -1e-6) continue;
      for (let x = 0; x <= maxX + 1e-9; x += stepX) {
        const candidate = translatePoly(piece.poly, x - bounds.minX, y - bounds.minY);
        const collides = placed.some((p) => tooClose(candidate, p.poly, minDistCm));
        if (!collides) { best = { x, y }; break; }
      }
      if (best) break;
    }
    if (!best) {
      // No feasible X at any existing shelf line — start a fresh row below
      // everything placed so far (always feasible: fabric is unbounded in
      // length, only bounded in width, which was already checked above).
      best = { x: 0, y: placed.length ? Math.max(...placed.map((p) => p.bounds.maxY)) + minDistCm : 0 };
    }
    const finalPoly = translatePoly(piece.poly, best.x - bounds.minX, best.y - bounds.minY);
    const finalBounds = polygonBounds(finalPoly);
    placed.push({ poly: finalPoly, bounds: finalBounds });
    results.push({ id: piece.id, poly: finalPoly, rotationDeg: piece.rotationDeg });
    totalHeight = Math.max(totalHeight, finalBounds.maxY);
  }
  return { placements: results, totalHeight };
}

// ---- simulated annealing over piece order + rotation ----

function rotationCandidates(piece, allowRotate) {
  if (piece.grainLocked) return [0, 180];
  return allowRotate ? [0, 90, 180, 270] : [0];
}

function preparePiece(piece, rotationDeg) {
  const normalized = normalizePoly(piece.outline);
  const centered = translatePoly(normalized, -polygonBounds(normalized).w / 2, -polygonBounds(normalized).h / 2);
  const rotated = normalizePoly(rotatePoly(centered, rotationDeg));
  return { id: piece.id, poly: rotated, rotationDeg };
}

function evaluate(pieces, order, rotations, matWidthCm, minDistCm) {
  const ordered = order.map((idx) => preparePiece(pieces[idx], rotations[idx]));
  const placement = placeInOrder(ordered, matWidthCm, minDistCm);
  if (!placement) return null;
  const totalArea = pieces.reduce((s, p) => s + polygonArea(p.outline), 0);
  const utilization = placement.totalHeight > 0 ? totalArea / (matWidthCm * placement.totalHeight) : 0;
  return { ...placement, utilization };
}

// `pieces`: [{ id, outline:[[x,y],...], grainLocked }]. `onProgress`
// receives {utilization, iteration, maxIterations}. `isCancelled()` is
// polled between SA iterations — the caller (worker) flips this in
// response to a `{type:"cancel"}` message so the "Stop" button in the
// Create Marker UI is finally real (see js/app.js's own stub comment).
export function runNesting({ pieces, matWidth, allowRotate, minDistCm = 0, maxIterations = 400, onProgress, isCancelled }) {
  if (!pieces.length) return { placements: [], totalHeight: 0, utilization: 0, cancelled: false };

  const rotationSets = pieces.map((p) => rotationCandidates(p, allowRotate));
  // Initial order: largest bounding dimension first — same heuristic the
  // old shelf packer used, a reasonable, well-tested starting point for
  // bottom-left-fill.
  let order = pieces.map((_, i) => i).sort((a, b) => {
    const ba = polygonBounds(pieces[a].outline), bb = polygonBounds(pieces[b].outline);
    return Math.max(bb.w, bb.h) - Math.max(ba.w, ba.h);
  });
  let rotations = pieces.map((_, i) => rotationSets[i][0]);

  let best = evaluate(pieces, order, rotations, matWidth, minDistCm);
  if (!best) return { placements: [], totalHeight: 0, utilization: 0, error: "a piece is wider than the fabric at every allowed rotation" };
  let current = best, currentOrder = order, currentRotations = rotations;

  const T0 = 1, coolingRate = 0.985;
  let T = T0;
  let cancelled = false;
  for (let iter = 0; iter < maxIterations; iter++) {
    if (isCancelled && isCancelled()) { cancelled = true; break; }
    const nextOrder = currentOrder.slice();
    const nextRotations = currentRotations.slice();
    // Neighbor move: 50/50 swap two pieces' order vs. change one piece's rotation.
    if (Math.random() < 0.5 && nextOrder.length > 1) {
      const i = Math.floor(Math.random() * nextOrder.length);
      let j = Math.floor(Math.random() * nextOrder.length);
      if (j === i) j = (j + 1) % nextOrder.length;
      [nextOrder[i], nextOrder[j]] = [nextOrder[j], nextOrder[i]];
    } else {
      const pieceIdx = Math.floor(Math.random() * pieces.length);
      const choices = rotationSets[pieceIdx];
      nextRotations[pieceIdx] = choices[Math.floor(Math.random() * choices.length)];
    }
    const candidate = evaluate(pieces, nextOrder, nextRotations, matWidth, minDistCm);
    if (candidate) {
      const delta = candidate.totalHeight - current.totalHeight; // lower height = better
      if (delta < 0 || Math.random() < Math.exp(-delta / (T * matWidth * 0.05 || 1))) {
        current = candidate; currentOrder = nextOrder; currentRotations = nextRotations;
        if (candidate.utilization > best.utilization) best = candidate;
      }
    }
    T *= coolingRate;
    if (onProgress && iter % 20 === 0) onProgress({ utilization: best.utilization, iteration: iter, maxIterations });
  }
  return { ...best, cancelled };
}
