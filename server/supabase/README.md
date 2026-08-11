# Supabase project setup (reference)

BerryStudio's account system (WP-42) uses [Supabase](https://supabase.com) as
its backend — Auth (Stage A) and now, as of Stage B, a `profiles` table
holding each account's trial/subscription state. Same "static site + one
small backend for the parts that need one" shape as
`server/billboard-proxy/`, just a managed backend instead of a
hand-written Worker — see `BerryStudio-Upgrade-Plan-v3-2.md` §6 for why.

This folder is **not** deployed anywhere and is **not** run automatically
by anything — it's the tracked source of truth for what the live Supabase
project's dashboard/database should contain, so a from-scratch project
(or a teammate's own Supabase account for local dev) can be reproduced
by hand from these files, and so schema changes show up in code review
like any other change instead of living invisibly in a dashboard.

## One-time setup on a new/empty Supabase project

1. Create a project at [supabase.com](https://supabase.com) (free tier is
   fine for Stage A/B — no paid features used).
2. **Auth providers** (Stage A, unchanged by Stage B): Authentication ->
   Providers. Enable Email. Enable Google and/or Facebook if you want
   those — each needs that provider's own OAuth client ID/secret, created
   in the Google Cloud Console / Meta for Developers respectively, entered
   into Supabase's provider config screen (never into this codebase — see
   `js/auth-config.js`'s own header comment).
3. **Schema** (Stage B, new): open the SQL Editor and run
   `migrations/0001_profiles_entitlement.sql` in full, once. It's
   idempotent (`create table if not exists`, `drop ... if exists` before
   each `create trigger`/`create policy`) — safe to re-run if you're
   unsure whether it already applied.
4. Copy the project's **URL** and **anon public key** (Project Settings ->
   API) into `js/auth-config.js`'s `SUPABASE_URL`/`SUPABASE_ANON_KEY`. Both
   are public identifiers, not secrets — see that file's own header
   comment for why that's safe. **Never** put the `service_role` key
   anywhere in this repo or in client-side code; it lives only in the
   Supabase dashboard (and, if Stage C adds a webhook handler later, in
   that handler's own server-side secret store — same pattern as
   `server/billboard-proxy`'s `OPENAI_API_KEY`).

## Flipping an account to an active subscription (Stage B stopgap)

Stage B has no real payment flow yet (Stage C, PayPal, is deliberately
deferred — plan v3.2 §6). Until then, granting a subscription is a manual
SQL Editor step — see the comment block at the bottom of
`migrations/0001_profiles_entitlement.sql` for the exact `update` statement.
This runs with the Editor's service-role privileges, which is the only
role allowed to write `subscription_status` at all — see that migration's
Row Level Security comment for why regular signed-in users can't do this
themselves from the browser.

## Why there's no `expired` status stored anywhere

`subscription_status` only ever holds `'trial'` or `'active'` in the
database. "Expired" is computed client-side, at read time, from
`trial_started_at` — see `js/entitlement.js`'s header comment. There's no
backend cron job in Stage B to flip a row to `'expired'` on a timer, and
none is needed: the 30-day math is cheap enough to redo on every page
load, and doing it that way means there's nothing to keep in sync between
"the stored status" and "what's actually true right now."
