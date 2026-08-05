import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { detectVRM, resolveVRMBoneNames, applyPoseToGLB } from './reposeGLB.js'

describe('detectVRM', () => {
  it('detects VRM 0.x via the "VRM" extension', () => {
    expect(detectVRM({ parser: { json: { extensionsUsed: ['VRM'] } } })).toBe(true)
  })

  it('detects VRM 1.0 via the "VRMC_vrm" extension', () => {
    expect(detectVRM({ parser: { json: { extensionsUsed: ['VRMC_vrm', 'KHR_materials_emissive_strength'] } } })).toBe(true)
  })

  it('returns false for a plain Mixamo/RPM glTF with no VRM extension', () => {
    expect(detectVRM({ parser: { json: { extensionsUsed: ['KHR_materials_unlit'] } } })).toBe(false)
  })

  it('returns false when extensionsUsed is missing entirely', () => {
    expect(detectVRM({ parser: { json: {} } })).toBe(false)
    expect(detectVRM({})).toBe(false)
    expect(detectVRM(null)).toBe(false)
  })
})

// WP-29: VRM's humanoid.humanBones maps a fixed, spec-defined bone-name
// vocabulary (hips, leftUpperArm, …) to glTF node INDICES, not names —
// resolveVRMBoneNames turns that into {vrmBoneKey: actualNodeName}, which
// is what applyPoseToGLB then feeds into scene.getObjectByName().
describe('resolveVRMBoneNames', () => {
  it('resolves VRM 1.0 (VRMC_vrm object-keyed humanBones)', () => {
    const gltfResult = {
      parser: {
        json: {
          nodes: [{ name: 'Root' }, { name: 'J_Bip_L_UpperArm' }, { name: 'J_Bip_L_LowerArm' }],
          extensions: {
            VRMC_vrm: { humanoid: { humanBones: { leftUpperArm: { node: 1 }, leftLowerArm: { node: 2 } } } },
          },
        },
      },
    }
    expect(resolveVRMBoneNames(gltfResult)).toEqual({
      leftUpperArm: 'J_Bip_L_UpperArm',
      leftLowerArm: 'J_Bip_L_LowerArm',
    })
  })

  it('resolves VRM 0.x (VRM array-of-{bone,node} humanBones)', () => {
    const gltfResult = {
      parser: {
        json: {
          nodes: [{ name: 'Root' }, { name: 'RightUpperArm_VRM0' }],
          extensions: {
            VRM: { humanoid: { humanBones: [{ bone: 'rightUpperArm', node: 1 }] } },
          },
        },
      },
    }
    expect(resolveVRMBoneNames(gltfResult)).toEqual({ rightUpperArm: 'RightUpperArm_VRM0' })
  })

  it('returns {} for a non-VRM file, or VRM extension data that is missing/malformed', () => {
    expect(resolveVRMBoneNames({ parser: { json: { nodes: [{ name: 'A' }] } } })).toEqual({})
    expect(resolveVRMBoneNames({ parser: { json: { nodes: [{ name: 'A' }], extensions: { VRMC_vrm: {} } } } })).toEqual({})
    expect(resolveVRMBoneNames({ parser: { json: {} } })).toEqual({})
    expect(resolveVRMBoneNames(null)).toEqual({})
  })

  it('skips a humanBones entry whose node index has no name (never invents one)', () => {
    const gltfResult = {
      parser: {
        json: {
          nodes: [{ name: 'Root' }, {}],
          extensions: { VRMC_vrm: { humanoid: { humanBones: { hips: { node: 1 } } } } },
        },
      },
    }
    expect(resolveVRMBoneNames(gltfResult)).toEqual({})
  })
})

// Builds a minimal T-pose arm rig using real THREE.Object3D bones, named
// with an arbitrary VRM-studio convention that does NOT overlap any
// Mixamo/RPM name in ARM_BONE_NAMES — so if this resolves at all, it can
// only be via the vrmBoneNames path, not a lucky name collision.
function makeVRMArmRig() {
  const root = new THREE.Object3D()
  const leftArm = new THREE.Object3D(); leftArm.name = 'J_Bip_L_UpperArm'
  const leftFore = new THREE.Object3D(); leftFore.name = 'J_Bip_L_LowerArm'
  const rightArm = new THREE.Object3D(); rightArm.name = 'J_Bip_R_UpperArm'
  const rightFore = new THREE.Object3D(); rightFore.name = 'J_Bip_R_LowerArm'
  root.add(leftArm); leftArm.add(leftFore)
  root.add(rightArm); rightArm.add(rightFore)
  // T-pose: each forearm sits straight out to the side of its shoulder.
  leftArm.position.set(0.2, 1.4, 0)
  leftFore.position.set(0.3, 0, 0)
  rightArm.position.set(-0.2, 1.4, 0)
  rightFore.position.set(-0.3, 0, 0)
  root.updateMatrixWorld(true)
  return { root, leftArm, leftFore, rightArm, rightFore }
}

describe('applyPoseToGLB with VRM bone names', () => {
  it('reposes a VRM-named T-pose rig to standing (arms-down) using vrmBoneNames, not the Mixamo names', () => {
    const { root, leftArm } = makeVRMArmRig()
    const vrmBoneNames = {
      leftUpperArm: 'J_Bip_L_UpperArm', leftLowerArm: 'J_Bip_L_LowerArm',
      rightUpperArm: 'J_Bip_R_UpperArm', rightLowerArm: 'J_Bip_R_LowerArm',
    }
    const before = leftArm.quaternion.clone()
    const result = applyPoseToGLB(root, 'standing', vrmBoneNames)
    expect(result.poseFixed).toBe(true)
    expect(leftArm.quaternion.equals(before)).toBe(false) // the T-pose arm actually rotated
  })

  it('does NOT resolve the same VRM-named rig when vrmBoneNames is omitted (proves the plain Mixamo path alone cannot see it)', () => {
    const { root } = makeVRMArmRig()
    const result = applyPoseToGLB(root, 'standing')
    expect(result.poseFixed).toBe(false)
  })

  it('falls through to the Mixamo names when vrmBoneNames resolves nothing for a role (a non-VRM file passing {})', () => {
    const root = new THREE.Object3D()
    const leftArm = new THREE.Object3D(); leftArm.name = 'LeftArm'
    const leftFore = new THREE.Object3D(); leftFore.name = 'LeftForeArm'
    const rightArm = new THREE.Object3D(); rightArm.name = 'RightArm'
    const rightFore = new THREE.Object3D(); rightFore.name = 'RightForeArm'
    root.add(leftArm); leftArm.add(leftFore); root.add(rightArm); rightArm.add(rightFore)
    leftArm.position.set(0.2, 1.4, 0); leftFore.position.set(0.3, 0, 0)
    rightArm.position.set(-0.2, 1.4, 0); rightFore.position.set(-0.3, 0, 0)
    root.updateMatrixWorld(true)
    expect(applyPoseToGLB(root, 'standing', {}).poseFixed).toBe(true)
  })
})
