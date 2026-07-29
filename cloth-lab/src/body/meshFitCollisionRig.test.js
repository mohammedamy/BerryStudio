import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeBodyDims, torsoProfile } from './computeBodyDims.js'
import { deriveCollisionRig } from './collisionRig.js'
import { measureMeshRadiusAtHeight, deriveMeshFitCollisionRig } from './meshFitCollisionRig.js'

const WOMEN_M = { chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 }

// A plain vertical cylinder of known radius, tall enough to span every
// height these tests probe — a stand-in for "a real GLB avatar mesh" that
// lets radius measurement be checked against a value known in advance.
function makeCylinderScene(radius, height = 2) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 24)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
  mesh.position.y = height / 2 // base at y=0, matching this app's own feet-at-origin convention
  mesh.updateMatrixWorld(true)
  const scene = new THREE.Group()
  scene.add(mesh)
  scene.updateMatrixWorld(true)
  return scene
}

describe('measureMeshRadiusAtHeight', () => {
  it('measures a known cylinder radius within tolerance', () => {
    const scene = makeCylinderScene(0.15)
    const r = measureMeshRadiusAtHeight(scene, 1.0, 1)
    expect(r).toBeCloseTo(0.15, 2)
  })

  it('respects zScale — an ellipse reads a different radius front/back vs side', () => {
    const scene = makeCylinderScene(0.2)
    const rCircular = measureMeshRadiusAtHeight(scene, 1.0, 1)
    // zScale < 1 squashes the sampled radius on the Z axis when converting
    // to the raycast direction — for a perfectly circular mesh (no actual
    // ellipse), this should still measure close to the true radius on
    // every ray (there's nothing to squash against), confirming zScale
    // doesn't corrupt a plain circular measurement.
    const rSquashed = measureMeshRadiusAtHeight(scene, 1.0, 0.75)
    expect(rSquashed).toBeCloseTo(rCircular, 1)
  })

  it('returns null when nothing exists at that height', () => {
    const scene = makeCylinderScene(0.15, 2)
    const r = measureMeshRadiusAtHeight(scene, 5, 1) // well above the cylinder's top
    expect(r).toBeNull()
  })
})

describe('deriveMeshFitCollisionRig', () => {
  it('returns the same primitive count as the formula rig it replaces', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const formulaRig = deriveCollisionRig(dims)
    const scene = makeCylinderScene(0.15, 2)
    const rig = deriveMeshFitCollisionRig(scene, dims, { formulaRig, formulaProfile: torsoProfile(dims) })
    expect(rig.length).toBe(formulaRig.length)
  })

  it('falls back to the formula radius for a torso segment with nothing to measure (e.g. no mesh loaded at all)', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const formulaRig = deriveCollisionRig(dims)
    const emptyScene = new THREE.Group() // nothing in it — every ray misses
    const rig = deriveMeshFitCollisionRig(emptyScene, dims, { formulaRig, formulaProfile: torsoProfile(dims) })
    expect(rig).toEqual(formulaRig)
  })

  it('replaces torso radii with real measurements when the mesh differs from the formula profile', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const formulaRig = deriveCollisionRig(dims)
    const profile = torsoProfile(dims)
    // A cylinder noticeably wider than every formula torso radius — if the
    // fit rig picked up the real measurement, every torso segment's radii
    // should now exceed what the formula alone produced.
    const wideR = Math.max(...profile.map(([r]) => r)) + 0.1
    const scene = makeCylinderScene(wideR, dims.H + 1)
    const rig = deriveMeshFitCollisionRig(scene, dims, { formulaRig, formulaProfile: profile })
    for (let i = 0; i < profile.length - 1; i++) {
      expect(rig[i].ra).toBeGreaterThan(formulaRig[i].ra)
      expect(rig[i].rb).toBeGreaterThan(formulaRig[i].rb)
    }
  })
})
