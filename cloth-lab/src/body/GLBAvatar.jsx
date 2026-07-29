import { useEffect, useMemo, useRef } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { normalizeGLBHeight, applyPoseToGLB, detectVRM } from './reposeGLB'
import { deriveMeshFitCollisionRig } from './meshFitCollisionRig'
import { applyFFDLattice } from './ffdLattice'

// useGLTF (drei's Suspense-based GLTFLoader hook) caches by URL and returns
// the SAME scene graph across every call/remount for that URL — this app
// remounts its whole Workspace (App.jsx's key={garmentVersion}) on every
// bridge-imported pattern, so mutating that shared scene directly (scale,
// bone rotations) would compound on every remount. SkeletonUtils.clone
// deep-clones the graph AND correctly re-binds SkinnedMesh<->Skeleton<->Bone
// references (a plain Object3D.clone() does not), giving each mount its own
// independent, freely-mutable copy — the standard fix for this exact
// shared-cache problem.
//
// Caller (BodyAvatar) is responsible for the Suspense/error-boundary
// fallback tiers — this component assumes the load already succeeded.
// `collisionRigRef`, if given, gets the WP-8.3 mesh-fit collision rig
// written into it once the scene is prepared — ClothMesh.jsx (a sibling in
// Scene.jsx, not a parent/child of this component) reads it back instead
// of the formula-only rig. Written during render (inside useMemo, not an
// effect) so it's populated before ClothMesh's own effect runs on the same
// mount, matching this component's existing style of doing scene-prep
// side effects inside useMemo rather than useEffect.
// WP-8.5 `walk`: scoped to GLB avatars that ship their own embedded
// animation clips (played via drei's useAnimations/AnimationMixer wrapper)
// — a from-scratch procedural walk-cycle rig is out of scope for a
// fit-draping tool, not a character animator (see README). Every other
// pose is a static repose (reposeGLB.js); `walk` is the one case where the
// pose itself is time-varying, so it's handled here rather than folded
// into applyPoseToGLB.
export default function GLBAvatar({ dims, url, collisionRigRef, pose = 'standing' }) {
  const gltf = useGLTF(url)
  const { scene, animations } = gltf
  const rootRef = useRef(null)

  const preparedScene = useMemo(() => {
    const cloned = cloneSkeleton(scene)
    cloned.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    normalizeGLBHeight(cloned, dims.H)
    // WP-8.2: reshape the VISIBLE mesh toward the user's own measurements
    // before anything else reads it — deriveMeshFitCollisionRig below
    // needs to measure the already-deformed shape, not the pre-FFD one.
    // Geometric (raycasting/vertex) only, no bone names needed, so this
    // runs the same for a recognized rig, an unrecognized one, or a VRM
    // file — see ffdLattice.js's own header comment for exactly which
    // regions and why (torso/hip/waist/shoulder/thigh; not bicep).
    applyFFDLattice(cloned, dims)
    if (detectVRM(gltf)) {
      // WP-8.4: VRM's humanoid.humanBones mapping is a real separate spec,
      // not a name variant of the Mixamo/RPM rig this app already parses —
      // don't even attempt applyPoseToGLB (it would silently fail to find
      // any of the four expected bone names anyway, but that failure
      // path's message doesn't explain WHY, which this one does). Pose
      // selection (WP-8.5) has no effect on a VRM file for the same reason.
      console.warn(
        'GLBAvatar: this file uses the VRM extension. Full VRM humanoid-bone support is not implemented yet — ' +
        'rendering it in its original (bind) pose. Simulated cloth is placed assuming an arms-down pose, ' +
        'so sleeves and fitted areas may visibly float or clip.'
      )
      if (collisionRigRef) collisionRigRef.current = null
      return cloned
    }
    // WP-8.5: collision/placement (collisionRig.js, placement.js, and the
    // WP-8.3 mesh-fit rig below) all assume the original arms-down,
    // legs-straight "standing" convention regardless of which pose the
    // avatar is DISPLAYED in — re-deriving cloth collision per pose is a
    // materially larger problem (a seated body needs seated-aware garment
    // draping, not just a repositioned collider) and out of scope here.
    // So: always measure the collision rig off the standing correction
    // first, then apply the actually-requested display pose on top —
    // reposeBoneToDirection re-measures each bone's CURRENT direction on
    // every call, so layering a second correction on top of the first
    // still lands exactly on the final target, not some blended result.
    const { poseFixed: standingFixed } = applyPoseToGLB(cloned, 'standing')
    if (!standingFixed) {
      console.warn(
        'GLBAvatar: no standard Mixamo/RPM arm rig found (LeftArm/RightArm/LeftForeArm/RightForeArm) — ' +
        'rendering this avatar in its original pose. Simulated cloth is placed assuming an arms-down pose, ' +
        'so sleeves and fitted areas may visibly float or clip. Pose selection has no effect without a ' +
        'recognized rig.'
      )
    }
    // WP-8.3: real torso/hip measurements from THIS loaded mesh, not the
    // generic formula — see meshFitCollisionRig.js's own header comment
    // for why this is safe post-repose (arms are bone-rotated, torso/hip
    // geometry stays in bind pose, which is what raycasting actually sees).
    if (collisionRigRef) collisionRigRef.current = deriveMeshFitCollisionRig(cloned, dims)
    if (standingFixed && pose !== 'standing' && pose !== 'walk') {
      const { legPoseFixed } = applyPoseToGLB(cloned, pose)
      if (pose === 'seated' && !legPoseFixed) {
        console.warn(
          'GLBAvatar: "seated" pose could not bend the knee (no standard Mixamo/RPM leg rig found — ' +
          'LeftUpLeg/RightUpLeg/LeftLeg/RightLeg/LeftFoot/RightFoot) — legs stay standing; arms still relax.'
        )
      }
    }
    return cloned
    // `dims` (not just dims.H): the WP-8.3 mesh-fit rig above depends on
    // the full measurement set (torsoProfile keypoints, zScale, female),
    // not just height — a measurement edit that leaves height unchanged
    // still needs this to re-run, or the rig silently goes stale. `pose`:
    // a pose change needs the whole scene rebuilt from the ORIGINAL cached
    // gltf.scene, not re-corrected from whatever pose the previous mount
    // already landed on — reposeBoneToDirection composes correctly across
    // repeated calls in a single pass, but not across separate stale
    // clones from different mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, dims, pose])

  // WP-8.5 `walk`: only ever tried when the GLB shipped its own animation
  // clips — useAnimations ticks the mixer internally (an R3F useFrame under
  // the hood), so nothing else here needs to drive playback per frame.
  const { actions, names } = useAnimations(animations, rootRef)
  useEffect(() => {
    Object.values(actions || {}).forEach((a) => a && a.stop())
    if (pose !== 'walk') return
    if (!names || !names.length) {
      console.warn('GLBAvatar: "walk" pose requested but this GLB has no embedded animation clips — rendering the standing pose instead.')
      return
    }
    const walkName = names.find((n) => /walk/i.test(n)) || names[0]
    const action = actions[walkName]
    if (action) action.reset().fadeIn(0.2).play()
  }, [pose, actions, names])

  return <primitive ref={rootRef} object={preparedScene} />
}
