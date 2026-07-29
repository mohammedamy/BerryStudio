/* ============================================================
   Nesting worker — BerryStudio-Upgrade-Plan WP-11.

   Same module-worker + {type, ...} message-protocol convention as the
   existing js/workers/local-model-worker.js: plain objects both
   directions, a "cancel" message flips a flag the algorithm polls between
   iterations rather than actually terminating the worker (letting it
   return the best result found so far instead of nothing at all).

   Message protocol (main thread -> worker):
     { type:"nest", pieces:[{id, outline:[[x,y],...], grainLocked}],
       matWidth, allowRotate, minDistCm, maxIterations }
     { type:"cancel" }

   Message protocol (worker -> main thread):
     { type:"progress", utilization, iteration, maxIterations }
     { type:"result", placements, totalHeight, utilization, cancelled, error? }
   ============================================================ */
import { runNesting } from '../nesting-core.js';

let cancelled = false;

function post(msg) { self.postMessage(msg); }

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'nest') { post({ type: 'error', message: `unknown message type "${msg.type}"` }); return; }

  cancelled = false;
  try {
    const result = runNesting({
      pieces: msg.pieces,
      matWidth: msg.matWidth,
      allowRotate: msg.allowRotate,
      minDistCm: msg.minDistCm || 0,
      maxIterations: msg.maxIterations || 400,
      onProgress: (p) => post({ type: 'progress', ...p }),
      isCancelled: () => cancelled,
    });
    post({ type: 'result', ...result });
  } catch (err) {
    post({ type: 'error', message: (err && err.message) || String(err) });
  }
};
