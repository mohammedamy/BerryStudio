import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { normalizeGLBHeight, applyArmsDownRepose, detectVRM } from './reposeGLB'
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
export default function GLBAvatar({ dims, url, collisionRigRef }) {
  const gltf = useGLTF(url)
  const { scene } = gltf

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
      // don't even attempt applyArmsDownRepose (it would silently fail to
      // find any of the four expected bone names anyway, but that failure
      // path's message doesn't explain WHY, which this one does).
      console.warn(
        'GLBAvatar: this file uses the VRM extension. Full VRM humanoid-bone support is not implemented yet — ' +
        'rendering it in its original (bind) pose. Simulated cloth is placed assuming an arms-down pose, ' +
        'so sleeves and fitted areas may visibly float or clip.'
      )
      if (collisionRigRef) collisionRigRef.current = null
      return cloned
    }
    const { poseFixed } = applyArmsDownRepose(cloned)
    if (!poseFixed) {
      console.warn(
        'GLBAvatar: no standard Mixamo/RPM arm rig found (LeftArm/RightArm/LeftForeArm/RightForeArm) — ' +
        'rendering this avatar in its original pose. Simulated cloth is placed assuming an arms-down pose, ' +
        'so sleeves and fitted areas may visibly float or clip.'
      )
    }
    // WP-8.3: real torso/hip measurements from THIS loaded mesh, not the
    // generic formula — see meshFitCollisionRig.js's own header comment
    // for why this is safe post-repose (arms are bone-rotated, torso/hip
    // geometry stays in bind pose, which is what raycasting actually sees).
    if (collisionRigRef) collisionRigRef.current = deriveMeshFitCollisionRig(cloned, dims)
    return cloned
    // `dims` (not just dims.H): the WP-8.3 mesh-fit rig above depends on
    // the full measurement set (torsoProfile keypoints, zScale, female),
    // not just height — a measurement edit that leaves height unchanged
    // still needs this to re-run, or the rig silently goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, dims])

  return <primitive object={preparedScene} />
}
