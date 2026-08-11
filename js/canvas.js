/* ============================================================
   Pattern Canvas — HTML5 Canvas 2D drafting engine.
   Grid, rulers, zoom/pan, seam allowance, notches, grainlines,
   selection, snapping, measure & sketch tools, undo/redo.
   ============================================================ */
import { buildDXF, buildHPGL, buildPDF } from './pattern-export.js';
import { offsetPoly as offsetPolyImpl } from './geometry.js';
export const Canvas = (() => {
  let cv, ctx, dpr = 1;
  let view = { x: 60, y: 60, scale: 3.2 };     // px per cm
  let pieces = [];                              // current pattern pieces (cm space, positioned)
  let selected = -1;
  // Group piece selection — populated by Shift+click (the select/move tool's
  // own tooltip has always claimed "Shift-click for multi-select"; nothing
  // ever actually implemented it) and by the Lasso tool. `selected` stays
  // the single-piece source of truth for handle-based tools (rotate/scale/
  // drag-anchor editing, which have no sane multi-piece meaning); it tracks
  // the sole entry whenever multiSelected.length===1 and goes to -1 for 0 or
  // 2+, so those tools simply have nothing to grab onto during a real group
  // selection instead of silently acting on the wrong single piece.
  let multiSelected = [];
  let lassoPts = null;                // live freehand loop while the Lasso tool is dragging
  let lassoAdditive = false;          // Shift was held when the current lasso drag started
  // Curve Edge tool's live drag state: {pieceIdx, fromIdx, p0, p1, bulge,
  // startX, startY, moved, existing} — `existing` is the piece's own
  // p.curves entry for this edge if it was already curved (re-drag to
  // reshape), else null (a fresh curve).
  let curveEdit = null;
  // Add Dart tool's live drag state: {pieceIdx, edgeIdx, mouth, apex,
  // startX, startY, moved} — mouth is the point on the outline edge the
  // dart's two legs straddle (set on pointerdown, via findEdgeInsertion);
  // apex tracks the cursor while dragging and commits as the dart's apex
  // on release. Same "grab now, decide the real shape on release" shape as
  // curveEdit above.
  let dartEdit = null;
  let dartHoverPreview = null;        // {pieceIdx, edgeIdx, point} — live preview while hovering with the Add Dart tool, before the drag starts
  let tool = "select";
  let opts = { grid: true, snap: true, seam: true, unitsCm: true, seamCm: 1, fillOpacity: 0.12 };
  let sketch = [];                              // user-drawn strokes {tool, pts:[[cm,cm]]}
  let drawing = null;                           // active stroke
  let measurePts = [];
  let pan = null, dragPiece = null;
  let edit = null;                    // active handle edit {type, ...}
  let clickBuf = [];                  // buffer for two-click tools (knife, grain)
  let cursorWorld = null;             // last cursor position (for rubber-band previews)
  let snapMark = null;                // point currently snapped to (for the snap ring)
  let selText = null;                 // id of the selected text annotation (click-to-select, Backspace-able)
  let selNotch = null;                // {pieceIdx, idx} of the selected notch (click-to-select, Backspace-able)
  let selVertex = null;               // index into pieces[selected].outline of the selected OUTLINE point (click-to-select via its handle, Backspace-able) — only meaningful while that same piece is `selected`, so unlike selNotch this isn't a {pieceIdx,idx} pair
  let addPointPreview = null;         // {pieceIdx, edgeIdx, point} — live preview while hovering with the Add Point tool
  const SHOW_HANDLES = new Set(["select","move","rotate","scale","pen"]);
  let userAdjusted = false;          // true once the user zooms/pans manually
  const undo = [], redo = [];
  let texts = [];                     // text annotations {id,x,y,text,size,bold,italic,color}
  let textSeq = 1;
  let dragText = null;                // active text drag {i, ox, oy}
  let onText = () => {};              // app callback to open the text editor
  let onPick = () => {};
  let getT = k => k;                            // translator injected
  // WP-19: one-shot "pick a point on canvas" arming, independent of the
  // active drafting tool — used by callers outside the canvas (e.g. the
  // Dart Editor modal's dart-transfer pivot fields) that just want the
  // next click's pattern-space coordinate, not a tool switch. Intercepts
  // the very next pointerdown regardless of `tool`, then disarms itself.
  let pickCb = null;

  function armPick(cb){ pickCb = cb || null; }
  function cancelPick(){ pickCb = null; }

  // ---- construction geometry: points, referential lines/arcs/circles,
  // custom parametric variables, "promote to pattern piece", trace image ----
  let points = [];                    // {id,name,x,y,xExpr,yExpr}
  let pointSeq = 1;
  let cons = [];                      // {id,kind:'line'|'arc'|'circle', a, b, ctrl?} — a/b/ctrl are {pid} or {x,y}
  let consSeq = 1;
  let dragPoint = null;                // {id, ox, oy}
  let promoteBuf = [];                 // ordered point ids while using the Create Pattern Piece tool
  let pendingPromoteOutline = null;
  // The same point-id sequence promoteBuf just had, kept alive past the
  // rename prompt so finishPromotePiece() can still look up which pairs of
  // ADJACENT promoted points had a Construction Arc drawn between them —
  // promoteBuf itself is cleared immediately once the loop closes (see
  // below), well before the user actually finishes naming the piece.
  let pendingPromoteIds = null;
  // Set instead of pendingPromoteIds when the pending outline came from
  // clicking a closed SKETCH shape (Filled Shape/Pen/Freehand) with the
  // Create Pattern Piece tool, rather than from clicking construction
  // points in order — the index into `sketch` to remove once the piece is
  // actually confirmed (kept alive past the rename prompt for the same
  // reason pendingPromoteIds is).
  let pendingPromoteSketchIdx = null;
  let onPromoteReq = () => {};         // app callback: (outlinePts) => opens the name prompt
  let onPointReq = () => {};           // app callback: ({point,cx,cy}) => opens the point rename/formula editor
  let variables = {};                  // name -> formula string
  let measureProvider = () => ({});    // app-injected: () => current measurement object
  let bg = null;                       // trace image {img, dataURL, x, y, scale, opacity, visible}
  let onCalibReq = () => {};           // app callback: (measuredDistCm) => prompts for the true distance
  // app callback: (key) => toast(T(key)) — a semantic reason string, not
  // display text (this module has no i18n of its own); used by the Curve
  // Edge and Create Pattern Piece (sketch-promotion) tools below for the
  // handful of "that specific click/drag isn't valid, here's why" cases a
  // silent no-op would otherwise leave the user guessing about.
  let onWarn = () => {};
  let hlPoint = null, hlCons = null;   // id of a point/construction-line highlighted from the Object Browser
  // Index into `sketch` of the selected free-drawn stroke (Line/Arc/Pen/
  // Freehand/Filled Shape) — these were previously invisible to Select:
  // no click-to-select, so no way to Delete/Cut/Copy a single one short of
  // Undo right after drawing it or "Clear Sketch" nuking everything.
  let selSketch = null;
  let ghostSnap = null;                 // frozen ghost overlay {pieces, opacity, visible}
  let clipboard = null;                 // {type:'point'|'cons'|'text'|'notch'|'piece', data} — last copied/cut object

  const CSS = k => getComputedStyle(document.body).getPropertyValue(k).trim();

  function init(canvasEl, translator, pickCb) {
    cv = canvasEl; ctx = cv.getContext("2d");
    getT = translator; onPick = pickCb;
    resize();
    window.addEventListener("resize", resize);
    bind();
    render();
  }
  function setTranslator(t){ getT = t; }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Keep the pattern framed on responsive resizes unless the user zoomed/panned.
    if (pieces.length && !userAdjusted) fit(); else render();
  }

  // ---- coordinate transforms (cm <-> screen px) ----
  const toScreen = (x, y) => [view.x + x * view.scale, view.y + y * view.scale];
  const toWorld = (sx, sy) => [(sx - view.x) / view.scale, (sy - view.y) / view.scale];
  // `free` (held Shift during a drag/click) bypasses the 1cm grid round —
  // lets a point land at any fractional coordinate even with Snap enabled.
  const snap = (v, free) => (opts.snap && !free) ? Math.round(v) : v;
  // Shift-constrain a line's live endpoint to the nearest 45° increment
  // from its own start point (0/45/90/135/180/225/270/315°) — covers
  // perfectly vertical, horizontal, and 45°-diagonal lines with one rule,
  // keeping the raw cursor DISTANCE from the start point exactly as-is
  // (only the angle snaps), the same convention every other design tool's
  // shift-constrain uses. Used by the Line and Construction Line tools —
  // for those two specifically, Shift's meaning changes from "bypass grid
  // snap" (its role for every other drawing tool — arc/pen/polygon/
  // construction arc & circle) to "constrain the angle", since that's the
  // actual ask; the global Snap toolbar toggle is still there for turning
  // off grid-snap generally, unrelated to this.
  function snapAngle45(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    if (!dist) return [x1, y1];
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return [x0 + Math.cos(angle) * dist, y0 + Math.sin(angle) * dist];
  }

  // ---- layout pieces automatically, wrapping into tidy rows ----
  function layoutPieces(rawPieces) {
    let ox = 4, oy = 6, rowH = 0;
    const ROW_MAX = 155;               // cm before wrapping to the next row
    return rawPieces.map(p => {
      const xs = p.outline.map(pt => pt[0]), ys = p.outline.map(pt => pt[1]);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
      if (ox > 4 && ox + w > ROW_MAX) { ox = 4; oy += rowH + 14; rowH = 0; }
      const px = ox, py = oy;
      const place = ([x, y]) => [x - minX + px, y - minY + py];
      const piece = {
        ...p,
        outline: p.outline.map(place),
        darts: (p.darts || []).map(d => d.map(place)),
        notches: (p.notches || []).map(place),
        grain: (p.grain || []).map(place),
        visible: true, color: null,
      };
      ox += w + 12; rowH = Math.max(rowH, h);
      return piece;
    });
  }

  function setPattern(rawPieces, colors) {
    pushUndo();
    pieces = layoutPieces(rawPieces);
    pieces.forEach((p, i) => p.color = colors[i % colors.length]);
    selected = -1; multiSelected=[]; sketch = []; texts = []; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null;
    fit();
  }
  function getPieces(){ return pieces; }

  // ---- undo / redo ----
  function snapshot(){ return JSON.stringify({ pieces, sketch, texts, points, cons }); }
  function pushUndo(){ undo.push(snapshot()); if (undo.length>60) undo.shift(); redo.length=0; }
  function doUndo(){ if(!undo.length) return; redo.push(snapshot()); const s=JSON.parse(undo.pop()); pieces=s.pieces; sketch=s.sketch; texts=s.texts||[]; points=s.points||[]; cons=s.cons||[]; selected=-1; multiSelected=[]; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null; promoteBuf=[]; pendingPromoteIds=null; pendingPromoteSketchIdx=null; curveEdit=null; lassoPts=null; render(); }
  function doRedo(){ if(!redo.length) return; undo.push(snapshot()); const s=JSON.parse(redo.pop()); pieces=s.pieces; sketch=s.sketch; texts=s.texts||[]; points=s.points||[]; cons=s.cons||[]; selected=-1; multiSelected=[]; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null; promoteBuf=[]; pendingPromoteIds=null; pendingPromoteSketchIdx=null; curveEdit=null; lassoPts=null; render(); }

  // ---- Project Tabs support: full-state snapshot/restore + undo/redo
  // history pass-through, used by js/app.js to swap the ENTIRE canvas
  // between independent pattern projects. Deliberately separate from
  // loadPieces() (the user-facing "Import Project" action, which pushes
  // the pre-import state onto undo — exactly right for that action, but
  // wrong here: switching tabs shouldn't let Undo on tab B jump back to
  // whatever tab A last looked like) and from doUndo/doRedo's own
  // snapshot() (a JSON *string*, sized for the undo stack; snapshotState()
  // returns real, already-deep-cloned objects a caller can hold onto and
  // JSON-serialize itself into localStorage). `view` (pan/zoom) is
  // included so switching back to a tab restores exactly where the user
  // left it; `bg` (trace/reference image) is deliberately NOT — see
  // js/app.js's Project Tabs comment for why that's out of scope.
  function snapshotState(){
    return {
      pieces: JSON.parse(JSON.stringify(pieces)),
      sketch: JSON.parse(JSON.stringify(sketch)),
      texts: JSON.parse(JSON.stringify(texts)),
      points: JSON.parse(JSON.stringify(points)),
      cons: JSON.parse(JSON.stringify(cons)),
      variables: { ...variables },
      view: { ...view },
    };
  }
  function restoreState(snap){
    snap = snap || {};
    pieces = snap.pieces || []; sketch = snap.sketch || []; texts = snap.texts || [];
    points = snap.points || []; cons = snap.cons || []; variables = snap.variables || {};
    // drop every ephemeral interaction/tool state — a tab switch mid-drag
    // (rare, but possible via a fast keyboard shortcut) must never leave a
    // stale drag/edit anchored to the OTHER tab's now-gone geometry.
    selected=-1; multiSelected=[]; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null;
    promoteBuf=[]; pendingPromoteOutline=null; pendingPromoteIds=null; pendingPromoteSketchIdx=null;
    curveEdit=null; dartEdit=null; dartHoverPreview=null; lassoPts=null; drawing=null; edit=null;
    clickBuf=[]; measurePts=[]; pan=null; dragPiece=null; dragText=null; dragPoint=null; addPointPreview=null;
    pickCb=null; snapMark=null;
    if (snap.view){ view = { ...snap.view }; userAdjusted = true; render(); } else fit();
  }
  function getHistory(){ return { undo: undo.slice(), redo: redo.slice() }; }
  function setHistory(h){ undo.length=0; redo.length=0; if (h){ if (h.undo) undo.push(...h.undo); if (h.redo) redo.push(...h.redo); } }

  // ---- seam allowance offset (outward polygon offset) ----
  // WP-14: the actual algorithm now lives in js/geometry.js (pure, unit
  // tested) so it can accept `opts.perEdge`/`opts.join` for per-edge
  // seam allowance and round/bevel corners. Every existing call in this
  // file passes no 3rd argument, so it still runs the byte-identical
  // original clamped-miter algorithm — no behavior change here.
  const offsetPoly = offsetPolyImpl;

  // ---- geometry helpers ----
  const centroid = poly => { const n=poly.length; let x=0,y=0; poly.forEach(p=>{x+=p[0];y+=p[1];}); return [x/n,y/n]; };
  const bbox = poly => { const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]); return {minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)}; };
  // curves included alongside outline/darts/notches/grain: same "must move
  // WITH the piece" reasoning as movePiece()'s own fix above — a rotate or
  // scale handle-drag is an even more visible desync than a plain
  // translate would be (the curve's control points staying put while the
  // rest of the piece rotates/scales around them).
  const snapGeo = p => JSON.parse(JSON.stringify({ outline:p.outline, darts:p.darts||[], notches:p.notches||[], grain:p.grain||[], curves:p.curves||[] }));
  // apply a per-point transform to a whole piece, sourced from a frozen snapshot
  function applyFromSnap(p, snp, fn){
    p.outline = snp.outline.map(fn);
    p.darts   = snp.darts.map(d=>d.map(fn));
    p.notches = snp.notches.map(fn);
    p.grain   = snp.grain.map(fn);
    if (snp.curves.length) p.curves = snp.curves.map(c => ({ ...c, c1: fn(c.c1), c2: fn(c.c2) }));
  }
  const rotAbout = (c,ang) => ([x,y]) => { const dx=x-c[0],dy=y-c[1],cs=Math.cos(ang),sn=Math.sin(ang); return [c[0]+dx*cs-dy*sn, c[1]+dx*sn+dy*cs]; };
  const sclAbout = (c,f)   => ([x,y]) => [c[0]+(x-c[0])*f, c[1]+(y-c[1])*f];

  // Snap a world point to a nearby anchor of any piece, else to the grid.
  // `free` (Shift held) bypasses both the point-magnet and the grid fallback
  // entirely, returning the raw fractional coordinate under the cursor.
  function snapToPoint(wx, wy, excludePiece, excludeIdx, free){
    snapMark = null;
    if (!opts.snap || free) return [wx,wy];
    const thr = 9 / view.scale;              // ~9px in world units
    let best=null, bd=thr;
    pieces.forEach((p,pi)=>p.outline.forEach((pt,idx)=>{
      if (pi===excludePiece && idx===excludeIdx) return;
      const d=Math.hypot(pt[0]-wx, pt[1]-wy);
      if (d<bd){ bd=d; best=[pt[0],pt[1]]; }
    }));
    if (best){ snapMark=best; return [best[0],best[1]]; }
    return [Math.round(wx), Math.round(wy)];  // fall back to grid snap
  }

  // ---- oriented selection box ----
  // An axis-aligned bbox around a ROTATED piece always contains it, but its
  // corners visibly float away from the piece's actual silhouette the
  // moment the piece isn't at 0/90/180/270° — reported as "the dashed
  // selection line sometimes appears outside the layer" while rotating
  // ("swinging") a piece. Fixed by computing the true minimum-area
  // *oriented* rectangle (convex hull + rotating calipers) instead, so the
  // dashed box always hugs the piece tightly at any angle. No new
  // per-piece state needed — this is recomputed fresh from the live
  // outline every time, so it's correct after rotate, mirror, knife-split,
  // undo/redo, or a freshly loaded pre-rotated pattern alike.
  function convexHull(pts){
    const uniq = pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
    const lower=[];
    for (const p of uniq){ while(lower.length>=2 && cross(lower[lower.length-2],lower[lower.length-1],p)<=0) lower.pop(); lower.push(p); }
    const upper=[];
    for (let i=uniq.length-1;i>=0;i--){ const p=uniq[i]; while(upper.length>=2 && cross(upper[upper.length-2],upper[upper.length-1],p)<=0) upper.pop(); upper.push(p); }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }
  // Minimum-area rectangle enclosing a convex polygon (rotating calipers):
  // try the rectangle aligned to each hull edge in turn, keep the smallest.
  // Returns 4 corners in the same (world/cm) space as `hull`.
  function minAreaRect(hull){
    if (hull.length<3){ const b=bbox(hull.length?hull:[[0,0]]); return [[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]]; }
    let best=null;
    const n=hull.length;
    for (let i=0;i<n;i++){
      const a=hull[i], b=hull[(i+1)%n];
      const ang=Math.atan2(b[1]-a[1], b[0]-a[0]);
      const cs=Math.cos(ang), sn=Math.sin(ang);
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for (const p of hull){
        const rx = p[0]*cs + p[1]*sn;    // rotate by -ang into this edge's local frame
        const ry = -p[0]*sn + p[1]*cs;
        if (rx<minX) minX=rx; if (rx>maxX) maxX=rx; if (ry<minY) minY=ry; if (ry>maxY) maxY=ry;
      }
      const area=(maxX-minX)*(maxY-minY);
      if (!best || area<best.area){
        const back=([rx,ry])=>[rx*cs-ry*sn, rx*sn+ry*cs];   // rotate back by +ang
        best={ area, corners:[back([minX,minY]),back([maxX,minY]),back([maxX,maxY]),back([minX,maxY])] };
      }
    }
    return best.corners;
  }

  // ---- selection handles (screen-space geometry) ----
  const CORNER_HANDLE_OFFSET = 7; // px — see handleGeo()'s own comment on rectCorners below
  function handleGeo(p){
    const hull=convexHull(p.outline);
    const rectCorners=minAreaRect(hull.length>=3?hull:p.outline).map(pt=>toScreen(pt[0],pt[1]));
    // "top" edge = whichever of the 4 sides currently has the smallest
    // average screen Y, so the rotate handle stays near the piece's actual
    // visual top regardless of which way the oriented rect is facing.
    // Computed from the TRUE rect corners (not the outward-offset `corners`
    // below) — the rotate knob's own placement is unrelated to this fix and
    // shouldn't shift because of it.
    let topEdge=0, topY=Infinity;
    for (let i=0;i<4;i++){ const j=(i+1)%4; const avgY=(rectCorners[i][1]+rectCorners[j][1])/2; if (avgY<topY){ topY=avgY; topEdge=i; } }
    const j=(topEdge+1)%4;
    const topMid=[(rectCorners[topEdge][0]+rectCorners[j][0])/2, (rectCorners[topEdge][1]+rectCorners[j][1])/2];
    // rotate knob sits perpendicular to that edge, on the side away from the box center
    const ex=rectCorners[j][0]-rectCorners[topEdge][0], ey=rectCorners[j][1]-rectCorners[topEdge][1];
    const elen=Math.hypot(ex,ey)||1;
    const cx=(rectCorners[0][0]+rectCorners[2][0])/2, cy=(rectCorners[0][1]+rectCorners[2][1])/2;
    let nx=-ey/elen, ny=ex/elen;
    if ((topMid[0]-cx)*nx + (topMid[1]-cy)*ny < 0){ nx=-nx; ny=-ny; }
    const rotate=[topMid[0]+nx*26, topMid[1]+ny*26];
    // Scale-corner handles are drawn/hit a few px OUTSIDE the piece's own
    // bounding-rect corner, not exactly on top of it. Many real pattern
    // pieces are themselves roughly rectangular (waistbands, straight
    // panels…), so an actual OUTLINE VERTEX often sits at almost the
    // identical screen position as this resize handle — without this
    // offset the resize handle always won (checked first in handleHit()),
    // so that corner vertex could never be grabbed on its own to reshape
    // or delete it. Offsetting each corner outward along its own diagonal
    // from the rect center by a fixed pixel amount keeps it a proper
    // (very slightly larger) rectangle — see handleHit() for the other
    // half of this fix.
    const corners = rectCorners.map(([x,y])=>{
      const dx=x-cx, dy=y-cy, len=Math.hypot(dx,dy)||1;
      return [x + dx/len*CORNER_HANDLE_OFFSET, y + dy/len*CORNER_HANDLE_OFFSET];
    });
    const anchors=p.outline.map(pt=>toScreen(pt[0],pt[1]));
    return { corners, rotate, topMid, anchors };
  }
  function handleHit(p, sx, sy){
    const g=handleGeo(p), dist=(a)=>Math.hypot(a[0]-sx,a[1]-sy);
    if (dist(g.rotate)<=11) return {type:"rotate"};
    // Corner scale-handles and outline-vertex anchors can still legitimately
    // land within both tolerances of each other (the offset above helps but
    // doesn't fully separate them at every zoom level) — whichever the
    // click is actually CLOSER to wins, rather than the scale handle
    // unconditionally winning a first-match order the way this used to
    // work. That's the actual fix: a corner outline point becomes reliably
    // reachable to grab/move/delete on its own instead of the resize handle
    // permanently shadowing it.
    let bestCorner=-1, bestCornerD=10;
    for (let i=0;i<4;i++){ const d=dist(g.corners[i]); if (d<=10 && d<bestCornerD){ bestCornerD=d; bestCorner=i; } }
    let bestAnchor=-1, bestAnchorD=9;
    for (let i=0;i<g.anchors.length;i++){ const d=dist(g.anchors[i]); if (d<=9 && d<bestAnchorD){ bestAnchorD=d; bestAnchor=i; } }
    if (bestCorner>=0 && bestAnchor>=0) return bestAnchorD<=bestCornerD ? {type:"point",idx:bestAnchor} : {type:"scale",corner:bestCorner};
    if (bestAnchor>=0) return {type:"point",idx:bestAnchor};
    if (bestCorner>=0) return {type:"scale",corner:bestCorner};
    return null;
  }

  // ---- knife: split a polygon by an infinite line (half-plane clip) ----
  function clipHalf(poly, a, b, left){
    const side = p => (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]);
    const out=[]; const n=poly.length;
    for (let i=0;i<n;i++){
      const cur=poly[i], nxt=poly[(i+1)%n];
      const sc=side(cur), sn=side(nxt);
      const keepC = left ? sc>=0 : sc<=0, keepN = left ? sn>=0 : sn<=0;
      if (keepC) out.push(cur);
      if (keepC!==keepN){ const t=sc/(sc-sn); out.push([cur[0]+t*(nxt[0]-cur[0]), cur[1]+t*(nxt[1]-cur[1])]); }
    }
    return out;
  }
  function doKnife(a,b){
    let i = (selected>=0 && inPoly((a[0]+b[0])/2,(a[1]+b[1])/2, pieces[selected].outline)) ? selected : hitPiece((a[0]+b[0])/2,(a[1]+b[1])/2);
    if (i<0){ // fall back to any piece the cut line crosses
      i = pieces.findIndex(p=>inPoly(a[0],a[1],p.outline)||inPoly(b[0],b[1],p.outline));
    }
    if (i<0) return false;
    const src=pieces[i];
    const left=clipHalf(src.outline,a,b,true), right=clipHalf(src.outline,a,b,false);
    if (left.length<3 || right.length<3) return false;
    pushUndo();
    const mk=(poly,suffix)=>({ name:{en:src.name.en+" "+suffix, ar:src.name.ar+" "+suffix},
      desc:src.desc, outline:poly, darts:[], notches:[],
      grain:[[centroid(poly)[0], bbox(poly).minY+2],[centroid(poly)[0], bbox(poly).maxY-2]],
      visible:true, color:src.color });
    pieces.splice(i,1,mk(left,"A"),mk(right,"B"));
    selected=i; return true;
  }

  // ---- symmetry: mirror a piece across its right edge (cut-on-fold pair) ----
  function doMirror(i){
    pushUndo();
    const src=pieces[i]; const axis=bbox(src.outline).maxX;
    const mir=([x,y])=>[2*axis-x, y];
    const copy={ ...JSON.parse(JSON.stringify(src)),
      name:{en:src.name.en+" ↔", ar:src.name.ar+" ↔"} };
    copy.outline=src.outline.map(mir); copy.darts=(src.darts||[]).map(d=>d.map(mir));
    copy.notches=(src.notches||[]).map(mir); copy.grain=(src.grain||[]).map(mir);
    pieces.push(copy); selected=pieces.length-1;
  }

  // ---- notch: drop an alignment notch on the nearest outline point ----
  function addNotch(wx,wy){
    // Prefer the piece under the cursor; otherwise pick the piece with the
    // closest outline vertex (forgiving when the click lands near an edge).
    let i=hitPiece(wx,wy), best=null;
    if (i>=0){ best=nearestVertex(pieces[i].outline, wx, wy); }
    else {
      let bd=Infinity;
      pieces.forEach((p,pi)=>{ if(!p.visible) return; const v=nearestVertex(p.outline,wx,wy);
        const d=Math.hypot(v[0]-wx,v[1]-wy); if(d<bd){ bd=d; best=v; i=pi; } });
    }
    if (i<0 || !best) return false;
    pushUndo(); (pieces[i].notches=pieces[i].notches||[]).push([best[0],best[1]]); selected=i; return true;
  }
  function nearestVertex(poly,wx,wy){ let best=poly[0],bd=Infinity; poly.forEach(pt=>{const d=Math.hypot(pt[0]-wx,pt[1]-wy); if(d<bd){bd=d;best=pt;}}); return [best[0],best[1]]; }
  // Hit-test an existing notch by screen position (for click-to-select + Backspace delete).
  function hitNotch(sx,sy,thr=8){
    for (let pi=pieces.length-1; pi>=0; pi--){
      const p=pieces[pi]; if (!p.visible) continue;
      const ns=p.notches||[];
      for (let i=ns.length-1; i>=0; i--){
        const [x,y]=toScreen(ns[i][0],ns[i][1]);
        if (Math.hypot(x-sx,y-sy)<=thr) return { pieceIdx:pi, idx:i };
      }
    }
    return null;
  }
  function removeNotch(pieceIdx,idx){
    const p=pieces[pieceIdx]; if (!p || !p.notches || !p.notches[idx]) return false;
    pushUndo(); p.notches.splice(idx,1); render(); return true;
  }
  // Distance from a screen point to a screen-space segment (for construction-line/arc hit-testing).
  function distToSeg(px,py, ax,ay, bx,by){
    const dx=bx-ax, dy=by-ay, len2=dx*dx+dy*dy;
    let t = len2 ? ((px-ax)*dx+(py-ay)*dy)/len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
  }
  // Hit-test an existing construction line/arc/circle by screen position.
  // Arcs are approximated by their end-to-end chord — good enough at click
  // precision, and matches this file's existing "referential" simplicity
  // (arcs are drawn via resolveRef(a)/resolveRef(b)/resolveRef(ctrl), not a
  // stored curve, so an exact arc-distance test would need to re-derive the
  // same quadratic curve rather than reuse anything already computed here).
  function hitCons(sx,sy,thr=8){
    for (let i=cons.length-1; i>=0; i--){
      const c=cons[i];
      if (c.kind==="circle"){
        const A=resolveRef(c.a), B=resolveRef(c.b);
        const [cx,cy]=toScreen(A[0],A[1]);
        const r=Math.hypot(B[0]-A[0],B[1]-A[1])*view.scale;
        if (Math.abs(Math.hypot(sx-cx,sy-cy)-r)<=thr) return c.id;
      } else {
        const A=resolveRef(c.a), B=resolveRef(c.b);
        const [ax,ay]=toScreen(A[0],A[1]), [bx,by]=toScreen(B[0],B[1]);
        if (distToSeg(sx,sy, ax,ay, bx,by)<=thr) return c.id;
      }
    }
    return null;
  }

  // Hit-test a free-drawn sketch stroke (Line/Arc/Pen/Freehand/Filled Shape)
  // by screen position — same screen-space distance-to-segment convention
  // as hitCons above. Arc is sampled into its actual quadratic-curve shape
  // first (matching drawSketch()'s own bulge-through-ctrl math exactly, not
  // just the straight start->end chord) so clicking along the visible curve
  // hits it, not just its two endpoints. A Filled Shape counts as hit
  // anywhere inside its fill too, not only right on the outline — it reads
  // as a solid shape on screen, so a click in the middle should select it.
  function hitSketch(sx,sy,thr=8){
    for (let i=sketch.length-1; i>=0; i--){
      const st=sketch[i];
      if (st.tool==="arc"){
        if (st.pts.length<2) continue;
        const [a,b]=st.pts.map(p=>toScreen(p[0],p[1]));
        let prev=a;
        if (st.ctrl){
          const bl=toScreen(st.ctrl[0],st.ctrl[1]);
          const qc=[2*bl[0]-(a[0]+b[0])/2, 2*bl[1]-(a[1]+b[1])/2];
          for (let k=1;k<=8;k++){ const t=k/8,u=1-t;
            const pt=[u*u*a[0]+2*u*t*qc[0]+t*t*b[0], u*u*a[1]+2*u*t*qc[1]+t*t*b[1]];
            if (distToSeg(sx,sy,prev[0],prev[1],pt[0],pt[1])<=thr) return i;
            prev=pt;
          }
        } else if (distToSeg(sx,sy,a[0],a[1],b[0],b[1])<=thr) return i;
      } else if (st.tool==="polygon"){
        const scr=st.pts.map(p=>toScreen(p[0],p[1]));
        if (scr.length>2 && inPoly(sx,sy,scr)) return i;
        for (let k=0;k<scr.length;k++){ const a=scr[k], b=scr[(k+1)%scr.length];
          if (distToSeg(sx,sy,a[0],a[1],b[0],b[1])<=thr) return i; }
      } else {
        const scr=st.pts.map(p=>toScreen(p[0],p[1]));
        for (let k=0;k<scr.length-1;k++) if (distToSeg(sx,sy,scr[k][0],scr[k][1],scr[k+1][0],scr[k+1][1])<=thr) return i;
      }
    }
    return null;
  }

  // ---- Add Point tool: insert a new vertex into a piece's outline edge ----
  // Finds the nearest point ON any visible/unlocked piece's outline EDGE
  // (not just its existing vertices) to a world position, within a screen
  // threshold. `t` is kept a little inside (0,1) so the result is never
  // exactly on top of an existing vertex (which would be a no-op insert).
  function findEdgeInsertion(wx, wy, thrPx=10){
    const thr = thrPx / view.scale;
    let best=null, bd=thr;
    pieces.forEach((p,pi)=>{
      if (!p.visible || p.locked) return;
      const n=p.outline.length;
      for (let i=0;i<n;i++){
        const a=p.outline[i], b=p.outline[(i+1)%n];
        const dx=b[0]-a[0], dy=b[1]-a[1], len2=dx*dx+dy*dy;
        if (!len2) continue;
        let t=((wx-a[0])*dx+(wy-a[1])*dy)/len2;
        t=Math.max(0.03, Math.min(0.97, t));
        const px=a[0]+t*dx, py=a[1]+t*dy;
        const d=Math.hypot(px-wx, py-wy);
        if (d<bd){ bd=d; best={ pieceIdx:pi, edgeIdx:i, point:[px,py] }; }
      }
    });
    return best;
  }
  // Splices `newPts` into p.outline right after `afterIdx`, first removing
  // `delCount` existing points there (0 for a pure insertion — Add Point's
  // own case below; >0 when REPLACING a span, e.g. the Curve Edge tool
  // replacing an edge's far endpoint with several bezier-sampled points).
  // Every index-bearing structure that references an outline POSITION —
  // edges[].fromIdx/toIdx (Walk the Seam / princess-seam placement —
  // js/app.js, js/geometry.js), curves[].fromIdx/toIdx (WP-14 bezier
  // metadata), chestEdgeIndices (js/validate.js's ease check), closingEdges
  // (WP-46 — user-marked "leave open for the closure" edges) and
  // pointNames (WP-46 — user-given names on outline vertices; two vertices
  // sharing a name are the Sewing Guide's cue that they should be matched
  // and seamed together) — is shifted so it still points at the same
  // PHYSICAL vertex afterward, not whatever now happens to sit at its old
  // numeric index. `curves` is excluded from its own entry's caller in
  // effect (that entry is added separately by the caller with its own
  // already-correct indices), but any OTHER existing curve on this same
  // piece is just as real a case as edges[]/chestEdgeIndices and was
  // silently missing before this helper existed.
  function spliceOutline(p, afterIdx, delCount, newPts){
    const shift = newPts.length - delCount;
    p.outline.splice(afterIdx+1, delCount, ...newPts);
    if (!shift) return;
    const bump = idx => idx>afterIdx ? idx+shift : idx;
    if (Array.isArray(p.edges)) p.edges.forEach(e=>{
      if (e.fromIdx!=null) e.fromIdx=bump(e.fromIdx);
      if (e.toIdx!=null) e.toIdx=bump(e.toIdx);
    });
    if (Array.isArray(p.curves)) p.curves.forEach(c=>{
      c.fromIdx=bump(c.fromIdx); c.toIdx=bump(c.toIdx);
    });
    if (Array.isArray(p.chestEdgeIndices)) p.chestEdgeIndices=p.chestEdgeIndices.map(bump);
    if (Array.isArray(p.closingEdges)) p.closingEdges=p.closingEdges.map(bump);
    if (p.pointNames){
      const next={};
      Object.entries(p.pointNames).forEach(([k,v])=>{ next[bump(Number(k))]=v; });
      p.pointNames=next;
    }
  }
  // Insert a new outline vertex right after edgeIdx.
  function insertOutlinePoint(pieceIdx, edgeIdx, pt){
    const p=pieces[pieceIdx]; if (!p) return false;
    pushUndo();
    // Splitting a closing edge in two keeps BOTH halves marked closing —
    // the physical opening the original edge represented doesn't shrink
    // just because a point was dropped onto it partway along.
    const wasClosing = Array.isArray(p.closingEdges) && p.closingEdges.includes(edgeIdx);
    spliceOutline(p, edgeIdx, 0, [pt]);
    if (wasClosing && !p.closingEdges.includes(edgeIdx+1)) p.closingEdges.push(edgeIdx+1);
    selected=pieceIdx; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null;
    render(); return true;
  }
  // Removes a single outline vertex — the Add Point tool's missing
  // counterpart. Refuses below 3 points (checkClosedOutline's own hard
  // floor, js/validate.js — a 2-point "outline" isn't a polygon at all) so
  // this can never leave a piece in a state Check Pattern would already
  // flag as broken. Reuses spliceOutline()'s own index-bookkeeping (curves/
  // edges/chestEdgeIndices all shift to keep pointing at the same physical
  // vertices) rather than a plain `outline.splice()`, for the identical
  // reason insertOutlinePoint() above does.
  function removeOutlinePoint(pieceIdx, idx){
    const p=pieces[pieceIdx]; if (!p || !p.outline[idx]) return false;
    if (p.outline.length<=3){ onWarn('outlineTooFewPoints'); return false; }
    pushUndo();
    // The two edges touching the vertex being deleted collapse into one —
    // neither old "closing" flag unambiguously describes the merged edge,
    // so drop both rather than guess. Same for the deleted vertex's own
    // name: it no longer exists, so any name it carried goes with it.
    const n=p.outline.length, prevEdge=(idx-1+n)%n;
    if (Array.isArray(p.closingEdges)) p.closingEdges=p.closingEdges.filter(e=>e!==prevEdge && e!==idx);
    if (p.pointNames) delete p.pointNames[idx];
    spliceOutline(p, idx-1, 1, []);
    selVertex=null;
    render(); return true;
  }
  // Toggle whether the edge running from outline vertex `edgeIdx` to the
  // next one is a CLOSING EDGE — an edge deliberately left open (not sewn)
  // for the garment's closure (a zip, button placket, hook-and-eye…)
  // instead of being seamed shut like every other edge. Purely a flag on
  // the piece; rendering (drawPiece) and the Sewing Guide both read it.
  function toggleClosingEdge(pieceIdx, edgeIdx){
    const p=pieces[pieceIdx]; if (!p || edgeIdx==null || edgeIdx<0 || edgeIdx>=p.outline.length) return false;
    pushUndo();
    p.closingEdges = p.closingEdges || [];
    const at = p.closingEdges.indexOf(edgeIdx);
    if (at>=0) p.closingEdges.splice(at,1); else p.closingEdges.push(edgeIdx);
    render(); return true;
  }
  function isClosingEdge(p, edgeIdx){ return !!(p && Array.isArray(p.closingEdges) && p.closingEdges.includes(edgeIdx)); }
  // Name (or rename/clear) a single outline vertex. Two vertices — on the
  // same piece or different pieces — sharing a non-empty name are the
  // Sewing Guide's cue that those two points should be matched up and
  // seamed together (e.g. a princess-seam break point, or where a gusset
  // meets a side panel). An empty/whitespace name clears it.
  function setOutlinePointName(pieceIdx, idx, name){
    const p=pieces[pieceIdx]; if (!p || !p.outline[idx]) return false;
    pushUndo();
    const v=(name||"").trim();
    p.pointNames = p.pointNames || {};
    if (v) p.pointNames[idx]=v; else delete p.pointNames[idx];
    render(); return true;
  }
  function getOutlinePointName(pieceIdx, idx){ const p=pieces[pieceIdx]; return (p && p.pointNames) ? p.pointNames[idx] : undefined; }
  // Set an outline vertex's exact coordinates (cm) — the numeric
  // counterpart to dragging a corner handle, for when a precise value
  // matters more than an eyeballed drag.
  function setOutlinePointXY(pieceIdx, idx, x, y){
    const p=pieces[pieceIdx]; if (!p || !p.outline[idx]) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    pushUndo();
    p.outline[idx] = [x, y];
    render(); return true;
  }
  // All (name, [{pieceIdx,idx,pieceName,x,y}, …]) groups with 2+ named
  // vertices sharing that name — the actual "should be seamed together"
  // pairs/groups the Sewing Guide (js/app.js buildSewingSteps) reports.
  // Pure read; kept here (rather than recomputed ad hoc in app.js) so the
  // exact same grouping logic backs both the live canvas labels and the
  // printed guide.
  function getMatchedPointGroups(){
    const byName = new Map();
    pieces.forEach((p,pi)=>{
      if (!p.pointNames) return;
      Object.entries(p.pointNames).forEach(([idxStr,name])=>{
        const idx=Number(idxStr); const pt=p.outline[idx]; if (!pt) return;
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push({ pieceIdx:pi, idx, pieceName:p.name, x:pt[0], y:pt[1] });
      });
    });
    return [...byName.entries()].filter(([,pts])=>pts.length>1).map(([name,pts])=>({name,points:pts}));
  }

  function removeSketch(i){
    if (!sketch[i]) return false;
    pushUndo(); sketch.splice(i,1); if (selSketch===i) selSketch=null; render(); return true;
  }
  function getSketch(){ return sketch; }
  // Mirrors addPoint/addPiece/addText's own "plain programmatic add" shape
  // — the pen/free/polygon tools normally build a stroke through their own
  // pointerdown/move/up sequence, but a stroke is just {tool, pts} once
  // finished, so there's no reason a caller (or a test) that already has
  // that shape needs to replay pointer events to get one onto the canvas.
  function addSketchStroke(stroke){
    pushUndo(); sketch.push(stroke); render(); return sketch.length-1;
  }

  // Delete whatever is currently selected on the canvas — a construction
  // point, a construction line/arc/circle, a text annotation, a notch, an
  // OUTLINE VERTEX (a specific point on a piece's own edge, clicked via its
  // handle — see handleHit()'s "point" type), a free-drawn sketch stroke
  // (Line/Arc/Pen/Freehand/Filled Shape), or (falling back to the
  // pre-existing behavior) a whole pattern piece. Checked in this order
  // because it's the same precedence click-to-select uses: the smallest/
  // most-precise targets first, piece last.
  function deleteSelection(){
    if (hlPoint!=null){ const id=hlPoint; hlPoint=null; removePoint(id); return true; }
    if (hlCons!=null){ const id=hlCons; hlCons=null; removeCons(id); return true; }
    if (selText!=null){ const id=selText; selText=null; removeText(id); return true; }
    if (selNotch){ const {pieceIdx,idx}=selNotch; selNotch=null; selVertex=null; return removeNotch(pieceIdx,idx); }
    if (selVertex!=null && selected>=0 && pieces[selected]){ const idx=selVertex; selVertex=null; return removeOutlinePoint(selected,idx); }
    if (selSketch!=null){ const i=selSketch; selSketch=null; return removeSketch(i); }
    if (multiSelected.length){
      pushUndo();
      multiSelected.slice().sort((a,b)=>b-a).forEach(i=>{ if(pieces[i]) pieces.splice(i,1); });
      multiSelected=[]; selected=-1; render(); return true;
    }
    if (selected>=0) return removePiece(selected);
    return false;
  }

  // Copy/cut/paste for whatever is currently selected — same precedence as
  // deleteSelection() (point > construction line/arc/circle > text > notch >
  // sketch stroke > piece), since at most one of those can be selected at a
  // time. Storing a JSON-cloned snapshot (not a live reference) means later
  // edits to the source, or deleting it outright (cut), can never
  // retroactively mutate what paste will produce; pasteClipboard() clones
  // it again on every call so repeated pastes don't end up sharing nested
  // arrays/objects.
  function copySelection(){
    if (hlPoint!=null){ const p=getPointById(hlPoint); if(!p) return false;
      clipboard = { type:"point", data: JSON.parse(JSON.stringify(p)) }; return true; }
    if (hlCons!=null){ const c=cons.find(x=>x.id===hlCons); if(!c) return false;
      clipboard = { type:"cons", data: JSON.parse(JSON.stringify(c)) }; return true; }
    if (selText!=null){ const t=texts.find(x=>x.id===selText); if(!t) return false;
      clipboard = { type:"text", data: JSON.parse(JSON.stringify(t)) }; return true; }
    if (selNotch){ const {pieceIdx,idx}=selNotch; const p=pieces[pieceIdx]; if(!p||!p.notches||!p.notches[idx]) return false;
      clipboard = { type:"notch", data:{ pieceIdx, notch: p.notches[idx].slice() } }; return true; }
    if (selSketch!=null){ const st=sketch[selSketch]; if(!st) return false;
      clipboard = { type:"sketch", data: JSON.parse(JSON.stringify(st)) }; return true; }
    if (selected>=0 && pieces[selected]){
      clipboard = { type:"piece", data: JSON.parse(JSON.stringify(pieces[selected])) }; return true; }
    return false;
  }
  function cutSelection(){
    if (!copySelection()) return false;
    deleteSelection();
    return true;
  }
  function hasClipboard(){ return !!clipboard; }
  // Pasted copies land offset from the source (rather than exactly on top of
  // it) so the duplicate is immediately visible and draggable on its own.
  function pasteClipboard(){
    if (!clipboard) return false;
    const OFFSET = 2; // cm
    const kind = clipboard.type;
    const data = JSON.parse(JSON.stringify(clipboard.data));
    if (kind==="notch" && !pieces[data.pieceIdx]) return false;   // source piece is gone
    pushUndo();
    if (kind==="point"){
      const id = pointSeq++;
      // Drop any formula link on paste — a formula-driven point recomputes
      // to the SAME spot as its source on the next recompute, silently
      // erasing the offset (and the whole point of pasting a duplicate).
      points.push({ ...data, id, x: data.x+OFFSET, y: data.y+OFFSET, xExpr:null, yExpr:null });
      hlPoint=id; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null; selected=-1;
    } else if (kind==="cons"){
      // Only literal {x,y} endpoints shift — a {pid} reference stays pinned
      // to the same construction point (that's what "referential" means).
      const shiftRef = r => (!r || r.pid!=null) ? r : { x:r.x+OFFSET, y:r.y+OFFSET };
      data.id = consSeq++; data.a = shiftRef(data.a); data.b = shiftRef(data.b); data.ctrl = shiftRef(data.ctrl);
      cons.push(data);
      hlCons=data.id; hlPoint=null; selText=null; selNotch=null; selVertex=null; selSketch=null; selected=-1;
    } else if (kind==="text"){
      const id = textSeq++;
      texts.push({ ...data, id, x: data.x+OFFSET, y: data.y+OFFSET });
      selText=id; hlPoint=null; hlCons=null; selNotch=null; selVertex=null; selSketch=null; selected=-1;
    } else if (kind==="notch"){
      const p = pieces[data.pieceIdx];
      p.notches = p.notches || [];
      p.notches.push([data.notch[0]+OFFSET, data.notch[1]+OFFSET]);
      selNotch = { pieceIdx: data.pieceIdx, idx: p.notches.length-1 }; hlPoint=null; hlCons=null; selText=null; selSketch=null; selVertex=null; selected=-1;
    } else if (kind==="sketch"){
      const shift = ([x,y]) => [x+OFFSET, y+OFFSET];
      data.pts = (data.pts||[]).map(shift);
      if (data.ctrl) data.ctrl = shift(data.ctrl);
      sketch.push(data);
      selSketch = sketch.length-1; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selected=-1;
    } else if (kind==="piece"){
      const shift = ([x,y]) => [x+OFFSET, y+OFFSET];
      data.name = { en:(data.name&&data.name.en||"Piece")+" copy", ar:(data.name&&data.name.ar||"قطعة")+" (نسخة)" };
      data.outline = data.outline.map(shift);
      data.darts = (data.darts||[]).map(d=>d.map(shift));
      data.notches = (data.notches||[]).map(shift);
      data.grain = (data.grain||[]).map(shift);
      if (Array.isArray(data.curves)) data.curves = data.curves.map(c => ({ ...c, c1: shift(c.c1), c2: shift(c.c2) }));
      pieces.push(data);
      selected = pieces.length-1; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null;
    } else return false;
    render();
    return true;
  }

  // ================= RENDER =================
  function render() {
    if (!ctx) return;
    const W = cv.width/dpr, H = cv.height/dpr;
    ctx.clearRect(0,0,W,H);
    drawBackground();
    if (ghostSnap && ghostSnap.visible) drawSnapshot();
    if (opts.grid) drawGrid(W,H);
    drawRulers(W,H);
    pieces.forEach((p,i)=>drawPiece(p,i));
    if (selected>=0 && pieces[selected] && pieces[selected].visible && SHOW_HANDLES.has(tool)) drawHandles(pieces[selected]);
    drawMultiSelection();
    drawConstruction();
    drawSketch();
    drawTexts();
    drawMeasure();
    drawClickPreview();
    drawSnapMark();
    drawAddPointPreview();
    drawLassoPreview();
    drawCurveEditPreview();
    drawDartEditPreview();
  }
  // Dashed accent outline around every group-selected piece (Shift+click or
  // Lasso) — SHOW_HANDLES-style single-piece handles don't apply to a
  // multi-piece group (there's no one anchor/rotate/scale center that makes
  // sense), so this is deliberately just a highlight, not editable handles.
  function drawMultiSelection(){
    if (!multiSelected.length) return;
    ctx.save(); ctx.strokeStyle = CSS("--ok") || "#2fb380"; ctx.lineWidth = 2.4; ctx.setLineDash([5,4]);
    multiSelected.forEach(i=>{ const p=pieces[i]; if (p && p.visible){ path(p.outline); ctx.stroke(); } });
    ctx.restore();
  }
  // Live rubber-band while the Lasso tool is being dragged.
  function drawLassoPreview(){
    if (!lassoPts || lassoPts.length<2) return;
    ctx.save(); ctx.strokeStyle = CSS("--brand"); ctx.fillStyle = hexA(CSS("--brand"),0.08);
    ctx.lineWidth = 1.6; ctx.setLineDash([4,3]);
    path(lassoPts.map(pt=>pt), true);
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // ---- trace-over background reference image ----
  function drawBackground(){
    if (!bg || !bg.visible || !bg.img) return;
    const w = bg.img.naturalWidth*bg.scale, h = bg.img.naturalHeight*bg.scale;
    const [sx,sy] = toScreen(bg.x, bg.y);
    ctx.save(); ctx.globalAlpha = bg.opacity;
    ctx.drawImage(bg.img, sx, sy, w*view.scale, h*view.scale);
    ctx.restore();
  }

  // ---- frozen snapshot ghost overlay (compare current edits against a past state) ----
  function drawSnapshot(){
    ctx.save(); ctx.globalAlpha = ghostSnap.opacity;
    ghostSnap.pieces.forEach(p=>{
      path(p.outline);
      ctx.fillStyle = hexA(p.color||CSS("--brand"), 0.5);
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = p.color||CSS("--brand"); ctx.setLineDash([3,3]);
      ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.restore();
  }

  // ---- construction geometry: referential points + lines/arcs/circles ----
  function resolveRef(ref){
    if (!ref) return [0,0];
    if (ref.pid!=null){ const p=getPointById(ref.pid); return p ? [p.x,p.y] : [0,0]; }
    return [ref.x, ref.y];
  }
  function drawConstruction(){
    const brand = CSS("--brand"), ok = CSS("--ok");
    cons.forEach(c=>{
      const A=resolveRef(c.a), B=resolveRef(c.b);
      const sa=toScreen(A[0],A[1]), sb=toScreen(B[0],B[1]);
      ctx.strokeStyle=brand; ctx.lineWidth=1.4; ctx.setLineDash(c.kind==="circle"?[]:[]);
      if (c.kind==="line"){ ctx.beginPath(); ctx.moveTo(sa[0],sa[1]); ctx.lineTo(sb[0],sb[1]); ctx.stroke(); }
      else if (c.kind==="arc"){
        ctx.beginPath(); ctx.moveTo(sa[0],sa[1]);
        if (c.ctrl){ const C=resolveRef(c.ctrl); const sc=toScreen(C[0],C[1]);
          ctx.quadraticCurveTo(2*sc[0]-(sa[0]+sb[0])/2, 2*sc[1]-(sa[1]+sb[1])/2, sb[0],sb[1]); }
        else ctx.lineTo(sb[0],sb[1]);
        ctx.stroke();
      } else if (c.kind==="circle"){
        const r = Math.hypot(B[0]-A[0], B[1]-A[1]) * view.scale;
        ctx.beginPath(); ctx.arc(sa[0],sa[1], r, 0, Math.PI*2); ctx.stroke();
      }
      // Object Browser highlight — a thicker halo redrawn on top of the selected line/arc/circle.
      if (c.id===hlCons){
        ctx.save(); ctx.strokeStyle=ok; ctx.lineWidth=4; ctx.globalAlpha=0.55; ctx.setLineDash([]);
        if (c.kind==="line"){ ctx.beginPath(); ctx.moveTo(sa[0],sa[1]); ctx.lineTo(sb[0],sb[1]); ctx.stroke(); }
        else if (c.kind==="arc"){
          ctx.beginPath(); ctx.moveTo(sa[0],sa[1]);
          if (c.ctrl){ const C=resolveRef(c.ctrl); const sc=toScreen(C[0],C[1]);
            ctx.quadraticCurveTo(2*sc[0]-(sa[0]+sb[0])/2, 2*sc[1]-(sa[1]+sb[1])/2, sb[0],sb[1]); }
          else ctx.lineTo(sb[0],sb[1]);
          ctx.stroke();
        } else if (c.kind==="circle"){
          const r = Math.hypot(B[0]-A[0], B[1]-A[1]) * view.scale;
          ctx.beginPath(); ctx.arc(sa[0],sa[1], r, 0, Math.PI*2); ctx.stroke();
        }
        ctx.restore();
      }
    });
    points.forEach(p=>{
      const [x,y] = toScreen(p.x,p.y);
      const inBuf = promoteBuf.includes(p.id);
      if (p.id===hlPoint){
        ctx.save(); ctx.strokeStyle=ok; ctx.lineWidth=2.5; ctx.globalAlpha=0.85;
        ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = inBuf ? ok : brand;
      ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
      ctx.lineWidth=1.5; ctx.strokeStyle=CSS("--panel"); ctx.stroke();
      ctx.fillStyle=CSS("--ink"); ctx.font="600 10px Inter, sans-serif"; ctx.textAlign="start";
      ctx.fillText(p.name, x+6, y-5);
    });
    // rubber-band preview for the in-progress circle tool
    if (drawing && drawing.tool==="circle"){
      const sc=toScreen(drawing.center[0],drawing.center[1]);
      const r=Math.hypot(drawing.rim[0]-drawing.center[0], drawing.rim[1]-drawing.center[1])*view.scale;
      ctx.strokeStyle=brand; ctx.setLineDash([5,4]); ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(sc[0],sc[1],r,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ---- text annotations ----
  function drawTexts(){
    texts.forEach(tx=>{
      const [sx,sy]=toScreen(tx.x,tx.y);
      const px = Math.max(4, (tx.size||4)*view.scale);
      ctx.font = `${tx.italic?"italic ":""}${tx.bold?"700":"400"} ${px}px Inter, Cairo, sans-serif`;
      ctx.textAlign = "start"; ctx.fillStyle = tx.color || CSS("--ink");
      ctx.fillText(tx.text, sx, sy);
      // cache the screen bbox for hit-testing / dragging
      tx._sx = sx; tx._sy = sy; tx._w = ctx.measureText(tx.text).width; tx._h = px;
      if (tx.id===selText){
        ctx.save(); ctx.strokeStyle=CSS("--ok"); ctx.lineWidth=1.5; ctx.setLineDash([3,2]);
        ctx.strokeRect(tx._sx-4, tx._sy-tx._h-4, tx._w+8, tx._h+10);
        ctx.restore();
      }
    });
  }
  function hitText(sx, sy){
    for (let i = texts.length-1; i >= 0; i--){
      const t = texts[i];
      if (t._w == null) continue;
      if (sx >= t._sx-4 && sx <= t._sx+t._w+4 && sy >= t._sy-t._h-4 && sy <= t._sy+6) return i;
    }
    return -1;
  }

  // Draw the selection bounding box, corner scale handles, rotate knob and anchor points.
  function drawHandles(p){
    const g=handleGeo(p), brand=CSS("--brand"), accent=CSS("--accent"), panel=CSS("--panel");
    // bounding box — oriented to the piece's own current rotation (see handleGeo)
    ctx.strokeStyle=brand; ctx.lineWidth=1; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(g.corners[0][0],g.corners[0][1]);
    for (let i=1;i<4;i++) ctx.lineTo(g.corners[i][0],g.corners[i][1]);
    ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    // rotate arm + knob
    ctx.strokeStyle=brand; ctx.beginPath(); ctx.moveTo(g.topMid[0],g.topMid[1]); ctx.lineTo(g.rotate[0],g.rotate[1]); ctx.stroke();
    knob(g.rotate, 6, brand, panel, true);
    // corner scale handles
    g.corners.forEach(c=>knob(c, 5, brand, panel, false));
    // editable anchor points (control points) — the currently selected one
    // (selVertex, if this is the selected piece — clicked via its own
    // handle, Delete-able) drawn larger and in the "ok" colour so it's
    // visually obvious which single point Delete would remove.
    const ok=CSS("--ok");
    g.anchors.forEach((a,i)=>{
      const isSel = selVertex===i && pieces[selected]===p;
      knob(a, isSel?6:4, isSel?ok:accent, panel, true);
    });
  }
  function knob(pt, r, stroke, fill, round){
    ctx.lineWidth=1.5; ctx.strokeStyle=stroke; ctx.fillStyle=fill;
    if (round){ ctx.beginPath(); ctx.arc(pt[0],pt[1],r,0,Math.PI*2); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.rect(pt[0]-r,pt[1]-r,r*2,r*2); ctx.fill(); ctx.stroke(); }
  }

  // Rubber-band preview for the two-click tools (knife / grainline).
  function drawClickPreview(){
    if (!clickBuf.length || !(tool==="knife"||tool==="grain")) return;
    const a=toScreen(clickBuf[0][0],clickBuf[0][1]);
    ctx.fillStyle=CSS("--brand"); ctx.beginPath(); ctx.arc(a[0],a[1],4,0,7); ctx.fill();
    if (cursorWorld){
      const b=toScreen(cursorWorld[0],cursorWorld[1]);
      ctx.strokeStyle=CSS("--brand"); ctx.setLineDash([5,4]); ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function drawSnapMark(){
    if (!snapMark) return;
    const [x,y]=toScreen(snapMark[0],snapMark[1]);
    ctx.strokeStyle=CSS("--ok"); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-9,y); ctx.lineTo(x+9,y); ctx.moveTo(x,y-9); ctx.lineTo(x,y+9); ctx.stroke();
  }
  // Live preview for the Add Point tool: a small ring at the spot on the
  // nearest edge that a click would insert a vertex at.
  function drawAddPointPreview(){
    if (tool!=="addpoint" || !addPointPreview) return;
    const [x,y]=toScreen(addPointPreview.point[0], addPointPreview.point[1]);
    ctx.strokeStyle=CSS("--accent"); ctx.lineWidth=1.5; ctx.setLineDash([2,2]);
    ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle=CSS("--accent"); ctx.beginPath(); ctx.arc(x,y,2.5,0,Math.PI*2); ctx.fill();
  }
  // Add Dart tool: before the drag starts, a ring at the edge point the
  // dart's two legs would straddle (same visual language as
  // drawAddPointPreview above); once dragging, a live V preview of the
  // actual dart (legA -> apex -> legC) that would commit on release.
  function drawDartEditPreview(){
    if (dartEdit){
      if (dartEdit.moved < DART_MIN_DEPTH_CM) return;
      const { legA, legC } = dartLegsFor(dartEdit.pieceIdx, dartEdit.edgeIdx, dartEdit.mouth);
      if (!legA) return;
      const sa=toScreen(legA[0],legA[1]), sc=toScreen(legC[0],legC[1]), sap=toScreen(dartEdit.apex[0],dartEdit.apex[1]);
      ctx.save(); ctx.strokeStyle=CSS("--brand"); ctx.lineWidth=2.2; ctx.setLineDash([5,3]);
      ctx.beginPath(); ctx.moveTo(sa[0],sa[1]); ctx.lineTo(sap[0],sap[1]); ctx.lineTo(sc[0],sc[1]); ctx.stroke();
      ctx.restore();
      return;
    }
    if (tool==="dart" && dartHoverPreview){
      const [x,y]=toScreen(dartHoverPreview.point[0], dartHoverPreview.point[1]);
      ctx.strokeStyle=CSS("--brand"); ctx.lineWidth=1.5; ctx.setLineDash([2,2]);
      ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle=CSS("--brand"); ctx.beginPath(); ctx.arc(x,y,2.5,0,Math.PI*2); ctx.fill();
    }
  }

  function drawGrid(W,H) {
    const s = view.scale, g = CSS("--grid"), gs = CSS("--grid-strong");
    const startX = view.x % s, startY = view.y % s;
    ctx.lineWidth = 1;
    ctx.strokeStyle = g;
    ctx.beginPath();
    for (let x=startX; x<W; x+=s){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
    for (let y=startY; y<H; y+=s){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
    ctx.stroke();
    // strong lines every 5cm
    ctx.strokeStyle = gs; ctx.beginPath();
    const s5=s*5, sx=view.x%s5, sy=view.y%s5;
    for (let x=sx; x<W; x+=s5){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
    for (let y=sy; y<H; y+=s5){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
    ctx.stroke();
  }

  function drawRulers(W,H) {
    const s = view.scale, ink2 = CSS("--ink-2"), panel = CSS("--panel"), line = CSS("--line");
    ctx.fillStyle = panel; ctx.fillRect(0,0,W,18); ctx.fillRect(0,0,18,H);
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(0,18); ctx.lineTo(W,18); ctx.moveTo(18,0); ctx.lineTo(18,H); ctx.stroke();
    ctx.fillStyle = ink2; ctx.font = "9px Inter, sans-serif"; ctx.textAlign="left";
    const unit = opts.unitsCm ? 5 : 2.54*2; // tick every 5cm or 2in
    const px = unit*s;
    for (let x = view.x%px; x<W; x+=px){ const cm=Math.round(toWorld(x,0)[0]); ctx.fillText(opts.unitsCm?cm:Math.round(cm/2.54), x+2, 12); ctx.strokeStyle=line; ctx.beginPath(); ctx.moveTo(x,14); ctx.lineTo(x,18); ctx.stroke(); }
    for (let y = view.y%px; y<H; y+=px){ const cm=Math.round(toWorld(0,y)[1]); ctx.save(); ctx.translate(11,y-2); ctx.rotate(-Math.PI/2); ctx.fillText(opts.unitsCm?cm:Math.round(cm/2.54),0,0); ctx.restore(); }
  }

  function path(poly, close=true){ ctx.beginPath(); poly.forEach((p,i)=>{ const [x,y]=toScreen(p[0],p[1]); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); if(close)ctx.closePath(); }

  // WP-39 (Tailornova feature study): an uploaded fabric-swatch Image, decoded
  // once and cached by its own dataURL — Image objects (unlike three-view.js's
  // GPU textures) have no dispose-ownership contract to worry about, so a
  // plain cross-render cache is safe here. Returns null until decode finishes
  // (an onload re-render then picks it up); drawPiece()'s solid-colour
  // fallback covers that one gap frame.
  const textureImgCache = new Map();
  const TEXTURE_TILE_CM = 10; // one full repeat of an uploaded photo ≈ 10cm of fabric
  function getTextureImage(dataURL) {
    let entry = textureImgCache.get(dataURL);
    if (!entry) {
      const img = new Image();
      entry = { img, ready: false };
      img.onload = () => { entry.ready = true; render(); };
      img.src = dataURL;
      textureImgCache.set(dataURL, entry);
    }
    return entry.ready ? entry.img : null;
  }

  function drawPiece(p, i) {
    if (!p.visible) return;
    const sel = i===selected;
    const col = p.color || CSS("--brand");
    // seam allowance (dashed outer)
    if (opts.seam) {
      const off = offsetPoly(p.outline, opts.seamCm);
      ctx.setLineDash([6,4]); ctx.lineWidth=1.5; ctx.strokeStyle=CSS("--ink-2");
      path(off); ctx.stroke(); ctx.setLineDash([]);
    }
    // fill (cutting area) — fabric colour + adjustable transparency
    // (a piece may carry its own opacity override from Layer properties)
    const baseOp = p.opacity != null ? p.opacity : opts.fillOpacity;
    const fillAlpha = sel ? Math.min(0.85, baseOp*1.9) : baseOp;
    path(p.outline);
    // WP-39 (Tailornova feature study): an uploaded fabric-swatch photo fills
    // the piece as a real tiled pattern instead of a solid colour, once its
    // Image has decoded (getTextureImage() returns null on the first ask and
    // triggers a render() when ready — the solid-colour fallback below covers
    // that one frame so the piece is never invisible while it loads).
    const texImg = p.textureDataURL ? getTextureImage(p.textureDataURL) : null;
    if (texImg) {
      const pat = ctx.createPattern(texImg, "repeat");
      const s = view.scale * TEXTURE_TILE_CM / texImg.naturalWidth;
      if (pat.setTransform) pat.setTransform(new DOMMatrix([s,0,0,s,0,0]));
      ctx.fillStyle = pat; ctx.globalAlpha = fillAlpha; ctx.fill(); ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = hexA(col, fillAlpha); ctx.fill();
    }
    // cutting line
    ctx.lineWidth = sel?3:2; ctx.strokeStyle = col;
    if (p.locked) ctx.setLineDash([2,3]);
    ctx.stroke(); ctx.setLineDash([]);

    // closing edges (WP-46) — redrawn on top of the cutting line in a
    // distinct dashed accent so an edge deliberately left open for the
    // garment's closure (zip/buttons/hook-and-eye) reads differently from
    // every other seam at a glance. See js/canvas.js toggleClosingEdge().
    if (p.closingEdges && p.closingEdges.length){
      const n=p.outline.length;
      ctx.save(); ctx.strokeStyle=CSS("--warn"); ctx.lineWidth=(sel?3:2)+1.5; ctx.setLineDash([2,4]); ctx.lineCap="round";
      p.closingEdges.forEach(ei=>{
        if (ei<0 || ei>=n) return;
        const a=toScreen(p.outline[ei][0], p.outline[ei][1]), b=toScreen(p.outline[(ei+1)%n][0], p.outline[(ei+1)%n][1]);
        ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
      });
      ctx.restore(); ctx.setLineDash([]);
    }

    // darts
    ctx.lineWidth=1.4; ctx.strokeStyle=col;
    (p.darts||[]).forEach(d=>{ ctx.beginPath(); const [a,b,c]=d.map(pt=>toScreen(pt[0],pt[1])); ctx.moveTo(b[0],b[1]); ctx.lineTo(a[0],a[1]); ctx.lineTo(c[0],c[1]); ctx.stroke(); });

    // notches
    (p.notches||[]).forEach((nt,ni)=>{
      const [x,y]=toScreen(nt[0],nt[1]);
      ctx.fillStyle=CSS("--ink"); ctx.beginPath(); ctx.moveTo(x,y-5); ctx.lineTo(x-3,y+3); ctx.lineTo(x+3,y+3); ctx.closePath(); ctx.fill();
      if (selNotch && selNotch.pieceIdx===i && selNotch.idx===ni){
        ctx.save(); ctx.strokeStyle=CSS("--ok"); ctx.lineWidth=2.5; ctx.globalAlpha=0.85;
        ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.stroke(); ctx.restore();
      }
    });

    // named outline points (WP-46) — a small tag beside the vertex; two
    // vertices sharing a name (same piece or different pieces) are what
    // the Sewing Guide (js/app.js buildSewingSteps) reads as "match and
    // seam these together". See setOutlinePointName()/getMatchedPointGroups().
    if (p.pointNames){
      ctx.font="600 10px Inter, sans-serif"; ctx.textAlign="start"; ctx.fillStyle=CSS("--accent");
      Object.entries(p.pointNames).forEach(([idxStr,name])=>{
        const idx=Number(idxStr), pt=p.outline[idx]; if (!pt) return;
        const [x,y]=toScreen(pt[0],pt[1]);
        ctx.fillText(name, x+7, y-7);
      });
    }

    // grainline arrow
    if (p.grain && p.grain.length===2){
      const [a,b]=p.grain.map(pt=>toScreen(pt[0],pt[1]));
      ctx.strokeStyle=col; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
      arrow(a,b); arrow(b,a);
    }

    // bilingual label
    const cx = avg(p.outline.map(pt=>pt[0])), cy = avg(p.outline.map(pt=>pt[1]));
    const [lx,ly]=toScreen(cx,cy);
    const lang = document.documentElement.dir==="rtl"?"ar":"en";
    ctx.textAlign="center"; ctx.fillStyle=CSS("--ink");
    ctx.font="700 12px "+(lang==="ar"?"Cairo, sans-serif":"Inter, sans-serif");
    ctx.fillText(p.name[lang], lx, ly-4);
    ctx.font="600 10px "+(lang==="ar"?"Inter":"Cairo")+", sans-serif";
    ctx.fillStyle=col;
    ctx.fillText(p.name[lang==="ar"?"en":"ar"], lx, ly+10);
    if (p.locked) drawLock(lx, ly-20);
  }
  // small padlock glyph (piece is locked)
  function drawLock(cx, cy){
    ctx.strokeStyle=CSS("--ink-2"); ctx.fillStyle=CSS("--ink-2"); ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.arc(cx, cy-2, 2.6, Math.PI, 0); ctx.stroke();   // shackle
    ctx.beginPath(); ctx.rect(cx-3.5, cy, 7, 6); ctx.fill();             // body
  }

  function arrow(from,to){ const a=Math.atan2(to[1]-from[1],to[0]-from[0]); const L=7; ctx.beginPath(); ctx.moveTo(to[0],to[1]); ctx.lineTo(to[0]-L*Math.cos(a-0.4),to[1]-L*Math.sin(a-0.4)); ctx.moveTo(to[0],to[1]); ctx.lineTo(to[0]-L*Math.cos(a+0.4),to[1]-L*Math.sin(a+0.4)); ctx.stroke(); }
  const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
  function hexA(c,a){ // supports hex or css color -> rgba
    const t=document.createElement("canvas").getContext("2d"); t.fillStyle=c; const h=t.fillStyle;
    if(h[0]==="#"){const n=parseInt(h.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;}
    return h.replace("rgb(","rgba(").replace(")",`,${a})`);
  }

  function drawSketch(){
    ctx.strokeStyle=CSS("--accent"); ctx.lineWidth=2; ctx.lineJoin="round"; ctx.lineCap="round";
    const all = drawing? sketch.concat([drawing]) : sketch;
    all.forEach(st=>{
      // Arc: quadratic curve bowing through the bulge point (ctrl). While the
      // bulge isn't set yet it previews as the straight chord. "conarc" is the
      // point-aware construction-arc tool sharing this same preview logic.
      if(st.tool==="arc" || st.tool==="conarc"){
        if(st.pts.length<2) return;
        const isCon = st.tool==="conarc";
        const [a,b]=st.pts.map(p=>toScreen(p[0],p[1]));
        ctx.strokeStyle = isCon ? CSS("--brand") : CSS("--accent");
        ctx.beginPath(); ctx.moveTo(a[0],a[1]);
        if(st.ctrl){ const bl=toScreen(st.ctrl[0],st.ctrl[1]);
          // control so the curve passes through the bulge at its midpoint
          ctx.quadraticCurveTo(2*bl[0]-(a[0]+b[0])/2, 2*bl[1]-(a[1]+b[1])/2, b[0],b[1]); }
        else ctx.lineTo(b[0],b[1]);
        ctx.stroke();
        [a,b].forEach(p=>{ctx.fillStyle=isCon?CSS("--brand"):CSS("--accent");ctx.beginPath();ctx.arc(p[0],p[1],3,0,7);ctx.fill();});
        return;
      }
      // Construction line preview (point-aware Line tool) — brand-coloured
      // to visually distinguish real construction geometry from sketch marks.
      if(st.tool==="conline"){
        if(st.pts.length<2) return;
        const [a,b]=st.pts.map(p=>toScreen(p[0],p[1]));
        ctx.strokeStyle=CSS("--brand"); ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
        return;
      }
      // Filled polygon: closed shape, filled while drawn and once committed.
      if(st.tool==="polygon"){
        if(!st.pts.length) return;
        ctx.beginPath();
        st.pts.forEach((p,i)=>{const[x,y]=toScreen(p[0],p[1]); i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
        if(st.pts.length>2){ ctx.closePath(); ctx.fillStyle=hexA(CSS("--accent"),0.22); ctx.fill(); }
        ctx.strokeStyle=CSS("--accent"); ctx.lineWidth=2; ctx.stroke();
        if(st===drawing){
          st.pts.forEach(p=>{const[x,y]=toScreen(p[0],p[1]); ctx.fillStyle=CSS("--accent"); ctx.beginPath(); ctx.arc(x,y,3,0,7); ctx.fill();});
          // rubber-band from the last vertex to the cursor
          if(cursorWorld){ const last=toScreen(st.pts[st.pts.length-1][0],st.pts[st.pts.length-1][1]); const cur=toScreen(cursorWorld[0],cursorWorld[1]);
            ctx.setLineDash([4,3]); ctx.beginPath(); ctx.moveTo(last[0],last[1]); ctx.lineTo(cur[0],cur[1]); ctx.stroke(); ctx.setLineDash([]); }
        }
        return;
      }
      if(st.pts.length<2 && st!==drawing) return;
      ctx.beginPath(); st.pts.forEach((p,i)=>{const[x,y]=toScreen(p[0],p[1]); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke();
      if(st.tool==="pen"){ st.pts.forEach(p=>{const[x,y]=toScreen(p[0],p[1]); ctx.fillStyle=CSS("--accent"); ctx.beginPath(); ctx.arc(x,y,3,0,7); ctx.fill();});}
    });
    // Selection highlight, redrawn on top — same "--ok" halo hlCons uses for
    // a selected construction line/arc/circle, so a selected sketch stroke
    // reads as selected the same way everything else on the canvas does.
    if (selSketch!=null && sketch[selSketch]){
      const st = sketch[selSketch];
      ctx.save(); ctx.strokeStyle=CSS("--ok"); ctx.lineWidth=4; ctx.globalAlpha=0.55; ctx.lineJoin="round"; ctx.lineCap="round"; ctx.setLineDash([]);
      if (st.tool==="arc" && st.pts.length>=2){
        const [a,b]=st.pts.map(p=>toScreen(p[0],p[1]));
        ctx.beginPath(); ctx.moveTo(a[0],a[1]);
        if (st.ctrl){ const bl=toScreen(st.ctrl[0],st.ctrl[1]);
          ctx.quadraticCurveTo(2*bl[0]-(a[0]+b[0])/2, 2*bl[1]-(a[1]+b[1])/2, b[0],b[1]); }
        else ctx.lineTo(b[0],b[1]);
        ctx.stroke();
      } else if (st.pts && st.pts.length){
        ctx.beginPath(); st.pts.forEach((p,i)=>{const[x,y]=toScreen(p[0],p[1]); i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
        if (st.tool==="polygon" && st.pts.length>2) ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawMeasure(){
    if(measurePts.length===0) return;
    ctx.strokeStyle=CSS("--brand"); ctx.setLineDash([4,3]); ctx.lineWidth=1.5;
    ctx.beginPath(); measurePts.forEach((p,i)=>{const[x,y]=toScreen(p[0],p[1]); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke(); ctx.setLineDash([]);
    measurePts.forEach(p=>{const[x,y]=toScreen(p[0],p[1]);ctx.fillStyle=CSS("--brand");ctx.beginPath();ctx.arc(x,y,4,0,7);ctx.fill();});
    if(measurePts.length===2){
      const d=Math.hypot(measurePts[1][0]-measurePts[0][0],measurePts[1][1]-measurePts[0][1]);
      const val=opts.unitsCm?d.toFixed(1)+" cm":(d/2.54).toFixed(2)+" in";
      const mx=(measurePts[0][0]+measurePts[1][0])/2, my=(measurePts[0][1]+measurePts[1][1])/2;
      const[x,y]=toScreen(mx,my);
      ctx.fillStyle=CSS("--brand"); ctx.font="700 12px Inter"; ctx.textAlign="center";
      const w=ctx.measureText(val).width+14;
      ctx.fillRect(x-w/2,y-22,w,18); ctx.fillStyle="#fff"; ctx.fillText(val,x,y-9);
    }
  }

  // ================= INTERACTION =================
  function bind() {
    cv.addEventListener("wheel", e=>{
      e.preventDefault(); userAdjusted = true;
      const [wx,wy]=toWorld(e.offsetX,e.offsetY);
      const f = e.deltaY<0?1.1:0.9;
      view.scale=Math.min(20,Math.max(0.6,view.scale*f));
      const [sx,sy]=toScreen(wx,wy);
      view.x+=e.offsetX-sx; view.y+=e.offsetY-sy;
      render(); onZoom();
    }, {passive:false});

    cv.addEventListener("pointerdown", e=>{
      cv.setPointerCapture(e.pointerId);
      const [wx,wy]=toWorld(e.offsetX,e.offsetY);

      // WP-19: an armed external pick takes priority over everything else
      // — the current tool's own click behavior is suppressed for this one
      // click. Same snap affordance the Point construction tool uses
      // (magnet to an existing construction point, else grid-snap), so a
      // click on a construction point, a dart apex (no dedicated snap
      // target — lands on its grid-snapped click position), or empty
      // canvas space all produce a real pattern-space coordinate.
      if (pickCb){
        const s = snapConstruction(wx, wy, e.shiftKey);
        const cb = pickCb; pickCb = null;
        cb({ x: s.x, y: s.y });
        render();
        return;
      }

      if (e.button===1 || e.spaceKey || tool==="pan"){ pan={x:e.offsetX,y:e.offsetY,vx:view.x,vy:view.y}; userAdjusted=true; return; }

      // (0) construction points / lines-arcs-circles / notches — select
      // (Backspace-able) and, for points, drag — take priority when using
      // Select/Move, smallest/most-precise targets first.
      if (tool==="select" || tool==="move"){
        const pid = hitPointScreen(e.offsetX, e.offsetY);
        if (pid!=null){ pushUndo(); dragPoint={id:pid, ox:wx, oy:wy}; hlPoint=pid; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null; selected=-1; onPick(null); render(); return; }
        const cid = hitCons(e.offsetX, e.offsetY);
        if (cid!=null){ hlCons=cid; hlPoint=null; selText=null; selNotch=null; selVertex=null; selSketch=null; selected=-1; onPick(null); render(); return; }
        const nh = hitNotch(e.offsetX, e.offsetY);
        if (nh){ selNotch=nh; hlPoint=null; hlCons=null; selText=null; selSketch=null; selVertex=null; selected=-1; onPick(null); render(); return; }
        // Sketch strokes (Line/Arc/Pen/Freehand/Filled Shape) — click-to-
        // select and Delete/Cut/Copy only, no drag-to-move yet (unlike
        // points/text/pieces above and below) — a real gap, but out of
        // scope for what was actually reported (no way to remove one at
        // all short of Undo or nuking every sketch stroke via "Clear
        // Sketch"), which this fixes.
        const sh = hitSketch(e.offsetX, e.offsetY);
        if (sh!=null){ selSketch=sh; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selected=-1; onPick(null); render(); return; }
      }

      // construction tools: point / line / arc / circle / promote-to-piece / calibrate
      if (tool==="point"){ const s=snapConstruction(wx,wy,e.shiftKey); if(s.pid==null) addPoint(s.x,s.y); render(); return; }
      if (tool==="conline"){
        const s=snapConstruction(wx,wy,e.shiftKey);
        drawing={tool:"conline", pts:[[s.x,s.y],[s.x,s.y]], refs:[refFromSnap(s), null]};
        return;
      }
      if (tool==="conarc"){
        if (!drawing || drawing.tool!=="conarc"){
          const s=snapConstruction(wx,wy,e.shiftKey);
          drawing={tool:"conarc", phase:1, pts:[[s.x,s.y],[s.x,s.y]], refs:[refFromSnap(s), null], ctrl:null, ctrlRef:null};
        } else if (drawing.phase===1){
          const s=snapConstruction(wx,wy,e.shiftKey);
          drawing.pts[1]=[s.x,s.y]; drawing.refs[1]=refFromSnap(s); drawing.phase=2;
        } else {
          const pid=nearestPointId(wx,wy,10,e.shiftKey); drawing.ctrl=[wx,wy];
          drawing.ctrlRef = pid!=null ? {pid} : {x:wx,y:wy};
          pushUndo(); cons.push({id:consSeq++, kind:"arc", a:drawing.refs[0], b:drawing.refs[1], ctrl:drawing.ctrlRef});
          drawing=null;
        }
        render(); return;
      }
      if (tool==="circle"){
        if (!drawing || drawing.tool!=="circle"){
          const s=snapConstruction(wx,wy,e.shiftKey);
          drawing={tool:"circle", center:[s.x,s.y], centerRef:refFromSnap(s), rim:[s.x,s.y]};
        } else {
          const s=snapConstruction(wx,wy,e.shiftKey);
          pushUndo(); cons.push({id:consSeq++, kind:"circle", a:drawing.centerRef, b:refFromSnap(s)});
          drawing=null;
        }
        render(); return;
      }
      if (tool==="promote"){
        const pid = hitPointScreen(e.offsetX, e.offsetY);
        if (pid==null){
          // No construction point there — try a closed SKETCH shape instead
          // (Filled Shape/Pen/Freehand) so the SAME tool/button promotes
          // either source of a closed outline, rather than needing two
          // separate tools for what's conceptually one action.
          const si = hitSketch(e.offsetX, e.offsetY);
          if (si!=null) promoteSketchToPiece(si);
          return;
        }
        if (promoteBuf.length>=3 && pid===promoteBuf[0]){
          pendingPromoteOutline = promoteBuf.map(id=>{ const p=getPointById(id); return [p.x,p.y]; });
          pendingPromoteIds = promoteBuf.slice();
          onPromoteReq(pendingPromoteOutline.slice());
          promoteBuf=[];
        } else if (!promoteBuf.includes(pid)) promoteBuf.push(pid);
        render(); return;
      }
      if (tool==="calib"){
        if (!bg) return;
        clickBuf.push([wx,wy]);
        if (clickBuf.length===2){ onCalibReq(Math.hypot(clickBuf[1][0]-clickBuf[0][0], clickBuf[1][1]-clickBuf[0][1])); clickBuf=[]; }
        render(); return;
      }

      // (1) grab a selection handle (rotate / scale corner / anchor point)
      if (selected>=0 && pieces[selected] && !pieces[selected].locked && SHOW_HANDLES.has(tool)){
        const hh=handleHit(pieces[selected], e.offsetX, e.offsetY);
        if (hh){
          // Grabbing a specific outline point selects it (persists after
          // release, Backspace/Delete-able — see deleteSelection()); any
          // OTHER handle (rotate/scale) deselects whichever point used to
          // be selected, same as clicking elsewhere would.
          selVertex = hh.type==="point" ? hh.idx : null;
          beginEdit(hh, wx, wy); return;
        }
      }

      // (2) two-click tools: knife (split) & grainline
      if (tool==="knife" || tool==="grain"){
        clickBuf.push([snap(wx,e.shiftKey),snap(wy,e.shiftKey)]);
        if (clickBuf.length===2){
          if (tool==="knife") doKnife(clickBuf[0],clickBuf[1]);
          else doGrainLine(clickBuf[0],clickBuf[1]);
          clickBuf=[];
          if (selected>=0) onPick(pieces[selected], e.clientX, e.clientY);
        }
        render(); return;
      }
      // (3) single-click tools: notch & symmetry
      if (tool==="notch"){ if(addNotch(wx,wy) && selected>=0) onPick(pieces[selected], e.clientX, e.clientY); render(); return; }
      if (tool==="symmetry"){ const h=hitPiece(wx,wy); if(h>=0){ doMirror(h); onPick(pieces[selected], e.clientX, e.clientY); } render(); return; }
      if (tool==="addpoint"){
        const hit=findEdgeInsertion(wx,wy);
        if (hit){ insertOutlinePoint(hit.pieceIdx, hit.edgeIdx, hit.point); onPick(pieces[hit.pieceIdx], e.clientX, e.clientY); }
        render(); return;
      }
      // Curve Edge: arm on pointerdown near an edge, drag to bow it (commits
      // on release — see pointerup below), same "grab now, decide the real
      // shape on release" shape as the handle-based rotate/scale edit.
      if (tool==="curve"){
        const hit=findEdgeInsertion(wx,wy);
        if (!hit) return;
        const p=pieces[hit.pieceIdx], n=p.outline.length, fromIdx=hit.edgeIdx, toIdx=fromIdx+1;
        if (toIdx>=n){ onWarn('curveWraparound'); return; }
        selected=hit.pieceIdx; onPick(p, e.clientX, e.clientY);
        curveEdit = {
          pieceIdx: hit.pieceIdx, fromIdx,
          p0: p.outline[fromIdx].slice(), p1: p.outline[toIdx].slice(),
          bulge: hit.point.slice(), startX: wx, startY: wy, moved: 0,
          existing: (p.curves||[]).find(c=>c.fromIdx===fromIdx) || null,
        };
        render(); return;
      }

      // Add Dart: arm on pointerdown near an edge (its two legs will
      // straddle that point), drag inward to place the apex, commits on
      // release — same shape as Curve Edge just above.
      if (tool==="dart"){
        const hit=findEdgeInsertion(wx,wy);
        if (!hit) return;
        selected=hit.pieceIdx; onPick(pieces[hit.pieceIdx], e.clientX, e.clientY);
        dartEdit = { pieceIdx:hit.pieceIdx, edgeIdx:hit.edgeIdx, mouth:hit.point.slice(), apex:hit.point.slice(), startX:wx, startY:wy, moved:0 };
        render(); return;
      }

      // text: click empty space to place, click existing text to edit
      if (tool==="text"){
        const ti = hitText(e.offsetX, e.offsetY);
        if (ti>=0) onText({ mode:"edit", item:texts[ti], cx:e.clientX, cy:e.clientY });
        else onText({ mode:"new", wx, wy, cx:e.clientX, cy:e.clientY });
        return;
      }

      if (tool==="measure"){ if(measurePts.length>=2)measurePts=[]; measurePts.push([wx,wy]); render(); return; }
      if (tool==="line"){ drawing={tool:"line",pts:[[snap(wx,e.shiftKey),snap(wy,e.shiftKey)]]}; return; }
      if (tool==="arc"){
        // 3 clicks: start → end → bulge
        if(!drawing || drawing.tool!=="arc"){ drawing={tool:"arc",phase:1,pts:[[snap(wx,e.shiftKey),snap(wy,e.shiftKey)],[snap(wx,e.shiftKey),snap(wy,e.shiftKey)]],ctrl:null}; }
        else if(drawing.phase===1){ drawing.pts[1]=[snap(wx,e.shiftKey),snap(wy,e.shiftKey)]; drawing.phase=2; }
        else { drawing.ctrl=[wx,wy]; pushUndo(); sketch.push(drawing); drawing=null; }
        render(); return;
      }
      if (tool==="pen"){ if(!drawing)drawing={tool:"pen",pts:[]}; drawing.pts.push([snap(wx,e.shiftKey),snap(wy,e.shiftKey)]); render(); return; }
      if (tool==="polygon"){
        // click to add vertices; click near the start point (or double-click) closes the shape
        if (!drawing || drawing.tool!=="polygon"){ drawing={tool:"polygon",pts:[[snap(wx,e.shiftKey),snap(wy,e.shiftKey)]]}; render(); return; }
        const first=toScreen(drawing.pts[0][0],drawing.pts[0][1]);
        if (drawing.pts.length>=3 && Math.hypot(first[0]-e.offsetX, first[1]-e.offsetY)<=10){
          pushUndo(); sketch.push(drawing); drawing=null; render(); return;
        }
        drawing.pts.push([snap(wx,e.shiftKey),snap(wy,e.shiftKey)]); render(); return;
      }
      if (tool==="free"||tool==="freehand"){ drawing={tool:"free",pts:[[wx,wy]]}; return; }
      // Lasso: freehand-drag a loop, release to select every piece whose
      // centroid lands inside it — an ephemeral selection aid, unlike
      // pen/free/polygon's sketch strokes, so lassoPts is never pushed onto
      // `sketch` and leaves nothing behind once the selection is made.
      // Shift+drag ADDS to whatever's already group-selected instead of
      // replacing it, the standard lasso convention.
      if (tool==="lasso"){ lassoPts=[[wx,wy]]; lassoAdditive=e.shiftKey; return; }

      // (4) rotate / scale by dragging anywhere on a piece body
      if (tool==="rotate" || tool==="scale"){
        const h=hitPiece(wx,wy);
        if (h>=0){ selected=h; onPick(pieces[h], e.clientX, e.clientY); beginEdit({type:tool}, wx, wy); }
        else { selected=-1; onPick(null); render(); }
        return;
      }

      // (5) select / move — text labels are draggable too
      if (tool==="select" || tool==="move"){
        const ti = hitText(e.offsetX, e.offsetY);
        if (ti>=0){ pushUndo(); dragText={ i:ti, ox:wx, oy:wy }; selText=texts[ti].id; hlPoint=null; hlCons=null; selNotch=null; selVertex=null; selected=-1; onPick(null); render(); return; }
      }
      const hit = hitPiece(wx,wy);
      // Shift+click toggles group membership instead of replacing the
      // selection — the one thing tt_select's own tooltip has always
      // promised ("Shift-click for multi-select") without it ever actually
      // existing. A bare (non-shift) click on a piece already inside an
      // existing group drags the WHOLE group together; on anything else it
      // clears the group back down to a plain single selection, matching
      // ordinary click-to-deselect-others conventions.
      if ((tool==="select"||tool==="move") && e.shiftKey && hit>=0){
        const at = multiSelected.indexOf(hit);
        if (at>=0) multiSelected.splice(at,1); else multiSelected.push(hit);
        selected = multiSelected.length===1 ? multiSelected[0] : -1;
        hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null;
        onPick(selected>=0 ? pieces[selected] : null, e.clientX, e.clientY);
        render(); return;
      }
      if (hit>=0){
        hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null;
        if ((tool==="select"||tool==="move") && multiSelected.includes(hit) && multiSelected.length>1){
          // dragging a member of an existing group moves the whole group —
          // keep multiSelected/selected exactly as they are
          onPick(null, e.clientX, e.clientY);
          dragPiece={i:hit,ox:wx,oy:wy,group:multiSelected.slice()}; pushUndo();
        } else {
          multiSelected=[]; selected=hit; onPick(pieces[hit], e.clientX, e.clientY);
          if(tool==="select"||tool==="move"){ dragPiece={i:hit,ox:wx,oy:wy}; pushUndo(); }
        }
      } else {
        selected=-1; onPick(null);
        if (tool==="select"||tool==="move"){ multiSelected=[]; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null; }
      }
      render();
    });

    cv.addEventListener("pointermove", e=>{
      const [wx,wy]=toWorld(e.offsetX,e.offsetY);
      cursorWorld=[wx,wy];
      if (pan){ view.x=pan.vx+(e.offsetX-pan.x); view.y=pan.vy+(e.offsetY-pan.y); render(); return; }

      // live handle editing
      if (edit){
        const p=pieces[selected];
        if (edit.type==="point"){ p.outline[edit.idx]=snapToPoint(wx,wy,selected,edit.idx,e.shiftKey); }
        else if (edit.type==="rotate"){ const ang=Math.atan2(wy-edit.c[1],wx-edit.c[0])-edit.startAng; applyFromSnap(p,edit.snp,rotAbout(edit.c,ang)); }
        else if (edit.type==="scale"){ let f=Math.hypot(wx-edit.c[0],wy-edit.c[1])/edit.startDist; f=Math.max(0.2,Math.min(5,f)); applyFromSnap(p,edit.snp,sclAbout(edit.c,f)); }
        render(); return;
      }
      snapMark=null;

      if (dragText){ const t=texts[dragText.i]; t.x+=wx-dragText.ox; t.y+=wy-dragText.oy; dragText.ox=wx; dragText.oy=wy; render(); return; }
      if (dragPoint){ const p=getPointById(dragPoint.id); if(p){ p.x+=wx-dragPoint.ox; p.y+=wy-dragPoint.oy; p.xExpr=null; p.yExpr=null; } dragPoint.ox=wx; dragPoint.oy=wy; render(); return; }
      if (dragPiece){
        const dx=wx-dragPiece.ox, dy=wy-dragPiece.oy;
        if (dragPiece.group) dragPiece.group.forEach(gi=>movePiece(gi,dx,dy));
        else movePiece(dragPiece.i,dx,dy);
        dragPiece.ox=wx; dragPiece.oy=wy; render(); return;
      }
      if (drawing && drawing.tool==="line"){
        drawing.pts[1] = e.shiftKey ? snapAngle45(drawing.pts[0][0], drawing.pts[0][1], wx, wy) : [snap(wx,false), snap(wy,false)];
        render(); return;
      }
      if (drawing && drawing.tool==="arc"){ if(drawing.phase===1) drawing.pts[1]=[snap(wx,e.shiftKey),snap(wy,e.shiftKey)]; else drawing.ctrl=[wx,wy]; render(); return; }
      if (drawing && drawing.tool==="conline"){
        if (e.shiftKey){
          const [sx,sy] = snapAngle45(drawing.pts[0][0], drawing.pts[0][1], wx, wy);
          drawing.pts[1]=[sx,sy]; drawing.refs[1]={x:sx,y:sy};
        } else {
          const s=snapConstruction(wx,wy,false); drawing.pts[1]=[s.x,s.y]; drawing.refs[1]=refFromSnap(s);
        }
        render(); return;
      }
      if (drawing && drawing.tool==="conarc"){
        if(drawing.phase===1){ const s=snapConstruction(wx,wy,e.shiftKey); drawing.pts[1]=[s.x,s.y]; drawing.refs[1]=refFromSnap(s); }
        else { drawing.ctrl=[wx,wy]; const pid=nearestPointId(wx,wy,10,e.shiftKey); snapMark = pid!=null ? [getPointById(pid).x,getPointById(pid).y] : null; }
        render(); return;
      }
      if (drawing && drawing.tool==="circle"){ const s=snapConstruction(wx,wy,e.shiftKey); drawing.rim=[s.x,s.y]; render(); return; }
      if (tool==="point"){ snapConstruction(wx,wy,e.shiftKey); render(); return; }
      if (drawing && drawing.tool==="free"){ drawing.pts.push([wx,wy]); render(); return; }
      if (tool==="lasso" && lassoPts){ lassoPts.push([wx,wy]); render(); return; }
      if (clickBuf.length && (tool==="knife"||tool==="grain"||tool==="calib")){ render(); return; }
      if (drawing && drawing.tool==="polygon"){ render(); return; }
      if (tool==="addpoint"){ addPointPreview=findEdgeInsertion(wx,wy); render(); return; }
      if (curveEdit){
        curveEdit.bulge=[wx,wy];
        curveEdit.moved=Math.max(curveEdit.moved, Math.hypot(wx-curveEdit.startX, wy-curveEdit.startY));
        render(); return;
      }
      if (dartEdit){
        dartEdit.apex=[wx,wy];
        dartEdit.moved=Math.max(dartEdit.moved, Math.hypot(wx-dartEdit.startX, wy-dartEdit.startY));
        render(); return;
      }
      if (tool==="dart"){ dartHoverPreview=findEdgeInsertion(wx,wy); render(); return; }

      // hover cursor feedback over handles
      if (selected>=0 && pieces[selected] && SHOW_HANDLES.has(tool)){
        const hh=handleHit(pieces[selected], e.offsetX, e.offsetY);
        cv.style.cursor = hh ? (hh.type==="rotate"?"grab":hh.type==="scale"?"nwse-resize":"crosshair") : (tool==="select"||tool==="move"?"default":"crosshair");
      }
    });

    cv.addEventListener("pointerup", ()=>{
      if (edit){ edit=null; snapMark=null; render(); }
      // line & freehand commit on release; arc & pen are click-driven
      if (drawing && (drawing.tool==="line"||drawing.tool==="free")){ if(drawing.pts.length>1){ pushUndo(); sketch.push(drawing);} drawing=null; render(); }
      // construction line commits on release too (a single drag, like the sketch Line tool)
      if (drawing && drawing.tool==="conline"){
        const [a,b]=drawing.pts;
        if (Math.hypot(b[0]-a[0], b[1]-a[1]) > 0.25){ pushUndo(); cons.push({id:consSeq++, kind:"line", a:drawing.refs[0], b:drawing.refs[1]}); }
        drawing=null; render();
      }
      // Lasso commits on release: a piece counts as "inside" when its own
      // centroid falls inside the drawn loop — simple, and matches how a
      // lasso reads to the eye for the compact, mostly-convex garment
      // pieces this app deals in (no need for a full polygon-intersection
      // test to get an intuitively correct result). A loop too small to be
      // a real drag (a near-stationary click) just clears the selection
      // instead — the lasso tool's equivalent of the Select tool's
      // click-empty-space-to-deselect.
      if (tool==="lasso" && lassoPts){
        const loop=lassoPts;
        const xs=loop.map(p=>p[0]), ys=loop.map(p=>p[1]);
        const bigEnough = loop.length>=3 && (Math.max(...xs)-Math.min(...xs) > 0.6 || Math.max(...ys)-Math.min(...ys) > 0.6);
        if (bigEnough){
          const enclosed=[];
          pieces.forEach((p,i)=>{ if(p.visible && !p.locked){ const c=centroid(p.outline); if(inPoly(c[0],c[1],loop)) enclosed.push(i); } });
          multiSelected = lassoAdditive ? Array.from(new Set([...multiSelected, ...enclosed])) : enclosed;
        } else if (!lassoAdditive) multiSelected=[];
        selected = multiSelected.length===1 ? multiSelected[0] : -1;
        onPick(selected>=0 ? pieces[selected] : null);
        lassoPts=null; render();
      }
      if (curveEdit) commitCurveEdit();
      if (dartEdit) commitDartEdit();
      pan=null; dragPiece=null; dragText=null; dragPoint=null;
    });
    cv.addEventListener("dblclick", (e)=>{
      if(drawing&&drawing.tool==="pen"){ if(drawing.pts.length>1){pushUndo(); sketch.push(drawing);} drawing=null; render(); return; }
      if(drawing&&drawing.tool==="polygon"){ if(drawing.pts.length>=3){pushUndo(); sketch.push(drawing);} drawing=null; render(); return; }
      const pid=hitPointScreen(e.offsetX,e.offsetY);
      if(pid!=null){ onPointReq({ point:getPointById(pid), cx:e.clientX, cy:e.clientY }); return; }
      const ti=hitText(e.offsetX,e.offsetY);
      if(ti>=0) onText({ mode:"edit", item:texts[ti], cx:e.clientX, cy:e.clientY });
    });
  }

  // WP-<n>: drag-move used to leave p.curves' c1/c2 control points behind at
  // their pre-move position while the outline itself moved — nudgePiece()
  // (keyboard arrows, below) already got this right; a dragged piece with
  // any curved edge (from the new Curve Edge tool, or a princess-seam piece
  // from js/fancy-patterns.js) would visibly desync its curve from its own
  // outline the instant it was dragged. Mirrors nudgePiece()'s own shift.
  function movePiece(i,dx,dy){ const p=pieces[i];
    const mv=pt=>[pt[0]+dx,pt[1]+dy];
    p.outline=p.outline.map(mv); p.darts=(p.darts||[]).map(d=>d.map(mv));
    p.notches=(p.notches||[]).map(mv); p.grain=(p.grain||[]).map(mv);
    if (p.curves) p.curves = p.curves.map(c => ({ ...c, c1: mv(c.c1), c2: mv(c.c2) }));
  }
  // Begin a handle edit; freeze the piece geometry so transforms are drift-free.
  function beginEdit(hh, wx, wy){
    pushUndo();
    const p=pieces[selected], c=centroid(p.outline);
    edit={ ...hh, c, snp:snapGeo(p) };
    if (hh.type==="rotate") edit.startAng=Math.atan2(wy-c[1], wx-c[0]);
    if (hh.type==="scale")  edit.startDist=Math.hypot(wx-c[0], wy-c[1])||1;
  }
  // Set a piece's grainline from two clicked points.
  function doGrainLine(a,b){
    let i=hitPiece(a[0],a[1]); if(i<0) i=selected; if(i<0) return false;
    pushUndo(); pieces[i].grain=[[a[0],a[1]],[b[0],b[1]]]; selected=i; return true;
  }
  function hitPiece(x,y){
    for(let i=pieces.length-1;i>=0;i--){ if(pieces[i].visible && !pieces[i].locked && inPoly(x,y,pieces[i].outline)) return i; }
    return -1;
  }
  function inPoly(x,y,poly){ let c=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const[xi,yi]=poly[i],[xj,yj]=poly[j]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c; } return c; }

  // ================= PUBLIC API =================
  function fit(){
    userAdjusted = false;
    if(!pieces.length){ view={x:60,y:60,scale:3.2}; render(); onZoom(); return; }
    const all=pieces.flatMap(p=>p.outline);
    const xs=all.map(p=>p[0]), ys=all.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const W=cv.width/dpr, H=cv.height/dpr;
    const sc=Math.min((W-80)/(maxX-minX||1),(H-80)/(maxY-minY||1));
    view.scale=Math.min(12,Math.max(1,sc));
    view.x=(W-(maxX+minX)*view.scale)/2; view.y=(H-(maxY+minY)*view.scale)/2;
    render(); onZoom();
  }
  function zoom(f){ userAdjusted=true; const W=cv.width/dpr/2,H=cv.height/dpr/2; const[wx,wy]=toWorld(W,H); view.scale=Math.min(20,Math.max(0.6,view.scale*f)); const[sx,sy]=toScreen(wx,wy); view.x+=W-sx; view.y+=H-sy; render(); onZoom(); }
  let onZoom=()=>{};
  // Pan (no zoom change) so world point (wx,wy) lands at the viewport center — used
  // by the Object Browser to bring a clicked point/line/arc/circle into view.
  function centerOn(wx,wy){
    userAdjusted=true;
    const W=cv.width/dpr/2, H=cv.height/dpr/2;
    const [sx,sy]=toScreen(wx,wy);
    view.x+=W-sx; view.y+=H-sy;
    render();
  }
  function selectPoint(id){
    const p=getPointById(id); if(!p) return false;
    hlPoint=id; hlCons=null; centerOn(p.x,p.y); return true;
  }
  function selectCons(id){
    const c=cons.find(x=>x.id===id); if(!c) return false;
    hlCons=id; hlPoint=null;
    const A=resolveRef(c.a);
    if(c.kind==="circle"){ centerOn(A[0],A[1]); }
    else{ const B=resolveRef(c.b); centerOn((A[0]+B[0])/2,(A[1]+B[1])/2); }
    return true;
  }
  function clearHighlight(){ hlPoint=null; hlCons=null; render(); }
  function setTool(t){
    tool=t; clickBuf=[]; edit=null; snapMark=null;
    if(t!=="addpoint") addPointPreview=null;
    if(t!=="measure")measurePts=[];
    if(t!=="promote"){ promoteBuf=[]; pendingPromoteOutline=null; pendingPromoteIds=null; pendingPromoteSketchIdx=null; }
    if(t!=="pen"&&drawing&&drawing.tool==="pen"){sketch.push(drawing);drawing=null;}
    if(t!=="polygon"&&drawing&&drawing.tool==="polygon"){ if(drawing.pts.length>=3)sketch.push(drawing); drawing=null; }
    if(drawing&&drawing.tool==="arc"&&t!=="arc"){ drawing=null; }   // drop an unfinished arc
    if(drawing&&drawing.tool==="conarc"&&t!=="conarc"){ drawing=null; }
    if(drawing&&drawing.tool==="conline"&&t!=="conline"){ drawing=null; }
    if(drawing&&drawing.tool==="circle"&&t!=="circle"){ drawing=null; }
    if(t!=="lasso") lassoPts=null;
    if(t!=="curve") curveEdit=null;   // drop an in-progress (uncommitted) curve drag
    if(t!=="dart"){ dartEdit=null; dartHoverPreview=null; }   // drop an in-progress (uncommitted) dart drag
    // Group selection only stays meaningful for the tools that can act on
    // a group at all (select/move to drag it, lasso to add to it) — every
    // other tool (rotate/scale/curve/promote/knife/...) has single-piece or
    // non-piece semantics, so switching to one drops back to a plain
    // single/no selection rather than leaving a stale, misleading group
    // highlight up that tool can't actually do anything with.
    if(t!=="select"&&t!=="move"&&t!=="lasso"&&multiSelected.length) multiSelected=[];
    cv.style.cursor = (t==="pan")?"grab":(t==="select"||t==="move")?"default":(t==="rotate")?"grab":(t==="text")?"text":"crosshair";
    render();
  }
  function setOpt(k,v){ opts[k]=v; render(); }
  function getOpt(k){ return opts[k]; }
  function getZoom(){ return Math.round(view.scale/3.2*100); }
  function toggleVisible(i){ pieces[i].visible=!pieces[i].visible; render(); }
  function toggleLock(i){ pieces[i].locked=!pieces[i].locked; if(pieces[i].locked && selected===i) selected=-1; render(); }
  function setColor(i,color){ if(pieces[i]){ pieces[i].color=color; render(); } }
  function setMaterial(i,matKey){ if(pieces[i]){ pieces[i].material=matKey||null; render(); } }
  function setTexture(i,dataURL){ if(pieces[i]){ pieces[i].textureDataURL=dataURL||null; render(); } }
  function getSelected(){ return selected; }
  // Indices of every piece currently in the group selection (Shift+click or
  // Lasso) — empty array when there's none/only a plain single selection.
  function getMultiSelection(){ return multiSelected.slice(); }
  function selectPiece(i){ if(pieces[i] && !pieces[i].locked){ selected=i; multiSelected=[]; render(); } }
  function clearSketch(){ pushUndo(); sketch=[]; render(); }
  function onZoomChange(cb){ onZoom=cb; }
  // A real cubic bezier ('C') for any span p.curves (WP-14) declares,
  // straight lines ('L') for everything else — otherwise a piece's curved
  // seams export as the exact same flattened straight-segment shape as its
  // hard corners, even though SVG paths natively support the cubic beziers
  // the control points in p.curves already are. Mirrors pattern-export.js's
  // outlinePathOps() (used by the PDF builders) for the same reason.
  function outlinePathD(p){
    const o=p.outline, n=o.length;
    const curveByFrom = new Map((p.curves||[]).map(c=>[c.fromIdx,c]));
    let d = `M ${o[0][0]} ${o[0][1]}`;
    let i=0;
    while(i<n-1){
      const c = curveByFrom.get(i);
      if (c && c.toIdx>i && c.toIdx<n && c.c1 && c.c2){
        d += ` C ${c.c1[0]} ${c.c1[1]} ${c.c2[0]} ${c.c2[1]} ${o[c.toIdx][0]} ${o[c.toIdx][1]}`;
        i = c.toIdx;
      } else { i++; d += ` L ${o[i][0]} ${o[i][1]}`; }
    }
    return d + " Z";
  }
  function exportSVG(){
    if(!pieces.length) return "";
    const all=pieces.flatMap(p=>p.outline); const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
    const minX=Math.min(...xs)-3,minY=Math.min(...ys)-3,w=Math.max(...xs)-minX+3,h=Math.max(...ys)-minY+3;
    let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}cm" height="${h}cm">`;
    pieces.forEach(p=>{ s+=`<path d="${outlinePathD(p)}" fill="none" stroke="#222" stroke-width="0.2"/>`;
      if(p.grain?.length===2) s+=`<line x1="${p.grain[0][0]}" y1="${p.grain[0][1]}" x2="${p.grain[1][0]}" y2="${p.grain[1][1]}" stroke="#222" stroke-width="0.15"/>`; });
    const escXML = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    texts.forEach(tx=>{ s+=`<text x="${tx.x}" y="${tx.y}" font-size="${tx.size||4}" fill="${tx.color||"#222"}"${tx.bold?' font-weight="700"':""}${tx.italic?' font-style="italic"':""} font-family="Inter, sans-serif">${escXML(tx.text)}</text>`; });
    return s+"</svg>";
  }

  // ---- text annotation API ----
  function addText(props){ pushUndo(); const t={ id:textSeq++, size:4, bold:false, italic:false, ...props }; texts.push(t); render(); return t.id; }
  function updateText(id, props){ const t=texts.find(x=>x.id===id); if(!t) return false; pushUndo(); Object.assign(t, props); render(); return true; }
  function removeText(id){ const i=texts.findIndex(x=>x.id===id); if(i<0) return false; pushUndo(); texts.splice(i,1); if (selText===id) selText=null; render(); return true; }
  function getTexts(){ return texts; }
  function onTextRequest(cb){ onText = cb || (()=>{}); }

  // ---- layer management API ----
  function addPiece(name){
    pushUndo();
    // place the new block in free space to the right of existing content
    let ox=8, oy=8;
    if(pieces.length){
      const xs=pieces.flatMap(p=>p.outline.map(pt=>pt[0]));
      const ys=pieces.flatMap(p=>p.outline.map(pt=>pt[1]));
      ox=Math.max(...xs)+12; oy=Math.min(...ys);
    }
    const w=30, h=30;
    pieces.push({
      name: name || { en:"New Layer", ar:"طبقة جديدة" }, desc:{ en:"", ar:"" },
      outline:[[ox,oy],[ox+w,oy],[ox+w,oy+h],[ox,oy+h]], darts:[], notches:[],
      grain:[[ox+w/2,oy+4],[ox+w/2,oy+h-4]], visible:true, locked:false,
      color:["#6d5efc","#00c2a8","#ff5d8f","#e2a52b","#4c8dff","#c1492e"][pieces.length%6],
    });
    selected=pieces.length-1; render(); return selected;
  }
  function removePiece(i){ if(!pieces[i]) return false; pushUndo(); pieces.splice(i,1); if(selected>=pieces.length) selected=-1; render(); return true; }
  function renamePiece(i, name){ if(!pieces[i]) return false; pushUndo(); pieces[i].name={ ...pieces[i].name, ...name }; render(); return true; }
  function setPieceProps(i, props){ if(!pieces[i]) return false; Object.assign(pieces[i], props); render(); return true; }

  // ---- import pieces parsed from an external SVG/DXF file (js/pattern-
  // import.js does the actual file parsing — pure, no Canvas state; this
  // just places the resulting outlines into the pattern). Same "free space
  // to the right of whatever's already there" placement addPiece() uses,
  // except the whole imported batch moves together as one group (translated,
  // not individually repositioned) so a multi-piece DXF/SVG keeps its
  // pieces' relative layout intact instead of scattering them. Every new
  // piece lands group-selected (multiSelected) so it's immediately obvious
  // in the Layers pane which ones just arrived. Returns the count imported.
  function importPieces(newPieces){
    if (!Array.isArray(newPieces) || !newPieces.length) return 0;
    pushUndo();
    let ox=8, oy=8;
    if (pieces.length){
      const xs=pieces.flatMap(p=>p.outline.map(pt=>pt[0]));
      const ys=pieces.flatMap(p=>p.outline.map(pt=>pt[1]));
      ox=Math.max(...xs)+12; oy=Math.min(...ys);
    }
    const allX = newPieces.flatMap(p=>p.outline.map(pt=>pt[0]));
    const allY = newPieces.flatMap(p=>p.outline.map(pt=>pt[1]));
    const dx = ox-Math.min(...allX), dy = oy-Math.min(...allY);
    const startIdx = pieces.length;
    newPieces.forEach((np,i)=>{
      const mv = pt => [pt[0]+dx, pt[1]+dy];
      const outline = np.outline.map(mv);
      const curves = (np.curves||[]).map(c=>({ fromIdx:c.fromIdx, toIdx:c.toIdx, c1:mv(c.c1), c2:mv(c.c2) }));
      const xs=outline.map(p=>p[0]), ys=outline.map(p=>p[1]);
      const gx=(Math.min(...xs)+Math.max(...xs))/2, gTop=Math.min(...ys), gBot=Math.max(...ys);
      pieces.push({
        name: np.name ? { en:np.name, ar:np.name } : { en:`Imported ${startIdx+i+1}`, ar:`مستورد ${startIdx+i+1}` },
        desc:{ en:"", ar:"" }, outline, curves, darts:[], notches:[],
        grain: gBot-gTop>4 ? [[gx,gTop+2],[gx,gBot-2]] : [[gx,gTop],[gx,gBot]],
        visible:true, locked:false,
        color:["#6d5efc","#00c2a8","#ff5d8f","#e2a52b","#4c8dff","#c1492e"][(startIdx+i)%6],
      });
    });
    multiSelected = newPieces.map((_,i)=>startIdx+i);
    selected = multiSelected.length===1 ? multiSelected[0] : -1;
    fit(); return newPieces.length;
  }

  // WP-17: keyboard nudge for the selected piece (arrow keys in js/app.js's
  // keys() handler). Translates every coordinate-bearing field a piece can
  // have, not just outline — darts/notches/grain/curves would otherwise
  // visually detach from a moved outline.
  function nudgeOnePiece(p, dx, dy){
    const shift = ([x,y]) => [x+dx, y+dy];
    p.outline = p.outline.map(shift);
    if (p.darts) p.darts = p.darts.map(d => d.map(shift));
    if (p.notches) p.notches = p.notches.map(shift);
    if (p.grain) p.grain = p.grain.map(shift);
    if (p.curves) p.curves = p.curves.map(c => ({ ...c, c1: shift(c.c1), c2: shift(c.c2) }));
  }
  function nudgePiece(i, dx, dy){
    const p = pieces[i]; if(!p) return false;
    pushUndo();
    nudgeOnePiece(p, dx, dy);
    render();
    return true;
  }
  // Group version of the above — a single Shift/arrow-key nudge on a
  // multi-selection (js/app.js's keys() handler) moves every selected
  // piece together as ONE undo step, not one per piece.
  function nudgePieces(indices, dx, dy){
    if (!indices || !indices.length) return false;
    pushUndo();
    indices.forEach(i=>{ if (pieces[i]) nudgeOnePiece(pieces[i], dx, dy); });
    render();
    return true;
  }

  // ============================================================
  // CONSTRUCTION GEOMETRY — points, referential lines/arcs/circles,
  // custom parametric variables, "promote to pattern piece", trace image.
  //
  // Points are named, draggable anchors. Lines/arcs/circles reference a
  // point by id (not a frozen coordinate) when drawn starting/ending near
  // one, so dragging a point updates every segment attached to it — real
  // associative (parametric) geometry, not a static sketch.
  //
  // "Create Pattern Piece" walks a closed loop of existing points and
  // SNAPSHOTS their current resolved coordinates into a normal, independent
  // pattern piece (colourable, lockable, exportable, gradable like any other
  // layer). It is a one-time promotion, not a live link — once a piece is
  // created, moving the source points no longer reshapes it, the same way
  // cutting fabric from a paper draft doesn't un-cut if you redraw the draft.
  // ============================================================

  // ---- tiny safe formula evaluator (+,-,*,/, parens, named lookups) ----
  // Deliberately not eval()/Function() — user formulas never run as code.
  function tokenizeExpr(src){
    const re = /\s*([A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|\.\d+|[()+\-*/])/g;
    const toks=[]; let m;
    while((m = re.exec(src))) toks.push(m[1]);
    return toks;
  }
  function evalExpr(src, lookup){
    const toks=tokenizeExpr(String(src)); let pos=0;
    const peek=()=>toks[pos]; const next=()=>toks[pos++];
    function parseExpr(){ let v=parseTerm(); while(peek()==="+"||peek()==="-"){ const op=next(); const r=parseTerm(); v = op==="+"?v+r:v-r; } return v; }
    function parseTerm(){ let v=parseUnary(); while(peek()==="*"||peek()==="/"){ const op=next(); const r=parseUnary(); v = op==="*"?v*r:v/r; } return v; }
    function parseUnary(){ if(peek()==="-"){ next(); return -parseUnary(); } if(peek()==="+"){ next(); return parseUnary(); } return parseAtom(); }
    function parseAtom(){
      const t=next();
      if(t===undefined) throw new Error("unexpected end of formula");
      if(t==="("){ const v=parseExpr(); if(next()!==")") throw new Error("expected )"); return v; }
      if(/^[0-9.]/.test(t)) return parseFloat(t);
      const v=lookup(t);
      if(v==null || isNaN(v)) throw new Error("unknown name: "+t);
      return v;
    }
    if(!toks.length) throw new Error("empty formula");
    const result=parseExpr();
    if(pos<toks.length) throw new Error("unexpected token: "+toks[pos]);
    if(!isFinite(result)) throw new Error("invalid result");
    return result;
  }

  // ---- custom parametric variables (name -> formula string) ----
  function resolveVar(name, seen){
    seen = seen || new Set();
    if(seen.has(name)) throw new Error("circular reference: "+name);
    if(!(name in variables)) return null;
    seen.add(name);
    return evalExpr(variables[name], n => lookupCtx(n, seen));
  }
  function lookupCtx(n, seen){
    if(n in variables) return resolveVar(n, seen);
    const m = measureProvider() || {};
    if(n in m) return +m[n];
    return null;
  }
  function setVariable(name, formula){
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("invalid variable name");
    const prev = variables[name];
    variables[name] = formula;
    try { resolveVar(name); }
    catch(e){ if(prev!=null) variables[name]=prev; else delete variables[name]; throw e; }
    recomputeConstruction(); return true;
  }
  function removeVariable(name){ delete variables[name]; recomputeConstruction(); }
  function getVariables(){ return { ...variables }; }
  function setMeasureProvider(fn){ measureProvider = fn || (()=>({})); }
  function recomputeConstruction(){
    points.forEach(p=>{
      try{ if(p.xExpr) p.x = evalExpr(p.xExpr, n=>lookupCtx(n)); }catch(e){}
      try{ if(p.yExpr) p.y = evalExpr(p.yExpr, n=>lookupCtx(n)); }catch(e){}
    });
    render();
  }

  // ---- construction points ----
  function addPoint(wx,wy,name){
    pushUndo();
    const id = pointSeq++;
    points.push({ id, name: name||("P"+id), x:wx, y:wy, xExpr:null, yExpr:null });
    render(); return id;
  }
  function removePoint(id){
    pushUndo();
    points = points.filter(p=>p.id!==id);
    cons = cons.filter(c=> !(c.a&&c.a.pid===id) && !(c.b&&c.b.pid===id) && !(c.ctrl&&c.ctrl.pid===id));
    if (hlPoint===id) hlPoint=null;
    render();
  }
  function getPointById(id){ return points.find(p=>p.id===id); }
  function getPoints(){ return points; }
  function setPointName(id,name){ const p=getPointById(id); if(!p) return false; pushUndo(); p.name=name; render(); return true; }
  function setPointXY(id,x,y){ const p=getPointById(id); if(!p) return false; pushUndo(); p.x=+x; p.y=+y; p.xExpr=null; p.yExpr=null; render(); return true; }
  // Returns {ok,error} — formulas may reference other variables (by name) and
  // the live measurement set (chest, waist, hips, shoulder, backLen, sleeve,
  // neck, bicep, inseam, thigh, height), e.g. "chest/8 + 2".
  function onPointRequest(cb){ onPointReq = cb || (()=>{}); }
  function setPointFormula(id, xExpr, yExpr){
    const p=getPointById(id); if(!p) return {ok:false,error:"no such point"};
    try{
      const nx = xExpr ? evalExpr(xExpr, n=>lookupCtx(n)) : p.x;
      const ny = yExpr ? evalExpr(yExpr, n=>lookupCtx(n)) : p.y;
      pushUndo(); p.xExpr=xExpr||null; p.yExpr=yExpr||null; p.x=nx; p.y=ny; render();
      return {ok:true};
    } catch(e){ return {ok:false, error:e.message}; }
  }
  function nearestPointId(wx,wy,thrPx=10,free){
    if(!opts.snap || free) return null;
    const thr=thrPx/view.scale; let best=null,bd=thr;
    points.forEach(p=>{ const d=Math.hypot(p.x-wx,p.y-wy); if(d<bd){bd=d;best=p.id;} });
    return best;
  }
  function hitPointScreen(sx,sy,thr=10){
    for(let i=points.length-1;i>=0;i--){ const [x,y]=toScreen(points[i].x,points[i].y); if(Math.hypot(x-sx,y-sy)<=thr) return points[i].id; }
    return null;
  }
  // Snap a raw world point to a nearby construction point (for the drafting
  // tools below); falls back to grid snap. Reuses the shared snap-ring mark.
  function snapConstruction(wx,wy,free){
    const pid=nearestPointId(wx,wy,10,free);
    if(pid!=null){ const p=getPointById(pid); snapMark=[p.x,p.y]; return {x:p.x,y:p.y,pid}; }
    snapMark=null;
    return {x:snap(wx,free), y:snap(wy,free), pid:null};
  }
  const refFromSnap = s => s.pid!=null ? {pid:s.pid} : {x:s.x, y:s.y};

  // ---- construction lines / arcs / circles (referential) ----
  function getCons(){ return cons; }
  function removeCons(id){ pushUndo(); cons=cons.filter(c=>c.id!==id); if (hlCons===id) hlCons=null; render(); }

  // ---- "Create Pattern Piece": promote a closed loop of points ----
  // A Construction Arc drawn between two points used to contribute NOTHING
  // to a piece promoted through them — promote only ever read the points'
  // own resolved x/y, so even a visibly curved arc collapsed to a straight
  // chord the instant it became a real pattern edge. Cubic-bezier sampling
  // (cBez) + {fromIdx,toIdx,c1,c2} curve metadata mirrors exactly how
  // js/fancy-patterns.js's princessCurve() already builds a real curved
  // seam, so a promoted piece's arc-backed edges are both visually curved
  // AND carry the same real bezier metadata js/pattern-export.js's PDF
  // export already knows how to draw as a true curve, not a facet.
  function cubicBezierSample(p0, c1, c2, p1, n) {
    n = n || 6;
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
  // Construction arcs store a "bulge" point the curve passes THROUGH at its
  // midpoint (see drawConstruction()'s own quadraticCurveTo math), not a raw
  // quadratic control handle — Q = 2*bulge - midpoint(P0,P1) recovers that
  // handle, exact regardless of which of the two promoted points is P0 vs
  // P1 (the bulge itself doesn't care about direction). From there, the
  // standard exact quadratic->cubic conversion.
  function quadToCubic(p0, bulge, p1) {
    const mid = [(p0[0]+p1[0])/2, (p0[1]+p1[1])/2];
    const q = [2*bulge[0]-mid[0], 2*bulge[1]-mid[1]];
    return {
      c1: [p0[0]+(q[0]-p0[0])*2/3, p0[1]+(q[1]-p0[1])*2/3],
      c2: [p1[0]+(q[0]-p1[0])*2/3, p1[1]+(q[1]-p1[1])*2/3],
    };
  }
  function findConsArcBetween(pidA, pidB) {
    return cons.find(c => c.kind==="arc" && c.ctrl &&
      ((c.a && c.a.pid===pidA && c.b && c.b.pid===pidB) || (c.a && c.a.pid===pidB && c.b && c.b.pid===pidA)));
  }
  // Curve Edge tool: how far the drag has to actually bow the line before
  // it counts as a real curve, in cm — below this it's treated as a CLICK
  // (toggle an existing curve back to straight) rather than a drag.
  const CURVE_CLICK_CM = 0.2;
  const CURVE_MIN_BULGE_CM = 0.3;
  // Perpendicular distance from point `pt` to the infinite line through a/b
  // — used to tell how far the dragged bulge point actually bows the edge
  // away from its own straight chord (distToSeg exists already but measures
  // to the SEGMENT, which is ~0 for a bulge point that sits roughly between
  // a and b in projection — exactly the case that needs measuring here).
  function perpDist(pt, a, b){
    const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy);
    if (!len) return Math.hypot(pt[0]-a[0], pt[1]-a[1]);
    return Math.abs((pt[0]-a[0])*dy - (pt[1]-a[1])*dx) / len;
  }
  // Reverts an already-curved edge back to its original two-point straight
  // form — the exact inverse of the "commit" splice below, reusing the
  // same spliceOutline() so every OTHER index-bearing structure on the
  // piece (other curves, edges[], chestEdgeIndices) is kept correctly
  // reindexed either way.
  function revertCurveEdge(pieceIdx, fromIdx){
    const p = pieces[pieceIdx];
    const ci = (p.curves||[]).findIndex(c=>c.fromIdx===fromIdx);
    if (ci<0) return false;
    const c = p.curves[ci];
    const farPt = p.outline[c.toIdx].slice();
    pushUndo();
    p.curves.splice(ci,1);
    spliceOutline(p, c.fromIdx, c.toIdx-c.fromIdx, [farPt]);
    selected = pieceIdx; render(); return true;
  }
  // The actual geometry operation behind the "curve" tool — pure and
  // pointer-independent (takes plain arguments, no ephemeral drag state),
  // exactly like nudgePiece/removePiece/finishPromotePiece are already
  // public, direct piece-mutation APIs rather than only reachable through
  // bind()'s own event handlers. `pieceIdx`/`fromIdx` identify the edge
  // (outline[fromIdx] -> outline[fromIdx+1]); `bulge` is the point the
  // curve should bow through. Re-curving an already-curved edge reverts it
  // to straight FIRST (restoring the plain 2-point edge and correctly
  // un-shifting every other index-bearing structure), then re-splices the
  // new shape in — two real operations, not a patch of the old one, so
  // there's exactly one way this data ever gets built.
  function curveEdge(pieceIdx, fromIdx, bulge){
    const p = pieces[pieceIdx]; if (!p) return false;
    const n = p.outline.length;
    if (fromIdx<0 || fromIdx>=n-1) return false;   // rejects the wraparound edge too
    const existing = (p.curves||[]).find(c=>c.fromIdx===fromIdx);
    const p0 = p.outline[fromIdx].slice();
    const p1 = (existing ? p.outline[existing.toIdx] : p.outline[fromIdx+1]).slice();
    pushUndo();
    if (existing){
      const ci = p.curves.findIndex(c=>c.fromIdx===fromIdx);
      p.curves.splice(ci,1);
      spliceOutline(p, existing.fromIdx, existing.toIdx-existing.fromIdx, [p1]);
    }
    const { c1, c2 } = quadToCubic(p0, bulge, p1);
    const sampled = cubicBezierSample(p0, c1, c2, p1);
    spliceOutline(p, fromIdx, 1, sampled);
    if (!p.curves) p.curves = [];
    p.curves.push({ fromIdx, toIdx: fromIdx+sampled.length, c1, c2 });
    selected = pieceIdx; render();
    return true;
  }
  // Commits (or cancels) the drag armed by the "curve" tool's pointerdown —
  // called from pointerup. A tiny drag toggles an already-curved edge back
  // to straight (symmetric with dragging one INTO a curve) or is a silent
  // no-op on a plain straight edge; a real but too-shallow drag explains
  // itself instead of silently doing nothing.
  function commitCurveEdit(){
    const { pieceIdx, fromIdx, p0, p1, bulge, moved, existing } = curveEdit;
    curveEdit = null;
    if (moved < CURVE_CLICK_CM){
      if (existing) revertCurveEdge(pieceIdx, fromIdx); else render();
      return;
    }
    if (perpDist(bulge, p0, p1) < CURVE_MIN_BULGE_CM){ onWarn('curveTooFlat'); render(); return; }
    curveEdge(pieceIdx, fromIdx, bulge);
  }

  // ---- Add Dart tool ----
  // Below this drag distance a dart's apex would sit right on top of its
  // own mouth — a degenerate, invisible dart — so it's treated as a
  // too-short drag (warn, no-op) rather than silently creating one; same
  // convention as CURVE_CLICK_CM/CURVE_MIN_BULGE_CM above.
  const DART_MIN_DEPTH_CM = 0.5;
  // Default full mouth width (leg-to-leg) for a freshly placed dart, in
  // cm — a common real-world bust/waist dart width; the Edit Darts
  // modal's Spread control (js/darts.js's slashAndSpread) widens it
  // further from there if the piece needs more.
  const DART_DEFAULT_WIDTH_CM = 2.5;
  // The two leg endpoints a dart placed at `mouthPoint` on piece
  // `pieceIdx`'s edge `edgeIdx` would get: straddling mouthPoint along
  // that edge's own direction, symmetric, capped at 90% of the edge's
  // length so a dart can never be wider than the edge it sits on.
  function dartLegsFor(pieceIdx, edgeIdx, mouthPoint){
    const p = pieces[pieceIdx]; if (!p) return {};
    const n = p.outline.length, a = p.outline[edgeIdx], b = p.outline[(edgeIdx+1)%n];
    const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy)||1;
    const ux=dx/len, uy=dy/len;
    const half = Math.min(DART_DEFAULT_WIDTH_CM/2, len*0.45);
    return { legA:[mouthPoint[0]-ux*half, mouthPoint[1]-uy*half], legC:[mouthPoint[0]+ux*half, mouthPoint[1]+uy*half] };
  }
  // The actual geometry operation behind the Add Dart tool — pure and
  // pointer-independent (plain arguments, no ephemeral drag state), same
  // "real API, not just an event-handler side effect" shape curveEdge()
  // above already is. Appends a new [apex, legA, legC] entry (js/darts.js's
  // convention, apex at index 0) rather than touching the outline itself —
  // a dart is drawn as an overlay V, never cut into the outline polygon.
  function addDart(pieceIdx, edgeIdx, mouthPoint, apexPoint){
    const p = pieces[pieceIdx]; if (!p) return false;
    const { legA, legC } = dartLegsFor(pieceIdx, edgeIdx, mouthPoint);
    if (!legA) return false;
    pushUndo();
    (p.darts = p.darts||[]).push([apexPoint.slice(), legA, legC]);
    selected = pieceIdx; render(); return true;
  }
  function removeDart(pieceIdx, dartIdx){
    const p = pieces[pieceIdx]; if (!p || !p.darts || !p.darts[dartIdx]) return false;
    pushUndo(); p.darts.splice(dartIdx,1); render(); return true;
  }
  function commitDartEdit(){
    const { pieceIdx, edgeIdx, mouth, apex, moved } = dartEdit;
    dartEdit = null;
    if (moved < DART_MIN_DEPTH_CM){ onWarn('dartTooShort'); render(); return; }
    addDart(pieceIdx, edgeIdx, mouth, apex);
  }
  function drawCurveEditPreview(){
    if (!curveEdit || !curveEdit.bulge) return;
    const { p0, p1, bulge, moved, existing } = curveEdit;
    if (moved < CURVE_CLICK_CM) return;
    const a=toScreen(p0[0],p0[1]), b=toScreen(p1[0],p1[1]), bl=toScreen(bulge[0],bulge[1]);
    ctx.save();
    ctx.strokeStyle = perpDist(bulge,p0,p1) < CURVE_MIN_BULGE_CM ? CSS("--warn") : CSS("--brand");
    ctx.lineWidth = 2.6; if (!existing) ctx.setLineDash([5,3]);
    ctx.beginPath(); ctx.moveTo(a[0],a[1]);
    ctx.quadraticCurveTo(2*bl[0]-(a[0]+b[0])/2, 2*bl[1]-(a[1]+b[1])/2, b[0], b[1]);
    ctx.stroke();
    ctx.restore();
  }
  function onPromoteRequest(cb){ onPromoteReq = cb || (()=>{}); }
  function onWarnRequest(cb){ onWarn = cb || (()=>{}); }
  // A sketch stroke counts as "closed" the same way the Filled Shape tool's
  // own closing gesture does (clicking back near the start point) — a
  // Filled Shape is ALWAYS closed by construction (that's the whole point
  // of the tool), while a Pen/Freehand stroke only qualifies if its own
  // first and last points happen to land close together. Requires at
  // least 3 points either way — 2 points is just a line, never a real
  // closed figure.
  const SKETCH_CLOSE_CM = 1;
  function isSketchClosed(st){
    if (!st || !st.pts || st.pts.length<3) return false;
    if (st.tool==="polygon") return true;
    const a=st.pts[0], b=st.pts[st.pts.length-1];
    return Math.hypot(a[0]-b[0], a[1]-b[1]) <= SKETCH_CLOSE_CM;
  }
  // "make any closed figure a layer": the sketch-shape half of Create
  // Pattern Piece — reuses the exact same pendingPromoteOutline/
  // onPromoteReq/finishPromotePiece pathway a construction-point loop
  // already goes through (openPromotePrompt in js/app.js neither knows nor
  // cares which source produced the outline it's naming), just without a
  // point-id list — a freehand/drawn shape has no construction arcs to
  // look up curvature from, so finishPromotePiece's own defensive
  // straight-edges fallback (ids==null) is exactly the right behaviour
  // here, not a fallback at all.
  function promoteSketchToPiece(idx){
    const st = sketch[idx];
    if (!isSketchClosed(st)){ onWarn('promoteNotClosed'); return false; }
    pendingPromoteOutline = st.pts.slice();
    pendingPromoteIds = null;
    pendingPromoteSketchIdx = idx;
    onPromoteReq(pendingPromoteOutline.slice());
    return true;
  }
  function finishPromotePiece(nameEn, nameAr){
    if(!pendingPromoteOutline || pendingPromoteOutline.length<3) return false;
    pushUndo();
    const raw = pendingPromoteOutline, ids = pendingPromoteIds, sketchIdx = pendingPromoteSketchIdx;
    pendingPromoteOutline=null; pendingPromoteIds=null; pendingPromoteSketchIdx=null;
    // Walk the promoted points in order, sampling a real curve wherever a
    // Construction Arc connects two ADJACENT ones instead of just carrying
    // the point through as a straight corner. The closing edge (last point
    // back to the first) is deliberately left straight even if an arc
    // exists there — a wraparound curve's toIdx would point back to index
    // 0, which js/pattern-export.js's outlinePathOps() (and every other
    // curves-metadata consumer) assumes never happens, same as
    // princessCurve() never produces one either.
    const outline = [raw[0]];
    const curves = [];
    if (ids && ids.length === raw.length) {
      for (let i=0; i<ids.length-1; i++){
        const arc = findConsArcBetween(ids[i], ids[i+1]);
        const p0 = outline[outline.length-1], p1 = raw[i+1];
        if (arc){
          const { c1, c2 } = quadToCubic(p0, resolveRef(arc.ctrl), p1);
          const fromIdx = outline.length-1;
          outline.push(...cubicBezierSample(p0, c1, c2, p1));
          curves.push({ fromIdx, toIdx: outline.length-1, c1, c2 });
        } else {
          outline.push(p1);
        }
      }
    } else {
      // Straight edges: either a sketch-shape promotion (sketchIdx!=null —
      // ids is null there, always, deliberately; no construction arcs to
      // look up for freehand-drawn points) or the defensive fallback for a
      // construction-point promotion whose ids somehow don't line up with
      // its outline.
      outline.push(...raw.slice(1));
    }
    const cx=avg(outline.map(p=>p[0])), yTop=Math.min(...outline.map(p=>p[1])), yBot=Math.max(...outline.map(p=>p[1]));
    pieces.push({
      name:{ en:nameEn||"New Piece", ar:nameAr||"قطعة جديدة" },
      desc: sketchIdx!=null
        ? { en:"Created from a drawn shape.", ar:"تم إنشاؤها من شكل مرسوم." }
        : { en:"Created from construction geometry.", ar:"تم إنشاؤها من هندسة الإنشاء." },
      outline, curves, darts:[], notches:[], grain:[[cx,yTop+2],[cx,yBot-2]],
      visible:true, locked:false,
      color:["#6d5efc","#00c2a8","#ff5d8f","#e2a52b","#4c8dff","#c1492e"][pieces.length%6],
    });
    // The source sketch stroke becomes the new piece — remove it so it
    // doesn't linger as a duplicate visual overlay. Indices >sketchIdx in
    // `sketch` itself never appear anywhere by position (nothing else
    // references a sketch stroke by array index the way pieces' curves/
    // edges do), so a plain splice needs no reindexing.
    if (sketchIdx!=null && sketch[sketchIdx]){
      sketch.splice(sketchIdx,1);
      // keep any unrelated selected sketch stroke pointing at the same
      // physical stroke after the splice shifts everything past it down by one
      if (selSketch!=null){ if (selSketch===sketchIdx) selSketch=null; else if (selSketch>sketchIdx) selSketch--; }
    }
    selected=pieces.length-1; render(); return true;
  }
  function cancelPromote(){ pendingPromoteOutline=null; pendingPromoteIds=null; pendingPromoteSketchIdx=null; promoteBuf=[]; render(); }

  // ---- trace-over background reference image ----
  function setBackgroundImage(dataURL){
    return new Promise(resolve=>{
      const img = new Image();
      img.onload = () => {
        const scale = 60/(img.naturalWidth||800);   // default: image ≈ 60cm wide
        bg = { img, dataURL, x:0, y:0, scale, opacity:0.55, visible:true };
        render(); resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = dataURL;
    });
  }
  function setBgOpacity(v){ if(bg) bg.opacity=v; render(); }
  function setBgVisible(v){ if(bg) bg.visible=v; render(); }
  function removeBackground(){ bg=null; render(); }
  function hasBackground(){ return !!bg; }
  function getBgOpacity(){ return bg?bg.opacity:0.55; }
  function moveBackground(dx,dy){ if(bg){ bg.x+=dx; bg.y+=dy; render(); } }
  function onCalibrationRequest(cb){ onCalibReq = cb || (()=>{}); }
  function applyCalibration(realCm, measuredDist){ if(!bg || !measuredDist) return; bg.scale *= realCm/measuredDist; render(); }

  // ---- frozen snapshot ghost overlay ----
  function freezeSnapshot(){
    ghostSnap = { pieces: pieces.map(p=>({ outline:p.outline.map(pt=>pt.slice()), color:p.color })), opacity:0.35, visible:true };
    render();
  }
  function showSnapshot(v){ if(ghostSnap) ghostSnap.visible=v; render(); }
  function setSnapshotOpacity(v){ if(ghostSnap) ghostSnap.opacity=v; render(); }
  function removeSnapshot(){ ghostSnap=null; render(); }
  function hasSnapshot(){ return !!ghostSnap; }
  function getSnapshotOpacity(){ return ghostSnap?ghostSnap.opacity:0.35; }

  // ---- DXF / HPGL export ----
  // WP-12: the actual entity-building logic lives in js/pattern-export.js
  // as pure functions (no DOM/Canvas-closure dependency) so it's directly
  // unit-testable via `node --test` — jsdom (this project's test runner)
  // has no real <canvas> 2D context to exercise Canvas.init() through, so
  // anything worth testing precisely has to live outside this closure.
  // DXF now uses real AAMA/ASTM D6673 layer numbers (1/2/3/4/8/11/13),
  // replacing the earlier ad hoc CUT/GRAIN/DART layer NAMES — see
  // buildDXF()'s own header comment for exactly what's on each layer.
  function exportDXF(){ return buildDXF(pieces); }
  // HPGL: genuine `IN;SP1;PU;PD;...` plotter output (cut line only — a
  // real plotter is one pen, no separate grain/dart layers the way DXF
  // has), replacing the earlier SVG-saved-under-the-wrong-extension
  // fallback (BerryStudio-Upgrade-Plan L7).
  function exportHPGL(){ return buildHPGL(pieces); }

  // ---- raster export (PNG/JPEG at selectable DPI) ----
  // WP-12: replaces the earlier "just save the SVG under a .png/.jpeg
  // extension" fallback (BerryStudio-Upgrade-Plan L7) with a real raster.
  // Reuses exportSVG() entirely (rendered into an <img>, drawn onto an
  // offscreen canvas sized by real DPI math) rather than reimplementing
  // any drawing logic — the SVG generator stays the single source of
  // truth for how a pattern is drawn. Needs a real DOM (Image/canvas/
  // Blob) so — unlike exportDXF/exportHPGL — this can't be extracted into
  // js/pattern-export.js's pure-function style; covered by a Playwright
  // test instead of node --test for that reason.
  // Chromium/Firefox/Safari all refuse to allocate a canvas beyond roughly
  // these bounds (exact ceilings vary by browser/GPU) — silently returning
  // a null blob from toBlob() rather than throwing. A real multi-piece
  // garment laid out in drafting space (not a nested marker) easily spans
  // 1-2 meters per side, so at 300-600 DPI this ceiling is a real,
  // reachable case, not a theoretical one — clamp proportionally instead
  // of letting toBlob fail invisibly.
  const MAX_CANVAS_DIM = 16384, MAX_CANVAS_PIXELS = 200_000_000;
  function exportRaster(fmt, dpi){
    if(!pieces.length) return Promise.resolve(null);
    const svg = exportSVG();
    const m = /width="([\d.]+)cm" height="([\d.]+)cm"/.exec(svg);
    const wCm = m ? +m[1] : 20, hCm = m ? +m[2] : 20;
    let pxW = Math.max(1, Math.round((wCm/2.54)*dpi)), pxH = Math.max(1, Math.round((hCm/2.54)*dpi));
    let effectiveDpi = dpi;
    const overDim = Math.max(pxW/MAX_CANVAS_DIM, pxH/MAX_CANVAS_DIM);
    const overArea = Math.sqrt((pxW*pxH)/MAX_CANVAS_PIXELS);
    const clampFactor = Math.max(1, overDim, overArea);
    if(clampFactor > 1){
      pxW = Math.max(1, Math.floor(pxW/clampFactor)); pxH = Math.max(1, Math.floor(pxH/clampFactor));
      effectiveDpi = dpi/clampFactor;
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const off = document.createElement("canvas"); off.width = pxW; off.height = pxH;
        const octx = off.getContext("2d");
        octx.fillStyle = "#fff"; octx.fillRect(0, 0, pxW, pxH); // JPEG has no alpha channel — white background
        octx.drawImage(img, 0, 0, pxW, pxH);
        URL.revokeObjectURL(url);
        off.toBlob(blob => resolve(blob ? { blob, dpi: effectiveDpi, clamped: clampFactor > 1 } : null), fmt==="jpeg" ? "image/jpeg" : "image/png", 0.92);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("raster export: failed to rasterize the pattern SVG")); };
      img.src = url;
    });
  }

  // ---- PDF export (hand-built, valid PDF 1.4; vector cutting lines) ----
  // WP-12: `opts.tiled` (default false, unchanged behavior) splits the
  // pattern across A4/Letter pages with overlap + registration marks + an
  // assembly-map page — "the #1 request in every home-sewing community"
  // per the plan doc. Entity/object-building logic lives in
  // js/pattern-export.js (pure, unit-tested); this stays a thin wrapper.
  function exportPDF(opts){ return buildPDF(pieces, opts); }

  // ---- project round-trip: load already-positioned pieces / clear all ----
  function loadPieces(arr, txts, pts, consArr){
    if(!Array.isArray(arr) || !arr.length) return false;
    pushUndo();
    pieces = arr.map((p,i)=>({
      // Spread the source piece first so anything beyond this normalized
      // set — role, cutOnFold, edges/curves, bilateral, and (WP-46)
      // closingEdges/pointNames — round-trips through Export/Import
      // Project and cloud sync instead of being silently dropped; the
      // explicit fields below then apply their own defaults on top.
      ...p,
      name:p.name, desc:p.desc||{en:"",ar:""},
      outline:p.outline||[], darts:p.darts||[], notches:p.notches||[], grain:p.grain||[],
      visible:p.visible!==false, locked:!!p.locked, opacity:p.opacity,
      color:p.color||["#6d5efc","#00c2a8","#ff5d8f","#e2a52b","#4c8dff","#c1492e"][i%6],
      material:p.material||null,
    }));
    texts = Array.isArray(txts) ? txts.map(t=>({ ...t, id: t.id || textSeq++ })) : [];
    points = Array.isArray(pts) ? pts.map(p=>({ xExpr:null, yExpr:null, ...p, id: p.id || pointSeq++ })) : [];
    cons = Array.isArray(consArr) ? consArr.map(c=>({ ...c, id: c.id || consSeq++ })) : [];
    variables = {};
    selected=-1; multiSelected=[]; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null; sketch=[]; promoteBuf=[]; pendingPromoteOutline=null; pendingPromoteIds=null; pendingPromoteSketchIdx=null; curveEdit=null; lassoPts=null; fit(); return true;
  }
  function clearAll(){
    pushUndo(); pieces=[]; sketch=[]; texts=[]; points=[]; cons=[]; bg=null; variables={}; ghostSnap=null;
    selected=-1; multiSelected=[]; hlPoint=null; hlCons=null; selText=null; selNotch=null; selVertex=null; selSketch=null; measurePts=[]; clickBuf=[]; promoteBuf=[]; pendingPromoteOutline=null; pendingPromoteIds=null; pendingPromoteSketchIdx=null; curveEdit=null; lassoPts=null;
    userAdjusted=false; render();
  }

  // Convert a world (cm) point to canvas CSS pixels — handy for hit-tests/tests.
  function screenOf(x,y){ return toScreen(x,y); }

  return { init, setTranslator, setPattern, getPieces, setTool, setOpt, getOpt, zoom, fit,
           doUndo, doRedo, getZoom, toggleVisible, toggleLock, setColor, setMaterial, setTexture, getSelected,
           getMultiSelection, selectPiece, clearSketch, render, deleteSelection,
           copySelection, cutSelection, pasteClipboard, hasClipboard,
           addText, updateText, removeText, getTexts, onTextRequest,
           addPiece, removePiece, renamePiece, setPieceProps, nudgePiece, nudgePieces, importPieces,
           onZoomChange, exportSVG, exportDXF, exportHPGL, exportRaster, exportPDF, loadPieces, clearAll, screenOf, snapAngle45,
           snapshotState, restoreState, getHistory, setHistory,
           // construction geometry
           addPoint, removePoint, getPointById, getPoints, setPointName, setPointXY, setPointFormula, onPointRequest,
           getCons, removeCons, onPromoteRequest, finishPromotePiece, cancelPromote, onWarnRequest,
           insertOutlinePoint, removeOutlinePoint, promoteSketchToPiece, curveEdge, revertCurveEdge, isSketchClosed, addDart, removeDart,
           toggleClosingEdge, isClosingEdge, setOutlinePointName, getOutlinePointName, setOutlinePointXY, getMatchedPointGroups,
           getSketch, addSketchStroke,
           setVariable, removeVariable, getVariables, setMeasureProvider, recomputeConstruction, evalExpr,
           setBackgroundImage, setBgOpacity, setBgVisible, removeBackground, hasBackground, getBgOpacity,
           moveBackground, onCalibrationRequest, applyCalibration,
           centerOn, selectPoint, selectCons, clearHighlight, armPick, cancelPick,
           freezeSnapshot, showSnapshot, setSnapshotOpacity, removeSnapshot, hasSnapshot, getSnapshotOpacity,
           // exposed for js/validate.js (WP-0.4) — a pure function, safe to reuse rather than reimplement
           offsetPoly };
})();
// TEMP compat alias for one release — see BerryStudio-Upgrade-Plan WP-0.1.
if (typeof window !== 'undefined') window.Canvas = Canvas;
