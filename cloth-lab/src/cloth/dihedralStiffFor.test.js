import { describe, it, expect } from 'vitest'
import { dihedralStiffFor, DIHEDRAL_MAX_DELTA } from './ClothSimulation.js'
import { FABRIC_PRESETS, FABRIC_IDS } from './fabricPresets.js'
import { dihedralAngle, dihedralBendCorrection } from './dihedralBend.js'

// Regression test for a real, user-reported bug that took THREE passes to
// actually fix — see ClothSimulation.js's dihedralStiffFor() for the full
// story of what each report meant and why the previous two attempts
// weren't enough:
//   1. "crazy things happen" — uDihedralStiff read fabric.bendStiff
//      (0.06-0.92) completely unclamped; genuinely explosive.
//   2. "still crazy" — clamped stiffness at 0.5 (a single hinge's own
//      proven-safe convergence value). Still exploded once many hinges
//      shared vertices and corrected in parallel every substep.
//   3. "better but still useless" — re-clamped at 0.12. Stable, but at
//      that stiffness a hinge starting far from rest (every hinge, right
//      after a fresh drape) only ever creeps toward its target and the
//      garment settles before the constraint visibly does anything — the
//      High tier's whole reason to exist (sharper folds than the default
//      tier) never showed up in the render.
//
// The actual fix: stop capping `stiffness` uniformly and instead cap the
// ROTATION ITSELF per substep (`maxDelta`, independent of stiffness) —
// dihedralStiffFor() now returns the fabric's real bendStiff, uncapped,
// and DIHEDRAL_MAX_DELTA bounds how far any single correction can turn a
// wing vertex regardless of how large stiffness*error would otherwise be.
// Live-verified with Denim and Leather (bendStiff 0.80 and 0.92) on the
// High tier: stable over 20+ seconds AND visibly crisper fold lines than
// the default tier — not the same flat drape the second-pass fix produced.
describe('dihedralStiffFor', () => {
  it('returns the fabric\'s real bendStiff, uncapped — stability now comes from DIHEDRAL_MAX_DELTA, not from suppressing this', () => {
    for (const id of FABRIC_IDS) {
      expect(dihedralStiffFor(FABRIC_PRESETS[id])).toBe(FABRIC_PRESETS[id].bendStiff)
    }
    // Non-vacuous: several real presets are well above the old 0.12/0.5
    // clamps this fix replaces — confirms nothing is silently suppressing
    // them any more.
    expect(dihedralStiffFor(FABRIC_PRESETS.leather)).toBeGreaterThan(0.5)
  })

  it('respects an explicit fabric.dihedralStiff override', () => {
    expect(dihedralStiffFor({ bendStiff: 0.9, dihedralStiff: 0.1 })).toBe(0.1)
    expect(dihedralStiffFor({ bendStiff: 0.05, dihedralStiff: 0.9 })).toBe(0.9)
  })
})

describe('DIHEDRAL_MAX_DELTA', () => {
  it('is a small, positive number of radians (a per-substep rotation cap, not an angle in degrees or a stiffness fraction)', () => {
    expect(DIHEDRAL_MAX_DELTA).toBeGreaterThan(0)
    expect(DIHEDRAL_MAX_DELTA).toBeLessThan(Math.PI / 4) // well under a 45 degree single-substep swing
  })

  it('caps a single correction\'s rotation for a huge initial error, even at the highest real fabric stiffness (leather)', () => {
    const p1 = [0, 0, 0], p2 = [1, 0, 0]
    // A hinge starting ~150 degrees from its rest angle of 0 — exactly the
    // kind of large excursion a fresh drape produces on its first frames,
    // the case that caused the coupled-hinge explosion in the first two
    // fix attempts. dihedralAngle's convention (verified in
    // dihedralBend.test.js and directly above in a scratch check): this
    // p3/p4 construction's MEASURED angle is (180 - foldDeg), so foldDeg=30
    // is what actually produces a ~150 degree starting error.
    const foldRad = (30 * Math.PI) / 180
    const p3 = [0.5, 0, 1]
    const p4 = [0.5, Math.sin(foldRad), Math.cos(foldRad)]
    const restRad = 0
    const stiffness = FABRIC_PRESETS.leather.bendStiff // 0.92 — highest real preset, now unclamped

    const angleBefore = dihedralAngle(p1, p2, p3, p4)
    const uncapped = dihedralBendCorrection(p1, p2, p3, p4, restRad, stiffness) // maxDelta defaults to PI (unclamped)
    const capped = dihedralBendCorrection(p1, p2, p3, p4, restRad, stiffness, DIHEDRAL_MAX_DELTA)

    const movedUncapped = Math.abs(dihedralAngle(p1, p2, uncapped.p3, uncapped.p4) - angleBefore)
    const movedCapped = Math.abs(dihedralAngle(p1, p2, capped.p3, capped.p4) - angleBefore)

    // Without the cap, 0.92 stiffness on a huge error swings the angle far
    // in one call — this is what "crazy things happen" actually was.
    expect(movedUncapped).toBeGreaterThan(DIHEDRAL_MAX_DELTA * 2)
    // With the cap, the SAME huge error only ever moves the angle by
    // roughly the cap itself per call, regardless of stiffness.
    expect(movedCapped).toBeLessThanOrEqual(2 * DIHEDRAL_MAX_DELTA + 1e-6) // 2x: both p3 and p4 rotate
  })

  it('does NOT engage for a small residual error — high stiffness still converges at real strength once a hinge is nearly at rest', () => {
    const p1 = [0, 0, 0], p2 = [1, 0, 0]
    // Same construction/convention as the test above: foldDeg=176 measures
    // as a ~4 degree angle — a small residual error, the common case once
    // a garment has mostly settled.
    const foldRad = (176 * Math.PI) / 180
    const p3 = [0.5, 0, 1]
    const p4 = [0.5, Math.sin(foldRad), Math.cos(foldRad)]
    const restRad = 0
    const stiffness = FABRIC_PRESETS.leather.bendStiff

    const withCap = dihedralBendCorrection(p1, p2, p3, p4, restRad, stiffness, DIHEDRAL_MAX_DELTA)
    const withoutCap = dihedralBendCorrection(p1, p2, p3, p4, restRad, stiffness) // maxDelta = PI, effectively unclamped
    // Identical result — the cap only bites on errors large enough that
    // stiffness*error would exceed it; a small residual error stays well
    // under it, so this fabric's real stiffness governs convergence speed,
    // exactly the "actually sharpens folds" property the third fix restores.
    expect(withCap.p3).toEqual(withoutCap.p3)
    expect(withCap.p4).toEqual(withoutCap.p4)
  })
})
