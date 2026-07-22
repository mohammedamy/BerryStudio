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
    onboarded: false, mine: [], aiEndpoint: "", fabric3d: "cotton",
    avatarGLB: { women: "", men: "", girls: "", boys: "" },
  };
  const state = Object.assign({}, DEF, JSON.parse(localStorage.getItem("pps") || "{}"));
  const save = () => localStorage.setItem("pps", JSON.stringify(state));
  const T = k => (I18N[state.lang][k] ?? I18N.en[k] ?? k);
  const L = o => (o ? (o[state.lang] ?? o.en) : "");

  const PALETTE = ["#6d5efc", "#00c2a8", "#ff5d8f", "#e2a52b", "#4c8dff", "#c1492e"];
  let aiImage = null;   // data-URL of the uploaded AI inspiration image

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
    newdoc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/></svg>',
    importf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><path d="M12 3v12M8 11l4 4 4-4"/></svg>',
    pdf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h1a1 1 0 0 1 0 2h-1zM8.5 13v4"/></svg>',
    printer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="13" width="12" height="8" rx="1"/></svg>',
    image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></svg>',
    folder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    unlock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
    drop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
    text:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7V5h14v2M12 5v14M9 19h6"/></svg>',
    polyfill:'<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><path d="M12 2l8 6-3 10H7L4 8z" fill-opacity="0.28"/></svg>',
    trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    dots:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    question:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.2 9a2.8 2.8 0 1 1 4.3 2.4c-.9.6-1.5 1.1-1.5 2.1"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>',
    ruler:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18"/></svg>',
    spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18 9l-4.2 1.3L12 15l-1.8-4.7L6 9l4.2-1.3z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
    eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeoff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 4.2A10 10 0 0 1 12 4c6 0 10 8 10 8a18 18 0 0 1-3 3.9M6.6 6.6A18 18 0 0 0 2 12s4 8 10 8a10 10 0 0 0 3-.5"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>',
    shirt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M8 2l4 3 4-3 5 4-3 4v11H6V10L3 6z"/></svg>',
    dress:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M9 2l3 3 3-3 2 5-3 3 4 12H6l4-12-3-3z"/></svg>',
    skirtIcon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M9 3h6l1 4h-8z"/><path d="M8 7h8l3 13H5z"/></svg>',
    trousersIcon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M7 2h10l1 8-1 2 1 10h-4l-1-11-1 11H8L9 12l-1-2z"/></svg>',
    point:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg>',
    conline:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 18L18 6"/><circle cx="6" cy="18" r="2.2" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="2.2" fill="currentColor" stroke="none"/></svg>',
    conarc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19a15 15 0 0 1 15-15"/><circle cx="5" cy="19" r="2.1" fill="currentColor" stroke="none"/><circle cx="20" cy="4" r="2.1" fill="currentColor" stroke="none"/></svg>',
    circleTool:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
    promote:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 9l4-4 8 1 4 6-2 9H7z" stroke-dasharray="2.5 2"/><path d="M8.5 12.5l2.2 2.2 4.8-4.8"/></svg>',
    calib:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 12h16M4 12v-3M20 12v-3M9 12v-3M15 12v-3"/></svg>',
  };

  // ---------------- TOOLS ----------------
  const TOOLS = [
    { id:"select", i:"select" }, { id:"pen", i:"pen" }, { id:"line", i:"line" },
    { id:"arc", i:"arc" }, { id:"free", i:"free" }, { id:"polygon", i:"polyfill" }, { id:"symmetry", i:"symmetry" },
    { id:"knife", i:"knife" }, "sep",
    { id:"point", i:"point" }, { id:"conline", i:"conline" }, { id:"conarc", i:"conarc" },
    { id:"circle", i:"circleTool" }, { id:"promote", i:"promote" }, "sep",
    { id:"move", i:"move" }, { id:"rotate", i:"rotate" },
    { id:"scale", i:"scale" }, { id:"measure", i:"measure" }, { id:"text", i:"text" }, "sep",
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
  // Rail panes in a task-flow order: get a base → fit it → edit → output.
  const PANES = ["library","ai","size","measure","layers","export"];
  const PANE_ICON = { size:IC.scale, measure:IC.measure, layers:IC.layers, library:IC.shirt, ai:IC.spark, export:IC.download };
  function buildRail() {
    const tabs = $("#railTabs"); tabs.innerHTML = "";
    PANES.forEach(p => {
      const b = el("button", state.pane===p?"active":"", `${PANE_ICON[p]||""}<span>${T("tab_"+p)}</span>`);
      b.dataset.pane = p; b.onclick = () => showPane(p);
      tabs.appendChild(b);
    });
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
    const c = $(".rail-pane[data-pane=size]"); c.innerHTML = "";
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
    const c = $(".rail-pane[data-pane=measure]"); c.innerHTML="";
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

    // Custom Variables — named formulas usable in any construction point's X/Y.
    c.appendChild(el("div","section-title",IC.measure+T("varsTitle")));
    c.appendChild(el("div","help-note",T("varsHint")));
    const vbox = el("div"); vbox.style.marginTop="10px";
    const vars = Canvas.getVariables();
    const names = Object.keys(vars);
    if (!names.length) vbox.appendChild(el("div","help-note",T("varsNone")));
    names.forEach(name=>{
      const row = el("div","row",`<label style="flex:0 0 34%;font-size:12.5px;font-weight:600">${escAttr(name)}</label>`);
      row.style.cssText="display:flex;gap:6px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line-2)";
      const inp = el("input","input"); inp.type="text"; inp.value=vars[name]; inp.style.flex="1";
      inp.onchange=()=>{ try{ Canvas.setVariable(name, inp.value.trim()); } catch(e){ toast(T("invalidFormula")); inp.value=vars[name]; } };
      const del = el("button","tbtn",IC.trash); del.style.cssText="width:30px;height:30px;flex:0 0 auto";
      del.onclick=()=>{ Canvas.removeVariable(name); renderMeasurePane(); };
      row.appendChild(inp); row.appendChild(del); vbox.appendChild(row);
    });
    c.appendChild(vbox);
    const vAdd = el("div","row"); vAdd.style.cssText="display:flex;margin-top:8px;gap:6px";
    const vName = el("input","input"); vName.placeholder=T("varName"); vName.style.flex="1";
    const vForm = el("input","input"); vForm.placeholder=T("varFormula"); vForm.style.flex="1";
    vAdd.appendChild(vName); vAdd.appendChild(vForm); c.appendChild(vAdd);
    const vBtn = el("button","big-btn ghost",T("varAdd")); vBtn.style.marginTop="8px";
    vBtn.onclick=()=>{
      const name=vName.value.trim(); if(!name) return;
      try{ Canvas.setVariable(name, vForm.value.trim()); renderMeasurePane(); }
      catch(e){ toast(T("invalidFormula")); }
    };
    c.appendChild(vBtn);
  }

  // LAYERS PANE
  const FABRICS = [
    { key:"cotton",  color:"#e7dcc4" }, { key:"denim",   color:"#3f5f86" },
    { key:"silk",    color:"#e6a8bd" }, { key:"linen",   color:"#cbbb98" },
    { key:"wool",    color:"#8a7a63" }, { key:"satin",   color:"#a878d6" },
    { key:"leather", color:"#6f4526" }, { key:"chiffon", color:"#bfe0da" },
  ];
  const rgbToHex = (c) => {
    if(!c) return "#6d5efc";
    if(c[0]==="#") return c.length===4 ? "#"+[...c.slice(1)].map(x=>x+x).join("") : c;
    const m=/(\d+)\D+(\d+)\D+(\d+)/.exec(c);
    return m ? "#"+[m[1],m[2],m[3]].map(v=>(+v).toString(16).padStart(2,"0")).join("") : "#6d5efc";
  };
  function applyFabric(color, matKey){
    const pieces=Canvas.getPieces(); if(!pieces.length){ toast(T("empty2d")); return; }
    const sel=Canvas.getSelected();
    if(sel>=0) Canvas.setColor(sel,color);
    else pieces.forEach((_,i)=>Canvas.setColor(i,color));
    if(matKey){ state.fabric3d=matKey; save(); }
    sync3DFabric();
    renderLayersPane();
  }
  // Per-layer properties popover: rename (EN/AR), colour, own opacity, delete.
  function openLayerProps(i, anchor){
    closeAnyMenu();
    const p = Canvas.getPieces()[i]; if(!p) return;
    const m = el("div","menu layer-props");
    const curOp = Math.round((p.opacity!=null ? p.opacity : Canvas.getOpt("fillOpacity"))*100);
    m.innerHTML = `
      <div class="field"><label>${T("nameEn")}</label><input class="input lp-en" dir="ltr" value="${escAttr(p.name.en)}"></div>
      <div class="field"><label>${T("nameAr")}</label><input class="input lp-ar" dir="rtl" value="${escAttr(p.name.ar)}"></div>
      <div class="field"><label>${T("pieceColor")}</label><input class="lp-col" type="color" value="${rgbToHex(p.color)}" style="width:100%;height:34px;border:1px solid var(--line);border-radius:8px;background:var(--panel-2)"></div>
      <div class="field"><label>${T("opacityLbl")} · <b class="lp-opv">${curOp}%</b></label><input class="range lp-op" type="range" min="4" max="90" value="${curOp}"></div>
      <div class="menu-sep"></div>
      <button class="menu-item lp-del" style="color:var(--danger)">${IC.trash}<span>${T("removeLayer")}</span></button>`;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(), mr = m.getBoundingClientRect();
    m.style.top = Math.min(r.bottom+6, innerHeight-mr.height-8)+"px";
    if(document.documentElement.dir==="rtl") m.style.left = Math.max(8, r.left-mr.width+r.width)+"px";
    else m.style.left = Math.max(8, Math.min(r.left, innerWidth-mr.width-8))+"px";
    requestAnimationFrame(()=>m.classList.add("show"));
    const q = s => m.querySelector(s);
    q(".lp-en").onchange = () => { Canvas.renamePiece(i,{en:q(".lp-en").value.trim()||p.name.en}); renderLayersPane(); };
    q(".lp-ar").onchange = () => { Canvas.renamePiece(i,{ar:q(".lp-ar").value.trim()||p.name.ar}); renderLayersPane(); };
    q(".lp-col").oninput = () => { Canvas.setColor(i,q(".lp-col").value); sync3DFabric(); renderLayersPane(); };
    q(".lp-op").oninput = () => { const v=+q(".lp-op").value; q(".lp-opv").textContent=v+"%"; Canvas.setPieceProps(i,{opacity:v/100}); };
    q(".lp-del").onclick = () => { Canvas.removePiece(i); closeAnyMenu(); sync3DVisibility(); renderLayersPane(); toast("✓ "+T("removeLayer")); };
    setTimeout(()=>document.addEventListener("pointerdown",onDocDown),0);
  }

  function renderLayersPane() {
    const c = $(".rail-pane[data-pane=layers]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.layers+T("layersPanel")));
    // add-layer is always available (even on an empty canvas)
    const addB = el("button","big-btn ghost",IC.layers+T("addLayer"));
    addB.style.marginBottom="10px";
    addB.onclick=()=>{ Canvas.addPiece({ en:I18N.en.newLayer, ar:I18N.ar.newLayer }); hideEmpty(); renderLayersPane(); toast("✓ "+T("newLayer")); };
    c.appendChild(addB);
    const pieces = Canvas.getPieces();
    if(!pieces.length){ c.appendChild(el("div","help-note",T("empty2d"))); return; }
    const sel = Canvas.getSelected();
    pieces.forEach((p,i)=>{
      const row = el("div","layer"+(p.locked?" locked":"")+(i===sel?" active":""));
      // colour swatch — opens a native colour picker
      const sw = el("label","swatch"); sw.style.background=p.color; sw.title=T("pieceColor");
      const ci = el("input"); ci.type="color"; ci.value=rgbToHex(p.color);
      ci.style.cssText="position:absolute;width:0;height:0;opacity:0;pointer-events:none";
      ci.oninput=()=>{ Canvas.setColor(i,ci.value); sw.style.background=ci.value; sync3DFabric(); };
      sw.appendChild(ci); row.appendChild(sw);
      const nameEl = el("span","lname",`${L(p.name)}<small>${p.name[state.lang==="ar"?"en":"ar"]}</small>`);
      nameEl.ondblclick=(e)=>{ e.stopPropagation(); openLayerProps(i, row); };
      row.appendChild(nameEl);
      const props = el("button", null, IC.dots); props.title=T("layerProps");
      props.onclick=(e)=>{ e.stopPropagation(); openLayerProps(i, props); };
      row.appendChild(props);
      const lock = el("button", null, p.locked?IC.lock:IC.unlock); lock.title=T(p.locked?"unlock":"lock");
      if(p.locked) lock.style.color="var(--brand)";
      lock.onclick=(e)=>{ e.stopPropagation(); Canvas.toggleLock(i); renderLayersPane(); };
      row.appendChild(lock);
      const eye = el("button", null, p.visible?IC.eye:IC.eyeoff);
      eye.onclick=(e)=>{ e.stopPropagation(); Canvas.toggleVisible(i); sync3DVisibility(); renderLayersPane(); };
      row.appendChild(eye);
      row.onclick=(e)=>{ if(e.target.closest("button")||e.target.closest(".swatch"))return;
        if(!p.locked){ Canvas.selectPiece(i); showPieceInfo(p); renderLayersPane(); } };
      c.appendChild(row);
    });

    // Fabric & material
    c.appendChild(el("div","section-title",IC.drop+T("fabricSection")));
    c.appendChild(el("div","help-note", sel>=0 ? L(pieces[sel].name) : T("applyAll")));
    const grid=el("div","mat-grid"); grid.style.marginTop="8px";
    FABRICS.forEach(f=>{ const m=el("button","mat"+(state.fabric3d===f.key?" active":""),`<span>${T("fab_"+f.key)}</span>`);
      m.style.background=f.color; m.onclick=()=>applyFabric(f.color, f.key); grid.appendChild(m); });
    c.appendChild(grid);

    // Fabric transparency
    const tr=el("div","field"); tr.style.marginTop="14px";
    tr.innerHTML=`<label>${T("transparency")} · <b id="opVal">${Math.round(Canvas.getOpt("fillOpacity")*100)}%</b></label>`;
    const sl=el("input","range"); sl.type="range"; sl.min="4"; sl.max="70"; sl.value=Math.round(Canvas.getOpt("fillOpacity")*100);
    sl.oninput=()=>{ Canvas.setOpt("fillOpacity",+sl.value/100); const v=$("#opVal"); if(v)v.textContent=sl.value+"%"; sync3DFabric(); };
    tr.appendChild(sl); c.appendChild(tr);
  }

  // LIBRARY PANE
  const LIB_THUMB = { dress:"dress", robe:"dress", top:"shirt", shirt:"shirt", skirt:"skirtIcon", trousers:"trousersIcon" };
  function renderLibraryPane() {
    const c = $(".rail-pane[data-pane=library]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.shirt+T("libraryTitle")+` <small style="font-weight:600;color:var(--ink-2);margin-inline-start:4px">(${LIBRARY.length})</small>`));
    const sb = el("div","field",`<div style="position:relative"><span style="position:absolute;inset-inline-start:10px;top:9px;color:var(--ink-2)">${IC.search}</span></div>`);
    const inp = el("input","input"); inp.placeholder=T("searchLib"); inp.style.paddingInlineStart="34px"; sb.firstChild.appendChild(inp); c.appendChild(sb);
    // category quick-filter — defaults to the active working category, with an "All" option
    let libCat = state.category;
    const catSeg = el("div","seg"); catSeg.style.cssText="margin-bottom:10px;flex-wrap:wrap";
    const catOpts = [["all",T("allCat")],["women",T("women")],["men",T("men")],["girls",T("girls")],["boys",T("boys")]];
    catOpts.forEach(([val,label])=>{ const b=el("button",val===libCat?"active":"",label); b.onclick=()=>{ libCat=val; [...catSeg.children].forEach(x=>x.classList.toggle("active",x===b)); draw(inp.value); }; catSeg.appendChild(b); });
    c.appendChild(catSeg);
    const grid = el("div","lib-grid");
    const draw = (filter="") => {
      grid.innerHTML="";
      LIBRARY.filter(x=>{
        if(libCat!=="all" && x.cat!==libCat) return false;
        const p=PATTERNS[x.id]; return L(p.name).toLowerCase().includes(filter.toLowerCase());
      }).forEach(x=>{
          const p=PATTERNS[x.id];
          const card=el("div","lib-card");
          card.appendChild(el("div","lib-thumb", IC[LIB_THUMB[x.type]] || (x.cat==="men"?IC.shirt:IC.dress)));
          card.appendChild(el("div","lib-meta",`<div class="t">${L(p.name)}</div><div class="s">${L(x.tag)} · ${T(x.cat)}</div>`));
          card.onclick=()=>loadPattern(x.id);
          grid.appendChild(card);
        });
      // my patterns
      state.mine.forEach((mp,idx)=>{ const card=el("div","lib-card"); card.appendChild(el("div","lib-thumb",IC.dress)); card.appendChild(el("div","lib-meta",`<div class="t">${mp.name}</div><div class="s">★ ${T("saveMine").split(" ")[0]}</div>`)); card.onclick=()=>{Canvas.setPattern(mp.pieces,PALETTE);afterLoad(mp.name);}; grid.appendChild(card); });
      if(!grid.children.length) grid.appendChild(el("div","help-note",T("noResults")));
    };
    inp.oninput=()=>draw(inp.value); draw();
    c.appendChild(grid);
    const b=el("button","big-btn ghost",T("saveMine")); b.style.marginTop="14px";
    b.onclick=()=>{ const pieces=Canvas.getPieces(); if(!pieces.length){toast(T("empty2d"));return;} state.mine.push({name:(state.loaded?L(PATTERNS[state.loaded].name):"Custom")+" ✎",pieces:JSON.parse(JSON.stringify(pieces))}); save(); renderLibraryPane(); toast(T("saved")); };
    c.appendChild(b);
  }

  // AI PANE
  const AI_STAGES = ["analyzing","silhouette","drafting"];
  function renderAIPane() {
    const c = $(".rail-pane[data-pane=ai]"); c.innerHTML="";
    c.appendChild(el("div","section-title",IC.spark+T("aiTitle")));
    c.appendChild(el("div","help-note",T("aiDesc")));

    // inspiration image preview (restored from state if present)
    const preview=el("div","ai-preview"+(aiImage?" show":""));
    if(aiImage) preview.innerHTML=`<img src="${aiImage}" alt=""><button class="ai-x" title="${T('removeImg')}">×</button>`;
    const bindRemove=()=>{ const x=preview.querySelector(".ai-x"); if(x) x.onclick=()=>{ aiImage=null; preview.classList.remove("show"); preview.innerHTML=""; }; };
    bindRemove();

    const f=el("div","field"); f.style.marginTop="12px";
    const ta=el("textarea","textarea"); ta.placeholder=T("aiPlaceholder"); ta.id="aiPrompt"; f.appendChild(ta);

    // hidden file input — the upload button opens a real image picker
    const file=el("input"); file.type="file"; file.accept="image/*"; file.style.display="none";
    file.onchange=()=>{ const im=file.files&&file.files[0]; if(!im) return;
      const r=new FileReader();
      r.onload=()=>{ aiImage=r.result;
        preview.innerHTML=`<img src="${aiImage}" alt=""><button class="ai-x" title="${T('removeImg')}">×</button>`;
        preview.classList.add("show"); bindRemove(); toast(T("aiImageAdded")); };
      r.readAsDataURL(im);
    };
    const up=el("button","big-btn ghost",IC.image+T("aiUpload")); up.style.marginBottom="10px";
    up.onclick=()=>file.click();

    const gen=el("button","big-btn",IC.spark+T("generate"));
    gen.onclick=()=>runAI(ta.value,gen);

    // "thinking" stage checklist — built once, toggled visible during generation
    const statusBox=el("div","ai-status"); statusBox.id="aiStatus";
    const attrsBox=el("div","ai-attrs"); attrsBox.id="aiAttrs"; attrsBox.style.display="none";

    c.appendChild(preview); c.appendChild(f); c.appendChild(file); c.appendChild(up); c.appendChild(gen);
    c.appendChild(statusBox); c.appendChild(attrsBox);
  }
  // Build the 3-step checklist fresh for each run (first label depends on
  // whether an image was supplied) and return a setter to advance it.
  function beginAIThinking(hasImage){
    const box=$("#aiStatus"); if(!box) return ()=>{};
    box.innerHTML="";
    const labelFor = k => k==="analyzing" ? T(hasImage?"aiStageAnalyzing":"aiStageReadingText")
      : k==="silhouette" ? T("aiStageSilhouette") : T("aiStageDrafting");
    AI_STAGES.forEach(k=>{ const row=el("div","ai-stage"); row.dataset.stage=k; row.innerHTML=`<span class="dot"></span><span>${labelFor(k)}</span>`; box.appendChild(row); });
    box.classList.add("show");
    $("#aiAttrs").style.display="none";
    return (key)=>{
      const idx = AI_STAGES.indexOf(key);
      [...box.children].forEach((row,i)=>{
        row.classList.toggle("done", key==="done" || i<idx);
        row.classList.toggle("active", key!=="done" && i===idx);
      });
      if(key==="done") setTimeout(()=>box.classList.remove("show"), 260);
    };
  }
  // Render the bilingual "Detected" attribute chips (type, length, flare,
  // sleeve, neckline, hem, closure, colour) once generation completes —
  // this is the concrete evidence that the image/prompt actually mattered.
  function renderAIAttrs(res){
    const box=$("#aiAttrs"); if(!box) return;
    box.style.display=""; box.innerHTML="";
    const src = res.source==="remote" ? "Claude" : (res.usedImage ? T("usedImageNote") : "");
    box.appendChild(el("div","aa-head",`<span>${T("detected")}</span>${src?`<span>${src}</span>`:""}`));
    (res.attributes||[]).forEach(a=>{
      const row=el("div","aa-row");
      const val = a.swatch ? `<span class="aa-swatch" style="background:${a.value}"></span>${a.value}` : a.value;
      row.innerHTML=`<b>${a.label}</b><span class="aa-val">${val}</span>`;
      box.appendChild(row);
    });
  }
  async function runAI(txt, btn){
    const prompt=(txt||"").trim();
    if(!prompt && !aiImage){ toast(T("aiNeedInput")); return; }
    const orig=btn.innerHTML; btn.innerHTML=IC.spark+T("generating"); btn.style.opacity=".7"; btn.disabled=true;
    const setStage = beginAIThinking(!!aiImage);
    try {
      // Image-driven parametric generation: robust local silhouette analysis
      // (neckline/hem/flare/colour) or a configured Claude-vision endpoint,
      // walked through visibly via setStage so generation feels deliberate.
      const res = await AIGen.generate({
        prompt, imageDataURL: aiImage, category: state.category,
        measurements: currentMeas(), endpoint: (state.aiEndpoint||"").trim(), lang: state.lang,
        onStage: setStage,
      });
      state.loaded = null;
      Canvas.setPattern(res.pieces, res.colors);
      hideEmpty(); renderLayersPane();
      if(state.view==="3d") build3D(res.colorInt);
      renderAIAttrs(res);                         // show what was actually detected, right where the "thinking" ran
      toast(T("generated"));
    } catch(e){ toast(T("importFail")); }
    finally { btn.innerHTML=orig; btn.style.opacity="1"; btn.disabled=false; }
  }

  // EXPORT PANE
  const PAPERS=["A0","A1","A2","A3","A4","Letter","Plotter","Custom"];
  const FORMATS=["PDF","DXF","SVG","AI","PNG","JPEG","HPGL"];
  function renderExportPane() {
    const c = $(".rail-pane[data-pane=export]"); c.innerHTML="";
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
    const ps=el("button","big-btn ghost",IC.printer+T("patternSummary")); ps.style.marginTop="8px"; ps.onclick=()=>exportSummary(); c.appendChild(ps);
    c.appendChild(el("div","help-note",T("patternSummaryD"))).style.marginTop="6px";
    const bo=el("button","big-btn ghost",T("bom")); bo.style.marginTop="10px"; bo.onclick=()=>toast(T("bom")+" ✓"); c.appendChild(bo);
  }

  function doExport(){
    const fmt=($("#fg .opt.active")||{}).dataset?.fmt||"SVG";
    exportAs(fmt);
  }
  // Central exporter used by both the Export pane and the Project menu.
  function exportAs(fmt){
    if(!Canvas.getPieces().length){ toast(T("empty2d")); return; }
    const F=(fmt||"SVG").toUpperCase();
    if(F==="SVG")      download("berrystudio-pattern.svg","image/svg+xml",Canvas.exportSVG());
    else if(F==="DXF") download("berrystudio-pattern.dxf","application/dxf",Canvas.exportDXF());
    else if(F==="PDF"){ const p=Canvas.exportPDF(); if(!p){toast(T("empty2d"));return;} download("berrystudio-pattern.pdf","application/pdf",p); }
    else if(F==="JSON")download("berrystudio-project.json","application/json",JSON.stringify({app:"BerryStudio",version:1,pieces:Canvas.getPieces(),texts:Canvas.getTexts(),points:Canvas.getPoints(),cons:Canvas.getCons(),variables:Canvas.getVariables()},null,0));
    else               download(`berrystudio-pattern.${F.toLowerCase()}`,"image/svg+xml",Canvas.exportSVG()); // PNG/JPEG/AI/HPGL → vector fallback
    toast(T("exported")+" · "+F);
  }
  function download(name,type,data){ const b=new Blob([data],{type}); const u=URL.createObjectURL(b); const a=el("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000); }

  // ---- Project menu actions ----
  function newProject(){
    Canvas.clearAll(); state.loaded=null; aiImage=null;
    showEmpty(); renderLayersPane(); renderAIPane();
    if(state.view==="3d") build3D();
    save(); toast(T("newDone"));
  }
  function importProject(){
    const inp=el("input"); inp.type="file"; inp.accept=".json,application/json";
    inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(!f) return;
      const r=new FileReader();
      r.onload=()=>{ try{
        const data=JSON.parse(r.result);
        const pieces=Array.isArray(data)?data:data.pieces;
        if(Canvas.loadPieces(pieces, data.texts, data.points, data.cons)){ state.loaded=null; hideEmpty(); renderLayersPane();
          Object.entries(data.variables||{}).forEach(([name,formula])=>{ try{ Canvas.setVariable(name, formula); }catch(e){} });
          if(state.view==="3d") build3D(); save(); toast(T("imported")); }
        else toast(T("importFail"));
      }catch(e){ toast(T("importFail")); } };
      r.readAsText(f);
    };
    inp.click();
  }
  function printPattern(){
    const svg=Canvas.exportSVG(); if(!svg){ toast(T("empty2d")); return; }
    const w=window.open("","_blank");
    if(!w){ toast(T("printProject")+": allow pop-ups"); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>BerryStudio — ${state.loaded?L(PATTERNS[state.loaded].name):"Pattern"}</title>
      <style>@page{margin:12mm}body{margin:0;font-family:Inter,sans-serif}svg{width:100%;height:auto}h1{font-size:16px}</style></head>
      <body><h1>BerryStudio</h1>${svg}<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
    w.document.close();
  }
  // ---- lightweight dropdown menu ----
  function projectMenuItems(){ return [
    { icon:IC.newdoc,  label:T("newProject"),    run:newProject },
    { icon:IC.importf, label:T("importProject"), run:importProject },
    "sep",
    { icon:IC.download,label:T("exportSVG"),     run:()=>exportAs("SVG") },
    { icon:IC.download,label:T("exportDXF"),     run:()=>exportAs("DXF") },
    { icon:IC.pdf,     label:T("savePDF"),       run:()=>exportAs("PDF") },
    { icon:IC.folder,  label:T("saveProject"),   run:()=>exportAs("JSON") },
    { icon:IC.printer, label:T("patternSummary"),run:exportSummary },
    "sep",
    { icon:IC.printer, label:T("printProject"),  run:printPattern },
  ]; }
  function openMenu(btn, items){
    closeAnyMenu();
    const m=el("div","menu");
    items.forEach(it=>{
      if(it==="sep"){ m.appendChild(el("div","menu-sep")); return; }
      const mi=el("button","menu-item",`${it.icon||""}<span>${it.label}</span>`);
      mi.onclick=()=>{ closeAnyMenu(); it.run(); };
      m.appendChild(mi);
    });
    document.body.appendChild(m);
    const r=btn.getBoundingClientRect();
    m.style.top=(r.bottom+6)+"px";
    if(document.documentElement.dir==="rtl") m.style.right=(innerWidth-r.right)+"px";
    else m.style.left=r.left+"px";
    requestAnimationFrame(()=>m.classList.add("show"));
    setTimeout(()=>document.addEventListener("pointerdown",onDocDown),0);
  }
  function onDocDown(e){ if(!e.target.closest(".menu")&&!e.target.closest("#projectBtn")) closeAnyMenu(); }
  function closeAnyMenu(){ $$(".menu").forEach(m=>m.remove()); document.removeEventListener("pointerdown",onDocDown); }
  const escAttr = s => String(s??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");

  // ================= TEXT TOOL EDITOR =================
  // Floating formatting panel opened by the canvas (new or edit mode).
  function openTextEditor(req){
    closeTextEditor();
    const it = req.item || { text:"", size:4, bold:false, italic:false, color:rgbToHex(getComputedStyle(document.body).getPropertyValue("--ink").trim()) };
    const box = el("div","text-editor");
    box.innerHTML = `
      <input class="input te-text" placeholder="${T("typeText")}" value="${escAttr(it.text)}">
      <div class="row">
        <label style="font-size:11px;font-weight:700;color:var(--ink-2)">${T("fontSize")}</label>
        <input class="input te-size" type="number" min="1" max="30" value="${it.size||4}" style="width:60px">
        <button class="tbtn te-b ${it.bold?"active":""}" title="${T("boldLbl")}">B</button>
        <button class="tbtn te-i ${it.italic?"active":""}" title="${T("italicLbl")}" style="font-style:italic">I</button>
        <input class="te-col" type="color" value="${rgbToHex(it.color)}" title="${T("pieceColor")}">
      </div>
      <div class="row" style="justify-content:flex-end;gap:8px">
        ${req.item?`<button class="tbtn te-del" title="${T("deleteLbl")}" style="width:auto;padding:0 10px;color:var(--danger)">${T("deleteLbl")}</button>`:""}
        <button class="tbtn te-cancel" style="width:auto;padding:0 10px">${T("cancel")}</button>
        <button class="tbtn te-ok active" style="width:auto;padding:0 14px">${T("okLbl")}</button>
      </div>`;
    document.body.appendChild(box);
    // position near the click, clamped to the viewport
    const r = box.getBoundingClientRect();
    box.style.left = Math.min(Math.max(8, req.cx), innerWidth - r.width - 8) + "px";
    box.style.top  = Math.min(Math.max(8, req.cy + 10), innerHeight - r.height - 8) + "px";
    const q = s => box.querySelector(s);
    let bold = !!it.bold, italic = !!it.italic;
    q(".te-b").onclick = () => { bold = !bold; q(".te-b").classList.toggle("active", bold); };
    q(".te-i").onclick = () => { italic = !italic; q(".te-i").classList.toggle("active", italic); };
    const commit = () => {
      const txt = q(".te-text").value.trim();
      if (!txt) { closeTextEditor(); return; }
      const props = { text: txt, size: Math.max(1, +q(".te-size").value || 4), bold, italic, color: q(".te-col").value };
      if (req.item) Canvas.updateText(req.item.id, props);
      else Canvas.addText({ x: req.wx, y: req.wy, ...props });
      closeTextEditor();
    };
    q(".te-ok").onclick = commit;
    q(".te-cancel").onclick = closeTextEditor;
    if (req.item) q(".te-del").onclick = () => { Canvas.removeText(req.item.id); closeTextEditor(); };
    q(".te-text").addEventListener("keydown", e => { if (e.key === "Enter") commit(); if (e.key === "Escape") closeTextEditor(); });
    q(".te-text").focus(); q(".te-text").select();
  }
  function closeTextEditor(){ $$(".text-editor").forEach(x=>x.remove()); }

  // ================= CONSTRUCTION POPOVERS =================
  // Position any floating panel near a click point, clamped to the viewport.
  function placeFloating(box, cx, cy){
    document.body.appendChild(box);
    const r = box.getBoundingClientRect();
    box.style.left = Math.min(Math.max(8, cx), innerWidth - r.width - 8) + "px";
    box.style.top  = Math.min(Math.max(8, cy + 10), innerHeight - r.height - 8) + "px";
  }

  // Rename a construction point and/or give it a live formula for X/Y.
  function openPointEditor(req){
    closeTextEditor();
    const p = req.point;
    const box = el("div","text-editor");
    box.innerHTML = `
      <input class="input pe-name" placeholder="${T("pointName")}" value="${escAttr(p.name)}">
      <div class="row">
        <input class="input pe-x" placeholder="${T("pointX")}" value="${escAttr(p.xExpr||(+p.x.toFixed(2)))}" style="width:50%">
        <input class="input pe-y" placeholder="${T("pointY")}" value="${escAttr(p.yExpr||(+p.y.toFixed(2)))}" style="width:50%">
      </div>
      <div class="help-note" style="margin:0">${T("formulaHint")}</div>
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="tbtn pe-del" title="${T("deletePoint")}" style="width:auto;padding:0 10px;color:var(--danger)">${T("deleteLbl")}</button>
        <button class="tbtn pe-cancel" style="width:auto;padding:0 10px">${T("cancel")}</button>
        <button class="tbtn pe-ok active" style="width:auto;padding:0 14px">${T("okLbl")}</button>
      </div>`;
    placeFloating(box, req.cx, req.cy);
    const q = s => box.querySelector(s);
    const commit = () => {
      const name = q(".pe-name").value.trim() || p.name;
      Canvas.setPointName(p.id, name);
      const r = Canvas.setPointFormula(p.id, q(".pe-x").value.trim(), q(".pe-y").value.trim());
      if (!r.ok){ toast(T("invalidFormula")+": "+r.error); return; }
      closeTextEditor(); renderMeasurePane();
    };
    q(".pe-ok").onclick = commit;
    q(".pe-cancel").onclick = closeTextEditor;
    q(".pe-del").onclick = () => { Canvas.removePoint(p.id); closeTextEditor(); };
    box.addEventListener("keydown", e => { if (e.key==="Enter") commit(); if (e.key==="Escape") closeTextEditor(); });
    q(".pe-name").focus(); q(".pe-name").select();
  }

  // Name prompt shown when a construction-point loop is closed with the
  // "Create Pattern Piece" tool — confirming snapshots it into a real piece.
  function openPromotePrompt(outlinePts){
    closeTextEditor();
    const box = el("div","text-editor");
    box.innerHTML = `
      <div class="help-note" style="margin:0">${T("promoteHint").replace("{n}", outlinePts.length)}</div>
      <input class="input pp-en" dir="ltr" placeholder="${T("nameEn")}">
      <input class="input pp-ar" dir="rtl" placeholder="${T("nameAr")}">
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="tbtn pp-cancel" style="width:auto;padding:0 10px">${T("cancel")}</button>
        <button class="tbtn pp-ok active" style="width:auto;padding:0 14px">${T("promoteBtn")}</button>
      </div>`;
    placeFloating(box, innerWidth/2 - 130, innerHeight/3);
    const q = s => box.querySelector(s);
    const cancel = () => { Canvas.cancelPromote(); closeTextEditor(); };
    const commit = () => {
      const en = q(".pp-en").value.trim() || "New Piece", ar = q(".pp-ar").value.trim() || "قطعة جديدة";
      Canvas.finishPromotePiece(en, ar); closeTextEditor(); hideEmpty(); renderLayersPane();
      toast(T("promoted")+" · "+en);
    };
    q(".pp-ok").onclick = commit; q(".pp-cancel").onclick = cancel;
    box.addEventListener("keydown", e => { if (e.key==="Enter") commit(); if (e.key==="Escape") cancel(); });
    q(".pp-en").focus();
  }

  // Two-point calibration for the trace-over background image: asks for the
  // real-world distance (cm) between the two points the user just clicked.
  function openCalibPrompt(measuredDist){
    closeTextEditor();
    const box = el("div","text-editor");
    box.innerHTML = `
      <div class="help-note" style="margin:0">${T("calibHint")}</div>
      <input class="input cb-dist" type="number" min="0.1" step="0.1" placeholder="${T("realDistance")}">
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="tbtn cb-cancel" style="width:auto;padding:0 10px">${T("cancel")}</button>
        <button class="tbtn cb-ok active" style="width:auto;padding:0 14px">${T("applyCalib")}</button>
      </div>`;
    placeFloating(box, innerWidth/2 - 130, innerHeight/3);
    const q = s => box.querySelector(s);
    const commit = () => {
      const cm = +q(".cb-dist").value;
      if (cm>0){ Canvas.applyCalibration(cm, measuredDist); toast(T("calibDone")); }
      closeTextEditor(); setTool("select");
    };
    q(".cb-ok").onclick = commit; q(".cb-cancel").onclick = ()=>{ closeTextEditor(); setTool("select"); };
    box.addEventListener("keydown", e => { if (e.key==="Enter") commit(); if (e.key==="Escape") closeTextEditor(); });
    q(".cb-dist").focus();
  }

  // Trace-over background image: import / opacity / show-hide / calibrate / remove.
  let bgVisible = true;
  function openBgPanel(){
    closeTextEditor();
    const has = Canvas.hasBackground();
    const box = el("div","text-editor");
    if (!has){
      box.innerHTML = `
        <div class="help-note" style="margin:0">${T("bgImage")}</div>
        <button class="tbtn bg-import active" style="width:auto;padding:0 14px">${T("bgImport")}</button>
        <div class="row" style="justify-content:flex-end">
          <button class="tbtn bg-close" style="width:auto;padding:0 10px">${T("close")}</button>
        </div>`;
      placeFloating(box, innerWidth/2 - 130, 90);
      const file=el("input"); file.type="file"; file.accept="image/*"; file.style.display="none";
      file.onchange=()=>{ const im=file.files&&file.files[0]; if(!im) return;
        const r=new FileReader();
        r.onload=async ()=>{ const ok=await Canvas.setBackgroundImage(r.result); if(ok){ bgVisible=true; $("#bgBtn").classList.add("active"); closeTextEditor(); openBgPanel(); } };
        r.readAsDataURL(im);
      };
      box.appendChild(file);
      box.querySelector(".bg-import").onclick=()=>file.click();
      box.querySelector(".bg-close").onclick=closeTextEditor;
      return;
    }
    box.innerHTML = `
      <div class="row"><label style="flex:1">${T("bgOpacity")}</label><input class="range bg-op" type="range" min="0.1" max="1" step="0.05" value="${Canvas.getBgOpacity()}" style="flex:2"></div>
      <div class="row"><label style="flex:1">${T("bgShow")}</label><input class="bg-show" type="checkbox" ${bgVisible?"checked":""}></div>
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button class="tbtn bg-remove" style="width:auto;padding:0 10px;color:var(--danger)">${T("bgRemove")}</button>
        <button class="tbtn bg-calib active" style="width:auto;padding:0 12px">${T("bgCalibrate")}</button>
        <button class="tbtn bg-close" style="width:auto;padding:0 10px">${T("close")}</button>
      </div>`;
    placeFloating(box, innerWidth/2 - 130, 90);
    box.querySelector(".bg-op").oninput = e => Canvas.setBgOpacity(+e.target.value);
    box.querySelector(".bg-show").onchange = e => { bgVisible=e.target.checked; Canvas.setBgVisible(bgVisible); };
    box.querySelector(".bg-remove").onclick = () => { Canvas.removeBackground(); $("#bgBtn").classList.remove("active"); closeTextEditor(); };
    box.querySelector(".bg-calib").onclick = () => { closeTextEditor(); setTool("calib"); toast(T("calibHint")); };
    box.querySelector(".bg-close").onclick = closeTextEditor;
  }

  // ================= HELP =================
  function openHelp(){
    const tools = ["select","pen","line","arc","free","symmetry","knife","move","rotate","scale","measure","text","seam","notch","grain"];
    let html = `<h3 style="margin-bottom:8px">${T("helpQuick")}</h3><ol style="padding-inline-start:20px;font-size:13px;line-height:1.7;color:var(--ink-2)">`;
    html += `<li>${T("helpQ1")}</li><li>${T("helpQ2")}</li><li>${T("helpQ3")}</li></ol>`;
    html += `<h3 style="margin:18px 0 8px">${T("helpTools")}</h3><table style="width:100%;border-collapse:collapse;font-size:12.5px">`;
    tools.forEach(k=>{ html += `<tr><td style="padding:6px 8px;border-bottom:1px solid var(--line-2);font-weight:700;white-space:nowrap">${T("t_"+k)}</td><td style="padding:6px 8px;border-bottom:1px solid var(--line-2);color:var(--ink-2)">${T("tt_"+k)}</td></tr>`; });
    html += `</table><h3 style="margin:18px 0 8px">${T("helpShortcuts")}</h3><table style="width:100%;border-collapse:collapse;font-size:12.5px">`;
    [["V P L A M R S T", T("sc_tools")], ["Ctrl+Z / Ctrl+Shift+Z", T("sc_undo")], ["Ctrl+K", T("sc_cmd")], ["Esc", T("sc_esc")]]
      .forEach(([k,d])=>{ html += `<tr><td style="padding:6px 8px;border-bottom:1px solid var(--line-2)"><code style="background:var(--panel-2);border:1px solid var(--line);border-radius:6px;padding:2px 7px;font-weight:700">${k}</code></td><td style="padding:6px 8px;border-bottom:1px solid var(--line-2);color:var(--ink-2)">${d}</td></tr>`; });
    html += "</table>";
    openModal(T("helpTitle"), html, true);
  }
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

  // ================= PATTERN SUMMARY (one-page, print-ready) =================
  // A condensed bilingual sheet — size table + a small labelled diagram per
  // piece with width/height call-outs + a construction note. Distinct from
  // the full Tech Pack: this is meant to be printed or saved as a single PDF.
  function pieceBBox(outline){
    const xs=outline.map(p=>p[0]), ys=outline.map(p=>p[1]);
    return { minX:Math.min(...xs), minY:Math.min(...ys), maxX:Math.max(...xs), maxY:Math.max(...ys) };
  }
  function dimLineH(x1,x2,y,val,fs,sw){
    const a=fs*0.6, mid=(x1+x2)/2;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#333" stroke-width="${sw}"/>
      <line x1="${x1}" y1="${y-a}" x2="${x1}" y2="${y+a}" stroke="#333" stroke-width="${sw}"/>
      <line x1="${x2}" y1="${y-a}" x2="${x2}" y2="${y+a}" stroke="#333" stroke-width="${sw}"/>
      <rect x="${mid-fs*1.6}" y="${y+fs*0.35}" width="${fs*3.2}" height="${fs*1.15}" fill="#fff" opacity="0.85"/>
      <text x="${mid}" y="${y+fs*1.25}" font-size="${fs}" text-anchor="middle" fill="#222">${val.toFixed(1)}cm</text>`;
  }
  function dimLineV(y1,y2,x,val,fs,sw){
    const a=fs*0.6, mid=(y1+y2)/2;
    return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#333" stroke-width="${sw}"/>
      <line x1="${x-a}" y1="${y1}" x2="${x+a}" y2="${y1}" stroke="#333" stroke-width="${sw}"/>
      <line x1="${x-a}" y1="${y2}" x2="${x+a}" y2="${y2}" stroke="#333" stroke-width="${sw}"/>
      <text x="${x+fs*1.3}" y="${mid}" font-size="${fs}" text-anchor="middle" fill="#222" transform="rotate(-90 ${x+fs*1.3} ${mid})">${val.toFixed(1)}cm</text>`;
  }
  function pieceDiagramSVG(p){
    const b=pieceBBox(p.outline), w=b.maxX-b.minX||1, h=b.maxY-b.minY||1;
    const pad=Math.max(w,h)*0.14+2, rp=pad+Math.max(w,h)*0.22, bp=pad+Math.max(w,h)*0.16;
    const vbX=b.minX-pad, vbY=b.minY-pad, vbW=w+pad+rp, vbH=h+pad+bp;
    const pts=p.outline.map(pt=>pt.join(",")).join(" ");
    const col=p.color||"#6d5efc", fs=Math.max(w,h)*0.055, sw=Math.max(w,h)*0.01;
    let s=`<svg viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="100%" height="168" preserveAspectRatio="xMidYMid meet">`;
    s+=`<polygon points="${pts}" fill="${col}" fill-opacity="0.14" stroke="${col}" stroke-width="${sw}"/>`;
    (p.grain&&p.grain.length===2? [p.grain] : []).forEach(g=>{
      s+=`<line x1="${g[0][0]}" y1="${g[0][1]}" x2="${g[1][0]}" y2="${g[1][1]}" stroke="${col}" stroke-width="${sw*0.8}" stroke-dasharray="${sw*2},${sw}"/>`;
    });
    s+=dimLineH(b.minX,b.maxX,b.maxY+pad*0.55,w,fs,sw);
    s+=dimLineV(b.maxY,b.minY,b.maxX+pad*0.55,h,fs,sw);
    return s+"</svg>";
  }
  function buildSummaryHTML(){
    const pieces=Canvas.getPieces(); const m=currentMeas();
    const nameObj = state.loaded ? PATTERNS[state.loaded].name : { en:T("customPattern"), ar:T("customPattern") };
    const descObj = state.loaded ? PATTERNS[state.loaded].desc : null;
    const sizeLbl = state.kids ? L(KIDS_AGES.find(a=>a.id===state.kids).label) : state.size;
    const seamCm = Canvas.getOpt("seamCm");
    const rows=[["m_chest","chest"],["m_waist","waist"],["m_hips","hips"],["m_shoulder","shoulder"],["m_sleeve","sleeve"]];
    const rtl = state.lang==="ar";
    const piecesHTML = pieces.map((p,i)=>`
      <div class="sp-box">
        <div class="sp-head"><span class="sp-num">${i+1}</span><span class="sp-name">${p.name.en}</span><span class="sp-name-ar">${p.name.ar}</span></div>
        ${pieceDiagramSVG(p)}
      </div>`).join("");
    return `<!doctype html><html lang="${state.lang}" dir="${rtl?"rtl":"ltr"}"><head><meta charset="utf-8">
<title>BerryStudio — ${nameObj.en} · ${T("patternSummary")}</title>
<style>
  @page{margin:14mm}
  *{box-sizing:border-box}
  body{font-family:${rtl?"'Cairo','Segoe UI'":"'Segoe UI'"},Tahoma,Arial,sans-serif;color:#1a1a1a;margin:0;padding:22px;background:#fff}
  h1{font-size:21px;margin:0 0 3px}
  h1 span{color:#8a8a8a;font-weight:600;font-size:16px}
  .sub{font-size:13px;color:#666;margin:0 0 16px}
  .top{display:grid;grid-template-columns:1.1fr 1fr;gap:16px;margin-bottom:20px;align-items:start}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border:1px solid #ddd;padding:7px 10px;text-align:center}
  th{background:#f1eeff;font-weight:700}
  .refbox{font-size:12.5px;color:#444;line-height:1.7;border:1px solid #eee;border-radius:10px;padding:12px;background:#fafafa;height:100%}
  .refbox b{display:block;font-size:13.5px;margin-bottom:4px;color:#111}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
  .sp-box{border:1px solid #ddd;border-radius:10px;padding:10px;background:#fcfcfc}
  .sp-head{display:flex;align-items:center;gap:7px;margin-bottom:6px;font-weight:700;font-size:12.5px;flex-wrap:wrap}
  .sp-num{width:20px;height:20px;flex:none;border-radius:50%;background:#6d5efc;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px}
  .sp-name-ar{color:#6d5efc;font-weight:600}
  .note{margin-top:20px;border:1px dashed #c9a94a;background:#fff8e6;padding:11px 15px;border-radius:9px;font-size:12.5px;color:#7a5c00;line-height:1.6}
  .pbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:14px}
  .pbar button{font-family:inherit;font-size:13px;font-weight:700;padding:9px 16px;border-radius:8px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer}
  .pbar button.primary{background:#6d5efc;color:#fff;border-color:#6d5efc}
  @media print{.pbar{display:none}}
</style></head>
<body>
  <div class="pbar"><button onclick="window.close()">${T("close")}</button><button class="primary" onclick="window.print()">${T("printNow")}</button></div>
  <h1>${nameObj.en} <span>/ ${nameObj.ar}</span></h1>
  <p class="sub">BerryStudio · ${T("gradedTo")}: ${sizeLbl} · ${T("std_"+state.standard)}</p>
  <div class="top">
    <table>
      <tr><th>${T("tab_measure")}</th><th>cm</th></tr>
      ${rows.map(([lk,mk])=>`<tr><td>${T(lk)}</td><td>${m[mk]}</td></tr>`).join("")}
    </table>
    <div class="refbox"><b>${nameObj.en} / ${nameObj.ar}</b>${descObj?L(descObj):""}</div>
  </div>
  <div class="grid">${piecesHTML}</div>
  <div class="note">${T("summaryNote").replace("{n}",seamCm)}</div>
</body></html>`;
  }
  function exportSummary(){
    if(!Canvas.getPieces().length){ toast(T("empty2d")); return; }
    const w=window.open("","_blank");
    if(!w){ toast(T("patternSummary")+": allow pop-ups"); return; }
    w.document.write(buildSummaryHTML()); w.document.close();
    toast(T("exported")+" · "+T("patternSummary"));
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
    Canvas.recomputeConstruction();   // re-resolve any formula-driven construction points to the new measurements
    updateGradeLbl(); updateStageChips(); save();
  }

  // ================= 3D =================
  function colorToInt(c){
    if(!c) return cssHex("--brand");
    if(c[0]==="#"){ const h=c.length===4 ? c.slice(1).split("").map(x=>x+x).join("") : c.slice(1); return parseInt(h,16); }
    const m=/(\d+)\D+(\d+)\D+(\d+)/.exec(c); return m ? (+m[1]<<16)|(+m[2]<<8)|+m[3] : cssHex("--brand");
  }
  const fabricOpacity3D = () => Math.max(0.5, Math.min(1, 0.62 + Canvas.getOpt("fillOpacity")*0.6));
  function pieceVisMap(){ return Canvas.getPieces().map(p=>({ key:(p.name&&p.name.en)||"", visible:p.visible!==false })); }
  function build3D(colorInt){
    const m=currentMeas(); const pieces=Canvas.getPieces();
    const fv=pieces.find(p=>p.visible!==false);
    View3D.build(state.category, m, {
      color: colorInt!=null ? colorInt : (fv ? colorToInt(fv.color) : cssHex("--brand")),
      material: state.fabric3d || "cotton", opacity: fabricOpacity3D(), pieces: pieceVisMap(),
    });
  }
  // live 3D updates (no full rebuild)
  function sync3DFabric(){ if(state.view!=="3d") return; const fv=Canvas.getPieces().find(p=>p.visible!==false);
    View3D.setFabric({ color: fv?colorToInt(fv.color):undefined, material: state.fabric3d, opacity: fabricOpacity3D() }); }
  function sync3DVisibility(){ if(state.view!=="3d") return; View3D.setPieceVisibility(pieceVisMap()); }
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
    // AI endpoint (optional Claude-vision proxy)
    const aif=el("div","field"); aif.style.marginTop="14px";
    aif.innerHTML=`<label>${T("aiEndpoint")}</label>`;
    const aiin=el("input","input"); aiin.type="url"; aiin.placeholder="https://your-proxy.example/generate";
    aiin.value=state.aiEndpoint||""; aiin.oninput=()=>{ state.aiEndpoint=aiin.value.trim(); save(); };
    aif.appendChild(aiin); aif.appendChild(el("div","help-note",T("aiEndpointD"))); body.appendChild(aif);
    // 3D avatar models — paste a GLB URL per category (e.g. Ready Player Me)
    const av = el("div","field"); av.style.marginTop="14px";
    av.innerHTML = `<label>${T("avatarModels")}</label>`;
    ["women","men","girls","boys"].forEach(cat=>{
      const wrap = el("div"); wrap.style.cssText="display:flex;align-items:center;gap:8px;margin-bottom:6px";
      wrap.appendChild(el("span",null,T(cat))).style.cssText="font-size:12px;font-weight:700;min-width:52px";
      const inp = el("input","input"); inp.type="url"; inp.dir="ltr";
      inp.placeholder="https://models.readyplayer.me/….glb";
      inp.value = (state.avatarGLB && state.avatarGLB[cat]) || "";
      inp.onchange = () => {
        state.avatarGLB = state.avatarGLB || {};
        state.avatarGLB[cat] = inp.value.trim(); save();
        View3D.setAvatarURL(cat, inp.value.trim() || null);
        if (state.view === "3d" && state.category === cat) build3D();
        toast("✓ " + T(cat));
      };
      wrap.appendChild(inp); av.appendChild(wrap);
    });
    av.appendChild(el("div","help-note",T("avatarModelsD")));
    body.appendChild(av);
    const rb=el("button","big-btn ghost",T("resetOnb")); rb.style.marginTop="16px"; rb.onclick=()=>{closeModal("#settingsModal");startOnboarding();}; body.appendChild(rb);
    const ib=el("button","big-btn",IC.download+T("installApp")); ib.style.marginTop="8px"; ib.onclick=installApp; body.appendChild(ib);
    $("#settingsModal").classList.add("show");
  }

  // ================= COMMAND PALETTE =================
  let cmdSel=0, cmdItems=[];
  function commands(){ return [
    {t:T("helpTitle"),i:IC.question,run:openHelp},
    {t:T("addLayer"),i:IC.layers,run:()=>{Canvas.addPiece({en:I18N.en.newLayer,ar:I18N.ar.newLayer});hideEmpty();renderLayersPane();showPane("layers");}},
    {t:T("newProject"),i:IC.newdoc,run:newProject},
    {t:T("importProject"),i:IC.importf,run:importProject},
    {t:T("savePDF"),i:IC.pdf,run:()=>exportAs("PDF")},
    {t:T("exportDXF"),i:IC.download,run:()=>exportAs("DXF")},
    {t:T("printProject"),i:IC.printer,run:printPattern},
    {t:T("patternSummary"),i:IC.printer,run:exportSummary},
    {t:T("undoLbl"),i:IC.undo,run:()=>{Canvas.doUndo();renderLayersPane();sync3DVisibility();}},
    {t:T("redoLbl"),i:IC.redo,run:()=>{Canvas.doRedo();renderLayersPane();sync3DVisibility();}},
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
  // default gradient hero (shirt mark) used on tutorial steps 2-4
  const ONB_HERO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M8 2l4 3 4-3 5 4-3 4v11H6V10L3 6z"/></svg>';
  function setOnbHero(){
    const hero=$("#onbHero"); if(!hero) return;
    if(onbStep===0){
      // Intro tutorial screen → Berry Academy photo. Prefers a real photo
      // (icons/intro.png / .jpg) if one is dropped in; otherwise uses the
      // bundled branded recreation (icons/intro.svg).
      hero.classList.add("photo"); hero.innerHTML="";
      const img=el("img","onb-photo"); img.alt="Berry Academy";
      const sources=["icons/intro.png","icons/intro.jpg","icons/intro.svg"];
      let si=0;
      const tryNext=()=>{ if(si>=sources.length){ hero.classList.remove("photo"); hero.innerHTML=ONB_HERO_SVG; return; } img.src=sources[si++]+"?v=1"; };
      img.onerror=tryNext; tryNext();
      hero.appendChild(img);
    } else { hero.classList.remove("photo"); hero.innerHTML=ONB_HERO_SVG; }
  }
  function renderOnb(){
    const [t,b]=ONB[onbStep];
    setOnbHero();
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
    if(meta&&(e.key==="y"||(e.shiftKey&&e.key.toLowerCase()==="z"))){e.preventDefault();Canvas.doRedo();renderLayersPane();return;}
    if($("#cmdModal").classList.contains("show")){
      if(e.key==="ArrowDown"){e.preventDefault();cmdSel=Math.min(cmdItems.length-1,cmdSel+1);hiCmd();}
      if(e.key==="ArrowUp"){e.preventDefault();cmdSel=Math.max(0,cmdSel-1);hiCmd();}
      if(e.key==="Enter"&&cmdItems[cmdSel]){cmdItems[cmdSel].run();closeModal("#cmdModal");}
      if(e.key==="Escape")closeModal("#cmdModal");
      return;
    }
    if(e.key==="Escape"){ $$(".overlay.show").forEach(o=>o.classList.remove("show")); closeAnyMenu(); closeTextEditor(); }
    // tool shortcuts
    const map={v:"select",p:"pen",l:"line",a:"arc",m:"measure",r:"rotate",s:"scale",t:"text"};
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
    $("#projectBtn").onclick=(e)=>{ e.stopPropagation(); openMenu($("#projectBtn"), projectMenuItems()); }; tip($("#projectBtn"),T("project"),T("projectMenu"));
    $("#cmdBtn").onclick=openCmd; tip($("#cmdBtn"),T("cmd")||"⌘K",T("tt_cmd"));
    $("#themeBtn").onclick=openThemePicker; tip($("#themeBtn"),T("theme"),T("tt_theme"));
    $("#langBtn").onclick=toggleLang; tip($("#langBtn"),T("language"),T("tt_lang"));
    $("#modeBtn").onclick=toggleMode; tip($("#modeBtn"),T("appearance"),T("tt_mode"));
    $("#settingsBtn").onclick=openSettings; tip($("#settingsBtn"),T("settings"),T("tt_settings"));
    $("#helpBtn").onclick=openHelp; tip($("#helpBtn"),T("help"),T("helpTitle"));
    $("#installBtn").onclick=installApp;
    $("#unitsPill").onclick=()=>{state.unitsCm=!state.unitsCm;Canvas.setOpt("unitsCm",state.unitsCm);save();updateUnitsPill();updateStageChips();};
    tip($("#unitsPill"),T("tab_measure"),T("tt_units"));
    // grid/snap in stage toolbar
    $("#undoBtn").onclick=()=>{Canvas.doUndo();renderLayersPane();sync3DVisibility();}; tip($("#undoBtn"),T("undoLbl"),T("tt_undo"));
    $("#redoBtn").onclick=()=>{Canvas.doRedo();renderLayersPane();sync3DVisibility();}; tip($("#redoBtn"),T("redoLbl"),T("tt_redo"));
    $("#gridBtn").onclick=()=>{const v=!Canvas.getOpt("grid");Canvas.setOpt("grid",v);$("#gridBtn").classList.toggle("active",v);}; tip($("#gridBtn"),T("t_line"),T("tt_grid"));
    $("#snapBtn").onclick=()=>{const v=!Canvas.getOpt("snap");Canvas.setOpt("snap",v);$("#snapBtn").classList.toggle("active",v);}; tip($("#snapBtn"),"Snap",T("tt_snap"));
    $("#bgBtn").onclick=()=>openBgPanel(); tip($("#bgBtn"),T("bgImage"),T("tt_bgImage"));
    $("#bgBtn").classList.toggle("active",Canvas.hasBackground());
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
    View3D.setLoadingCallback(v => { const o=$("#v3dLoading"); if(o) o.classList.toggle("show", v); });
    // photoreal GLB avatars saved in Settings (per category)
    Object.entries(state.avatarGLB || {}).forEach(([cat,url]) => { if(url) View3D.setAvatarURL(cat, url); });
    Canvas.onTextRequest(openTextEditor);
    Canvas.setMeasureProvider(()=>currentMeas());
    Canvas.onPointRequest(openPointEditor);
    Canvas.onPromoteRequest(openPromotePrompt);
    Canvas.onCalibrationRequest(openCalibPrompt);
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
