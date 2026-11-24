import { describe, expect, test } from 'vitest'
import { TSHIRT_PIECES, TSHIRT_SEAMS } from '../pattern/tshirt'
import { triangulateAll, adaptiveSpacingCm } from '../pattern/triangulate'
import { assembleCloth, deriveNeighbors, deriveNormalRing } from './assemble'
import { textureDimFor } from './ClothSimulation'
import { computeBodyDims } from '../body/computeBodyDims'
import { extractClothStitchChains, buildClothStitchGeometry, updateClothStitchColors } from './stitchGeometry'

const DIMS = computeBodyDims({
  chest: 92, waist: 74, hips: 98, shoulder: 39, backLen: 41, sleeve: 59, neck: 36, bicep: 28, inseam: 76, thigh: 55, height: 168,
}, 'women')

function hexToLin(hex) {
  const s = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const v = parseInt(hex.slice(1), 16)
  return [s(((v >> 16) & 255) / 255), s(((v >> 8) & 255) / 255), s((v & 255) / 255)]
}

describe('Cloth Lab 3D Stitch Geometry', () => {
  const triangulated = triangulateAll(TSHIRT_PIECES, TSHIRT_SEAMS, adaptiveSpacingCm(TSHIRT_PIECES))
  const cloth = assembleCloth(triangulated, DIMS, TSHIRT_SEAMS, 'standing')
  const neighbors = deriveNeighbors(cloth, 8)
  const normalRing = deriveNormalRing(cloth, neighbors, 4)
  const texDim = textureDimFor(cloth.simParticleCount)

  test('extracts seam and hem chains across garment parts and builds finite GPU stitch geometry for all 4 styles', () => {
    const chains = extractClothStitchChains(TSHIRT_PIECES, triangulated, TSHIRT_SEAMS, cloth)
    expect(chains.length).toBeGreaterThan(2)
    expect(chains.some((c) => c.kind === 'seam')).toBe(true)
    expect(chains.some((c) => c.kind === 'hem')).toBe(true)
    expect(chains.some((c) => c.partKey === 'bodice')).toBe(true)
    expect(chains.some((c) => c.partKey === 'sleeve')).toBe(true)

    for (const style of ['lockstitch', 'twin', 'zigzag', 'saddle']) {
      const geom = buildClothStitchGeometry({
        chains,
        cloth,
        texDim,
        normalRing,
        stitchConfig: { enabled: true, style, visibility: 'external', defaultColor: '#d99b38' },
      })
      const pos = geom.attributes.position.array
      expect(pos.length).toBeGreaterThan(100)
      for (let i = 0; i < pos.length; i++) {
        expect(Number.isFinite(pos[i])).toBe(true)
      }
      expect(geom.attributes.aSimUVPair).toBeDefined()
      expect(geom.attributes.aSimUVIn).toBeDefined()
      expect(geom.attributes.aNbrUV0).toBeDefined()
      expect(geom.attributes.aNbrUV1).toBeDefined()
      expect(geom.attributes.aStitchMeta).toBeDefined()
      expect(geom.attributes.aStitchPart).toBeDefined()
      geom.dispose()
    }
  })

  test('filters internal linings in external mode and updates per-part / per-piece thread colors in-place', () => {
    const customPieces = [
      {
        id: 'customFront',
        role: 'frontPanel',
        color: '#223355',
        label: { en: 'Designer Top Front' },
        outline: [[0, 0], [18, 0], [18, 30], [0, 30]],
        seamEdges: { all: { from: 0, to: 0 } },
        edgeOrder: ['all'],
      },
      {
        id: 'customSleeve',
        role: 'sleeve',
        color: '#223355',
        label: { en: 'Designer Sleeve' },
        outline: [[30, 0], [44, 0], [44, 22], [30, 22]],
        seamEdges: { all: { from: 0, to: 0 } },
        edgeOrder: ['all'],
      },
      {
        id: 'innerLining',
        role: 'attachBody',
        color: '#cccccc',
        label: { en: 'Hidden Lining' },
        outline: [[60, 0], [74, 0], [74, 22], [60, 22]],
        seamEdges: { all: { from: 0, to: 0 } },
        edgeOrder: ['all'],
        placementHint: { attachTargetRole: 'front' },
      },
    ]
    const triCustom = triangulateAll(customPieces, [], 3)
    const clothCustom = assembleCloth(triCustom, DIMS, [], 'standing')
    const nCustom = deriveNeighbors(clothCustom, 8)
    const ringCustom = deriveNormalRing(clothCustom, nCustom, 4)
    const tdCustom = textureDimFor(clothCustom.simParticleCount)

    const chains = extractClothStitchChains(customPieces, triCustom, [], clothCustom)
    expect(chains.find((c) => c.pieceId === 'innerLining')?.isExternal).toBe(false)
    expect(chains.find((c) => c.pieceId === 'customFront')?.isExternal).toBe(true)

    const extGeom = buildClothStitchGeometry({
      chains, cloth: clothCustom, texDim: tdCustom, normalRing: ringCustom,
      stitchConfig: { enabled: true, style: 'lockstitch', visibility: 'external', defaultColor: '#d99b38' },
    })
    const allGeom = buildClothStitchGeometry({
      chains, cloth: clothCustom, texDim: tdCustom, normalRing: ringCustom,
      stitchConfig: { enabled: true, style: 'lockstitch', visibility: 'all', defaultColor: '#d99b38' },
    })
    expect(allGeom.attributes.position.count).toBeGreaterThan(extGeom.attributes.position.count)

    // In-place per-part and per-piece thread color updates
    updateClothStitchColors(extGeom, {
      enabled: true,
      defaultColor: '#ffffff',
      parts: { sleeve: { enabled: true, color: '#ef4444' } },
      pieceColors: { customFront: '#22c55e' },
    })
    const colArr = extGeom.attributes.color.array
    const frontGrp = extGeom.userData.stitchGroups.find((g) => g.pieceId === 'customFront')
    const sleeveGrp = extGeom.userData.stitchGroups.find((g) => g.pieceId === 'customSleeve')
    const [fr, fg, fb] = hexToLin('#22c55e')
    const [sr, sg, sb] = hexToLin('#ef4444')
    expect(colArr[frontGrp.startVert * 3]).toBeCloseTo(fr, 4)
    expect(colArr[frontGrp.startVert * 3 + 1]).toBeCloseTo(fg, 4)
    expect(colArr[frontGrp.startVert * 3 + 2]).toBeCloseTo(fb, 4)
    expect(colArr[sleeveGrp.startVert * 3]).toBeCloseTo(sr, 4)
    expect(colArr[sleeveGrp.startVert * 3 + 1]).toBeCloseTo(sg, 4)
    expect(colArr[sleeveGrp.startVert * 3 + 2]).toBeCloseTo(sb, 4)

    extGeom.dispose()
    allGeom.dispose()
  })
})
