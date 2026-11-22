import { describe, it, expect } from 'vitest'
import { PHYS_CLASS, classifyPiecePhysics, computePerVertexFlowWeight } from './piecePhysics.js'
import { assembleCloth, deriveNeighbors } from './assemble.js'
import { ENV_CLEARANCE } from '../body/bodyEnvelope.js'

const SAMPLE_DIMS = {
  female: true,
  kid: false,
  H: 1.67,
  hipY: 0.87,
  shoulderY: 1.37,
  span: 0.50,
  chestR: 0.14,
  waistR: 0.10,
  hipR: 0.155,
  shoulderHalf: 0.195,
  neckR: 0.05,
  armLen: 0.58,
  upperR: 0.04,
  legLen: 0.87,
  thighR: 0.075,
}

describe('classifyPiecePhysics & computePerVertexFlowWeight', () => {
  it('classifies elastic bands and straps with pre-tension restScale < 1 and tight skinOffset', () => {
    const waistElastic = classifyPiecePhysics({
      pieceId: 'waistElastic_1',
      role: 'attachWaist',
      positions2D: [[0, 0], [66, 0], [66, 3], [0, 3]],
      placementHint: { sewnBriefWaist: true, isBriefWaist: true, schemaRole: 'elastic-band', isElasticTrim: true },
    }, SAMPLE_DIMS)
    expect(waistElastic.physClass).toBe(PHYS_CLASS.ELASTIC)
    expect(waistElastic.restScale).toBeCloseTo(0.87, 3)
    expect(waistElastic.skinOffset).toBe(-0.0036)

    const legElastic = classifyPiecePhysics({
      pieceId: 'legElastic_r',
      role: 'attachHem',
      positions2D: [[0, 0], [44, 0], [44, 2], [0, 2]],
      placementHint: { isLegOpeningElastic: true, sewnLegElastic: true, schemaRole: 'elastic-band', isElasticTrim: true },
    }, SAMPLE_DIMS)
    expect(legElastic.physClass).toBe(PHYS_CLASS.ELASTIC)
    expect(legElastic.restScale).toBeCloseTo(0.89, 3)

    const sportBand = classifyPiecePhysics({
      pieceId: 'bandElastic_1',
      role: 'attachUnderbust',
      positions2D: [[0, 0], [68, 0], [68, 3], [0, 3]],
      placementHint: { sewnSportBand: true, isElasticTrim: true },
    }, SAMPLE_DIMS)
    expect(sportBand.physClass).toBe(PHYS_CLASS.ELASTIC)
    expect(sportBand.restScale).toBeCloseTo(0.87, 3)

    const strap = classifyPiecePhysics({
      pieceId: 'strap_r',
      role: 'attachStrap',
      positions2D: [[0, 0], [2, 0], [2, 34], [0, 34]],
      placementHint: { schemaRole: 'strap', isElasticTrim: true },
    }, SAMPLE_DIMS)
    expect(strap.physClass).toBe(PHYS_CLASS.ELASTIC)
    expect(strap.restScale).toBeCloseTo(0.89, 3)
  })

  it('classifies bikini briefs, gussets, cups, and leotards into BIKINI_INTIMATE with safe positive skin clearance', () => {
    const brief = classifyPiecePhysics({
      pieceId: 'front_0',
      role: 'hipPanelFront',
      positions2D: [[-18, 0], [18, 0], [18, 12], [6, 24], [-6, 24], [-18, 12]],
      placementHint: { isBrief: true, schemaRole: 'brief-front' },
    }, SAMPLE_DIMS)
    expect(brief.physClass).toBe(PHYS_CLASS.BIKINI_INTIMATE)
    expect(brief.restScale).toBeCloseTo(0.915, 3)
    expect(brief.skinOffset).toBe(-0.0034)
    expect(ENV_CLEARANCE + brief.skinOffset).toBeGreaterThanOrEqual(0.0020)

    const cup = classifyPiecePhysics({
      pieceId: 'cup_r',
      role: 'attachBust',
      positions2D: [[0, 0], [16, 0], [16, 14], [0, 14]],
      placementHint: { sewnCupBra: true, schemaRole: 'cup' },
    }, SAMPLE_DIMS)
    expect(cup.physClass).toBe(PHYS_CLASS.BIKINI_INTIMATE)
  })

  it('classifies gores, tiers, capes, abayas, and flared panels into LOOSE_FLOW with progressive top-to-hem flowWeight', () => {
    const tpFlared = {
      pieceId: 'abaya_front',
      role: 'frontPanel',
      positions2D: [[-14, 0], [14, 0], [34, 95], [-34, 95]],
      placementHint: { isLooseGarment: true },
    }
    const info = classifyPiecePhysics(tpFlared, SAMPLE_DIMS)
    expect(info.physClass).toBe(PHYS_CLASS.LOOSE_FLOW)
    expect(info.restScale).toBe(1.0)
    const fw = computePerVertexFlowWeight(tpFlared, info)
    expect(fw[0]).toBe(0)
    expect(fw[2]).toBe(1)

    const gore = classifyPiecePhysics({
      pieceId: 'gore_front',
      role: 'goreFront',
      positions2D: [[-8, 0], [8, 0], [22, 65], [-22, 65]],
      placementHint: { schemaRole: 'skirt-front-gore' },
    }, SAMPLE_DIMS)
    expect(gore.physClass).toBe(PHYS_CLASS.LOOSE_FLOW)

    const tier = classifyPiecePhysics({
      pieceId: 'tier_1',
      role: 'attachHem',
      positions2D: [[0, 0], [90, 0], [90, 26], [0, 26]],
      placementHint: { isSkirtTier: true, schemaRole: 'tier' },
    }, SAMPLE_DIMS)
    expect(tier.physClass).toBe(PHYS_CLASS.LOOSE_FLOW)
  })

  it('classifies collars and cuffs into STRUCTURED and standard tops into STANDARD', () => {
    const collar = classifyPiecePhysics({
      pieceId: 'collar_0',
      role: 'attachNeck',
      positions2D: [[0, 0], [36, 0], [36, 6], [0, 6]],
      placementHint: { schemaRole: 'collar' },
    }, SAMPLE_DIMS)
    expect(collar.physClass).toBe(PHYS_CLASS.STRUCTURED)

    const teeFront = classifyPiecePhysics({
      pieceId: 'front_0',
      role: 'frontPanel',
      positions2D: [[-18, 0], [18, 0], [18, 34], [-18, 34]],
      placementHint: { schemaRole: 'front-panel' },
    }, SAMPLE_DIMS)
    expect(teeFront.physClass).toBe(PHYS_CLASS.STANDARD)
    expect(teeFront.restScale).toBe(1.0)
  })
})

describe('assembleCloth + deriveNeighbors multi-zone physics threading', () => {
  it('populates per-particle physics arrays and applies elastic pre-tension contraction cleanly', () => {
    const triPieces = [{
      pieceId: 'waistElastic_0',
      role: 'attachWaist',
      color: '#222222',
      positions2D: [[0, 0], [30, 0], [60, 0], [60, 3], [30, 3], [0, 3]],
      triangles: new Uint32Array([0, 1, 4, 0, 4, 5, 1, 2, 3, 1, 3, 4]),
      boundaryChains: { waistAttachFront: [0, 1, 2], top: [3, 4, 5] },
      placementHint: { isBriefWaist: true, sewnBriefWaist: true, schemaRole: 'elastic-band', isElasticTrim: true },
    }]
    const cloth = assembleCloth(triPieces, SAMPLE_DIMS, [], 'standing')
    expect(cloth.simPhysClass.length).toBe(cloth.simParticleCount)
    expect(cloth.simPhysClass[0]).toBe(PHYS_CLASS.ELASTIC)
    expect(cloth.simSkinOffset[0]).toBeCloseTo(-0.0036, 6)
    expect(cloth.simRestScale[0]).toBeCloseTo(0.87, 3)
    expect(cloth.renderPieceStyle[0]).toBe(1.0) // isElastic
    expect(cloth.renderPieceStyle[3]).toBe(1.0) // boundary hem edge

    const nbrs = deriveNeighbors(cloth, 8)
    const i0 = cloth.renderVertexToSimParticle[0]
    const n0 = nbrs.structural.idx[i0 * 8]
    const rest0 = nbrs.structural.rest[i0 * 8]
    const rawDist = Math.hypot(
      cloth.simRestPositions[i0 * 3] - cloth.simRestPositions[n0 * 3],
      cloth.simRestPositions[i0 * 3 + 1] - cloth.simRestPositions[n0 * 3 + 1],
      cloth.simRestPositions[i0 * 3 + 2] - cloth.simRestPositions[n0 * 3 + 2],
    )
    expect(rest0).toBeCloseTo(rawDist * 0.87, 5)
  })
})
