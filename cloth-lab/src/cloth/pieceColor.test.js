import { describe, test, expect } from 'vitest'
import { convertAppPattern } from '../pattern/importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from '../pattern/seamAuthoring.js'
import { triangulateAll } from '../pattern/triangulate.js'
import { assembleCloth } from './assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'
import { TSHIRT_PIECES, TSHIRT_SEAMS } from '../pattern/tshirt.js'

// A garment's per-piece color (as set in the 2D canvas's Layers panel —
// js/canvas.js's setColor()) should survive the full bridge -> import ->
// seam-authoring -> triangulate -> assemble pipeline and land as a real
// per-render-vertex color, so Cloth Lab's Cloth/Pieces views can render each
// simulated piece in its own real color instead of one flat garment tint.

const WOMEN_M = { chest: 88, waist: 70, hips: 96, shoulder: 39, backLen: 41, sleeve: 58, neck: 37, bicep: 28, inseam: 78, thigh: 56, height: 167 }

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function hexToLinear(hex) {
  const int = parseInt(hex.slice(1), 16)
  return [srgbToLinear(((int >> 16) & 255) / 255), srgbToLinear(((int >> 8) & 255) / 255), srgbToLinear((int & 255) / 255)]
}

describe('per-piece color threading (bridge payload -> assembled render vertices)', () => {
  test('two distinctly-colored bridged pieces produce distinctly-colored render vertices', () => {
    const payload = {
      pieces: [
        {
          id: 'front', label: { en: 'Front' }, role: 'other', cutOnFold: false,
          color: '#ff0000',
          outline: [[0, 0], [20, 0], [20, 60], [0, 60]],
        },
        {
          id: 'back', label: { en: 'Back' }, role: 'other', cutOnFold: false,
          color: '#00ff00',
          outline: [[0, 0], [20, 0], [20, 60], [0, 60]],
        },
      ],
      measurements: WOMEN_M, category: 'women', fabricId: null, avatarGLB: {},
    }

    const result = convertAppPattern(payload)
    expect(result.skipped).toEqual([])

    const drafts = result.rawPieces.map((rp) => createDraftPiece(rp, result.roles[rp.id]))
    const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
    for (const { pieceId, edgeName, fromIdx, toIdx } of result.edgeInstructions) {
      const d = byId[pieceId]
      if (d) addEdge(d, edgeName, fromIdx, toIdx)
    }
    // color survives createDraftPiece unmodified
    expect(byId['front'].color).toBe('#ff0000')
    expect(byId['back'].color).toBe('#00ff00')

    const finalPieces = drafts.map((d) => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, color: d.color, edges: { ...d.edges } }))
    expect(finalPieces.find((p) => p.id === 'front').color).toBe('#ff0000')
    expect(finalPieces.find((p) => p.id === 'back').color).toBe('#00ff00')

    const dims = computeBodyDims(WOMEN_M, 'women')
    const triangulated = triangulateAll(finalPieces, result.seamInstructions)
    const frontTp = triangulated.find((tp) => tp.pieceId === 'front')
    const backTp = triangulated.find((tp) => tp.pieceId === 'back')
    expect(frontTp.color).toBe('#ff0000')
    expect(backTp.color).toBe('#00ff00')

    const cloth = assembleCloth(triangulated, dims, result.seamInstructions)
    expect(cloth.renderColor.length).toBe(cloth.renderVertexCount * 3)

    const [rFront, gFront, bFront] = hexToLinear('#ff0000')
    const [rBack, gBack, bBack] = hexToLinear('#00ff00')

    // Every render vertex belonging to 'front' carries the red linear RGB,
    // every one belonging to 'back' carries the green linear RGB — no
    // seam-boundary bleed, since render vertices are never deduplicated
    // across pieces (only their positions are synced via the shared sim
    // particle — see assemble.js's own header comment).
    const frontOffset = cloth.pieceOffset['front']
    const backOffset = cloth.pieceOffset['back']
    const frontCount = frontTp.positions2D.length
    const backCount = backTp.positions2D.length

    for (let i = 0; i < frontCount; i++) {
      const g = frontOffset + i
      expect(cloth.renderColor[g * 3]).toBeCloseTo(rFront, 5)
      expect(cloth.renderColor[g * 3 + 1]).toBeCloseTo(gFront, 5)
      expect(cloth.renderColor[g * 3 + 2]).toBeCloseTo(bFront, 5)
    }
    for (let i = 0; i < backCount; i++) {
      const g = backOffset + i
      expect(cloth.renderColor[g * 3]).toBeCloseTo(rBack, 5)
      expect(cloth.renderColor[g * 3 + 1]).toBeCloseTo(gBack, 5)
      expect(cloth.renderColor[g * 3 + 2]).toBeCloseTo(bBack, 5)
    }
  })

  test('a piece with no color falls back to the default (never a crash, never black)', () => {
    const dims = computeBodyDims(WOMEN_M, 'women')
    const triangulated = triangulateAll(TSHIRT_PIECES.map((p) => ({ ...p, color: undefined })), TSHIRT_SEAMS)
    const cloth = assembleCloth(triangulated, dims, TSHIRT_SEAMS)
    // #c9cedb's linear-space blue channel is well above zero
    expect(cloth.renderColor[2]).toBeGreaterThan(0.3)
  })

  test('the default T-shirt fixture (tshirt.js) declares distinct real colors per piece, not the fallback', () => {
    expect(TSHIRT_PIECES.find((p) => p.id === 'front').color).toBe('#6d5efc')
    expect(TSHIRT_PIECES.find((p) => p.id === 'back').color).toBe('#00c2a8')
    expect(TSHIRT_PIECES.find((p) => p.id === 'sleeveR').color).toBe('#ff5d8f')
    expect(TSHIRT_PIECES.find((p) => p.id === 'sleeveL').color).toBe('#e2a52b')
  })
})
