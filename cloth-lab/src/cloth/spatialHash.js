// WP-35b: GPU spatial hash for self-collision broadphase — a CPU reference
// implementation, verified by spatialHash.test.js's property-based tests,
// that ClothSimulation.js's GLSL port is a direct, mechanical translation
// of. Same rationale as dihedralBend.js (see that file's own header): the
// algorithm here — a sort-based uniform grid, the standard technique for
// building per-cell particle lists on hardware with no compute-shader
// atomics/scatter-write access (see BerryStudio-Upgrade-Plan-v3-2.md §5) —
// is verified as plain JS, including the SORT NETWORK ITSELF (not
// `Array.sort`), before it's ever debugged inside a GPU fragment shader.
//
// The shape of the technique: assign every particle a `cellId` from its
// current position in a fixed uniform grid, sort (cellId, particleIndex)
// pairs by cellId, then a particle's neighbor CANDIDATES are found by
// binary-searching the sorted array for each of the 27 surrounding cells'
// index ranges and scanning within them — no per-cell index list ever has
// to be built by scatter-writing into it, which is the part plain WebGL2
// genuinely cannot do. This is the "sort-based uniform grid" approach
// (Green, *Particle Simulation using CUDA*, §4; the same shape has been
// used in pre-compute-shader GPGPU particle sims for exactly this reason).
//
// `bitonicSortKV` below is deliberately NOT `Array.prototype.sort` — it's
// written as the exact GATHER-based compare-exchange network a GPU fragment
// shader has to use (every output slot independently reads BOTH its own and
// its pass-partner's PREVIOUS-pass value and picks one — never mutates a
// shared array in place, since a fragment shader can only write its own
// output pixel). Verifying this specific network, not just "the array ends
// up sorted," is the point: the GLSL port is a line-for-line translation of
// this function's inner loop, so a bug here is a bug there.

// Cell grid capped per axis so total cell-id range stays comfortably inside
// float32's exact-integer range (2^24) even for a generously-margined,
// fine-grained grid: 128^3 = 2,097,152, two orders of magnitude under that
// ceiling with room to spare for the sentinel (see buildGrid below).
export const MAX_GRID_AXIS = 128

export function nextPow2(n) {
  let p = 1
  while (p < n) p <<= 1
  return p
}

function clampInt(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }

// Rest-pose AABB, expanded by `margin` on every side, quantized into a
// uniform grid of `cellSize`-sided cubes (capped at MAX_GRID_AXIS per
// axis — see above). Built ONCE from the garment's REST pose, not the live
// simulated one: the grid only has to be big enough to contain realistic
// drape/fall motion, and a fixed grid (computed once, at construction, from
// data already on the CPU) is a deliberately simpler and cheaper choice than
// a per-frame GPU min/max reduction over live positions — see this module's
// own README/CHANGELOG entry for the tradeoff this makes: a particle that
// somehow ends up outside the margined box (an unrelated physics bug, not
// self-collision's own doing) gets clamped into an edge cell rather than
// crashing or throwing, at the cost of self-collision becoming approximate
// for that one particle until it re-enters the grid.
export function buildGrid(restPositions, cellSize, margin = cellSize * 4) {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const p of restPositions) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]
    if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]
    if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2]
  }
  const min = [minX - margin, minY - margin, minZ - margin]
  const extent = [
    (maxX - minX) + 2 * margin,
    (maxY - minY) + 2 * margin,
    (maxZ - minZ) + 2 * margin,
  ]
  const dim = extent.map((e) => clampInt(Math.ceil(e / cellSize), 1, MAX_GRID_AXIS))
  return { min, cellSize, dim }
}

// Clamped, not wrapped or rejected — see buildGrid's header on why an
// out-of-box particle degrades gracefully instead of erroring.
export function cellCoords(pos, grid) {
  const ix = clampInt(Math.floor((pos[0] - grid.min[0]) / grid.cellSize), 0, grid.dim[0] - 1)
  const iy = clampInt(Math.floor((pos[1] - grid.min[1]) / grid.cellSize), 0, grid.dim[1] - 1)
  const iz = clampInt(Math.floor((pos[2] - grid.min[2]) / grid.cellSize), 0, grid.dim[2] - 1)
  return [ix, iy, iz]
}

// Row-major linear id — same flattening convention ClothSimulation.js
// already uses for its own particle-index<->texel mapping
// (`flatIdx = y*resolution.x + x`), so both this module and the GLSL port
// share one mental model of "flatten 3 (or 2) integer coords into 1 id."
export function cellIdForCoords(ix, iy, iz, grid) {
  return ix + iy * grid.dim[0] + iz * grid.dim[0] * grid.dim[1]
}

export function cellIdForPosition(pos, grid) {
  const [ix, iy, iz] = cellCoords(pos, grid)
  return cellIdForCoords(ix, iy, iz, grid)
}

// The largest real cell id plus one — every real id is strictly less than
// this by construction (ids run 0..dim[0]*dim[1]*dim[2]-1), so it sorts
// strictly after every real entry: exactly what padding slots (the
// difference between the input length and the next-power-of-two the sort
// needs) must do to land at the tail and never get treated as a real,
// matchable cell.
export function sentinelKeyFor(grid) {
  return grid.dim[0] * grid.dim[1] * grid.dim[2]
}

// The sort network itself — see this module's header for why it's written
// as a gather, not an in-place swap. `keysIn`/`valuesIn` need not be a
// power-of-two length; padding slots get `sentinelKey`/-1 (matching the
// `idx < -0.5` "no neighbor" convention ClothSimulation.js's other packed
// textures already use throughout this codebase).
//
// Standard bitonic sort indexing: for block size `k` (2,4,8,...,P) and
// sub-stride `j` (k/2, k/4, ..., 1), each slot `i` pairs with `i XOR j`.
// Sort direction alternates by `k`-sized block (`(i & k) === 0` -> the
// block ending at (and including) index i sorts ascending); within a pass,
// the LOWER-INDEXED half of each pair (`i < ixj`) always ends up holding
// whichever value keeps that block's chosen direction, the higher-indexed
// half holds the other — this is the textbook bitonic merge network
// (Batcher, 1968), unchanged in substance for 60 years, just expressed here
// as "what does MY slot compute" instead of "swap this pair" so it maps
// 1:1 onto a fragment shader that can only write its own output pixel.
export function bitonicSortKV(keysIn, valuesIn, sentinelKey) {
  const n = keysIn.length
  const P = nextPow2(Math.max(2, n))
  let keys = new Array(P)
  let values = new Array(P)
  for (let i = 0; i < P; i++) {
    if (i < n) { keys[i] = keysIn[i]; values[i] = valuesIn[i] }
    else { keys[i] = sentinelKey; values[i] = -1 }
  }
  for (let k = 2; k <= P; k <<= 1) {
    for (let j = k >> 1; j > 0; j >>= 1) {
      const newKeys = new Array(P)
      const newValues = new Array(P)
      for (let i = 0; i < P; i++) {
        const ixj = i ^ j
        const ascending = (i & k) === 0
        const iIsLow = i < ixj
        const mineKey = keys[i], mineVal = values[i]
        const partnerKey = keys[ixj], partnerVal = values[ixj]
        let takeMine
        if (iIsLow) takeMine = ascending ? mineKey <= partnerKey : mineKey >= partnerKey
        else takeMine = ascending ? mineKey >= partnerKey : mineKey <= partnerKey
        newKeys[i] = takeMine ? mineKey : partnerKey
        newValues[i] = takeMine ? mineVal : partnerVal
      }
      keys = newKeys
      values = newValues
    }
  }
  return { keys, values, paddedLength: P }
}

// First index where `keys[index] >= target` — standard lower-bound binary
// search. A `while` loop is fine on the CPU; the GLSL port has to use a
// FIXED iteration count instead (GLSL loop bounds must be compile-time
// constants), which is exactly what `lowerBoundCapped` below exists to
// verify is still correct for a realistic P.
export function lowerBound(keys, target) {
  let lo = 0, hi = keys.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (keys[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

// Same search, but capped at `maxIters` loop iterations regardless of
// whether `lo === hi` already — models exactly what the GLSL port's
// fixed-trip-count `for` loop does (it keeps "iterating" a no-op once
// converged, rather than breaking out of a variable-length loop). Exists so
// a test can confirm `maxIters = ceil(log2(P)) + 1` (the value
// ClothSimulation.js's shader source will actually compile in) is
// sufficient for every P this module can produce — catching a cap-too-small
// bug here, in a failing Vitest assertion, instead of as silently-wrong
// self-collision in a running GPU shader.
export function lowerBoundCapped(keys, target, maxIters) {
  let lo = 0, hi = keys.length
  for (let iter = 0; iter < maxIters; iter++) {
    const mid = (lo + hi) >> 1
    if (lo >= hi) continue // already converged — matches the GLSL port's no-op-once-done shape
    if (keys[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

// Minimum `maxIters` guaranteed sufficient for a sorted array of length P —
// one more than ceil(log2(P)), matching lowerBoundCapped's "converge, then
// one more no-op pass" shape above.
export function minLowerBoundIters(P) {
  return Math.ceil(Math.log2(Math.max(2, P))) + 1
}

// All values whose key equals `targetKey`, starting from `lowerBound` and
// scanning forward — capped at `scanCap` entries so a pathologically
// overcrowded cell (many particles balled into one cell) can't make a
// single query unbounded. This mirrors the GLSL port's own bounded scan
// loop exactly (same reason as lowerBoundCapped: GLSL needs a compile-time
// loop bound). spatialHash.test.js's cell-crowding tests exist specifically
// to confirm the chosen scanCap is generous enough for this app's actual
// particle density (see DEFAULT_SCAN_CAP below) that this bound is never
// actually hit in realistic garment simulation — silently dropping matches
// beyond the cap would be a real, not-hard-to-hit correctness bug if it
// were too small.
export function queryCellRange(keys, values, targetKey, scanCap) {
  const start = lowerBound(keys, targetKey)
  const found = []
  for (let i = start; i < keys.length && i < start + scanCap; i++) {
    if (keys[i] !== targetKey) break
    found.push(values[i])
  }
  return found
}

function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
function scale3(a, s) { return [a[0] * s, a[1] * s, a[2] * s] }
function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
function dist3(a, b) { const d = sub3(a, b); return Math.hypot(d[0], d[1], d[2]) }

// 1.2cm push-apart radius, 3.5cm rest-space exclusion by default, same
// numbers ClothSimulation.js's DEFAULT_SELF_COLLISION already uses.
// cellSize = 2x radius keeps average per-cell occupancy low for this app's
// ~2cm Delaunay triangulation spacing (see triangulate.js) — most cells
// hold 0-2 particles in normal drape, which is what makes the 27-neighbor
// binary-search approach an actual win over brute force (see
// ClothSimulation.js's wiring for the measured comparison).
export const DEFAULT_SCAN_CAP = 32

// Full broadphase: for every particle, average the push-apart correction
// from every OTHER particle within `radius` (excluding ones close in REST
// space — normal local fabric, not a self-fold) found via the 27-cell
// spatial-hash neighborhood instead of a brute-force scan over every other
// particle. Mirrors ClothSimulation.js's `selfCollisionCorrection` GLSL
// function's averaging semantics exactly (same accumulate-then-divide-by-
// count shape) — this function IS the spec that GLSL function is a
// mechanical port of.
export function spatialHashBroadphase(positions, restPositions, grid, radius, restThreshold, { scanCap = DEFAULT_SCAN_CAP } = {}) {
  const n = positions.length
  const keys = new Array(n)
  const values = new Array(n)
  for (let i = 0; i < n; i++) {
    keys[i] = cellIdForPosition(positions[i], grid)
    values[i] = i
  }
  const sentinel = sentinelKeyFor(grid)
  const sorted = bitonicSortKV(keys, values, sentinel)

  const corrections = positions.map(() => [0, 0, 0])
  for (let i = 0; i < n; i++) {
    const [ix, iy, iz] = cellCoords(positions[i], grid)
    let corr = [0, 0, 0]
    let count = 0
    for (let dz = -1; dz <= 1; dz++) {
      const nz = iz + dz
      if (nz < 0 || nz >= grid.dim[2]) continue
      for (let dy = -1; dy <= 1; dy++) {
        const ny = iy + dy
        if (ny < 0 || ny >= grid.dim[1]) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = ix + dx
          if (nx < 0 || nx >= grid.dim[0]) continue
          const targetId = cellIdForCoords(nx, ny, nz, grid)
          const candidates = queryCellRange(sorted.keys, sorted.values, targetId, scanCap)
          for (const j of candidates) {
            if (j === i || j < 0) continue
            if (dist3(restPositions[i], restPositions[j]) < restThreshold) continue
            const d = dist3(positions[i], positions[j])
            if (d < radius && d > 1e-6) {
              const diff = sub3(positions[i], positions[j])
              corr = add3(corr, scale3(diff, (radius - d) / d))
              count++
            }
          }
        }
      }
    }
    if (count > 0) corrections[i] = scale3(corr, 1 / count)
  }
  return corrections
}
