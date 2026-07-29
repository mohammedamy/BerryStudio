import { describe, it, expect } from 'vitest'
import { computeBodyDims } from './computeBodyDims.js'
import { deriveCollisionRig, deriveShoulderPinSegments, deriveShoulderPinMask, deriveWaistbandPinRing, deriveWaistbandPinMask, MAX_COLLISION_CAPSULES } from './collisionRig.js'

const WOMEN_M = { chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 }

describe('deriveCollisionRig', () => {
  it('never exceeds MAX_COLLISION_CAPSULES', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    expect(deriveCollisionRig(dims).length).toBeLessThanOrEqual(MAX_COLLISION_CAPSULES)
  })
})

describe('deriveShoulderPinSegments', () => {
  it('returns one segment per side, mirrored around x=0', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const [left, right] = deriveShoulderPinSegments(dims)
    expect(left[0][0]).toBeLessThan(0) // left side is negative X
    expect(right[0][0]).toBeGreaterThan(0) // right side is positive X
    expect(left[0][0]).toBeCloseTo(-right[0][0], 5)
  })
})

describe('deriveShoulderPinMask', () => {
  it('pins a particle sitting exactly on the shoulder segment, not one far away', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const [, [innerR, outerR]] = deriveShoulderPinSegments(dims)
    // particle 0: exactly at the right shoulder's outer point (should be pinned)
    // particle 1: far away at the origin/floor (should not be pinned)
    const simRestPositions = new Float32Array([
      outerR[0], outerR[1], outerR[2],
      0, -10, 0,
    ])
    const mask = deriveShoulderPinMask(simRestPositions, 2, dims)
    expect(mask[0]).toBe(1)
    expect(mask[1]).toBe(0)
  })

  it('returns an all-zero mask when no particle is near a shoulder (e.g. a skirt-only garment)', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const simRestPositions = new Float32Array([0, -20, 0, 0.05, -20, 0])
    const mask = deriveShoulderPinMask(simRestPositions, 2, dims)
    expect(Array.from(mask)).toEqual([0, 0])
  })
})

describe('deriveWaistbandPinMask', () => {
  it('pins a particle sitting exactly on the waist ring, not one far away', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const { y, r } = deriveWaistbandPinRing(dims)
    // particle 0: exactly on the waist ring at angle 0 (should be pinned)
    // particle 1: far away at the origin/floor (should not be pinned)
    const simRestPositions = new Float32Array([
      r, y, 0,
      0, -10, 0,
    ])
    const mask = deriveWaistbandPinMask(simRestPositions, 2, dims)
    expect(mask[0]).toBe(1)
    expect(mask[1]).toBe(0)
  })

  it('does not pin a particle at the waist height but far outside the waist radius', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const { y, r } = deriveWaistbandPinRing(dims)
    const simRestPositions = new Float32Array([r + 0.3, y, 0])
    const mask = deriveWaistbandPinMask(simRestPositions, 1, dims)
    expect(mask[0]).toBe(0)
  })

  it('returns an all-zero mask when no particle is near the waist (e.g. a top-only garment)', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const simRestPositions = new Float32Array([0, 20, 0, 0.05, 20, 0])
    const mask = deriveWaistbandPinMask(simRestPositions, 2, dims)
    expect(Array.from(mask)).toEqual([0, 0])
  })
})
