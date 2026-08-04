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

// Worst-case silent-worker guard: the worker's own try/catch (see
// js/workers/nesting-worker.js) already turns any failure INSIDE
// runNesting into a real {type:"error"} message, so this is only for
// failures the message protocol itself can never carry — the worker
// script failing to load at all (404, syntax error, CSP, no module-worker
// support), or a crash severe enough to kill the worker outright. Without
// this, `nest()`'s Promise would never settle and the caller's "Nesting…"
// button (js/app.js) would stay disabled forever with no way out, the
// exact same class of stuck-UI bug the 3D avatar loader had before its
// own timeout/retry fix. `watchdogMs` is a pure silence timer, reset on
// every progress message — a legitimately long nest that's still actively
// reporting progress is never cut off, only true silence trips it.
const WATCHDOG_MS = 60000;

// `pieces`: [{ id, outline:[[x,y],...], grainLocked }] — the SAME shape
// Canvas.getPieces() already returns (grainLocked is the caller's own
// judgment call, e.g. "has a drawn grain arrow and isn't declared bias" —
// see js/app.js's call site). `onProgress` is optional.
export function nest({ pieces, matWidth, allowRotate, minDistCm, maxIterations }, onProgress) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = getWorker(); }
    catch (err) { reject(new Error('Nesting worker failed to start: ' + (err && err.message || err))); return; }

    let settled = false;
    let watchdog = null;
    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        cleanup();
        reject(new Error('Nesting timed out with no response from the worker.'));
      }, WATCHDOG_MS);
    };
    const cleanup = () => {
      settled = true;
      clearTimeout(watchdog);
      w.removeEventListener('message', handler);
      w.removeEventListener('error', errHandler);
    };
    function handler(e) {
      const data = e.data;
      if (data.type === 'progress') { armWatchdog(); if (onProgress) onProgress(data); return; }
      cleanup();
      if (data.type === 'error') reject(new Error(data.message));
      else resolve(data);
    }
    function errHandler(e) {
      if (settled) return;
      cleanup();
      reject(new Error('Nesting worker crashed: ' + ((e && e.message) || 'unknown error')));
    }
    w.addEventListener('message', handler);
    w.addEventListener('error', errHandler);
    armWatchdog();
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
