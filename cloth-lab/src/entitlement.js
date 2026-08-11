/* ============================================================
   Entitlement check — cloth-lab standalone build.
   BerryStudio-Upgrade-Plan-v3.2 WP-42 Stage B.

   Two parts:
   1. computeEntitlement()/isAllowed() — the pure trial/active/expired math.
      A DELIBERATE, hand-kept-in-sync duplicate of the root app's
      js/entitlement.js (see that file's own header comment for the full
      design rationale) — not a cross-project import, same reasoning as
      auth-config.js in this folder. Covered by entitlement.test.js here,
      mirroring test/entitlement.test.js's cases so a divergence between
      the two copies gets caught by CI in EITHER project, not just one.
   2. checkEntitlement() — the actual Supabase round trip: reads whatever
      session Supabase's SDK already has in this browser's localStorage
      (same-origin as the root app in production — one GitHub Pages
      deploy — so a session started on the root app IS visible here, no
      separate sign-in needed) and fetches the same `profiles` row
      js/auth.js's getProfile() reads. A ONE-SHOT check at mount, not a
      live subscription — this is a defense-in-depth gate for a page
      nobody is expected to sit on for 30 days waiting for a trial to
      expire mid-session (see plan v3.2 §6: "ideally the standalone
      subpath itself refuses to render un-entitled too" — the primary,
      live-updating gate is the root app's own, see js/app.js's
      refreshEntitlement()). A page reload re-checks for real.
   ============================================================ */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './auth-config.js'

const SUPABASE_JS_URL = 'https://esm.sh/@supabase/supabase-js@2.112.3'

export const TRIAL_DAYS = 30
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000

export function computeEntitlement(profile, now) {
  if (!profile) {
    return { status: 'expired', allowed: false, daysRemaining: 0, trialEndsAt: null }
  }
  if (profile.subscriptionStatus === 'active') {
    return { status: 'active', allowed: true, daysRemaining: null, trialEndsAt: null }
  }
  if (!profile.trialStartedAt) {
    return { status: 'expired', allowed: false, daysRemaining: 0, trialEndsAt: null }
  }
  const startedAt = new Date(profile.trialStartedAt).getTime()
  if (!Number.isFinite(startedAt)) {
    return { status: 'expired', allowed: false, daysRemaining: 0, trialEndsAt: null }
  }
  const trialEndsAt = startedAt + TRIAL_MS
  const msRemaining = trialEndsAt - now
  if (msRemaining <= 0) {
    return { status: 'expired', allowed: false, daysRemaining: 0, trialEndsAt }
  }
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000))
  return { status: 'trial', allowed: true, daysRemaining, trialEndsAt }
}

export function isAllowed(entitlement) {
  return !!(entitlement && entitlement.allowed)
}

// Returns { signedIn, entitlement } — never throws; any failure (SDK load,
// network, missing profiles table because the Stage B migration hasn't
// been run) reads as signedIn:false so this page fails toward "show the
// gate", never toward silently rendering the full app on an error. That's
// a deliberately different failure direction than the root app's own
// refreshEntitlement() (which keeps the previous known-good state on a
// fetch error, to avoid punishing a real subscriber for a network
// hiccup) — there is no "previous known-good state" for a page being
// freshly loaded, so there's nothing safe to fall back to except gated.
export async function checkEntitlement() {
  try {
    const { createClient } = await import(/* @vite-ignore */ SUPABASE_JS_URL)
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { signedIn: false, entitlement: null }
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
    const { data: { session } } = await client.auth.getSession()
    if (!session || !session.user) return { signedIn: false, entitlement: null }
    const { data, error } = await client
      .from('profiles')
      .select('subscription_status, trial_started_at')
      .eq('id', session.user.id)
      .maybeSingle()
    if (error || !data) return { signedIn: true, entitlement: computeEntitlement(null, Date.now()) }
    const profile = { subscriptionStatus: data.subscription_status, trialStartedAt: data.trial_started_at }
    return { signedIn: true, entitlement: computeEntitlement(profile, Date.now()) }
  } catch (e) {
    console.error('[entitlement] standalone check failed', e)
    return { signedIn: false, entitlement: null }
  }
}
