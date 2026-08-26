/* ============================================================
   Piece body-zone classification — BerryStudio-Upgrade-Plan WP-49.

   The gap this closes: neither js/three-view.js's 3D Preview nor Cloth
   Lab had any RELIABLE, user-controllable answer to "is this piece upper
   body or lower body" — both guessed from the piece's English NAME (a
   regex like /skirt|تنور/), with an unmatched piece silently defaulting
   to "bodice" (upper). Confirmed as a REAL bug, not a hypothetical: the
   Underwear & Bra Library's brief pieces are named "Front Panel"/"Back
   Panel" (role brief-front/brief-back, generic labels with no "skirt"
   keyword) — before this WP, Cloth Lab's classifyLegacy() defaulted them
   to bodice-front/bodice-back, i.e. a brief was simulated as the torso.

   Two-layer fix:
   1. cloth-lab/src/pattern/roles.js's SCHEMA_ROLE_INFO now has a `zone`
      on every panel-shaped role (front-panel, hip-panel-front, brief-front,
      sleeve, ...) — pieces the generators (js/data.js/ai.js/fancy-patterns.js/
      underwear-library.js) already declare a role for get this for free,
      no user action needed. THIS closes the confirmed bug above.
   2. This module adds a genuinely NEW, user-settable `bodyZone` field
      ('upper'|'lower'|null) per piece — for freehand/custom/duplicated
      pieces that have no declared role at all, or to let a user CORRECT a
      wrong guess by hand. Editable per piece in js/app.js's Layer Props
      panel (openLayerProps), sent across the Cloth Lab bridge payload
      (buildClothLabPayload), and consulted by three-view.js's own
      part-visibility classifier — the "link firmly to all views" half of
      the request.

   UPPER_ROLES/LOWER_ROLES below is a hand-kept-in-sync SUBSET of
   cloth-lab/src/pattern/roles.js's SCHEMA_ROLE_INFO `zone` field — same
   convention already used for auth-config.js/entitlement.js between the
   two projects (see auth.js's own header comment). Only the panel-shaped
   roles are listed, deliberately: accessory/attach roles (collar, cuff,
   waistband, pocket, gusset, ...) are reused across garment types with
   different real zones, so role alone can't say which for those — they
   stay unclassified here (inferBodyZone returns null) unless the user
   sets bodyZone explicitly on that specific piece.
   ============================================================ */

export const ZONE_UPPER = "upper";
export const ZONE_LOWER = "lower";
export const ZONE_VALUES = [ZONE_UPPER, ZONE_LOWER];

// Exported (code-review fix) so js/app.js's classifyPart() can ask "is
// this piece's ROLE a sleeve" without re-deriving its own list — sleeve is
// a real third bucket in three-view.js's 4-part system (bodice/sleeve/
// skirt/trousers), not just "upper zone," so inferBodyZone()'s plain
// upper/lower answer alone can't distinguish it from a bodice piece.
export const SLEEVE_ROLES = new Set([
  "sleeve", "sleeve-upper", "sleeve-under", "cap-sleeve", "puff-sleeve", "butterfly-sleeve",
]);
const UPPER_ROLES = new Set([
  "front-panel", "back-panel",
  "bodice-front-center", "bodice-front-side", "bodice-back-center", "bodice-back-side",
  ...SLEEVE_ROLES,
]);
const LOWER_ROLES = new Set([
  "hip-panel-front", "hip-panel-back",
  "skirt-front-gore", "skirt-back-gore", "skirt-side-gore-left", "skirt-side-gore-right",
  "brief-front", "brief-back",
  "trouser-front", "trouser-back",
]);
// schema/pattern-spec.v1.json's Phase-0 legacy role aliases (see
// cloth-lab/src/pattern/roles.js's own LEGACY_ROLE_ALIASES) — kept in
// sync here too so an older saved project's role string still resolves.
// Code-review fix: this table (and UPPER_ROLES/LOWER_ROLES above) is a
// hand-kept-in-sync duplicate of cloth-lab/src/pattern/roles.js's own
// `zone` field/LEGACY_ROLE_ALIASES — the exact same "two independently-
// hand-copied classifiers can silently drift" risk this WP was written to
// eliminate for piece NAMES, now one layer up for role TABLES. Since the
// root app (build-free ES modules) can't import from cloth-lab's separate
// Vite package, there's no way to make one derive from the other at
// runtime — instead, test/body-zone-roles-sync.test.js imports BOTH
// modules directly (both are plain, dependency-free ESM, so a root
// node --test can reach across the project boundary) and asserts every
// SCHEMA_ROLE_INFO entry's zone agrees with inferBodyZone()'s answer for
// that role — CI actually catches a drift now, not just a comment asking
// nicely for one.
const LEGACY_ROLE_ALIASES = {
  "bodice-front": "front-panel",
  "bodice-back": "back-panel",
  "skirt-front": "hip-panel-front",
  "skirt-back": "hip-panel-back",
};

// `piece`: anything with an optional `bodyZone` and/or `role` field (a
// Canvas piece, or a plain {role, bodyZone} probe). Returns 'upper' |
// 'lower' | null. null means "no explicit or role-based signal" — callers
// keep whatever NAME-based last-resort guess they already had for that
// case (this module deliberately doesn't reproduce those regexes; see
// three-view.js's applyPieceVisibility() and cloth-lab's classifyLegacy()
// for where each one's own fallback still lives, unchanged).
export function inferBodyZone(piece) {
  if (!piece) return null;
  if (piece.bodyZone === ZONE_UPPER || piece.bodyZone === ZONE_LOWER) return piece.bodyZone;
  const role = LEGACY_ROLE_ALIASES[piece.role] || piece.role;
  if (role && UPPER_ROLES.has(role)) return ZONE_UPPER;
  if (role && LOWER_ROLES.has(role)) return ZONE_LOWER;
  return null;
}
