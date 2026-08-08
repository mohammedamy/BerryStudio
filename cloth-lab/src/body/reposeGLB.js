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

// `gltfResult` is whatever useGLTF(url) returns (the full GLTFLoader
// result, not just `.scene`) — VRM 0.x declares itself via the `VRM`
// extension, VRM 1.0 via `VRMC_vrm`; checking `extensionsUsed` (always
// populated by GLTFLoader for every extension referenced in the file,
// known or not) is more reliable than checking for a parsed
// `userData.gltfExtensions` entry, which only exists for extensions the
// loader doesn't already handle itself.
const VRM_EXTENSION_NAMES = ['VRM', 'VRMC_vrm']

export function detectVRM(gltfResult) {
  const used = gltfResult?.parser?.json?.extensionsUsed
  if (!Array.isArray(used)) return false
  return VRM_EXTENSION_NAMES.some((name) => used.includes(name))
}

// WP-29: VRM's humanoid.humanBones is a real, separate bone-naming spec
// from the Mixamo/Ready Player Me convention ARM_BONE_NAMES/LEG_BONE_NAMES
// above — a fixed, documented vocabulary (hips, upperChest, leftUpperArm,
// rightLowerLeg, …: https://github.com/vrm-c/vrm-specification), not a
// guess. Both VRM 0.x and VRM 1.0 use the SAME bone-name vocabulary; they
// only differ in where the node index lives in the JSON:
//   VRM 0.x   — extensions.VRM.humanoid.humanBones: [{ bone, node }, …]
//   VRM 1.0   — extensions.VRMC_vrm.humanoid.humanBones: { [bone]: { node } }
// Either way each entry points at a glTF node INDEX, not a name — this
// resolves each VRM bone key to that node's actual `name`, i.e. exactly
// the string GLTFLoader put on the corresponding Object3D, so the result
// can feed the same `scene.getObjectByName()` lookup the Mixamo/RPM path
// already uses (see findBone below). Returns {} (not null) when the file
// claims a VRM extension but its humanoid/humanBones data is missing or
// malformed — callers treat that the same as "no VRM bones resolved",
// never as a crash.
export function resolveVRMBoneNames(gltfResult) {
  const json = gltfResult?.parser?.json
  const nodes = json?.nodes
  if (!Array.isArray(nodes)) return {}
  const nameForNode = (nodeIndex) => {
    const node = nodes[nodeIndex]
    return node && typeof node.name === 'string' && node.name ? node.name : null
  }
  const out = {}
  const v1 = json?.extensions?.VRMC_vrm?.humanoid?.humanBones
  if (v1 && typeof v1 === 'object') {
    for (const [bone, entry] of Object.entries(v1)) {
      const name = entry && Number.isInteger(entry.node) ? nameForNode(entry.node) : null
      if (name) out[bone] = name
    }
    if (Object.keys(out).length) return out
  }
  const v0 = json?.extensions?.VRM?.humanoid?.humanBones
  if (Array.isArray(v0)) {
    for (const entry of v0) {
      const name = entry && Number.isInteger(entry.node) ? nameForNode(entry.node) : null
      if (name && entry.bone) out[entry.bone] = name
    }
  }
  return out
}

// Maps this file's internal arm/leg roles to VRM's canonical bone-name
// vocabulary — shared by both VRM 0.x and 1.0, per the spec linked above.
const VRM_BONE_KEYS = {
  left: 'leftUpperArm', leftFore: 'leftLowerArm',
  right: 'rightUpperArm', rightFore: 'rightLowerArm',
  leftUp: 'leftUpperLeg', leftLow: 'leftLowerLeg', leftFoot: 'leftFoot',
  rightUp: 'rightUpperLeg', rightLow: 'rightLowerLeg', rightFoot: 'rightFoot',
}

// `vrmBoneNames` (from resolveVRMBoneNames, or {} for a non-VRM file) is
// tried FIRST — a VRM file's real bone names (often a studio's own
// convention, e.g. "J_Bip_L_UpperArm") won't collide with the Mixamo/RPM
// names in `names`, so trying both lists is safe for every file type and
// means this one lookup serves both rigs without the caller needing to
// know which convention a given scene uses.
function findBone(scene, names, vrmKey, vrmBoneNames) {
  const vrmName = vrmKey && vrmBoneNames ? vrmBoneNames[vrmKey] : null
  if (vrmName) {
    const bone = scene.getObjectByName(vrmName)
    if (bone) return bone
  }
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
// `vrmBoneNames` (WP-29, optional) — the result of resolveVRMBoneNames(),
// tried before the Mixamo/RPM names for every bone lookup below; omit (or
// pass {}) for a non-VRM file, which reproduces the exact pre-WP-29
// behavior.
export function applyPoseToGLB(scene, pose = 'standing', vrmBoneNames = null) {
  const target = ARM_POSE_TARGET[pose] || ARM_POSE_TARGET.standing
  const leftArm = findBone(scene, ARM_BONE_NAMES.left, VRM_BONE_KEYS.left, vrmBoneNames)
  const leftFore = findBone(scene, ARM_BONE_NAMES.leftFore, VRM_BONE_KEYS.leftFore, vrmBoneNames)
  const rightArm = findBone(scene, ARM_BONE_NAMES.right, VRM_BONE_KEYS.right, vrmBoneNames)
  const rightFore = findBone(scene, ARM_BONE_NAMES.rightFore, VRM_BONE_KEYS.rightFore, vrmBoneNames)
  if (!leftArm || !leftFore || !rightArm || !rightFore) return { poseFixed: false, legPoseFixed: false }

  const leftOk = reposeOneArm(leftArm, leftFore, target)
  const relaxedTarget = pose === 'contrapposto' ? ARM_POSE_TARGET.apose : target
  const rightOk = reposeOneArm(rightArm, rightFore, relaxedTarget)

  let legPoseFixed = false
  if (pose === 'seated') {
    const rightHip = findBone(scene, LEG_BONE_NAMES.rightUp, VRM_BONE_KEYS.rightUp, vrmBoneNames)
    const leftHip = findBone(scene, LEG_BONE_NAMES.leftUp, VRM_BONE_KEYS.leftUp, vrmBoneNames)
    const leftLow = findBone(scene, LEG_BONE_NAMES.leftLow, VRM_BONE_KEYS.leftLow, vrmBoneNames)
    const leftFoot = findBone(scene, LEG_BONE_NAMES.leftFoot, VRM_BONE_KEYS.leftFoot, vrmBoneNames)
    const rightLow = findBone(scene, LEG_BONE_NAMES.rightLow, VRM_BONE_KEYS.rightLow, vrmBoneNames)
    const rightFoot = findBone(scene, LEG_BONE_NAMES.rightFoot, VRM_BONE_KEYS.rightFoot, vrmBoneNames)
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
