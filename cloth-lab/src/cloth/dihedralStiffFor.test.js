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
// full rotation by delta).
//
// A first version of this fix clamped at 0.5 — the value dihedralBend.js's
// own default `stiffness` param uses, and the only value
// dihedralBend.test.js's convergence property test ever exercises, because
// a SINGLE isolated hinge genuinely converges to rest in one correction at
// exactly 0.5 (see the second test below). That shipped, and the user
// still reported "crazy things" — confirmed live (Denim/Leather + High:
// visible wrinkling/ballooning that kept growing, not settling). The
// isolated-hinge math undersold the real failure mode: a garment has many
// hinges sharing vertices, all correcting in PARALLEL from the same
// snapshot every substep, then averaging independently-computed ROTATED
// positions at each shared vertex — a nonlinear average, unlike the
// structural/default-bend constraints' simple linear-displacement
// averaging — so what a lone hinge tolerates at 0.5 compounds once
// coupled. Re-verified live by sweeping the clamp down with Denim AND
// Leather (bendStiff 0.80 and 0.92, the two stiffest real presets) on the
// High tier, watched settle over several seconds: 0.5 and 0.2 both still
// visibly wrinkle/balloon and keep growing; 0.12 settles clean,
// indistinguishable from the default tier's own drape, and stays stable.
describe('dihedralStiffFor', () => {
  it('clamps at 0.12 (empirically re-verified live — see this file\'s own header) for every real fabric preset', () => {
    for (const id of FABRIC_IDS) {
      const stiff = dihedralStiffFor(FABRIC_PRESETS[id])
      expect(stiff).toBeLessThanOrEqual(0.12)
      expect(stiff).toBeGreaterThan(0) // never silently zeroed either
    }
    // Confirms this test isn't vacuous — several real presets' bendStiff
    // really do exceed 0.12, so the clamp is actually doing something.
    expect(FABRIC_PRESETS.wool.bendStiff).toBeGreaterThan(0.12)
    expect(FABRIC_PRESETS.leather.bendStiff).toBeGreaterThan(0.12)
    expect(dihedralStiffFor(FABRIC_PRESETS.leather)).toBe(0.12)
  })

  it('passes a low-bendStiff fabric through unchanged (already within the clamped range)', () => {
    expect(FABRIC_PRESETS.chiffon.bendStiff).toBeLessThan(0.12)
    expect(dihedralStiffFor(FABRIC_PRESETS.chiffon)).toBe(FABRIC_PRESETS.chiffon.bendStiff)
  })

  it('respects an explicit fabric.dihedralStiff override, clamped the same way', () => {
    expect(dihedralStiffFor({ bendStiff: 0.9, dihedralStiff: 0.1 })).toBe(0.1)
    expect(dihedralStiffFor({ bendStiff: 0.05, dihedralStiff: 0.9 })).toBe(0.12) // an override can still be unsafe
  })

  // The isolated-hinge property that made 0.5 look safe in the first pass
  // at this fix — genuinely true, kept as a record of why that number was
  // picked, and why it turned out not to be enough on its own (see this
  // file's own header for the coupled-system mechanism that actually
  // mattered).
  it('stiffness=0.5 converges an ISOLATED hinge to rest in one correction with zero overshoot', () => {
    const p1 = [0, 0, 0], p2 = [1, 0, 0]
    const nearFlatRad = (10 * Math.PI) / 180
    const p3 = [0.5, 0, 1]
    const p4 = [0.5, Math.sin(nearFlatRad), Math.cos(nearFlatRad)]
    const restRad = 0

    const safe = dihedralBendCorrection(p1, p2, p3, p4, restRad, 0.5)
    expect(Math.abs(safe.angle - restRad)).toBeGreaterThan(0) // the pre-correction error was real
    const afterSafe = dihedralAngle(p1, p2, safe.p3, safe.p4)
    expect(Math.abs(afterSafe)).toBeLessThan(1e-6) // exact convergence, one step, no overshoot

    // The actual shipped clamp (0.12) converges the same isolated hinge
    // too, just more gradually across several corrections rather than in
    // one — the whole point of leaving real margin below the single-hinge
    // "perfect" value for a system where many hinges correct at once.
    let hp3 = p3, hp4 = p4
    for (let i = 0; i < 40; i++) {
      const r = dihedralBendCorrection(p1, p2, hp3, hp4, restRad, 0.12)
      hp3 = r.p3; hp4 = r.p4
    }
    expect(Math.abs(dihedralAngle(p1, p2, hp3, hp4))).toBeLessThan(1e-3)
  })
})
