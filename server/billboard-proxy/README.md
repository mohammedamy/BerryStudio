# AI Fashion Billboard proxy (reference)

BerryStudio is a static site (no build step, no server) — but the AI Fashion
Billboard feature in the app's AI tab needs to call OpenAI's image-generation
API, which requires a secret API key. That key can never live in `js/`: this
is a public site, so anything in client-side code is readable by anyone who
opens devtools on the deployed page.

This folder is a minimal, ready-to-deploy proxy that holds `OPENAI_API_KEY`
server-side and does the OpenAI call on the app's behalf. It is **not**
included in the site's GitHub Pages deploy (`.github/workflows/deploy-pages.yml`
only copies `index.html css icons js manifest.webmanifest sw.js`) — you deploy
this separately, once, to Cloudflare's free tier.

## Deploy (Cloudflare Workers, free tier)

1. Install the CLI (once): `npm install -g wrangler`
2. From this folder, log in: `wrangler login`
3. Create `wrangler.toml` here:
   ```toml
   name = "berrystudio-billboard-proxy"
   main = "worker.js"
   compatibility_date = "2026-01-01"
   ```
4. Set your OpenAI key as a secret (never goes in a file, never gets committed):
   ```
   wrangler secret put OPENAI_API_KEY
   ```
5. Deploy: `wrangler deploy`
6. Wrangler prints a URL like `https://berrystudio-billboard-proxy.<you>.workers.dev` —
   paste that into BerryStudio's **Settings → AI Image endpoint**.

Any other host that can run a plain JS fetch handler works too (Vercel/Netlify
Functions, a small Express server, etc.) — `worker.js` is standard Fetch API
code (`fetch`, `Request`, `Response`, `FormData`) with no Workers-only APIs,
so porting it is mostly copy-paste plus whatever that platform's env-var/secret
mechanism is.

## Before you rely on this

- **Model name**: this targets OpenAI's documented `gpt-image-1` `/v1/images/edits`
  shape (multipart form, repeated `image[]` fields, `size`/`quality` enums).
  The ComfyUI workflow this was ported from configures model `"gpt-image-2"` —
  if that's since shipped as a real model with a different request shape,
  adjust `buildForm()` in `worker.js` to match its actual docs; the model
  string itself is already passed through from the app.
- **Cost**: every call spends real OpenAI credit on your account. There's no
  per-user quota here — anyone who has the worker URL can call it.
- **Locking it down further**: the CORS check in `worker.js` only stops
  *browser* requests from origins other than your own site — it does nothing
  against someone calling the worker URL directly (curl, a script, etc.),
  since CORS is a browser convention, not real access control. If you want
  actual protection, the standard next step is a shared-secret header: check
  a env-configured secret against a request header in `worker.js`, and have
  BerryStudio send that same header — but note that header would then also
  be sitting in the browser's own JS/network tab on the public site, so it
  raises the bar (stops casual URL scraping) without being airtight. Genuine
  per-user auth would need an actual login system, which is out of scope for
  a personal pattern-design tool like this.
