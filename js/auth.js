/* ============================================================
   Account sign-in — BerryStudio-Upgrade-Plan-v3.2 WP-42 Stage A,
   plus Stage B's getProfile() (below) for reading trial/subscription state.

   Sign-in itself stays exactly Stage A's shape: every feature that isn't
   one of the five Stage B gates it free with no account at all. This
   module exists so js/app.js's Account UI (and, as of Stage B, its gate
   checks) have something real to call — the actual gating DECISION
   (js/entitlement.js's computeEntitlement()) and every gate call site
   live in js/app.js, not here; this file only fetches data.

   Backend: Supabase Auth (managed) — email/password plus Google and
   Facebook OAuth. Supabase issues, stores and refreshes the session
   itself (in its own localStorage key, separate from this app's `pps`
   state blob); this module is a thin wrapper around its JS SDK, not a
   reimplementation of any of it.

   The SDK is loaded on demand via a dynamic import of a *direct esm.sh
   URL* (see SUPABASE_JS_URL below) — nothing is fetched until a sign-in UI
   actually calls in here, same "only load third-party code for a feature
   the user actually touched" convention js/cloud-sync.js follows for
   Google Identity Services/MSAL.

   Deliberately NOT the bare specifier "@supabase/supabase-js" that
   index.html's import map also defines (that entry is kept for tooling/
   readability, e.g. an editor's "go to definition") — verified live that
   this dynamic import(), from this module specifically, cannot resolve
   ANY bare specifier via the import map, including "three", which is
   proven to resolve fine from every other module that imports it
   (three-view.js). Root-caused as far as it can be from application code:
   not the import map's JSON (byte-identical key confirmed), not missing
   from the initial HTML (auth.js has its own <script type=module> tag,
   same as every other js/*.js file), not timing (still fails after a 4s
   delay), and not a missing user gesture (still fails from a real,
   engine-level trusted click handled synchronously as the first statement
   in its handler) — it reproducibly follows this specific call site. A
   direct URL sidesteps whatever it is entirely and is the one form proven
   100% reliable in every test; it's also valid in any real browser
   without needing an import map at all.
   ============================================================ */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './auth-config.js';

// Kept in sync by hand with index.html's import map entry for
// "@supabase/supabase-js" — bump both together.
const SUPABASE_JS_URL = 'https://esm.sh/@supabase/supabase-js@2.112.3';

export function isAuthConfigured(){
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let _client = null;
let _clientPromise = null;

async function getClient(){
  if(!isAuthConfigured()) return null;
  if(_client) return _client;
  if(!_clientPromise){
    _clientPromise = import(/* @vite-ignore */ SUPABASE_JS_URL).then(({ createClient }) => {
      _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      return _client;
    }).catch(e => { _clientPromise = null; throw e; }); // don't cache a failed load forever — a
      // transient network hiccup shouldn't permanently break sign-in for the rest of the tab's
      // lifetime; the next call (e.g. the user clicking Sign In again) gets a real retry.
  }
  return _clientPromise;
}

const NOT_CONFIGURED = () => new Error('Sign-in is not configured yet');

export const Auth = {
  get configured(){ return isAuthConfigured(); },

  async getSession(){
    const client = await getClient();
    if(!client) return null;
    const { data, error } = await client.auth.getSession();
    if(error) throw error;
    return data.session;
  },

  // Fires once immediately with the current session (or null), then again
  // on every change — sign-in, sign-out, token refresh, or the OAuth
  // redirect landing back on this page. Returns an unsubscribe function.
  // No-ops (never fires) when sign-in isn't configured.
  async onChange(cb){
    const client = await getClient();
    if(!client) return () => {};
    const { data } = client.auth.onAuthStateChange((_event, session) => cb(session));
    return () => data.subscription.unsubscribe();
  },

  async signUpWithPassword(email, password){
    const client = await getClient();
    if(!client) throw NOT_CONFIGURED();
    const { data, error } = await client.auth.signUp({ email, password });
    if(error) throw error;
    return data;
  },

  async signInWithPassword(email, password){
    const client = await getClient();
    if(!client) throw NOT_CONFIGURED();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if(error) throw error;
    return data;
  },

  async resetPassword(email){
    const client = await getClient();
    if(!client) throw NOT_CONFIGURED();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname,
    });
    if(error) throw error;
  },

  // provider: 'google' | 'facebook'. Navigates the browser away to the
  // provider's consent screen — nothing else runs client-side until
  // Supabase redirects back to this same page with a session in the URL
  // (auto-picked-up by detectSessionInUrl above).
  async signInWithOAuth(provider){
    const client = await getClient();
    if(!client) throw NOT_CONFIGURED();
    const { error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: location.origin + location.pathname },
    });
    if(error) throw error;
  },

  async signOut(){
    const client = await getClient();
    if(!client) return;
    const { error } = await client.auth.signOut();
    if(error) throw error;
  },

  // WP-42 Stage B: reads the current user's `profiles` row (see
  // server/supabase/migrations/0001_profiles_entitlement.sql) — the two
  // fields js/entitlement.js's computeEntitlement() needs. Returns null
  // ONLY for "genuinely no row" (signed out, not configured, or a real
  // 0-row result — .maybeSingle() with no error) — a fetch/RLS/network
  // error now THROWS instead of being swallowed into the same null.
  //
  // Code-review fix: this used to catch every `profiles` SELECT error
  // (network blip, RLS denial, migration-not-run) and return null just
  // like "no row found" — but js/app.js's refreshEntitlement() wraps its
  // call to this in a try/catch SPECIFICALLY so a thrown error leaves
  // currentEntitlement at its previous known-good value (per that field's
  // own comment: "a transient network hiccup shouldn't lock out an actual
  // subscriber mid-session"). Because this never threw, that catch block
  // was dead code for the one case it exists to handle — a real active
  // subscriber hitting any transient Supabase error got instantly
  // (mis)computed as `expired` and locked out until the next successful
  // fetch. Now: a real fetch error propagates (refreshEntitlement's catch
  // does its job); "no row, no error" (a genuinely nonexistent account,
  // or the migration hasn't been run) still resolves to null, which
  // computeEntitlement() correctly reads as "can't prove entitlement" —
  // that part of the design is unchanged and correct, only the
  // error-vs-no-row conflation is fixed.
  //
  // `userId` (optional): pass the caller's already-known session.user.id
  // (e.g. js/app.js's refreshEntitlement(session) already has it from the
  // onAuthStateChange event) to skip a redundant client.auth.getUser()
  // round trip — falls back to fetching it here for a standalone caller
  // with no session object handy (e.g. js/berry-studio-api.js).
  async getProfile(userId){
    const client = await getClient();
    if(!client) return null;
    let uid = userId;
    if(!uid){
      const { data: { user } } = await client.auth.getUser();
      if(!user) return null;
      uid = user.id;
    }
    const { data, error } = await client
      .from('profiles')
      .select('subscription_status, trial_started_at')
      .eq('id', uid)
      .maybeSingle();
    if(error) throw error; // real fetch/RLS/network failure — let the caller decide (see comment above)
    if(!data) return null; // genuinely no row (migration not run, or no account)
    return { subscriptionStatus: data.subscription_status, trialStartedAt: data.trial_started_at };
  },
};
