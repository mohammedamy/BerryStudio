/* ============================================================
   Shared measurement-input UI (BerryStudio-Upgrade-Plan WP-10) —
   the numeric fields + reference diagram used by both the main
   app's Measures pane (js/app.js) and the standalone BodyForm
   page (body.html). Framework-free, DOM-only, no dependency on
   js/app.js's own state/Canvas — callers own persistence.
   ============================================================ */

export const MEAS_KEYS = ["chest","waist","hips","shoulder","backLen","sleeve","neck","bicep","inseam","thigh","height"];

// Haute-couture anthropometric tailor's croquis with 3D elliptical tape wraps,
// anatomical landmark calipers, and numbered callouts (1-11, matching MEAS_KEYS
// order) showing precisely where each body measurement is taken.
export const MEAS_DIAGRAM_SVG = `<svg viewBox="0 0 280 412" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Body measurement reference guide">
    <defs>
      <linearGradient id="bsCroquisFill" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="currentColor" stop-opacity="0.13"/>
        <stop offset="50%" stop-color="currentColor" stop-opacity="0.035"/>
        <stop offset="100%" stop-color="currentColor" stop-opacity="0.14"/>
      </linearGradient>
      <radialGradient id="bsFloorShadow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="currentColor" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- Studio plumb centerline & grounding shadow -->
    <ellipse cx="136" cy="390" rx="46" ry="6" fill="url(#bsFloorShadow)"/>
    <line x1="136" y1="12" x2="136" y2="395" stroke="currentColor" stroke-width="0.75" stroke-dasharray="2,3" stroke-opacity="0.22"/>

    <!-- Sculpted 8-head couture mannequin / human silhouette (symmetric about X = 136) -->
    <g class="croquis-body" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <!-- Full torso, arms, graceful hands, pelvis, legs & feet -->
      <path fill="url(#bsCroquisFill)" stroke-width="1.6" d="
        M 129.2,51.5
        C 129.2,58.5 127.8,63 123.8,66
        C 115,69.2 103.2,71.5 94,75.2
        C 86.2,78.5 83,95 80.5,116
        C 79,128 77.5,136 76,144
        C 73,160 70.5,179 68.8,197
        C 66.8,204 65.8,212.5 67.2,218.5
        C 68.2,222.5 71.2,222 72.8,216.5
        C 74.2,211.5 75.2,205 76.2,198.5
        C 79.8,180 84.2,160 87.8,144.5
        C 91.5,129 96.5,115 101.8,105.5
        C 100.5,112 100.5,120.5 102.5,130
        C 105,141 108.5,149 109,158
        C 109.5,167 98.5,181 97,202
        C 95.8,219 98.8,238 102.8,256
        C 105.8,269 108.5,279 109,287
        C 109.5,295 106,309 107,325
        C 108,341 112.2,355 114.2,368
        C 113.2,375 109.5,382 110.8,386.5
        C 112.2,389.8 122.2,389.8 124.2,386.2
        C 125.2,382.5 123.8,375 123.5,368
        C 123.5,355 125.8,339 125.2,323
        C 124.8,309 123.2,297 123.6,287
        C 124.2,273 128,244 132.2,216
        C 133,213 134.4,212 136,212
        C 137.6,212 139,213 139.8,216
        C 144,244 147.8,273 148.4,287
        C 148.8,297 147.2,309 146.8,323
        C 146.2,339 148.5,355 148.5,368
        C 148.2,375 146.8,382.5 147.8,386.2
        C 149.8,389.8 159.8,389.8 161.2,386.5
        C 162.5,382 158.8,375 157.8,368
        C 159.8,355 164,341 165,325
        C 166,309 162.5,295 163,287
        C 163.5,279 166.2,269 169.2,256
        C 173.2,238 176.2,219 175,202
        C 173.5,181 162.5,167 163,158
        C 163.5,149 167,141 169.5,130
        C 171.5,120.5 171.5,112 170.2,105.5
        C 175.5,115 180.5,129 184.2,144.5
        C 187.8,160 192.2,180 195.8,198.5
        C 196.8,205 197.8,211.5 199.2,216.5
        C 200.8,222 203.8,222.5 204.8,218.5
        C 206.2,212.5 205.2,204 203.2,197
        C 201.5,179 199,160 196,144
        C 194.5,136 193,128 191.5,116
        C 189,95 185.8,78.5 178,75.2
        C 168.8,71.5 157,69.2 148.2,66
        C 144.2,63 142.8,58.5 142.8,51.5
      "/>

      <!-- Sculpted head with opaque base so neck stroke never ghosts behind chin -->
      <path fill="var(--panel-2, #f7f8fb)" stroke-width="1.5" d="M 121.8,35.5 C 119.3,35.5 119.3,41.8 122.2,42.8"/>
      <path fill="var(--panel-2, #f7f8fb)" stroke-width="1.5" d="M 150.2,35.5 C 152.7,35.5 152.7,41.8 149.8,42.8"/>
      <path fill="var(--panel-2, #f7f8fb)" stroke="none" d="
        M 136,19.5
        C 145.4,19.5 150.6,26.8 150.2,36.5
        C 149.8,45.2 144.2,54.8 136,55.5
        C 127.8,54.8 122.2,45.2 121.8,36.5
        C 121.4,26.8 126.6,19.5 136,19.5 Z
      "/>
      <path fill="url(#bsCroquisFill)" stroke-width="1.6" d="
        M 136,19.5
        C 145.4,19.5 150.6,26.8 150.2,36.5
        C 149.8,45.2 144.2,54.8 136,55.5
        C 127.8,54.8 122.2,45.2 121.8,36.5
        C 121.4,26.8 126.6,19.5 136,19.5 Z
      "/>

      <!-- Atelier dress-form construction seams (armscyes, princess lines, thumb creases, pelvic arch, knees) -->
      <g fill="none" stroke-width="0.85" stroke-opacity="0.26">
        <path d="M 94,75.2 C 99,86 100.5,96.5 101.8,105.5"/>
        <path d="M 178,75.2 C 173,86 171.5,96.5 170.2,105.5"/>
        <path d="M 114.5,96 C 111.5,116 115.5,138 118.5,158 C 115.5,176 112.5,191 114.5,205"/>
        <path d="M 157.5,96 C 160.5,116 156.5,138 153.5,158 C 156.5,176 159.5,191 157.5,205"/>
        <path d="M 76.2,198.5 C 75.5,203.5 76.8,207.5 78.2,208.5"/>
        <path d="M 195.8,198.5 C 196.5,203.5 195.2,207.5 193.8,208.5"/>
        <path d="M 97,202 Q 118,208 136,212 Q 154,208 175,202"/>
        <path d="M 112.5,287 Q 116.5,289.5 120.5,287"/>
        <path d="M 151.5,287 Q 155.5,289.5 159.5,287"/>
      </g>
    </g>

    <!-- Measurement Tapes, Calipers & Numbered Callouts (1-11) -->
    <g class="callout-num" font-family="Inter, Cairo, sans-serif" font-size="10.5" font-weight="800" text-anchor="middle" dominant-baseline="central">

      <!-- 1. Chest / Bust Circumference -->
      <g class="meas-callout" data-meas="chest">
        <path class="meas-tape-back" d="M 101,118 Q 136,112 171,118"/>
        <line class="meas-halo" x1="33" y1="118" x2="101" y2="118"/>
        <line class="meas-leader" x1="33" y1="118" x2="101" y2="118"/>
        <path class="meas-tape-front" d="M 101,118 Q 136,125 171,118"/>
        <circle class="meas-dot" cx="101" cy="118" r="2.1"/>
        <circle class="meas-dot" cx="171" cy="118" r="2.1"/>
        <circle class="meas-badge" cx="22" cy="118" r="10.5"/>
        <text x="22" y="118">1</text>
      </g>

      <!-- 2. Natural Waist Circumference -->
      <g class="meas-callout" data-meas="waist">
        <path class="meas-tape-back" d="M 109,158 Q 136,153.5 163,158"/>
        <line class="meas-halo" x1="33" y1="158" x2="109" y2="158"/>
        <line class="meas-leader" x1="33" y1="158" x2="109" y2="158"/>
        <path class="meas-tape-front" d="M 109,158 Q 136,163.5 163,158"/>
        <circle class="meas-dot" cx="109" cy="158" r="2.1"/>
        <circle class="meas-dot" cx="163" cy="158" r="2.1"/>
        <circle class="meas-badge" cx="22" cy="158" r="10.5"/>
        <text x="22" y="158">2</text>
      </g>

      <!-- 3. Full Hips Circumference -->
      <g class="meas-callout" data-meas="hips">
        <path class="meas-tape-back" d="M 97,202 Q 136,196 175,202"/>
        <line class="meas-halo" x1="33" y1="202" x2="97" y2="202"/>
        <line class="meas-leader" x1="33" y1="202" x2="97" y2="202"/>
        <path class="meas-tape-front" d="M 97,202 Q 136,209.5 175,202"/>
        <circle class="meas-dot" cx="97" cy="202" r="2.1"/>
        <circle class="meas-dot" cx="175" cy="202" r="2.1"/>
        <circle class="meas-badge" cx="22" cy="202" r="10.5"/>
        <text x="22" y="202">3</text>
      </g>

      <!-- 4. Shoulder Width (Acromion to Acromion across upper shoulders) -->
      <g class="meas-callout" data-meas="shoulder">
        <path class="meas-span" d="M 94,75.2 Q 136,82.5 178,75.2"/>
        <path class="meas-arrow" d="M 98.5,73.5 L 94,75.2 L 98,78"/>
        <path class="meas-arrow" d="M 173.5,73.5 L 178,75.2 L 174,78"/>
        <line class="meas-leader" x1="32.5" y1="54" x2="94" y2="75.2"/>
        <circle class="meas-dot" cx="94" cy="75.2" r="2.1"/>
        <circle class="meas-dot" cx="178" cy="75.2" r="2.1"/>
        <circle class="meas-badge" cx="22" cy="54" r="10.5"/>
        <text x="22" y="54">4</text>
      </g>

      <!-- 5. Back Waist Length (C7 Nape to Natural Waist) -->
      <g class="meas-callout" data-meas="backLen">
        <line class="meas-span" x1="136" y1="69" x2="136" y2="158"/>
        <line class="meas-witness" x1="131.5" y1="69" x2="140.5" y2="69"/>
        <line class="meas-witness" x1="131.5" y1="158" x2="140.5" y2="158"/>
        <line class="meas-leader" x1="136" y1="138" x2="144" y2="138"/>
        <circle class="meas-dot" cx="136" cy="69" r="2"/>
        <circle class="meas-badge" cx="154" cy="138" r="10.5"/>
        <text x="154" y="138">5</text>
      </g>

      <!-- 6. Sleeve / Arm Length (Shoulder Acromion -> Elbow -> Wrist) -->
      <g class="meas-callout" data-meas="sleeve">
        <line class="meas-witness" x1="87" y1="73.2" x2="94" y2="75.2"/>
        <line class="meas-witness" x1="61.5" y1="196.2" x2="68.8" y2="197"/>
        <path class="meas-span" d="M 88,73.6 C 80,82 75,112 70,142 C 67,160 64.5,179 62.8,196.4"/>
        <line class="meas-leader" x1="32.5" y1="86" x2="79.5" y2="96"/>
        <circle class="meas-dot" cx="79.5" cy="96" r="2"/>
        <circle class="meas-badge" cx="22" cy="86" r="10.5"/>
        <text x="22" y="86">6</text>
      </g>

      <!-- 7. Neck Base Circumference -->
      <g class="meas-callout" data-meas="neck">
        <path class="meas-tape-back" d="M 123.8,66 Q 136,62.5 148.2,66"/>
        <path class="meas-tape-front" d="M 123.8,66 Q 136,70.8 148.2,66"/>
        <line class="meas-leader" x1="211.5" y1="48" x2="148.2" y2="66"/>
        <circle class="meas-dot" cx="123.8" cy="66" r="1.9"/>
        <circle class="meas-dot" cx="148.2" cy="66" r="2.1"/>
        <circle class="meas-badge" cx="222" cy="45" r="10.5"/>
        <text x="222" y="45">7</text>
      </g>

      <!-- 8. Bicep / Upper Arm Circumference -->
      <g class="meas-callout" data-meas="bicep">
        <path class="meas-tape-back" d="M 176.2,118 Q 183.5,112.5 191.5,115"/>
        <path class="meas-tape-front" d="M 176.2,118 Q 184.5,120.8 191.5,115"/>
        <line class="meas-leader" x1="211.5" y1="115" x2="191.5" y2="115"/>
        <circle class="meas-dot" cx="176.2" cy="118" r="1.9"/>
        <circle class="meas-dot" cx="191.5" cy="115" r="2.1"/>
        <circle class="meas-badge" cx="222" cy="115" r="10.5"/>
        <text x="222" y="115">8</text>
      </g>

      <!-- 9. Inseam (Crotch to Inner Ankle along clean inner-leg space) -->
      <g class="meas-callout" data-meas="inseam">
        <line class="meas-witness" x1="130.5" y1="214" x2="136" y2="214"/>
        <line class="meas-witness" x1="124" y1="368" x2="135" y2="368"/>
        <line class="meas-span" x1="133.5" y1="214" x2="132.5" y2="368"/>
        <path class="meas-arrow" d="M 131.3,218 L 133.5,214 L 135.7,218"/>
        <path class="meas-arrow" d="M 130.3,364 L 132.5,368 L 134.7,364"/>
        <line class="meas-halo" x1="33" y1="296" x2="133" y2="296"/>
        <line class="meas-leader" x1="33" y1="296" x2="133" y2="296"/>
        <circle class="meas-dot" cx="133" cy="296" r="2"/>
        <circle class="meas-badge" cx="22" cy="296" r="10.5"/>
        <text x="22" y="296">9</text>
      </g>

      <!-- 10. Thigh Circumference -->
      <g class="meas-callout" data-meas="thigh">
        <path class="meas-tape-back" d="M 142.2,236 Q 157.5,231 172.8,236"/>
        <path class="meas-tape-front" d="M 142.2,236 Q 157.5,241.8 172.8,236"/>
        <line class="meas-leader" x1="211.5" y1="236" x2="172.8" y2="236"/>
        <circle class="meas-dot" cx="142.2" cy="236" r="1.9"/>
        <circle class="meas-dot" cx="172.8" cy="236" r="2.1"/>
        <circle class="meas-badge" cx="222" cy="236" r="10.5"/>
        <text x="222" y="236">10</text>
      </g>

      <!-- 11. Total Stature / Height (Crown to Sole) -->
      <g class="meas-callout" data-meas="height">
        <line class="meas-witness" x1="142" y1="19.5" x2="263" y2="19.5"/>
        <line class="meas-witness" x1="166" y1="389" x2="263" y2="389"/>
        <line class="meas-span" x1="258" y1="19.5" x2="258" y2="167"/>
        <line class="meas-span" x1="258" y1="195" x2="258" y2="389"/>
        <path class="meas-arrow" d="M 255,24.5 L 258,19.5 L 261,24.5"/>
        <path class="meas-arrow" d="M 255,384 L 258,389 L 261,384"/>
        <circle class="meas-badge" cx="258" cy="181" r="10.5"/>
        <text x="258" y="181">11</text>
      </g>
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
  diagWrap.innerHTML = `<div class="meas-diagram-stage">${MEAS_DIAGRAM_SVG}</div><div class="meas-diagram-legend">` +
    MEAS_KEYS.map((k, i) => (
      `<span class="meas-legend-item" data-meas="${k}">` +
      `<b class="meas-legend-num">${i + 1}</b>` +
      `<span class="meas-legend-label">${T("m_" + k)}</span>` +
      `<em class="meas-legend-val" data-val="${k}">${measurements[k]}</em>` +
      `</span>`
    )).join("") + `</div>`;

  diagToggle.onclick = () => {
    const next = !diagWrap.classList.contains("show");
    diagWrap.classList.toggle("show", next);
    if (onToggleDiagram) onToggleDiagram(next);
  };
  container.appendChild(diagToggle);
  container.appendChild(diagWrap);

  const box = el("div", "meas-rows-list");
  box.style.marginTop = "10px";

  const setActiveMeas = (key) => {
    if (key) diagWrap.dataset.active = key;
    else delete diagWrap.dataset.active;
    diagWrap.querySelectorAll(".meas-callout").forEach((node) => {
      node.classList.toggle("is-active", node.dataset.meas === key);
    });
    diagWrap.querySelectorAll(".meas-legend-item").forEach((node) => {
      node.classList.toggle("is-active", node.dataset.meas === key);
    });
    box.querySelectorAll(".meas-row").forEach((node) => {
      node.classList.toggle("is-active", node.dataset.meas === key);
    });
  };

  MEAS_KEYS.forEach((k, i) => {
    const row = el("div", "meas-row", `<label><span class="meas-row-idx">${i + 1}</span><span>${T("m_" + k)}</span></label>`);
    row.dataset.meas = k;
    const inp = el("input");
    inp.type = "number";
    inp.value = measurements[k];
    inp.dataset.k = k;
    inp.onfocus = () => setActiveMeas(k);
    inp.onblur = () => setActiveMeas(null);
    row.onmouseenter = () => setActiveMeas(k);
    row.onmouseleave = () => {
      const focused = box.querySelector("input:focus");
      setActiveMeas(focused ? focused.dataset.k : null);
    };
    inp.onchange = () => {
      const valBadge = diagWrap.querySelector(`.meas-legend-val[data-val="${k}"]`);
      if (valBadge) valBadge.textContent = inp.value;
      onFieldChange(k, inp.value);
    };
    row.appendChild(inp);
    box.appendChild(row);
  });

  diagWrap.querySelectorAll("[data-meas]").forEach((node) => {
    const k = node.dataset.meas;
    node.onmouseenter = () => setActiveMeas(k);
    node.onmouseleave = () => {
      const focused = box.querySelector("input:focus");
      setActiveMeas(focused ? focused.dataset.k : null);
    };
    node.onclick = () => {
      const targetInput = box.querySelector(`input[data-k="${k}"]`);
      if (targetInput) {
        targetInput.focus();
        targetInput.select?.();
      }
    };
  });

  container.appendChild(box);
}
