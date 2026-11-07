import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildHumanMannequin } from '../../../js/human-mannequin.js'

// Unified lifelike procedural human avatar shared with the production app's
// 3D Preview (`js/human-mannequin.js`). Replaces the earlier multi-piece
// torso + deltoid spheres + neck capsule + head/jaw spheres + 5-capsule hand
// + 3-sphere foot construction with a single continuous, watertight,
// 2-manifold sculpted human body mesh baked in the requested pose
// (`standing`, `apose`, `tpose`, `contrapposto`, `seated`) so GLTF/OBJ/USDZ
// scene exports work cleanly alongside GPU cloth collision.
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

export default function Avatar({ dims, skinColor = '#dca98e', pose = 'standing' }) {
  const category = categoryOf(dims.female, dims.kid)

  const mannequin = useMemo(
    () =>
      buildHumanMannequin(THREE, category, dims, {
        skinColor,
        pose,
        bakeStatic: true,
        collisionSafe: true,
      }),
    [category, dims, skinColor, pose],
  )

  useEffect(() => {
    return () => disposeGroup(mannequin.group)
  }, [mannequin])

  return <primitive object={mannequin.group} />
}
