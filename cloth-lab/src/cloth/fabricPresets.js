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
  chiffon: { label: 'Chiffon', massDensity: 30, structStiff: 0.92, bendStiff: 0.10, maxStrain: 1.08, damping: 0.985, friction: 0.75, rough: 0.5, metal: 0.0, sheen: 0.45, clear: 0.0, om: 0.55, transmission: 0.18 },
  silk: { label: 'Silk Charmeuse', massDensity: 60, structStiff: 0.94, bendStiff: 0.15, maxStrain: 1.07, damping: 0.980, friction: 0.80, rough: 0.26, metal: 0.05, sheen: 0.9, clear: 0.15, om: 0.98, anisotropy: 0.6, anisotropyRotation: 0 },
  satin: { label: 'Satin', massDensity: 90, structStiff: 0.95, bendStiff: 0.20, maxStrain: 1.06, damping: 0.980, friction: 0.82, rough: 0.2, metal: 0.12, sheen: 0.85, clear: 0.22, om: 1, anisotropy: 0.5, anisotropyRotation: 0 },
  cotton: { label: 'Cotton Poplin', massDensity: 150, structStiff: 0.96, bendStiff: 0.35, maxStrain: 1.05, damping: 0.970, friction: 0.90, rough: 0.85, metal: 0.0, sheen: 0.2, clear: 0.0, om: 1 },
  linen: { label: 'Linen', massDensity: 170, structStiff: 0.96, bendStiff: 0.42, maxStrain: 1.05, damping: 0.970, friction: 0.87, rough: 0.82, metal: 0.0, sheen: 0.15, clear: 0.0, om: 1 },
  wool: { label: 'Wool Crepe', massDensity: 300, structStiff: 0.97, bendStiff: 0.58, maxStrain: 1.04, damping: 0.950, friction: 0.93, rough: 0.96, metal: 0.0, sheen: 0.08, clear: 0.0, om: 1 },
  denim: { label: 'Denim', massDensity: 400, structStiff: 0.98, bendStiff: 0.80, maxStrain: 1.03, damping: 0.930, friction: 0.96, rough: 0.9, metal: 0.02, sheen: 0.1, clear: 0.0, om: 1 },
  leather: { label: 'Leather', massDensity: 550, structStiff: 0.98, bendStiff: 0.92, maxStrain: 1.02, damping: 0.900, friction: 0.97, rough: 0.4, metal: 0.2, sheen: 0.2, clear: 0.35, om: 1 },
  // WP-7.2 new presets — GSM-grounded starting values, following the
  // existing file's own convention (structStiff narrow-high, bendStiff the
  // differentiating axis), except tulle which is deliberately exempted from
  // the narrow-high structStiff band: it's a loose open net, not a woven
  // sheet, and a woven-grade structStiff made it read as an invisible rigid
  // scaffold instead of the soft, airy mesh it should be.
  jersey: { label: 'Cotton Jersey', massDensity: 180, structStiff: 0.90, bendStiff: 0.22, maxStrain: 1.18, damping: 0.965, friction: 0.88, rough: 0.7, metal: 0.0, sheen: 0.18, clear: 0.0, om: 1 },
  scuba: { label: 'Scuba Knit', massDensity: 260, structStiff: 0.91, bendStiff: 0.45, maxStrain: 1.14, damping: 0.955, friction: 0.85, rough: 0.35, metal: 0.0, sheen: 0.35, clear: 0.05, om: 1 },
  tulle: { label: 'Tulle', massDensity: 18, structStiff: 0.80, bendStiff: 0.06, maxStrain: 1.12, damping: 0.988, friction: 0.55, rough: 0.55, metal: 0.0, sheen: 0.3, clear: 0.0, om: 0.35, transmission: 0.12 },
}

export const FABRIC_IDS = Object.keys(FABRIC_PRESETS)
export const DEFAULT_FABRIC = 'cotton'
