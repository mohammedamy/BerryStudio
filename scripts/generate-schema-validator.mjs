// Dev-only tool. Regenerates js/vendor/pattern-spec-validate.generated.js from
// schema/pattern-spec.v1.json using ajv's "standalone code" feature.
//
// Why this exists (see BerryStudio-Upgrade-Plan WP-1 security requirement #4):
// ajv's normal runtime compiler (ajv.compile()) builds each validator with
// `new Function(...)` at call time — that requires 'unsafe-eval' in
// script-src, which defeats the point of a strict CSP (confirmed empirically:
// loading the vendored ajv6.min.js UMD build in the browser and calling
// ajv.compile() throws "Function constructor... violates Content-Security-
// Policy"). ajv's own documented answer for CSP-locked apps is "standalone
// validation code": compile the schema ONCE, offline, to a plain JS function
// with zero runtime code generation — that generated file is what actually
// ships to the browser, and it needs no eval, no ajv runtime, nothing.
//
// Run this only when schema/pattern-spec.v1.json changes:
//   npm install --no-save ajv   (devDependency, used only by this script)
//   node scripts/generate-schema-validator.mjs
//
// Do not hand-edit js/vendor/pattern-spec-validate.generated.js.
import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const schemaPath = path.join(root, "schema/pattern-spec.v1.json");
const outPath = path.join(root, "js/vendor/pattern-spec-validate.generated.js");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ code: { source: true, esm: true }, allErrors: true });
const validate = ajv.compile(schema);
const code = standaloneCode(ajv, validate);

const banner = `/* AUTO-GENERATED — do not hand-edit.
   Source: schema/pattern-spec.v1.json
   Regenerate with: node scripts/generate-schema-validator.mjs
   This is ajv's "standalone validation code" output: a plain function with
   no runtime code generation (no new Function/eval), so it satisfies a
   strict CSP with no 'unsafe-eval' in script-src. See
   BerryStudio-Upgrade-Plan WP-1 security requirement #4 and
   js/vendor/README.md. */\n`;

writeFileSync(outPath, banner + code);
console.log(`Wrote ${outPath} (${code.length} bytes)`);
