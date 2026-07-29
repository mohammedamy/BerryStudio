import * as THREE from 'three'

// Every placement/collision formula in this app (placement.js's sleeve
// leanOut, collisionRig.js's arm capsules) assumes an "arms hanging at the
// sides" pose — a small, fixed lean angle off vertical, not a bind-pose
// T/A-pose. A loaded Ready Player Me / Mixamo-rigged GLB has NEITHER of
// those angles baked in (T-pose arms are ~horizontal), so without this the
// simulated garment would drape around empty air relative to what's on
// screen. This measures each arm's actual current direction and rotates
// just the upper-arm bone to bring it down to match — the forearm/hand
// follow rigidly as children, since a rest-pose arm is a straight,
// unbent chain in both T-pose and A-pose rigs.
const ARM_BONE_NAMES = {
  left: ['LeftArm', 'mixamorig:LeftArm'],
  leftFore: ['LeftForeArm', 'mixamorig:LeftForeArm'],
  right: ['RightArm', 'mixamorig:RightArm'],
  rightFore: ['RightForeArm', 'mixamorig:RightForeArm'],
}
// WP-8.5: only used by the `seated` pose's leg bend (see reposeSeatedLegs
// below) — standing/apose/tpose/contrapposto only ever touch the arms,
// since a bind-pose rig's legs are already close enough to vertical in
// both T-pose and A-pose conventions that no correction is needed there.
const LEG_BONE_NAMES = {
  leftUp: ['LeftUpLeg', 'mixamorig:LeftUpLeg'],
  leftLow: ['LeftLeg', 'mixamorig:LeftLeg'],
  leftFoot: ['LeftFoot', 'mixamorig:LeftFoot'],
  rightUp: ['RightUpLeg', 'mixamorig:RightUpLeg'],
  rightLow: ['RightLeg', 'mixamorig:RightLeg'],
  rightFoot: ['RightFoot', 'mixamorig:RightFoot'],
}

// How much horizontal offset survives the repose, as a fraction of the
// (unit) current direction's own horizontal component — small values read
// as "arm hanging close to the body," matching collisionRig.js's 0.08 rad
// / placement.js's 0.12 rad leans (this splits the difference, and unlike
// those two the exact value barely matters visually — see module comment).
const RESIDUAL_LEAN = 0.1

// WP-8.5: per-pose arm target, expressed relative to the SAME world-space
// trick reposeOneArm already used for `standing` — preserve whichever
// horizontal side the bind pose's own arm direction already leans toward
// (`out` scales how far it swings back out from vertical, `down` how much
// "point downward" remains). `contrapposto`'s asymmetry (one arm relaxed
// more than the other) is applied by the caller, not baked in here — see
// applyPoseToGLB's per-side override.
const ARM_POSE_TARGET = {
  standing: { out: RESIDUAL_LEAN, down: 1.0 },
  apose: { out: 0.55, down: 0.85 },
  tpose: { out: 1.0, down: 0.05 },
  contrapposto: { out: RESIDUAL_LEAN, down: 1.0 },
  seated: { out: RESIDUAL_LEAN, down: 1.0 },
}

// WP-8.4: VRM detection only — full VRM support (humanoid.humanBones
// retargeting) is a real separate spec with its own bone-mapping model,
// not a small extension of the Mixamo/RPM name lookup above, and is out of
// scope for this pass. Detecting it lets the caller show an honest "VRM
// detected, not supported yet" message instead of a generic "no rig
// found" one that would misdescribe why the repose didn't happen — a VRM
// file's bones are real and named, just under a different convention this
// app doesn't parse. `gltfResult` is whatever useGLTF(url) returns (the
// full GLTFLoader result, not just `.scene`) — VRM 0.x declares itself via
// the `VRM` extension, VRM 1.0 via `VRMC_vrm`; checking `extensionsUsed`
// (always populated by GLTFLoader for every extension referenced in the
// file, known or not) is more reliable than checking for a parsed
// `userData.gltfExtensions` entry, which only exists for extensions the
// loader doesn't already handle itself.
const VRM_EXTENSION_NAMES = ['VRM', 'VRMC_vrm']

export function detectVRM(gltfResult) {
  const used = gltfResult?.parser?.json?.extensionsUsed
  if (!Array.isArray(used)) return false
  return VRM_EXTENSION_NAMES.some((name) => used.includes(name))
}

function findBone(scene, names) {
  for (const name of names) {
    const bone = scene.getObjectByName(name)
    if (bone) return bone
  }
  return null
}

// Scales+repositions in place (mutate the CALLER's scene — always a fresh
// SkeletonUtils clone, never the shared useGLTF cache, see GLBAvatar.jsx)
// to match the target height and sit feet-first at y=0, exactly mirroring
// the production app's own loadGLB precedent (js/three-view.js).
export function normalizeGLBHeight(scene, targetHeight) {
  const box = new THREE.Box3().setFromObject(scene)
  const size = new THREE.Vector3()
  box.getSize(size)
  const scale = targetHeight / (size.y || 1)
  scene.scale.setScalar(scale)
  scene.updateMatrixWorld(true)

  const box2 = new THREE.Box3().setFromObject(scene)
  scene.position.y -= box2.min.y
  scene.updateMatrixWorld(true)
}

// Rotates `bone`, in WORLD space, so its direction toward `childBone`
// (measured fresh each call — correct even when called after an earlier
// correction already moved a parent bone, as the seated-leg knee bend
// below relies on) goes from wherever it currently points to `targetDir`.
// Working in world space (rather than assuming a local axis convention)
// makes this robust to exporters that orient bind-pose bones differently —
// three.js's own examples don't agree on this, so nothing here should have
// to guess it. Shared by the arm repose and the seated-leg knee bend.
function reposeBoneToDirection(bone, childBone, targetDir) {
  const bonePos = new THREE.Vector3()
  const childPos = new THREE.Vector3()
  bone.getWorldPosition(bonePos)
  childBone.getWorldPosition(childPos)

  const currentDir = childPos.sub(bonePos)
  const len = currentDir.length()
  if (!(len > 1e-6)) return false // degenerate rig (child coincides with parent) — bail, don't guess
  currentDir.divideScalar(len)

  const correction = new THREE.Quaternion().setFromUnitVectors(currentDir, targetDir.clone().normalize())

  const currentWorldQuat = new THREE.Quaternion()
  bone.getWorldQuaternion(currentWorldQuat)
  const desiredWorldQuat = correction.multiply(currentWorldQuat)

  const parentWorldQuat = new THREE.Quaternion()
  bone.parent.getWorldQuaternion(parentWorldQuat)
  bone.quaternion.copy(parentWorldQuat.invert().multiply(desiredWorldQuat))
  bone.updateMatrixWorld(true)
  return true
}

// Same world-space, side-preserving trick as `standing` always used,
// generalized to any {out, down} target (see ARM_POSE_TARGET) — `out`
// scales the target's horizontal magnitude, `down` its vertical.
function reposeOneArm(armBone, foreArmBone, { out, down }) {
  const shoulderPos = new THREE.Vector3()
  const elbowPos = new THREE.Vector3()
  armBone.getWorldPosition(shoulderPos)
  foreArmBone.getWorldPosition(elbowPos)
  const currentDir = elbowPos.sub(shoulderPos)
  const len = currentDir.length()
  if (!(len > 1e-6)) return false
  currentDir.divideScalar(len)
  const targetDir = new THREE.Vector3(currentDir.x * out, -down, currentDir.z * RESIDUAL_LEAN)
  return reposeBoneToDirection(armBone, foreArmBone, targetDir)
}

// WP-8.5 `seated`: bends the knee via two independent bone corrections —
// the thigh swings from "down" to "forward and slightly down" (a seated
// thigh), then the shin is corrected back toward straight-down relative to
// the thigh's NEW orientation (computed after the thigh's own
// updateMatrixWorld, exactly the way a real knee joint composes). "Forward"
// is derived from the character's own left-hip -> right-hip axis crossed
// with world up — robust to arbitrary bind-pose bone-local-axis
// conventions (the same reason reposeBoneToDirection works in world space
// at all), but genuinely ambiguous by 180°: since nothing here reads which
// way the character's face/chest actually points, an unlucky rig can end
// up seated "facing backward" (knees pointing behind the body instead of
// in front). A real, bounded, honest limitation — see README.
function reposeSeatedLeg(upLegBone, lowLegBone, footBone, forwardDir) {
  const upLegPos = new THREE.Vector3()
  const lowLegPos = new THREE.Vector3()
  upLegBone.getWorldPosition(upLegPos)
  lowLegBone.getWorldPosition(lowLegPos)
  const thighDir = lowLegPos.clone().sub(upLegPos).normalize()
  const thighTarget = forwardDir.clone().multiplyScalar(0.97).add(new THREE.Vector3(0, -0.25, 0)).normalize()
  if (thighDir.dot(thighTarget) > 0.999) return false // already there — avoid a degenerate cross product
  const thighOk = reposeBoneToDirection(upLegBone, lowLegBone, thighTarget)
  if (!thighOk) return false
  // Re-measured AFTER the thigh's correction (reposeBoneToDirection already
  // called updateMatrixWorld), so this sees the knee's NEW world position.
  return reposeBoneToDirection(lowLegBone, footBone, new THREE.Vector3(0, -1, 0))
}

// Three-tier fallback lives one level up (GLBAvatar/BodyAvatar): this just
// reports whether it could confidently do its job. All four standard arm
// bone names must resolve — a partial rig (e.g. only one arm found) is
// treated the same as none found, rather than repose one side and leave
// the other alone, which would look more obviously broken than doing
// nothing. `pose` (WP-8.5) defaults to the original arms-down "standing"
// correction — every existing caller before this pass gets identical
// behavior. `contrapposto`'s asymmetry designates the right arm/leg (by
// bone name, not world position) as the "relaxed" side — an arbitrary but
// consistent choice, same as Avatar.jsx's procedural counterpart.
export function applyPoseToGLB(scene, pose = 'standing') {
  const target = ARM_POSE_TARGET[pose] || ARM_POSE_TARGET.standing
  const leftArm = findBone(scene, ARM_BONE_NAMES.left)
  const leftFore = findBone(scene, ARM_BONE_NAMES.leftFore)
  const rightArm = findBone(scene, ARM_BONE_NAMES.right)
  const rightFore = findBone(scene, ARM_BONE_NAMES.rightFore)
  if (!leftArm || !leftFore || !rightArm || !rightFore) return { poseFixed: false, legPoseFixed: false }

  const leftOk = reposeOneArm(leftArm, leftFore, target)
  const relaxedTarget = pose === 'contrapposto' ? ARM_POSE_TARGET.apose : target
  const rightOk = reposeOneArm(rightArm, rightFore, relaxedTarget)

  let legPoseFixed = false
  if (pose === 'seated') {
    const rightHip = findBone(scene, LEG_BONE_NAMES.rightUp)
    const leftHip = findBone(scene, LEG_BONE_NAMES.leftUp)
    const leftLow = findBone(scene, LEG_BONE_NAMES.leftLow)
    const leftFoot = findBone(scene, LEG_BONE_NAMES.leftFoot)
    const rightLow = findBone(scene, LEG_BONE_NAMES.rightLow)
    const rightFoot = findBone(scene, LEG_BONE_NAMES.rightFoot)
    if (rightHip && leftHip && leftLow && leftFoot && rightLow && rightFoot) {
      const hipL = new THREE.Vector3(); const hipR = new THREE.Vector3()
      leftHip.getWorldPosition(hipL); rightHip.getWorldPosition(hipR)
      const hipAxis = hipR.clone().sub(hipL)
      if (hipAxis.length() > 1e-6) {
        const forward = new THREE.Vector3().crossVectors(hipAxis.normalize(), new THREE.Vector3(0, 1, 0)).normalize()
        const leftOk2 = reposeSeatedLeg(leftHip, leftLow, leftFoot, forward)
        const rightOk2 = reposeSeatedLeg(rightHip, rightLow, rightFoot, forward)
        legPoseFixed = leftOk2 && rightOk2
      }
    }
  }
  return { poseFixed: leftOk && rightOk, legPoseFixed }
}
