// Simulation + visual parameters per fabric. massDensity/damping/friction are
// grounded in real garment-GSM ballparks. structStiff/bendStiff were retuned
// (from an initial guess) once ClothSimulation started mass-weighting
// constraint corrections (see neighborCorrection's `wSelf` split): with
// mass-weighting, correction magnitude for a typical equal-mass connection is
// roughly half of what a flat, unweighted correction would give, so any value
// in the previous 0.55-0.98 range collapses toward the same 0.98 clamp —
// which also matches how real woven fabrics behave: STRETCH resistance is
// uniformly high regardless of fabric type (that's what makes it cloth and
// not a rubber sheet), while what actually differentiates chiffon from denim
// is bend resistance, weight, damping, and friction. So structStiff is now a
// narrow, uniformly-high band, and bendStiff carries the wide, clearly-
// differentiated spread. All 6 sim fields are plain float uniforms —
// switching fabric is an instant uniform update, no shader recompile, no
// texture rebuild, no sim restart.
// friction values run much higher than a real-world coefficient would (real
// fabric-on-skin friction is more like 0.3-0.6) because collideCapsule's
// friction model (ClothSimulation.js) only ever SLOWS tangential drift, it
// doesn't fully arrest it at a realistic coefficient — checked empirically,
// a T-shirt at the "physically realistic" ~0.35 still crept off the
// shoulders and collapsed to the floor over a couple thousand frames, just
// slower than with no friction at all. These values are tuned for the sim's
// actual behavior, not real material science, preserving relative order
// (chiffon slipperiest, leather grippiest) rather than absolute realism.
//
// rough/metal/sheen/clear/om are visual (MeshPhysicalMaterial) values, ported
// verbatim from the production app's own fabric table (js/three-view.js's
// `FABRIC` const) so the two separate 3D views agree on what each fabric
// looks like. `om` is an opacity multiplier (chiffon/silk render slightly
// sheer) — see ClothMesh.jsx for how these feed the render material.
export const FABRIC_PRESETS = {
  chiffon: { massDensity: 30, structStiff: 0.92, bendStiff: 0.08, damping: 0.985, friction: 0.75, rough: 0.5, metal: 0.0, sheen: 0.45, clear: 0.0, om: 0.55 },
  silk: { massDensity: 60, structStiff: 0.94, bendStiff: 0.12, damping: 0.980, friction: 0.80, rough: 0.26, metal: 0.05, sheen: 0.9, clear: 0.15, om: 0.98 },
  satin: { massDensity: 90, structStiff: 0.95, bendStiff: 0.16, damping: 0.980, friction: 0.82, rough: 0.2, metal: 0.12, sheen: 0.85, clear: 0.22, om: 1 },
  cotton: { massDensity: 150, structStiff: 0.96, bendStiff: 0.28, damping: 0.970, friction: 0.90, rough: 0.85, metal: 0.0, sheen: 0.2, clear: 0.0, om: 1 },
  linen: { massDensity: 170, structStiff: 0.96, bendStiff: 0.34, damping: 0.970, friction: 0.87, rough: 0.82, metal: 0.0, sheen: 0.15, clear: 0.0, om: 1 },
  wool: { massDensity: 300, structStiff: 0.97, bendStiff: 0.50, damping: 0.950, friction: 0.93, rough: 0.96, metal: 0.0, sheen: 0.08, clear: 0.0, om: 1 },
  denim: { massDensity: 400, structStiff: 0.98, bendStiff: 0.75, damping: 0.930, friction: 0.96, rough: 0.9, metal: 0.02, sheen: 0.1, clear: 0.0, om: 1 },
  leather: { massDensity: 550, structStiff: 0.98, bendStiff: 0.90, damping: 0.900, friction: 0.97, rough: 0.4, metal: 0.2, sheen: 0.2, clear: 0.35, om: 1 },
}

export const FABRIC_IDS = Object.keys(FABRIC_PRESETS)
export const DEFAULT_FABRIC = 'cotton'
