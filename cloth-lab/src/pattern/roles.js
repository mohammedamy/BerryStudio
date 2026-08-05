// Shared role vocabulary — BerryStudio-Upgrade-Plan WP-6.
//
// Generators (js/data.js, js/ai.js, js/fancy-patterns.js) declare a piece's
// `role` from SCHEMA_ROLE below at construction time, instead of cloth-lab
// guessing it from the piece's name (see importFromApp.js's classifyLegacy,
// kept only as a fallback for legacy payloads with no declared role).
//
// Two distinct vocabularies, deliberately not unified (see
// BerryStudio-Upgrade-Plan WP-6 design notes): SCHEMA_ROLE is the portable,
// generator-facing, kebab-case name (also used by schema/pattern-spec.v1.json's
// `role` enum); INTERNAL placement role is cloth-lab's own camelCase
// placement-strategy identifier, already load-bearing in hand-authored
// content (tshirt.js/skirt.js declare 'frontPanel'/'backPanel'/'sleeve'/
// 'hipPanelFront'/'hipPanelBack' directly) — extended here with new internal
// roles rather than renamed, so existing hand-authored pieces keep working
// untouched.
//
// A handful of schema roles (collar/cuff/pocket/facing/waistband/sash/
// lining/yoke/peplum/godet/tier/cape/hood) get a reasonable ATTACHMENT
// placement but are NOT auto-seamed into the main shell this pass — mirrors
// the existing precedent for sleeves-vs-armhole ("an unstitched but
// correctly placed piece drapes plausibly from gravity+placement alone,
// safer than guessing a seam location"). WP-6's acceptance bar is "imports
// and simulates," not "every accessory piece is seam-perfect."
export const SCHEMA_ROLE_INFO = {
  // simple front/back (existing 5-role vocabulary, unchanged in spirit)
  'front-panel': { placement: 'frontPanel' },
  'back-panel': { placement: 'backPanel' },
  'hip-panel-front': { placement: 'hipPanelFront' },
  'hip-panel-back': { placement: 'hipPanelBack' },
  sleeve: { placement: 'sleeve' },

  // princess seams
  'bodice-front-center': { placement: 'frontPanel', cutOnFold: true, seamFamily: 'princess-front' },
  'bodice-front-side': { placement: 'frontPanel', bilateral: true, seamFamily: 'princess-front' },
  'bodice-back-center': { placement: 'backPanel', cutOnFold: true, seamFamily: 'princess-back' },
  'bodice-back-side': { placement: 'backPanel', bilateral: true, seamFamily: 'princess-back' },

  // Gores — placed at a fixed angular slot around the hip circumference
  // (front/back/side-left/side-right), not auto-seamed to their neighbor
  // gores this pass (see placeGorePanel's own header comment for why).
  // Four fixed positions because that's the actual vocabulary every Fancy
  // Collection gored-skirt design uses (confirmed by direct inspection —
  // front + back + explicitly-authored Left/Right side gores), not a
  // generalized N-gore scheme.
  'skirt-front-gore': { placement: 'goreFront' },
  'skirt-back-gore': { placement: 'goreBack' },
  'skirt-side-gore-left': { placement: 'goreSideLeft' },
  'skirt-side-gore-right': { placement: 'goreSideRight' },

  // sleeve variants
  'sleeve-upper': { placement: 'sleeve', seamFamily: 'sleeve-2pc', tubeHalf: 'upper' },
  'sleeve-under': { placement: 'sleeve', seamFamily: 'sleeve-2pc', tubeHalf: 'under' },
  'cap-sleeve': { placement: 'sleeve' },
  'puff-sleeve': { placement: 'sleeve' },
  'butterfly-sleeve': { placement: 'sleeve' },

  // neckline-attached accessories (no auto-seam this pass)
  collar: { placement: 'attachNeck' },
  undercollar: { placement: 'attachNeck' },
  'collar-stand': { placement: 'attachNeck' },
  'collar-band': { placement: 'attachNeck' },
  'lapel-facing': { placement: 'attachNeck' },
  'placket-facing': { placement: 'attachNeck' },
  hood: { placement: 'attachNeck', bilateral: true },
  cape: { placement: 'attachNeck' },
  'cape-overlay': { placement: 'attachNeck' },
  yoke: { placement: 'attachNeck' },
  // WP-25: js/fancy-patterns.js authors this role on 6 Fancy Collection
  // designs' shoulder tab/epaulette piece ("buttoned at the collar seam")
  // but it was never added here — resolveSchemaRole returned null for it,
  // so convertAppPattern fell back to classifyLegacy, which can't tell
  // front from back from the name "Shoulder Epaulette"/"Shoulder Tab" and
  // skips the piece. attachNeck (not attachBody) matches its real
  // shoulder/collar position — attachBody would place it at hip height.
  epaulette: { placement: 'attachNeck' },

  // waist-attached accessories
  'peplum-front': { placement: 'attachWaist' },
  'peplum-back': { placement: 'attachWaistBack' },
  sash: { placement: 'attachWaist' },
  'wrap-tie': { placement: 'attachWaist' },
  belt: { placement: 'attachWaist' },
  waistband: { placement: 'attachWaist' },

  // hem-attached
  godet: { placement: 'attachHem', bilateral: true },
  tier: { placement: 'attachHem' },

  // small body accessories
  pocket: { placement: 'attachBody' },
  facing: { placement: 'attachBody' },
  lining: { placement: 'attachBodyBack' },
  cuff: { placement: 'attachBody' },
  'rib-cuff': { placement: 'attachBody' },
  'hem-band': { placement: 'attachBody' },

  other: { placement: 'attachBody' },
}

export const SCHEMA_ROLE_ENUM = new Set(Object.keys(SCHEMA_ROLE_INFO))

// Legacy aliases from schema/pattern-spec.v1.json's original (Phase 0) enum,
// resolved to the closest new role — kept so Phase 1's AI spec-first output
// (which still targets the old names) isn't broken by this extension.
const LEGACY_ROLE_ALIASES = {
  'bodice-front': 'front-panel',
  'bodice-back': 'back-panel',
  'skirt-front': 'hip-panel-front',
  'skirt-back': 'hip-panel-back',
}

// Resolves any declared schema role (current or legacy-aliased) to its
// SCHEMA_ROLE_INFO entry, or null if unrecognized (caller falls back to
// classifyLegacy in that case).
export function resolveSchemaRole(role) {
  if (!role) return null
  if (SCHEMA_ROLE_INFO[role]) return { role, ...SCHEMA_ROLE_INFO[role] }
  const aliased = LEGACY_ROLE_ALIASES[role]
  if (aliased) return { role: aliased, ...SCHEMA_ROLE_INFO[aliased] }
  return null
}
