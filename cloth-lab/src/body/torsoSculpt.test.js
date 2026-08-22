import { describe, it, expect } from 'vitest'
import { computeBodyDims, torsoProfile } from './computeBodyDims.js'
import { bumpWindow, femaleTorsoSculpt, torsoZBump, femaleTorsoExtraRadius } from './torsoSculpt.js'

const WOMEN_M = { chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 }

describe('bumpWindow', () => {
  it('peaks at 1 at its center and falls to exactly 0 by +-halfWidth', () => {
    expect(bumpWindow(5, 5, 2)).toBeCloseTo(1, 10)
    expect(bumpWindow(7, 5, 2)).toBeCloseTo(0, 10)
    expect(bumpWindow(9, 5, 2)).toBe(0) // outside the window entirely — not just close to 0
  })

  it('is symmetric around its center', () => {
    expect(bumpWindow(4, 5, 2)).toBeCloseTo(bumpWindow(6, 5, 2), 10)
  })
})

describe('torsoZBump', () => {
  const dims = computeBodyDims(WOMEN_M, 'women')

  it('the breast bump has a flat valley at phi=0 (the cleavage line), not one central mound', () => {
    const { breast } = femaleTorsoSculpt(dims)
    expect(torsoZBump(breast.centerY, 0, dims)).toBe(0)
    expect(torsoZBump(breast.centerY, breast.phi0, dims)).toBeGreaterThan(0)
    expect(torsoZBump(breast.centerY, -breast.phi0, dims)).toBeGreaterThan(0)
  })

  it('the two breast lobes are mirror-symmetric left/right', () => {
    const { breast } = femaleTorsoSculpt(dims)
    expect(torsoZBump(breast.centerY, breast.phi0, dims)).toBeCloseTo(torsoZBump(breast.centerY, -breast.phi0, dims), 10)
  })

  it('the breast bump is zero far outside its Y window (e.g. down at the hip)', () => {
    const { breast } = femaleTorsoSculpt(dims)
    expect(torsoZBump(dims.hipY, breast.phi0, dims)).toBe(0)
  })

  it('the lower-back curve pulls the waist IN and pushes the hip OUT, straight-back only', () => {
    const { lumbar, glute } = femaleTorsoSculpt(dims)
    // phi=PI is straight back; z there is negative (behind the axis) — a
    // positive dz means "less negative", i.e. pulled toward center.
    expect(torsoZBump(lumbar.centerY, Math.PI, dims)).toBeGreaterThan(0)
    expect(torsoZBump(glute.centerY, Math.PI, dims)).toBeLessThan(0)
  })

  it('neither back feature touches the front (phi=0)', () => {
    const { lumbar, glute } = femaleTorsoSculpt(dims)
    expect(torsoZBump(lumbar.centerY, 0, dims)).toBe(0)
    expect(torsoZBump(glute.centerY, 0, dims)).toBe(0)
  })

  it('the side seams (phi=+-PI/2) are always untouched, at every feature\'s own peak height', () => {
    const { breast, lumbar, glute } = femaleTorsoSculpt(dims)
    for (const y of [breast.centerY, lumbar.centerY, glute.centerY]) {
      expect(torsoZBump(y, Math.PI / 2, dims)).toBeCloseTo(0, 10)
      expect(torsoZBump(y, -Math.PI / 2, dims)).toBeCloseTo(0, 10)
    }
  })
})

// The actual safety property collisionRig.js depends on: at every height
// and angle sampled across the torso, the collision ellipse (base radius +
// femaleTorsoExtraRadius, squashed by zScale) sits on or outside the
// sculpted mesh surface — cloth resting exactly on the collision capsule
// can never end up INSIDE the visible breast/glute bulge. A different,
// finer sample grid than femaleTorsoExtraRadius's own internal one, so a
// mistake in one is unlikely to be invisible to the other.
describe('femaleTorsoExtraRadius', () => {
  const dims = computeBodyDims(WOMEN_M, 'women')
  const zScale = 0.72

  it('keeps the collision ellipse outside the sculpted mesh everywhere on the torso', () => {
    const profile = torsoProfile(dims)
    const minY = profile[0][1]
    const maxY = profile[profile.length - 1][1]
    // Piecewise-linear radius lookup, matching how deriveCollisionRig
    // interpolates between consecutive torsoProfile points.
    const radiusAt = (y) => {
      for (let i = 0; i < profile.length - 1; i++) {
        const [r0, y0] = profile[i]
        const [r1, y1] = profile[i + 1]
        if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0))
      }
      return y < minY ? profile[0][0] : profile[profile.length - 1][0]
    }
    let worstMargin = Infinity
    for (let yi = 0; yi <= 60; yi++) {
      const y = minY + ((maxY - minY) * yi) / 60
      const r = radiusAt(y)
      const extra = femaleTorsoExtraRadius(y, dims, zScale)
      for (let pi = 0; pi <= 100; pi++) {
        const phi = -Math.PI + (2 * Math.PI * pi) / 100
        const meshZ = r * zScale * Math.cos(phi) + torsoZBump(y, phi, dims)
        const collisionZ = (r + extra) * zScale * Math.cos(phi)
        // Only the outward-facing direction can ever be clipped through —
        // compare magnitudes, signed the same way as phi's own side.
        const margin = Math.cos(phi) >= 0 ? collisionZ - meshZ : meshZ - collisionZ
        if (margin < worstMargin) worstMargin = margin
      }
    }
    expect(worstMargin).toBeGreaterThanOrEqual(-1e-6) // never inside — floating-point slack only
  })

  it('is exactly 0 outside every feature\'s own Y window (no wasted collision margin)', () => {
    // Gap between the lumbar window's top edge (0.50) and the breast
    // window's bottom edge (0.59) — see femaleTorsoSculpt's own numbers.
    expect(femaleTorsoExtraRadius(dims.hipY + dims.span * 0.545, dims, 0.72)).toBe(0)
  })
})
