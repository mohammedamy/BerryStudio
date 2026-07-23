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
// per `dims`/`pieces`/`seams` change (placement is a pure function of body
// dims); the GPU simulation owns position from then on — see ClothSimulation
// for the physics and the onBeforeCompile patch below for how the render
// mesh reads it back with zero CPU readback (that guarantee is specifically
// about the steady-state render loop — grab-and-drag below does a ONE-TIME
// readback per pointerdown, which is a rare, user-paced event, not a
// per-frame cost).
export default function ClothMesh({ dims, fabricId = DEFAULT_FABRIC, onDragStateChange, pieces = TSHIRT_PIECES, seams = TSHIRT_SEAMS }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  const assembled = useMemo(() => {
    const triangulated = triangulateAll(pieces, seams, 2)
    const cloth = assembleCloth(triangulated, dims, seams)
    const neighbors = deriveNeighbors(cloth, 8)
    return { cloth, neighbors }
  }, [dims, pieces, seams])

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

  // Grab-and-drag: raycast -> pin one sim particle to the pointer.
  //
  // Three.js's Raycaster tests against `geometry.attributes.position`, which
  // is otherwise vestigial here (the vertex shader overrides render position
  // from the GPU texture every frame — see the material above). So on every
  // pointerdown we do a ONE-TIME readback of the CURRENT sim state and copy
  // it into that attribute, making the geometry briefly "true" again just
  // long enough to raycast against the actual current drape, not the rest
  // pose. A plain DOM listener on the canvas (not R3F's onPointerDown prop)
  // is used deliberately: R3F's built-in per-object raycasting runs BEFORE
  // our handler gets a chance to freshen the geometry, so it would always
  // test against the stale rest-pose shape.
  const meshRef = useRef(null)
  const dragRef = useRef(null) // { particleIndex, plane: THREE.Plane }

  useEffect(() => {
    const canvas = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const camDir = new THREE.Vector3()
    const target = new THREE.Vector3()

    function setNdc(e) {
      const rect = canvas.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }

    function refreshGeometryToCurrentPositions() {
      const sim = simRef.current
      const mesh = meshRef.current
      if (!sim || !mesh) return false
      const texDim = sim.texDim
      const buffer = new Float32Array(texDim * texDim * 4)
      gl.readRenderTargetPixels(sim.gpuCompute.getCurrentRenderTarget(sim.posVar), 0, 0, texDim, texDim, buffer)
      const { cloth } = assembled
      const posAttr = mesh.geometry.attributes.position
      for (let i = 0; i < cloth.renderVertexCount; i++) {
        const sp = cloth.renderVertexToSimParticle[i]
        posAttr.array[i * 3] = buffer[sp * 4]
        posAttr.array[i * 3 + 1] = buffer[sp * 4 + 1]
        posAttr.array[i * 3 + 2] = buffer[sp * 4 + 2]
      }
      posAttr.needsUpdate = true
      mesh.geometry.computeBoundingSphere()
      return true
    }

    function onPointerDown(e) {
      const sim = simRef.current
      const mesh = meshRef.current
      if (!sim || !mesh || e.button !== 0) return
      if (!refreshGeometryToCurrentPositions()) return

      setNdc(e)
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObject(mesh)
      if (hits.length === 0) return

      const hit = hits[0]
      const { cloth } = assembled
      const posAttr = mesh.geometry.attributes.position
      const idx = mesh.geometry.index.array
      const triStart = hit.faceIndex * 3
      let best = idx[triStart], bestDist = Infinity
      for (let k = 0; k < 3; k++) {
        const c = idx[triStart + k]
        const dx = posAttr.array[c * 3] - hit.point.x
        const dy = posAttr.array[c * 3 + 1] - hit.point.y
        const dz = posAttr.array[c * 3 + 2] - hit.point.z
        const d = dx * dx + dy * dy + dz * dz
        if (d < bestDist) { bestDist = d; best = c }
      }
      const particleIndex = cloth.renderVertexToSimParticle[best]

      camera.getWorldDirection(camDir)
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, hit.point)
      dragRef.current = { particleIndex, plane }
      sim.setDragParticle(particleIndex, hit.point)
      onDragStateChange?.(true)
      canvas.setPointerCapture?.(e.pointerId)
    }

    function onPointerMove(e) {
      const drag = dragRef.current
      const sim = simRef.current
      if (!drag || !sim) return
      setNdc(e)
      raycaster.setFromCamera(ndc, camera)
      if (raycaster.ray.intersectPlane(drag.plane, target)) {
        sim.setDragParticle(drag.particleIndex, target)
      }
    }

    function onPointerUp(e) {
      if (!dragRef.current) return
      dragRef.current = null
      simRef.current?.clearDrag()
      onDragStateChange?.(false)
      canvas.releasePointerCapture?.(e.pointerId)
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
    }
  }, [gl, camera, assembled, onDragStateChange])

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />
}
