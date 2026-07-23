import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js'
import { MAX_COLLISION_CAPSULES } from '../body/collisionRig.js'

// Position Verlet + iterative distance-constraint relaxation (Jakobsen/Provot
// — the classic approach behind three.js's own long-standing cloth demo).
// Each GPUComputationRenderer .compute() call is Jacobi-parallel (every
// particle reads the SAME previous-pass snapshot of its neighbors — no
// in-pass sequential relaxation like CPU Gauss-Seidel is possible), so "K
// relaxation iterations" means K separate .compute() calls per frame
// (substeps), not a loop inside one shader call.
const SUBSTEPS = 8
const SUBSTEP_DT = (1 / 60) / SUBSTEPS
const GRAVITY = new THREE.Vector3(0, -9.81, 0)
// Ramp gravity in over the first ~1.5s so a bad initial placement/topology
// bug shows up as a slow, readable drift instead of an instant explosion.
const GRAVITY_RAMP_FRAMES = 90

export function textureDimFor(count) {
  return Math.max(2, Math.ceil(Math.sqrt(count)))
}

// Packs a fixed-width (maxNeighbors, e.g. 8) {idx,rest} neighbor list into
// two RGBA float textures each (A = neighbors 0-3, B = neighbors 4-7) — one
// texel per sim particle, same row-major addressing GPUComputationRenderer
// uses internally (texel index === particle id), so a shader can look up
// "my own" neighbor data at its own gl_FragCoord-derived uv.
function packNeighborTextures(neighbors, maxNeighbors, texDim) {
  const texCount = texDim * texDim
  const nbrA = new Float32Array(texCount * 4).fill(-1)
  const nbrB = new Float32Array(texCount * 4).fill(-1)
  const restA = new Float32Array(texCount * 4)
  const restB = new Float32Array(texCount * 4)
  const particleCount = neighbors.idx.length / maxNeighbors
  for (let p = 0; p < particleCount; p++) {
    for (let k = 0; k < maxNeighbors; k++) {
      const idx = neighbors.idx[p * maxNeighbors + k]
      const rest = neighbors.rest[p * maxNeighbors + k]
      const nTarget = k < 4 ? nbrA : nbrB
      const rTarget = k < 4 ? restA : restB
      const ch = k % 4
      nTarget[p * 4 + ch] = idx
      rTarget[p * 4 + ch] = rest
    }
  }
  const makeTex = (arr) => {
    const tex = new THREE.DataTexture(arr, texDim, texDim, THREE.RGBAFormat, THREE.FloatType)
    tex.needsUpdate = true
    return tex
  }
  return { nbrA: makeTex(nbrA), nbrB: makeTex(nbrB), restA: makeTex(restA), restB: makeTex(restB) }
}

// Looks up a flat particle index in a same-sized texture — every static and
// ping-pong texture in this sim shares one texDim so this one mapping works
// for all of them. Returns (weighted correction, 1.0) so the caller can
// AVERAGE across active neighbors rather than sum: this is a Jacobi-parallel
// solver (every particle reads the same pre-step snapshot, no in-pass
// sequential Gauss-Seidel correction is possible — see the module-level
// comment), and summing raw per-neighbor corrections without normalizing by
// degree over-corrects high-degree vertices in direct proportion to their
// neighbor count, which explodes within a handful of frames once any vertex
// has more than ~2-3 active constraints (confirmed empirically: the
// un-normalized version blew up to 10^5-scale positions by frame 4).
// Averaging keeps the per-substep step size bounded regardless of degree.
//
// `wSelf = invMassSelf/(invMassSelf+invMassNbr)` is the standard PBD
// mass-weighted split: a light particle held by a heavy (or pinned,
// invMass=0) neighbor absorbs (close to) the whole correction itself, a
// heavy particle barely moves for a light neighbor's sake. For a
// single-fabric garment this varies particle-to-particle only through
// `areaShare` (denser triangulation = smaller share = lighter), but it's
// what makes the per-fabric `massDensity` value (previously computed into
// `uAreaShare` but never actually consumed by anything) do anything at all.
const NEIGHBOR_CORRECTION_GLSL = `
vec4 neighborCorrection(vec3 predicted, float idx, float rest, float invMassSelf) {
  if (idx < -0.5) return vec4(0.0);
  vec2 nuv = ( vec2( mod(idx, resolution.x), floor(idx / resolution.x) ) + 0.5 ) / resolution;
  vec3 npos = texture2D(texturePosition, nuv).xyz;
  vec2 nArea = texture2D(uAreaShare, nuv).rg;
  float invMassNbr = nArea.g > 0.5 ? 0.0 : 1.0 / max(uMassDensity * nArea.r, 1e-6);
  float wSelf = invMassSelf / max(invMassSelf + invMassNbr, 1e-6);
  vec3 d = predicted - npos;
  float dist = max(length(d), 1e-5);
  return vec4(d * (1.0 - rest / dist) * wSelf, 1.0);
}
`

// Tapered-capsule ("round cone") push-out. The segment [a,b] is always
// vertical or near-vertical for every primitive this rig produces, but the
// projection math below doesn't assume that. `zScale` lets a primitive
// collide against an ELLIPTICAL cross-section (the torso mesh is squashed
// in Z to read as flatter front-to-back — see collisionRig.js): distance is
// measured after "unsquashing" Z by 1/zScale, which is equivalent to
// pushing out to the true elliptical surface, then the same scale factor
// applied to the ORIGINAL (non-unsquashed) offset vector lands exactly on
// that surface in real space — the two zScale factors cancel algebraically,
// so the push is just `offset * (r/dist)` with `dist` computed in the
// unsquashed space.
//
// Friction: without it, a contact only ever pushes OUTWARD — nothing resists
// sliding ALONG the surface, so gravity alone will pull a garment down and
// off a shoulder no matter how good the push-out math is (confirmed
// empirically: pure push-out let a T-shirt slide off the shoulders and pool
// at the hip over ~15s). `prevPos` gives an implicit velocity (Verlet has no
// separate velocity buffer), which is split into normal/tangential parts at
// the contact point; damping the tangential part by `friction` before
// returning is what actually lets cloth "catch" on a shoulder instead of
// just glancing off it — this is what makes the per-fabric `friction` field
// in fabricPresets.js (previously computed but never consumed) do anything.
const CAPSULE_COLLISION_GLSL = `
vec3 collideCapsule(vec3 p, vec3 prevP, vec3 a, vec3 b, float r0, float r1, float zScale, float friction) {
  vec3 ab = b - a;
  float abLen2 = max(dot(ab, ab), 1e-8);
  float t = clamp(dot(p - a, ab) / abLen2, 0.0, 1.0);
  vec3 c = a + ab * t;
  float r = mix(r0, r1, t);
  vec3 offset = p - c;
  vec3 scaledOffset = vec3(offset.x, offset.y, offset.z / zScale);
  float dist = length(scaledOffset);
  if (dist < r) {
    vec3 pushed = c + offset * (r / max(dist, 1e-6));
    vec3 n = normalize(offset);
    vec3 delta = pushed - prevP;
    vec3 tangentDelta = delta - n * dot(delta, n);
    return pushed - tangentDelta * friction;
  }
  return p;
}
`

// Self-collision: brute-force O(N^2) — deliberately NOT spatial hashing.
// GPUComputationRenderer has no compute-shader/atomics access, so a real
// GPU spatial hash needs either a full bitonic sort or scatter-with-atomics
// pass, neither available in plain WebGL2 fragment shaders. At this
// particle budget (~2000) brute-force is measured at ~0.03ms/substep for
// the existing 16-neighbor structural+bend scan; an O(N^2) scan is ~120x
// that (~3.6-7ms) — too much for every substep, but comfortably affordable
// ONCE per rendered frame (see `uApplySelfCollision`, set true only on the
// last of the 8 substeps in step() below). Revisit with real spatial
// hashing only if particle count grows into the 10k+ range.
//
// Exclusion rule: compare REST-space distance, not mesh topology. Two
// particles close in the UNDEFORMED rest pose are normal local fabric
// (already handled by structural/bend) regardless of current distance;
// two particles FAR apart at rest but suddenly close in the deformed state
// is exactly a self-fold, and gets pushed apart. This needs no neighbor-list
// lookups — just a second static texture holding each particle's permanent
// rest position (unlike texturePosition/texturePrevPosition, this one never
// ping-pongs).
function selfCollisionGlsl(texDim) {
  return `
vec3 selfCollisionCorrection(vec3 predicted, vec3 myRestPos, float myFlatIdx) {
  if (uApplySelfCollision < 0.5) return vec3(0.0);
  vec3 corr = vec3(0.0);
  float count = 0.0;
  for (int xi = 0; xi < ${texDim}; xi++) {
    for (int yi = 0; yi < ${texDim}; yi++) {
      float flatIdx = float(yi) * resolution.x + float(xi);
      if (flatIdx >= uParticleCount || flatIdx == myFlatIdx) continue;
      vec2 juv = (vec2(float(xi), float(yi)) + 0.5) / resolution;
      vec3 jRest = texture2D(uRestPosition, juv).xyz;
      if (distance(myRestPos, jRest) < uSelfCollisionRestThreshold) continue;
      vec3 jPos = texture2D(texturePosition, juv).xyz;
      vec3 diff = predicted - jPos;
      float d = length(diff);
      if (d < uSelfCollisionRadius && d > 1e-6) {
        corr += diff * ((uSelfCollisionRadius - d) / d);
        count += 1.0;
      }
    }
  }
  if (count > 0.5) return corr / count;
  return vec3(0.0);
}
`
}

// NOTE: `texturePosition` / `texturePrevPosition` are NOT declared here —
// GPUComputationRenderer.init() auto-prepends `uniform sampler2D <name>;`
// for every variable listed in setVariableDependencies(); declaring them
// again here would be a duplicate-declaration compile error.
function positionFragmentShader(texDim) {
  return `
uniform sampler2D uAreaShare;
uniform sampler2D uRestPosition;
uniform sampler2D uStructNbrA;
uniform sampler2D uStructNbrB;
uniform sampler2D uStructRestA;
uniform sampler2D uStructRestB;
uniform sampler2D uBendNbrA;
uniform sampler2D uBendNbrB;
uniform sampler2D uBendRestA;
uniform sampler2D uBendRestB;
uniform float uDt;
uniform float uGravityRamp;
uniform vec3 uGravity;
uniform float uDamping;
uniform float uMassDensity;
uniform float uStructStiff;
uniform float uBendStiff;
uniform float uFloorY;
uniform float uFriction;
uniform int uCapsuleCount;
uniform vec3 uCapA[${MAX_COLLISION_CAPSULES}];
uniform vec3 uCapB[${MAX_COLLISION_CAPSULES}];
uniform float uCapR0[${MAX_COLLISION_CAPSULES}];
uniform float uCapR1[${MAX_COLLISION_CAPSULES}];
uniform float uCapZScale[${MAX_COLLISION_CAPSULES}];
uniform float uParticleCount;
uniform float uApplySelfCollision;
uniform float uSelfCollisionRadius;
uniform float uSelfCollisionRestThreshold;
uniform float uDragParticleIndex;
uniform vec3 uDragTargetPosition;

${NEIGHBOR_CORRECTION_GLSL}
${CAPSULE_COLLISION_GLSL}
${selfCollisionGlsl(texDim)}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  float myFlatIdx = floor(gl_FragCoord.y) * resolution.x + floor(gl_FragCoord.x);

  vec4 areaData = texture2D(uAreaShare, uv);
  float areaShare = areaData.r;
  float pinned = areaData.g;

  vec3 pos = texture2D(texturePosition, uv).xyz;

  if (pinned > 0.5) {
    gl_FragColor = vec4(pos, 0.0);
    return;
  }

  // Grab-and-drag: force this particle to the pointer's live target
  // instead of running physics on it at all. Checked before the rest of
  // the step so a dragged particle never fights the solver — its NEIGHBORS
  // still see it move (via texturePosition) and react normally.
  if (myFlatIdx == uDragParticleIndex) {
    gl_FragColor = vec4(uDragTargetPosition, 0.0);
    return;
  }

  vec3 prevPos = texture2D(texturePrevPosition, uv).xyz;
  vec3 predicted = pos + (pos - prevPos) * uDamping + uGravity * uGravityRamp * uDt * uDt;
  float invMassSelf = 1.0 / max(uMassDensity * areaShare, 1e-6);

  // Structural: every unique triangle edge (see assemble.js deriveNeighbors).
  // A Delaunay triangle's own edges already resist shear the way a
  // quad-grid's diagonals would, so there is no separate shear pass.
  vec4 sA = texture2D(uStructNbrA, uv);
  vec4 sB = texture2D(uStructNbrB, uv);
  vec4 srA = texture2D(uStructRestA, uv);
  vec4 srB = texture2D(uStructRestB, uv);
  vec4 structAcc = vec4(0.0);
  structAcc += neighborCorrection(predicted, sA.x, srA.x, invMassSelf);
  structAcc += neighborCorrection(predicted, sA.y, srA.y, invMassSelf);
  structAcc += neighborCorrection(predicted, sA.z, srA.z, invMassSelf);
  structAcc += neighborCorrection(predicted, sA.w, srA.w, invMassSelf);
  structAcc += neighborCorrection(predicted, sB.x, srB.x, invMassSelf);
  structAcc += neighborCorrection(predicted, sB.y, srB.y, invMassSelf);
  structAcc += neighborCorrection(predicted, sB.z, srB.z, invMassSelf);
  structAcc += neighborCorrection(predicted, sB.w, srB.w, invMassSelf);
  if (structAcc.w > 0.5) predicted -= (structAcc.xyz / structAcc.w) * uStructStiff;

  // Bend: the fold/hinge constraint between the two off-edge vertices of
  // each pair of triangles sharing an edge.
  vec4 bA = texture2D(uBendNbrA, uv);
  vec4 bB = texture2D(uBendNbrB, uv);
  vec4 brA = texture2D(uBendRestA, uv);
  vec4 brB = texture2D(uBendRestB, uv);
  vec4 bendAcc = vec4(0.0);
  bendAcc += neighborCorrection(predicted, bA.x, brA.x, invMassSelf);
  bendAcc += neighborCorrection(predicted, bA.y, brA.y, invMassSelf);
  bendAcc += neighborCorrection(predicted, bA.z, brA.z, invMassSelf);
  bendAcc += neighborCorrection(predicted, bA.w, brA.w, invMassSelf);
  bendAcc += neighborCorrection(predicted, bB.x, brB.x, invMassSelf);
  bendAcc += neighborCorrection(predicted, bB.y, brB.y, invMassSelf);
  bendAcc += neighborCorrection(predicted, bB.z, brB.z, invMassSelf);
  bendAcc += neighborCorrection(predicted, bB.w, brB.w, invMassSelf);
  if (bendAcc.w > 0.5) predicted -= (bendAcc.xyz / bendAcc.w) * uBendStiff;

  // Body collision — after relaxation, before finalizing (relaxation can
  // pull a particle back into the body; doing this last guarantees the
  // frame's final position is outside every capsule regardless).
  for (int i = 0; i < ${MAX_COLLISION_CAPSULES}; i++) {
    if (i >= uCapsuleCount) break;
    predicted = collideCapsule(predicted, prevPos, uCapA[i], uCapB[i], uCapR0[i], uCapR1[i], uCapZScale[i], uFriction);
  }

  // Self-collision last: a fold pushed apart here should not get shoved
  // back into the body by an earlier pass re-running on it.
  vec3 selfCorr = selfCollisionCorrection(predicted, texture2D(uRestPosition, uv).xyz, myFlatIdx);
  predicted += selfCorr;

  if (predicted.y < uFloorY) predicted.y = uFloorY;

  gl_FragColor = vec4(predicted, 0.0);
}
`
}

// Must snapshot texturePosition's PRE-step value — GPUComputationRenderer
// guarantees every variable's shader reads a consistent pre-compute()
// snapshot this frame (all writes swap in together at the end of compute()),
// so this and the position shader above always see the same starting state.
function prevPositionFragmentShader() {
  return `
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  gl_FragColor = texture2D(texturePosition, uv);
}
`
}

// Pads a variable-length rig out to the shader's fixed-size arrays. Unused
// tail slots are never read (the shader loop `break`s at uCapsuleCount) but
// are still given harmless finite values rather than leaving them
// uninitialized.
function buildCollisionUniformValues(collisionRig) {
  const capA = Array.from({ length: MAX_COLLISION_CAPSULES }, () => new THREE.Vector3())
  const capB = Array.from({ length: MAX_COLLISION_CAPSULES }, () => new THREE.Vector3())
  const capR0 = new Array(MAX_COLLISION_CAPSULES).fill(0)
  const capR1 = new Array(MAX_COLLISION_CAPSULES).fill(0)
  const capZScale = new Array(MAX_COLLISION_CAPSULES).fill(1)
  const count = Math.min(collisionRig.length, MAX_COLLISION_CAPSULES)
  for (let i = 0; i < count; i++) {
    const p = collisionRig[i]
    capA[i].set(p.a[0], p.a[1], p.a[2])
    capB[i].set(p.b[0], p.b[1], p.b[2])
    capR0[i] = p.ra
    capR1[i] = p.rb
    capZScale[i] = p.zScale
  }
  return { capA, capB, capR0, capR1, capZScale, count }
}

// 1.2cm push-apart radius, 3.5cm rest-space exclusion — comfortably above
// the ~2cm Delaunay triangulation spacing (see triangulate.js) so directly
// adjacent mesh vertices are always excluded as "normal local fabric," while
// still catching a genuine tight self-fold (see selfCollisionGlsl above).
const DEFAULT_SELF_COLLISION = { radius: 0.012, restThreshold: 0.035 }

export class ClothSimulation {
  constructor(renderer, cloth, neighbors, fabric, { floorY = 0, collisionRig = [], selfCollision = DEFAULT_SELF_COLLISION } = {}) {
    this.frameCount = 0
    this.simParticleCount = cloth.simParticleCount
    this.texDim = textureDimFor(cloth.simParticleCount)

    const gpuCompute = new GPUComputationRenderer(this.texDim, this.texDim, renderer)
    this.gpuCompute = gpuCompute

    const posTex = gpuCompute.createTexture()
    const prevTex = gpuCompute.createTexture()
    for (let i = 0; i < cloth.simParticleCount; i++) {
      const x = cloth.simRestPositions[i * 3], y = cloth.simRestPositions[i * 3 + 1], z = cloth.simRestPositions[i * 3 + 2]
      posTex.image.data[i * 4] = x; posTex.image.data[i * 4 + 1] = y; posTex.image.data[i * 4 + 2] = z; posTex.image.data[i * 4 + 3] = 0
      prevTex.image.data[i * 4] = x; prevTex.image.data[i * 4 + 1] = y; prevTex.image.data[i * 4 + 2] = z; prevTex.image.data[i * 4 + 3] = 0
    }

    const posVar = gpuCompute.addVariable('texturePosition', positionFragmentShader(this.texDim), posTex)
    const prevVar = gpuCompute.addVariable('texturePrevPosition', prevPositionFragmentShader(), prevTex)
    gpuCompute.setVariableDependencies(posVar, [posVar, prevVar])
    gpuCompute.setVariableDependencies(prevVar, [posVar])
    this.posVar = posVar
    this.prevVar = prevVar

    const areaTex = gpuCompute.createTexture()
    for (let i = 0; i < cloth.simParticleCount; i++) {
      areaTex.image.data[i * 4] = cloth.simAreaShare[i]
      areaTex.image.data[i * 4 + 1] = 0 // pinned flag — nothing pinned yet; grab-drag uses uDragParticleIndex instead (see setDragParticle)
    }

    // Permanently static (never ping-pongs, unlike texturePosition) — the
    // self-collision exclusion test compares against the UNDEFORMED rest
    // pose, not whatever texturePosition has drifted to.
    const restTex = gpuCompute.createTexture()
    for (let i = 0; i < cloth.simParticleCount; i++) {
      restTex.image.data[i * 4] = cloth.simRestPositions[i * 3]
      restTex.image.data[i * 4 + 1] = cloth.simRestPositions[i * 3 + 1]
      restTex.image.data[i * 4 + 2] = cloth.simRestPositions[i * 3 + 2]
    }

    const structTex = packNeighborTextures(neighbors.structural, neighbors.maxNeighbors, this.texDim)
    const bendTex = packNeighborTextures(neighbors.bend, neighbors.maxNeighbors, this.texDim)
    const cap = buildCollisionUniformValues(collisionRig)

    Object.assign(posVar.material.uniforms, {
      uAreaShare: { value: areaTex },
      uRestPosition: { value: restTex },
      uStructNbrA: { value: structTex.nbrA }, uStructNbrB: { value: structTex.nbrB },
      uStructRestA: { value: structTex.restA }, uStructRestB: { value: structTex.restB },
      uBendNbrA: { value: bendTex.nbrA }, uBendNbrB: { value: bendTex.nbrB },
      uBendRestA: { value: bendTex.restA }, uBendRestB: { value: bendTex.restB },
      uDt: { value: SUBSTEP_DT },
      uGravityRamp: { value: 0 },
      uGravity: { value: GRAVITY },
      uDamping: { value: fabric.damping },
      uMassDensity: { value: fabric.massDensity },
      uStructStiff: { value: fabric.structStiff },
      uBendStiff: { value: fabric.bendStiff },
      uFloorY: { value: floorY },
      uFriction: { value: fabric.friction },
      uCapsuleCount: { value: cap.count },
      uCapA: { value: cap.capA }, uCapB: { value: cap.capB },
      uCapR0: { value: cap.capR0 }, uCapR1: { value: cap.capR1 },
      uCapZScale: { value: cap.capZScale },
      uParticleCount: { value: cloth.simParticleCount },
      uApplySelfCollision: { value: 0 },
      uSelfCollisionRadius: { value: selfCollision.radius },
      uSelfCollisionRestThreshold: { value: selfCollision.restThreshold },
      uDragParticleIndex: { value: -1 },
      uDragTargetPosition: { value: new THREE.Vector3() },
    })

    const error = gpuCompute.init()
    if (error !== null) throw new Error(`ClothSimulation: GPUComputationRenderer init failed: ${error}`)
  }

  setFabric(fabric) {
    const u = this.posVar.material.uniforms
    u.uDamping.value = fabric.damping
    u.uMassDensity.value = fabric.massDensity
    u.uStructStiff.value = fabric.structStiff
    u.uBendStiff.value = fabric.bendStiff
    u.uFriction.value = fabric.friction
  }

  // Pins `particleIndex` to `targetPosition` every substep until cleared —
  // the shader early-exits it straight to this target (see the
  // `myFlatIdx == uDragParticleIndex` check), so it never fights the
  // solver while dragged. Called every pointermove; cheap (2 uniform
  // writes, no texture rebuild).
  setDragParticle(particleIndex, targetPosition) {
    const u = this.posVar.material.uniforms
    u.uDragParticleIndex.value = particleIndex
    u.uDragTargetPosition.value.copy(targetPosition)
  }

  clearDrag() {
    this.posVar.material.uniforms.uDragParticleIndex.value = -1
  }

  // Fixed substeps only — never feed a raw rAF delta straight into the
  // physics (a classic "explodes on a stutter" bug). A huge delta (tab was
  // backgrounded) skips this frame entirely rather than catch-up-stepping.
  step(delta) {
    if (delta > 0.5) return
    this.frameCount++
    const gravityRamp = Math.min(1, this.frameCount / GRAVITY_RAMP_FRAMES)
    const u = this.posVar.material.uniforms
    u.uGravityRamp.value = gravityRamp
    for (let i = 0; i < SUBSTEPS; i++) {
      // Self-collision is O(N^2) — affordable once per rendered frame, not
      // once per substep (see selfCollisionGlsl's cost comment). Running it
      // on the LAST substep means it sees the frame's fully-relaxed,
      // post-body-collision positions rather than an intermediate one.
      u.uApplySelfCollision.value = i === SUBSTEPS - 1 ? 1 : 0
      this.gpuCompute.compute()
    }
  }

  getPositionTexture() {
    return this.gpuCompute.getCurrentRenderTarget(this.posVar).texture
  }

  dispose() {
    this.gpuCompute.dispose()
  }
}
