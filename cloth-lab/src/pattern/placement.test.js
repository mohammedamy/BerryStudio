import { describe, it, expect } from 'vitest'
import { computeBodyDims } from '../body/computeBodyDims.js'
import { placeSleeve, placePiece } from './placement.js'

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

// pattern/importFromApp.js used to drop every same-slot piece after the
// first ("this pattern has more structure than the importer understands")
// — a real design with e.g. two independent darted front panels only ever
// showed one of them. It now recognizes all of them and tags the extras
// with a placementHint ({index, count}) so they don't all land on exactly
// the same spot; this is the placement half of that fix.
describe('placePiece — same-slot siblings (placementHint)', () => {
  const dims = computeBodyDims({ chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 }, 'women')
  const positions2D = [[0, 0], [10, 0], [10, 20], [0, 20]]

  it('a frontPanel with no placementHint places exactly as before (no regression)', () => {
    const withHint = placePiece({ pieceId: 'a', role: 'frontPanel', positions2D, placementHint: undefined }, dims)
    const noHintField = placePiece({ pieceId: 'a', role: 'frontPanel', positions2D }, dims)
    expect(withHint).toEqual(noHintField)
  })

  it('siblings at increasing index sit progressively further from the body than index 0', () => {
    const at = (index) => placePiece({ pieceId: 'a', role: 'frontPanel', positions2D, placementHint: { index, count: 3 } }, dims)
    const p0 = at(0), p1 = at(1), p2 = at(2)
    // Same (xCm,yCm)=(10,0) sample point on all three — compare their
    // distance from the body's own vertical axis (X=0,Z=0), which is what
    // "further out" means for a cylindrical-wrap placement.
    const distFromAxis = ([x, , z]) => Math.hypot(x, z)
    const d0 = distFromAxis(p0[1]), d1 = distFromAxis(p1[1]), d2 = distFromAxis(p2[1])
    expect(d1).toBeGreaterThan(d0)
    expect(d2).toBeGreaterThan(d1)
  })

  it('applies the same progressive separation to backPanel/hipPanelFront/hipPanelBack', () => {
    for (const role of ['backPanel', 'hipPanelFront', 'hipPanelBack']) {
      const at = (index) => placePiece({ pieceId: 'a', role, positions2D, placementHint: { index, count: 2 } }, dims)
      const distFromAxis = ([x, , z]) => Math.hypot(x, z)
      expect(distFromAxis(at(1)[1])).toBeGreaterThan(distFromAxis(at(0)[1]))
    }
  })

  it('does not affect roles with no torso-panel placement heuristic tied to placementHint, e.g. sleeve', () => {
    const samples = [[0, 0], [0, 15]]
    const withHint = placePiece({ pieceId: 'a_r', role: 'sleeve', positions2D: samples, placementHint: { index: 1, count: 2 } }, dims)
    const withoutHint = placeSleeve(samples, dims, 1)
    expect(withHint).toEqual(withoutHint)
  })
})
