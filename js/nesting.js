/* ============================================================
   BerryStudio-Upgrade-Plan WP-11 — main-thread client for the true
   polygon nesting worker. Lazy worker instantiation (only on first
   actual nest request, never at module load) and a Promise+progress
   wrapper around postMessage — the exact same shape js/ai-providers.js
   already uses for its own worker (getLocalWorker/postToWorker), so
   there's one established convention for "talk to a Worker" in this
   codebase, not two.

   This is also the one new piece of nesting-related surface WP-15's
   automation API needs later — nesting was previously private inside
   js/app.js's own IIFE (nestShelfPack), unreachable from outside; a
   `BerryStudio.nest(...)` facade can import and call `nest()` here
   directly, same as it already can for Canvas/AIGen/PatternValidator.
   ============================================================ */

let worker = null;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./workers/nesting-worker.js', import.meta.url), { type: 'module' });
  }
  return worker;
}

// `pieces`: [{ id, outline:[[x,y],...], grainLocked }] — the SAME shape
// Canvas.getPieces() already returns (grainLocked is the caller's own
// judgment call, e.g. "has a drawn grain arrow and isn't declared bias" —
// see js/app.js's call site). `onProgress` is optional.
export function nest({ pieces, matWidth, allowRotate, minDistCm, maxIterations }, onProgress) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    function handler(e) {
      const data = e.data;
      if (data.type === 'progress') { if (onProgress) onProgress(data); return; }
      w.removeEventListener('message', handler);
      if (data.type === 'error') reject(new Error(data.message));
      else resolve(data);
    }
    w.addEventListener('message', handler);
    w.postMessage({ type: 'nest', pieces, matWidth, allowRotate, minDistCm, maxIterations });
  });
}

// Real cancellation — the worker keeps annealing until its next
// isCancelled() poll, then resolves with {cancelled:true, ...best result
// so far} through the SAME "result" message nest()'s Promise is already
// waiting on, rather than rejecting or terminating the worker outright.
export function cancelNest() {
  if (worker) worker.postMessage({ type: 'cancel' });
}
