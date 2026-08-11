/* ============================================================
   Supabase project config — BerryStudio-Upgrade-Plan-v3.2 WP-42 Stage A.

   These two values are PUBLIC identifiers, not secrets. Supabase's
   security model is enforced server-side by Row Level Security policies,
   not by hiding the anon key — the same trust model as a Firebase web
   config object or a Stripe *publishable* key. It's safe to commit these
   once real values are filled in.

   Never put here: the service_role key, or any OAuth provider's client
   secret (Google/Facebook). Those live only in the Supabase dashboard
   (Authentication → Providers) and this codebase never sees them —
   Supabase's hosted /auth/v1/authorize + /callback flow does the token
   exchange server-side.

   Left empty by default. js/auth.js's isAuthConfigured() checks these
   before doing anything, and the Account UI shows a plain "sign-in isn't
   set up yet" state rather than throwing — the same "do not fake
   capability" rule the AI provider adapters follow (see js/ai-keystore.js
   and js/ai-providers.js).
   ============================================================ */
export const SUPABASE_URL = "https://ouodxvuvwgueebozzlfq.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91b2R4dnV2d2d1ZWVib3p6bGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDUwNzYsImV4cCI6MjEwMTkyMTA3Nn0.hnNte_q1pg0bS-XonP_uNsYhMAmPftuUevbUAEj99qU";
