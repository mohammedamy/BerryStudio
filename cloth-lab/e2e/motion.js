import * as THREE from 'three'
import { ClothSimulation } from '../src/cloth/ClothSimulation'

// A free particle isolates integration from garment constraints and collisions.
export function checkAdaptiveMotion(renderer, counts, qualityTier) {
  const empty = () => ({ idx: new Float32Array(8).fill(-1), rest: new Float32Array(8) })
  const neighbors = { maxNeighbors: 8, structural: empty(), bend: empty(), bendHinge: {
    idx: new Float32Array(8).fill(-1), edgeV0: new Float32Array(8),
    edgeV1: new Float32Array(8), restAngle: new Float32Array(8),
  } }
  const sim = new ClothSimulation(renderer, {
    simParticleCount: 1, simRestPositions: new Float32Array([0, 1, 0]), simAreaShare: new Float32Array([1]),
  }, neighbors, { damping: 1, massDensity: 1, structStiff: 0, bendStiff: 0, friction: 0 }, { qualityTier })
  const seed = sim.gpuCompute.createTexture()
  // Start at 1 m/s with the constructor's 1/480-second history interval.
  seed.image.data.set([-1 / 480, 1, 0, 0])
  seed.needsUpdate = true
  const previousTarget = renderer.getRenderTarget()
  try {
    sim.posVar.material.uniforms.uGravity.value = new THREE.Vector3()
    sim.gpuCompute.renderTexture(seed, sim.gpuCompute.getCurrentRenderTarget(sim.prevVar))
    const positions = []
    for (const count of counts) {
      sim.substeps = count
      sim.step(1 / 60)
      const pixels = new Float32Array(sim.texDim * sim.texDim * 4)
      renderer.readRenderTargetPixels(sim.gpuCompute.getCurrentRenderTarget(sim.posVar), 0, 0, sim.texDim, sim.texDim, pixels)
      positions.push(Array.from(pixels.slice(0, 3)))
    }
    return positions
  } finally {
    renderer.setRenderTarget(previousTarget)
    seed.dispose()
    sim.dispose()
  }
}
