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
// WP-49: `zone` ('upper' | 'lower') on the entries below is the same
// upper/lower-body fact js/body-zone.js's inferBodyZone() derives in the
// root app — kept in sync by hand between the two (see that file's own
// header comment), same convention already used for auth-config.js/
// entitlement.js between the two projects. Deliberately only present on
// PANEL-shaped roles (the pieces that actually stand in for "torso" or
// "hips/legs" — what a garment silhouette is built from), not on
// accessory/attach roles further down (collar, cuff, waistband, pocket,
// gusset, ...): those are reused across garment types with different real
// zones (a waistband sits on a skirt OR a dress' waist seam), so a role
// alone can't say which — see js/body-zone.js for the full reasoning.
export const SCHEMA_ROLE_INFO = {
  // simple front/back (existing 5-role vocabulary, unchanged in spirit)
  'front-panel': { placement: 'frontPanel', zone: 'upper' },
  'back-panel': { placement: 'backPanel', zone: 'upper' },
  'hip-panel-front': { placement: 'hipPanelFront', zone: 'lower' },
  'hip-panel-back': { placement: 'hipPanelBack', zone: 'lower' },
  sleeve: { placement: 'sleeve', zone: 'upper' },

  // WP-49: underwear-library.js's brief pieces (WP-43) declared this role
  // from day one, but it was never added here — resolveSchemaRole()
  // returned null for it, so convertAppPattern() fell back to
  // classifyLegacy's NAME-based guess on the piece's generic label
  // ("Front Panel"/"Back Panel", no "skirt"/"trouser" keyword), which
  // defaults an unmatched front/back panel to 'bodice-front'/'bodice-back'
  // — a real, confirmed bug: a brief (underwear bottom) was placed and
  // simulated as the torso bodice. hipPanelFront/hipPanelBack is the
  // correct placement family — same body-conforming hip geometry a skirt
  // panel gets, which is what a brief's front/back panel actually is.
  'brief-front': { placement: 'hipPanelFront', zone: 'lower' },
  'brief-back': { placement: 'hipPanelBack', zone: 'lower' },

  // princess seams
  'bodice-front-center': { placement: 'frontPanel', cutOnFold: true, seamFamily: 'princess-front', zone: 'upper' },
  'bodice-front-side': { placement: 'frontPanel', bilateral: true, seamFamily: 'princess-front', zone: 'upper' },
  'bodice-back-center': { placement: 'backPanel', cutOnFold: true, seamFamily: 'princess-back', zone: 'upper' },
  'bodice-back-side': { placement: 'backPanel', bilateral: true, seamFamily: 'princess-back', zone: 'upper' },

  // Gores — placed at a fixed angular slot around the hip circumference
  // (front/back/side-left/side-right), not auto-seamed to their neighbor
  // gores this pass (see placeGorePanel's own header comment for why).
  // Four fixed positions because that's the actual vocabulary every Fancy
  // Collection gored-skirt design uses (confirmed by direct inspection —
  // front + back + explicitly-authored Left/Right side gores), not a
  // generalized N-gore scheme.
  'skirt-front-gore': { placement: 'goreFront', zone: 'lower' },
  'skirt-back-gore': { placement: 'goreBack', zone: 'lower' },
  'skirt-side-gore-left': { placement: 'goreSideLeft', zone: 'lower' },
  'skirt-side-gore-right': { placement: 'goreSideRight', zone: 'lower' },

  // sleeve variants
  'sleeve-upper': { placement: 'sleeve', seamFamily: 'sleeve-2pc', tubeHalf: 'upper', zone: 'upper' },
  'sleeve-under': { placement: 'sleeve', seamFamily: 'sleeve-2pc', tubeHalf: 'under', zone: 'upper' },
  'cap-sleeve': { placement: 'sleeve', zone: 'upper' },
  'puff-sleeve': { placement: 'sleeve', zone: 'upper' },
  'butterfly-sleeve': { placement: 'sleeve', zone: 'upper' },

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

  // docs/plan 4.md Phase 4 (WP-53): js/underwear-library.js declared these
  // 5 roles from day one (a bra's cup/band/strap, and the elastic-band/
  // gusset construction every brief and most bras use) but they were never
  // added here — resolveSchemaRole() returned null for all 5, so
  // convertAppPattern() silently fell back to classifyLegacy's name-based
  // guess for every one of them (a real gap: this collection's roles were
  // outside the 46-value vocabulary docs/plan 4.md §4.2 requires, the
  // exact "invented role" problem that role vocabulary exists to prevent).
  // Placements below follow the closest existing precedent rather than a
  // new placement algorithm — same "reasonable attachment, not seam-
  // perfect" bar this file's own header already sets for the accessory
  // roles above: cup/band sit at chest height (attachBody, matching
  // facing/cuff/pocket's own "near chest height" placement); strap runs
  // near the shoulder (attachNeck, matching collar/epaulette); elastic-
  // band is most commonly a leg-opening finish here (attachHem); gusset
  // is a small body accessory like the rest of this group (attachBody).
  cup: { placement: 'attachBody' },
  band: { placement: 'attachBody' },
  strap: { placement: 'attachNeck' },
  'elastic-band': { placement: 'attachHem' },
  gusset: { placement: 'attachBody' },

  // WP-59 (docs/plan 4.md Phase 5, user-directed "make everything
  // cloth-lab compatible" pass): js/fancy-patterns.js's `trouserPanel()`
  // (~17 patterns) declared role:"other" — placement 'attachBody' is the
  // small-accessory placement (a pocket/cuff-sized patch near the hip),
  // never auto-seamed, so a full trouser leg panel landed as a flat
  // misplaced patch requiring the user to hand-build the seam every
  // time. classifyLegacy() above has said "trousers/leg pieces aren't
  // supported in 3D yet" since before this role vocabulary existed —
  // real, but no longer true: `legFront`/`legBack` (placement.js) roll
  // each bilateral-duplicated leg panel into a half-tube down the thigh
  // (reusing legProfile()'s own taper), offset to its own side of the
  // centerline; convertAppPattern's new `mirrorSelf` edge kind seams a
  // bilateral piece's own left/right copies together at the inseam
  // (forming the crotch/center seam), and the existing seamId mechanism
  // seams front to back at the outseam — the same, no-new-mechanism path
  // jacketSide/trouserOutseam/princess seams already use.
  'trouser-front': { placement: 'legFront', bilateral: true, zone: 'lower' },
  'trouser-back': { placement: 'legBack', bilateral: true, zone: 'lower' },

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

// WP-49: 'upper' | 'lower' | null (unmapped role, current alias, or role
// not declared at all) — the same lookup resolveSchemaRole() already does
// internally, exposed standalone so importFromApp.js's classifyLegacy path
// (pieces with NO declared role, or one this file doesn't recognize) can
// still ask "does the PAYLOAD say a zone regardless?" without needing a
// full placement resolution first.
export function zoneForRole(role) {
  return resolveSchemaRole(role)?.zone ?? null
}
