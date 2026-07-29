import * as THREE from 'three'
import { measureMeshRadiusAtHeight } from './meshFitCollisionRig.js'

// WP-8.2 FFD lattice: per-body-region deformation for a loaded GLB avatar,
// so its VISIBLE shape — not just the collision rig (meshFitCollisionRig.js)
// — actually reflects the user's own measurements instead of a uniform
// scale-to-height. "Control points" per the plan's own description reduce
// to one radial (or lateral, for shoulders) scale factor per region here —
// (targetMeasurement / detectedMeshMeasurement - 1) — applied directly to
// vertex positions with a smooth cosine falloff between adjacent regions'
// height bands. That's the same end result a discrete control-point cage
// would produce, without a separate lattice data structure this app has no
// other use for.
//
// Scope: hip/waist/bust/shoulder/thigh only, NOT bicep. Every region here
// sits on the torso/hip/leg, which — like meshFitCollisionRig.js's own
// raycasting — stays in exact bind pose after reposeGLB.js's
// applyArmsDownRepose (that function only ever rotates the arm bones), so
// a vertex's live world position is just its bind-pose local position
// transformed by the mesh's current matrixWorld: no bone-relative math
// needed. Bicep sits on a BONE-ROTATED arm, where that assumption breaks —
// deforming it correctly needs the same displacement computed in the arm
// bone's own local frame, real additional complexity deferred here
// alongside bicep entirely (documented future work, not a silent gap).
//
// Fast-path: if the GLB exposes matching-named morph targets (a rigger's
// own bust/waist/hip/shoulder shape keys), prefer those for that region
// over this generic geometric deformation — a rigger's own shape key is
// definitionally more accurate than a generic radial scale.
const REGIONS = [
  { name: 'hip', dimsKey: 'hipR', y: (dims) => dims.hipY, axis: 'radial', morphNames: ['hip', 'hips'] },
  { name: 'waist', dimsKey: 'waistR', y: (dims) => dims.hipY + dims.span * 0.44, axis: 'radial', morphNames: ['waist'] },
  { name: 'bust', dimsKey: 'chestR', y: (dims) => dims.hipY + dims.span * 0.76, axis: 'radial', morphNames: ['bust', 'chest'] },
  { name: 'shoulder', dimsKey: 'shoulderHalf', y: (dims) => dims.shoulderY - dims.span * 0.03, axis: 'lateral', morphNames: ['shoulder', 'shoulders'] },
  { name: 'thigh', dimsKey: 'thighR', y: (dims) => dims.hipY - dims.legLen * 0.15, axis: 'radial', morphNames: ['thigh', 'thighs'] },
]

// Half-width (meters) of each region's influence band — a vertex outside
// every region's band is left untouched; inside one, cosine falloff (below)
// blends its weight smoothly to zero at the band edge so neighboring
// regions never produce a visible seam between them.
const BAND_HALF_WIDTH = 0.12

function falloff(dy) {
  const t = Math.min(1, Math.abs(dy) / BAND_HALF_WIDTH)
  return t >= 1 ? 0 : 0.5 * (1 + Math.cos(t * Math.PI)) // 1 at center, 0 at the band edge
}

function findMorphTarget(mesh, names) {
  const dict = mesh.morphTargetDictionary
  if (!dict) return -1
  for (const n of names) {
    if (dict[n] != null) return dict[n]
    const found = Object.keys(dict).find((k) => k.toLowerCase() === n.toLowerCase())
    if (found) return dict[found]
  }
  return -1
}

// Computes one scale factor per region: how much bigger/smaller the
// target measurement is than what's actually on the loaded mesh right now.
// Radial regions measure via the same raycasting meshFitCollisionRig.js
// uses; the lateral (shoulder) region measures mesh half-width directly
// along X at that height instead of a full circular radius, since shoulder
// WIDTH is the measurement that actually matters there, not circumference.
function computeRegionScales(scene, dims) {
  const scales = {}
  for (const region of REGIONS) {
    const y = region.y(dims)
    const target = dims[region.dimsKey]
    const measured = region.axis === 'lateral'
      ? measureMeshHalfWidthAtHeight(scene, y)
      : measureMeshRadiusAtHeight(scene, y, dims.female ? 0.72 : 0.78)
    scales[region.name] = measured && measured > 1e-4 ? target / measured : 1
  }
  return scales
}

// Like measureMeshRadiusAtHeight but only casts along +/-X (no zScale
// ellipse) — shoulder width is a lateral measurement, not a circumference.
function measureMeshHalfWidthAtHeight(scene, y) {
  const raycaster = new THREE.Raycaster()
  const far = 3
  let maxR = null
  for (const sign of [-1, 1]) {
    const origin = new THREE.Vector3(sign * far, y, 0)
    raycaster.set(origin, new THREE.Vector3(-sign, 0, 0))
    const hits = raycaster.intersectObject(scene, true)
    if (hits.length === 0) continue
    const r = far - hits[0].distance
    if (r > 0 && (maxR === null || r > maxR)) maxR = r
  }
  return maxR
}

// Mutates every mesh's geometry position attribute in place. Call AFTER
// normalizeGLBHeight/applyArmsDownRepose (needs a settled matrixWorld) and
// BEFORE anything reads the mesh for collision-rig measurement, so the
// mesh-fit rig sees the already-deformed shape.
//
// One combined pass per vertex (not one full mesh pass per region): every
// active region contributes a falloff-weighted vote toward a single radial
// and a single lateral scale factor, applied together. Weighted-averaging
// instead of applying each region sequentially avoids the result depending
// on REGIONS' array order wherever two bands' falloff tails overlap.
export function applyFFDLattice(scene, dims) {
  const scales = computeRegionScales(scene, dims)
  const regionY = REGIONS.map((r) => r.y(dims))
  const v = new THREE.Vector3()
  const invMatrix = new THREE.Matrix4()

  scene.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.attributes.position
    if (!pos) return
    invMatrix.copy(mesh.matrixWorld).invert()
    const activeRegions = REGIONS.map((region) => findMorphTarget(mesh, region.morphNames) < 0)

    let touched = false
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)

      let radialNum = 0, radialDen = 0, lateralNum = 0, lateralDen = 0
      for (let r = 0; r < REGIONS.length; r++) {
        if (!activeRegions[r]) continue // fast-path: this mesh has its own morph target for this region
        const w = falloff(v.y - regionY[r])
        if (w === 0) continue
        const scale = scales[REGIONS[r].name]
        if (REGIONS[r].axis === 'radial') { radialNum += w * scale; radialDen += w }
        else { lateralNum += w * scale; lateralDen += w }
      }
      if (radialDen === 0 && lateralDen === 0) continue
      touched = true
      if (radialDen > 0) { const s = radialNum / radialDen; v.x *= s; v.z *= s }
      if (lateralDen > 0) { v.x *= lateralNum / lateralDen }
      v.applyMatrix4(invMatrix)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    if (touched) {
      pos.needsUpdate = true
      mesh.geometry.computeVertexNormals()
    }
  })
}
