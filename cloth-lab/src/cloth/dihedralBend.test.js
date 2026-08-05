import { describe, it, expect } from 'vitest'
import { dihedralAngle, dihedralBendCorrection } from './dihedralBend.js'

// A simple hinge: edge along Y, p3 in the XY plane out to +X, p4 rotated by
// `wingSpread` around the Y axis from p3's position — lets every test below
// build an exact, hand-verifiable hinge shape instead of an opaque fixture.
// `wingSpread` is the angle BETWEEN THE TWO WING VECTORS (p3-p1, p4-p1),
// not the dihedral angle itself — dihedralAngle measures the angle between
// the two triangles' SURFACES, which is that same hinge folded shut
// (wingSpread=0, both wings pointing the same way) at dihedralAngle=+-PI,
// and fully open into one flat surface (wingSpread=PI, wings pointing
// opposite ways) at dihedralAngle~0. Confirmed against assemble.test.js's
// independent fixture (built from real triangle winding, not this
// parameterization) landing on the same ~0-for-flat reading.
function makeHinge(wingSpread, wingLen = 1) {
  const p1 = [0, -0.5, 0]
  const p2 = [0, 0.5, 0]
  const p3 = [wingLen, 0, 0]
  const p4 = [wingLen * Math.cos(wingSpread), 0, wingLen * Math.sin(wingSpread)]
  return { p1, p2, p3, p4 }
}

describe('dihedralAngle', () => {
  it('is ~0 for a flat (unfolded) hinge — wings spread PI apart, forming one flat surface', () => {
    const { p1, p2, p3, p4 } = makeHinge(Math.PI)
    expect(dihedralAngle(p1, p2, p3, p4)).toBeCloseTo(0, 6)
  })

  it('reads +-PI/2 for a hinge folded to a right angle, with a consistent sign per fold direction', () => {
    // The sign is this function's own internal convention (a mirror-image
    // hinge reads the opposite sign of its mirror) — what matters for
    // dihedralBendCorrection is that the SAME convention is used
    // consistently for both the rest-angle measurement and every runtime
    // measurement, which the convergence tests below verify directly.
    const pos = makeHinge(Math.PI / 2)
    const neg = makeHinge(-Math.PI / 2)
    expect(Math.abs(dihedralAngle(pos.p1, pos.p2, pos.p3, pos.p4))).toBeCloseTo(Math.PI / 2, 6)
    expect(dihedralAngle(neg.p1, neg.p2, neg.p3, neg.p4)).toBeCloseTo(-dihedralAngle(pos.p1, pos.p2, pos.p3, pos.p4), 6)
  })

  it('reads ~PI for a hinge folded shut (wings pointing the same way)', () => {
    const { p1, p2, p3, p4 } = makeHinge(1e-3)
    expect(Math.abs(dihedralAngle(p1, p2, p3, p4))).toBeCloseTo(Math.PI, 2)
  })

  it('is invariant to sliding p3/p4 along the edge direction (only the fold angle matters)', () => {
    const { p1, p2, p3, p4 } = makeHinge(0.7)
    const shift = [0, 0.2, 0]
    const a1 = dihedralAngle(p1, p2, p3, p4)
    const a2 = dihedralAngle(p1, p2, [p3[0], p3[1] + shift[1], p3[2]], p4)
    expect(a2).toBeCloseTo(a1, 6)
  })

  it('returns null for a degenerate hinge (wing vertex sitting on the edge line)', () => {
    const p1 = [0, -0.5, 0], p2 = [0, 0.5, 0]
    expect(dihedralAngle(p1, p2, [0, 0, 0], [1, 0, 0])).toBeNull()
    expect(dihedralAngle(p1, p1, [1, 0, 0], [0, 1, 0])).toBeNull() // zero-length edge
  })
})

describe('dihedralBendCorrection — convergence (the property that actually matters)', () => {
  it('reduces |angle - restAngle| for a hinge starting MORE folded than rest', () => {
    const rest = 0.2
    let { p1, p2, p3, p4 } = makeHinge(1.1)
    let prevErr = Math.abs(dihedralAngle(p1, p2, p3, p4) - rest)
    for (let i = 0; i < 30; i++) {
      const r = dihedralBendCorrection(p1, p2, p3, p4, rest, 0.5)
      p3 = r.p3; p4 = r.p4
      const err = Math.abs(dihedralAngle(p1, p2, p3, p4) - rest)
      expect(err).toBeLessThanOrEqual(prevErr + 1e-9) // never gets WORSE
      prevErr = err
    }
    expect(prevErr).toBeLessThan(1e-4) // and actually converges to ~rest
  })

  it('reduces |angle - restAngle| for a hinge starting LESS folded than rest (opposite direction)', () => {
    const rest = 1.3
    let { p1, p2, p3, p4 } = makeHinge(0.1)
    let prevErr = Math.abs(dihedralAngle(p1, p2, p3, p4) - rest)
    for (let i = 0; i < 30; i++) {
      const r = dihedralBendCorrection(p1, p2, p3, p4, rest, 0.5)
      p3 = r.p3; p4 = r.p4
      const err = Math.abs(dihedralAngle(p1, p2, p3, p4) - rest)
      expect(err).toBeLessThanOrEqual(prevErr + 1e-9)
      prevErr = err
    }
    expect(prevErr).toBeLessThan(1e-4)
  })

  it('converges from a negative fold toward a positive rest angle (crosses zero)', () => {
    const rest = 0.9
    let { p1, p2, p3, p4 } = makeHinge(-0.6)
    for (let i = 0; i < 40; i++) {
      const r = dihedralBendCorrection(p1, p2, p3, p4, rest, 0.4)
      p3 = r.p3; p4 = r.p4
    }
    expect(dihedralAngle(p1, p2, p3, p4)).toBeCloseTo(rest, 3)
  })

  it('takes the short way around the +-PI wraparound instead of the long way', () => {
    // rest and current are only ~0.28 rad apart going THROUGH +-PI, but
    // ~6.0 rad apart the naive (non-wrapped) way — must converge fast.
    const rest = 3.0
    let { p1, p2, p3, p4 } = makeHinge(-3.0)
    for (let i = 0; i < 10; i++) {
      const r = dihedralBendCorrection(p1, p2, p3, p4, rest, 0.5)
      p3 = r.p3; p4 = r.p4
    }
    expect(Math.abs(dihedralAngle(p1, p2, p3, p4))).toBeGreaterThan(2.9) // near +-PI either sign
  })

  it('leaves an already-at-rest hinge unchanged (zero-error is a true fixed point)', () => {
    const { p1, p2, p3, p4 } = makeHinge(0.55)
    const rest = dihedralAngle(p1, p2, p3, p4) // whatever this exact hinge actually measures as
    const r = dihedralBendCorrection(p1, p2, p3, p4, rest, 0.5)
    expect(r.p3[0]).toBeCloseTo(p3[0], 9); expect(r.p3[1]).toBeCloseTo(p3[1], 9); expect(r.p3[2]).toBeCloseTo(p3[2], 9)
    expect(r.p4[0]).toBeCloseTo(p4[0], 9); expect(r.p4[1]).toBeCloseTo(p4[1], 9); expect(r.p4[2]).toBeCloseTo(p4[2], 9)
  })

  it('never moves p3/p4 off their fixed distance from the hinge line (pure rotation, no stretch/shear)', () => {
    const { p1, p2, p3, p4 } = makeHinge(1.0)
    const distToLine = (p) => {
      // distance from p to the infinite line through p1 in direction (p2-p1)
      const e = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
      const elen = Math.hypot(...e)
      const eu = e.map((c) => c / elen)
      const v = [p[0] - p1[0], p[1] - p1[1], p[2] - p1[2]]
      const proj = v[0] * eu[0] + v[1] * eu[1] + v[2] * eu[2]
      const closest = eu.map((c) => c * proj)
      return Math.hypot(v[0] - closest[0], v[1] - closest[1], v[2] - closest[2])
    }
    const before3 = distToLine(p3), before4 = distToLine(p4)
    const r = dihedralBendCorrection(p1, p2, p3, p4, 0.0, 0.9)
    expect(distToLine(r.p3)).toBeCloseTo(before3, 6)
    expect(distToLine(r.p4)).toBeCloseTo(before4, 6)
  })

  it('property check across many random fold/rest combinations: error strictly shrinks toward 0', () => {
    let seed = 42
    const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    for (let trial = 0; trial < 40; trial++) {
      const fold = (rand() - 0.5) * 2 * (Math.PI - 0.05)
      const rest = (rand() - 0.5) * 2 * (Math.PI - 0.05)
      let { p1, p2, p3, p4 } = makeHinge(fold)
      let err0 = Math.abs(dihedralAngle(p1, p2, p3, p4) - rest)
      if (err0 > Math.PI) err0 = 2 * Math.PI - err0
      for (let i = 0; i < 25; i++) {
        const r = dihedralBendCorrection(p1, p2, p3, p4, rest, 0.5)
        p3 = r.p3; p4 = r.p4
      }
      let errN = Math.abs(dihedralAngle(p1, p2, p3, p4) - rest)
      if (errN > Math.PI) errN = 2 * Math.PI - errN
      expect(errN).toBeLessThan(Math.max(0.02, err0 * 0.1))
    }
  })

  it('returns null (no correction) for a degenerate hinge, never NaN', () => {
    const p1 = [0, -0.5, 0], p2 = [0, 0.5, 0]
    expect(dihedralBendCorrection(p1, p2, [0, 0, 0], [1, 0, 0], 0, 0.5)).toBeNull()
  })
})
