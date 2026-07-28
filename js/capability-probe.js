/* ============================================================
   Capability Probe — BerryStudio-Upgrade-Plan WP-2.

   Pure feature-detection, no dependency — safe to import at top level
   (unlike js/workers/local-model-worker.js, which is instantiated only
   on demand). Used by the AI settings panel to show a green/amber/red
   readiness badge for "Route B" (file picker -> WebGPU local inference)
   and to gate that route off honestly on devices that can't run it,
   per the plan's explicit "never let the UI offer route B on a device
   that cannot run it" instruction.

   Honesty note: the exact WebGPU capability-reporting surface has real
   spec churn (GPUAdapter.requestAdapterInfo() is being superseded by a
   plain adapter.info property in newer browsers) and there is no
   standardized "VRAM" number — maxBufferSize/maxStorageBufferBindingSize
   are proxies, not a real VRAM readout. Treat the tier thresholds below
   as tunable, not settled.
   ============================================================ */
export async function probeCapabilities() {
  const result = { webgpu: false, adapterInfo: null, maxBufferSize: null, maxStorageBufferBindingSize: null, tier: 'red', reason: '' };

  if (typeof navigator === 'undefined' || !navigator.gpu) {
    result.reason = 'no navigator.gpu — this browser does not support WebGPU';
    return result;
  }
  result.webgpu = true;

  let adapter = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch (e) {
    result.reason = `navigator.gpu.requestAdapter() threw: ${e && e.message || e}`;
    return result;
  }
  if (!adapter) {
    result.reason = 'requestAdapter() returned null — no compatible GPU adapter available';
    return result;
  }

  result.maxBufferSize = (adapter.limits && adapter.limits.maxBufferSize) || null;
  result.maxStorageBufferBindingSize = (adapter.limits && adapter.limits.maxStorageBufferBindingSize) || null;
  try {
    // requestAdapterInfo() is the older API; `adapter.info` is the newer
    // replacement in more recent browser versions — try both, prefer whichever
    // exists, since which one is present varies by browser/version.
    result.adapterInfo = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null);
  } catch (e) { /* adapter info is optional — leave null rather than fail the whole probe */ }

  const vramProxy = result.maxStorageBufferBindingSize || result.maxBufferSize || 0;
  if (vramProxy >= 1_000_000_000) { result.tier = 'green'; result.reason = 'WebGPU available with a generous buffer-size limit'; }
  else if (vramProxy > 0) { result.tier = 'amber'; result.reason = 'WebGPU available but with a modest buffer-size limit — small models only'; }
  else { result.tier = 'amber'; result.reason = 'WebGPU adapter found but its limits could not be read'; }

  return result;
}

// Route gating helpers — used by the settings UI so the decision logic
// lives in one place rather than being re-derived per call site.
export function canOfferRouteB(capabilities) {
  return !!(capabilities && capabilities.webgpu && capabilities.tier !== 'red');
}
export function canOfferRouteC(capabilities) {
  // Route C (transformers.js) always has a WASM fallback, so it's never
  // hard-gated — just labeled as slower on devices without WebGPU.
  return true;
}
