import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { TSHIRT_PIECES, TSHIRT_SEAMS } from '../pattern/tshirt'
import { triangulateAll } from '../pattern/triangulate'
import { assembleCloth, deriveNeighbors } from './assemble'
import { ClothSimulation, textureDimFor } from './ClothSimulation'
import { FABRIC_SIM_PRESETS, DEFAULT_FABRIC } from './fabricPresets'
import { deriveCollisionRig } from '../body/collisionRig'

// Build-order steps 6+: the actual simulated garment. Geometry is built once
// per `dims` change (placement is a pure function of body dims); the GPU
// simulation owns position from then on — see ClothSimulation for the
// physics and the onBeforeCompile patch below for how the render mesh reads
// it back with zero CPU readback.
export default function ClothMesh({ dims, fabricId = DEFAULT_FABRIC }) {
  const gl = useThree((s) => s.gl)

  const assembled = useMemo(() => {
    const triangulated = triangulateAll(TSHIRT_PIECES, TSHIRT_SEAMS, 2)
    const cloth = assembleCloth(triangulated, dims, TSHIRT_SEAMS)
    const neighbors = deriveNeighbors(cloth, 8)
    return { cloth, neighbors }
  }, [dims])

  const geometry = useMemo(() => {
    const { cloth } = assembled
    const geom = new THREE.BufferGeometry()

    const positions = new Float32Array(cloth.renderVertexCount * 3)
    for (let i = 0; i < cloth.renderVertexCount; i++) {
      const sp = cloth.renderVertexToSimParticle[i]
      positions[i * 3] = cloth.simRestPositions[sp * 3]
      positions[i * 3 + 1] = cloth.simRestPositions[sp * 3 + 1]
      positions[i * 3 + 2] = cloth.simRestPositions[sp * 3 + 2]
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('uv', new THREE.BufferAttribute(cloth.renderUV, 2))
    geom.setIndex(new THREE.BufferAttribute(cloth.renderTriangles, 1))
    // Vestigial: MeshStandardMaterial's vertex stage still requires a
    // `normal` attribute to exist even though flatShading (below) recomputes
    // real per-face normals from screen-space derivatives every frame.
    geom.computeVertexNormals()

    const texDim = textureDimFor(cloth.simParticleCount)
    const simUV = new Float32Array(cloth.renderVertexCount * 2)
    for (let i = 0; i < cloth.renderVertexCount; i++) {
      const sp = cloth.renderVertexToSimParticle[i]
      simUV[i * 2] = (sp % texDim + 0.5) / texDim
      simUV[i * 2 + 1] = (Math.floor(sp / texDim) + 0.5) / texDim
    }
    geom.setAttribute('aSimUV', new THREE.BufferAttribute(simUV, 2))

    return geom
  }, [assembled])

  // flatShading=true makes three.js derive normals per-face from dFdx/dFdy
  // of vViewPosition (see normal_fragment_begin) instead of interpolated
  // vertex normals — and since vViewPosition is computed downstream of
  // `transformed` in every standard-material vertex shader, it automatically
  // reflects the GPU-deformed position with no extra patching required.
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#c9cedb', roughness: 0.85, metalness: 0.02,
      flatShading: true, side: THREE.DoubleSide,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSimPositionTex = { value: null }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', 'attribute vec2 aSimUV;\nuniform sampler2D uSimPositionTex;\n#include <common>')
        .replace('#include <begin_vertex>', 'vec3 transformed = texture2D( uSimPositionTex, aSimUV ).xyz;')
      mat.userData.shader = shader
    }
    return mat
  }, [])

  const simRef = useRef(null)
  useEffect(() => {
    const fabric = FABRIC_SIM_PRESETS[fabricId] || FABRIC_SIM_PRESETS[DEFAULT_FABRIC]
    const collisionRig = deriveCollisionRig(dims)
    const sim = new ClothSimulation(gl, assembled.cloth, assembled.neighbors, fabric, { collisionRig })
    simRef.current = sim
    return () => {
      sim.dispose()
      simRef.current = null
    }
  }, [gl, assembled, dims])

  useEffect(() => {
    simRef.current?.setFabric(FABRIC_SIM_PRESETS[fabricId] || FABRIC_SIM_PRESETS[DEFAULT_FABRIC])
  }, [fabricId])

  useFrame((_, delta) => {
    const sim = simRef.current
    if (!sim) return
    sim.step(delta)
    if (material.userData.shader) {
      material.userData.shader.uniforms.uSimPositionTex.value = sim.getPositionTexture()
    }
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
