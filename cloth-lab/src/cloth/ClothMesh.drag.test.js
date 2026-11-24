// @vitest-environment jsdom
// Exercise the actual listener effect with CPU geometry and a stubbed GPU
// readback. This verifies cleanup, not GPU rendering or physical drape.
import source from './ClothMesh.jsx?raw'
import simSource from './ClothSimulation.js?raw'
import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { updateExportGeometry } from '../export/prepareScene'
import { computeMaxDragExcursion, clampDragDisplacement, DEFAULT_DRAG_RADIUS } from './ClothSimulation.js'
import { FABRIC_PRESETS } from './fabricPresets.js'
import { PHYS_CLASS } from './piecePhysics.js'

const effectStart = source.indexOf('  useEffect(() => {', source.indexOf('  const dragRef ='))
const effectEnd = source.indexOf('\n\n  return <mesh', effectStart)
const install = new Function('useEffect', 'THREE', 'gl', 'camera', 'assembled', 'onDragStateChange', 'meshRef', 'dragRef', 'simRef', 'updateExportGeometry', source.slice(effectStart, effectEnd))

function fixture() {
  const canvas = document.createElement('canvas')
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 })
  let captured = false
  canvas.setPointerCapture = () => { captured = true }
  canvas.hasPointerCapture = () => captured
  canvas.releasePointerCapture = vi.fn(() => { captured = false })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3))
  geometry.setIndex([0, 1, 2])
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.z = 5; camera.updateMatrixWorld()
  const sim = { texDim: 2, gpuCompute: { getCurrentRenderTarget: () => ({}) }, posVar: {}, setDragParticle: vi.fn(), clearDrag: vi.fn() }
  const gl = { domElement: canvas, readRenderTargetPixels(_target, _x, _y, _w, _h, buffer) { buffer.set([-1, -1, 0, 1, 1, -1, 0, 1, 0, 1, 0, 1]) } }
  const dragging = vi.fn(), dragRef = { current: null }
  let cleanup
  install(fn => { cleanup = fn() }, THREE, gl, camera, { cloth: { renderVertexToSimParticle: [0, 1, 2] } }, dragging, { current: mesh }, dragRef, { current: sim }, updateExportGeometry)
  function pointer(type) {
    const event = new Event(type)
    Object.assign(event, { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
    canvas.dispatchEvent(event)
  }
  function dispose() { cleanup(); geometry.dispose(); mesh.material.dispose() }
  return { canvas, mesh, dragging, dragRef, sim, pointer, cleanup, dispose }
}

describe('cloth drag listener cleanup', () => {
  for (const endEvent of ['pointercancel', 'lostpointercapture']) {
    it(`${endEvent} releases the orbit-control lock`, () => {
      const h = fixture()
      try {
        h.pointer('pointerdown'); expect(h.dragging).toHaveBeenLastCalledWith(true)
        h.pointer(endEvent)
        expect(h.dragging).toHaveBeenLastCalledWith(false)
        expect(h.dragRef.current).toBe(null)
        expect(h.sim.clearDrag).toHaveBeenCalled()
      } finally { h.dispose() }
    })
  }
  it('unmount releases capture, clears dragging and removes the export callback and listeners', () => {
    const h = fixture()
    try {
      h.pointer('pointerdown'); expect(h.dragging).toHaveBeenLastCalledWith(true)
      expect(h.mesh.userData.prepareExport).toBeTypeOf('function')
      h.cleanup()
      expect(h.dragging).toHaveBeenLastCalledWith(false)
      expect(h.canvas.releasePointerCapture).toHaveBeenCalledWith(1)
      expect(h.mesh.userData.prepareExport).toBeUndefined()
      const calls = h.dragging.mock.calls.length
      h.pointer('pointerdown'); expect(h.dragging.mock.calls).toHaveLength(calls)
    } finally { h.dispose() }
  })
})

describe('fabric-realistic drag tether and strain bounds', () => {
  it('clamps extreme pointer pulls smoothly by fabric stretch and piece drape mobility', () => {
    const satinBodiceMax = computeMaxDragExcursion({ maxStrain: FABRIC_PRESETS.satin.maxStrain, physClass: PHYS_CLASS.BIKINI_INTIMATE, flowWeight: 0 })
    const extremeDelta = [-1.5, 0.05, 0]
    const clampedSatin = clampDragDisplacement(extremeDelta, satinBodiceMax)
    const clampedLen = Math.hypot(...clampedSatin)
    expect(satinBodiceMax).toBeLessThan(0.075)
    expect(clampedLen).toBeLessThan(satinBodiceMax)
    expect(clampedLen).toBeGreaterThan(0.03)

    const leatherMax = computeMaxDragExcursion({ maxStrain: FABRIC_PRESETS.leather.maxStrain })
    const denimMax = computeMaxDragExcursion({ maxStrain: FABRIC_PRESETS.denim.maxStrain })
    const cottonMax = computeMaxDragExcursion({ maxStrain: FABRIC_PRESETS.cotton.maxStrain })
    const scubaMax = computeMaxDragExcursion({ maxStrain: FABRIC_PRESETS.scuba.maxStrain })
    const jerseyMax = computeMaxDragExcursion({ maxStrain: FABRIC_PRESETS.jersey.maxStrain })
    expect(leatherMax).toBeLessThan(denimMax)
    expect(denimMax).toBeLessThan(cottonMax)
    expect(cottonMax).toBeLessThan(satinBodiceMax)
    expect(satinBodiceMax).toBeLessThan(scubaMax)
    expect(scubaMax).toBeLessThan(jerseyMax)

    const looseSkirtMax = computeMaxDragExcursion({ maxStrain: FABRIC_PRESETS.satin.maxStrain, physClass: PHYS_CLASS.LOOSE_FLOW, flowWeight: 1.0 })
    expect(looseSkirtMax).toBeGreaterThan(satinBodiceMax)
    expect(looseSkirtMax).toBeLessThan(0.22)
    expect(DEFAULT_DRAG_RADIUS).toBeGreaterThan(0.04)
  })

  it('routes dragged particles through structural springs, soft pinch weights, and two strain-limit passes', () => {
    expect(simSource).not.toContain('if (myFlatIdx == uDragParticleIndex)')
    expect(simSource).toContain('uDragAnchorPos')
    expect(simSource).toContain('uDragRestCenter')
    expect(simSource).toContain('uDragRadius')
    expect((simSource.match(/strainLimitCorrection\(/g) || []).length).toBeGreaterThanOrEqual(17)
  })
})
