import { describe, it, expect } from 'vitest'
import { computeBodyDims, torsoProfile, armProfile, legProfile } from './computeBodyDims.js'

const WOMEN_M = { chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 }

describe('computeBodyDims', () => {
  it('converts height from cm to meters', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    expect(dims.H).toBeCloseTo(1.67, 5)
  })

  it('marks women/girls as female, men/boys as not', () => {
    expect(computeBodyDims(WOMEN_M, 'women').female).toBe(true)
    expect(computeBodyDims(WOMEN_M, 'girls').female).toBe(true)
    expect(computeBodyDims(WOMEN_M, 'men').female).toBe(false)
    expect(computeBodyDims(WOMEN_M, 'boys').female).toBe(false)
  })

  it('shoulderY sits above hipY (a taller point on the body)', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    expect(dims.shoulderY).toBeGreaterThan(dims.hipY)
  })
})

describe('WP-8.1 sleeve/inseam-driven limb length', () => {
  it('armLen tracks m.sleeve directly (cm -> m), not a height fraction', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    expect(dims.armLen).toBeCloseTo(0.58, 5) // WOMEN_M.sleeve = 58cm
  })

  it('legLen tracks m.inseam directly (cm -> m), not hipY', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    expect(dims.legLen).toBeCloseTo(0.78, 5) // WOMEN_M.inseam = 78cm
    expect(dims.legLen).not.toBeCloseTo(dims.hipY, 3)
  })

  it('two measurement sets with identical height but different sleeve/inseam produce different armLen/legLen', () => {
    const longLimbs = { ...WOMEN_M, sleeve: 64, inseam: 84 }
    const a = computeBodyDims(WOMEN_M, 'women')
    const b = computeBodyDims(longLimbs, 'women')
    expect(a.H).toBeCloseTo(b.H, 5)
    expect(b.armLen).toBeGreaterThan(a.armLen)
    expect(b.legLen).toBeGreaterThan(a.legLen)
  })

  it('falls back to the height-fraction formula when sleeve/inseam are missing or zero', () => {
    const noLimbData = { ...WOMEN_M, sleeve: 0, inseam: 0 }
    const dims = computeBodyDims(noLimbData, 'women')
    expect(dims.armLen).toBeCloseTo(dims.H * 0.44, 5)
    expect(dims.legLen).toBeCloseTo(dims.hipY, 5)
  })
})

describe('torsoProfile / armProfile / legProfile', () => {
  const dims = computeBodyDims(WOMEN_M, 'women')

  it('every profile point has a positive radius', () => {
    for (const [r] of torsoProfile(dims)) expect(r).toBeGreaterThan(0)
    for (const [r] of armProfile(dims)) expect(r).toBeGreaterThan(0)
    for (const [r] of legProfile(dims)) expect(r).toBeGreaterThan(0)
  })

  // Used to assert a STRICTLY monotonic taper (every consecutive point
  // narrower than the last) — that was the deliberate design at the time
  // (see armProfile's own header, then). Revisited for a more human
  // silhouette: both profiles now have a real, intentional bicep/thigh
  // swell and a knee/elbow pinch, so a strictly-decreasing sequence is no
  // longer the right property to assert. What still has to hold — and is
  // exactly what would break if a "subtle" swell stopped being subtle —
  // is checked in the two tests below instead.
  it('arm/leg profiles are overall widest at the shoulder/hip attachment and narrowest at the hand/ankle', () => {
    const arm = armProfile(dims)
    const armRadii = arm.map(([r]) => r)
    expect(arm[0][0]).toBe(Math.max(...armRadii))
    expect(arm[arm.length - 1][0]).toBe(Math.min(...armRadii))
    const leg = legProfile(dims)
    const legRadii = leg.map(([r]) => r)
    expect(leg[0][0]).toBe(Math.max(...legRadii))
    expect(leg[leg.length - 1][0]).toBe(Math.min(...legRadii))
  })

  it('the bicep/thigh swell stays subtle — narrower than the shoulder/hip attachment point, not a new widest point', () => {
    const arm = armProfile(dims)
    for (const [r] of arm.slice(1)) expect(r).toBeLessThan(arm[0][0])
    const leg = legProfile(dims)
    for (const [r] of leg.slice(1)) expect(r).toBeLessThan(leg[0][0])
  })

  it('arm/leg profiles start at y=0 (the shoulder/hip pivot) and descend', () => {
    const arm = armProfile(dims)
    expect(arm[0][1]).toBe(0)
    expect(arm[arm.length - 1][1]).toBeLessThan(0)
  })

  // pattern/placement.js and body/collisionRig.js each carry their OWN
  // hardcoded copy of these three (Y, radius) anchors rather than reading
  // torsoProfile() directly (grep either file for `0.44`/`0.76` to see
  // every site) — see torsoProfile()'s own header for why. This is the one
  // test that actually catches the two ever drifting apart: it doesn't
  // import from those files (avoiding a circular/coupled test), it just
  // pins torsoProfile()'s own three load-bearing points to the exact
  // values those files assume, so an edit to the curve that moves one of
  // THESE three points fails loudly here instead of silently mis-aligning
  // collision capsules or garment placement with the visible mesh.
  it('keeps the waist/chest/shoulder-base anchors other modules hardcode their own copies of', () => {
    const profile = torsoProfile(dims)
    const waist = profile.find(([, y]) => Math.abs(y - (dims.hipY + dims.span * 0.44)) < 1e-9)
    expect(waist).toBeDefined()
    expect(waist[0]).toBe(dims.waistR)
    const chest = profile.find(([, y]) => Math.abs(y - (dims.hipY + dims.span * 0.76)) < 1e-9)
    expect(chest).toBeDefined()
    expect(chest[0]).toBeCloseTo(dims.chestR * 0.98, 10) // women's multiplier — WOMEN_M is female
    const shoulderBase = profile.find(([, y]) => Math.abs(y - (dims.shoulderY - dims.span * 0.03)) < 1e-9)
    expect(shoulderBase).toBeDefined()
    expect(shoulderBase[0]).toBeCloseTo(dims.chestR * 0.9, 10) // women's multiplier
  })
})
