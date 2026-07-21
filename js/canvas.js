/* ============================================================
   Pattern Canvas — HTML5 Canvas 2D drafting engine.
   Grid, rulers, zoom/pan, seam allowance, notches, grainlines,
   selection, snapping, measure & sketch tools, undo/redo.
   ============================================================ */
const Canvas = (() => {
  let cv, ctx, dpr = 1;
  let view = { x: 60, y: 60, scale: 3.2 };     // px per cm
  let pieces = [];                              // current pattern pieces (cm space, positioned)
  let selected = -1;
  let tool = "select";
  let opts = { grid: true, snap: true, seam: true, unitsCm: true, seamCm: 1 };
  let sketch = [];                              // user-drawn strokes {tool, pts:[[cm,cm]]}
  let drawing = null;                           // active stroke
  let measurePts = [];
  let pan = null, dragPiece = null;
  let edit = null;                    // active handle edit {type, ...}
  let clickBuf = [];                  // buffer for two-click tools (knife, grain)
  let cursorWorld = null;             // last cursor position (for rubber-band previews)
  let snapMark = null;                // point currently snapped to (for the snap ring)
  const SHOW_HANDLES = new Set(["select","move","rotate","scale","pen"]);
  let userAdjusted = false;          // true once the user zooms/pans manually
  const undo = [], redo = [];
  let onPick = () => {};
  let getT = k => k;                            // translator injected

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
  const snap = (v) => opts.snap ? Math.round(v) : v;

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
    selected = -1; sketch = [];
    fit();
  }
  function getPieces(){ return pieces; }

  // ---- undo / redo ----
  function snapshot(){ return JSON.stringify({ pieces, sketch }); }
  function pushUndo(){ undo.push(snapshot()); if (undo.length>60) undo.shift(); redo.length=0; }
  function doUndo(){ if(!undo.length) return; redo.push(snapshot()); const s=JSON.parse(undo.pop()); pieces=s.pieces; sketch=s.sketch; selected=-1; render(); }
  function doRedo(){ if(!redo.length) return; undo.push(snapshot()); const s=JSON.parse(redo.pop()); pieces=s.pieces; sketch=s.sketch; render(); }

  // ---- seam allowance offset (outward polygon offset) ----
  function offsetPoly(poly, d) {
    const n = poly.length, out = [];
    // signed area to know orientation
    let area = 0;
    for (let i=0;i<n;i++){ const [x1,y1]=poly[i], [x2,y2]=poly[(i+1)%n]; area += x1*y2 - x2*y1; }
    const sign = area > 0 ? 1 : -1;
    for (let i=0;i<n;i++){
      const p0=poly[(i-1+n)%n], p1=poly[i], p2=poly[(i+1)%n];
      const e1=norm(sub(p1,p0)), e2=norm(sub(p2,p1));
      const nrm1=[-e1[1]*sign,e1[0]*sign], nrm2=[-e2[1]*sign,e2[0]*sign];
      let bis=norm([nrm1[0]+nrm2[0], nrm1[1]+nrm2[1]]);
      const cosA=Math.max(0.3, bis[0]*nrm1[0]+bis[1]*nrm1[1]);
      out.push([p1[0]+bis[0]*d/cosA, p1[1]+bis[1]*d/cosA]);
    }
    return out;
  }
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
  const norm=(a)=>{const l=Math.hypot(a[0],a[1])||1;return[a[0]/l,a[1]/l];};

  // ---- geometry helpers ----
  const centroid = poly => { const n=poly.length; let x=0,y=0; poly.forEach(p=>{x+=p[0];y+=p[1];}); return [x/n,y/n]; };
  const bbox = poly => { const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]); return {minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)}; };
  const snapGeo = p => JSON.parse(JSON.stringify({ outline:p.outline, darts:p.darts||[], notches:p.notches||[], grain:p.grain||[] }));
  // apply a per-point transform to a whole piece, sourced from a frozen snapshot
  function applyFromSnap(p, snp, fn){
    p.outline = snp.outline.map(fn);
    p.darts   = snp.darts.map(d=>d.map(fn));
    p.notches = snp.notches.map(fn);
    p.grain   = snp.grain.map(fn);
  }
  const rotAbout = (c,ang) => ([x,y]) => { const dx=x-c[0],dy=y-c[1],cs=Math.cos(ang),sn=Math.sin(ang); return [c[0]+dx*cs-dy*sn, c[1]+dx*sn+dy*cs]; };
  const sclAbout = (c,f)   => ([x,y]) => [c[0]+(x-c[0])*f, c[1]+(y-c[1])*f];

  // Snap a world point to a nearby anchor of any piece, else to the grid.
  function snapToPoint(wx, wy, excludePiece, excludeIdx){
    snapMark = null;
    if (!opts.snap) return [wx,wy];
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

  // ---- selection handles (screen-space geometry) ----
  function handleGeo(p){
    const b=bbox(p.outline);
    const corners=[[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]].map(pt=>toScreen(pt[0],pt[1]));
    const topMid=toScreen((b.minX+b.maxX)/2, b.minY);
    const rotate=[topMid[0], topMid[1]-26];
    const anchors=p.outline.map(pt=>toScreen(pt[0],pt[1]));
    return { corners, rotate, topMid, anchors, tl:toScreen(b.minX,b.minY), br:toScreen(b.maxX,b.maxY) };
  }
  function handleHit(p, sx, sy){
    const g=handleGeo(p), near=(a,t)=>Math.hypot(a[0]-sx,a[1]-sy)<=t;
    if (near(g.rotate,11)) return {type:"rotate"};
    for (let i=0;i<4;i++) if (near(g.corners[i],10)) return {type:"scale",corner:i};
    for (let i=0;i<g.anchors.length;i++) if (near(g.anchors[i],9)) return {type:"point",idx:i};
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

  // ================= RENDER =================
  function render() {
    if (!ctx) return;
    const W = cv.width/dpr, H = cv.height/dpr;
    ctx.clearRect(0,0,W,H);
    if (opts.grid) drawGrid(W,H);
    drawRulers(W,H);
    pieces.forEach((p,i)=>drawPiece(p,i));
    if (selected>=0 && pieces[selected] && pieces[selected].visible && SHOW_HANDLES.has(tool)) drawHandles(pieces[selected]);
    drawSketch();
    drawMeasure();
    drawClickPreview();
    drawSnapMark();
  }

  // Draw the selection bounding box, corner scale handles, rotate knob and anchor points.
  function drawHandles(p){
    const g=handleGeo(p), brand=CSS("--brand"), accent=CSS("--accent"), panel=CSS("--panel");
    // bounding box
    ctx.strokeStyle=brand; ctx.lineWidth=1; ctx.setLineDash([4,3]);
    ctx.strokeRect(g.tl[0], g.tl[1], g.br[0]-g.tl[0], g.br[1]-g.tl[1]);
    ctx.setLineDash([]);
    // rotate arm + knob
    ctx.strokeStyle=brand; ctx.beginPath(); ctx.moveTo(g.topMid[0],g.topMid[1]); ctx.lineTo(g.rotate[0],g.rotate[1]); ctx.stroke();
    knob(g.rotate, 6, brand, panel, true);
    // corner scale handles
    g.corners.forEach(c=>knob(c, 5, brand, panel, false));
    // editable anchor points (control points)
    g.anchors.forEach(a=>knob(a, 4, accent, panel, true));
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
    // fill (cutting area)
    path(p.outline);
    ctx.fillStyle = hexA(col, sel?0.20:0.10); ctx.fill();
    // cutting line
    ctx.lineWidth = sel?3:2; ctx.strokeStyle = col; ctx.stroke();

    // darts
    ctx.lineWidth=1.4; ctx.strokeStyle=col;
    (p.darts||[]).forEach(d=>{ ctx.beginPath(); const [a,b,c]=d.map(pt=>toScreen(pt[0],pt[1])); ctx.moveTo(b[0],b[1]); ctx.lineTo(a[0],a[1]); ctx.lineTo(c[0],c[1]); ctx.stroke(); });

    // notches
    (p.notches||[]).forEach(nt=>{ const [x,y]=toScreen(nt[0],nt[1]); ctx.fillStyle=CSS("--ink"); ctx.beginPath(); ctx.moveTo(x,y-5); ctx.lineTo(x-3,y+3); ctx.lineTo(x+3,y+3); ctx.closePath(); ctx.fill(); });

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
    all.forEach(st=>{ if(st.pts.length<2 && st!==drawing) return; ctx.beginPath(); st.pts.forEach((p,i)=>{const[x,y]=toScreen(p[0],p[1]); i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke();
      if(st.tool==="pen"){ st.pts.forEach(p=>{const[x,y]=toScreen(p[0],p[1]); ctx.fillStyle=CSS("--accent"); ctx.beginPath(); ctx.arc(x,y,3,0,7); ctx.fill();});}});
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
      if (e.button===1 || e.spaceKey || tool==="pan"){ pan={x:e.offsetX,y:e.offsetY,vx:view.x,vy:view.y}; userAdjusted=true; return; }

      // (1) grab a selection handle (rotate / scale corner / anchor point)
      if (selected>=0 && pieces[selected] && SHOW_HANDLES.has(tool)){
        const hh=handleHit(pieces[selected], e.offsetX, e.offsetY);
        if (hh){ beginEdit(hh, wx, wy); return; }
      }

      // (2) two-click tools: knife (split) & grainline
      if (tool==="knife" || tool==="grain"){
        clickBuf.push([snap(wx),snap(wy)]);
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

      if (tool==="measure"){ if(measurePts.length>=2)measurePts=[]; measurePts.push([wx,wy]); render(); return; }
      if (tool==="line"||tool==="arc"){ drawing={tool,pts:[[snap(wx),snap(wy)]]}; return; }
      if (tool==="pen"){ if(!drawing)drawing={tool:"pen",pts:[]}; drawing.pts.push([snap(wx),snap(wy)]); render(); return; }
      if (tool==="free"||tool==="freehand"){ drawing={tool:"free",pts:[[wx,wy]]}; return; }

      // (4) rotate / scale by dragging anywhere on a piece body
      if (tool==="rotate" || tool==="scale"){
        const h=hitPiece(wx,wy);
        if (h>=0){ selected=h; onPick(pieces[h], e.clientX, e.clientY); beginEdit({type:tool}, wx, wy); }
        else { selected=-1; onPick(null); render(); }
        return;
      }

      // (5) select / move
      const hit = hitPiece(wx,wy);
      if (hit>=0){ selected=hit; onPick(pieces[hit], e.clientX, e.clientY);
        if(tool==="select"||tool==="move"){ dragPiece={i:hit,ox:wx,oy:wy}; pushUndo(); } }
      else { selected=-1; onPick(null); }
      render();
    });

    cv.addEventListener("pointermove", e=>{
      const [wx,wy]=toWorld(e.offsetX,e.offsetY);
      cursorWorld=[wx,wy];
      if (pan){ view.x=pan.vx+(e.offsetX-pan.x); view.y=pan.vy+(e.offsetY-pan.y); render(); return; }

      // live handle editing
      if (edit){
        const p=pieces[selected];
        if (edit.type==="point"){ p.outline[edit.idx]=snapToPoint(wx,wy,selected,edit.idx); }
        else if (edit.type==="rotate"){ const ang=Math.atan2(wy-edit.c[1],wx-edit.c[0])-edit.startAng; applyFromSnap(p,edit.snp,rotAbout(edit.c,ang)); }
        else if (edit.type==="scale"){ let f=Math.hypot(wx-edit.c[0],wy-edit.c[1])/edit.startDist; f=Math.max(0.2,Math.min(5,f)); applyFromSnap(p,edit.snp,sclAbout(edit.c,f)); }
        render(); return;
      }
      snapMark=null;

      if (dragPiece){ const dx=wx-dragPiece.ox, dy=wy-dragPiece.oy; movePiece(dragPiece.i,dx,dy); dragPiece.ox=wx; dragPiece.oy=wy; render(); return; }
      if (drawing && (drawing.tool==="line"||drawing.tool==="arc")){ drawing.pts[1]=[snap(wx),snap(wy)]; render(); return; }
      if (drawing && drawing.tool==="free"){ drawing.pts.push([wx,wy]); render(); return; }
      if (clickBuf.length && (tool==="knife"||tool==="grain")){ render(); return; }

      // hover cursor feedback over handles
      if (selected>=0 && pieces[selected] && SHOW_HANDLES.has(tool)){
        const hh=handleHit(pieces[selected], e.offsetX, e.offsetY);
        cv.style.cursor = hh ? (hh.type==="rotate"?"grab":hh.type==="scale"?"nwse-resize":"crosshair") : (tool==="select"||tool==="move"?"default":"crosshair");
      }
    });

    cv.addEventListener("pointerup", ()=>{
      if (edit){ edit=null; snapMark=null; render(); }
      if (drawing && drawing.tool!=="pen"){ if(drawing.pts.length>1){ pushUndo(); sketch.push(drawing);} drawing=null; render(); }
      pan=null; dragPiece=null;
    });
    cv.addEventListener("dblclick", ()=>{ if(drawing&&drawing.tool==="pen"){ if(drawing.pts.length>1){pushUndo(); sketch.push(drawing);} drawing=null; render(); }});
  }

  function movePiece(i,dx,dy){ const p=pieces[i];
    const mv=pt=>[pt[0]+dx,pt[1]+dy];
    p.outline=p.outline.map(mv); p.darts=(p.darts||[]).map(d=>d.map(mv));
    p.notches=(p.notches||[]).map(mv); p.grain=(p.grain||[]).map(mv);
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
    for(let i=pieces.length-1;i>=0;i--){ if(pieces[i].visible && inPoly(x,y,pieces[i].outline)) return i; }
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
  function setTool(t){
    tool=t; clickBuf=[]; edit=null; snapMark=null;
    if(t!=="measure")measurePts=[];
    if(t!=="pen"&&drawing&&drawing.tool==="pen"){sketch.push(drawing);drawing=null;}
    cv.style.cursor = (t==="pan")?"grab":(t==="select"||t==="move")?"default":(t==="rotate")?"grab":"crosshair";
    render();
  }
  function setOpt(k,v){ opts[k]=v; render(); }
  function getOpt(k){ return opts[k]; }
  function getZoom(){ return Math.round(view.scale/3.2*100); }
  function toggleVisible(i){ pieces[i].visible=!pieces[i].visible; render(); }
  function selectPiece(i){ selected=i; render(); }
  function clearSketch(){ pushUndo(); sketch=[]; render(); }
  function onZoomChange(cb){ onZoom=cb; }
  function exportSVG(){
    if(!pieces.length) return "";
    const all=pieces.flatMap(p=>p.outline); const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
    const minX=Math.min(...xs)-3,minY=Math.min(...ys)-3,w=Math.max(...xs)-minX+3,h=Math.max(...ys)-minY+3;
    let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}cm" height="${h}cm">`;
    pieces.forEach(p=>{ s+=`<polygon points="${p.outline.map(pt=>pt.join(',')).join(' ')}" fill="none" stroke="#222" stroke-width="0.2"/>`;
      if(p.grain?.length===2) s+=`<line x1="${p.grain[0][0]}" y1="${p.grain[0][1]}" x2="${p.grain[1][0]}" y2="${p.grain[1][1]}" stroke="#222" stroke-width="0.15"/>`; });
    return s+"</svg>";
  }

  // ---- DXF export (AutoCAD R12 ENTITIES; cm units, y-up) ----
  function exportDXF(){
    if(!pieces.length) return "";
    const out=["0","SECTION","2","ENTITIES"];
    const push=(...l)=>out.push(...l);
    pieces.forEach(p=>{
      push("0","LWPOLYLINE","8","CUT","90",String(p.outline.length),"70","1","43","0");
      p.outline.forEach(pt=>push("10",pt[0].toFixed(3),"20",(-pt[1]).toFixed(3)));
      if(p.grain && p.grain.length===2)
        push("0","LINE","8","GRAIN","10",p.grain[0][0].toFixed(3),"20",(-p.grain[0][1]).toFixed(3),
             "11",p.grain[1][0].toFixed(3),"21",(-p.grain[1][1]).toFixed(3));
      (p.darts||[]).forEach(d=>{ for(let i=0;i<d.length-1;i++)
        push("0","LINE","8","DART","10",d[i][0].toFixed(3),"20",(-d[i][1]).toFixed(3),
             "11",d[i+1][0].toFixed(3),"21",(-d[i+1][1]).toFixed(3)); });
    });
    push("0","ENDSEC","0","EOF");
    return out.join("\n");
  }

  // ---- PDF export (hand-built, valid PDF 1.4; vector cutting lines) ----
  function exportPDF(){
    if(!pieces.length) return null;
    const PT = 28.3465;                 // points per cm
    const all=pieces.flatMap(p=>p.outline);
    const xs=all.map(p=>p[0]), ys=all.map(p=>p[1]);
    const minX=Math.min(...xs), minY=Math.min(...ys), maxX=Math.max(...xs), maxY=Math.max(...ys);
    const margin=28;
    const W=(maxX-minX)*PT+margin*2, H=(maxY-minY)*PT+margin*2;
    const Xn=x=>(x-minX)*PT+margin, Yn=y=>H-((y-minY)*PT+margin);
    const X=x=>Xn(x).toFixed(2), Y=y=>Yn(y).toFixed(2);
    let cs="0.75 w 0 0 0 RG 0 0 0 rg\n";
    pieces.forEach(p=>{
      p.outline.forEach((pt,i)=>{ cs+=`${X(pt[0])} ${Y(pt[1])} ${i?'l':'m'}\n`; });
      cs+="h S\n";
      if(p.grain && p.grain.length===2)
        cs+=`${X(p.grain[0][0])} ${Y(p.grain[0][1])} m ${X(p.grain[1][0])} ${Y(p.grain[1][1])} l S\n`;
      (p.darts||[]).forEach(d=>{ d.forEach((pt,i)=>cs+=`${X(pt[0])} ${Y(pt[1])} ${i?'l':'m'}\n`); cs+="S\n"; });
      const cx=avg(p.outline.map(q=>q[0])), cy=avg(p.outline.map(q=>q[1]));
      const label=String((p.name&&p.name.en)||"").replace(/[()\\]/g,"").replace(/[^\x20-\x7E]/g,"");
      cs+=`BT /F1 9 Tf ${(Xn(cx)-label.length*2.4).toFixed(2)} ${Yn(cy).toFixed(2)} Td (${label}) Tj ET\n`;
    });
    const objs=[null,
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${cs.length} >>\nstream\n${cs}endstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
    let pdf="%PDF-1.4\n"; const off=[];
    for(let i=1;i<=5;i++){ off[i]=pdf.length; pdf+=`${i} 0 obj\n${objs[i]}\nendobj\n`; }
    const xref=pdf.length;
    pdf+="xref\n0 6\n0000000000 65535 f \n";
    for(let i=1;i<=5;i++) pdf+=String(off[i]).padStart(10,"0")+" 00000 n \n";
    pdf+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return pdf;
  }

  // ---- project round-trip: load already-positioned pieces / clear all ----
  function loadPieces(arr){
    if(!Array.isArray(arr) || !arr.length) return false;
    pushUndo();
    pieces = arr.map((p,i)=>({
      name:p.name, desc:p.desc||{en:"",ar:""},
      outline:p.outline||[], darts:p.darts||[], notches:p.notches||[], grain:p.grain||[],
      visible:p.visible!==false, color:p.color||["#6d5efc","#00c2a8","#ff5d8f","#e2a52b","#4c8dff","#c1492e"][i%6],
    }));
    selected=-1; sketch=[]; fit(); return true;
  }
  function clearAll(){ pushUndo(); pieces=[]; sketch=[]; selected=-1; measurePts=[]; clickBuf=[]; userAdjusted=false; render(); }

  // Convert a world (cm) point to canvas CSS pixels — handy for hit-tests/tests.
  function screenOf(x,y){ return toScreen(x,y); }

  return { init, setTranslator, setPattern, getPieces, setTool, setOpt, getOpt, zoom, fit,
           doUndo, doRedo, getZoom, toggleVisible, selectPiece, clearSketch, render,
           onZoomChange, exportSVG, exportDXF, exportPDF, loadPieces, clearAll, screenOf };
})();
