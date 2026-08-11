import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { nextPow2 } from './spatialHash.js'

// WP-35b: GPU port of spatialHash.js's bitonicSortKV — see that module's
// own header for why the algorithm is a GATHER (every pass reads its own
// AND its partner's PREVIOUS-pass value and independently writes its own
// new output) rather than an in-place swap: a fragment shader can only
// write its own output pixel, so this isn't a GPU-specific rewrite of the
// CPU reference, it's what the CPU reference already implements (verified
// by spatialHash.test.js's bitonicSortKV tests). This file is a
// line-for-line translation of that function's inner (k, j) pass loop into
// a fragment shader, run once per pass via two ping-ponged
// THREE.WebGLRenderTarget instances, preceded by one seed pass that reads
// live particle positions and computes each one's grid cell id.
//
// No compute shaders, no atomics, no scatter writes anywhere in this file —
// see BerryStudio-Upgrade-Plan-v3-2.md §5 for why plain WebGL2
// (`GPUComputationRenderer`'s own ceiling) forces this specific
// "sort, don't scatter" shape for building a spatial hash's per-cell
// particle lists at all.
//
// Reuses `three/addons/postprocessing/Pass.js`'s `FullScreenQuad` — the
// exact fullscreen-triangle utility `GPUComputationRenderer` itself uses
// internally for its own passes (see that addon's `doRenderTarget`) —
// rather than hand-rolling a second one. Unlike `GPUComputationRenderer`,
// this class needs MANY sequential passes per frame (66-105 for the
// particle counts this app runs, one draw call per (k, j) stage) with a
// different `uK`/`uJ` uniform each time, which `GPUComputationRenderer`'s
// one-shader-per-named-variable API has no way to express — hence a
// separate, minimal, manual ping-pong driver instead of adding N synthetic
// GPUComputationRenderer "variables."
//
// Every shader here compiles as real GLSL ES 3.00 regardless of authoring
// style — three.js's WebGLProgram always upgrades a (non-Raw) ShaderMaterial
// to `#version 300 es` on a WebGL2 context (see WebGLProgram.js: the
// `attribute`/`varying`/`texture2D` macro-translation block runs
// unconditionally, not just when `glslVersion: THREE.GLSL3` is set) — the
// same mechanism that already lets ClothSimulation.js's own shaders run on
// this renderer. That means `texelFetch` and real integer bitwise ops
// (`^`, `&`, `%`) are available here with no `glslVersion` override needed,
// confirmed directly against this project's actual three.js version rather
// than assumed from general GLSL knowledge.

const CELL_ID_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uSourcePosition;
uniform float uTexDim;
uniform float uParticleCount;
uniform int uSortDim;
uniform vec3 uGridMin;
uniform float uCellSize;
uniform vec3 uGridDimF;
uniform float uSentinelKey;

void main() {
  ivec2 xy = ivec2(gl_FragCoord.xy - 0.5);
  int flatIdx = xy.y * uSortDim + xy.x;
  if (float(flatIdx) >= uParticleCount) {
    // Padding slot (either beyond the real particle count within the
    // source texDim x texDim texture's own dummy tail, or beyond it
    // entirely up to sortDim^2) — sentinel key sorts it to the very end,
    // -1 value matches this codebase's existing "no neighbor" convention
    // (see ClothSimulation.js's idx < -0.5 checks).
    gl_FragColor = vec4(uSentinelKey, -1.0, 0.0, 0.0);
    return;
  }
  // flatIdx indexes the SOURCE (main sim) texture, which uses texDim, not
  // this pass's own sortDim — same row-major convention
  // ClothSimulation.js's neighbor lookups already use.
  vec2 srcUV = ( vec2( mod(float(flatIdx), uTexDim), floor(float(flatIdx) / uTexDim) ) + 0.5 ) / uTexDim;
  vec3 pos = texture2D(uSourcePosition, srcUV).xyz;
  vec3 rel = (pos - uGridMin) / uCellSize;
  // Clamped, not rejected — mirrors spatialHash.js's cellCoords exactly
  // (see that function's header for why: a particle that ends up outside
  // the margined grid degrades gracefully into an edge cell rather than
  // erroring).
  float ix = clamp(floor(rel.x), 0.0, uGridDimF.x - 1.0);
  float iy = clamp(floor(rel.y), 0.0, uGridDimF.y - 1.0);
  float iz = clamp(floor(rel.z), 0.0, uGridDimF.z - 1.0);
  float cellId = ix + iy * uGridDimF.x + iz * uGridDimF.x * uGridDimF.y;
  gl_FragColor = vec4(cellId, float(flatIdx), 0.0, 0.0);
}
`

// One (k, j) compare-exchange pass — see spatialHash.js's bitonicSortKV for
// the identical logic expressed as a CPU loop body. `texelFetch` (exact,
// unfiltered single-texel reads by integer coordinate) is used instead of
// `texture2D` here specifically because both `xy` and `partnerXY` are
// already known-exact integer texel addresses — there is no meaningful
// "uv" for this data, just array slots.
const COMPARE_EXCHANGE_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uSource;
uniform int uSortDim;
uniform int uK;
uniform int uJ;

void main() {
  ivec2 xy = ivec2(gl_FragCoord.xy - 0.5);
  int i = xy.y * uSortDim + xy.x;
  int ixj = i ^ uJ;
  ivec2 partnerXY = ivec2(ixj % uSortDim, ixj / uSortDim);
  vec4 mine = texelFetch(uSource, xy, 0);
  vec4 partner = texelFetch(uSource, partnerXY, 0);
  bool ascending = ( (i & uK) == 0 );
  bool iIsLow = i < ixj;
  bool takeMine;
  if (iIsLow) {
    takeMine = ascending ? (mine.r <= partner.r) : (mine.r >= partner.r);
  } else {
    takeMine = ascending ? (mine.r >= partner.r) : (mine.r <= partner.r);
  }
  gl_FragColor = takeMine ? mine : partner;
}
`

// Same minimal pass-through vertex shader GPUComputationRenderer's own
// `getPassThroughVertexShader()` uses — `position` needs no explicit
// `attribute`/`in` declaration; three.js's ShaderMaterial prefix supplies
// it automatically (confirmed against that addon's own source, which ships
// this exact shader and is already proven working on this renderer).
const PASSTHROUGH_VERTEX_SHADER = `
void main() {
  gl_Position = vec4( position, 1.0 );
}
`

function makeRenderTarget(dim) {
  return new THREE.WebGLRenderTarget(dim, dim, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
}

// The full (k, j) pass sequence for a bitonic sort over `p` elements —
// extracted as its own function so it's the ONE place both this file and a
// test can point at, instead of two hand-written copies of the same nested
// loop silently drifting apart.
export function bitonicPassSequence(p) {
  const passes = []
  for (let k = 2; k <= p; k <<= 1) {
    for (let j = k >> 1; j > 0; j >>= 1) {
      passes.push({ k, j })
    }
  }
  return passes
}

export class GPUBitonicSort {
  constructor(renderer, { texDim, grid }) {
    this.renderer = renderer
    this.texDim = texDim
    // sortDim is a power of two, so sortDim*sortDim is automatically BOTH
    // a power of two (what the sort network needs) and a perfect square
    // (what lets this reuse a plain square texture, same as every other
    // buffer in this file, instead of an oddly-shaped one).
    this.sortDim = nextPow2(texDim)
    this.P = this.sortDim * this.sortDim
    this.grid = grid
    this.sentinelKey = grid.dim[0] * grid.dim[1] * grid.dim[2]
    this.passes = bitonicPassSequence(this.P)

    this.rtA = makeRenderTarget(this.sortDim)
    this.rtB = makeRenderTarget(this.sortDim)

    this.cellIdMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSourcePosition: { value: null },
        uTexDim: { value: texDim },
        uParticleCount: { value: 0 },
        uSortDim: { value: this.sortDim },
        uGridMin: { value: new THREE.Vector3(...grid.min) },
        uCellSize: { value: grid.cellSize },
        uGridDimF: { value: new THREE.Vector3(...grid.dim) },
        uSentinelKey: { value: this.sentinelKey },
      },
      vertexShader: PASSTHROUGH_VERTEX_SHADER,
      fragmentShader: CELL_ID_FRAGMENT_SHADER,
    })

    this.sortMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSource: { value: null },
        uSortDim: { value: this.sortDim },
        uK: { value: 2 },
        uJ: { value: 1 },
      },
      vertexShader: PASSTHROUGH_VERTEX_SHADER,
      fragmentShader: COMPARE_EXCHANGE_FRAGMENT_SHADER,
    })

    this.quad = new FullScreenQuad(this.cellIdMaterial)
  }

  setParticleCount(count) {
    this.cellIdMaterial.uniforms.uParticleCount.value = count
  }

  // Runs the cell-id seed pass, then the full (k, j) sort sequence,
  // ping-ponging rtA/rtB (two render targets total, regardless of pass
  // count — each pass only ever needs "the previous pass's full buffer" as
  // input, never anything older). Returns the texture holding the final
  // sorted (cellId, particleIndex) buffer; valid until the next compute()
  // call overwrites it.
  compute(sourcePositionTexture) {
    const renderer = this.renderer
    const prevTarget = renderer.getRenderTarget()
    const prevXr = renderer.xr.enabled
    const prevShadowAutoUpdate = renderer.shadowMap.autoUpdate
    renderer.xr.enabled = false
    renderer.shadowMap.autoUpdate = false

    this.cellIdMaterial.uniforms.uSourcePosition.value = sourcePositionTexture
    this.quad.material = this.cellIdMaterial
    renderer.setRenderTarget(this.rtA)
    this.quad.render(renderer)

    let src = this.rtA
    let dst = this.rtB
    this.quad.material = this.sortMaterial
    for (const { k, j } of this.passes) {
      this.sortMaterial.uniforms.uSource.value = src.texture
      this.sortMaterial.uniforms.uK.value = k
      this.sortMaterial.uniforms.uJ.value = j
      renderer.setRenderTarget(dst)
      this.quad.render(renderer)
      const tmp = src; src = dst; dst = tmp
    }

    renderer.setRenderTarget(prevTarget)
    renderer.xr.enabled = prevXr
    renderer.shadowMap.autoUpdate = prevShadowAutoUpdate
    this.sortedTexture = src.texture
    return this.sortedTexture
  }

  dispose() {
    this.rtA.dispose()
    this.rtB.dispose()
    this.quad.dispose()
    this.cellIdMaterial.dispose()
    this.sortMaterial.dispose()
  }
}
