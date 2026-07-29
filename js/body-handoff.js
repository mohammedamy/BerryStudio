/* ============================================================
   BerryStudio-Upgrade-Plan WP-10 — the "Open in Fit Studio" handoff
   between the standalone BodyForm page (body.html) and the main app
   (index.html). sessionStorage + a URL flag, not a live postMessage —
   simpler, and works identically whether the main app's Cloth Lab tab
   ends up in iframe or embedded engine mode (js/app.js's
   state.clothLabEngine), since neither engine needs to be alive yet
   when the handoff is written.
   ============================================================ */

const STORAGE_KEY = "bodyFormHandoff";
export const HANDOFF_URL_FLAG = "fromBodyForm";

// Called by body.html's "Open in Fit Studio" button just before
// navigating to `index.html?fromBodyForm=1`.
export function saveBodyFormHandoff({ category, measurements }) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ category, measurements }));
}

// Called once by js/app.js's init() on boot. Reads-and-clears — a handoff
// applies exactly once; reloading Fit Studio afterward shouldn't keep
// re-snapping measurements back to whatever BodyForm last sent. Returns
// null if there's nothing pending, or the URL doesn't carry the flag
// body.html's link sets (so a plain visit to index.html is untouched).
export function consumeBodyFormHandoff() {
  const url = new URL(location.href);
  if (!url.searchParams.has(HANDOFF_URL_FLAG)) return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  url.searchParams.delete(HANDOFF_URL_FLAG);
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
