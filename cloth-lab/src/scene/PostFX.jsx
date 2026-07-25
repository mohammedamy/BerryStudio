import { useEffect, useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

// A small custom render pipeline (subtle bloom + a correct final tone-
// mapping/color-space pass) built on three.js's own bundled postprocessing
// addons rather than the @react-three/postprocessing npm package — its peer-
// dependency range against this recent a three version (0.185.1) isn't
// confirmed compatible, and three/addons/postprocessing/* resolves cleanly
// under Vite the same way GLTFLoader already does elsewhere in this app.
//
// Rendering itself (not just adding an effect) is taken over here: a
// priority-1 useFrame tells R3F to skip its own default gl.render() call for
// this frame. Priority 1 runs after ClothMesh's physics-step useFrame
// (default/unspecified priority, i.e. 0 — R3F runs callbacks in priority
// order), so the GPU-deformed cloth position texture is already current by
// the time this pass draws.
export default function PostFX() {
  const { gl, scene, camera, size } = useThree()

  const composer = useMemo(() => {
    const c = new EffectComposer(gl)
    c.addPass(new RenderPass(scene, camera))
    // Deliberately subtle — this is meant to read as "clean studio render",
    // not "video game glow." Tune strength first if it ever looks off.
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.08, 0.4, 0.92))
    c.addPass(new OutputPass())
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera])

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio())
    composer.setSize(size.width, size.height)
  }, [composer, size, gl])

  useFrame((_, delta) => { composer.render(delta) }, 1)

  return null
}
