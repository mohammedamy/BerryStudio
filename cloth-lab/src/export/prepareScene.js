// Mesh exporters cannot see vertex-shader deformation. Read back only when
// requested, preserving the normal GPU-only render loop.
export function updateExportGeometry(geometry, rgbaPositions, renderVertexToSimParticle) {
  const positions = geometry.attributes.position
  // Validate the whole snapshot before mutating the live geometry.
  for (let i = 0; i < positions.count; i++) {
    const offset = renderVertexToSimParticle[i] * 4
    const x = rgbaPositions[offset], y = rgbaPositions[offset + 1], z = rgbaPositions[offset + 2]
    if (![x, y, z].every(Number.isFinite)) throw new Error('Cloth simulation contains invalid positions; reset the garment before exporting.')
  }
  for (let i = 0; i < positions.count; i++) {
    const offset = renderVertexToSimParticle[i] * 4
    positions.setXYZ(i, rgbaPositions[offset], rgbaPositions[offset + 1], rgbaPositions[offset + 2])
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
}

export function prepareSceneForExport(scene) {
  scene.traverse((object) => {
    if (typeof object.userData?.prepareExport === 'function' && object.userData.prepareExport() === false) {
      throw new Error('Cloth simulation is not ready. Try exporting again after it has loaded.')
    }
  })
  scene.updateMatrixWorld(true)
}
