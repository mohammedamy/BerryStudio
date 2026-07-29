/* ============================================================
   Shared measurement-input UI (BerryStudio-Upgrade-Plan WP-10) —
   the numeric fields + reference diagram used by both the main
   app's Measures pane (js/app.js) and the standalone BodyForm
   page (body.html). Framework-free, DOM-only, no dependency on
   js/app.js's own state/Canvas — callers own persistence.
   ============================================================ */

export const MEAS_KEYS = ["chest","waist","hips","shoulder","backLen","sleeve","neck","bicep","inseam","thigh","height"];

// Generic front-view croquis with numbered callouts (1-11, matching MEAS_KEYS
// order) showing where each measurement is taken. Reference only — inputs
// stay numeric.
export const MEAS_DIAGRAM_SVG = `<svg viewBox="0 0 220 360" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="110" cy="26" r="15"/>
      <line x1="103" y1="41" x2="103" y2="52"/><line x1="117" y1="41" x2="117" y2="52"/>
      <path d="M68,54 L152,54"/>
      <path d="M68,54 L62,92 L70,148 L64,188 L110,196 L156,188 L150,148 L158,92 L152,54"/>
      <path d="M68,54 L48,120 L40,195"/><path d="M152,54 L172,120 L180,195"/>
      <path d="M64,188 L95,265 L90,335"/><path d="M156,188 L125,265 L130,335"/>
    </g>
    <g stroke="currentColor" stroke-width="1.1" stroke-dasharray="3,2" fill="none">
      <line x1="40" y1="92" x2="158" y2="92"/>
      <line x1="45" y1="148" x2="150" y2="148"/>
      <line x1="40" y1="188" x2="156" y2="188"/>
      <line x1="110" y1="54" x2="110" y2="148"/>
      <line x1="66" y1="54" x2="42" y2="195"/>
      <line x1="160" y1="90" x2="184" y2="110"/>
      <line x1="96" y1="35" x2="96" y2="52"/>
      <line x1="110" y1="196" x2="90" y2="335"/>
      <line x1="140" y1="225" x2="172" y2="225"/>
    </g>
    <g class="callout-num" font-family="Inter, sans-serif" font-size="11" font-weight="700" text-anchor="middle">
      <g><circle cx="26" cy="92" r="10"/><text x="26" y="96">1</text><line x1="36" y1="92" x2="40" y2="92" stroke="currentColor" stroke-width="1"/></g>
      <g><circle cx="26" cy="148" r="10"/><text x="26" y="152">2</text><line x1="36" y1="148" x2="45" y2="148" stroke="currentColor" stroke-width="1"/></g>
      <g><circle cx="26" cy="188" r="10"/><text x="26" y="192">3</text><line x1="36" y1="188" x2="40" y2="188" stroke="currentColor" stroke-width="1"/></g>
      <g><circle cx="110" cy="20" r="10"/><text x="110" y="24">4</text><line x1="110" y1="30" x2="110" y2="54" stroke="currentColor" stroke-width="1"/></g>
      <g><circle cx="130" cy="100" r="10"/><text x="130" y="104">5</text><line x1="122" y1="100" x2="110" y2="100" stroke="currentColor" stroke-width="1"/></g>
      <g><circle cx="18" cy="120" r="10"/><text x="18" y="124">6</text><line x1="28" y1="120" x2="42" y2="130" stroke="currentColor" stroke-width="1"/></g>
      <g><circle cx="146" cy="30" r="10"/><text x="146" y="34">7</text><line x1="138" y1="34" x2="117" y2="44" stroke="currentColor" stroke-width="1"/></g>
      <g><circle cx="196" cy="105" r="10"/><text x="196" y="109">8</text><line x1="186" y1="105" x2="172" y2="105" stroke="currentColor" stroke-width="1"/></g>
      <g><circle cx="18" cy="265" r="10"/><text x="18" y="269">9</text><line x1="28" y1="265" x2="85" y2="265" stroke="currentColor" stroke-width="1"/></g>
      <g><circle cx="196" cy="225" r="10"/><text x="196" y="229">10</text><line x1="184" y1="225" x2="172" y2="225" stroke="currentColor" stroke-width="1"/></g>
      <g><circle cx="205" cy="170" r="10"/><text x="205" y="174">11</text><line x1="205" y1="180" x2="205" y2="335" stroke="currentColor" stroke-width="1"/><line x1="205" y1="11" x2="205" y2="160" stroke="currentColor" stroke-width="1"/></g>
    </g>
  </svg>`;

const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

// Renders the diagram-toggle + numeric input rows for MEAS_KEYS into
// `container` (cleared first). `measurements` is a plain {key:number}
// object (e.g. computeMeasurements()'s return value); `T` is an i18n
// lookup `(key) => string`. `onFieldChange(key, rawValue)` fires on each
// input's change event — the caller decides what a new value means (an
// override layered on a size/grade, or the value outright). Diagram
// open/closed state is the caller's to persist (js/app.js keeps it in
// state.showMeasDiagram; body.html can just close over a local variable).
export function renderMeasureFields(container, { measurements, T, onFieldChange, showDiagram = false, onToggleDiagram, icon = "" } = {}) {
  container.innerHTML = "";

  const diagToggle = el("button", "big-btn ghost", icon + T("measDiagramToggle"));
  diagToggle.style.marginTop = "8px";
  const diagWrap = el("div", "meas-diagram" + (showDiagram ? " show" : ""));
  diagWrap.innerHTML = MEAS_DIAGRAM_SVG + `<div class="meas-diagram-legend">` +
    MEAS_KEYS.map((k, i) => `<span><b>${i + 1}.</b> ${T("m_" + k)}</span>`).join("") + `</div>`;
  diagToggle.onclick = () => {
    const next = !diagWrap.classList.contains("show");
    diagWrap.classList.toggle("show", next);
    if (onToggleDiagram) onToggleDiagram(next);
  };
  container.appendChild(diagToggle);
  container.appendChild(diagWrap);

  const box = el("div"); box.style.marginTop = "10px";
  MEAS_KEYS.forEach((k) => {
    const row = el("div", "meas-row", `<label>${T("m_" + k)}</label>`);
    const inp = el("input"); inp.type = "number"; inp.value = measurements[k]; inp.dataset.k = k;
    inp.onchange = () => onFieldChange(k, inp.value);
    row.appendChild(inp); box.appendChild(row);
  });
  container.appendChild(box);
}
