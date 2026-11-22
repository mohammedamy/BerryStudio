import { describe, expect, test } from 'vitest'
import { getMannequinFor } from '../../../js/mannequin-catalog.js'
import {
  WOVEN_BASIC_TROUSERS_OPTIONS,
  createWovenBasicTrousersConfiguration,
  configurationToWovenBasicTrousersProgram,
} from '../../../js/trouser-configurator.js'
import { executePatternProgram } from '../../../js/pattern-program.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll } from './triangulate.js'
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'

function toPayloadPiece(p, i) {
  return {
    id: (p.key || 'piece') + '_' + i,
    label: p.name,
    outline: p.outline,
    darts: p.darts,
    notches: p.notches,
    grain: p.grain,
    role: p.role,
    cutOnFold: p.cutOnFold,
    foldEdgeIndex: p.foldEdgeIndex,
    bilateral: p.bilateral,
    edges: p.edges,
    grainline: p.grainline,
    color: p.color,
  }
}

describe('woven-basic-trousers program Cloth Lab integration', () => {
  test.each([
    { category: 'women', size: 'M', length: 'short' },
    { category: 'women', size: 'M', length: 'regular' },
    { category: 'women', size: 'M', length: 'long' },
    { category: 'men', size: 'L', length: 'regular' },
  ])('converts, seams bilaterally, triangulates and assembles $category/$size ($length)', ({ category, size, length }) => {
    const mq = getMannequinFor(category, size)
    const config = createWovenBasicTrousersConfiguration({ length })
    const program = configurationToWovenBasicTrousersProgram(config)
    const generated = executePatternProgram(program, mq.measurements)

    const payload = {
      pieces: generated.pieces.map(toPayloadPiece),
      measurements: mq.measurements,
      category,
      fabricId: null,
      avatarGLB: {},
    }

    const result = convertAppPattern(payload)
    expect(result.skipped, `skipped: ${JSON.stringify(result.skipped)}`).toEqual([])

    const legPieceIds = Object.entries(result.roles)
      .filter(([, role]) => role === 'legFront' || role === 'legBack')
      .map(([id]) => id)
    expect(legPieceIds).toHaveLength(4)

    for (const pid of legPieceIds) {
      const attached = result.seamInstructions.filter((s) => s.a.piece === pid || s.b.piece === pid)
      expect(attached.length, `${pid} should receive outseam, inseam, and waist seams`).toBeGreaterThanOrEqual(2)
    }

    const drafts = result.rawPieces.map((rp) => createDraftPiece(rp, result.roles[rp.id]))
    const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
    for (const { pieceId, edgeName, fromIdx, toIdx } of result.edgeInstructions) {
      const d = byId[pieceId]
      if (d) addEdge(d, edgeName, fromIdx, toIdx)
    }
    const finalPieces = drafts.map((d) => finalizeDraftPiece({ id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges } }))
    const meshes = triangulateAll(finalPieces, result.seamInstructions)
    const dims = computeBodyDims(mq.measurements, category)
    const cloth = assembleCloth(meshes, dims, result.seamInstructions)

    expect(cloth.simParticleCount).toBeGreaterThan(0)
    expect(cloth.simRestPositions).toHaveLength(cloth.simParticleCount * 3)
    for (let i = 0; i < cloth.simRestPositions.length; i++) {
      expect(Number.isFinite(cloth.simRestPositions[i])).toBe(true)
    }
  })

  test('length options preserve ordered generated leg span in Cloth Lab rawPieces', () => {
    const mq = getMannequinFor('women', 'M')
    const heights = Object.fromEntries(
      WOVEN_BASIC_TROUSERS_OPTIONS.length.map((length) => {
        const generated = executePatternProgram(
          configurationToWovenBasicTrousersProgram(createWovenBasicTrousersConfiguration({ length })),
          mq.measurements,
        )
        const result = convertAppPattern({
          pieces: generated.pieces.map(toPayloadPiece),
          measurements: mq.measurements,
          category: 'women',
          fabricId: null,
          avatarGLB: {},
        })
        const leg = result.rawPieces.find((rp) => result.roles[rp.id] === 'legFront')
        const ys = leg.outline.map(([, y]) => y)
        return [length, Math.max(...ys) - Math.min(...ys)]
      }),
    )
    expect(heights.short).toBeLessThan(heights.regular)
    expect(heights.regular).toBeLessThan(heights.long)
  })
})
