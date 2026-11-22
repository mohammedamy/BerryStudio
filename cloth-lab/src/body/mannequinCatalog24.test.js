import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { MANNEQUIN_CATALOG, getMannequinsByCategory } from '../../../js/mannequin-catalog.js'
import { buildHumanMannequin } from '../../../js/human-mannequin.js'
import { computeBodyDims } from './computeBodyDims.js'
import {
  deriveCollisionRigFromLimbs,
  projectPointOutsideCapsules,
  MAX_COLLISION_CAPSULES,
} from './collisionRig.js'
import {
  buildBodyEnvelopeTexture,
  computeEnvelopeFramesFromLimbs,
  projectPointOutsideBodyEnvelope,
} from './bodyEnvelope.js'

describe('24-Mannequin Cloth Lab Collision & Envelope Parity', () => {
  it('builds collision rigs and zero-penetration body envelopes for all 24 mannequins (XS–XXL × 4 categories)', () => {
    expect(MANNEQUIN_CATALOG).toHaveLength(24)

    for (const mq of MANNEQUIN_CATALOG) {
      const dims = computeBodyDims(mq.measurements, mq.category, mq.morph)
      let env = null
      let rig = null
      let frames = null

      const built = buildHumanMannequin(THREE, mq.category, dims, {
        mannequin: mq,
        pose: 'standing',
        bakeStatic: true,
        collisionSafe: false,
        onBindData: ({ bindGeometry, limbs, landmarks }) => {
          env = buildBodyEnvelopeTexture(bindGeometry, dims, landmarks)
          rig = deriveCollisionRigFromLimbs(dims, limbs)
          frames = computeEnvelopeFramesFromLimbs(limbs, dims, landmarks)
        },
      })

      expect(rig.length, `${mq.id} capsule budget`).toBeLessThanOrEqual(MAX_COLLISION_CAPSULES)
      for (const cap of rig) {
        expect(Number.isFinite(cap.ra) && cap.ra > 0, `${mq.id} ra finite`).toBe(true)
        expect(Number.isFinite(cap.rb) && cap.rb > 0, `${mq.id} rb finite`).toBe(true)
      }

      const texData = env.texture.image.data
      for (let i = 0; i < texData.length; i += 37) {
        expect(Number.isFinite(texData[i]), `${mq.id} envelope data finite`).toBe(true)
      }

      // Push sample interior points near torso surface outside mesh + collision rig
      const pos = built.bodyMesh.geometry.attributes.position
      let tested = 0
      for (let i = 0; i < pos.count; i += 29) {
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i)
        if (vy > dims.hipY + 0.03 && vy < dims.shoulderY - 0.03 && Math.abs(vx) < dims.shoulderHalf * 0.72) {
          const rMesh = Math.hypot(vx, vz)
          if (rMesh < 0.02) continue
          const scaleIn = Math.max(0.1, (rMesh - 0.01) / rMesh)
          let p = [vx * scaleIn, vy, vz * scaleIn]
          p = projectPointOutsideCapsules(p, rig)
          p = projectPointOutsideBodyEnvelope(p, env, frames)
          const rPushed = Math.hypot(p[0], p[2])
          expect(rPushed, `${mq.id} pushed outside`).toBeGreaterThanOrEqual(rMesh - 2e-4)
          tested++
        }
      }
      expect(tested, `${mq.id} tested vertices`).toBeGreaterThan(10)
      env?.texture?.dispose?.()
      built.bodyMesh?.geometry?.dispose?.()
    }
  }, 60000)

  it('orders categories cleanly with 6 active sizes each', () => {
    for (const cat of ['women', 'girls', 'men', 'boys']) {
      expect(getMannequinsByCategory(cat).map((m) => m.size)).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
    }
  })
})
