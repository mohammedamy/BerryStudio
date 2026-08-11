/* ============================================================
   Entitlement math — BerryStudio-Upgrade-Plan-v3.2 WP-42 Stage B.

   Pure, framework-free, no network/DOM access — deliberately written and
   tested in isolation before js/app.js ever calls it, same "CPU reference
   first" discipline WP-35's dihedralBend.js and WP-35b's spatialHash.js
   used for their own math. A subscription-gating bug is exactly the kind
   of thing you want caught by a fast, deterministic unit test, not found
   live by a signed-in user losing access they paid for (or, the opposite
   failure, keeping access they shouldn't have).

   Design (see plan v3.2 §6): the database only ever stores two real facts
   per account — `subscriptionStatus` ('trial' | 'active', defaulting to
   'trial' at sign-up) and `trialStartedAt` (set once, at sign-up, never
   rewritten). There is no database column for "expired" and nothing ever
   flips a row to it — Stage B has no backend cron, so "expired" is always
   a DERIVED, client-computed state: `trial` whose `trialStartedAt` is more
   than TRIAL_DAYS in the past, and whose status was never manually flipped
   to `active`. `active` always wins regardless of trial age — that's the
   one field a real PayPal webhook (Stage C) or a manual admin flip (the
   Stage B stopgap, see server/supabase/README.md) will ever need to touch.

   Not modeled here at all: signed-out (no account, no row to compute from)
   — js/app.js's currentEntitlement is simply `null` in that case, and
   every gate check treats `null` as gated. That's a currentSession check,
   not a math problem, so it doesn't belong in this pure module.
   ============================================================ */

export const TRIAL_DAYS = 30;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

// The five surfaces plan v3.2 §6 names — kept here as the single source of
// truth for "what's gated" so a future surface can be added/removed in one
// place. js/app.js's individual gate call sites reference this only for
// documentation/testing purposes; each one still gates itself explicitly
// (no dynamic dispatch table) so a grep for GATED_SURFACES.ai finds a real,
// readable call site, not a string keyed into a lookup.
export const GATED_SURFACES = Object.freeze(['ai', 'library', 'quickDraft', 'export', 'clothLab']);

// `profile`: { subscriptionStatus: 'trial'|'active', trialStartedAt: string|number|Date }
// or null/undefined (no row yet, e.g. the Stage B migration hasn't run, or
// the fetch failed) — returns the same shape a genuinely-expired trial
// would, since "can't prove entitlement" and "entitlement expired" both
// mean "don't grant the gated surfaces" for a paid feature. The one
// exception (network hiccups shouldn't lock out a real subscriber) is
// handled by the CALLER (js/auth.js/js/app.js) keeping the previous known
// entitlement on a fetch error rather than calling this with null — this
// function itself has no opinion on stale-vs-fresh, only on the data it's
// actually given.
// `now`: epoch ms — pass explicitly (never Date.now() implicitly-default
// so tests are deterministic).
export function computeEntitlement(profile, now) {
  if (!profile) {
    return { status: 'expired', allowed: false, daysRemaining: 0, trialEndsAt: null };
  }
  // Checked before the trialStartedAt requirement below, deliberately —
  // an admin-flipped `active` row is entitled even if trialStartedAt is
  // missing/null, which real rows never have (set once at sign-up) but a
  // hand-edited admin flip (see server/supabase/README.md) plausibly could.
  if (profile.subscriptionStatus === 'active') {
    return { status: 'active', allowed: true, daysRemaining: null, trialEndsAt: null };
  }
  if (!profile.trialStartedAt) {
    return { status: 'expired', allowed: false, daysRemaining: 0, trialEndsAt: null };
  }
  const startedAt = new Date(profile.trialStartedAt).getTime();
  if (!Number.isFinite(startedAt)) {
    return { status: 'expired', allowed: false, daysRemaining: 0, trialEndsAt: null };
  }
  const trialEndsAt = startedAt + TRIAL_MS;
  const msRemaining = trialEndsAt - now;
  if (msRemaining <= 0) {
    return { status: 'expired', allowed: false, daysRemaining: 0, trialEndsAt };
  }
  // Ceil, not floor/round: someone 30 minutes into day 1 has "30 days
  // remaining" in the plain-English sense a trial-countdown UI needs, not
  // "0 days remaining" — the trial is still fully alive until msRemaining
  // actually hits zero, so the displayed count should only drop once a
  // full day has actually elapsed.
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  return { status: 'trial', allowed: true, daysRemaining, trialEndsAt };
}

// Convenience for the common "signed in or not" fold js/app.js needs at
// every gate call site: session-less callers pass `null` for entitlement
// directly rather than synthesizing a fake expired profile.
export function isAllowed(entitlement) {
  return !!(entitlement && entitlement.allowed);
}
