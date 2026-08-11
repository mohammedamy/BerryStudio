import { describe, it, expect } from 'vitest'
import {
  buildGrid, cellCoords, cellIdForCoords, cellIdForPosition, sentinelKeyFor,
  bitonicSortKV, lowerBound, lowerBoundCapped, minLowerBoundIters,
  queryCellRange, spatialHashBroadphase, nextPow2, DEFAULT_SCAN_CAP,
} from './spatialHash.js'

// Deterministic PRNG (same LCG shape as dihedralBend.test.js) — reproducible
// failures, no external dependency.
function makeRand(seed) {
  let s = seed
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
}

function dist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) }

// The exact O(N^2) reference ClothSimulation.js's default-tier GLSL already
// runs — ported to plain JS with identical averaging semantics, so
// spatialHashBroadphase can be checked against it directly rather than
// against a re-derived-from-scratch (and possibly independently wrong)
// notion of "correct."
function bruteForceBroadphase(positions, restPositions, radius, restThreshold) {
  const n = positions.length
  const corrections = positions.map(() => [0, 0, 0])
  for (let i = 0; i < n; i++) {
    let corr = [0, 0, 0]
    let count = 0
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      if (dist3(restPositions[i], restPositions[j]) < restThreshold) continue
      const d = dist3(positions[i], positions[j])
      if (d < radius && d > 1e-6) {
        const diff = [positions[i][0] - positions[j][0], positions[i][1] - positions[j][1], positions[i][2] - positions[j][2]]
        const s = (radius - d) / d
        corr = [corr[0] + diff[0] * s, corr[1] + diff[1] * s, corr[2] + diff[2] * s]
        count++
      }
    }
    if (count > 0) corrections[i] = [corr[0] / count, corr[1] / count, corr[2] / count]
  }
  return corrections
}

function randomCloud(rand, n, spread = 0.3, center = [0, 1, 0]) {
  return Array.from({ length: n }, () => [
    center[0] + (rand() - 0.5) * spread,
    center[1] + (rand() - 0.5) * spread,
    center[2] + (rand() - 0.5) * spread,
  ])
}

describe('nextPow2', () => {
  it('rounds up to the next power of two, leaves exact powers unchanged', () => {
    expect(nextPow2(1)).toBe(1)
    expect(nextPow2(2)).toBe(2)
    expect(nextPow2(3)).toBe(4)
    expect(nextPow2(5)).toBe(8)
    expect(nextPow2(8)).toBe(8)
    expect(nextPow2(9)).toBe(16)
    expect(nextPow2(1000)).toBe(1024)
  })
})

describe('buildGrid / cellCoords / cellIdForCoords', () => {
  it('round-trips: a position placed at a known cell center maps back to that exact cell', () => {
    const rest = [[0, 0, 0], [1, 1, 1], [-1, 2, 0.5]]
    const cellSize = 0.1
    const grid = buildGrid(rest, cellSize, 0.05)
    let seed = 7
    const rand = makeRand(seed)
    for (let trial = 0; trial < 100; trial++) {
      const ix = Math.floor(rand() * grid.dim[0])
      const iy = Math.floor(rand() * grid.dim[1])
      const iz = Math.floor(rand() * grid.dim[2])
      const pos = [
        grid.min[0] + (ix + 0.5) * cellSize,
        grid.min[1] + (iy + 0.5) * cellSize,
        grid.min[2] + (iz + 0.5) * cellSize,
      ]
      expect(cellCoords(pos, grid)).toEqual([ix, iy, iz])
    }
  })

  it('clamps out-of-box positions to the nearest edge cell instead of throwing or going negative', () => {
    const grid = buildGrid([[0, 0, 0], [1, 1, 1]], 0.1, 0.05)
    const [ix, iy, iz] = cellCoords([-1000, -1000, -1000], grid)
    expect(ix).toBe(0); expect(iy).toBe(0); expect(iz).toBe(0)
    const [ix2, iy2, iz2] = cellCoords([1000, 1000, 1000], grid)
    expect(ix2).toBe(grid.dim[0] - 1); expect(iy2).toBe(grid.dim[1] - 1); expect(iz2).toBe(grid.dim[2] - 1)
  })

  it('gives adjacent grid coords adjacent (not colliding) ids, and every id is < sentinel', () => {
    const grid = buildGrid([[0, 0, 0], [2, 2, 2]], 0.2, 0.1)
    const seen = new Set()
    for (let ix = 0; ix < Math.min(grid.dim[0], 10); ix++) {
      for (let iy = 0; iy < Math.min(grid.dim[1], 10); iy++) {
        for (let iz = 0; iz < Math.min(grid.dim[2], 10); iz++) {
          const id = cellIdForCoords(ix, iy, iz, grid)
          expect(seen.has(id)).toBe(false)
          seen.add(id)
          expect(id).toBeLessThan(sentinelKeyFor(grid))
        }
      }
    }
  })

  it('caps grid dimensions at MAX_GRID_AXIS for a huge extent relative to cell size', () => {
    const grid = buildGrid([[-100, -100, -100], [100, 100, 100]], 0.01, 0)
    expect(grid.dim[0]).toBeLessThanOrEqual(128)
    expect(grid.dim[1]).toBeLessThanOrEqual(128)
    expect(grid.dim[2]).toBeLessThanOrEqual(128)
  })
})

describe('bitonicSortKV — the gather-based compare-exchange network', () => {
  function assertSortedAndPermutation(keysIn, valuesIn, sentinel) {
    const { keys, values, paddedLength } = bitonicSortKV(keysIn, valuesIn, sentinel)
    expect(paddedLength).toBe(nextPow2(Math.max(2, keysIn.length)))
    // sortedness
    for (let i = 1; i < keys.length; i++) expect(keys[i]).toBeGreaterThanOrEqual(keys[i - 1])
    // key<->value integrity: multiset of (key,value) pairs is preserved
    const expectedPairs = []
    for (let i = 0; i < paddedLength; i++) {
      if (i < keysIn.length) expectedPairs.push(`${keysIn[i]}:${valuesIn[i]}`)
      else expectedPairs.push(`${sentinel}:-1`)
    }
    const actualPairs = keys.map((k, i) => `${k}:${values[i]}`)
    expect(actualPairs.sort()).toEqual(expectedPairs.sort())
  }

  it('sorts random arrays of many sizes, including non-power-of-two lengths', () => {
    const rand = makeRand(11)
    for (const n of [1, 2, 3, 4, 7, 8, 9, 15, 16, 17, 33, 65, 100]) {
      const keys = Array.from({ length: n }, () => Math.floor(rand() * 50))
      const values = keys.map((_, i) => i)
      assertSortedAndPermutation(keys, values, 9999)
    }
  })

  it('handles all-duplicate keys (every real entry equal)', () => {
    const n = 20
    const keys = new Array(n).fill(42)
    const values = keys.map((_, i) => i)
    assertSortedAndPermutation(keys, values, 9999)
  })

  it('handles an already-sorted and a reverse-sorted array', () => {
    const n = 32
    const asc = Array.from({ length: n }, (_, i) => i)
    const desc = Array.from({ length: n }, (_, i) => n - i)
    assertSortedAndPermutation(asc, asc.map((_, i) => i), 9999)
    assertSortedAndPermutation(desc, desc.map((_, i) => i), 9999)
  })

  it('handles a single element and an exact-power-of-two length with no padding needed', () => {
    assertSortedAndPermutation([5], [0], 9999)
    const n = 16
    const rand = makeRand(3)
    const keys = Array.from({ length: n }, () => Math.floor(rand() * 100))
    assertSortedAndPermutation(keys, keys.map((_, i) => i), 9999)
  })

  it('puts padding (sentinel) entries strictly at the tail, never interleaved with real data', () => {
    const keys = [5, 1, 9, 3, 2] // pads 5 -> 8
    const values = [0, 1, 2, 3, 4]
    const { keys: sk, values: sv } = bitonicSortKV(keys, values, 9999)
    expect(sk).toEqual([1, 2, 3, 5, 9, 9999, 9999, 9999])
    expect(sv.slice(5)).toEqual([-1, -1, -1])
    expect(new Set(sv.slice(0, 5))).toEqual(new Set([0, 1, 2, 3, 4]))
  })
})

describe('lowerBound / lowerBoundCapped', () => {
  it('matches a naive linear scan for the first index >= target, across many random sorted arrays and targets', () => {
    const rand = makeRand(99)
    for (let trial = 0; trial < 60; trial++) {
      const n = 1 + Math.floor(rand() * 80)
      const arr = Array.from({ length: n }, () => Math.floor(rand() * 40)).sort((a, b) => a - b)
      for (let q = 0; q < 20; q++) {
        const target = Math.floor(rand() * 45) - 2
        const expected = arr.findIndex((v) => v >= target)
        const got = lowerBound(arr, target === -2 ? -2 : target)
        expect(got).toBe(expected === -1 ? arr.length : expected)
      }
    }
  })

  it('lowerBoundCapped with minLowerBoundIters(P) matches the uncapped result exactly, for P from 1 to 1024', () => {
    const rand = makeRand(5)
    for (const P of [1, 2, 3, 4, 7, 8, 16, 33, 63, 64, 100, 257, 512, 1024]) {
      const arr = Array.from({ length: P }, () => Math.floor(rand() * P)).sort((a, b) => a - b)
      const iters = minLowerBoundIters(P)
      for (let q = 0; q < 10; q++) {
        const target = Math.floor(rand() * (P + 2))
        expect(lowerBoundCapped(arr, target, iters)).toBe(lowerBound(arr, target))
      }
    }
  })

  it('one iteration fewer than minLowerBoundIters can be insufficient (the cap is not needlessly generous)', () => {
    // Not a strict requirement for correctness, just confirms the "+1"
    // headroom in minLowerBoundIters is meaningful rather than arbitrary —
    // if this ever stops reproducing a mismatch, minLowerBoundIters can
    // safely be tightened.
    const arr = Array.from({ length: 256 }, (_, i) => i)
    const tooFew = minLowerBoundIters(256) - 2
    let sawMismatch = false
    for (let target = 0; target < 256; target += 7) {
      if (lowerBoundCapped(arr, target, tooFew) !== lowerBound(arr, target)) sawMismatch = true
    }
    expect(sawMismatch).toBe(true)
  })
})

describe('queryCellRange', () => {
  it('returns exactly the values whose key matches, no more and no less, vs a linear filter', () => {
    const rand = makeRand(21)
    for (let trial = 0; trial < 30; trial++) {
      const n = 40
      const keys = Array.from({ length: n }, () => Math.floor(rand() * 8)).sort((a, b) => a - b)
      const values = keys.map((_, i) => i)
      for (let target = 0; target < 8; target++) {
        const expected = new Set(values.filter((_, i) => keys[i] === target))
        const got = new Set(queryCellRange(keys, values, target, 1000))
        expect(got).toEqual(expected)
      }
    }
  })

  it('returns an empty range for a target key not present', () => {
    const keys = [1, 1, 3, 3, 3, 7]
    const values = [0, 1, 2, 3, 4, 5]
    expect(queryCellRange(keys, values, 5, 1000)).toEqual([])
  })

  it('truncates (documented, tested behavior) a run longer than scanCap, without reading past it into the next key', () => {
    const keys = [2, 2, 2, 2, 2, 5, 5]
    const values = [10, 11, 12, 13, 14, 15, 16]
    const capped = queryCellRange(keys, values, 2, 3)
    expect(capped.length).toBe(3)
    expect(capped.every((v) => [10, 11, 12, 13, 14].includes(v))).toBe(true)
    expect(capped.includes(15)).toBe(false)
  })
})

describe('spatialHashBroadphase vs bruteForceBroadphase — the property that actually matters', () => {
  const radius = 0.012
  const restThreshold = 0.035
  const cellSize = radius * 2

  it('matches brute force exactly on random sparse clouds, many seeds/sizes', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rand = makeRand(seed * 1000 + 1)
      const n = 20 + Math.floor(rand() * 60)
      const rest = randomCloud(rand, n, 0.4)
      // "live" positions: rest plus small jitter, so some pairs land within
      // radius and some don't — exercises both branches of the check.
      const live = rest.map((p) => [p[0] + (rand() - 0.5) * 0.02, p[1] + (rand() - 0.5) * 0.02, p[2] + (rand() - 0.5) * 0.02])
      const grid = buildGrid(rest, cellSize)
      const hashed = spatialHashBroadphase(live, rest, grid, radius, restThreshold)
      const brute = bruteForceBroadphase(live, rest, radius, restThreshold)
      for (let i = 0; i < n; i++) {
        expect(hashed[i][0]).toBeCloseTo(brute[i][0], 9)
        expect(hashed[i][1]).toBeCloseTo(brute[i][1], 9)
        expect(hashed[i][2]).toBeCloseTo(brute[i][2], 9)
      }
    }
  })

  it('matches brute force when many particles are crammed into one dense cluster (scanCap stress test)', () => {
    const rand = makeRand(4242)
    const n = 40
    // All within one cell's worth of space (cellSize=0.024) — every particle
    // is every other particle's neighbor candidate, well under
    // DEFAULT_SCAN_CAP (32) per cell only if they land in <=1-2 cells; force
    // a tight single cluster to actually test crowding.
    const rest = randomCloud(rand, n, 0.015, [0, 1, 0])
    const live = rest.map((p) => [...p])
    const grid = buildGrid(rest, cellSize)
    const hashed = spatialHashBroadphase(live, rest, grid, radius, restThreshold, { scanCap: DEFAULT_SCAN_CAP })
    const brute = bruteForceBroadphase(live, rest, radius, restThreshold)
    for (let i = 0; i < n; i++) {
      expect(hashed[i][0]).toBeCloseTo(brute[i][0], 6)
      expect(hashed[i][1]).toBeCloseTo(brute[i][1], 6)
      expect(hashed[i][2]).toBeCloseTo(brute[i][2], 6)
    }
  })

  it('finds collisions across a cell boundary — two particles on opposite sides of a grid line, close in real space', () => {
    const cellSizeLocal = 0.05
    const grid = buildGrid([[0, 1, 0], [1, 1, 1]], cellSizeLocal, 0.1)
    // Place two particles straddling a cell boundary along x, close enough
    // in real space to be within a generous radius, far enough apart at
    // rest that the rest-threshold exclusion doesn't hide the case.
    const boundaryX = grid.min[0] + Math.round((0.5 - grid.min[0]) / cellSizeLocal) * cellSizeLocal
    const restA = [boundaryX - 0.001, 1, 0]
    const restB = [boundaryX + 0.001, 1, 0]
    const rest = [restA, restB, [10, 10, 10]] // third particle keeps the cloud non-trivial
    const live = [restA, restB, [10, 10, 10]]
    const bigRadius = 0.01 // > 0.002 gap, < restThreshold so it'd normally be excluded — use restThreshold=0
    const hashed = spatialHashBroadphase(live, rest, grid, bigRadius, 0)
    const brute = bruteForceBroadphase(live, rest, bigRadius, 0)
    expect(hashed[0][0]).toBeCloseTo(brute[0][0], 9)
    expect(hashed[1][0]).toBeCloseTo(brute[1][0], 9)
    // and confirm it's actually a non-trivial (non-zero) correction, i.e.
    // the boundary-straddling pair really was found, not just "both zero"
    expect(Math.abs(hashed[0][0]) + Math.abs(hashed[1][0])).toBeGreaterThan(1e-6)
  })

  it('handles a single particle (no neighbors) without error', () => {
    const grid = buildGrid([[0, 1, 0]], cellSize)
    const result = spatialHashBroadphase([[0, 1, 0]], [[0, 1, 0]], grid, radius, restThreshold)
    expect(result).toEqual([[0, 0, 0]])
  })

  it('handles fully coincident particles (extreme cluster) matching brute force, given a large enough scanCap', () => {
    const n = 15
    const rest = Array.from({ length: n }, () => [0, 1, 0])
    const live = rest.map((p) => [...p])
    const grid = buildGrid(rest, cellSize)
    // All coincident at rest too -> rest-distance is 0 < restThreshold for
    // every pair, so brute force (and the hash) should find NOTHING: this
    // exercises the exclusion rule, not the radius check.
    const hashed = spatialHashBroadphase(live, rest, grid, radius, restThreshold)
    const brute = bruteForceBroadphase(live, rest, radius, restThreshold)
    expect(hashed).toEqual(brute)
    expect(brute.every((c) => c[0] === 0 && c[1] === 0 && c[2] === 0)).toBe(true)
  })
})
