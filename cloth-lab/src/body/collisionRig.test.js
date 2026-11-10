import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeBodyDims } from './computeBodyDims.js'
import {
  deriveCollisionRig,
  deriveCollisionRigFromLimbs,
  projectPointOutsideCapsules,
  deriveShoulderPinSegments,
  deriveShoulderPinMask,
  deriveWaistbandPinRing,
  deriveWaistbandPinMask,
  deriveGarmentPinMask,
  MAX_COLLISION_CAPSULES,
} from './collisionRig.js'
import {
  buildBodyEnvelopeTexture,
  computeEnvelopeFramesFromLimbs,
  projectPointOutsideBodyEnvelope,
  ENV_SEGMENT_COUNT,
} from './bodyEnvelope.js'
import { buildHumanMannequin } from '../../../js/human-mannequin.js'

const WOMEN_M = { chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 }

describe('deriveCollisionRig', () => {
  it('never exceeds MAX_COLLISION_CAPSULES across all poses', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    for (const pose of ['standing', 'apose', 'tpose', 'contrapposto', 'seated', 'walk']) {
      const rig = deriveCollisionRig(dims, pose)
      expect(rig.length).toBeGreaterThanOrEqual(25)
      expect(rig.length).toBeLessThanOrEqual(MAX_COLLISION_CAPSULES)
    }
  })

  it('tracks posed arms and legs in apose, tpose, and seated', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const standing = deriveCollisionRig(dims, 'standing')
    const tpose = deriveCollisionRig(dims, 'tpose')
    const seated = deriveCollisionRig(dims, 'seated')
    // Upper-arm capsule (#17, -X side) elbow endpoint swings high & wide in tpose
    expect(tpose[17].b[1]).toBeGreaterThan(standing[17].b[1] + 0.15)
    expect(Math.abs(tpose[17].b[0])).toBeGreaterThan(Math.abs(standing[17].b[0]) + 0.10)
    // Left thigh capsule (#23) knee endpoint swings forward (+Z) and up (+Y) in seated
    expect(seated[23].b[2]).toBeGreaterThan(standing[23].b[2] + 0.25)
    expect(seated[23].b[1]).toBeGreaterThan(standing[23].b[1] + 0.20)
  })
})

describe('buildBodyEnvelopeTexture & zero-penetration projection', () => {
  it('rasterizes all 9 anatomical segments from humanBody and pushes interior points outside the mesh', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    let env = null
    let rig = null
    let frames = null
    const mannequin = buildHumanMannequin(THREE, 'women', dims, {
      pose: 'standing',
      bakeStatic: true,
      collisionSafe: false,
      onBindData: ({ bindGeometry, limbs, landmarks }) => {
        env = buildBodyEnvelopeTexture(bindGeometry, dims, landmarks)
        rig = deriveCollisionRigFromLimbs(dims, limbs)
        frames = computeEnvelopeFramesFromLimbs(limbs, dims, landmarks)
      },
    })

    expect(env).toBeTruthy()
    expect(frames).toHaveLength(ENV_SEGMENT_COUNT)
    expect(rig.length).toBeLessThanOrEqual(MAX_COLLISION_CAPSULES)

    // Sample vertices across the baked humanBody mesh (chest, hip, thigh, knee, calf, upper arm)
    // and verify that a point placed 10mm INSIDE each vertex along its inward radial vector is
    // pushed back OUTSIDE the vertex's radial distance by projectPointOutsideCapsules + projectPointOutsideBodyEnvelope.
    const pos = mannequin.bodyMesh.geometry.attributes.position
    let tested = 0
    for (let i = 0; i < pos.count; i += 13) {
      const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i)
      // Test torso/chest/waist/hip region (vy between hipY and shoulderY, within trunk X)
      if (vy > dims.hipY + 0.03 && vy < dims.shoulderY - 0.03 && Math.abs(vx) < dims.shoulderHalf * 0.72) {
        const rMesh = Math.hypot(vx, vz)
        const scaleIn = Math.max(0.1, (rMesh - 0.012) / rMesh)
        let p = [vx * scaleIn, vy, vz * scaleIn]
        p = projectPointOutsideCapsules(p, rig)
        p = projectPointOutsideBodyEnvelope(p, env, frames)
        const rPushed = Math.hypot(p[0], p[2])
        expect(rPushed).toBeGreaterThanOrEqual(rMesh - 1e-4)
        tested++
      }
    }
    expect(tested).toBeGreaterThan(20)
  })
})

describe('deriveShoulderPinSegments', () => {
  it('returns one segment per side, mirrored around x=0', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const [left, right] = deriveShoulderPinSegments(dims)
    expect(left[0][0]).toBeLessThan(0) // left side is negative X
    expect(right[0][0]).toBeGreaterThan(0) // right side is positive X
    expect(left[0][0]).toBeCloseTo(-right[0][0], 5)
  })
})

describe('deriveShoulderPinMask', () => {
  it('pins a particle sitting exactly on the shoulder segment, not one far away', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const [, [innerR, outerR]] = deriveShoulderPinSegments(dims)
    // particle 0: exactly at the right shoulder's outer point (should be pinned)
    // particle 1: far away at the origin/floor (should not be pinned)
    const simRestPositions = new Float32Array([
      outerR[0], outerR[1], outerR[2],
      0, -10, 0,
    ])
    const mask = deriveShoulderPinMask(simRestPositions, 2, dims)
    expect(mask[0]).toBe(1)
    expect(mask[1]).toBe(0)
  })

  it('returns an all-zero mask when no particle is near a shoulder (e.g. a skirt-only garment)', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const simRestPositions = new Float32Array([0, -20, 0, 0.05, -20, 0])
    const mask = deriveShoulderPinMask(simRestPositions, 2, dims)
    expect(Array.from(mask)).toEqual([0, 0])
  })
})

describe('deriveWaistbandPinMask', () => {
  it('pins a particle sitting exactly on the waist ring, not one far away', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const { y, r } = deriveWaistbandPinRing(dims)
    // particle 0: exactly on the waist ring at angle 0 (should be pinned)
    // particle 1: far away at the origin/floor (should not be pinned)
    const simRestPositions = new Float32Array([
      r, y, 0,
      0, -10, 0,
    ])
    const mask = deriveWaistbandPinMask(simRestPositions, 2, dims)
    expect(mask[0]).toBe(1)
    expect(mask[1]).toBe(0)
  })

  it('does not pin a particle at the waist height but far outside the waist radius', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const { y, r } = deriveWaistbandPinRing(dims)
    const simRestPositions = new Float32Array([r + 0.3, y, 0])
    const mask = deriveWaistbandPinMask(simRestPositions, 1, dims)
    expect(mask[0]).toBe(0)
  })

  it('returns an all-zero mask when no particle is near the waist (e.g. a top-only garment)', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const simRestPositions = new Float32Array([0, 20, 0, 0.05, 20, 0])
    const mask = deriveWaistbandPinMask(simRestPositions, 2, dims)
    expect(Array.from(mask)).toEqual([0, 0])
  })
})

describe('deriveGarmentPinMask', () => {
  it('anchors unsewn attachment pieces (attachBody / attachNeck / attachHem) and single-corner-pinned components so no piece flies or dangles', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const [, [innerR]] = deriveShoulderPinSegments(dims)
    // 4 particles forming a disconnected quad where only particle 0 is near the shoulder
    const simRestPositions = new Float32Array([
      innerR[0], innerR[1], 0,
      innerR[0] + 0.16, innerR[1], 0.12,
      innerR[0] + 0.16, innerR[1] - 0.25, 0.12,
      innerR[0], innerR[1] - 0.25, 0.12,
    ])
    const cloth = {
      simParticleCount: 4,
      simRestPositions,
      renderTriangles: new Uint32Array([0, 1, 2, 0, 2, 3]),
      renderVertexToSimParticle: new Uint32Array([0, 1, 2, 3]),
      pieceOffset: { p0: 0 },
    }
    const triangulated = [{
      pieceId: 'p0',
      role: 'frontPanel',
      positions2D: [[0, 0], [16, 0], [16, 25], [0, 25]],
    }]
    const mask = deriveGarmentPinMask(cloth, triangulated, dims)
    // Both top corners (0 and 1) must be pinned, not just corner 0!
    expect(mask[0]).toBe(1)
    expect(mask[1]).toBe(1)
    expect(mask[2]).toBe(0)
    expect(mask[3]).toBe(0)
  })

  it('does not pin waist-height midsection vertices of upper-body frontPanel or sleeve roles', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const [, [innerR, outerR]] = deriveShoulderPinSegments(dims)
    const { y: waistY, r: waistR } = deriveWaistbandPinRing(dims)
    const simRestPositions = new Float32Array([
      innerR[0], innerR[1], 0,
      outerR[0], outerR[1], 0,
      waistR, waistY, 0,
      -waistR, waistY, 0,
    ])
    const cloth = {
      simParticleCount: 4,
      simRestPositions,
      renderTriangles: new Uint32Array([0, 1, 2, 0, 2, 3]),
      renderVertexToSimParticle: new Uint32Array([0, 1, 2, 3]),
      pieceOffset: { dress0: 0 },
    }
    const triangulated = [{
      pieceId: 'dress0',
      role: 'frontPanel',
      positions2D: [[0, 0], [12, 0], [12, 45], [0, 45]],
    }]
    const mask = deriveGarmentPinMask(cloth, triangulated, dims)
    expect(mask[0]).toBe(1)
    expect(mask[1]).toBe(1)
    expect(mask[2]).toBe(0)
    expect(mask[3]).toBe(0)
  })
})


