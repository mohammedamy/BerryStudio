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
// bendStiff values below are nudged up ~15-25% from the original pass (was
// 0.08-0.90) — the original band read slightly paper-flat/floppy at rest
// rather than showing fabric-like rounded folds. Deliberately NOT touching
// massDensity/structStiff/friction here: those are load-bearing for sim
// STABILITY specifically (see header above — friction in particular was
// hard-won against a real "shirt collapses to the floor" bug), and bendStiff
// alone is what the codebase's own comment already identifies as the
// intended look-differentiating axis between fabrics.
// WP-7.1 `maxStrain`: fabric-overridable hard stretch ceiling (see
// ClothSimulation.js's STRAIN_LIMIT_GLSL) — a multiplier on rest edge
// length, NOT a physical elongation-at-break number. Woven fabrics (poplin,
// denim, leather) get a tight ceiling near ClothSimulation's 1.06 default;
// true knits (jersey, scuba) get real give, matching how a T-shirt knit
// visibly stretches under body ease in a way a woven shirt front doesn't;
// tulle (a loose net, not a woven sheet) gets some give for the same reason
// it's exempted from the tight structStiff band below.
//
// WP-7.2 `label`: a separate display name from the lookup key — the key
// stays the stable id every other file matches on (js/three-view.js's own
// FABRIC table, fabricId payload field, cloth-lab's UI button props), only
// the label changes to the more accurate historical/technical name.
//
// WP-7.2 warp/weft/bias anisotropy: deferred. Tagging each structural
// spring's orientation against a piece's declared `grainline` (WP-6) needs
// per-edge grain-alignment data threaded through triangulate.js/assemble.js
// into a new GPU texture and blended in the structural shader pass — a real
// engine addition, not a preset-table change, and out of scope for this
// pass. Not adding stiffWarp/stiffWeft/stiffBias fields here since unused
// preset fields that look wired up but aren't would be misleading; tracked
// as documented future work (see CHANGELOG).
//
// WP-9.2 `transmission`/`anisotropy`/`anisotropyRotation`: confirmed present
// on MeshPhysicalMaterial in the installed three@0.185.1 (and, checked
// against the actual pinned source, in the root app's three@0.160.0 too —
// no import-map bump needed there). `transmission` (chiffon/tulle) is kept
// modest (0.12-0.18), not glass-like — these fabrics are already sheer via
// `om`'s opacity cut, and transmission is a DIFFERENT physical effect
// (refractive light transport through the surface) layered on top for a
// soft frosted quality, not a replacement for the opacity-based sheerness.
// `anisotropy` (silk/satin, both genuinely anisotropic weaves in reality —
// charmeuse/satin weaves reflect light differently along vs across the
// grain) drives the material-level micro-highlight streak; `sheen` above
// already gives the broader soft glow, these work together, not redundantly.
export const FABRIC_PRESETS = {
  chiffon: { label: 'Chiffon', massDensity: 35, structStiff: 0.89, bendStiff: 0.08, maxStrain: 1.07, damping: 0.968, friction: 0.82, airDrag: 0.24, rough: 0.62, metal: 0.0, sheen: 0.55, clear: 0.0, clearcoatRough: 0.45, om: 0.58, transmission: 0.16, weaveScale: 1.4, normalStrength: 0.58, sheenRough: 0.55, envMapIntensity: 0.82 },
  silk: { label: 'Silk Charmeuse', massDensity: 65, structStiff: 0.91, bendStiff: 0.10, maxStrain: 1.06, damping: 0.964, friction: 0.80, airDrag: 0.18, rough: 0.28, metal: 0.04, sheen: 0.72, clear: 0.12, clearcoatRough: 0.32, om: 0.98, anisotropy: 0.6, anisotropyRotation: 0, weaveScale: 1.6, normalStrength: 0.38, sheenRough: 0.34, envMapIntensity: 0.95 },
  satin: { label: 'Satin', massDensity: 95, structStiff: 0.93, bendStiff: 0.16, maxStrain: 1.05, damping: 0.966, friction: 0.82, airDrag: 0.15, rough: 0.24, metal: 0.06, sheen: 0.78, clear: 0.15, clearcoatRough: 0.28, om: 1, anisotropy: 0.5, anisotropyRotation: 0, weaveScale: 1.5, normalStrength: 0.44, sheenRough: 0.30, envMapIntensity: 0.98 },
  cotton: { label: 'Cotton Poplin', massDensity: 150, structStiff: 0.95, bendStiff: 0.36, maxStrain: 1.04, damping: 0.968, friction: 0.91, airDrag: 0.11, rough: 0.80, metal: 0.0, sheen: 0.28, clear: 0.0, clearcoatRough: 0.50, om: 1, weaveScale: 1.2, normalStrength: 0.74, sheenRough: 0.74, envMapIntensity: 0.78 },
  linen: { label: 'Linen', massDensity: 175, structStiff: 0.96, bendStiff: 0.46, maxStrain: 1.03, damping: 0.966, friction: 0.92, airDrag: 0.11, rough: 0.86, metal: 0.0, sheen: 0.22, clear: 0.0, clearcoatRough: 0.50, om: 1, weaveScale: 1.0, normalStrength: 1.05, sheenRough: 0.80, envMapIntensity: 0.76 },
  wool: { label: 'Wool Crepe', massDensity: 310, structStiff: 0.95, bendStiff: 0.48, maxStrain: 1.04, damping: 0.962, friction: 0.93, airDrag: 0.09, rough: 0.86, metal: 0.0, sheen: 0.52, clear: 0.0, clearcoatRough: 0.50, om: 1, weaveScale: 1.1, normalStrength: 0.96, sheenRough: 0.62, envMapIntensity: 0.76 },
  denim: { label: 'Denim', massDensity: 400, structStiff: 0.97, bendStiff: 0.78, maxStrain: 1.02, damping: 0.952, friction: 0.96, airDrag: 0.06, rough: 0.88, metal: 0.01, sheen: 0.18, clear: 0.0, clearcoatRough: 0.50, om: 1, weaveScale: 1.0, normalStrength: 1.15, sheenRough: 0.82, envMapIntensity: 0.75 },
  leather: { label: 'Leather', massDensity: 550, structStiff: 0.98, bendStiff: 0.90, maxStrain: 1.015, damping: 0.945, friction: 0.97, airDrag: 0.05, rough: 0.42, metal: 0.08, sheen: 0.20, clear: 0.18, clearcoatRough: 0.38, om: 1, weaveScale: 0.9, normalStrength: 1.08, sheenRough: 0.48, envMapIntensity: 0.96 },
  jersey: { label: 'Cotton Jersey', massDensity: 185, structStiff: 0.89, bendStiff: 0.16, maxStrain: 1.12, damping: 0.960, friction: 0.93, airDrag: 0.12, rough: 0.82, metal: 0.0, sheen: 0.42, clear: 0.0, clearcoatRough: 0.50, om: 1, weaveScale: 1.3, normalStrength: 0.82, sheenRough: 0.68, envMapIntensity: 0.78 },
  scuba: { label: 'Scuba Knit', massDensity: 260, structStiff: 0.93, bendStiff: 0.52, maxStrain: 1.09, damping: 0.958, friction: 0.94, airDrag: 0.08, rough: 0.56, metal: 0.0, sheen: 0.45, clear: 0.05, clearcoatRough: 0.42, om: 1, weaveScale: 1.3, normalStrength: 0.52, sheenRough: 0.52, envMapIntensity: 0.86 },
  tulle: { label: 'Tulle', massDensity: 20, structStiff: 0.84, bendStiff: 0.18, maxStrain: 1.06, damping: 0.966, friction: 0.80, airDrag: 0.22, rough: 0.56, metal: 0.0, sheen: 0.48, clear: 0.0, clearcoatRough: 0.45, om: 0.42, transmission: 0.12, weaveScale: 1.2, normalStrength: 0.92, sheenRough: 0.48, envMapIntensity: 0.88 },
  velvet: { label: 'Velvet', massDensity: 330, structStiff: 0.94, bendStiff: 0.36, maxStrain: 1.05, damping: 0.958, friction: 0.95, airDrag: 0.10, rough: 0.84, metal: 0.0, sheen: 0.95, clear: 0.0, clearcoatRough: 0.50, om: 1, weaveScale: 1.2, normalStrength: 0.88, sheenRough: 0.32, envMapIntensity: 0.84 },
  lace: { label: 'Lace', massDensity: 75, structStiff: 0.91, bendStiff: 0.24, maxStrain: 1.05, damping: 0.968, friction: 0.86, airDrag: 0.16, rough: 0.74, metal: 0.0, sheen: 0.45, clear: 0.0, clearcoatRough: 0.50, om: 0.82, transmission: 0.08, weaveScale: 1.0, normalStrength: 1.25, sheenRough: 0.58, envMapIntensity: 0.84 },
}

export const FABRIC_IDS = Object.keys(FABRIC_PRESETS)
export const DEFAULT_FABRIC = 'cotton'
