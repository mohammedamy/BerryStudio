import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { normalizeGLBHeight, applyArmsDownRepose } from './reposeGLB'

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
export default function GLBAvatar({ dims, url }) {
  const { scene } = useGLTF(url)

  const preparedScene = useMemo(() => {
    const cloned = cloneSkeleton(scene)
    cloned.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    normalizeGLBHeight(cloned, dims.H)
    const { poseFixed } = applyArmsDownRepose(cloned)
    if (!poseFixed) {
      console.warn(
        'GLBAvatar: no standard Mixamo/RPM arm rig found (LeftArm/RightArm/LeftForeArm/RightForeArm) — ' +
        'rendering this avatar in its original pose. Simulated cloth is placed assuming an arms-down pose, ' +
        'so sleeves and fitted areas may visibly float or clip.'
      )
    }
    return cloned
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, dims.H])

  return <primitive object={preparedScene} />
}
