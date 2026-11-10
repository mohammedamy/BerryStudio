import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildHumanMannequin, applyNaturalHumanMotion } from '../../../js/human-mannequin.js'
import { buildBodyEnvelopeTexture, computeEnvelopeFramesFromLimbs } from './bodyEnvelope'
import { deriveCollisionRigFromLimbs } from './collisionRig'

// Unified lifelike procedural human avatar shared with the production app's
// 3D Preview (`js/human-mannequin.js`). Replaces the earlier multi-piece
// torso + deltoid spheres + neck capsule + head/jaw spheres + 5-capsule hand
// + 3-sphere foot construction with a single continuous, watertight,
// 2-manifold sculpted human body mesh (`standing`, `apose`, `tpose`,
// `contrapposto`, `seated`, plus live animated `walk`) alongside exact
// mesh-derived GPU cloth collision.
function categoryOf(female, kid) {
  if (female) return kid ? 'girls' : 'women'
  return kid ? 'boys' : 'men'
}

function disposeGroup(group) {
  if (!group) return
  const mats = new Set()
  group.traverse((obj) => {
    if (!obj.isMesh) return
    if (obj.geometry) obj.geometry.dispose()
    if (Array.isArray(obj.material)) obj.material.forEach((m) => m && mats.add(m))
    else if (obj.material) mats.add(obj.material)
  })
  mats.forEach((m) => m.dispose())
}

export default function Avatar({ dims, skinColor = '#dca98e', pose = 'standing', paused = false, bodyColliderRef = null }) {
  const category = categoryOf(dims.female, dims.kid)
  const walkTimeRef = useRef(0)

  const mannequin = useMemo(() => {
    const isWalk = pose === 'walk'
    let bodyEnvelope = null
    let collisionRig = null
    let envelopeFrames = null

    const built = buildHumanMannequin(THREE, category, dims, {
      skinColor,
      pose: isWalk ? 'standing' : pose,
      bakeStatic: !isWalk,
      collisionSafe: false,
      onBindData: ({ bindGeometry, limbs, landmarks }) => {
        bodyEnvelope = buildBodyEnvelopeTexture(bindGeometry, dims, landmarks)
        collisionRig = deriveCollisionRigFromLimbs(dims, limbs)
        envelopeFrames = computeEnvelopeFramesFromLimbs(limbs, dims, landmarks)
      },
    })

    built.bodyEnvelope = bodyEnvelope
    built.collisionRig = collisionRig
    built.envelopeFrames = envelopeFrames

    if (bodyColliderRef) {
      bodyColliderRef.current = {
        collisionRig,
        bodyEnvelope,
        envelopeFrames,
        pinOffset: null,
      }
    }

    return built
  }, [category, dims, skinColor, pose, bodyColliderRef])

  useFrame((_, delta) => {
    if (pose !== 'walk' || paused || !mannequin.skeleton) return
    walkTimeRef.current += Math.min(delta, 0.05)

    const motion = applyNaturalHumanMotion(mannequin.limbs, mannequin.dims, mannequin.landmarks, {
      time: walkTimeRef.current,
      walking: true,
      reduceMotion: false,
      category,
      minArmAbduct: 0.14,
      blendAlpha: 1.0,
    })

    // Evaluate bone transforms in avatar-local coordinates so turntable rotation
    // never skews the cloth solver's local-space collider frames.
    const parent = mannequin.group.parent
    mannequin.group.matrixWorld.identity()
    mannequin.limbs.pelvis.updateMatrixWorld(true)
    const liveRig = deriveCollisionRigFromLimbs(mannequin.dims, mannequin.limbs)
    const liveFrames = computeEnvelopeFramesFromLimbs(mannequin.limbs, mannequin.dims, mannequin.landmarks)
    if (parent) mannequin.group.updateMatrixWorld(true)
    mannequin.skeleton.update()

    if (bodyColliderRef) {
      bodyColliderRef.current = {
        collisionRig: liveRig,
        bodyEnvelope: mannequin.bodyEnvelope,
        envelopeFrames: liveFrames,
        pinOffset: [motion.swayX || 0, motion.bobY || 0, 0],
      }
    }
  })

  useEffect(() => {
    walkTimeRef.current = 0
    return () => {
      mannequin.bodyEnvelope?.texture?.dispose()
      disposeGroup(mannequin.group)
    }
  }, [mannequin])

  return <primitive object={mannequin.group} />
}
