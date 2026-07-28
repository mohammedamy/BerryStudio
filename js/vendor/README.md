# Vendored dependencies

## ajv6.min.js

[ajv](https://ajv.js.org) v6.14.0 (dist build, MIT licensed), vendored rather
than fetched from a CDN or added as an npm runtime dependency — see
BerryStudio-Upgrade-Plan WP-0.3. Reasons:

- The root app is deliberately build-free/offline-first (no bundler), and
  this is the last ajv major version that ships a genuine dependency-free
  single-file UMD build — v7/v8 need a bundler to produce one.
- Nothing in the shipped app calls this yet (the Pattern Spec schema it
  validates isn't wired into the AI generator until a future work package),
  so there's no reason to add a live network dependency for an unused
  feature.
- This exact file loads correctly under plain Node via `require()` (see
  `package.json`'s nested `type: "commonjs"` override in this directory,
  needed because the root package.json's `"type":"module"` would otherwise
  make Node parse this CommonJS file as an empty ES module) — the same test
  suite (`js/schema-validate.js`, `test/schema.test.js`) validates the
  literal bytes that would ship to the browser, not a separately-installed
  copy.
- **Known limitation, not yet solved**: confirmed empirically that this
  build's UMD "browser global" branch does NOT attach a bare `window.Ajv`
  when loaded via a plain classic `<script>` tag (its minified global-object
  fallback appears to discard the factory's return value). Not an issue
  yet — nothing loads this from the browser this session — but whoever
  wires `js/schema-validate.js` into the actual running app (WP-1/WP-3)
  will need a small CommonJS shim first: define global `window.module =
  {exports:{}}` and `window.exports = window.module.exports` before the
  `<script>` tag runs, then read `window.module.exports` afterward. A
  standard, well-known pattern for loading a UMD bundle without a bundler.

Source: `npm pack ajv@6` → `package/dist/ajv.min.js`. To update, repeat that
and re-copy — do not hand-edit this file.
