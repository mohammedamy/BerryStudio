/* ============================================================
   Supabase project config — mirrors the root app's js/auth-config.js.

   BerryStudio-Upgrade-Plan-v3.2 WP-42 Stage B: the standalone Cloth Lab
   build (main.jsx, reachable directly at /cloth-lab/ regardless of what
   the root app's UI decides — see plan v3.2 §6) needs its own entitlement
   check, since js/app.js's own gate (loadClothLab()) only covers the two
   entry points IT controls (the iframe src and the embedded mount call),
   not a user typing/bookmarking this subpath directly.

   Deliberately a plain duplicate, not a cross-project import of the root
   app's js/auth-config.js — this is a genuinely separate Vite project
   (own package.json, own node_modules, own build) and reaching outside its
   root for a real source import adds real dev-server/build coupling for
   two constants. Kept in sync by hand — same convention js/auth.js's own
   header comment already uses for SUPABASE_JS_URL vs. the import map.

   Same trust model as the root app's copy: these are PUBLIC identifiers
   (Supabase's security is Row Level Security, not hiding the anon key),
   safe to commit. Never put the service_role key or any OAuth client
   secret here.
   ============================================================ */
export const SUPABASE_URL = "https://ouodxvuvwgueebozzlfq.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91b2R4dnV2d2d1ZWVib3p6bGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDUwNzYsImV4cCI6MjEwMTkyMTA3Nn0.hnNte_q1pg0bS-XonP_uNsYhMAmPftuUevbUAEj99qU";
