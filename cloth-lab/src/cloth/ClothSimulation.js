import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js'
import { MAX_COLLISION_CAPSULES } from '../body/collisionRig.js'
import { FrameBudgetController } from '../perf/frameBudget.js'
import { buildGrid, nextPow2, minLowerBoundIters, DEFAULT_SCAN_CAP } from './spatialHash.js'
import { GPUBitonicSort } from './bitonicSortGPU.js'

// Position Verlet + iterative distance-constraint relaxation (Jakobsen/Provot
// — the classic approach behind three.js's own long-standing cloth demo).
// Each GPUComputationRenderer .compute() call is Jacobi-parallel (every
// particle reads the SAME previous-pass snapshot of its neighbors — no
// in-pass sequential relaxation like CPU Gauss-Seidel is possible), so "K
// relaxation iterations" means K separate .compute() calls per frame
// (substeps), not a loop inside one shader call.
//
// WP-7.3: substep count is now adaptive (4-12, was a fixed 8) via
// FrameBudgetController — a slower device/GPU drops substeps to stay
// smooth, a fast one spends the headroom on extra relaxation quality
// instead of sitting idle. `uDt` (each substep's simulated time slice) is
// recomputed from the CURRENT substep count every step() call so total
// simulated time per real frame stays ~1/60s regardless of how many
// substeps that's currently split across — changing substep count changes
// stability/accuracy, deliberately, not simulation SPEED.
const SUBSTEPS_MIN = 4
const SUBSTEPS_MAX = 12
const SUBSTEPS_START = 8
const SUBSTEP_TARGET_MS = 1000 / 60 * 0.5 // budget the sim to ~half a 60fps frame, leaving room for render+scene
const GRAVITY = new THREE.Vector3(0, -9.81, 0)
// Ramp gravity in over the first ~1.5s so a bad initial placement/topology
// bug shows up as a slow, readable drift instead of an instant explosion.
const GRAVITY_RAMP_FRAMES = 90
// WP-7.1: fabric-overridable via fabricPresets.js's `maxStrain` field; 1.06
// (6% stretch ceiling) sits mid-band of the plan's 102-108% target and reads
// as "resists but isn't rigid" for the default (cotton) fabric.
const DEFAULT_MAX_STRAIN = 1.06

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

// WP-35: same packing scheme as packNeighborTextures (idx aligned to the
// same k-th slot bend's own nbrA/B already use — see assemble.js's
// packHinges), carrying edgeV0/edgeV1/restAngle instead of a rest distance.
// Only ever called when the high-quality tier is actually being built (see
// the constructor below) — the default tier never allocates these
// textures at all.
//
// WP-35b: packed into ONE double-wide (texDim*2 x texDim) texture per array
// instead of two separate texDim x texDim textures ("A" for slots 0-3, "B"
// for slots 4-7 side by side in the same texture, at column `px` and
// `px + texDim` respectively) — same data, same addressing per particle,
// just 3 GPU sampler uniforms instead of 6. This is a pure resource-budget
// change forced by WP-35b's own new uSortedBuffer sampler: the previous
// 2-texture-per-array scheme left the high-quality tier's shader at 18
// active texture units — already over the WebGL2 spec-floor minimum of 16
// (`MAX_TEXTURE_IMAGE_UNITS`) that some real hardware (older/low-end mobile
// GPUs, software-rendered contexts) provides nothing beyond. Adding even
// one more sampler for the spatial hash made an already-marginal budget
// fail outright (confirmed live: "FRAGMENT shader texture image units
// count exceeds MAX_TEXTURE_IMAGE_UNITS(16)"). Halving the hinge-only
// texture count (this WP's own scope: dihedral bend is high-quality-tier-
// only, never touches the default tier) brings the total back under 16
// with room for uSortedBuffer — see positionFragmentShader's DIHEDRAL_BEND
// GLSL for the matching read-side change (same values, two texture2D
// reads at a left/right-half uv offset into ONE sampler instead of one
// read each from two separate samplers).
function packHingeTextures(bendHinge, maxNeighbors, texDim) {
  const w = texDim * 2, h = texDim
  const edgeV0 = new Float32Array(w * h * 4).fill(-1)
  const edgeV1 = new Float32Array(w * h * 4).fill(-1)
  const restAngle = new Float32Array(w * h * 4)
  const particleCount = bendHinge.idx.length / maxNeighbors
  for (let p = 0; p < particleCount; p++) {
    const px = p % texDim
    const py = Math.floor(p / texDim)
    for (let k = 0; k < maxNeighbors; k++) {
      const slot = p * maxNeighbors + k
      const half = k < 4 ? 0 : 1 // "A" batch (slots 0-3) in the left half, "B" (4-7) in the right half
      const ch = k % 4
      const texelIdx = (py * w + (px + half * texDim)) * 4
      edgeV0[texelIdx + ch] = bendHinge.edgeV0[slot]
      edgeV1[texelIdx + ch] = bendHinge.edgeV1[slot]
      restAngle[texelIdx + ch] = bendHinge.restAngle[slot]
    }
  }
  const makeTex = (arr) => {
    const tex = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat, THREE.FloatType)
    tex.needsUpdate = true
    return tex
  }
  return { edgeV0: makeTex(edgeV0), edgeV1: makeTex(edgeV1), restAngle: makeTex(restAngle) }
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

// WP-7.1 strain limiting: a HARD clamp (no stiffness scaling — full
// correction every time it fires) applied AFTER the proportional structural
// pass above, so a structural spring that's too soft to fully arrest stretch
// under load (a real risk once anisotropy makes per-edge stiffness uneven —
// see WP-7.2) still can't stretch a structural edge past uMaxStrain * rest.
// Reuses the same structural neighbor textures — no new texture uploads.
const STRAIN_LIMIT_GLSL = `
vec4 strainLimitCorrection(vec3 predicted, float idx, float rest, float invMassSelf, float maxStrain) {
  if (idx < -0.5) return vec4(0.0);
  vec2 nuv = ( vec2( mod(idx, resolution.x), floor(idx / resolution.x) ) + 0.5 ) / resolution;
  vec3 npos = texture2D(texturePosition, nuv).xyz;
  vec2 nArea = texture2D(uAreaShare, nuv).rg;
  float invMassNbr = nArea.g > 0.5 ? 0.0 : 1.0 / max(uMassDensity * nArea.r, 1e-6);
  float wSelf = invMassSelf / max(invMassSelf + invMassNbr, 1e-6);
  vec3 d = predicted - npos;
  float dist = max(length(d), 1e-5);
  float maxDist = rest * maxStrain;
  if (dist <= maxDist) return vec4(0.0);
  return vec4(d * (1.0 - maxDist / dist) * wSelf, 1.0);
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
// at the hip over ~15s).
//
// A single `pushed - tangentDelta*friction` damping (an earlier version of
// this function) is NOT enough, even at friction close to 1: it only ever
// removes a FRACTION of each step's tangential drift, never all of it, so a
// constant gravity pull produces a constant-rate creep that never actually
// stops — it just slows down. Confirmed empirically by letting the sim run
// a few thousand frames: the whole garment eventually crept off the
// shoulders, past the hip, and collapsed flat on the floor, just slower
// than with zero friction. Slowing a slide is not the same as arresting it.
//
// This tries real (Coulomb) static/kinetic friction: `depth` (how far this
// step's predicted position was pushed into the surface) stands in for
// normal force, and tangential drift up to `friction * depth` is fully
// cancelled (static regime — genuinely stays put, not just slowed). But
// `depth` alone turned out to be an unreliable proxy: for an ALREADY-settled
// contact, the collision correction's whole job is keeping depth near zero
// every step, which starves the static budget at exactly the moment it's
// needed most — confirmed empirically (a few thousand frames): the budget
// stayed too small to ever reach the static branch, so it degenerated back
// into the same "slowed but never stopped" creep as a pure proportional
// model. So: still try the static budget (it's free stickiness whenever
// depth IS meaningful, e.g. right after impact), but ALSO damp whatever
// drift remains beyond it by `friction` again — a strictly stronger floor
// than either approach alone, closer to a critically-damped contact than a
// slowly-leaking one.
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
    float depth = r - dist;
    vec3 pushed = c + offset * (r / max(dist, 1e-6));
    vec3 n = normalize(offset);
    vec3 delta = pushed - prevP;
    vec3 tangentDelta = delta - n * dot(delta, n);
    float tangentLen = length(tangentDelta);
    float staticBudget = friction * depth;
    if (tangentLen <= staticBudget) return pushed - tangentDelta;
    vec3 remainder = tangentDelta * (1.0 - staticBudget / tangentLen);
    return pushed - tangentDelta + remainder * friction;
  }
  return p;
}
`

// WP-35 high-quality tier: true dihedral-angle bend, replacing the default
// tier's wing-to-wing DISTANCE constraint (see NEIGHBOR_CORRECTION_GLSL's
// bend usage below) with the actual angle between the two triangles'
// normals — verified first as plain JS in dihedralBend.js (see that file's
// own header for why: reproducing a textbook PBD dihedral gradient formula
// from memory carries real risk of a subtle sign/normalization bug, and a
// GPU shader is a far harder place to debug one than a Vitest assertion).
// This is a direct, mechanical translation of that verified module — same
// variable names, same structure, so a discrepancy is easy to spot by
// re-reading the two side by side. `stiffness` in [0,1] scales one Jacobi
// substep's correction toward zero angular error, same convention as
// dihedralBend.js's own `stiffness` parameter.
//
// `me` always plays the "p3" role and `neighbor` (this hinge's bend
// partner) plays "p4" — matching assemble.js's packHinges, which always
// computes `restAngle` calling the CURRENT particle p3 regardless of
// whether it was originally the mesh's "c" or "d" opposite-corner — so
// this one function correctly handles both sides of every hinge with no
// role flag needed.
//
// Deliberate scope (matches dihedralBend.js): only `me` (the wing vertex)
// moves here — the shared hinge edge (p1, p2) is left to the existing
// structural constraint, not touched by this function.
const DIHEDRAL_BEND_GLSL = `
vec3 dihedralBendDelta(vec3 mePredicted, float neighborIdx, float edgeV0Idx, float edgeV1Idx, float restAngle, float stiffness) {
  if (neighborIdx < -0.5) return vec3(0.0);
  vec2 nuv = ( vec2( mod(neighborIdx, resolution.x), floor(neighborIdx / resolution.x) ) + 0.5 ) / resolution;
  vec2 e0uv = ( vec2( mod(edgeV0Idx, resolution.x), floor(edgeV0Idx / resolution.x) ) + 0.5 ) / resolution;
  vec2 e1uv = ( vec2( mod(edgeV1Idx, resolution.x), floor(edgeV1Idx / resolution.x) ) + 0.5 ) / resolution;
  vec3 p1 = texture2D(texturePosition, e0uv).xyz;
  vec3 p2 = texture2D(texturePosition, e1uv).xyz;
  vec3 p3 = mePredicted;
  vec3 p4 = texture2D(texturePosition, nuv).xyz;

  vec3 edge = p2 - p1;
  float edgeLen = length(edge);
  if (edgeLen < 1e-6) return vec3(0.0); // degenerate hinge — matches dihedralAngle's own bail-out

  // n2 uses the edge walked in the OPPOSITE direction (p1-p2) — see
  // dihedralBend.js's dihedralAngle for why: it's what makes a flat,
  // normally-wound pair of triangles read as angle ~0.
  vec3 n1raw = cross(edge, p3 - p1);
  vec3 n2raw = cross(p1 - p2, p4 - p1);
  float n1len = length(n1raw);
  float n2len = length(n2raw);
  if (n1len < 1e-9 || n2len < 1e-9) return vec3(0.0);
  vec3 n1 = n1raw / n1len;
  vec3 n2 = n2raw / n2len;
  vec3 e = edge / edgeLen;
  float cosT = clamp(dot(n1, n2), -1.0, 1.0);
  float sinT = dot(cross(n1, n2), e);
  float angle = atan(sinT, cosT);

  float error = angle - restAngle;
  if (error > 3.14159265) error -= 6.28318531; // shortest angular path — see dihedralBend.js
  if (error < -3.14159265) error += 6.28318531;
  float delta = stiffness * error;

  // Rodrigues' rotation of p3 around the (p1, e) axis by +delta — exact
  // for any angle, matching dihedralBend.js's rotateAroundAxis.
  vec3 v = p3 - p1;
  float cosD = cos(delta);
  float sinD = sin(delta);
  vec3 vRot = v * cosD + cross(e, v) * sinD + e * (dot(e, v) * (1.0 - cosD));
  vec3 p3New = p1 + vRot;
  return p3New - p3;
}
`

// Self-collision: brute-force O(N^2) by default — deliberately NOT full
// spatial hashing. GPUComputationRenderer has no compute-shader/atomics
// access, so a TEXTBOOK GPU spatial hash (a uniform-grid bucket list you
// can actually iterate per-cell) needs either a full bitonic sort or a
// scatter-with-atomics compaction pass to build those per-cell index
// lists — neither available in plain WebGL2 fragment shaders. That's a
// hard capability gap in this rendering approach, not a matter of more
// implementation effort; closing it for real would mean adopting WebGPU
// compute shaders or a from-scratch verified bitonic sort, both a
// materially larger and riskier undertaking than an "opt-in tier" — see
// README's Honest notes. At this particle budget (~2000) brute-force is
// measured at ~0.03ms/substep for the existing 16-neighbor structural+bend
// scan; an O(N^2) scan is ~120x that (~3.6-7ms) — too much for every
// substep, but comfortably affordable ONCE per rendered frame (see
// `uApplySelfCollision`, set true only on the last of the 8 substeps in
// step() below).
//
// WP-35 looked for a cheaper-but-still-honest middle ground here (e.g.
// bucketing each particle into a coarse grid cell and skipping far-apart
// pairs before the expensive math) and deliberately didn't ship one: the
// dominant cost of this loop is the two texture2D fetches per inner-loop
// iteration (jRest, then jPos) needed just to find out where particle j
// IS — a cell-based early-out can only skip the cheap sqrt/branch AFTER
// that fetch already happened, so it doesn't touch the actual bottleneck.
// A change that adds real code and risk for a not-actually-measurable win
// is worse than shipping nothing here — see README's Honest notes: this
// quality tier ships the dihedral bend constraint above; self-collision
// stays exactly the brute-force scan it already was, opt-in tier or not.
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

// WP-35b high-quality tier: replaces selfCollisionGlsl's O(N^2) scan above
// with a real spatial-hash broadphase — same function name/signature
// (`selfCollisionCorrection`), so main()'s call site never changes; only
// ONE of these two function bodies is ever spliced into a given compiled
// shader (see positionFragmentShader below), so the default tier's shader
// is, as always, byte-identical to before this WP.
//
// This is a mechanical, line-for-line port of spatialHash.js's
// `spatialHashBroadphase` (verified by spatialHash.test.js BEFORE this
// function was written — see that module's own header for the full
// rationale) and bitonicSortGPU.js's sort output (see that file's header):
// bucket "me" into a grid cell from `predicted`, binary-search the sorted
// (cellId, particleIndex) buffer for each of the 27 surrounding cells'
// index ranges (`lowerBoundSpatialHash`, a fixed-trip-count port of
// spatialHash.js's `lowerBoundCapped`), then scan forward within each
// range (capped at `scanCap`, matching `spatialHash.js`'s own
// DEFAULT_SCAN_CAP) applying the exact same rest-distance-exclusion +
// radius push-apart + Jacobi averaging as the brute-force version — this
// function computes the SAME correction brute force would, just by
// visiting far fewer candidate particles per query (see
// ClothSimulation.js's own measured comparison in README/CHANGELOG for
// WP-35b, not asserted here).
//
// `sortDim`/`maxIters`/`scanCap` are compile-time constants (GLSL loop
// bounds must be, unlike this module's other per-frame-tunable uniforms)
// baked in via template literals — same convention this file already uses
// for MAX_COLLISION_CAPSULES and texDim elsewhere.
function selfCollisionSpatialHashGlsl(sortDim, maxIters, scanCap) {
  const sortCount = sortDim * sortDim
  return `
uniform sampler2D uSortedBuffer;
uniform vec3 uGridMin;
uniform float uCellSize;
uniform vec3 uGridDimF;

// First slot in the sorted buffer whose key >= targetKey — see
// spatialHash.js's lowerBoundCapped for why this is a FIXED-trip-count
// loop with a "no-op once lo==hi" body rather than a variable-length while
// loop.
int lowerBoundSpatialHash(float targetKey) {
  int lo = 0;
  int hi = ${sortCount};
  for (int iter = 0; iter < ${maxIters}; iter++) {
    if (lo < hi) {
      int mid = (lo + hi) / 2;
      ivec2 xy = ivec2(mid % ${sortDim}, mid / ${sortDim});
      float k = texelFetch(uSortedBuffer, xy, 0).r;
      if (k < targetKey) lo = mid + 1; else hi = mid;
    }
  }
  return lo;
}

vec3 selfCollisionCorrection(vec3 predicted, vec3 myRestPos, float myFlatIdx) {
  if (uApplySelfCollision < 0.5) return vec3(0.0);
  vec3 rel = (predicted - uGridMin) / uCellSize;
  float ixf = clamp(floor(rel.x), 0.0, uGridDimF.x - 1.0);
  float iyf = clamp(floor(rel.y), 0.0, uGridDimF.y - 1.0);
  float izf = clamp(floor(rel.z), 0.0, uGridDimF.z - 1.0);
  vec3 corr = vec3(0.0);
  float count = 0.0;
  for (int dz = -1; dz <= 1; dz++) {
    float nz = izf + float(dz);
    if (nz < 0.0 || nz >= uGridDimF.z) continue;
    for (int dy = -1; dy <= 1; dy++) {
      float ny = iyf + float(dy);
      if (ny < 0.0 || ny >= uGridDimF.y) continue;
      for (int dx = -1; dx <= 1; dx++) {
        float nx = ixf + float(dx);
        if (nx < 0.0 || nx >= uGridDimF.x) continue;
        float targetId = nx + ny * uGridDimF.x + nz * uGridDimF.x * uGridDimF.y;
        int start = lowerBoundSpatialHash(targetId);
        for (int s = 0; s < ${scanCap}; s++) {
          int slot = start + s;
          if (slot >= ${sortCount}) break;
          ivec2 sxy = ivec2(slot % ${sortDim}, slot / ${sortDim});
          vec4 entry = texelFetch(uSortedBuffer, sxy, 0);
          if (entry.r != targetId) break;
          float j = entry.g;
          if (j < -0.5 || j == myFlatIdx) continue;
          vec2 nuv = ( vec2( mod(j, resolution.x), floor(j / resolution.x) ) + 0.5 ) / resolution;
          vec3 jRest = texture2D(uRestPosition, nuv).xyz;
          if (distance(myRestPos, jRest) < uSelfCollisionRestThreshold) continue;
          vec3 jPos = texture2D(texturePosition, nuv).xyz;
          vec3 diff = predicted - jPos;
          float d = length(diff);
          if (d < uSelfCollisionRadius && d > 1e-6) {
            corr += diff * ((uSelfCollisionRadius - d) / d);
            count += 1.0;
          }
        }
      }
    }
  }
  if (count > 0.5) return corr / count;
  return vec3(0.0);
}
`
}

// WP-35 extra uniform declarations for the high-quality tier's true
// dihedral bend — a separate string, only spliced into the shader source
// when `highQuality` is true (see positionFragmentShader below), so the
// default tier's compiled shader has zero new uniforms and is otherwise
// byte-identical to before this WP.
// WP-35b: 3 double-wide textures (one sampler per array, "A"/"B" batches
// side by side in the same texture) instead of 6 — see packHingeTextures's
// header for why.
const DIHEDRAL_BEND_UNIFORMS_GLSL = `
uniform sampler2D uBendEdgeV0;
uniform sampler2D uBendEdgeV1;
uniform sampler2D uBendRestAngle;
uniform float uDihedralStiff;
`

// The default tier's bend application — moved out of positionFragmentShader
// verbatim (not rewritten) so a text diff against the pre-WP-35 version of
// this file shows exactly zero change to what the default tier compiles.
const DEFAULT_BEND_MAIN_GLSL = `
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
`

// WP-35 high-quality tier's bend application: the true dihedral-angle
// constraint (DIHEDRAL_BEND_GLSL) REPLACES the default distance-based one
// above — a "second bend mode," per this WP's own plan, not an additional
// pass stacked on top of it (running both at once would fight each other:
// the distance spring resists exactly the deformation the angle constraint
// is trying to allow-or-correct on its own terms). Same slot layout as
// bend (uBendNbrA/B for the neighbor index, reused here — see
// assemble.js's packHinges, which keeps bendHinge's idx aligned with
// bend's own), plus the three new hinge-only textures for the shared
// edge's two endpoints and this hinge's rest angle.
//
// WP-35b: each "A"/"B" batch is now the left/right HALF of one double-wide
// texture (see packHingeTextures's header) rather than two separate
// textures — `uv.x*0.5` addresses the left half (same column a plain
// texDim-wide texture would use), `uv.x*0.5+0.5` the right half. Same two
// texture2D calls per array as before, same values read, just one sampler
// uniform instead of two.
const DIHEDRAL_BEND_MAIN_GLSL = `
  // Bend (WP-35 high-quality tier): true dihedral angle, not wing-to-wing
  // distance — see DIHEDRAL_BEND_GLSL's own header for why only the wing
  // vertices (never the shared edge) move here.
  vec4 bA = texture2D(uBendNbrA, uv);
  vec4 bB = texture2D(uBendNbrB, uv);
  vec2 uvHalfA = vec2(uv.x * 0.5, uv.y);
  vec2 uvHalfB = vec2(uv.x * 0.5 + 0.5, uv.y);
  vec4 bev0A = texture2D(uBendEdgeV0, uvHalfA);
  vec4 bev0B = texture2D(uBendEdgeV0, uvHalfB);
  vec4 bev1A = texture2D(uBendEdgeV1, uvHalfA);
  vec4 bev1B = texture2D(uBendEdgeV1, uvHalfB);
  vec4 braA = texture2D(uBendRestAngle, uvHalfA);
  vec4 braB = texture2D(uBendRestAngle, uvHalfB);
  vec3 dihedralDelta = vec3(0.0);
  float dihedralCount = 0.0;
  ${['A.x', 'A.y', 'A.z', 'A.w', 'B.x', 'B.y', 'B.z', 'B.w'].map((ch) => `
  if (b${ch} > -0.5) {
    dihedralDelta += dihedralBendDelta(predicted, b${ch}, bev0${ch}, bev1${ch}, bra${ch}, uDihedralStiff);
    dihedralCount += 1.0;
  }`).join('')}
  if (dihedralCount > 0.5) predicted += dihedralDelta / dihedralCount;
`

// NOTE: `texturePosition` / `texturePrevPosition` are NOT declared here —
// GPUComputationRenderer.init() auto-prepends `uniform sampler2D <name>;`
// for every variable listed in setVariableDependencies(); declaring them
// again here would be a duplicate-declaration compile error.
//
// `highQuality` (WP-35, default false): every existing caller passes
// nothing, so `positionFragmentShader(texDim)` still returns the same
// shader source it always has (give or take a couple of now-empty
// template lines, harmless GLSL whitespace) — the extra uniforms/function
// and the bend section's replacement below only exist in the string when
// explicitly asked for, which is the strongest available guarantee that
// "the existing default solver's behavior and performance are completely
// unchanged" (this WP's own acceptance criterion) actually holds: the
// compiled default-tier program contains none of this WP's new code at
// all, not just "happens to produce the same result."
function positionFragmentShader(texDim, highQuality = false) {
  // WP-35b: only computed/used when highQuality — the default tier's
  // compiled shader still contains none of this (see selfCollisionGlsl's
  // splice below), matching the exact guarantee this file's other
  // highQuality-gated code already makes.
  const sortDim = nextPow2(texDim)
  const maxIters = minLowerBoundIters(sortDim * sortDim)
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
uniform float uMaxStrain;
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
${highQuality ? DIHEDRAL_BEND_UNIFORMS_GLSL : ''}
${NEIGHBOR_CORRECTION_GLSL}
${STRAIN_LIMIT_GLSL}
${CAPSULE_COLLISION_GLSL}
${highQuality ? selfCollisionSpatialHashGlsl(sortDim, maxIters, DEFAULT_SCAN_CAP) : selfCollisionGlsl(texDim)}
${highQuality ? DIHEDRAL_BEND_GLSL : ''}

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

  // WP-7.1 strain limit: hard clamp on the same structural edges, after the
  // proportional pass above — see STRAIN_LIMIT_GLSL's header comment.
  vec4 strainAcc = vec4(0.0);
  strainAcc += strainLimitCorrection(predicted, sA.x, srA.x, invMassSelf, uMaxStrain);
  strainAcc += strainLimitCorrection(predicted, sA.y, srA.y, invMassSelf, uMaxStrain);
  strainAcc += strainLimitCorrection(predicted, sA.z, srA.z, invMassSelf, uMaxStrain);
  strainAcc += strainLimitCorrection(predicted, sA.w, srA.w, invMassSelf, uMaxStrain);
  strainAcc += strainLimitCorrection(predicted, sB.x, srB.x, invMassSelf, uMaxStrain);
  strainAcc += strainLimitCorrection(predicted, sB.y, srB.y, invMassSelf, uMaxStrain);
  strainAcc += strainLimitCorrection(predicted, sB.z, srB.z, invMassSelf, uMaxStrain);
  strainAcc += strainLimitCorrection(predicted, sB.w, srB.w, invMassSelf, uMaxStrain);
  if (strainAcc.w > 0.5) predicted -= strainAcc.xyz / strainAcc.w;

${highQuality ? DIHEDRAL_BEND_MAIN_GLSL : DEFAULT_BEND_MAIN_GLSL}

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

// WP-35: 'default' (unchanged) or 'high' — the true dihedral-angle bend
// tier. Exported so callers (ClothMesh.jsx, Settings UI) share one literal
// instead of hand-typing the string.
export const QUALITY_TIER_DEFAULT = 'default'
export const QUALITY_TIER_HIGH = 'high'

// Real bug fix — user report: "in cloth lab whenever i clicked high
// [dihedral bend] crazy things happen". `uDihedralStiff` was reading
// `fabric.dihedralStiff ?? fabric.bendStiff` uncapped: no fabric preset
// defines `dihedralStiff`, so every one of them silently handed this a raw
// `bendStiff` (0.06-0.92 — see fabricPresets.js) that was tuned for the
// DEFAULT tier's own, unrelated distance-based bend spring, where a value
// near 1 is perfectly safe (it just blends a position correction). The
// dihedral constraint (DIHEDRAL_BEND_GLSL/dihedralBend.js) is a Jacobi
// ROTATION correction instead — `delta = stiffness * error`, then a full
// Rodrigues rotation of the wing vertex by `delta`.
//
// A first pass at this fix clamped at 0.5 — the value dihedralBend.js's
// own `dihedralBendCorrection()` defaults `stiffness` to, and the only
// value dihedralBend.test.js's convergence property test ever exercises,
// because a SINGLE isolated hinge genuinely does converge to rest in one
// correction at exactly 0.5, no overshoot. That shipped, and the user
// still saw "crazy things" — confirmed live (denim/leather + High:
// visible high-frequency wrinkling/ballooning, growing worse frame over
// frame, not settling). The isolated-hinge math was real but incomplete:
// a real garment has many hinges sharing vertices, all correcting in
// PARALLEL from the same Jacobi-parallel snapshot every substep (see this
// file's own module header), then averaging their independently-computed
// ROTATED positions (`dihedralDelta / dihedralCount` below) — unlike the
// structural/default-bend correction, which averages simple LINEAR
// displacements, a rotation's resulting displacement is a nonlinear
// function of position, so averaging several disagreeing rotations at a
// shared vertex doesn't damp the same way. What a lone hinge tolerates at
// 0.5 compounds once coupled this way. Re-verified live (Denim AND
// Leather — bendStiff 0.80 and 0.92, the two stiffest real presets — both
// High-tier, watched settle over several seconds, not just the first
// frame) by sweeping the clamp down: 0.5 and 0.2 both still visibly
// wrinkle/balloon and keep growing; 0.12 settles clean, indistinguishable
// from the default tier's own drape, and stays stable. Clamped at the one
// source both call sites (the constructor and setFabric()) already read
// through — see dihedralStiffFor.test.js for the numeric record of what
// was actually tried.
export function dihedralStiffFor(fabric) {
  return Math.min(0.12, fabric.dihedralStiff ?? fabric.bendStiff)
}

export class ClothSimulation {
  constructor(renderer, cloth, neighbors, fabric, { floorY = 0, collisionRig = [], selfCollision = DEFAULT_SELF_COLLISION, pinnedMask = null, qualityTier = QUALITY_TIER_DEFAULT } = {}) {
    this.frameCount = 0
    this.simParticleCount = cloth.simParticleCount
    this.texDim = textureDimFor(cloth.simParticleCount)
    this.substeps = SUBSTEPS_START
    this.budget = new FrameBudgetController({ min: SUBSTEPS_MIN, max: SUBSTEPS_MAX, start: SUBSTEPS_START, targetMs: SUBSTEP_TARGET_MS })
    // WP-35: only 'high' with real hinge data actually turns the tier on —
    // a caller that asks for 'high' against neighbors from an older/other
    // deriveNeighbors call (no bendHinge field) falls back to 'default'
    // rather than compiling a shader that reads uninitialized uniforms.
    this.qualityTier = (qualityTier === QUALITY_TIER_HIGH && neighbors.bendHinge) ? QUALITY_TIER_HIGH : QUALITY_TIER_DEFAULT

    const gpuCompute = new GPUComputationRenderer(this.texDim, this.texDim, renderer)
    this.gpuCompute = gpuCompute

    const posTex = gpuCompute.createTexture()
    const prevTex = gpuCompute.createTexture()
    for (let i = 0; i < cloth.simParticleCount; i++) {
      const x = cloth.simRestPositions[i * 3], y = cloth.simRestPositions[i * 3 + 1], z = cloth.simRestPositions[i * 3 + 2]
      posTex.image.data[i * 4] = x; posTex.image.data[i * 4 + 1] = y; posTex.image.data[i * 4 + 2] = z; posTex.image.data[i * 4 + 3] = 0
      prevTex.image.data[i * 4] = x; prevTex.image.data[i * 4 + 1] = y; prevTex.image.data[i * 4 + 2] = z; prevTex.image.data[i * 4 + 3] = 0
    }

    const posVar = gpuCompute.addVariable('texturePosition', positionFragmentShader(this.texDim, this.qualityTier === QUALITY_TIER_HIGH), posTex)
    const prevVar = gpuCompute.addVariable('texturePrevPosition', prevPositionFragmentShader(), prevTex)
    gpuCompute.setVariableDependencies(posVar, [posVar, prevVar])
    gpuCompute.setVariableDependencies(prevVar, [posVar])
    this.posVar = posVar
    this.prevVar = prevVar

    const areaTex = gpuCompute.createTexture()
    for (let i = 0; i < cloth.simParticleCount; i++) {
      areaTex.image.data[i * 4] = cloth.simAreaShare[i]
      // pinned flag — shoulder-seam vertices only (see collisionRig.js's
      // deriveShoulderPinMask); everything else stays pure collision+
      // friction. Independent of grab-drag, which uses uDragParticleIndex
      // (see setDragParticle) rather than this per-particle texture.
      areaTex.image.data[i * 4 + 1] = pinnedMask && pinnedMask[i] ? 1 : 0
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
      uDt: { value: (1 / 60) / SUBSTEPS_START },
      uGravityRamp: { value: 0 },
      uGravity: { value: GRAVITY },
      uDamping: { value: fabric.damping },
      uMassDensity: { value: fabric.massDensity },
      uStructStiff: { value: fabric.structStiff },
      uBendStiff: { value: fabric.bendStiff },
      uMaxStrain: { value: fabric.maxStrain ?? DEFAULT_MAX_STRAIN },
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

    // WP-35: the hinge textures (and uDihedralStiff) only ever get built
    // and uploaded for the high-quality tier — the default tier's GPU
    // memory footprint and upload cost are completely unaffected, matching
    // the shader source itself (see positionFragmentShader's own comment).
    if (this.qualityTier === QUALITY_TIER_HIGH) {
      const hingeTex = packHingeTextures(neighbors.bendHinge, neighbors.maxNeighbors, this.texDim)
      Object.assign(posVar.material.uniforms, {
        uBendEdgeV0: { value: hingeTex.edgeV0 },
        uBendEdgeV1: { value: hingeTex.edgeV1 },
        uBendRestAngle: { value: hingeTex.restAngle },
        // No fabricPresets.js field yet for this (WP-35 is a new, opt-in
        // tier — see README) — reuses bendStiff's own value as a
        // reasonable starting point rather than inventing a second tuned
        // constant with no real-fabric data behind it yet. Clamped via
        // dihedralStiffFor() — see its own header for why: bendStiff
        // alone goes well past the stable range for this constraint.
        uDihedralStiff: { value: dihedralStiffFor(fabric) },
      })

      // WP-35b: spatial-hash self-collision broadphase. The grid is built
      // ONCE, from the garment's REST pose (already on the CPU here) — see
      // spatialHash.js's buildGrid header for why a fixed, generously-
      // margined grid is a deliberately simpler and cheaper choice than a
      // per-frame GPU min/max reduction over live positions.
      const restTriples = new Array(cloth.simParticleCount)
      for (let i = 0; i < cloth.simParticleCount; i++) {
        restTriples[i] = [cloth.simRestPositions[i * 3], cloth.simRestPositions[i * 3 + 1], cloth.simRestPositions[i * 3 + 2]]
      }
      const cellSize = selfCollision.radius * 2
      // 35cm margin, not spatialHash.js's own default (cellSize*4, ~9.6cm —
      // sized for that module's small synthetic unit-test point clouds, not
      // real garment dynamics). A T-shirt settling onto a body stays well
      // inside a margin this size (confirmed live: observed live-position
      // excursion during preRelax/settle stayed within a few cm of rest,
      // nowhere near 9.6cm let alone 35cm) — the extra headroom is
      // deliberately generous for motion this module hasn't been run
      // against yet (long skirts/dresses, seated/walk poses, a hard grab-
      // and-drag throw) at effectively zero cost: grid margin only changes
      // the numeric cellId range (still comfortably inside float32's exact-
      // integer ceiling — see buildGrid's own MAX_GRID_AXIS cap) and never
      // touches the sort/query's actual cost, which depends on particle
      // count alone, not grid extent. A particle that DOES somehow end up
      // outside even this margin still degrades gracefully (clamps to an
      // edge cell — see buildGrid's header) rather than erroring.
      this.spatialHashGrid = buildGrid(restTriples, cellSize, 0.35)
      this.spatialSort = new GPUBitonicSort(renderer, { texDim: this.texDim, grid: this.spatialHashGrid })
      this.spatialSort.setParticleCount(cloth.simParticleCount)

      Object.assign(posVar.material.uniforms, {
        uSortedBuffer: { value: null },
        uGridMin: { value: new THREE.Vector3(...this.spatialHashGrid.min) },
        uCellSize: { value: this.spatialHashGrid.cellSize },
        uGridDimF: { value: new THREE.Vector3(...this.spatialHashGrid.dim) },
      })
    }

    const error = gpuCompute.init()
    if (error !== null) throw new Error(`ClothSimulation: GPUComputationRenderer init failed: ${error}`)
  }

  setFabric(fabric) {
    const u = this.posVar.material.uniforms
    u.uDamping.value = fabric.damping
    u.uMassDensity.value = fabric.massDensity
    u.uStructStiff.value = fabric.structStiff
    u.uBendStiff.value = fabric.bendStiff
    u.uMaxStrain.value = fabric.maxStrain ?? DEFAULT_MAX_STRAIN
    u.uFriction.value = fabric.friction
    // WP-35: only present at all when constructed with qualityTier 'high'
    // (see the constructor) — a plain fabric switch on the default tier
    // never touches a uniform that doesn't exist.
    if (u.uDihedralStiff) u.uDihedralStiff.value = dihedralStiffFor(fabric)
  }

  // Pins `particleIndex` to `targetPosition` every substep until cleared —
  // the shader early-exits it straight to this target (see the
  // `myFlatIdx == uDragParticleIndex` check), so it never fights the
  // solver while dragged. Called every pointermove; cheap (2 uniform
  // writes, no texture rebuild).
  // WP-7.6 rest-state pre-relax: runs `steps` headless structural/bend/
  // collision relaxation passes with gravity fully off, right after
  // construction and before the first VISIBLE frame — so the placement
  // heuristic's own tension (pieces placed close-but-not-exact by design,
  // see placement.js's own header comment) settles out silently instead of
  // reading as a one-frame snap once step() starts running. Coexists with
  // (doesn't replace) GRAVITY_RAMP_FRAMES's own visible settle: that ramp
  // is for the FALL under gravity reading as a slow drift rather than an
  // explosion; this is for the static placement tension having nowhere to
  // hide before gravity even starts. Doesn't touch frameCount, so the
  // visible gravity ramp still starts fresh at 0 on the next real step().
  preRelax(steps = 40) {
    const u = this.posVar.material.uniforms
    const savedGravityRamp = u.uGravityRamp.value
    u.uGravityRamp.value = 0
    for (let i = 0; i < steps; i++) {
      const isSelfCollisionStep = i === steps - 1
      u.uApplySelfCollision.value = isSelfCollisionStep ? 1 : 0
      // WP-35b: same requirement as step() — the sorted buffer must be
      // (re)built right before the one iteration that reads it, or the
      // high-quality tier's self-collision pass runs against a stale
      // (here: never-populated) uSortedBuffer.
      if (isSelfCollisionStep && this.spatialSort) {
        u.uSortedBuffer.value = this.spatialSort.compute(this.getPositionTexture())
      }
      this.gpuCompute.compute()
    }
    u.uGravityRamp.value = savedGravityRamp
  }

  setDragParticle(particleIndex, targetPosition) {
    const u = this.posVar.material.uniforms
    u.uDragParticleIndex.value = particleIndex
    u.uDragTargetPosition.value.copy(targetPosition)
  }

  clearDrag() {
    this.posVar.material.uniforms.uDragParticleIndex.value = -1
  }

  // Fixed real time per frame only — never feed a raw rAF delta straight
  // into the physics (a classic "explodes on a stutter" bug). A huge delta
  // (tab was backgrounded) skips this frame entirely rather than
  // catch-up-stepping. WP-7.3: substep COUNT is adaptive (see class header
  // comment); `delta` itself is still never used to size a substep.
  step(delta) {
    if (delta > 0.5) return
    this.frameCount++
    const gravityRamp = Math.min(1, this.frameCount / GRAVITY_RAMP_FRAMES)
    const u = this.posVar.material.uniforms
    u.uGravityRamp.value = gravityRamp
    u.uDt.value = (1 / 60) / this.substeps

    const t0 = performance.now()
    for (let i = 0; i < this.substeps; i++) {
      // Self-collision (brute-force O(N^2), or WP-35b's spatial-hash
      // broadphase on the high-quality tier) is affordable once per
      // rendered frame, not once per substep (see selfCollisionGlsl's cost
      // comment). Running it on the LAST substep means it sees the frame's
      // fully-relaxed, post-body-collision positions rather than an
      // intermediate one.
      const isSelfCollisionSubstep = i === this.substeps - 1
      u.uApplySelfCollision.value = isSelfCollisionSubstep ? 1 : 0
      // WP-35b: (re)build the sorted spatial-hash buffer from the CURRENT
      // texturePosition snapshot right before the one substep that reads
      // it — same snapshot every neighbor lookup in this pass already
      // reads (see selfCollisionSpatialHashGlsl's own header on why this
      // is consistent with the Jacobi-parallel model the rest of this
      // solver already uses), and only once per frame, matching the
      // brute-force version's own cadence.
      if (isSelfCollisionSubstep && this.spatialSort) {
        u.uSortedBuffer.value = this.spatialSort.compute(this.getPositionTexture())
      }
      this.gpuCompute.compute()
    }
    // WebGL compute is queued, not necessarily finished, the instant
    // .compute() returns — but GPUComputationRenderer reuses a small fixed
    // set of render targets across calls, so back-to-back .compute() calls
    // this frame already serialize on the GPU's own command queue, and this
    // timing (CPU-side dispatch + queue wait for prior work) is a stable,
    // consistent proxy for relative cost across frames even without an
    // explicit GPU fence — exactly what the adaptive knob needs (relative
    // trend, not an absolute GPU-time measurement).
    const costMs = performance.now() - t0
    this.substeps = this.budget.report(costMs)
    this.lastCostMs = costMs
  }

  // Read-only snapshot for SolverHUD.jsx — never mutates controller state.
  getStats() {
    return { substeps: this.substeps, emaMs: this.budget.emaMs, lastCostMs: this.lastCostMs ?? 0 }
  }

  getPositionTexture() {
    return this.gpuCompute.getCurrentRenderTarget(this.posVar).texture
  }

  dispose() {
    this.gpuCompute.dispose()
    this.spatialSort?.dispose()
  }
}
