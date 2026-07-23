// Simulation parameters per fabric, extending the 8 existing VISUAL presets
// (js/three-view.js's `FABRIC` table) with sim-only fields. massDensity/
// damping/friction are grounded in real garment-GSM ballparks. structStiff/
// bendStiff were retuned (from an initial guess) once ClothSimulation
// started mass-weighting constraint corrections (see neighborCorrection's
// `wSelf` split): with mass-weighting, correction magnitude for a typical
// equal-mass connection is roughly half of what a flat, unweighted
// correction would give, so any value in the previous 0.55-0.98 range
// collapses toward the same 0.98 clamp — which also matches how real woven
// fabrics behave: STRETCH resistance is uniformly high regardless of fabric
// type (that's what makes it cloth and not a rubber sheet), while what
// actually differentiates chiffon from denim is bend resistance, weight,
// damping, and friction. So structStiff is now a narrow, uniformly-high
// band, and bendStiff carries the wide, clearly-differentiated spread.
// All 6 fields are plain float uniforms — switching fabric is an instant
// uniform update, no shader recompile, no texture rebuild, no sim restart.
// friction values run much higher than a real-world coefficient would (real
// fabric-on-skin friction is more like 0.3-0.6) because collideCapsule's
// friction model (ClothSimulation.js) only ever SLOWS tangential drift, it
// doesn't fully arrest it at a realistic coefficient — checked empirically,
// a T-shirt at the "physically realistic" ~0.35 still crept off the
// shoulders and collapsed to the floor over a couple thousand frames, just
// slower than with no friction at all. These values are tuned for the sim's
// actual behavior, not real material science, preserving relative order
// (chiffon slipperiest, leather grippiest) rather than absolute realism.
export const FABRIC_SIM_PRESETS = {
  chiffon: { massDensity: 30, structStiff: 0.92, bendStiff: 0.08, damping: 0.985, friction: 0.75 },
  silk: { massDensity: 60, structStiff: 0.94, bendStiff: 0.12, damping: 0.980, friction: 0.80 },
  satin: { massDensity: 90, structStiff: 0.95, bendStiff: 0.16, damping: 0.980, friction: 0.82 },
  cotton: { massDensity: 150, structStiff: 0.96, bendStiff: 0.28, damping: 0.970, friction: 0.90 },
  linen: { massDensity: 170, structStiff: 0.96, bendStiff: 0.34, damping: 0.970, friction: 0.87 },
  wool: { massDensity: 300, structStiff: 0.97, bendStiff: 0.50, damping: 0.950, friction: 0.93 },
  denim: { massDensity: 400, structStiff: 0.98, bendStiff: 0.75, damping: 0.930, friction: 0.96 },
  leather: { massDensity: 550, structStiff: 0.98, bendStiff: 0.90, damping: 0.900, friction: 0.97 },
}

export const FABRIC_IDS = Object.keys(FABRIC_SIM_PRESETS)
export const DEFAULT_FABRIC = 'cotton'
