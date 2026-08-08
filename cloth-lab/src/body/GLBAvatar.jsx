import { useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { normalizeGLBHeight, applyPoseToGLB, detectVRM, resolveVRMBoneNames } from './reposeGLB'
import { deriveMeshFitCollisionRig } from './meshFitCollisionRig'
import { applyFFDLattice } from './ffdLattice'
import { t } from '../i18n'

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
// `onPoseWarning(message|null)` — the ONLY user-facing surface for the four
// degraded-support cases this component already detected internally (VRM,
// no recognized arm rig, no recognized leg rig for "seated", no animation
// clip for "walk") — previously console.warn only, invisible to anyone not
// watching devtools. Two independent state slots (mesh-level vs walk-level)
// rather than one, because they're set from two different effects that run
// on different dependency changes; combining them declaratively in a third
// effect avoids the staleness bugs a single shared ref written from two
// places would risk (a warning surviving after its own condition cleared).
// The slots hold an i18n KEY (js/i18n.js — cloth-lab/src/i18n.js), not the
// resolved string — resolving happens in the final combining effect below,
// which is the only place with the current `lang`. Storing the resolved
// string instead would mean a language switch never updates an
// already-showing banner unless SOME OTHER dependency (dims/pose/scene)
// happened to also force the expensive scene-prep useMemo to rerun.
export default function GLBAvatar({ dims, lang = 'en', url, collisionRigRef, pose = 'standing', onPoseWarning }) {
  const gltf = useGLTF(url)
  const { scene, animations } = gltf
  const rootRef = useRef(null)
  const meshWarningRef = useRef(null)
  const [meshWarning, setMeshWarning] = useState(null)
  const [walkWarning, setWalkWarning] = useState(null)

  const preparedScene = useMemo(() => {
    meshWarningRef.current = null
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
    // WP-29: VRM's humanoid.humanBones is a real, separate bone-naming spec
    // from the Mixamo/RPM convention applyPoseToGLB already knows — not a
    // guess, a fixed documented vocabulary (resolveVRMBoneNames reads it
    // straight from the file's own VRM/VRMC_vrm extension data). When it
    // resolves a working arm rig, VRM files go through the exact same
    // repose/collision-rig pipeline as any other recognized rig below.
    // `isVRM` alone (bones NOT resolved — a custom/malformed VRM export)
    // keeps the original honest "VRM detected, pose has no effect" warning
    // instead of silently mis-posing or falling through to the generic
    // "no rig found" message, which would misdescribe why.
    const isVRM = detectVRM(gltf)
    const vrmBoneNames = isVRM ? resolveVRMBoneNames(gltf) : null
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
    const { poseFixed: standingFixed } = applyPoseToGLB(cloned, 'standing', vrmBoneNames)
    if (!standingFixed && isVRM) {
      // Unresolved even with VRM's own bone data — a custom/malformed VRM
      // export. Bail the same way the pre-WP-29 VRM branch always did
      // (skip the collision rig entirely, never guess): a bad partial
      // pose read off geometry that wasn't actually reposed would be worse
      // than the honest "no effect" warning.
      console.warn('GLBAvatar: ' + t('en', 'poseWarnVRM') + ' (VRM humanBones present but did not resolve a full arm rig)')
      meshWarningRef.current = 'poseWarnVRM'
      if (collisionRigRef) collisionRigRef.current = null
      return cloned
    }
    if (!standingFixed) {
      console.warn('GLBAvatar: ' + t('en', 'poseWarnNoRig') + ' (looked for LeftArm/RightArm/LeftForeArm/RightForeArm)')
      meshWarningRef.current = 'poseWarnNoRig'
    }
    // WP-8.3: real torso/hip measurements from THIS loaded mesh, not the
    // generic formula — see meshFitCollisionRig.js's own header comment
    // for why this is safe post-repose (arms are bone-rotated, torso/hip
    // geometry stays in bind pose, which is what raycasting actually sees).
    if (collisionRigRef) collisionRigRef.current = deriveMeshFitCollisionRig(cloned, dims)
    if (standingFixed && pose !== 'standing' && pose !== 'walk') {
      const { legPoseFixed } = applyPoseToGLB(cloned, pose, vrmBoneNames)
      if (pose === 'seated' && !legPoseFixed) {
        console.warn('GLBAvatar: ' + t('en', 'poseWarnSeatedLeg') + ' (looked for LeftUpLeg/RightUpLeg/LeftLeg/RightLeg/LeftFoot/RightFoot)')
        meshWarningRef.current = 'poseWarnSeatedLeg'
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
  // Flush the ref computed above into real state — deferred to an effect
  // (never called directly inside the useMemo above) since that's the
  // earliest point in React's render cycle where updating a component's
  // own state is safe.
  useEffect(() => { setMeshWarning(meshWarningRef.current) }, [preparedScene])

  // WP-8.5 `walk`: only ever tried when the GLB shipped its own animation
  // clips — useAnimations ticks the mixer internally (an R3F useFrame under
  // the hood), so nothing else here needs to drive playback per frame.
  const { actions, names } = useAnimations(animations, rootRef)
  useEffect(() => {
    Object.values(actions || {}).forEach((a) => a && a.stop())
    if (pose !== 'walk') { setWalkWarning(null); return }
    if (!names || !names.length) {
      console.warn('GLBAvatar: "walk" pose requested but this GLB has no embedded animation clips — rendering the standing pose instead.')
      setWalkWarning('poseWarnWalkNoClip')
      return
    }
    setWalkWarning(null)
    const walkName = names.find((n) => /walk/i.test(n)) || names[0]
    const action = actions[walkName]
    if (action) action.reset().fadeIn(0.2).play()
  }, [pose, actions, names])

  // Mesh-level limitations (no recognized rig, VRM) take priority over the
  // walk-specific one when both happen to apply — they're the more
  // consequential of the two (they affect every pose, not just one). `lang`
  // is a dep here (not on the scene-prep useMemo above) so switching
  // language updates an already-showing banner instantly, without forcing
  // a full skeleton-clone/FFD/repose rebuild just to change a string.
  useEffect(() => {
    const key = meshWarning || walkWarning
    if (onPoseWarning) onPoseWarning(key ? t(lang, key) : null)
  }, [meshWarning, walkWarning, lang, onPoseWarning])

  return <primitive ref={rootRef} object={preparedScene} />
}
