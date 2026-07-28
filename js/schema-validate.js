/* ============================================================
   PatternSpecValidator — thin wrapper around vendored ajv v6
   (js/vendor/ajv6.min.js) for schema/pattern-spec.v1.json.

   Not wired into the running app yet — no AI provider emits this spec,
   and AIGen.build() still consumes its own internal `style` object, not
   this schema. This exists so the schema itself is validated (see
   schema/selftest.js and test/schema.test.js) ahead of that future work.
   See BerryStudio-Upgrade-Plan WP-0.3.

   Loading ajv6.min.js: it's a CommonJS/UMD build (module.exports=...),
   not a real ES module (no `export` statements) — `import` cannot see
   its value directly. Under Node this uses createRequire, which works
   correctly once js/vendor/package.json scopes that directory back to
   CommonJS (the root package.json's "type":"module" would otherwise make
   Node parse this CJS file as an empty ES module). This has NOT been
   verified to work when loaded via a plain browser <script> tag —
   confirmed empirically that this specific minified build's UMD
   "browser global" branch does not attach a bare `window.Ajv` on its
   own. Whoever wires this into the actual browser app (WP-1/WP-3) will
   need a small CommonJS shim first (define global `module`/`exports`
   objects before the script tag runs, then read `module.exports`
   afterward) — a standard, well-known pattern for loading a UMD bundle
   without a bundler, just not implemented here since nothing calls this
   from the browser yet.
   ============================================================ */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Ajv = require('./vendor/ajv6.min.js');

export const PatternSpecValidator = (() => {
  let ajv = null;
  let validateFn = null;

  function init(schema) {
    ajv = new Ajv({ allErrors: true });
    validateFn = ajv.compile(schema);
  }

  function validate(specObj) {
    if (!validateFn) throw new Error('PatternSpecValidator.init(schema) must be called first');
    const valid = validateFn(specObj);
    return {
      valid,
      errors: valid ? [] : (validateFn.errors || []).map((e) => ({
        path: e.dataPath || e.instancePath || '(root)',
        message: e.message,
      })),
    };
  }

  return { init, validate };
})();

// TEMP compat alias for one release — see BerryStudio-Upgrade-Plan WP-0.1.
if (typeof window !== 'undefined') window.PatternSpecValidator = PatternSpecValidator;
