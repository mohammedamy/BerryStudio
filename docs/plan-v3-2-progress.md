# Plan v3.2 continuation — 9 September 2026

This note records the current continuation of `BerryStudio-Upgrade-Plan-v3-2.md`.
The original plan's baseline predates several later implementations; use the
changelog and current tests when deciding what remains.

## WP-43: mf05 trouser waistband

Implemented locally: a previously missing waistband now joins all four leg-waist
edges. Tests verify equal lengths, anatomical endpoint correspondence and welded
mesh vertices at XS, M and 3XL. The library now has 308 patterns / 2,171 pieces.

Validation: 310 root tests, 888 Cloth Lab tests, both lints and both production
builds pass. This establishes attachment topology, not physical fit or stable
GPU draping of the full suit. The band follows the existing trouser block's
waist lengths; that block has not been redrafted.

## Next WP-43 work

Collar-to-neckline attachment remains open. The existing `jacketFrontBack()`
neckline curves are the prerequisite already completed in an earlier pass.
Pick one collar construction, measure its attachment edge against the actual
neckline, then verify endpoint direction and welded topology before expanding
to other callers. Do not batch-assign seam IDs across collar styles.

Other categories in §7 still require current-code investigation. In particular,
the plan's historical assertion that skirt gores never unfold is stale: the
current importer explicitly unfolds them when `cutOnFold` is true. That alone
does not establish correct waistband attachment.

WP-30 requires a real iOS Quick Look result. PayPal Stage C remains deferred
pending the provider decision. Neither is marked complete by this continuation.
