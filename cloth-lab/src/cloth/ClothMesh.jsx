import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { TSHIRT_PIECES, TSHIRT_SEAMS } from '../pattern/tshirt'
import { triangulateAll } from '../pattern/triangulate'
import { assembleCloth, deriveNeighbors, deriveNormalRing } from './assemble'
import { ClothSimulation, textureDimFor } from './ClothSimulation'
import { FABRIC_PRESETS, DEFAULT_FABRIC } from './fabricPresets'
import { deriveCollisionRig, deriveShoulderPinMask, deriveWaistbandPinMask } from '../body/collisionRig'

// A single real (CC0, see public/textures/fabric-weave/README.md) fabric-
// weave texture set, shared across every fabric preset — color/roughness/
// sheen/clearcoat still differ per fabric (below), this only replaces "flat
// solid color" with real woven-fabric surface detail. Loaded once at module
// scope (not per fabric switch, not via a Suspense hook — see the cloth-lab
// realism plan's Tier-1/B2 notes on why plain TextureLoader was chosen over
// drei's useTexture here) so switching fabrics never re-triggers a network
// fetch or shows a pop-in.
const TEX_BASE = `${import.meta.env.BASE_URL}textures/fabric-weave/`
let fabricTexturesPromise = null
function loadFabricTextures() {
  if (fabricTexturesPromise) return fabricTexturesPromise
  const loader = new THREE.TextureLoader()
  const load = (file, isColor) => new Promise((resolve) => {
    loader.load(TEX_BASE + file, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      if (isColor) tex.colorSpace = THREE.SRGBColorSpace // normal/roughness maps must stay linear
      resolve(tex)
    }, undefined, () => resolve(null)) // missing/broken texture -> fall back to flat color, not a crash
  })
  fabricTexturesPromise = Promise.all([
    load('diffuse.jpg', true),
    load('normal.jpg', false),
    load('roughness.jpg', false),
  ]).then(([map, normalMap, roughnessMap]) => ({ map, normalMap, roughnessMap }))
  return fabricTexturesPromise
}

// Build-order steps 6+: the actual simulated garment. Geometry is built once
// per `dims`/`pieces`/`seams` change (placement is a pure function of body
// dims); the GPU simulation owns position from then on — see ClothSimulation
// for the physics and the onBeforeCompile patch below for how the render
// mesh reads it back with zero CPU readback (that guarantee is specifically
// about the steady-state render loop — grab-and-drag below does a ONE-TIME
// readback per pointerdown, which is a rare, user-paced event, not a
// per-frame cost).
export default function ClothMesh({ dims, fabricId = DEFAULT_FABRIC, onDragStateChange, pieces = TSHIRT_PIECES, seams = TSHIRT_SEAMS, statsRef, meshFitRigRef }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  const assembled = useMemo(() => {
    const triangulated = triangulateAll(pieces, seams, 2)
    const cloth = assembleCloth(triangulated, dims, seams)
    const neighbors = deriveNeighbors(cloth, 8)
    const normalRing = deriveNormalRing(cloth, neighbors, 4)
    return { cloth, neighbors, normalRing }
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
    // Vestigial: MeshPhysicalMaterial's standard vertex chunks reference a
    // `normal` attribute unconditionally even though the onBeforeCompile
    // patch below fully overwrites vNormal with a live-computed smooth
    // normal afterward — this rest-pose value is never actually seen.
    geom.computeVertexNormals()

    const texDim = textureDimFor(cloth.simParticleCount)
    const simUV = new Float32Array(cloth.renderVertexCount * 2)
    for (let i = 0; i < cloth.renderVertexCount; i++) {
      const sp = cloth.renderVertexToSimParticle[i]
      simUV[i * 2] = (sp % texDim + 0.5) / texDim
      simUV[i * 2 + 1] = (Math.floor(sp / texDim) + 0.5) / texDim
    }
    geom.setAttribute('aSimUV', new THREE.BufferAttribute(simUV, 2))

    // Neighbor-ring texel UVs for live smooth-normal shading (see the
    // onBeforeCompile patch below and assemble.js's deriveNormalRing) — each
    // render vertex carries its sim particle's angularly-sorted 4-neighbor
    // ring, converted to the same position-texture texel coordinates aSimUV
    // already uses, packed as two vec4s since GLSL has no vec2[4] attribute.
    const ringSize = 4
    const { normalRing } = assembled
    const toU = (sp) => (sp % texDim + 0.5) / texDim
    const toV = (sp) => (Math.floor(sp / texDim) + 0.5) / texDim
    const nbrUV0 = new Float32Array(cloth.renderVertexCount * 4)
    const nbrUV1 = new Float32Array(cloth.renderVertexCount * 4)
    for (let i = 0; i < cloth.renderVertexCount; i++) {
      const sp = cloth.renderVertexToSimParticle[i]
      const r0 = normalRing[sp * ringSize], r1 = normalRing[sp * ringSize + 1]
      const r2 = normalRing[sp * ringSize + 2], r3 = normalRing[sp * ringSize + 3]
      nbrUV0[i * 4] = toU(r0); nbrUV0[i * 4 + 1] = toV(r0)
      nbrUV0[i * 4 + 2] = toU(r1); nbrUV0[i * 4 + 3] = toV(r1)
      nbrUV1[i * 4] = toU(r2); nbrUV1[i * 4 + 1] = toV(r2)
      nbrUV1[i * 4 + 2] = toU(r3); nbrUV1[i * 4 + 3] = toV(r3)
    }
    geom.setAttribute('aNbrUV0', new THREE.BufferAttribute(nbrUV0, 4))
    geom.setAttribute('aNbrUV1', new THREE.BufferAttribute(nbrUV1, 4))

    return geom
  }, [assembled])

  // Smooth per-vertex normals, computed live in the vertex shader from the
  // GPU position texture — NOT flatShading. An earlier pass used
  // flatShading (screen-space-derivative normals, free and automatic) but
  // that gives every render TRIANGLE its own flat normal, which reads as
  // visible facets/ridges under any glossy material (very obvious on Silk's
  // clearcoat). Real smooth shading needs a normal that's consistent across
  // every triangle sharing a vertex — impossible to get from screen-space
  // derivatives alone. Since the GPU sim only ever writes particle
  // *positions* (no vertex-normal attribute tracks the live deformation),
  // this instead samples each vertex's precomputed neighbor ring (see
  // assemble.js's deriveNormalRing + the aNbrUV0/aNbrUV1 attributes above)
  // from the SAME position texture already bound below, and rebuilds an
  // area-swept normal from current, live, deformed positions every frame.
  //
  // MeshPhysicalMaterial (a MeshStandardMaterial superset) so sheen/clearcoat
  // are available — same onBeforeCompile GPU-position patch works unchanged,
  // since it still targets the shared <begin_vertex>/<common> chunks. Rebuilt
  // per fabricId (a real, if infrequent, shader recompile) so switching
  // fabric actually looks different, not just simulates differently — values
  // ported from the production app's own fabric table, see fabricPresets.js.
  const material = useMemo(() => {
    const fabric = FABRIC_PRESETS[fabricId] || FABRIC_PRESETS[DEFAULT_FABRIC]
    const mat = new THREE.MeshPhysicalMaterial({
      color: '#c9cedb', roughness: fabric.rough, metalness: fabric.metal,
      sheen: fabric.sheen, sheenRoughness: 0.5, clearcoat: fabric.clear, clearcoatRoughness: 0.4,
      transparent: fabric.om < 1, opacity: fabric.om,
      side: THREE.DoubleSide,
      // WP-9.2: only chiffon/tulle declare transmission, only silk/satin
      // declare anisotropy (see fabricPresets.js) — Material.setValues()
      // warns on every explicitly-`undefined` key, so these are left out
      // of the options object entirely rather than passed as `undefined`
      // for fabrics that don't have them (defaults to 0, i.e. off).
      ...(fabric.transmission != null && { transmission: fabric.transmission, thickness: 0.001 }),
      ...(fabric.anisotropy != null && { anisotropy: fabric.anisotropy, anisotropyRotation: fabric.anisotropyRotation ?? 0 }),
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSimPositionTex = { value: null }
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          'attribute vec2 aSimUV;\nattribute vec4 aNbrUV0;\nattribute vec4 aNbrUV1;\nuniform sampler2D uSimPositionTex;\n#include <common>'
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 selfPos = texture2D( uSimPositionTex, aSimUV ).xyz;
          vec3 rn0 = texture2D( uSimPositionTex, aNbrUV0.xy ).xyz - selfPos;
          vec3 rn1 = texture2D( uSimPositionTex, aNbrUV0.zw ).xyz - selfPos;
          vec3 rn2 = texture2D( uSimPositionTex, aNbrUV1.xy ).xyz - selfPos;
          vec3 rn3 = texture2D( uSimPositionTex, aNbrUV1.zw ).xyz - selfPos;
          vec3 smoothNormal = cross(rn0, rn1) + cross(rn1, rn2) + cross(rn2, rn3) + cross(rn3, rn0);
          vNormal = normalize( normalMatrix * normalize(smoothNormal) );
          vec3 transformed = selfPos;`
        )
      mat.userData.shader = shader
    }
    return mat
  }, [fabricId])

  // Applied asynchronously once the (module-cached, loaded-once) fabric
  // texture set resolves — kept separate from the material useMemo above
  // since texture loading is inherently async and useMemo must return
  // synchronously. `needsUpdate=true` forces a recompile that re-runs
  // onBeforeCompile above, so the GPU-position patch survives. The `live`
  // flag guards against applying a stale/superseded load to a material from
  // a since-changed fabricId (this effect's own cleanup flips it off).
  useEffect(() => {
    let live = true
    loadFabricTextures().then(({ map, normalMap, roughnessMap }) => {
      if (!live) return
      material.map = map
      material.normalMap = normalMap
      material.roughnessMap = roughnessMap
      material.needsUpdate = true
    })
    return () => { live = false }
  }, [material])

  const simRef = useRef(null)
  useEffect(() => {
    const fabric = FABRIC_PRESETS[fabricId] || FABRIC_PRESETS[DEFAULT_FABRIC]
    // WP-8.3: prefer a real, currently-loaded GLB's own mesh-fit collision
    // rig (written by BodyAvatar/GLBAvatar into meshFitRigRef — see
    // Scene.jsx's header comment) over the formula-only one, when present.
    const collisionRig = meshFitRigRef?.current || deriveCollisionRig(dims)
    const shoulderMask = deriveShoulderPinMask(assembled.cloth.simRestPositions, assembled.cloth.simParticleCount, dims)
    const waistbandMask = deriveWaistbandPinMask(assembled.cloth.simRestPositions, assembled.cloth.simParticleCount, dims)
    const pinnedMask = shoulderMask.map((v, i) => (v || waistbandMask[i] ? 1 : 0))
    const sim = new ClothSimulation(gl, assembled.cloth, assembled.neighbors, fabric, { collisionRig, pinnedMask })
    sim.preRelax()
    simRef.current = sim
    return () => {
      sim.dispose()
      simRef.current = null
    }
  }, [gl, assembled, dims])

  useEffect(() => {
    simRef.current?.setFabric(FABRIC_PRESETS[fabricId] || FABRIC_PRESETS[DEFAULT_FABRIC])
  }, [fabricId])

  useFrame((_, delta) => {
    const sim = simRef.current
    if (!sim) return
    sim.step(delta)
    if (material.userData.shader) {
      material.userData.shader.uniforms.uSimPositionTex.value = sim.getPositionTexture()
    }
    // WP-7.3: cheap plain-object write, no state/re-render — SolverHUD.jsx
    // polls this ref on its own throttled timer from outside the R3F loop.
    if (statsRef) Object.assign(statsRef.current, sim.getStats())
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

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} castShadow receiveShadow />
}
