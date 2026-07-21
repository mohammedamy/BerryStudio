/* ============================================================
   BerryStudio — application controller.
   Wires i18n, themes, RTL, panels, grading, 3D, export, etc.
   ============================================================ */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

  // ---------------- persisted state ----------------
  const DEF = {
    lang: "en", theme: "intl", mode: "light",
    category: "women", size: "M", standard: "intl",
    kids: null, custom: {}, unitsCm: true,
    hoverHelp: true, highContrast: false, reduceMotion: false, cloudSync: false,
    onboarded: false, mine: [],
  };
  const state = Object.assign({}, DEF, JSON.parse(localStorage.getItem("pps") || "{}"));
  const save = () => localStorage.setItem("pps", JSON.stringify(state));
  const T = k => (I18N[state.lang][k] ?? I18N.en[k] ?? k);
  const L = o => (o ? (o[state.lang] ?? o.en) : "");

  const PALETTE = ["#6d5efc", "#00c2a8", "#ff5d8f", "#e2a52b", "#4c8dff", "#c1492e"];

  // ---------------- ICONS (inline SVG) ----------------
  const IC = {
    logo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l4-3 5 4 5-4 4 3-3 5v10H6V11z"/></svg>',
    select:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l7 17 2-7 7-2z"/></svg>',
    pen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18"/><path d="M2 2l7.5 7.5"/></svg>',
    line:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19L19 5"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/></svg>',
    arc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 19a15 15 0 0 1 16-14"/></svg>',
    free:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3 1 4-4 7-4s3 4 6 2 4-6 5-6"/></svg>',
    symmetry:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18"/><path d="M8 7l-4 5 4 5"/><path d="M16 7l4 5-4 5"/></svg>',
    knife:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l7-7"/><path d="M14 4l6 6-4 1-3-3z"/></svg>',
    move:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/></svg>',
    rotate:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
    scale:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7"/><path d="M3 3l7 7"/><rect x="10" y="10" width="11" height="11" rx="1"/></svg>',
    measure:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 16L16 2l6 6L8 22z"/><path d="M7 11l2 2M11 7l2 2M15 11l2 2"/></svg>',
    seam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1" stroke-dasharray="2 2"/></svg>',
    notch:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l4 8H8z"/><path d="M4 21h16"/></svg>',
    grain:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M8 6l4-3 4 3M8 18l4 3 4-3"/></svg>',
    undo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>',
    redo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/></svg>',
    grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>',
    magnet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 3h4v4H6zM14 3h4v4h-4z"/></svg>',
    cube:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M3 7l9 5 9-5"/></svg>',
    layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2l10 6-10 6L2 8z"/><path d="M2 12l10 6 10-6M2 16l10 6 10-6"/></svg>',
    cmd:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/></svg>',
    palette:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-1 1-2s0-2 1-2h2a4 4 0 0 0 4-4c0-5-4-8-8-8z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="11" r="1"/></svg>',
    globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>',
    moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
    gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.6.1-1z"/></svg>',
    download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
    ruler:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18"/></svg>',
    spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18 9l-4.2 1.3L12 15l-1.8-4.7L6 9l4.2-1.3z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
    eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeoff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 4.2A10 10 0 0 1 12 4c6 0 10 8 10 8a18 18 0 0 1-3 3.9M6.6 6.6A18 18 0 0 0 2 12s4 8 10 8a10 10 0 0 0 3-.5"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>',
    shirt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M8 2l4 3 4-3 5 4-3 4v11H6V10L3 6z"/></svg>',
    dress:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M9 2l3 3 3-3 2 5-3 3 4 12H6l4-12-3-3z"/></svg>',
  };

  // ---------------- TOOLS ----------------
  const TOOLS = [
    { id:"select", i:"select" }, { id:"pen", i:"pen" }, { id:"line", i:"line" },
    { id:"arc", i:"arc" }, { id:"free", i:"free" }, { id:"symmetry", i:"symmetry" },
    { id:"knife", i:"knife" }, "sep", { id:"move", i:"move" }, { id:"rotate", i:"rotate" },
    { id:"scale", i:"scale" }, { id:"measure", i:"measure" }, "sep",
    { id:"seam", i:"seam", toggle:"seam" }, { id:"notch", i:"notch" }, { id:"grain", i:"grain" },
  ];

  // ================= RENDER SHELL =================
  function buildToolRail() {
    const rail = $("#toolrail"); rail.innerHTML = "";
    TOOLS.forEach(tl => {
      if (tl === "sep") { rail.appendChild(el("div","tool-sep")); return; }
      const b = el("button", "tool", IC[tl.i]);
      b.dataset.tool = tl.id;
      tip(b, T("t_"+tl.id), T("tt_"+tl.id));
      b.onclick = () => {
        if (tl.toggle) { const v = !Canvas.getOpt(tl.toggle); Canvas.setOpt(tl.toggle, v); b.classList.toggle("active", v); toast(T("t_"+tl.id)); return; }
        setTool(tl.id);
      };
      if (tl.id === state.tool) b.classList.add("active");
      if (tl.toggle && Canvas.getOpt(tl.toggle)) b.classList.add("active");
      rail.appendChild(b);
    });
  }
  function setTool(id) {
    state.tool = id; Canvas.setTool(id);
    $$("#toolrail .tool").forEach(b => b.classList.toggle("active", b.dataset.tool === id && !TOOLS.find(t=>t!=="sep"&&t.id===b.dataset.tool)?.toggle));
    toast(T("t_"+id));
  }

  // ---- right rail panes ----
  const PANES = ["size","measure","layers","library","ai","export"];
  function buildRail() {
    const tabs = $("#railTabs"); tabs.innerHTML = "";
    PANES.forEach(p => { const b = el("button", state.pane===p?"active":"", T("tab_"+p)); b.onclick = () => showPane(p); b.dataset.pane=p; tabs.appendChild(b); });
    renderSizePane(); renderMeasurePane(); renderLayersPane(); renderLibraryPane(); renderAIPane(); renderExportPane();
    showPane(state.pane || "size");
  }
  function showPane(p) {
    state.pane = p;
    $$("#railTabs button").forEach(b => b.classList.toggle("active", b.dataset.pane === p));
    $$(".rail-pane").forEach(x => x.classList.toggle("active", x.dataset.pane === p));
    $("#rightRail").classList.remove("collapsed");
  }

  // SIZE PANE
  function renderSizePane() {
    const c = $("[data-pane=size]"); c.innerHTML = "";
    c.appendChild(el("div","section-title",IC.ruler+T("sizeGrading")));
    // standard select
    const f1 = el("div","field",`<label>${T("standard")}</label>`);
    const sel = el("select","select");
    [["intl",T("std_intl")],["egypt",T("std_egypt")],["saudi",T("std_saudi")]].forEach(([v,n])=>{const o=el("option",null,n);o.value=v;if(state.standard===v)o.selected=true;sel.appendChild(o);});
    sel.onchange=()=>{state.standard=sel.value;grade();}; f1.appendChild(sel); c.appendChild(f1);
    // size grid
    c.appendChild(el("div","section-title",null)).textContent=T("sizeRange");
    const grid = el("div","size-grid");
    SIZES.forEach(s=>{const b=el("button","size-btn"+(state.size===s&&!state.kids?" active":""),s);b.onclick=()=>{state.size=s;state.kids=null;grade();renderSizePane();};grid.appendChild(b);});
    c.appendChild(grid);
    // kids
    c.appendChild(el("div","section-title",null)).textContent=T("kidsMode");
    const kg = el("div","size-grid");
    KIDS_AGES.forEach(a=>{const b=el("button","size-btn"+(state.kids===a.id?" active":""),L(a.label));b.onclick=()=>{state.kids=state.kids===a.id?null:a.id;grade();renderSizePane();};kg.appendChild(b);});
    c.appendChild(kg);
    // auto grade
    const bg = el("button","big-btn",IC.spark+T("autoGrade")); bg.style.marginTop="16px"; bg.onclick=()=>{grade();toast(T("graded")+" · "+(state.kids?L(KIDS_AGES.find(a=>a.id===state.kids).label):state.size));}; c.appendChild(bg);
    c.appendChild(el("div","help-note",`${T("gradedTo")}: <b id="gradeLbl"></b>`)).style.marginTop="12px";
    updateGradeLbl();
  }
  function updateGradeLbl(){ const l=$("#gradeLbl"); if(l) l.textContent = state.kids ? L(KIDS_AGES.find(a=>a.id===state.kids).label) : state.size; }

  // MEASURE PANE
  const MEAS_KEYS = ["chest","waist","hips","shoulder","backLen","sleeve","neck","bicep","inseam","thigh","height"];
  function renderMeasurePane() {
    const c = $("[data-pane=measure]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.measure+T("customMeas")));
    c.appendChild(el("div","help-note",T("liveUpdate")));
    const m = currentMeas();
    const box = el("div"); box.style.marginTop="10px";
    MEAS_KEYS.forEach(k=>{
      const row = el("div","meas-row",`<label>${T("m_"+k)}</label>`);
      const inp = el("input"); inp.type="number"; inp.value=m[k]; inp.dataset.k=k;
      inp.onchange=()=>{ state.custom[k]=inp.value; grade(); };
      row.appendChild(inp); box.appendChild(row);
    });
    c.appendChild(box);
    const b=el("button","big-btn",IC.check+T("applyMeas")); b.style.marginTop="14px"; b.onclick=()=>{grade();toast(T("graded"));}; c.appendChild(b);
    const r=el("button","big-btn ghost",T("cancel")); r.style.marginTop="8px"; r.onclick=()=>{state.custom={};grade();renderMeasurePane();}; c.appendChild(r);
  }

  // LAYERS PANE
  function renderLayersPane() {
    const c = $("[data-pane=layers]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.layers+T("layersPanel")));
    const pieces = Canvas.getPieces();
    if(!pieces.length){ c.appendChild(el("div","help-note",T("empty2d"))); return; }
    pieces.forEach((p,i)=>{
      const row = el("div","layer");
      const sw = el("span","swatch"); sw.style.background=p.color; row.appendChild(sw);
      row.appendChild(el("span","lname",`${L(p.name)}<small>${p.name[state.lang==="ar"?"en":"ar"]}</small>`));
      const eye = el("button", null, p.visible?IC.eye:IC.eyeoff);
      eye.onclick=()=>{Canvas.toggleVisible(i);renderLayersPane();};
      row.appendChild(eye);
      row.onclick=(e)=>{ if(e.target.closest("button"))return; Canvas.selectPiece(i); showPieceInfo(p); };
      c.appendChild(row);
    });
    const clr=el("button","big-btn ghost",T("cancel")+" ✎"); clr.style.marginTop="12px"; clr.onclick=()=>{Canvas.clearSketch();toast("✓");}; c.appendChild(clr);
  }

  // LIBRARY PANE
  function renderLibraryPane() {
    const c = $("[data-pane=library]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.shirt+T("libraryTitle")));
    const sb = el("div","field",`<div style="position:relative"><span style="position:absolute;inset-inline-start:10px;top:9px;color:var(--ink-2)">${IC.search}</span></div>`);
    const inp = el("input","input"); inp.placeholder=T("searchLib"); inp.style.paddingInlineStart="34px"; sb.firstChild.appendChild(inp); c.appendChild(sb);
    const grid = el("div","lib-grid");
    const draw = (filter="") => {
      grid.innerHTML="";
      LIBRARY.filter(x=>{const p=PATTERNS[x.id]; return L(p.name).toLowerCase().includes(filter.toLowerCase());})
        .forEach(x=>{
          const p=PATTERNS[x.id];
          const card=el("div","lib-card");
          card.appendChild(el("div","lib-thumb", x.cat==="men"?IC.shirt:IC.dress));
          card.appendChild(el("div","lib-meta",`<div class="t">${L(p.name)}</div><div class="s">${L(x.tag)} · ${T(x.cat)}</div>`));
          card.onclick=()=>loadPattern(x.id);
          grid.appendChild(card);
        });
      // my patterns
      state.mine.forEach((mp,idx)=>{ const card=el("div","lib-card"); card.appendChild(el("div","lib-thumb",IC.dress)); card.appendChild(el("div","lib-meta",`<div class="t">${mp.name}</div><div class="s">★ ${T("saveMine").split(" ")[0]}</div>`)); card.onclick=()=>{Canvas.setPattern(mp.pieces,PALETTE);afterLoad(mp.name);}; grid.appendChild(card); });
    };
    inp.oninput=()=>draw(inp.value); draw();
    c.appendChild(grid);
    const b=el("button","big-btn ghost",T("saveMine")); b.style.marginTop="14px";
    b.onclick=()=>{ const pieces=Canvas.getPieces(); if(!pieces.length){toast(T("empty2d"));return;} state.mine.push({name:(state.loaded?L(PATTERNS[state.loaded].name):"Custom")+" ✎",pieces:JSON.parse(JSON.stringify(pieces))}); save(); renderLibraryPane(); toast(T("saved")); };
    c.appendChild(b);
  }

  // AI PANE
  function renderAIPane() {
    const c = $("[data-pane=ai]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.spark+T("aiTitle")));
    c.appendChild(el("div","help-note",T("aiDesc")));
    const f=el("div","field"); f.style.marginTop="12px";
    const ta=el("textarea","textarea"); ta.placeholder=T("aiPlaceholder"); ta.id="aiPrompt"; f.appendChild(ta); c.appendChild(f);
    const up=el("button","big-btn ghost",IC.download+T("aiUpload")); up.style.marginBottom="10px"; up.onclick=()=>toast(T("aiUpload")+" ✓"); c.appendChild(up);
    const gen=el("button","big-btn",IC.spark+T("generate"));
    gen.onclick=()=>runAI(ta.value,gen); c.appendChild(gen);
  }
  function runAI(txt, btn){
    const orig=btn.innerHTML; btn.innerHTML=IC.spark+T("generating"); btn.style.opacity=".7";
    // Heuristic local "AI": map keywords -> known pattern, else compose generic block.
    setTimeout(()=>{
      const t=(txt||"").toLowerCase();
      let id="womens_dress";
      if(/shirt|قميص/.test(t)) id="mens_shirt";
      else if(/abaya|عباية/.test(t)) id="abaya";
      else if(/thobe|ثوب/.test(t)) id="thobe";
      else if(/trouser|pant|بنطلون/.test(t)) id="boys_trousers";
      else if(/girl|بنات|puff|party/.test(t)) id="girls_dress";
      else if(/dress|فستان|gown/.test(t)) id="womens_dress";
      loadPattern(id);
      btn.innerHTML=orig; btn.style.opacity="1"; toast(T("generated"));
    }, 900);
  }

  // EXPORT PANE
  const PAPERS=["A0","A1","A2","A3","A4","Letter","Plotter","Custom"];
  const FORMATS=["PDF","DXF","SVG","AI","PNG","JPEG","HPGL"];
  function renderExportPane() {
    const c = $("[data-pane=export]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.download+T("exportTitle")));
    c.appendChild(el("div",null,`<label style="font-size:11.5px;font-weight:700;color:var(--ink-2)">${T("paperSize")}</label>`));
    const pg=el("div","opt-grid"); pg.style.margin="8px 0 4px";
    PAPERS.forEach((p,i)=>{const o=el("div","opt"+(i===4?" active":""),p);o.onclick=()=>{$$("#pg .opt").forEach(x=>x.classList.remove("active"));o.classList.add("active");};pg.appendChild(o);}); pg.id="pg"; c.appendChild(pg);
    c.appendChild(el("div",null,`<label style="font-size:11.5px;font-weight:700;color:var(--ink-2)">${T("format")}</label>`)).style.marginTop="12px";
    const fg=el("div","opt-grid"); fg.style.margin="8px 0";
    FORMATS.forEach((p,i)=>{const o=el("div","opt"+(i===2?" active":""),p);o.dataset.fmt=p;o.onclick=()=>{$$("#fg .opt").forEach(x=>x.classList.remove("active"));o.classList.add("active");};fg.appendChild(o);}); fg.id="fg"; c.appendChild(fg);
    // toggles
    [["tiled",true],["regMarks",true]].forEach(([k,v])=>{
      const r=el("label","set-row"); r.innerHTML=`<span class="sl">${T(k)}</span>`;
      const sw=el("span","switch",`<input type="checkbox" ${v?"checked":""}><span class="track"></span>`); r.appendChild(sw); c.appendChild(r);
    });
    // fabric + cost
    c.appendChild(el("div","section-title",null)).textContent=T("fabricCalc");
    const meas=currentMeas(); const yards=((meas.height/100)* (state.category==="women"?1.8:1.5)).toFixed(2);
    c.appendChild(el("div","help-note",`${T("fabric")}: <b>${yards} m</b> @ 150cm`));
    c.appendChild(el("div","section-title",null)).textContent=T("costEst");
    const fabricCost=+(yards*8).toFixed(2), trims=6.5, labor=15;
    const cost=el("div");
    cost.appendChild(el("div","cost-row",`<span>${T("fabric")}</span><b>$${fabricCost}</b>`));
    cost.appendChild(el("div","cost-row",`<span>${T("trims")}</span><b>$${trims}</b>`));
    cost.appendChild(el("div","cost-row",`<span>${T("labor")}</span><b>$${labor}</b>`));
    cost.appendChild(el("div","cost-row total",`<span>${T("total")}</span><b>$${(fabricCost+trims+labor).toFixed(2)}</b>`));
    c.appendChild(cost);
    const ex=el("button","big-btn",IC.download+T("exportNow")); ex.style.marginTop="14px"; ex.onclick=doExport; c.appendChild(ex);
    const tp=el("button","big-btn ghost",T("techPack")); tp.style.marginTop="8px"; tp.onclick=()=>techPack(); c.appendChild(tp);
    const bo=el("button","big-btn ghost",T("bom")); bo.style.marginTop="8px"; bo.onclick=()=>toast(T("bom")+" ✓"); c.appendChild(bo);
  }

  function doExport(){
    const fmt=($("#fg .opt.active")||{}).dataset?.fmt||"SVG";
    if(fmt==="SVG"){ const svg=Canvas.exportSVG(); if(!svg){toast(T("empty2d"));return;} download("pattern.svg","image/svg+xml",svg); }
    else { const svg=Canvas.exportSVG(); download(`pattern.${fmt.toLowerCase()}`,"text/plain",svg||"BerryStudio export"); }
    toast(T("exported")+" · "+fmt);
  }
  function download(name,type,data){ const b=new Blob([data],{type}); const u=URL.createObjectURL(b); const a=el("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u); }
  function techPack(){
    const pieces=Canvas.getPieces(); if(!pieces.length){toast(T("empty2d"));return;}
    const m=currentMeas();
    let html=`<h2 style="margin-bottom:8px">${state.loaded?L(PATTERNS[state.loaded].name):"Tech Pack"}</h2>`;
    html+=`<p style="color:var(--ink-2);font-size:13px;margin-bottom:14px">${T("gradedTo")}: ${state.kids?L(KIDS_AGES.find(a=>a.id===state.kids).label):state.size} · ${T("std_"+state.standard)}</p>`;
    html+=`<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="text-align:start"><th style="text-align:start;padding:6px;border-bottom:1px solid var(--line)">${T("pieces")}</th><th style="padding:6px;border-bottom:1px solid var(--line)">EN / AR</th></tr>`;
    pieces.forEach(p=>{html+=`<tr><td style="padding:6px;border-bottom:1px solid var(--line-2)">${L(p.name)}</td><td style="padding:6px;border-bottom:1px solid var(--line-2);color:var(--ink-2)">${p.name[state.lang==="ar"?"en":"ar"]}</td></tr>`;});
    html+=`</table><h3 style="margin:16px 0 6px">${T("customMeas")}</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px">`;
    MEAS_KEYS.forEach(k=>html+=`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line-2)"><span>${T("m_"+k)}</span><b>${m[k]} cm</b></div>`);
    html+="</div>";
    openModal("Tech Pack", html, true);
  }

  // ================= PATTERNS =================
  function currentMeas(){ return computeMeasurements({category:state.category,size:state.size,standard:state.standard,kids:state.kids,custom:state.custom}); }
  function loadPattern(id){
    state.loaded=id; const p=PATTERNS[id];
    // switch category to match
    if(p.category && p.category!==state.category){ state.category=p.category; syncCategoryUI(); }
    Canvas.setPattern(p.pieces(currentMeas()), PALETTE);
    afterLoad(L(p.name));
  }
  function afterLoad(name){ hideEmpty(); renderLayersPane(); toast(T("patternLoaded")+" · "+name); if(state.view==="3d") build3D(); save(); }
  function grade(){
    if(state.loaded){ const p=PATTERNS[state.loaded]; Canvas.setPattern(p.pieces(currentMeas()), PALETTE); renderLayersPane(); if(state.view==="3d") build3D(); }
    updateGradeLbl(); updateStageChips(); save();
  }

  // ================= 3D =================
  function build3D(){ const m=currentMeas(); View3D.build(state.category, m, cssHex("--brand")); }
  function cssHex(k){ const t=document.createElement("canvas").getContext("2d");t.fillStyle=getComputedStyle(document.body).getPropertyValue(k).trim();return parseInt(t.fillStyle.slice(1),16);}
  function setView(v){
    state.view=v;
    $("#view3d").classList.toggle("show", v==="3d");
    document.querySelector(".canvas-wrap").classList.toggle("threed", v==="3d");
    $$("#viewToggle button").forEach(b=>b.classList.toggle("active",b.dataset.v===v));
    if(v==="3d"){ View3D.resize(); build3D(); } else Canvas.render();
    save();
  }

  // ================= EMPTY STATE =================
  function hideEmpty(){ $("#emptyState").classList.add("hidden"); }
  function showEmpty(){ $("#emptyState").classList.remove("hidden"); }

  // ================= HEADER / CATEGORY =================
  function syncCategoryUI(){ $$("#catSeg button").forEach(b=>b.classList.toggle("active",b.dataset.cat===state.category)); }
  function setCategory(cat){
    state.category=cat; syncCategoryUI();
    // load a default pattern for that category
    const def={women:"womens_dress",men:"mens_shirt",girls:"girls_dress",boys:"boys_trousers"}[cat];
    if(state.loaded) loadPattern(def); else { renderMeasurePane(); grade(); }
    renderLibraryPane();
  }

  // ================= THEME / LANG =================
  function applyTheme(){
    document.documentElement.setAttribute("data-theme",state.theme);
    document.documentElement.setAttribute("data-mode",state.mode);
    document.body.setAttribute("data-theme",state.theme);
    document.body.setAttribute("data-mode",state.mode);
    document.body.setAttribute("data-contrast",state.highContrast?"high":"normal");
    $("#modeBtn").innerHTML = state.mode==="light"?IC.moon:IC.sun;
    Canvas.render(); if(state.view==="3d") build3D();
  }
  function applyLang(){
    const d=I18N[state.lang].dir;
    document.documentElement.lang=state.lang; document.documentElement.dir=d;
    $$("[data-i18n]").forEach(e=>e.textContent=T(e.dataset.i18n));
    $$("[data-i18n-ph]").forEach(e=>e.placeholder=T(e.dataset.i18nPh));
    Canvas.setTranslator(T);
    buildToolRail(); buildRail(); syncCategoryUI(); updateStageChips();
    $("#brandName").textContent=T("appName"); $("#brandSub").textContent=T("tagline");
    $$("#viewToggle button")[0].textContent=T("view2d"); $$("#viewToggle button")[1].textContent=T("view3d");
    Canvas.render();
  }

  // ================= TOOLTIPS =================
  const ttEl=el("div","tt"); document.body.appendChild(ttEl);
  function tip(node,title,body){
    node.addEventListener("pointerenter",e=>{ if(!state.hoverHelp)return; ttEl.innerHTML=`<b>${title}</b>${body?`<small>${body}</small>`:""}`; ttEl.classList.add("show"); posTip(e); });
    node.addEventListener("pointermove",posTip);
    node.addEventListener("pointerleave",()=>ttEl.classList.remove("show"));
    function posTip(e){ const r=ttEl.getBoundingClientRect(); let x=e.clientX+14,y=e.clientY+14; if(x+r.width>innerWidth)x=e.clientX-r.width-14; if(y+r.height>innerHeight)y=e.clientY-r.height-14; ttEl.style.left=x+"px"; ttEl.style.top=y+"px"; }
  }

  // ================= PIECE INFO =================
  function showPieceInfo(p){
    const box=$("#pieceInfo");
    box.innerHTML=`<div class="pi-t">${L(p.name)}</div><div class="pi-ar">${p.name[state.lang==="ar"?"en":"ar"]}</div><div class="pi-d">${L(p.desc||{en:"",ar:""})}</div>`;
    box.classList.add("show");
    setTimeout(()=>box.classList.remove("show"),4200);
  }

  // ================= TOASTS =================
  function toast(msg){ const t=el("div","toast",IC.check+`<span>${msg}</span>`); $("#toasts").appendChild(t); setTimeout(()=>{t.style.opacity="0";t.style.transform="translateY(8px)";setTimeout(()=>t.remove(),250);},1900); }

  // ================= MODALS =================
  function openModal(title,body,wide){ const o=$("#genericModal"); o.querySelector(".modal").classList.toggle("wide",!!wide); o.querySelector("h2").textContent=title; o.querySelector(".modal-body").innerHTML=body; o.classList.add("show"); }
  function closeModal(id){ $(id).classList.remove("show"); }

  // Theme picker
  function openThemePicker(){
    const body=$("#themeModal .modal-body"); body.innerHTML="";
    const themes=[
      {id:"egypt",name:{en:"Egyptian",ar:"مصري"},d:{en:"Warm earthy & gold",ar:"دفء ترابي وذهبي"},sw:["#c8912e","#1f7a6d","#c1492e"]},
      {id:"saudi",name:{en:"Saudi / Gulf",ar:"سعودي / خليجي"},d:{en:"Emerald, gold, burgundy",ar:"زمردي وذهبي وعنابي"},sw:["#0f7a4f","#c69a2e","#7a1f2b"]},
      {id:"intl",name:{en:"International",ar:"عالمي"},d:{en:"Clean modern accents",ar:"عصري نظيف"},sw:["#6d5efc","#00c2a8","#ff5d8f"]},
    ];
    const grid=el("div","theme-cards");
    themes.forEach(th=>{ const card=el("div","theme-card"+(state.theme===th.id?" active":"")); card.innerHTML=`<div class="swatches">${th.sw.map(s=>`<span class="sw" style="background:${s}"></span>`).join("")}</div><div class="tn">${L(th.name)}</div><div class="td">${L(th.d)}</div>`; card.onclick=()=>{state.theme=th.id;applyTheme();save();$$("#themeModal .theme-card").forEach(x=>x.classList.remove("active"));card.classList.add("active");toast(T("themeChanged"));}; grid.appendChild(card); });
    body.appendChild(grid);
    // mode toggle inside
    const row=el("label","set-row"); row.style.marginTop="18px"; row.innerHTML=`<span class="sl">${T("appearance")}<small>${T("tt_mode")}</small></span>`;
    const sw=el("span","switch",`<input type="checkbox" ${state.mode==="dark"?"checked":""}><span class="track"></span>`);
    sw.querySelector("input").onchange=e=>{state.mode=e.target.checked?"dark":"light";applyTheme();save();}; row.appendChild(sw); body.appendChild(row);
    $("#themeModal").classList.add("show");
  }

  // Settings
  function openSettings(){
    const body=$("#settingsModal .modal-body"); body.innerHTML="";
    const toggles=[["hoverHelp","hoverHelpD"],["highContrast","highContrastD"],["reduceMotion","reduceMotionD"],["cloudSync","cloudSyncD"]];
    toggles.forEach(([k,d])=>{
      const r=el("label","set-row"); r.innerHTML=`<span class="sl">${T(k)}<small>${T(d)}</small></span>`;
      const sw=el("span","switch",`<input type="checkbox" ${state[k]?"checked":""}><span class="track"></span>`);
      sw.querySelector("input").onchange=e=>{ state[k]=e.target.checked; save(); if(k==="highContrast")applyTheme(); if(k==="reduceMotion")document.body.style.setProperty("--med",e.target.checked?"0s":".28s"); toast("✓"); };
      r.appendChild(sw); body.appendChild(r);
    });
    const units=el("label","set-row"); units.innerHTML=`<span class="sl">${T("tab_measure")}<small>cm / inch</small></span>`;
    const seg=el("div","seg",`<button ${state.unitsCm?'class="active"':''}>cm</button><button ${!state.unitsCm?'class="active"':''}>inch</button>`);
    seg.children[0].onclick=()=>{state.unitsCm=true;Canvas.setOpt("unitsCm",true);save();openSettings();updateStageChips();};
    seg.children[1].onclick=()=>{state.unitsCm=false;Canvas.setOpt("unitsCm",false);save();openSettings();updateStageChips();};
    units.appendChild(seg); body.appendChild(units);
    const rb=el("button","big-btn ghost",T("resetOnb")); rb.style.marginTop="16px"; rb.onclick=()=>{closeModal("#settingsModal");startOnboarding();}; body.appendChild(rb);
    const ib=el("button","big-btn",IC.download+T("installApp")); ib.style.marginTop="8px"; ib.onclick=installApp; body.appendChild(ib);
    $("#settingsModal").classList.add("show");
  }

  // ================= COMMAND PALETTE =================
  let cmdSel=0, cmdItems=[];
  function commands(){ return [
    {t:T("view2d"),i:IC.grid,run:()=>setView("2d")},
    {t:T("view3d"),i:IC.cube,run:()=>setView("3d")},
    {t:T("autoGrade"),i:IC.spark,run:()=>{grade();toast(T("graded"));}},
    {t:T("theme"),i:IC.palette,run:openThemePicker},
    {t:T("settings"),i:IC.gear,run:openSettings},
    {t:T("exportTitle"),i:IC.download,run:()=>{showPane("export");}},
    {t:T("aiTitle"),i:IC.spark,run:()=>showPane("ai")},
    {t:T("libraryTitle"),i:IC.shirt,run:()=>showPane("library")},
    ...LIBRARY.map(x=>({t:L(PATTERNS[x.id].name),i:IC.dress,run:()=>loadPattern(x.id)})),
    {t:T("language")+" · "+(state.lang==="en"?"العربية":"English"),i:IC.globe,run:toggleLang},
  ]; }
  function openCmd(){ $("#cmdModal").classList.add("show"); const inp=$("#cmdInput"); inp.value=""; inp.focus(); renderCmd(""); }
  function renderCmd(q){ cmdItems=commands().filter(c=>c.t.toLowerCase().includes(q.toLowerCase())); cmdSel=0; const list=$("#cmdList"); list.innerHTML=""; cmdItems.forEach((c,i)=>{ const it=el("div","cmd-item"+(i===0?" sel":""),`${c.i}<span>${c.t}</span><span class="k">↵</span>`); it.onclick=()=>{c.run();closeModal("#cmdModal");}; list.appendChild(it); }); }

  // ================= ONBOARDING =================
  let onbStep=0;
  const ONB=[["onbTitle1","onbBody1"],["onbTitle2","onbBody2"],["onbTitle3","onbBody3"],["onbTitle4","onbBody4"]];
  function startOnboarding(){ onbStep=0; $("#onbModal").classList.add("show"); renderOnb(); }
  function renderOnb(){
    const [t,b]=ONB[onbStep];
    $("#onbTitle").textContent=T(t); $("#onbBody").textContent=T(b);
    $("#onbDots").innerHTML=ONB.map((_,i)=>`<span class="onb-dot ${i===onbStep?"active":""}"></span>`).join("");
    $("#onbNext").textContent = onbStep===ONB.length-1?T("getStarted"):T("next");
    $("#onbBack").style.visibility = onbStep===0?"hidden":"visible";
  }
  function onbNext(){ if(onbStep<ONB.length-1){onbStep++;renderOnb();} else {state.onboarded=true;save();closeModal("#onbModal");} }
  function onbBack(){ if(onbStep>0){onbStep--;renderOnb();} }

  // ================= STAGE CHIPS =================
  function updateStageChips(){
    const m=currentMeas();
    $("#chipSize").innerHTML=`${T("gradedTo")}: <b>${state.kids?L(KIDS_AGES.find(a=>a.id===state.kids).label):state.size}</b>`;
    $("#chipStd").innerHTML=`${T("standard")}: <b>${T("std_"+state.standard)}</b>`;
    $("#chipChest").innerHTML=`${T("m_chest")}: <b>${state.unitsCm?m.chest+" cm":(m.chest/2.54).toFixed(1)+" in"}</b>`;
  }

  // ================= LANG / MISC TOGGLES =================
  function toggleLang(){ state.lang=state.lang==="en"?"ar":"en"; save(); applyLang(); applyTheme(); toast(state.lang==="ar"?"تم":"Done"); }
  function toggleMode(){ state.mode=state.mode==="light"?"dark":"light"; applyTheme(); save(); }

  // ================= PWA INSTALL =================
  let deferredPrompt=null;
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("#installBtn").classList.remove("hidden");});
  function installApp(){ if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null;} else toast(T("installApp")+" — Add to Home Screen"); }

  // ================= KEYBOARD =================
  function keys(e){
    const meta=e.ctrlKey||e.metaKey;
    if(meta&&e.key==="k"){e.preventDefault();openCmd();return;}
    if(meta&&e.key==="z"&&!e.shiftKey){e.preventDefault();Canvas.doUndo();renderLayersPane();return;}
    if(meta&&(e.key==="y"||(e.shiftKey&&e.key.toLowerCase()==="z"))){e.preventDefault();Canvas.doRedo();return;}
    if($("#cmdModal").classList.contains("show")){
      if(e.key==="ArrowDown"){e.preventDefault();cmdSel=Math.min(cmdItems.length-1,cmdSel+1);hiCmd();}
      if(e.key==="ArrowUp"){e.preventDefault();cmdSel=Math.max(0,cmdSel-1);hiCmd();}
      if(e.key==="Enter"&&cmdItems[cmdSel]){cmdItems[cmdSel].run();closeModal("#cmdModal");}
      if(e.key==="Escape")closeModal("#cmdModal");
      return;
    }
    if(e.key==="Escape")$$(".overlay.show").forEach(o=>o.classList.remove("show"));
    // tool shortcuts
    const map={v:"select",p:"pen",l:"line",a:"arc",m:"measure",r:"rotate",s:"scale"};
    if(!meta&&map[e.key]&&document.activeElement.tagName!=="INPUT"&&document.activeElement.tagName!=="TEXTAREA")setTool(map[e.key]);
  }
  function hiCmd(){ $$("#cmdList .cmd-item").forEach((x,i)=>x.classList.toggle("sel",i===cmdSel)); const s=$$("#cmdList .cmd-item")[cmdSel]; if(s)s.scrollIntoView({block:"nearest"}); }

  // ================= WIRE EVENTS =================
  function wire(){
    // category
    $$("#catSeg button").forEach(b=>b.onclick=()=>setCategory(b.dataset.cat));
    // view toggle
    $$("#viewToggle button").forEach(b=>{ b.onclick=()=>setView(b.dataset.v); });
    // header buttons
    $("#cmdBtn").onclick=openCmd; tip($("#cmdBtn"),T("cmd")||"⌘K",T("tt_cmd"));
    $("#themeBtn").onclick=openThemePicker; tip($("#themeBtn"),T("theme"),T("tt_theme"));
    $("#langBtn").onclick=toggleLang; tip($("#langBtn"),T("language"),T("tt_lang"));
    $("#modeBtn").onclick=toggleMode; tip($("#modeBtn"),T("appearance"),T("tt_mode"));
    $("#settingsBtn").onclick=openSettings; tip($("#settingsBtn"),T("settings"),T("tt_settings"));
    $("#installBtn").onclick=installApp;
    $("#unitsPill").onclick=()=>{state.unitsCm=!state.unitsCm;Canvas.setOpt("unitsCm",state.unitsCm);save();updateUnitsPill();updateStageChips();};
    tip($("#unitsPill"),T("tab_measure"),T("tt_units"));
    // grid/snap in stage toolbar
    $("#gridBtn").onclick=()=>{const v=!Canvas.getOpt("grid");Canvas.setOpt("grid",v);$("#gridBtn").classList.toggle("active",v);}; tip($("#gridBtn"),T("t_line"),T("tt_grid"));
    $("#snapBtn").onclick=()=>{const v=!Canvas.getOpt("snap");Canvas.setOpt("snap",v);$("#snapBtn").classList.toggle("active",v);}; tip($("#snapBtn"),"Snap",T("tt_snap"));
    // zoom
    $("#zin").onclick=()=>Canvas.zoom(1.2); tip($("#zin"),"+",T("tt_zoomin"));
    $("#zout").onclick=()=>Canvas.zoom(0.83); tip($("#zout"),"−",T("tt_zoomout"));
    $("#zfit").onclick=()=>Canvas.fit(); tip($("#zfit"),"Fit",T("tt_zoomfit"));
    // empty state
    $("#emptyDraft").onclick=()=>{hideEmpty();setTool("pen");};
    $("#emptyLib").onclick=()=>{showPane("library");};
    // modals close
    $$("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
    $$(".overlay").forEach(o=>o.addEventListener("click",e=>{if(e.target===o)o.classList.remove("show");}));
    // cmd input
    $("#cmdInput").oninput=e=>renderCmd(e.target.value);
    // onboarding
    $("#onbNext").onclick=onbNext; $("#onbBack").onclick=onbBack; $("#onbSkip").onclick=()=>{state.onboarded=true;save();closeModal("#onbModal");};
    // 3d controls
    $("#spinToggle").onchange=e=>View3D.setSpin(e.target.checked);
    $("#walkToggle").onchange=e=>View3D.setWalk(e.target.checked);
    document.addEventListener("keydown",keys);
    window.addEventListener("resize",()=>{if(state.view==="3d")View3D.resize();});
  }
  function updateUnitsPill(){ $("#unitsPill .u").textContent=state.unitsCm?"cm":"inch"; }

  // ================= INIT =================
  function init(){
    // shell text
    $("#brandName").textContent=T("appName"); $("#brandSub").textContent=T("tagline");
    Canvas.init($("#patternCanvas"), T, (p)=>{ if(p)showPieceInfo(p); });
    Canvas.setOpt("unitsCm",state.unitsCm);
    Canvas.onZoomChange(()=>{ $("#zval").textContent=Canvas.getZoom()+"%"; });
    View3D.init($("#canvas3d"));
    buildToolRail(); buildRail(); wire();
    applyTheme(); applyLang();
    updateUnitsPill(); updateStageChips();
    $("#gridBtn").classList.toggle("active",Canvas.getOpt("grid"));
    $("#snapBtn").classList.toggle("active",Canvas.getOpt("snap"));
    // register SW
    if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
    // onboarding first run
    if(!state.onboarded) setTimeout(startOnboarding,400);
    // load default pattern so app looks alive, then restore last view
    setTimeout(()=>{ loadPattern(state.loaded||"womens_dress"); setView(state.view||"2d"); },200);
  }
  document.addEventListener("DOMContentLoaded",init);
})();
