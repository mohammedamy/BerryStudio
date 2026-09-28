# P7-07 local brief benchmark

`corpus.json` is a small, versioned regression benchmark for the deterministic
local brief foundation. It covers English/Arabic supported extraction, conflict
clarification, unsupported-intent abstention, required-choice clarification and
reviewed-field lock preservation.

Run it with `node --test test/p7-07-brief-benchmark.test.js`.

It deliberately does not measure hosted-model response quality, advice,
alternative design usefulness, maker acceptance, fit, construction quality,
cost, latency or production readiness. Those require a provider-specific,
held-out and human-reviewed evaluation before they can be reported.
