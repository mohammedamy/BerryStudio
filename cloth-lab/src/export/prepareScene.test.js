import { describe, expect, it, vi } from 'vitest'
import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from 'three'
import { updateExportGeometry, prepareSceneForExport } from './prepareScene'

describe('draped garment export', () => {
  it('copies live particles to every render vertex and rebuilds normals and bounds', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(9), 3))
    geometry.setIndex([0, 1, 2])
    updateExportGeometry(geometry, new Float32Array([2, 0, 0, 1, 0, 3, 0, 1, 0, 0, 4, 1]), [2, 0, 1])
    expect([...geometry.attributes.position.array]).toEqual([0, 0, 4, 2, 0, 0, 0, 3, 0])
    expect(geometry.boundingBox.max.toArray()).toEqual([2, 3, 4])
    expect([...geometry.attributes.normal.array].every(Number.isFinite)).toBe(true)
    geometry.dispose()
  })
  it('refreshes nested simulated meshes before serialization', () => {
    const scene = new Group(), nested = new Group(), mesh = new Mesh()
    scene.add(nested); nested.add(mesh)
    mesh.userData.prepareExport = vi.fn(() => true)
    prepareSceneForExport(scene)
    expect(mesh.userData.prepareExport).toHaveBeenCalledOnce()
  })
  it('reports a not-yet-ready simulation instead of exporting rest geometry', () => {
    const scene = new Group(); scene.userData.prepareExport = () => false
    expect(() => prepareSceneForExport(scene)).toThrow('not ready')
  })
  it('rejects invalid readback without partially overwriting the geometry', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute([1, 2, 3, 4, 5, 6], 3))
    expect(() => updateExportGeometry(geometry, [7, 8, 9, 1, NaN, 0, 0, 1], [0, 1])).toThrow('invalid positions')
    expect([...geometry.attributes.position.array]).toEqual([1, 2, 3, 4, 5, 6])
    geometry.dispose()
  })

})
