import { describe, it, expect } from 'vitest'
import { dihedralStiffFor } from './ClothSimulation.js'
import { FABRIC_PRESETS, FABRIC_IDS } from './fabricPresets.js'
import { dihedralAngle, dihedralBendCorrection } from './dihedralBend.js'

// Regression test for a real, user-reported bug: "in cloth lab whenever i
// clicked high [dihedral bend] crazy things happen." ClothSimulation.js
// used to feed the High-quality tier's dihedral bend constraint
// `fabric.dihedralStiff ?? fabric.bendStiff` UNCLAMPED — no preset defines
// `dihedralStiff`, so every fabric silently handed it a `bendStiff` value
// (0.06-0.92, see fabricPresets.js) tuned for the DEFAULT tier's unrelated
// distance-based bend spring, where stiffness near 1 is safe. The dihedral
// constraint is a Jacobi ROTATION correction instead
// (dihedralBend.js/DIHEDRAL_BEND_GLSL: delta = stiffness*error, then a
// full rotation by delta), which only converges without overshooting past
// the target and flipping sign each substep for stiffness <= 0.5 — see
// dihedralBend.js's own default parameter and dihedralBend.test.js's
// convergence property test, both of which already use exactly 0.5, never
// a higher value. Several real presets exceed 0.5 (wool 0.58, denim 0.80,
// leather 0.92), so a user on any of those hit escalating sign-flip
// oscillation the instant they switched to the High tier.
describe('dihedralStiffFor', () => {
  it('clamps at 0.5 (the proven-stable maximum) for every real fabric preset, even the stiffest', () => {
    for (const id of FABRIC_IDS) {
      const stiff = dihedralStiffFor(FABRIC_PRESETS[id])
      expect(stiff).toBeLessThanOrEqual(0.5)
      expect(stiff).toBeGreaterThan(0) // never silently zeroed either
    }
    // Confirms this test isn't vacuous — leather's own bendStiff really
    // does exceed 0.5, so the clamp is actually doing something here.
    expect(FABRIC_PRESETS.leather.bendStiff).toBeGreaterThan(0.5)
    expect(dihedralStiffFor(FABRIC_PRESETS.leather)).toBe(0.5)
  })

  it('passes a low-bendStiff fabric through unchanged (already within the safe range)', () => {
    expect(FABRIC_PRESETS.chiffon.bendStiff).toBeLessThan(0.5)
    expect(dihedralStiffFor(FABRIC_PRESETS.chiffon)).toBe(FABRIC_PRESETS.chiffon.bendStiff)
  })

  it('respects an explicit fabric.dihedralStiff override, clamped the same way', () => {
    expect(dihedralStiffFor({ bendStiff: 0.9, dihedralStiff: 0.3 })).toBe(0.3)
    expect(dihedralStiffFor({ bendStiff: 0.1, dihedralStiff: 0.9 })).toBe(0.5) // an override can still be unsafe
  })

  // Documents the actual MECHANISM, not just the clamped number: a single
  // isolated hinge still technically converges even above 0.5 (each
  // correction's magnitude keeps shrinking — a damped oscillation, not a
  // divergent one; confirmed directly, this is NOT itself sufficient to
  // reproduce "crazy things happen" on its own). What changes at the
  // clamp boundary is whether
  // that convergence overshoots past the target and flips sign every
  // single substep. On a real garment with many hinges sharing vertices,
  // all correcting in parallel every substep from each other's
  // just-flipped, still-moving neighbors (Jacobi-style — see
  // ClothSimulation.js's own module header), that per-hinge oscillation is
  // exactly the seed a real "crazy things happen" explosion grows from,
  // even though no single hinge in isolation proves it. At stiffness=0.5
  // (dihedralBend.js's own default, and the only value its convergence
  // property test ever exercises) a hinge converges to rest in ONE
  // correction with no overshoot at all — the clean, provably non-
  // oscillating case every clamped fabric now gets.
  it('stiffness=0.5 converges in one correction with no sign flip; an unclamped high value flips sign', () => {
    const p1 = [0, 0, 0], p2 = [1, 0, 0]
    const nearFlatRad = (10 * Math.PI) / 180
    const p3 = [0.5, 0, 1]
    const p4 = [0.5, Math.sin(nearFlatRad), Math.cos(nearFlatRad)]
    const restRad = 0

    const safe = dihedralBendCorrection(p1, p2, p3, p4, restRad, 0.5)
    expect(Math.abs(safe.angle - restRad)).toBeGreaterThan(0) // the pre-correction error was real
    const afterSafe = dihedralAngle(p1, p2, safe.p3, safe.p4)
    expect(Math.abs(afterSafe)).toBeLessThan(1e-6) // exact convergence, one step, no overshoot

    const unsafeStiff = FABRIC_PRESETS.leather.bendStiff // 0.92 — what shipped, unclamped, before this fix
    const unsafe = dihedralBendCorrection(p1, p2, p3, p4, restRad, unsafeStiff)
    const afterUnsafe = dihedralAngle(p1, p2, unsafe.p3, unsafe.p4)
    // Overshot past the target to the OTHER side — sign flipped versus
    // the original (positive) error, exactly the oscillation this fix
    // eliminates by never letting a real fabric reach this stiffness.
    expect(Math.sign(afterUnsafe)).not.toBe(Math.sign(nearFlatRad))
  })
})
