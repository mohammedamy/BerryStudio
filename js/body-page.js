/* ============================================================
   BerryStudio-Upgrade-Plan WP-10 — BodyForm (body.html) controller.
   A standalone, build-free page: pick a category + starting size,
   fine-tune measurements (js/measure-form.js, shared with the main
   app's Measures pane), and preview the resulting avatar via
   cloth-lab's embedded engine (bodyOnly mode — no garment/cloth UI).
   "Open in Fit Studio" hands the same category+measurements to
   index.html via js/body-handoff.js.
   ============================================================ */
import { I18N } from './i18n.js';
import { SIZES, KIDS_AGES, computeMeasurements } from './data.js';
import { getMannequinsByCategory, getMannequinFor, isActiveMannequinSize, normalizeMannequinSize, resolveMannequinMeasurements, toPatternSize } from './mannequin-catalog.js';
import { resolveMannequinStyling } from './mannequin-styling.js';
import { renderMeasureFields } from './measure-form.js';
import { saveBodyFormHandoff, HANDOFF_URL_FLAG } from './body-handoff.js';

(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

  // Reuse the main app's persisted lang/theme/mode (shared localStorage
  // key, read-only here) so BodyForm visually matches whatever the user
  // last chose in the main app — it offers no theme/lang switcher of its
  // own, deliberately: this is a single-purpose companion page, not a
  // second copy of the main app's shell.
  const saved = JSON.parse(localStorage.getItem("pps") || "{}");
  const lang = saved.lang || "en";
  const theme = saved.theme || "intl";
  const mode = saved.mode || "light";
  const T = (k) => (I18N[lang][k] ?? I18N.en[k] ?? k);
  const L = (o) => (o ? (o[lang] ?? o.en) : "");

  document.documentElement.lang = lang;
  document.documentElement.dir = I18N[lang].dir;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-mode", mode);
  document.body.setAttribute("data-theme", theme);
  document.body.setAttribute("data-mode", mode);
  $$('[data-i18n]').forEach((e) => { e.textContent = T(e.dataset.i18n); });
  $$('[data-i18n-title]').forEach((e) => { e.title = T(e.dataset.i18nTitle); });

  // ---- form state ----
  let category = "women", standard = "intl", size = "M", kids = null, custom = {};
  let showDiagram = false;

  function currentMeas() {
    if (!kids && isActiveMannequinSize(size)) {
      return resolveMannequinMeasurements(category, size, { standard, custom });
    }
    return computeMeasurements({ category, size, standard, kids, custom });
  }

  function renderCatSeg() {
    $$("#catSeg button").forEach((b) => b.classList.toggle("active", b.dataset.cat === category));
  }
  function renderStandardSel() {
    const sel = $("#standardSel");
    sel.innerHTML = "";
    [["intl", T("std_intl")], ["egypt", T("std_egypt")], ["saudi", T("std_saudi")]].forEach(([v, n]) => {
      const o = el("option", null, n); o.value = v; if (standard === v) o.selected = true; sel.appendChild(o);
    });
  }
  function renderMannequinGrid() {
    const g = $("#mannequinGrid");
    if (!g) return;
    g.innerHTML = "";
    const activeNorm = normalizeMannequinSize(size);
    getMannequinsByCategory(category).forEach((mq) => {
      const active = activeNorm === mq.size && !kids;
      const b = el("button", "size-btn" + (active ? " active" : ""), `${mq.size} · ${mq.measurements.height}`);
      b.title = `${L(mq.name)} (${L(mq.buildLabel)}, ${mq.measurements.height} cm)`;
      b.onclick = () => { size = toPatternSize(mq.size); kids = null; custom = {}; refreshAll(); };
      g.appendChild(b);
    });
  }
  function renderSizeGrid() {
    const g = $("#sizeGrid"); g.innerHTML = "";
    SIZES.forEach((s) => {
      const b = el("button", "size-btn" + (size === s && !kids ? " active" : ""), s);
      b.onclick = () => { size = s; kids = null; refreshAll(); };
      g.appendChild(b);
    });
  }
  function renderKidsGrid() {
    const g = $("#kidsGrid"); g.innerHTML = "";
    KIDS_AGES.forEach((a) => {
      const b = el("button", "size-btn" + (kids === a.id ? " active" : ""), L(a.label));
      b.onclick = () => { kids = kids === a.id ? null : a.id; refreshAll(); };
      g.appendChild(b);
    });
  }
  function renderMeasure() {
    const mqSize = isActiveMannequinSize(size) ? normalizeMannequinSize(size) : "M";
    renderMeasureFields($("#measureFields"), {
      measurements: currentMeas(), T,
      category,
      mannequin: getMannequinFor(category, mqSize),
      lang,
      showDiagram,
      onToggleDiagram: (v) => { showDiagram = v; },
      onFieldChange: (k, v) => { custom[k] = v; mountOrUpdateAvatar(); },
    });
  }
  function refreshAll() {
    renderCatSeg(); renderStandardSel(); renderMannequinGrid(); renderSizeGrid(); renderKidsGrid(); renderMeasure();
    mountOrUpdateAvatar();
  }

  $$("#catSeg button").forEach((b) => { b.onclick = () => { category = b.dataset.cat; custom = {}; refreshAll(); }; });
  $("#standardSel").onchange = () => { standard = $("#standardSel").value; refreshAll(); };
  $("#generateBtn").onclick = () => { mountOrUpdateAvatar(); };
  $("#openFitBtn").onclick = () => {
    saveBodyFormHandoff({
      category,
      size,
      mannequinSize: isActiveMannequinSize(size) ? normalizeMannequinSize(size) : null,
      measurements: currentMeas(),
    });
    location.href = `index.html?${HANDOFF_URL_FLAG}=1`;
  };

  // ---- cloth-lab embedded avatar preview (bodyOnly) ----
  // Same dynamic-import + assetBase pattern as js/app.js's own
  // mountClothLabEmbedded() — relative to THIS module's own URL so it
  // resolves correctly whether served from the domain root (local dev) or
  // a GitHub Pages subpath (production), not location.origin.
  let clothLabEmbedModule = null;
  let clothLabEmbedLoadPromise = null;
  function buildBodyPayload() {
    const mqSize = isActiveMannequinSize(size) ? normalizeMannequinSize(size) : "M";
    const mq = getMannequinFor(category, mqSize);
    const styling = resolveMannequinStyling(category, mq, saved?.mannequinStyling?.[category]);
    return {
      category,
      mannequinSize: mq.size,
      mannequin: {
        id: mq.id,
        category: mq.category,
        size: mq.size,
        skinHex: mq.skinHex,
        hairHex: styling.hairHex,
        hairColor: styling.hairColor,
        hairStyle: styling.hairStyle,
        hairType: styling.hairType,
        hairLength: styling.hairLength,
        hairHighlight: styling.hairHighlight,
        headwear: styling.headwear,
        headwearHex: styling.headwearHex,
        headwearColor: styling.headwearColor,
        headwearFabric: styling.headwearFabric,
        headwearLength: styling.headwearLength,
        undercapHex: styling.undercapHex,
        undercapColor: styling.undercapColor,
        niqabEyeScreen: styling.niqabEyeScreen,
        morph: mq.morph,
      },
      measurements: currentMeas(),
      pieces: [],
    };
  }
  function mountClothLabEmbedded() {
    if (clothLabEmbedLoadPromise) return clothLabEmbedLoadPromise;
    const container = $("#clothLabEmbed");
    const embedUrl = new URL("../cloth-lab/dist-embed/cloth-lab-embed.js", import.meta.url).href;
    const assetBase = new URL("../cloth-lab/dist-embed/", import.meta.url).href;
    clothLabEmbedLoadPromise = import(/* @vite-ignore */ embedUrl).then((mod) => {
      clothLabEmbedModule = mod.mount(container, {
        assetBase, bodyOnly: true,
        pattern: buildBodyPayload(),
      });
    }).catch((err) => {
      console.error("BodyForm: Cloth Lab embed failed to load:", err);
      clothLabEmbedLoadPromise = null; // allow a retry on the next change
    });
    return clothLabEmbedLoadPromise;
  }
  // No garment ever exists in bodyOnly mode, so — unlike js/app.js's own
  // syncClothLab() — the payload is small enough to just always resend on
  // a genuine change rather than needing a "has cloth-lab confirmed ready
  // yet" handshake: mount()'s own initial pattern already covers the first
  // paint, and update() is a no-op if called before mount() resolves.
  let lastPayloadJSON = null;
  function mountOrUpdateAvatar() {
    const payload = buildBodyPayload();
    const json = JSON.stringify(payload);
    if (json === lastPayloadJSON) return;
    lastPayloadJSON = json;
    if (!clothLabEmbedModule) { mountClothLabEmbedded(); return; }
    clothLabEmbedModule.update({ pattern: payload, bodyOnly: true });
  }

  // First call: lastPayloadJSON starts null, so mountOrUpdateAvatar()
  // always proceeds and (since clothLabEmbedModule is also still null)
  // triggers the initial mountClothLabEmbedded() itself — no separate
  // bootstrap call needed.
  refreshAll();
})();
