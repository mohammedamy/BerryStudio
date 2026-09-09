# Plan v3.2 continuation — 9 September 2026

This note records the current continuation of `BerryStudio-Upgrade-Plan-v3-2.md`.
The original plan's baseline predates several later implementations; use the
changelog and current tests when deciding what remains.

## WP-43: mf05 trouser waistband

Deployed in PR #54: a previously missing waistband now joins all four leg-waist
edges. Tests verify equal lengths, anatomical endpoint correspondence and welded
mesh vertices. The initial test used `3XL`, which falls back to M; the collar
continuation corrected this to `XXXL` and verified XS, M and actual XXXL.
The library now has 308 patterns / 2,171 pieces.

Validation: 310 root tests, 888 Cloth Lab tests, both lints and both production
builds pass. This establishes attachment topology, not physical fit or stable
GPU draping of the full suit. The band follows the existing trouser block's
waist lengths; that block has not been redrafted.

## WP-43: wf09 shirt collar and stand

Implemented locally: the Belted A-Line Coat Dress's collar and stand are now
drafted from its actual neckline lengths and joined through six seams. Tests
at XS, M and XXXL verify authored length parity, endpoint direction, welded
topology and preservation of the princess joins. This is not a full-garment
GPU stability or physical-fit certification.

Current validation: 310 root tests, 891 Cloth Lab tests, both lints (92/7
warnings), and both builds pass. This collar change is not yet deployed.

## Next WP-43 work

Other collar-to-neckline constructions remain open. The existing `jacketFrontBack()`
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

## WP-43: authored neckline importer prerequisite

The importer now lets a declared neckline starting at a folded torso's center
own its top span. Previously the automatic front/back top edges claimed the
first neckline segment, causing the collar's authored seam to be silently
skipped. Automatic top seams are emitted only when both participating panels
actually have those edges; side seams remain available. Two regression cases
cover declarations on both panels and on only one panel.

Validation: 310 root tests, 893 Cloth Lab tests, both lints and both builds pass.
This change is local, not deployed.

The mf11 Classic Denim Jacket collar investigation remains open. Completing it
requires separate opening-front panels, a folded back with explicit side joins,
and a decision about short-curve mesh sampling. A trial measured roughly 10–13%
length loss on the short back neckline at the default 2 cm mesh spacing despite
exact authored length parity. No mf11 drafting changes are included in this pass.
Do not mark mf11 attachment or physical fit complete based on the importer fix.
