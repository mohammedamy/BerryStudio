/* ============================================================
   WP-14: dart manipulation — pivot, slash-and-spread, transfer.
   Pure functions over this app's dart shape: [apex, legA, legC]
   (apex at index 0 — confirmed against every real dart in js/data.js
   and js/ai.js, and against js/canvas.js's own on-canvas renderer,
   which draws legA -> apex -> legC. A prior WP-12 export helper had
   assumed apex was at index 1 instead; fixed alongside this module,
   see js/pattern-export.js.)
   ============================================================ */

function rotatePoint(pt, pivot, angleRad) {
  const dx = pt[0] - pivot[0], dy = pt[1] - pivot[1];
  const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
  return [pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos];
}

// The angle, in radians, between the two legs as seen from the apex —
// the dart's "intake": how much fabric this dart removes. Used by the
// functions below (and their tests) to confirm which operations
// preserve intake (pivot, transfer) and which deliberately change it
// (slash-and-spread, which exists specifically to ADD fullness).
export function dartIntakeAngle(dart) {
  const [apex, legA, legC] = dart;
  const a = [legA[0] - apex[0], legA[1] - apex[1]];
  const c = [legC[0] - apex[0], legC[1] - apex[1]];
  const dot = a[0] * c[0] + a[1] * c[1];
  const magA = Math.hypot(a[0], a[1]), magC = Math.hypot(c[0], c[1]);
  if (!magA || !magC) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magA * magC))));
}

// Pivot: rotate a dart's two legs around ITS OWN apex by `angleRad`.
// The apex (and so the dart's anchor point on the seamline structure
// it's cut from) doesn't move; the "opening direction" of the V does.
// Leg lengths and intake angle are both preserved exactly — this is a
// rigid rotation of two points around a fixed third point.
export function pivotDart(dart, angleRad) {
  const [apex, legA, legC] = dart;
  return [apex, rotatePoint(legA, apex, angleRad), rotatePoint(legC, apex, angleRad)];
}

// Transfer: rotate the ENTIRE dart (apex included) around an EXTERNAL
// pivot point — the real "dart transfer" technique, where a fixed
// anatomical reference (e.g. the bust point on a bodice) is used to
// swing a whole dart from one style-line to another while its shape
// (both leg lengths, and thus intake) stays exactly the same; only its
// position and orientation relative to the rest of the piece changes.
export function transferDart(dart, pivotPoint, angleRad) {
  return dart.map((pt) => rotatePoint(pt, pivotPoint, angleRad));
}

// Slash-and-spread: widen the dart's own mouth (the legA-legC edge) by
// `spreadCm`, symmetrically, keeping the apex fixed — the classic
// technique for deliberately ADDING fullness/intake at a dart (e.g.
// turning a plain dart into a gathered or flared opening), as opposed
// to pivot/transfer which preserve it. Scoped to the dart's own local
// geometry (not a whole-outline cut-and-insert-paper operation) — this
// is the well-defined, testable half of the technique; wiring a
// spread dart's new leg positions back into the rest of a piece's
// outline is a separate, piece-specific concern left to the caller.
export function slashAndSpread(dart, spreadCm) {
  const [apex, legA, legC] = dart;
  const dx = legC[0] - legA[0], dy = legC[1] - legA[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const half = spreadCm / 2;
  return [apex, [legA[0] - ux * half, legA[1] - uy * half], [legC[0] + ux * half, legC[1] + uy * half]];
}
