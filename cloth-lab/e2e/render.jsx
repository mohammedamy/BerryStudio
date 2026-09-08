// Local GPU regression fixture only; neither Vite production entry imports it.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Scene from '../src/scene/Scene'
import { computeBodyDims } from '../src/body/computeBodyDims'
import { SAFE_CLOTH_NORMAL_GLSL } from '../src/cloth/surfaceShader'

const dims = computeBodyDims({ chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 }, 'women')

export function Probe() {
  useFrame(state => {
    window.renderProbe = state
    window.renderFrames = (window.renderFrames || 0) + 1
  }, 2) // Observe after PostFX's priority-1 render.
  return null
}

// Execute the very same GLSL normal helper used by ClothMesh on the GPU.
window.checkNormal = (candidate, rest) => {
  const { gl } = window.renderProbe
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType })
  const material = new THREE.ShaderMaterial({
    uniforms: { candidate: { value: new THREE.Vector3(...candidate) }, rest: { value: new THREE.Vector3(...rest) } },
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `uniform vec3 candidate; uniform vec3 rest; ${SAFE_CLOTH_NORMAL_GLSL}\nvoid main(){gl_FragColor=vec4(clothSafeNormal(candidate,rest),1.0);}`,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))
  const previous = gl.getRenderTarget()
  try {
    gl.setRenderTarget(target)
    gl.render(scene, new THREE.Camera())
    const pixel = new Float32Array(4)
    gl.readRenderTargetPixels(target, 0, 0, 1, 1, pixel)
    return Array.from(pixel)
  } finally {
    gl.setRenderTarget(previous)
    target.dispose()
    material.dispose()
    geometry.dispose()
  }
}

export function Fixture() {
  const [fabricId, setFabricId] = useState('cotton')
  const [paused, setPaused] = useState(true)
  return <><button onClick={() => setFabricId(v => v === 'cotton' ? 'silk' : 'cotton')}>Change fabric</button>
    <button onClick={() => setPaused(v => !v)}>Toggle pause</button>
    <div style={{ width: 640, height: 640 }}><Canvas shadows dpr={1} gl={{ preserveDrawingBuffer: true }} camera={{ position: [1.6, 1, 2.2], fov: 40 }}>
      <Scene dims={dims} debugView="cloth" paused={paused} fabricId={fabricId} />
      <Probe />
    </Canvas></div></>
}
createRoot(document.getElementById('root')).render(<Fixture />)
