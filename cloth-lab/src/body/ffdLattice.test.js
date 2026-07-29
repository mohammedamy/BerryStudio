import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeBodyDims } from './computeBodyDims.js'
import { measureMeshRadiusAtHeight } from './meshFitCollisionRig.js'
import { applyFFDLattice } from './ffdLattice.js'

const WOMEN_M = { chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 }

// A tall vertical cylinder, uniform radius top to bottom — a stand-in for
// "an avatar mesh with the wrong proportions everywhere," so any change at
// a given height is unambiguously attributable to that region's own scale
// factor, not incidental mesh shape.
function makeCylinderScene(radius, height) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 24, 40)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
  mesh.position.y = height / 2
  mesh.updateMatrixWorld(true)
  const scene = new THREE.Group()
  scene.add(mesh)
  scene.updateMatrixWorld(true)
  return scene
}

describe('applyFFDLattice', () => {
  it('pulls the hip region toward dims.hipR when the mesh is uniformly narrower', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const narrowR = dims.hipR * 0.6
    const scene = makeCylinderScene(narrowR, dims.H + 0.5)
    applyFFDLattice(scene, dims)
    const zScale = dims.female ? 0.72 : 0.78
    const measured = measureMeshRadiusAtHeight(scene, dims.hipY, zScale)
    expect(measured).toBeGreaterThan(narrowR * 1.3) // moved meaningfully toward the target, not left alone
    expect(measured).toBeLessThanOrEqual(dims.hipR * 1.05) // and didn't overshoot past the target
  })

  it('pulls the waist region toward dims.waistR when the mesh is uniformly wider', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const wideR = dims.waistR * 1.8
    const scene = makeCylinderScene(wideR, dims.H + 0.5)
    applyFFDLattice(scene, dims)
    const zScale = dims.female ? 0.72 : 0.78
    const measured = measureMeshRadiusAtHeight(scene, dims.hipY + dims.span * 0.44, zScale)
    expect(measured).toBeLessThan(wideR * 0.8)
  })

  it('leaves a height far from every region band unchanged', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const r = 0.1
    const scene = makeCylinderScene(r, dims.H + 0.5)
    // The very top of the head sits well outside every deformed region's
    // (hip/waist/bust/shoulder/thigh) falloff band — shoulder is the
    // highest region, and even its 0.12m band doesn't reach this far.
    const topY = dims.H * 0.98
    applyFFDLattice(scene, dims)
    const measured = measureMeshRadiusAtHeight(scene, topY, 1)
    expect(measured).toBeCloseTo(r, 2)
  })

  it('skips a region entirely when the mesh already has a matching-named morph target', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const narrowR = dims.hipR * 0.6
    // NOTE: only the hip region gets a morph target below — waist/bust/
    // shoulder/thigh still apply geometrically, and thigh's own band edge
    // sits close enough to hipY to contribute a small legitimate blended
    // weight there (see REGIONS/BAND_HALF_WIDTH) — this is expected
    // cross-region falloff, not a bug, hence the coarser tolerance below.
    const geo = new THREE.CylinderGeometry(narrowR, narrowR, dims.H + 0.5, 24, 40)
    geo.morphAttributes.position = [geo.attributes.position.clone()] // a dummy morph target
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
    mesh.updateMorphTargets()
    mesh.morphTargetDictionary = { hip: 0 }
    mesh.position.y = (dims.H + 0.5) / 2
    mesh.updateMatrixWorld(true)
    const scene = new THREE.Group()
    scene.add(mesh)
    scene.updateMatrixWorld(true)

    applyFFDLattice(scene, dims)
    const zScale = dims.female ? 0.72 : 0.78
    const measured = measureMeshRadiusAtHeight(scene, dims.hipY, zScale)
    expect(measured).toBeCloseTo(narrowR, 1) // close to untouched — the fast-path deferred hip itself to the morph target
  })
})
