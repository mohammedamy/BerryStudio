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

  it('arm/leg profiles taper monotonically from shoulder/hip toward the hand/ankle', () => {
    const arm = armProfile(dims)
    for (let i = 1; i < arm.length; i++) expect(arm[i][0]).toBeLessThanOrEqual(arm[i - 1][0])
    const leg = legProfile(dims)
    for (let i = 1; i < leg.length; i++) expect(leg[i][0]).toBeLessThanOrEqual(leg[i - 1][0])
  })

  it('arm/leg profiles start at y=0 (the shoulder/hip pivot) and descend', () => {
    const arm = armProfile(dims)
    expect(arm[0][1]).toBe(0)
    expect(arm[arm.length - 1][1]).toBeLessThan(0)
  })
})
