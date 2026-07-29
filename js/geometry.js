/* ============================================================
   WP-14: polygon offsetting — per-edge seam allowance + real join
   styles. Pure, DOM-free (unlike most of js/canvas.js) so it's
   unit-testable directly, matching the extraction pattern WP-11/WP-12
   used for js/nesting-core.js and js/pattern-export.js.
   ============================================================ */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

// The original single-distance, miter-only offset, moved here verbatim
// from js/canvas.js EXCEPT for one real bug fixed in the move: `sign`
// was `area>0?1:-1`, which for every real pattern piece in this app
// (outline arrays all wind with positive shoelace area, e.g.
// data.js's front_bodice) produced normals pointing INWARD, not
// outward — confirmed against live app data: offsetting a real bodice
// piece by the app's own default seamCm=1 shrank its area from ~488
// to ~376 instead of growing it to ~610. That made both the dashed
// "seam allowance" preview on the 2D canvas and PatternValidator's
// seamAllowance check silently backward (inward) for every pattern
// this app has ever shipped. Fixed by flipping the sign; the rest of
// the algorithm (clamped-bisector miter, cosA floor of 0.3 to cap
// spike length at sharp angles) is unchanged.
function offsetUniformMiter(poly, d) {
  const n = poly.length, out = [];
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n]; area += x1 * y2 - x2 * y1; }
  const sign = area > 0 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const e1 = norm(sub(p1, p0)), e2 = norm(sub(p2, p1));
    const nrm1 = [-e1[1] * sign, e1[0] * sign], nrm2 = [-e2[1] * sign, e2[0] * sign];
    const bis = norm([nrm1[0] + nrm2[0], nrm1[1] + nrm2[1]]);
    const cosA = Math.max(0.3, bis[0] * nrm1[0] + bis[1] * nrm1[1]);
    out.push([p1[0] + bis[0] * d / cosA, p1[1] + bis[1] * d / cosA]);
  }
  return out;
}

// General offset: `opts.perEdge` is an array parallel to the polygon's
// edges (index i = the edge from poly[i] to poly[i+1]) giving a distance
// override for that edge, falling back to the uniform `d` where absent.
// `opts.join` adds 'round' (arc fillet) and 'bevel' (single chamfer)
// alongside the default 'miter', applied only at CONVEX corners — reflex
// (concave) corners always resolve via line-line intersection regardless
// of join style, since a "join style" is a treatment for an outward
// corner; applying a fillet/chamfer to an inward corner would carve a
// notch into the offset polygon rather than smooth a corner of it (the
// same convention libraries like Clipper2 use).
// WP-14: "walk the seam" support — given an outline and an inclusive
// index range [fromIdx, toIdx] (following the outline's own point
// order, wrapping past the end if toIdx < fromIdx — the same
// convention js/fancy-patterns.js's `edges[].seamId` metadata uses),
// return the point at `fraction` (0-1) of that sub-path's own arc
// length. This is the same "walk segments, accumulate cumulative
// distance" technique js/validate.js's arcPositionFraction uses for
// notch-alignment checking, just inverted (fraction -> point instead
// of point -> fraction) and scoped to a declared seam edge rather than
// the whole outline's perimeter.
export function seamPointAtFraction(outline, fromIdx, toIdx, fraction) {
  const n = outline.length;
  const idxList = [fromIdx];
  let i = fromIdx;
  while (i !== toIdx) { i = (i + 1) % n; idxList.push(i); }
  const pts = idxList.map((idx) => outline[idx]);
  const segLens = [];
  let total = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const l = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
    segLens.push(l); total += l;
  }
  if (total === 0) return pts[0].slice();
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let walked = 0;
  for (let k = 0; k < segLens.length; k++) {
    if (walked + segLens[k] >= target || k === segLens.length - 1) {
      const t = segLens[k] > 0 ? Math.max(0, Math.min(1, (target - walked) / segLens[k])) : 0;
      return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t];
    }
    walked += segLens[k];
  }
  return pts[pts.length - 1].slice();
}

export function offsetPoly(poly, d, opts = {}) {
  const { join = 'miter', perEdge = null } = opts;
  if (join === 'miter' && !perEdge) return offsetUniformMiter(poly, d);

  const n = poly.length;
  if (n < 3) return poly.slice();
  let area = 0;
  for (let i = 0; i < n; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n]; area += x1 * y2 - x2 * y1; }
  const windingSign = area > 0 ? 1 : -1;   // raw winding direction — used only for convexity
  const sign = -windingSign;               // outward-normal direction — see offsetUniformMiter's fix above
  const distAt = (edgeIdx) => (perEdge && perEdge[edgeIdx] != null) ? perEdge[edgeIdx] : d;

  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const dir = norm(sub(b, a));
    const nrm = [-dir[1] * sign, dir[0] * sign];
    const di = distAt(i);
    return { a: [a[0] + nrm[0] * di, a[1] + nrm[1] * di], b: [b[0] + nrm[0] * di, b[1] + nrm[1] * di], dir };
  });

  const lineIntersect = (p1, d1, p2, d2) => {
    const denom = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / denom;
    return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
  };

  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = edges[(i - 1 + n) % n], curr = edges[i];
    const cross = prev.dir[0] * curr.dir[1] - prev.dir[1] * curr.dir[0];
    const convex = windingSign > 0 ? cross > 0 : cross < 0;
    if (!convex || join === 'miter') {
      out.push(lineIntersect(prev.a, prev.dir, curr.a, curr.dir) || curr.a.slice());
    } else if (join === 'bevel') {
      out.push(prev.b.slice(), curr.a.slice());
    } else { // round
      const center = poly[i];
      const r = distAt(i);
      const a0 = Math.atan2(prev.b[1] - center[1], prev.b[0] - center[0]);
      const a1 = Math.atan2(curr.a[1] - center[1], curr.a[0] - center[0]);
      let da = a1 - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const steps = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 8)));
      for (let s = 0; s <= steps; s++) {
        const a = a0 + da * (s / steps);
        out.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r]);
      }
    }
  }
  return out;
}
