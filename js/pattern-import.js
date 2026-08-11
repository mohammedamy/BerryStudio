/* ============================================================
   Pattern file import — SVG and DXF -> this app's piece shape
   ({ outline:[[x,y]...], curves:[{fromIdx,toIdx,c1,c2}], name }),
   in the same cm, y-DOWN working space js/canvas.js's pieces already
   use. Pure functions (no DOM parser, no canvas context) so this is
   directly unit-testable via `node --test`, same rationale as
   js/pattern-export.js — the mirror-image module: that one WRITES
   SVG/DXF from pieces, this one READS them back (from this app's own
   exports, or from any other pattern-drafting/CAD software).

   Only CLOSED shapes become pieces (a piece's outline is a closed
   polygon everywhere else in this app — hitPiece/centroid/inPoly all
   assume it) — same "must be closed" rule the Promote tool already
   applies to sketch strokes (js/canvas.js's isSketchClosed/
   promoteSketchToPiece). Anything open is skipped and counted in
   `warnings`, never silently dropped without a trace.
   ============================================================ */

// ---- shared geometry helpers ----

// A real cubic bezier, sampled into `n` intermediate points — mirrors
// js/canvas.js's own cubicBezierSample() exactly (same math), duplicated
// here rather than imported since that one lives inside Canvas's closure
// and isn't exported.
function sampleCubic(p0, c1, c2, p1, n) {
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([
      u*u*u*p0[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*p1[0],
      u*u*u*p0[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*p1[1],
    ]);
  }
  return pts;
}
function dist(a, b) { return Math.hypot(a[0]-b[0], a[1]-b[1]); }

// Appends one bezier span (already-sampled `pts`, last of which is the
// true endpoint) onto a growing {points, curves} subpath and records its
// {fromIdx,toIdx,c1,c2} metadata — the exact shape js/canvas.js's own
// curveEdge()/spliceOutline() convention uses, so an imported curve is
// just as live/editable (Curve Edge tool, DXF/PDF curve layers) as one
// drawn in-app.
function appendCurveSpan(sub, c1, c2, pts) {
  const fromIdx = sub.points.length - 1;
  sub.points.push(...pts);
  sub.curves.push({ fromIdx, toIdx: sub.points.length - 1, c1, c2 });
}

const CIRCLE_KAPPA = 0.5522847498307936;
// Four true cubic-bezier quadrants approximating a circle/ellipse of
// radius rx,ry centered at cx,cy — real curve metadata (not just a
// sampled polygon), same quality bar as everything else in this module.
function ellipseSubpath(cx, cy, rx, ry, samplesPerQuadrant) {
  const k = CIRCLE_KAPPA;
  const pts = [
    [cx+rx, cy], [cx, cy+ry], [cx-rx, cy], [cx, cy-ry],
  ];
  const handles = [
    [[cx+rx, cy+ry*k], [cx+rx*k, cy+ry]],
    [[cx-rx*k, cy+ry], [cx-rx, cy+ry*k]],
    [[cx-rx, cy-ry*k], [cx-rx*k, cy-ry]],
    [[cx+rx*k, cy-ry], [cx+rx, cy-ry*k]],
  ];
  const sub = { points: [pts[0]], curves: [], closed: true };
  for (let i = 0; i < 4; i++) {
    const p1 = pts[(i+1)%4], [c1, c2] = handles[i];
    appendCurveSpan(sub, c1, c2, sampleCubic(sub.points[sub.points.length-1], c1, c2, p1, samplesPerQuadrant));
  }
  sub.points.pop(); // last sampled point duplicates the start point (closed loop)
  return sub;
}

// Circle through 3 points — used to recover a DXF bulge segment's true
// center/radius without hand-deriving apothem sign conventions (a common
// source of mirrored/backwards arcs in bulge-import code): p0, the
// bulge-derived arc midpoint, and p1 are all real points ON the arc, so
// their circumcircle IS the arc's circle, unambiguously.
function circumcenter(a, b, c) {
  const ax=a[0], ay=a[1], bx=b[0], by=b[1], cx=c[0], cy=c[1];
  const d = 2*(ax*(by-cy) + bx*(cy-ay) + cx*(ay-by));
  if (Math.abs(d) < 1e-9) return null; // collinear -> not a real arc
  const ux = ((ax*ax+ay*ay)*(by-cy) + (bx*bx+by*by)*(cy-ay) + (cx*cx+cy*cy)*(ay-by)) / d;
  const uy = ((ax*ax+ay*ay)*(cx-bx) + (bx*bx+by*by)*(ax-cx) + (cx*cx+cy*cy)*(bx-ax)) / d;
  return [ux, uy];
}

// DXF LWPOLYLINE/POLYLINE per-vertex "bulge" (group 42): tan(includedAngle/4),
// signed by turn direction. Flattens the segment from p0 to p1 into a
// polyline (no live curve metadata — a circular arc isn't a single cubic
// bezier, and DXF interop is rare enough not to warrant the quadrant-split
// treatment ellipseSubpath() gives true ellipses); `warnings`-worthy but not
// wrong. See circumcenter() above for why this is robust to sign mistakes.
export function bulgeArcPoints(p0, p1, bulge, samples) {
  if (!bulge) return [p1.slice()];
  const c = dist(p0, p1);
  if (!c) return [p1.slice()];
  const dir = [(p1[0]-p0[0])/c, (p1[1]-p0[1])/c];
  const leftPerp = [-dir[1], dir[0]];
  const mid = [(p0[0]+p1[0])/2, (p0[1]+p1[1])/2];
  const sagitta = bulge * c / 2;
  const arcMid = [mid[0] + leftPerp[0]*sagitta, mid[1] + leftPerp[1]*sagitta];
  const center = circumcenter(p0, arcMid, p1);
  if (!center) return [p1.slice()];
  const r = dist(p0, center);
  const a0 = Math.atan2(p0[1]-center[1], p0[0]-center[0]);
  const aMidRaw = Math.atan2(arcMid[1]-center[1], arcMid[0]-center[0]);
  const a1Raw = Math.atan2(p1[1]-center[1], p1[0]-center[0]);
  let dMid = aMidRaw - a0; while (dMid <= -Math.PI) dMid += 2*Math.PI; while (dMid > Math.PI) dMid -= 2*Math.PI;
  const turn = dMid >= 0 ? 1 : -1;
  let sweep = a1Raw - a0; while (turn>0 ? sweep < 0 : sweep > 0) sweep += turn*2*Math.PI;
  const n = samples || Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI/12)));
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + sweep*(i/n);
    pts.push([center[0]+r*Math.cos(a), center[1]+r*Math.sin(a)]);
  }
  return pts;
}

// Standard SVG arc-to-cubic-bezier conversion (endpoint -> center
// parameterization, split into <=90 deg cubic segments) — the well-known
// algorithm from the SVG 1.1 spec appendix F.6, so an imported 'A' command
// becomes real, editable curve metadata exactly like 'C'/'S'/'Q'/'T' do.
export function svgArcToCubics(x1, y1, rx, ry, xAxisRotationDeg, largeArcFlag, sweepFlag, x2, y2) {
  if (!rx || !ry || (x1===x2 && y1===y2)) return [{ c1:[x1,y1], c2:[x2,y2], x:x2, y:y2 }];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = xAxisRotationDeg * Math.PI/180, cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
  const dx2 = (x1-x2)/2, dy2 = (y1-y2)/2;
  const x1p = cosPhi*dx2 + sinPhi*dy2, y1p = -sinPhi*dx2 + cosPhi*dy2;
  let rxs = rx*rx, rys = ry*ry;
  const x1ps = x1p*x1p, y1ps = y1p*y1p;
  const lambda = x1ps/rxs + y1ps/rys;
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; rxs = rx*rx; rys = ry*ry; }
  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const num = Math.max(0, rxs*rys - rxs*y1ps - rys*x1ps);
  const den = rxs*y1ps + rys*x1ps;
  const coef = den ? sign*Math.sqrt(num/den) : 0;
  const cxp = coef * (rx*y1p/ry), cyp = coef * (-ry*x1p/rx);
  const cx = cosPhi*cxp - sinPhi*cyp + (x1+x2)/2, cy = sinPhi*cxp + cosPhi*cyp + (y1+y2)/2;
  const angle = (ux,uy,vx,vy) => {
    const len = Math.hypot(ux,uy)*Math.hypot(vx,vy);
    let a = Math.acos(Math.max(-1, Math.min(1, (ux*vx+uy*vy)/(len||1))));
    if (ux*vy - uy*vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p-cxp)/rx, (y1p-cyp)/ry);
  let dtheta = angle((x1p-cxp)/rx, (y1p-cyp)/ry, (-x1p-cxp)/rx, (-y1p-cyp)/ry);
  if (!sweepFlag && dtheta > 0) dtheta -= 2*Math.PI;
  if (sweepFlag && dtheta < 0) dtheta += 2*Math.PI;
  const numSegs = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI/2)));
  const delta = dtheta / numSegs, t = 4/3 * Math.tan(delta/4);
  const segs = [];
  let theta = theta1;
  for (let s = 0; s < numSegs; s++) {
    const theta2 = theta + delta;
    const pt = (th) => {
      const ex = rx*Math.cos(th), ey = ry*Math.sin(th);
      return [cosPhi*ex - sinPhi*ey + cx, sinPhi*ex + cosPhi*ey + cy];
    };
    const rot = (vx,vy) => [cosPhi*vx - sinPhi*vy, sinPhi*vx + cosPhi*vy];
    const p0 = pt(theta), p1 = pt(theta2);
    const d0 = rot(-rx*Math.sin(theta), ry*Math.cos(theta));
    const d1 = rot(-rx*Math.sin(theta2), ry*Math.cos(theta2));
    segs.push({ c1:[p0[0]+t*d0[0], p0[1]+t*d0[1]], c2:[p1[0]-t*d1[0], p1[1]-t*d1[1]], x:p1[0], y:p1[1] });
    theta = theta2;
  }
  return segs;
}

// ---- 2D affine matrices [a,b,c,d,e,f] (SVG transform convention) ----
function matMul(m1, m2) {
  const [a1,b1,c1,d1,e1,f1] = m1, [a2,b2,c2,d2,e2,f2] = m2;
  return [a1*a2+c1*b2, b1*a2+d1*b2, a1*c2+c1*d2, b1*c2+d1*d2, a1*e2+c1*f2+e1, b1*e2+d1*f2+f1];
}
function matApply(m, x, y) { return [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]]; }
export function parseSVGTransform(str) {
  let m = [1,0,0,1,0,0];
  if (!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let mm;
  while ((mm = re.exec(str))) {
    const n = mm[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let t;
    if (mm[1] === "matrix") t = n;
    else if (mm[1] === "translate") t = [1,0,0,1, n[0]||0, n[1]||0];
    else if (mm[1] === "scale") { const sx=n[0]||1, sy=n[1]!=null?n[1]:sx; t=[sx,0,0,sy,0,0]; }
    else if (mm[1] === "rotate") {
      const a=(n[0]||0)*Math.PI/180, cos=Math.cos(a), sin=Math.sin(a), rot=[cos,sin,-sin,cos,0,0];
      t = n.length>=3 ? matMul(matMul([1,0,0,1,n[1],n[2]], rot), [1,0,0,1,-n[1],-n[2]]) : rot;
    }
    else if (mm[1] === "skewX") t = [1,0,Math.tan((n[0]||0)*Math.PI/180),1,0,0];
    else if (mm[1] === "skewY") t = [1,Math.tan((n[0]||0)*Math.PI/180),0,1,0,0];
    if (t) m = matMul(m, t);
  }
  return m;
}

// ---- minimal hand-rolled XML walker (no DOMParser — keeps this module
// usable from `node --test` exactly like js/pattern-export.js, and this
// app hand-rolls its other file-format readers/writers the same way) ----
function parseXML(text) {
  text = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const tagRe = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)\s*>/g;
  let m;
  while ((m = tagRe.exec(text))) {
    const [, closing, tag, attrStr, selfClose] = m;
    if (closing) {
      for (let i = stack.length-1; i > 0; i--) { if (stack[i].tag === tag) { stack.length = i; break; } }
      continue;
    }
    const attrs = {};
    const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let am;
    while ((am = attrRe.exec(attrStr))) attrs[am[1]] = am[2] !== undefined ? decodeXMLEntities(am[2]) : decodeXMLEntities(am[3]);
    const node = { tag, attrs, children: [] };
    stack[stack.length-1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}
function decodeXMLEntities(s) { return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&"); }
function localName(tag) { const i = tag.indexOf(":"); return i < 0 ? tag : tag.slice(i+1); }
function findFirst(node, tag) {
  if (localName(node.tag) === tag) return node;
  for (const c of node.children || []) { const f = findFirst(c, tag); if (f) return f; }
  return null;
}

// ---- SVG path 'd' parsing ----
function tokenizePathD(d) {
  const tokens = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.\d+(?:[eE][-+]?\d+)?|-?\d+(?:[eE][-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(d))) tokens.push(m[1] ? { cmd: m[1] } : { num: parseFloat(m[2]) });
  return tokens;
}
const ARG_COUNT = { M:2, L:2, H:1, V:1, C:6, S:4, Q:4, T:2, A:7, Z:0 };
// Parses an SVG path `d` string into local-space subpaths:
// [{ points:[[x,y]...], curves:[{fromIdx,toIdx,c1,c2}], closed }]
export function parsePathD(d) {
  const tokens = tokenizePathD(d);
  const subpaths = [];
  let i = 0, cmd = null;
  let cur = null, cx = 0, cy = 0, startX = 0, startY = 0;
  let prevCmdU = null, prevCtrl = null; // reflection state for S/T
  const finishSub = () => { if (cur && cur.points.length > 1) subpaths.push(cur); cur = null; };
  while (i < tokens.length) {
    if (tokens[i].cmd) { cmd = tokens[i].cmd; i++; }
    if (!cmd) break;
    const U = cmd.toUpperCase(), rel = cmd !== U;
    if (U === "Z") { if (cur) { cur.closed = true; cx = startX; cy = startY; } prevCmdU = "Z"; prevCtrl = null; continue; }
    const need = ARG_COUNT[U];
    if (i + need > tokens.length || tokens.slice(i, i+need).some(t => t.num === undefined)) break;
    const nums = tokens.slice(i, i+need).map(t => t.num); i += need;
    if (U === "M") {
      finishSub();
      const x = rel ? cx+nums[0] : nums[0], y = rel ? cy+nums[1] : nums[1];
      cur = { points: [[x,y]], curves: [], closed: false }; cx = x; cy = y; startX = x; startY = y;
      cmd = rel ? "l" : "L"; // subsequent implicit pairs are lineto
    } else if (U === "L") {
      const x = rel ? cx+nums[0] : nums[0], y = rel ? cy+nums[1] : nums[1];
      if (cur) cur.points.push([x,y]); cx = x; cy = y;
    } else if (U === "H") {
      const x = rel ? cx+nums[0] : nums[0];
      if (cur) cur.points.push([x,cy]); cx = x;
    } else if (U === "V") {
      const y = rel ? cy+nums[0] : nums[0];
      if (cur) cur.points.push([cx,y]); cy = y;
    } else if (U === "C") {
      const c1 = [rel?cx+nums[0]:nums[0], rel?cy+nums[1]:nums[1]];
      const c2 = [rel?cx+nums[2]:nums[2], rel?cy+nums[3]:nums[3]];
      const p1 = [rel?cx+nums[4]:nums[4], rel?cy+nums[5]:nums[5]];
      if (cur) appendCurveSpan(cur, c1, c2, sampleCubic([cx,cy], c1, c2, p1, 8));
      cx = p1[0]; cy = p1[1]; prevCtrl = c2;
    } else if (U === "S") {
      const c1 = (prevCmdU==="C"||prevCmdU==="S") ? [2*cx-prevCtrl[0], 2*cy-prevCtrl[1]] : [cx,cy];
      const c2 = [rel?cx+nums[0]:nums[0], rel?cy+nums[1]:nums[1]];
      const p1 = [rel?cx+nums[2]:nums[2], rel?cy+nums[3]:nums[3]];
      if (cur) appendCurveSpan(cur, c1, c2, sampleCubic([cx,cy], c1, c2, p1, 8));
      cx = p1[0]; cy = p1[1]; prevCtrl = c2;
    } else if (U === "Q") {
      const q = [rel?cx+nums[0]:nums[0], rel?cy+nums[1]:nums[1]];
      const p1 = [rel?cx+nums[2]:nums[2], rel?cy+nums[3]:nums[3]];
      const c1 = [cx+(q[0]-cx)*2/3, cy+(q[1]-cy)*2/3], c2 = [p1[0]+(q[0]-p1[0])*2/3, p1[1]+(q[1]-p1[1])*2/3];
      if (cur) appendCurveSpan(cur, c1, c2, sampleCubic([cx,cy], c1, c2, p1, 8));
      cx = p1[0]; cy = p1[1]; prevCtrl = q;
    } else if (U === "T") {
      const q = (prevCmdU==="Q"||prevCmdU==="T") ? [2*cx-prevCtrl[0], 2*cy-prevCtrl[1]] : [cx,cy];
      const p1 = [rel?cx+nums[0]:nums[0], rel?cy+nums[1]:nums[1]];
      const c1 = [cx+(q[0]-cx)*2/3, cy+(q[1]-cy)*2/3], c2 = [p1[0]+(q[0]-p1[0])*2/3, p1[1]+(q[1]-p1[1])*2/3];
      if (cur) appendCurveSpan(cur, c1, c2, sampleCubic([cx,cy], c1, c2, p1, 8));
      cx = p1[0]; cy = p1[1]; prevCtrl = q;
    } else if (U === "A") {
      const [rx,ry,rot,laf,swf,ex,ey] = nums;
      const x2 = rel?cx+ex:ex, y2 = rel?cy+ey:ey;
      const segs = svgArcToCubics(cx, cy, rx, ry, rot, laf!==0, swf!==0, x2, y2);
      let p0 = [cx,cy];
      segs.forEach(seg => { if (cur) appendCurveSpan(cur, seg.c1, seg.c2, sampleCubic(p0, seg.c1, seg.c2, [seg.x,seg.y], 8)); p0 = [seg.x,seg.y]; });
      cx = x2; cy = y2; prevCtrl = null;
    }
    prevCmdU = U;
  }
  finishSub();
  return subpaths;
}

// ---- SVG shape -> local-space subpath(s) ----
function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d||0); }
function rectSubpath(a) {
  const x=num(a.x), y=num(a.y), w=num(a.width), h=num(a.height);
  let rx = a.rx!=null ? num(a.rx) : (a.ry!=null ? num(a.ry) : 0);
  let ry = a.ry!=null ? num(a.ry) : rx;
  if (!w || !h) return null;
  rx = Math.min(rx, w/2); ry = Math.min(ry, h/2);
  if (!rx && !ry) return { points: [[x,y],[x+w,y],[x+w,y+h],[x,y+h]], curves: [], closed: true };
  // rounded rect: 4 straight edges + 4 quarter-circle corners as real curves
  const k = CIRCLE_KAPPA;
  const sub = { points: [[x+rx,y]], curves: [], closed: true };
  const corner = (cxp,cyp,sx,sy,ex,ey,hx1,hy1,hx2,hy2) => {
    sub.points.push([sx,sy]);
    const c1=[cxp+hx1,cyp+hy1], c2=[cxp+hx2,cyp+hy2], p1=[ex,ey];
    appendCurveSpan(sub, c1, c2, sampleCubic(sub.points[sub.points.length-1], c1, c2, p1, 6));
  };
  sub.points = [[x+rx,y]];
  sub.points.push([x+w-rx,y]);
  if (rx||ry) appendCurveSpan(sub, [x+w-rx+rx*k,y], [x+w,y+ry-ry*k], sampleCubic([x+w-rx,y],[x+w-rx+rx*k,y],[x+w,y+ry-ry*k],[x+w,y+ry],6));
  sub.points.push([x+w,y+h-ry]);
  if (rx||ry) appendCurveSpan(sub, [x+w,y+h-ry+ry*k], [x+w-rx+rx*k,y+h], sampleCubic([x+w,y+h-ry],[x+w,y+h-ry+ry*k],[x+w-rx+rx*k,y+h],[x+w-rx,y+h],6));
  sub.points.push([x+rx,y+h]);
  if (rx||ry) appendCurveSpan(sub, [x+rx-rx*k,y+h], [x,y+h-ry+ry*k], sampleCubic([x+rx,y+h],[x+rx-rx*k,y+h],[x,y+h-ry+ry*k],[x,y+h-ry],6));
  sub.points.push([x,y+ry]);
  if (rx||ry) appendCurveSpan(sub, [x,y+ry-ry*k], [x+rx-rx*k,y], sampleCubic([x,y+ry],[x,y+ry-ry*k],[x+rx-rx*k,y],[x+rx,y],6));
  return sub;
}
function pointsListSubpath(a, closed) {
  const raw = (a.points||"").trim().split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n));
  const pts = [];
  for (let i = 0; i+1 < raw.length; i += 2) pts.push([raw[i], raw[i+1]]);
  if (pts.length < 2) return null;
  return { points: pts, curves: [], closed };
}

// Walk the tree collecting {type, ...attrs, matrix, label} for every
// shape element, composing ancestor transforms as it goes; SKIP_TAGS are
// definitions (never rendered directly) rather than visible content.
const SKIP_TAGS = new Set(["defs","symbol","clipPath","mask","pattern","metadata","title","desc","style"]);
function shapeLabel(node) { return node.attrs.id || node.attrs["inkscape:label"] || null; }
function collectShapes(node, matrix, out, warnings) {
  const tag = localName(node.tag);
  if (SKIP_TAGS.has(tag)) return;
  const m = node.attrs && node.attrs.transform ? matMul(matrix, parseSVGTransform(node.attrs.transform)) : matrix;
  if (tag === "path" && node.attrs.d) out.push({ type:"path", d:node.attrs.d, matrix:m, label:shapeLabel(node) });
  else if (tag === "rect") out.push({ type:"rect", attrs:node.attrs, matrix:m, label:shapeLabel(node) });
  else if (tag === "circle") out.push({ type:"circle", attrs:node.attrs, matrix:m, label:shapeLabel(node) });
  else if (tag === "ellipse") out.push({ type:"ellipse", attrs:node.attrs, matrix:m, label:shapeLabel(node) });
  else if (tag === "polygon") out.push({ type:"points", attrs:node.attrs, closed:true, matrix:m, label:shapeLabel(node) });
  else if (tag === "polyline") out.push({ type:"points", attrs:node.attrs, closed:false, matrix:m, label:shapeLabel(node) });
  else if (tag === "use") warnings.push("A <use> element was skipped — referenced shapes aren't followed.");
  (node.children||[]).forEach(c => collectShapes(c, m, out, warnings));
}

function parseLength(str) {
  if (str == null) return null;
  const m = /^\s*([+-]?[\d.eE+-]+)\s*(cm|mm|in|pt|px|m)?\s*$/.exec(str);
  if (!m) return null;
  const v = parseFloat(m[1]); if (!Number.isFinite(v)) return null;
  const TO_CM = { cm:1, mm:0.1, in:2.54, pt:2.54/72, px:2.54/96, m:100 };
  return v * (TO_CM[m[2]||"px"]);
}
function parseViewBox(str) {
  if (!str) return null;
  const n = str.trim().split(/[\s,]+/).map(Number);
  if (n.length !== 4 || n.some(x => !Number.isFinite(x))) return null;
  return { x:n[0], y:n[1], w:n[2], h:n[3] };
}
// cm-per-user-unit — see the module-level design note this mirrors: a
// declared physical width/height against a viewBox gives an exact
// physical scale (this app's own exportSVG() always emits both, in cm,
// so re-importing a BerryStudio export round-trips exactly); no viewBox
// but a width/height means the coordinate system is plain CSS px
// regardless of what unit that width/height claims (per the SVG spec —
// a viewBox is what remaps user units, not the width/height attribute);
// neither present at all falls back to "already cm", the most useful
// default for a hand-authored or foreign pattern-drafting SVG.
function svgScaleCmPerUnit(attrs, vb) {
  const wCm = parseLength(attrs.width);
  if (vb && wCm) return wCm / vb.w;
  if (!vb && wCm) return 2.54/96;
  return 1;
}

export function parseSVGPattern(svgText) {
  const warnings = [];
  const root = parseXML(svgText);
  const svgNode = findFirst(root, "svg");
  if (!svgNode) return { pieces: [], warnings: ["No <svg> element found in the file."] };
  const vb = parseViewBox(svgNode.attrs.viewBox);
  const scale = svgScaleCmPerUnit(svgNode.attrs, vb);
  const originX = vb ? vb.x : 0, originY = vb ? vb.y : 0;
  const shapes = [];
  collectShapes(svgNode, [1,0,0,1,0,0], shapes, warnings);
  if (!shapes.length) { warnings.push("No drawable shapes found in the SVG."); return { pieces: [], warnings }; }

  const toCm = (pt) => [(pt[0]-originX)*scale, (pt[1]-originY)*scale];
  const pieces = [];
  let openSkipped = 0;

  const emit = (sub, label) => {
    if (!sub || sub.points.length < 3) return;
    // A subpath whose own start/end land within a hair of each other
    // (SVG_CLOSE_EPS_CM, applied AFTER scaling) counts as closed even
    // without an explicit Z — same tolerant rule js/canvas.js's own
    // isSketchClosed() uses for Pen/Freehand strokes.
    const first = toCm(sub.points[0]), last = toCm(sub.points[sub.points.length-1]);
    const closed = sub.closed || dist(first,last) <= 0.1;
    if (!closed) { openSkipped++; return; }
    const outline = sub.points.map(toCm);
    const curves = (sub.curves||[]).map(c => ({ fromIdx:c.fromIdx, toIdx:c.toIdx, c1:toCm(c.c1), c2:toCm(c.c2) }));
    pieces.push({ outline, curves, name: label||null });
  };

  shapes.forEach((shape, si) => {
    const label = shape.label;
    if (shape.type === "path") {
      const subpaths = parsePathD(shape.d);
      subpaths.forEach((sub, k) => {
        const t = { points: sub.points.map(p=>matApply(shape.matrix,p[0],p[1])),
                    curves: sub.curves.map(c=>({ ...c, c1:matApply(shape.matrix,c.c1[0],c.c1[1]), c2:matApply(shape.matrix,c.c2[0],c.c2[1]) })),
                    closed: sub.closed };
        emit(t, subpaths.length>1 ? `${label||`Path ${si+1}`} ${k+1}` : label);
      });
    } else if (shape.type === "rect") {
      const sub = rectSubpath(shape.attrs); if (!sub) return;
      emit({ points: sub.points.map(p=>matApply(shape.matrix,p[0],p[1])),
             curves: sub.curves.map(c=>({ ...c, c1:matApply(shape.matrix,c.c1[0],c.c1[1]), c2:matApply(shape.matrix,c.c2[0],c.c2[1]) })),
             closed: true }, label);
    } else if (shape.type === "circle" || shape.type === "ellipse") {
      const a = shape.attrs;
      const cx = num(a.cx), cy = num(a.cy);
      const rx = shape.type==="circle" ? num(a.r) : num(a.rx);
      const ry = shape.type==="circle" ? num(a.r) : num(a.ry);
      if (!rx || !ry) return;
      const sub = ellipseSubpath(cx, cy, rx, ry, 8);
      emit({ points: sub.points.map(p=>matApply(shape.matrix,p[0],p[1])),
             curves: sub.curves.map(c=>({ ...c, c1:matApply(shape.matrix,c.c1[0],c.c1[1]), c2:matApply(shape.matrix,c.c2[0],c.c2[1]) })),
             closed: true }, label);
    } else if (shape.type === "points") {
      const sub = pointsListSubpath(shape.attrs, shape.closed); if (!sub) return;
      emit({ points: sub.points.map(p=>matApply(shape.matrix,p[0],p[1])), curves: [], closed: shape.closed }, label);
    }
  });

  if (openSkipped) warnings.push(`${openSkipped} open shape${openSkipped>1?"s":""} skipped (only closed shapes can become pattern pieces).`);
  if (!pieces.length && !warnings.length) warnings.push("No closed shapes found to import.");
  return { pieces, warnings };
}

// ---- DXF ----
const INSUNITS_TO_CM = { 1:2.54, 2:30.48, 4:0.1, 5:1, 6:100, 9:2.54e-3, 8:2.54e-6, 10:91.44, 3:160934 };

function dxfPairs(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i+1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i+1].trim()]);
  return pairs;
}
// Groups the flat code/value stream into entities: {type, codes:[[code,value]...]}
// — 0 SECTION/ENDSEC/EOF markers are structural, not entities themselves.
function dxfEntities(pairs) {
  const entities = [];
  let cur = null;
  for (const [code, value] of pairs) {
    if (code === "0") {
      if (cur) entities.push(cur);
      cur = (value==="SECTION"||value==="ENDSEC"||value==="EOF") ? null : { type: value, codes: [] };
    } else if (cur) cur.codes.push([code, value]);
  }
  if (cur) entities.push(cur);
  return entities;
}
function dxfInsUnitsScale(pairs) {
  for (let i = 0; i < pairs.length-1; i++) {
    if (pairs[i][0]==="9" && pairs[i][1]==="$INSUNITS") {
      for (let j = i+1; j < Math.min(i+6, pairs.length); j++) {
        if (pairs[j][0]==="70") { const u = parseInt(pairs[j][1],10); return INSUNITS_TO_CM[u] || 1; }
      }
    }
  }
  return 1; // unspecified: assume cm (matches this app's own buildDXF() convention)
}
// Vertices from a code stream where each vertex is a 10/20 pair
// (optionally followed by a 42 bulge for the segment to the NEXT vertex).
function readVertices(codes) {
  const verts = [];
  let cur = null;
  codes.forEach(([code, value]) => {
    if (code === "10") { cur = { x: parseFloat(value), y: 0, bulge: 0 }; verts.push(cur); }
    else if (code === "20" && cur) cur.y = parseFloat(value);
    else if (code === "42" && cur) cur.bulge = parseFloat(value);
  });
  return verts;
}
function codeVal(codes, code) { const f = codes.find(c => c[0]===code); return f ? f[1] : undefined; }
function flagsClosed(codes) { const f = parseInt(codeVal(codes,"70")||"0",10); return !!(f & 1); }

function outlineFromVertices(verts, closed, scale) {
  if (verts.length < 2) return null;
  const pts = [[verts[0].x*scale, -verts[0].y*scale]];
  let bulgeCount = 0;
  const n = verts.length;
  const last = closed ? n : n-1;
  for (let i = 0; i < last; i++) {
    const a = verts[i], b = verts[(i+1)%n];
    const p0 = [a.x*scale, -a.y*scale], p1 = [b.x*scale, -b.y*scale];
    if (a.bulge) { bulgeCount++; bulgeArcPoints(p0, p1, -a.bulge).forEach(p => pts.push(p)); }
    else pts.push(p1);
  }
  if (closed && pts.length > 1 && dist(pts[0], pts[pts.length-1]) < 1e-6) pts.pop();
  return { outline: pts, bulgeCount };
}

export function parseDXFPattern(dxfText) {
  const warnings = [];
  const pairs = dxfPairs(dxfText);
  const scale = dxfInsUnitsScale(pairs);
  const entities = dxfEntities(pairs);
  const pieces = [];
  let totalBulges = 0, openSkipped = 0, unsupported = 0;
  const looseLines = [];

  for (let idx = 0; idx < entities.length; idx++) {
    const e = entities[idx];
    if (e.type === "LWPOLYLINE") {
      const verts = readVertices(e.codes);
      const closed = flagsClosed(e.codes);
      const layer = codeVal(e.codes, "8");
      const r = outlineFromVertices(verts, closed, scale);
      if (!r) continue;
      totalBulges += r.bulgeCount;
      if (!closed) { openSkipped++; continue; }
      pieces.push({ outline: r.outline, curves: [], name: customLayerName(layer) });
    } else if (e.type === "POLYLINE") {
      const closed = flagsClosed(e.codes);
      const layer = codeVal(e.codes, "8");
      const verts = [];
      let j = idx+1;
      while (j < entities.length && entities[j].type === "VERTEX") { verts.push(...readVertices(entities[j].codes)); j++; }
      if (j < entities.length && entities[j].type === "SEQEND") idx = j; else idx = j-1;
      const r = outlineFromVertices(verts, closed, scale);
      if (!r) continue;
      totalBulges += r.bulgeCount;
      if (!closed) { openSkipped++; continue; }
      pieces.push({ outline: r.outline, curves: [], name: customLayerName(layer) });
    } else if (e.type === "CIRCLE") {
      const cx = parseFloat(codeVal(e.codes,"10")||0), cy = parseFloat(codeVal(e.codes,"20")||0);
      const rad = parseFloat(codeVal(e.codes,"40")||0);
      if (!rad) continue;
      const sub = ellipseSubpath(cx*scale, -cy*scale, rad*scale, rad*scale, 8);
      pieces.push({ outline: sub.points, curves: sub.curves, name: customLayerName(codeVal(e.codes,"8")) });
    } else if (e.type === "LINE") {
      const x1=parseFloat(codeVal(e.codes,"10")||0), y1=parseFloat(codeVal(e.codes,"20")||0);
      const x2=parseFloat(codeVal(e.codes,"11")||0), y2=parseFloat(codeVal(e.codes,"21")||0);
      looseLines.push([[x1*scale,-y1*scale],[x2*scale,-y2*scale]]);
    } else if (e.type === "SPLINE" || e.type === "INSERT" || e.type === "ELLIPSE" || e.type === "ARC") {
      unsupported++;
    }
  }

  // Chain standalone LINE segments end-to-end into closed loops (a common
  // simple-CAD-export representation with no explicit polyline entity).
  if (looseLines.length) {
    const used = new Array(looseLines.length).fill(false);
    const EPS = 1e-4;
    const near = (a,b) => dist(a,b) < EPS;
    for (let i = 0; i < looseLines.length; i++) {
      if (used[i]) continue;
      let chain = [looseLines[i][0], looseLines[i][1]];
      used[i] = true;
      let extended = true;
      while (extended) {
        extended = false;
        for (let j = 0; j < looseLines.length; j++) {
          if (used[j]) continue;
          const [a,b] = looseLines[j];
          if (near(a, chain[chain.length-1])) { chain.push(b); used[j]=true; extended=true; }
          else if (near(b, chain[chain.length-1])) { chain.push(a); used[j]=true; extended=true; }
          else if (near(b, chain[0])) { chain.unshift(a); used[j]=true; extended=true; }
          else if (near(a, chain[0])) { chain.unshift(b); used[j]=true; extended=true; }
        }
      }
      if (chain.length > 3 && near(chain[0], chain[chain.length-1])) {
        chain.pop();
        pieces.push({ outline: chain, curves: [], name: null });
      } else openSkipped++;
    }
  }

  if (totalBulges) warnings.push(`${totalBulges} curved (bulge) segment${totalBulges>1?"s":""} were flattened to straight-line approximations.`);
  if (openSkipped) warnings.push(`${openSkipped} open polyline${openSkipped>1?"s":""}/line chain${openSkipped>1?"s":""} skipped (only closed shapes can become pattern pieces).`);
  if (unsupported) warnings.push(`${unsupported} unsupported entity type${unsupported>1?"s":""} (SPLINE/ARC/ELLIPSE/INSERT) were skipped.`);
  if (!pieces.length && !warnings.length) warnings.push("No closed shapes found to import.");
  return { pieces, warnings };
}
// This app's own buildDXF() only ever numbers layers "1"/"2"/"3"/"4"/"8"/
// "11"/"13" (see js/pattern-export.js's header comment) — a DXF from
// elsewhere using a real descriptive layer name is worth keeping as the
// piece's name; one of this app's own numeric layers, or no layer at all,
// isn't a meaningful name.
function customLayerName(layer) {
  if (!layer || /^\d+$/.test(layer) || layer==="0") return null;
  return layer;
}
