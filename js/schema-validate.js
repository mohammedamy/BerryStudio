/* ============================================================
   PatternSpecValidator — validates a garment spec against
   schema/pattern-spec.v1.json.

   Used by the WP-3 spec-first generation pipeline
   (js/ai-spec-pipeline.js) to validate a provider's structured-output
   response before it's ever handed to AIGen.build(). See
   BerryStudio-Upgrade-Plan WP-0.3 (schema) and WP-3 (its first real
   caller).

   Backed by js/vendor/pattern-spec-validate.generated.js — a
   precompiled validator function with zero runtime code generation.
   This is deliberate, not incidental: ajv's normal runtime compiler
   (ajv.compile()) builds each validator with `new Function(...)`,
   which throws under BerryStudio's CSP (script-src has no
   'unsafe-eval' — WP-1 security requirement #4). See
   js/vendor/README.md for the full story and how to regenerate the
   validator if schema/pattern-spec.v1.json ever changes.
   ============================================================ */
import validate from './vendor/pattern-spec-validate.generated.js';

export const PatternSpecValidator = (() => {
  // The validator is precompiled specifically for pattern-spec.v1.json, so
  // init() no longer loads or compiles anything — kept as a no-op for API
  // stability (existing/future callers can still `await init(schema)`) with
  // a light sanity check that the caller passed the schema this validator
  // actually matches, in case schema/pattern-spec.v1.json is ever versioned.
  function init(schema) {
    if (schema && schema.$id && schema.$id !== 'https://berrystudio.app/schema/pattern-spec.v1.json') {
      throw new Error('PatternSpecValidator is precompiled for pattern-spec.v1.json; regenerate js/vendor/pattern-spec-validate.generated.js for a different schema (see scripts/generate-schema-validator.mjs)');
    }
  }

  function validateSpec(specObj) {
    const valid = validate(specObj);
    return {
      valid,
      errors: valid ? [] : (validate.errors || []).map((e) => ({
        path: e.instancePath || '(root)',
        message: e.message,
      })),
    };
  }

  return { init, validate: validateSpec };
})();
