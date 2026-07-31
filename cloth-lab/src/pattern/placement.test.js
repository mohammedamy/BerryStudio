import { describe, it, expect } from 'vitest'
import { computeBodyDims } from '../body/computeBodyDims.js'
import { placeSleeve } from './placement.js'

const WOMEN_M = { chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 }

describe('placeSleeve', () => {
  it('mirrors the outward lean for both sides — a sleeve\'s |X| grows going down the arm on BOTH sides, not just one', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    // sample the sleeve-tube centerline (xCm=0) at increasing distance down the arm
    const samples = [0, 10, 20, 30, 40, 50].map((yCm) => [0, yCm])
    for (const side of [1, -1]) {
      const placed = placeSleeve(samples, dims, side)
      const xs = placed.map(([x]) => x)
      // every step further down the arm must move MORE outward (larger |X|),
      // never back in toward the centerline — this is what "hanging away
      // from the torso" means geometrically for a piece rolled into a tube.
      for (let i = 1; i < xs.length; i++) {
        expect(Math.abs(xs[i])).toBeGreaterThan(Math.abs(xs[i - 1]))
      }
      // and the sign of X must match `side` throughout (right sleeve stays
      // on the +X side, left sleeve stays on the -X side)
      for (const x of xs) expect(Math.sign(x)).toBe(side)
    }
  })

  it('left and right sleeves are exact mirror images of each other around x=0 (tube centerline)', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    // xCm=0 is the sleeve tube's own centerline seam, so this isolates the
    // shoulder-to-wrist lean (the bug) from the separate circumference-wrap
    // (xCm/phi) math, which isn't expected to mirror for arbitrary xCm since
    // a left/right sleeve pair isn't necessarily pre-mirrored in 2D pattern
    // space — placement is what's responsible for the left/right split.
    const samples = [[0, 0], [0, 15], [0, 30], [0, 45]]
    const right = placeSleeve(samples, dims, 1)
    const left = placeSleeve(samples, dims, -1)
    for (let i = 0; i < samples.length; i++) {
      expect(left[i][0]).toBeCloseTo(-right[i][0], 6) // X mirrored
      expect(left[i][1]).toBeCloseTo(right[i][1], 6)   // Y (height) identical
    }
  })
})
