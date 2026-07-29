// BerryStudio-Upgrade-Plan WP-9.1 — drives 3d-test.html. External file (not
// an inline <script>) so the page's CSP can stay script-src 'self' with no
// 'unsafe-inline', matching index.html's own convention.
import { probeCapabilities } from './capability-probe.js';

function row(label, valueHtml) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${label}</td><td>${valueHtml}</td>`;
  return tr;
}
function cls(ok) { return ok ? 'ok' : 'failc'; }

// ---------- WebGL2 + the two checks the GPU solver actually needs ----------
// Float RENDER-TARGET support, not just float TEXTURE support: WebGL2's core
// spec already allows sampling float textures, but rendering INTO one (what
// GPUComputationRenderer's ping-pong render targets require) additionally
// needs EXT_color_buffer_float — confirmed against three.js's own
// WebGLCapabilities.js/WebGLExtensions.js, which check for exactly this
// extension (or EXT_color_buffer_half_float) before trusting a float render
// target, rather than assuming WebGL2 alone is enough.
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl2');
const webgl2 = !!gl;
const floatRenderTarget = webgl2 && !!gl.getExtension('EXT_color_buffer_float');
const maxTextureSize = webgl2 ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0;
// Mirrors cloth-lab/src/cloth/ClothSimulation.js's textureDimFor(): texDim =
// ceil(sqrt(particleCount)), one texel per particle — so the max supported
// particle count is texDim capped at MAX_TEXTURE_SIZE, squared. Real
// garments in this app run ~1500-3000 particles per the engine's own
// self-collision cost comment, so anything comfortably above that is
// "supports real garments," not just "technically works."
const maxParticles = maxTextureSize * maxTextureSize;

const details = document.getElementById('details');
details.appendChild(row('WebGL2 context', `<span class="${cls(webgl2)}">${webgl2 ? 'available' : 'NOT available'}</span>`));
details.appendChild(row('Float render targets<br><code>EXT_color_buffer_float</code>', `<span class="${cls(floatRenderTarget)}">${floatRenderTarget ? 'supported' : 'NOT supported'}</span>`));
details.appendChild(row('Max texture size', webgl2 ? `${maxTextureSize}px — supports up to ${maxParticles.toLocaleString()} cloth particles` : '—'));

// ---------- WebGPU (Phase 1/WP-2 probe, reused verbatim) ----------
const cap = await probeCapabilities();
const tierClass = cap.tier === 'green' ? 'ok' : cap.tier === 'amber' ? 'warnc' : 'failc';
const tierDot = cap.tier === 'green' ? '●' : cap.tier === 'amber' ? '◐' : '○';
details.appendChild(row('WebGPU (local AI models only —<br>not used by the cloth solver)', `<span class="${tierClass}">${tierDot} ${cap.reason}</span>`));

// ---------- one clear verdict ----------
const verdictEl = document.getElementById('verdict');
if (!webgl2 || !floatRenderTarget) {
  verdictEl.className = 'verdict fail';
  verdictEl.innerHTML = `<span class="dot">✕</span> This device cannot run the 3D cloth solver.` +
    (!webgl2 ? ' WebGL2 is unavailable.' : ' Float render targets are unavailable.');
} else if (maxTextureSize < 128) {
  verdictEl.className = 'verdict warn';
  verdictEl.innerHTML = `<span class="dot">!</span> The cloth solver will run, but this GPU's texture-size limit (${maxTextureSize}px, ~${maxParticles.toLocaleString()} particles) may not comfortably fit complex garments.`;
} else {
  verdictEl.className = 'verdict pass';
  verdictEl.innerHTML = `<span class="dot">✓</span> This device can run the 3D cloth solver.`;
}
