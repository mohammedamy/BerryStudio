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

// How much horizontal offset survives the repose, as a fraction of the
// (unit) current direction's own horizontal component — small values read
// as "arm hanging close to the body," matching collisionRig.js's 0.08 rad
// / placement.js's 0.12 rad leans (this splits the difference, and unlike
// those two the exact value barely matters visually — see module comment).
const RESIDUAL_LEAN = 0.1

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

// Rotates one arm's upper-arm bone, in WORLD space, so its shoulder->elbow
// direction goes from wherever it currently points to "mostly down, same
// horizontal side it was already on." Working in world space (rather than
// assuming a local axis convention) makes this robust to exporters that
// orient bind-pose bones differently — three.js's own examples don't agree
// on this, so nothing here should have to guess it.
function reposeOneArm(armBone, foreArmBone) {
  const shoulderPos = new THREE.Vector3()
  const elbowPos = new THREE.Vector3()
  armBone.getWorldPosition(shoulderPos)
  foreArmBone.getWorldPosition(elbowPos)

  const currentDir = elbowPos.sub(shoulderPos)
  const len = currentDir.length()
  if (!(len > 1e-6)) return false // degenerate rig (elbow coincides with shoulder) — bail, don't guess
  currentDir.divideScalar(len)

  const targetDir = new THREE.Vector3(currentDir.x * RESIDUAL_LEAN, -1, currentDir.z * RESIDUAL_LEAN).normalize()
  const correction = new THREE.Quaternion().setFromUnitVectors(currentDir, targetDir)

  const currentWorldQuat = new THREE.Quaternion()
  armBone.getWorldQuaternion(currentWorldQuat)
  const desiredWorldQuat = correction.multiply(currentWorldQuat)

  const parentWorldQuat = new THREE.Quaternion()
  armBone.parent.getWorldQuaternion(parentWorldQuat)
  const localQuat = parentWorldQuat.invert().multiply(desiredWorldQuat)

  armBone.quaternion.copy(localQuat)
  armBone.updateMatrixWorld(true)
  return true
}

// Three-tier fallback lives one level up (GLBAvatar/BodyAvatar): this just
// reports whether it could confidently do its job. All four standard bone
// names must resolve — a partial rig (e.g. only one arm found) is treated
// the same as none found, rather than repose one side and leave the other
// alone, which would look more obviously broken than doing nothing.
export function applyArmsDownRepose(scene) {
  const leftArm = findBone(scene, ARM_BONE_NAMES.left)
  const leftFore = findBone(scene, ARM_BONE_NAMES.leftFore)
  const rightArm = findBone(scene, ARM_BONE_NAMES.right)
  const rightFore = findBone(scene, ARM_BONE_NAMES.rightFore)
  if (!leftArm || !leftFore || !rightArm || !rightFore) return { poseFixed: false }

  const leftOk = reposeOneArm(leftArm, leftFore)
  const rightOk = reposeOneArm(rightArm, rightFore)
  return { poseFixed: leftOk && rightOk }
}
