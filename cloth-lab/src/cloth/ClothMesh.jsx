import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { TSHIRT_PIECES, TSHIRT_SEAMS } from '../pattern/tshirt'
import { triangulateAll, adaptiveSpacingCm } from '../pattern/triangulate'
import { assembleCloth, deriveNeighbors, deriveNormalRing, UV_REPEAT_CM } from './assemble'
import { ClothSimulation, textureDimFor, QUALITY_TIER_DEFAULT } from './ClothSimulation'
import { FABRIC_PRESETS, DEFAULT_FABRIC } from './fabricPresets'
import { deriveCollisionRig, deriveGarmentPinMask } from '../body/collisionRig'
import { updateExportGeometry } from '../export/prepareScene'
import { SAFE_CLOTH_NORMAL_GLSL } from './surfaceShader'
import { createEmptyPrintTexture, createPrintOverlayTexture } from './printTextures'
import { getFabricTextureSet } from '../../../js/fabric-textures.js'
import { extractClothStitchChains, buildClothStitchGeometry, updateClothStitchColors } from './stitchGeometry'
import { normalizeStitchConfig } from '../../../js/stitch-config.js'

// Build-order steps 6+: the actual simulated garment. Geometry is built once
// per `dims`/`pieces`/`seams` change (placement is a pure function of body
// dims); the GPU simulation owns position from then on — see ClothSimulation
// for the physics and the onBeforeCompile patch below for how the render
// mesh reads it back with zero CPU readback (that guarantee is specifically
// about the steady-state render loop — grab-and-drag below does a ONE-TIME
// readback per pointerdown, which is a rare, user-paced event, not a
// per-frame cost).
export default function ClothMesh({ paused = false, dims, pose = 'standing', fabricId = DEFAULT_FABRIC, qualityTier = QUALITY_TIER_DEFAULT, print = null, stitchConfig = null, onDragStateChange, pieces = TSHIRT_PIECES, seams = TSHIRT_SEAMS, statsRef, meshFitRigRef, bodyColliderRef }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  // Keep the current texture bound across first compile and fabric-map recompiles.
  const positionUniform = useRef({ value: null })
  const emptyPrintTex = useMemo(() => createEmptyPrintTexture(), [])
  const printUniforms = useRef({
    tex: { value: emptyPrintTex },
    hasPrint: { value: 0.0 },
    repeat: { value: 3.0 / 32.0 },
  })
  useEffect(() => () => emptyPrintTex.dispose(), [emptyPrintTex])

  const assembled = useMemo(() => {
    const triangulated = triangulateAll(pieces, seams, adaptiveSpacingCm(pieces))
    const cloth = assembleCloth(triangulated, dims, seams, pose)
    const neighbors = deriveNeighbors(cloth, 8)
    const normalRing = deriveNormalRing(cloth, neighbors, 4)
    const stitchChains = extractClothStitchChains(pieces, triangulated, seams, cloth)
    return { triangulated, cloth, neighbors, normalRing, stitchChains }
  }, [dims, pieces, seams, pose])

  const normalizedStitch = useMemo(() => normalizeStitchConfig(stitchConfig), [stitchConfig])
  const stitchPartUniform = useRef({ value: [1, 1, 1, 1, 1, 1] })

  const stitchGeometry = useMemo(() => {
    if (!normalizedStitch.enabled || !assembled.stitchChains.length) return null
    const texDim = textureDimFor(assembled.cloth.simParticleCount)
    return buildClothStitchGeometry({
      chains: assembled.stitchChains,
      cloth: assembled.cloth,
      texDim,
      normalRing: assembled.normalRing,
      stitchConfig: normalizedStitch,
    })
    // Color changes are applied in-place below without rebuilding stitch Geometry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assembled, normalizedStitch.enabled, normalizedStitch.style, normalizedStitch.visibility])

  useEffect(() => () => {
    stitchGeometry?.dispose?.()
  }, [stitchGeometry])

  useEffect(() => {
    if (stitchGeometry) {
      updateClothStitchColors(stitchGeometry, normalizedStitch)
    }
    const p = normalizedStitch.parts
    stitchPartUniform.current.value = [
      p.bodice?.enabled === false ? 0.0 : 1.0,
      p.sleeve?.enabled === false ? 0.0 : 1.0,
      p.skirt?.enabled === false ? 0.0 : 1.0,
      p.trousers?.enabled === false ? 0.0 : 1.0,
      p.outer?.enabled === false ? 0.0 : 1.0,
      p.trim?.enabled === false ? 0.0 : 1.0,
    ]
  }, [stitchGeometry, normalizedStitch])

  const stitchMaterial = useMemo(() => {
    const sMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.44,
      metalness: 0.06,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    })
    sMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSimPositionTex = positionUniform.current
      shader.uniforms.uPartEnabled = stitchPartUniform.current
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `attribute vec4 aSimUVPair;
attribute vec2 aSimUVIn;
attribute vec4 aNbrUV0;
attribute vec4 aNbrUV1;
attribute vec4 aStitchMeta;
attribute float aStitchPart;
uniform sampler2D uSimPositionTex;
uniform float uPartEnabled[6];
varying float vStitchVis;
#include <common>
` + SAFE_CLOTH_NORMAL_GLSL
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 pos0 = texture2D(uSimPositionTex, aSimUVPair.xy).xyz;
          vec3 pos1 = texture2D(uSimPositionTex, aSimUVPair.zw).xyz;
          vec3 posIn = texture2D(uSimPositionTex, aSimUVIn).xyz;
          vec3 rn0 = texture2D(uSimPositionTex, aNbrUV0.xy).xyz - pos0;
          vec3 rn1 = texture2D(uSimPositionTex, aNbrUV0.zw).xyz - pos0;
          vec3 rn2 = texture2D(uSimPositionTex, aNbrUV1.xy).xyz - pos0;
          vec3 rn3 = texture2D(uSimPositionTex, aNbrUV1.zw).xyz - pos0;
          vec3 ringN = clothSafeNormal(cross(rn0, rn1) + cross(rn1, rn2) + cross(rn2, rn3) + cross(rn3, rn0), vec3(0.0, 0.0, 1.0));
          vec3 edgeDir = clothSafeNormal(pos1 - pos0, vec3(1.0, 0.0, 0.0));
          vec3 toIn = posIn - mix(pos0, pos1, 0.5);
          vec3 inProj = toIn - edgeDir * dot(toIn, edgeDir) - ringN * dot(toIn, ringN);
          vec3 inDir = clothSafeNormal(inProj, clothSafeNormal(cross(ringN, edgeDir), vec3(0.0, 1.0, 0.0)));
          vec3 segPos = mix(pos0, pos1, aStitchMeta.x);
          vec3 mvSeg = (modelViewMatrix * vec4(segPos, 1.0)).xyz;
          vec3 surfN = dot(normalMatrix * ringN, -mvSeg) < 0.0 ? -ringN : ringN;
          vec3 transformed = segPos + inDir * aStitchMeta.y + surfN * aStitchMeta.w;
          vNormal = clothSafeNormal(normalMatrix * surfN, vec3(0.0, 0.0, 1.0));
          int pIdx = int(aStitchPart + 0.5);
          vStitchVis = 1.0;
          for (int k = 0; k < 6; k++) {
            if (k == pIdx) vStitchVis = uPartEnabled[k];
          }`
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `varying float vStitchVis;
#include <common>`
        )
        .replace(
          '#include <color_fragment>',
          `if (vStitchVis < 0.5) discard;
          #include <color_fragment>`
        )
    }
    return sMat
  }, [])

  useEffect(() => () => stitchMaterial.dispose(), [stitchMaterial])

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
    // Per-piece color (already linear — see assemble.js's hexToLinearRGB),
    // sourced from the 2D canvas's own piece.color via the postMessage
    // bridge. Combined with the material's vertexColors flag below so each
    // simulated piece renders in the color it has in 2D instead of one flat
    // garment-wide tint.
    geom.setAttribute('color', new THREE.BufferAttribute(cloth.renderColor, 3))
    if (cloth.renderPieceStyle) {
      geom.setAttribute('aPieceStyle', new THREE.BufferAttribute(cloth.renderPieceStyle, 4))
    }
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

  const material = useMemo(() => {
    const fabric = FABRIC_PRESETS[fabricId] || FABRIC_PRESETS[DEFAULT_FABRIC]
    const maxAniso = Math.min(8, gl?.capabilities?.getMaxAnisotropy?.() || 4)
    const pbr = getFabricTextureSet(THREE, fabricId || DEFAULT_FABRIC, { uvSpanCm: UV_REPEAT_CM, anisotropy: maxAniso })
    const normStrength = fabric.normalStrength ?? pbr?.spec?.normalScale ?? 0.65
    const isVelvet = fabricId === 'velvet'
    const isLuster = fabricId === 'satin' || fabricId === 'silk'
    const mat = new THREE.MeshPhysicalMaterial({
      // White base + vertexColors: true — the geometry's own per-piece
      // `color` attribute (assemble.js's renderColor, sourced from the 2D
      // canvas) tints each pattern piece, while the procedural PBR texture set
      // adds authentic micro-weave, normal relief, roughness variation, sheen,
      // elastic ribbing, and seam-finishing detail.
      color: '#ffffff', vertexColors: true,
      roughness: fabric.rough ?? pbr?.spec?.roughness ?? 0.72,
      metalness: Math.min(0.08, fabric.metal ?? 0),
      sheen: fabric.sheen ?? pbr?.spec?.sheen ?? 0.3,
      sheenRoughness: fabric.sheenRough ?? pbr?.spec?.sheenRoughness ?? 0.52,
      sheenColor: new THREE.Color(isVelvet ? '#f3efe9' : ((fabric.sheen ?? 0) > 0.65 ? '#ece6de' : '#d6d0c8')),
      clearcoat: fabric.clear ?? pbr?.spec?.clearcoat ?? 0,
      clearcoatRoughness: fabric.clearcoatRough ?? pbr?.spec?.clearcoatRoughness ?? 0.38,
      map: pbr?.map || null,
      normalMap: pbr?.normalMap || null,
      roughnessMap: pbr?.roughnessMap || null,
      normalScale: new THREE.Vector2(normStrength, normStrength),
      envMapIntensity: fabric.envMapIntensity ?? pbr?.spec?.envMapIntensity ?? 0.85,
      transparent: fabric.om < 1, opacity: fabric.om,
      side: THREE.DoubleSide,
      // Note: omit `anisotropy` on GPU-displaced tangentless cloth geometry so
      // screen-space tangent derivatives never divide by zero and emit NaN pixels.
      ...(fabric.transmission != null && { transmission: fabric.transmission, thickness: 0.001 }),
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSimPositionTex = positionUniform.current
      shader.uniforms.uWeaveScale = { value: fabric.weaveScale ?? 1.2 }
      shader.uniforms.uVelvetFactor = { value: isVelvet ? 1.0 : 0.0 }
      shader.uniforms.uLusterFactor = { value: isLuster ? (fabricId === 'satin' ? 1.0 : 0.78) : 0.0 }
      shader.uniforms.uPrintTex = printUniforms.current.tex
      shader.uniforms.uHasPrint = printUniforms.current.hasPrint
      shader.uniforms.uPrintRepeat = printUniforms.current.repeat
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `attribute vec2 aSimUV;
attribute vec4 aNbrUV0;
attribute vec4 aNbrUV1;
attribute vec4 aPieceStyle;
uniform sampler2D uSimPositionTex;
uniform float uWeaveScale;
varying vec4 vPieceStyle;
varying vec2 vFabricUV;
varying vec2 vPrintUv;
#include <common>
` + SAFE_CLOTH_NORMAL_GLSL
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 selfPos = texture2D( uSimPositionTex, aSimUV ).xyz;
          vec3 rn0 = texture2D( uSimPositionTex, aNbrUV0.xy ).xyz - selfPos;
          vec3 rn1 = texture2D( uSimPositionTex, aNbrUV0.zw ).xyz - selfPos;
          vec3 rn2 = texture2D( uSimPositionTex, aNbrUV1.xy ).xyz - selfPos;
          vec3 rn3 = texture2D( uSimPositionTex, aNbrUV1.zw ).xyz - selfPos;
          vec3 smoothNormal = cross(rn0, rn1) + cross(rn1, rn2) + cross(rn2, rn3) + cross(rn3, rn0);
          vNormal = clothSafeNormal(normalMatrix * clothSafeNormal(smoothNormal, normal), vec3(0.0, 0.0, 1.0));
          vPieceStyle = aPieceStyle;
          vFabricUV = uv * uWeaveScale;
          vPrintUv = uv;
          vec3 transformed = selfPos;`
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `uniform sampler2D uPrintTex;
uniform float uHasPrint;
uniform float uPrintRepeat;
uniform float uVelvetFactor;
uniform float uLusterFactor;
varying vec4 vPieceStyle;
varying vec2 vFabricUV;
varying vec2 vPrintUv;
#include <common>`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float elasticMask = clamp(vPieceStyle.x, 0.0, 1.0);
          float seamAO = smoothstep(0.62, 1.0, vPieceStyle.y);
          float knitMask = clamp(vPieceStyle.z, 0.0, 1.0);
          float hemEdge = smoothstep(0.76, 1.0, vPieceStyle.w);
          float ndotv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
          float fres = pow(clamp(1.0 - ndotv, 0.0, 1.0), 2.5);
          if (uVelvetFactor > 0.05) {
            diffuseColor.rgb *= mix(0.80, 1.20, fres * uVelvetFactor);
          } else if (uLusterFactor > 0.05) {
            float foldGleam = smoothstep(0.18, 0.72, ndotv) * (1.0 - ndotv) * 4.0;
            diffuseColor.rgb *= (1.0 + foldGleam * 0.08 * uLusterFactor);
          }
          if (elasticMask > 0.25) {
            float rib = sin(vFabricUV.x * 38.0) * 0.036 + sin(vFabricUV.y * 52.0) * 0.014;
            diffuseColor.rgb *= (1.0 + rib * elasticMask - 0.055 * smoothstep(0.65, 1.0, vPieceStyle.w) * elasticMask);
          } else if (knitMask > 0.25) {
            float wale = sin(vFabricUV.x * 64.0) * 0.016;
            diffuseColor.rgb *= (1.0 + wale * knitMask);
          }
          diffuseColor.rgb *= (1.0 - 0.085 * seamAO - 0.042 * hemEdge * (1.0 - elasticMask * 0.5));
          vec4 printSample = (uHasPrint > 0.5) ? texture2D(uPrintTex, vPrintUv * uPrintRepeat) : vec4(0.0);
          if (printSample.a > 0.01) {
            diffuseColor.rgb = mix(diffuseColor.rgb, printSample.rgb, clamp(printSample.a, 0.0, 1.0) * 0.92);
          }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          float elRough = clamp(vPieceStyle.x, 0.0, 1.0);
          float sRough = smoothstep(0.62, 1.0, vPieceStyle.y);
          roughnessFactor = clamp(roughnessFactor + 0.14 * elRough + 0.06 * sRough, 0.16, 0.98);
          if (printSample.a > 0.01) {
            roughnessFactor = mix(roughnessFactor, 0.26, clamp(printSample.a, 0.0, 1.0) * 0.65);
          }`
        )
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(2.2));
          if (isnan(gl_FragColor.r) || isnan(gl_FragColor.g) || isnan(gl_FragColor.b) || isinf(gl_FragColor.r) || isinf(gl_FragColor.g) || isinf(gl_FragColor.b)) {
            gl_FragColor.rgb = vec3(0.0);
          }`
        )
      mat.userData.shader = shader
    }
    return mat
  }, [fabricId, gl])

  useEffect(() => () => {
    material.dispose()
  }, [material])

  const printKey = print ? JSON.stringify(print) : ''
  useEffect(() => {
    const parsedPrint = printKey ? JSON.parse(printKey) : null
    const overlay = createPrintOverlayTexture(parsedPrint)
    const tileCm = Math.max(18, Math.min(48, 160 / Math.max(2, Number(parsedPrint?.repeat) || 5)))
    printUniforms.current.tex.value = overlay || emptyPrintTex
    printUniforms.current.hasPrint.value = overlay ? 1.0 : 0.0
    printUniforms.current.repeat.value = 3.0 / tileCm
    return () => {
      printUniforms.current.tex.value = emptyPrintTex
      printUniforms.current.hasPrint.value = 0.0
      overlay?.dispose?.()
    }
  }, [printKey, emptyPrintTex])

  const simRef = useRef(null)
  useEffect(() => {
    const fabric = FABRIC_PRESETS[fabricId] || FABRIC_PRESETS[DEFAULT_FABRIC]
    // WP-8.3: prefer a real, currently-loaded GLB's own mesh-fit collision
    // rig (written by BodyAvatar/GLBAvatar into meshFitRigRef — see
    // Scene.jsx's header comment) over the procedural avatar's exact rig.
    const procCollider = meshFitRigRef?.current ? null : bodyColliderRef?.current
    const collisionRig = meshFitRigRef?.current || procCollider?.collisionRig || deriveCollisionRig(dims, pose)
    const bodyEnvelope = procCollider?.bodyEnvelope || null
    const envelopeFrames = procCollider?.envelopeFrames || null
    const pinnedMask = deriveGarmentPinMask(assembled.cloth, assembled.triangulated, dims)
    const sim = new ClothSimulation(gl, assembled.cloth, assembled.neighbors, fabric, { collisionRig, bodyEnvelope, envelopeFrames, pinnedMask, qualityTier })
    sim.preRelax()
    simRef.current = sim
    positionUniform.current.value = sim.getPositionTexture()
    return () => {
      sim.dispose()
      simRef.current = null
      positionUniform.current.value = null
    }
    // WP-35: qualityTier changes the compiled shader and uploaded textures
    // (see ClothSimulation's constructor) — unlike fabricId below, it can't
    // be live-swapped, so it's a dependency here (full sim rebuild) rather
    // than in the setFabric effect.
  }, [gl, assembled, dims, pose, qualityTier, meshFitRigRef, bodyColliderRef])

  useEffect(() => {
    simRef.current?.setFabric(FABRIC_PRESETS[fabricId] || FABRIC_PRESETS[DEFAULT_FABRIC])
  }, [fabricId])

  useFrame((_, delta) => {
    const sim = simRef.current
    if (!sim) return
    if (!paused) {
      const liveCollider = meshFitRigRef?.current ? null : bodyColliderRef?.current
      if (liveCollider && pose === 'walk') {
        sim.updateBodyCollider(liveCollider.collisionRig, liveCollider.envelopeFrames, liveCollider.pinOffset)
      }
      sim.step(delta)
    }
    positionUniform.current.value = sim.getPositionTexture()
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
      updateExportGeometry(mesh.geometry, buffer, cloth.renderVertexToSimParticle)
      return true
    }

    // File exporters read CPU attributes, not our GPU vertex shader.
    const exportMesh = meshRef.current
    if (exportMesh) exportMesh.userData.prepareExport = refreshGeometryToCurrentPositions

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
      dragRef.current = { particleIndex, plane, pointerId: e.pointerId }
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
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('lostpointercapture', onPointerUp)
    return () => {
      if (exportMesh) delete exportMesh.userData.prepareExport
      const pointerId = dragRef.current?.pointerId
      dragRef.current = null
      simRef.current?.clearDrag()
      onDragStateChange?.(false)
      if (pointerId !== undefined && canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('lostpointercapture', onPointerUp)
    }
  }, [gl, camera, assembled, onDragStateChange])

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} castShadow receiveShadow>
    {normalizedStitch.enabled && stitchGeometry && (
      <mesh geometry={stitchGeometry} material={stitchMaterial} frustumCulled={false} receiveShadow renderOrder={1} />
    )}
  </mesh>
}
