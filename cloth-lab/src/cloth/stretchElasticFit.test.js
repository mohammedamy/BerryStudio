import { describe, test, expect } from 'vitest'
import * as THREE from 'three'
import '../../../js/library.js'
import '../../../js/girls-leotards.js'
import '../../../js/fancy-patterns.js'
import '../../../js/underwear-library.js'
import '../../../js/reference-patterns.js'
import '../../../js/abaya-collection.js'
import { PATTERNS, computeMeasurements } from '../../../js/data.js'
import { buildHumanMannequin } from '../../../js/human-mannequin.js'
import { convertAppPattern } from '../pattern/importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from '../pattern/seamAuthoring.js'
import { triangulateAll, adaptiveSpacingCm } from '../pattern/triangulate.js'
import { assembleCloth } from './assemble.js'
import { PHYS_CLASS } from './piecePhysics.js'
import { computeBodyDims } from '../body/computeBodyDims.js'
import { deriveCollisionRigFromLimbs, projectPointOutsideCapsules } from '../body/collisionRig.js'
import { buildBodyEnvelopeTexture, computeEnvelopeFramesFromLimbs, projectPointOutsideBodyEnvelope } from '../body/bodyEnvelope.js'

function toPayloadPiece(p, i) {
  return {
    id: (p.key || 'piece') + '_' + i,
    visible: p.visible !== false,
    label: p.name || { en: 'Piece ' + (i + 1), ar: 'قطعة ' + (i + 1) },
    outline: p.outline,
    curves: p.curves || p.outline?.curves || undefined,
    darts: p.darts,
    notches: p.notches,
    grain: p.grain,
    role: p.role,
    cutOnFold: p.cutOnFold,
    foldEdgeIndex: p.foldEdgeIndex,
    bilateral: p.bilateral,
    edges: p.edges,
    grainline: p.grainline,
    princessSeamId: p.princessSeamId,
    necklineEndIdx: p.necklineEndIdx,
    sideEndIdx: p.sideEndIdx,
    autoTorsoSeams: p.autoTorsoSeams,
    bodyZone: p.bodyZone,
    color: p.color,
  }
}

function buildRig(category) {
  const isKids = category === 'girls' || category === 'boys'
  const measurements = computeMeasurements({
    category,
    size: 'M',
    standard: 'intl',
    kids: isKids ? '8-9' : undefined,
  })
  const dims = computeBodyDims(measurements, category)
  let env = null
  let rig = null
  let frames = null
  buildHumanMannequin(THREE, category, dims, {
    pose: 'standing',
    bakeStatic: true,
    collisionSafe: false,
    onBindData: ({ bindGeometry, limbs, landmarks }) => {
      env = buildBodyEnvelopeTexture(bindGeometry, dims, landmarks)
      rig = deriveCollisionRigFromLimbs(dims, limbs)
      frames = computeEnvelopeFramesFromLimbs(limbs, dims, landmarks)
    },
  })
  return { measurements, dims, env, rig, frames }
}

function assembleFor(id, rigData, tier = 'high') {
  const entry = PATTERNS[id]
  const raw = entry.pieces(rigData.measurements)
  const converted = convertAppPattern({
    pieces: raw.map(toPayloadPiece),
    measurements: rigData.measurements,
    category: entry.category,
    fabricId: entry.fabricId || null,
    designId: id,
    designName: entry.name?.en,
    avatarGLB: {},
  })
  const drafts = converted.rawPieces.map((rp) => createDraftPiece(rp, converted.roles[rp.id], converted.placementHints[rp.id]))
  const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
  for (const { pieceId, edgeName, fromIdx, toIdx } of converted.edgeInstructions) {
    const d = byId[pieceId]
    if (d) addEdge(d, edgeName, fromIdx, toIdx)
  }
  const finalPieces = drafts.map((d) => finalizeDraftPiece({
    id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges }, placementHint: d.placementHint,
  }))
  const spacing = adaptiveSpacingCm(finalPieces, { qualityTier: tier })
  const triangulated = triangulateAll(finalPieces, converted.seamInstructions, spacing)
  const cloth = assembleCloth(triangulated, rigData.dims, converted.seamInstructions, 'standing')
  return { converted, triangulated, cloth }
}

function measurePenetration(cloth, rigData) {
  const pos = cloth.simRestPositions
  let maxPen = 0
  for (let i = 0; i < cloth.simParticleCount; i++) {
    const soff = cloth.simSkinOffset[i]
    let p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]
    p = projectPointOutsideBodyEnvelope(p, rigData.env, rigData.frames, soff)
    p = projectPointOutsideCapsules(p, rigData.rig, soff)
    const p2 = projectPointOutsideCapsules(p, rigData.rig, soff)
    const d = Math.hypot(p2[0] - p[0], p2[1] - p[1], p2[2] - p[2])
    if (d > maxPen) maxPen = d
  }
  return maxPen
}

describe('Stretch & elastic garment placement, topology, and zero-penetration in Cloth Lab', () => {
  const rigs = {
    women: buildRig('women'),
    men: buildRig('men'),
    girls: buildRig('girls'),
    boys: buildRig('boys'),
  }

  test('stretch/fitted models assemble cleanly with elastic restScale < 1, zero penetration, and snug contours', () => {
    for (const id of ['w11', 'g11', 'gy001', 'gy050', 'w07', 'm10', 'ref_m_tee', 'wf02', 'wf03', 'wb09']) {
      const entry = PATTERNS[id]
      const rigData = rigs[entry.category]
      const { converted, triangulated, cloth } = assembleFor(id, rigData, 'high')
      for (let i = 0; i < cloth.simRestPositions.length; i++) {
        expect(Number.isFinite(cloth.simRestPositions[i]), `${id} finite rest pos`).toBe(true)
      }
      expect(measurePenetration(cloth, rigData), `${id} penetration`).toBeLessThan(1e-4)

      if (id === 'w11') {
        let maxX = 0
        for (let i = 0; i < cloth.simParticleCount; i++) {
          const spClass = cloth.simPhysClass[i]
          expect(spClass).toBe(PHYS_CLASS.BIKINI_INTIMATE)
          expect(cloth.simRestScale[i]).toBeLessThan(1.0)
          maxX = Math.max(maxX, Math.abs(cloth.simRestPositions[i * 3]))
        }
        // Check body panels (exclude arm/sleeve particles beyond chest/hip contour)
        let rvOff = 0
        let maxBodyX = 0
        for (const tp of triangulated) {
          if (tp.role === 'frontPanel' || tp.role === 'backPanel') {
            for (let v = 0; v < tp.positions2D.length; v++) {
              const sp = cloth.renderVertexToSimParticle[rvOff + v]
              maxBodyX = Math.max(maxBodyX, Math.abs(cloth.simRestPositions[sp * 3]))
            }
          }
          rvOff += tp.positions2D.length
        }
        expect(maxBodyX).toBeLessThan(rigData.dims.hipR * 1.10)
      }

      if (id === 'g11') {
        expect(converted.seamInstructions.some((s) => s.id.includes('g11Inseam'))).toBe(true)
        const legFront = converted.rawPieces.find((rp) => converted.roles[rp.id] === 'legFront')
        const hint = converted.placementHints[legFront.id]
        const ys = legFront.outline.map((q) => q[1])
        const totalH = Math.max(...ys) - Math.min(...ys)
        expect(hint.crotchYCm).toBeLessThan(totalH * 0.45)
        let rvOff = 0
        for (const tp of triangulated) {
          const nVerts = tp.positions2D.length
          if (tp.role === 'legFront' || tp.role === 'legBack') {
            let intimateCount = 0
            let stretchedCount = 0
            for (let v = 0; v < nVerts; v++) {
              const sp = cloth.renderVertexToSimParticle[rvOff + v]
              if (cloth.simPhysClass[sp] === PHYS_CLASS.BIKINI_INTIMATE) intimateCount++
              if (cloth.simRestScale[sp] < 0.95) stretchedCount++
            }
            expect(intimateCount / Math.max(1, nVerts)).toBeGreaterThan(0.90)
            expect(stretchedCount / Math.max(1, nVerts)).toBeGreaterThan(0.90)
          }
          if (tp.role === 'attachWaist') {
            for (let v = 0; v < nVerts; v++) {
              const sp = cloth.renderVertexToSimParticle[rvOff + v]
              expect(cloth.simPhysClass[sp]).toBe(PHYS_CLASS.ELASTIC)
            }
          }
          rvOff += nVerts
        }
      }

      if (id === 'gy050') {
        let rvOff = 0
        for (const tp of triangulated) {
          const nVerts = tp.positions2D.length
          if (tp.role === 'frontPanel' || tp.role === 'backPanel') {
            let intimateCount = 0
            for (let v = 0; v < nVerts; v++) {
              const sp = cloth.renderVertexToSimParticle[rvOff + v]
              if (cloth.simPhysClass[sp] === PHYS_CLASS.BIKINI_INTIMATE) intimateCount++
            }
            expect(intimateCount / Math.max(1, nVerts)).toBeGreaterThan(0.85)
          }
          if (tp.role === 'hipPanelFront' || tp.role === 'hipPanelBack') {
            let looseCount = 0
            for (let v = 0; v < nVerts; v++) {
              const sp = cloth.renderVertexToSimParticle[rvOff + v]
              if (cloth.simPhysClass[sp] === PHYS_CLASS.LOOSE_FLOW) looseCount++
            }
            expect(looseCount / Math.max(1, nVerts)).toBeGreaterThan(0.85)
          }
          rvOff += nVerts
        }
      }

      if (id === 'w07') {
        let rvOff = 0
        for (const tp of triangulated) {
          const nVerts = tp.positions2D.length
          if (tp.role === 'hipPanelFront' || tp.role === 'hipPanelBack') {
            let fittedCount = 0
            for (let v = 0; v < nVerts; v++) {
              const sp = cloth.renderVertexToSimParticle[rvOff + v]
              if (cloth.simPhysClass[sp] !== PHYS_CLASS.LOOSE_FLOW && cloth.simRestScale[sp] < 0.98) fittedCount++
            }
            expect(fittedCount / Math.max(1, nVerts)).toBeGreaterThan(0.85)
          }
          rvOff += nVerts
        }
      }
    }
  }, 30000)

  test('all 100 leotards (gy001..gy100) assemble with zero capsule penetration and snug anatomical crotch', () => {
    const leoIds = Object.keys(PATTERNS).filter((id) => /^gy\d+$/.test(id))
    expect(leoIds.length).toBe(100)
    const rigData = rigs.girls
    const floorCrotch = rigData.dims.hipY - rigData.dims.span * 0.165
    for (const id of leoIds) {
      const { triangulated, cloth } = assembleFor(id, rigData, 'default')
      expect(measurePenetration(cloth, rigData), `${id} leo penetration`).toBeLessThan(1e-4)
      let minY = Infinity
      let rvOff = 0
      for (const tp of triangulated) {
        const nVerts = tp.positions2D.length
        if (tp.role === 'frontPanel' || tp.role === 'backPanel' || tp.role === 'attachCrotch') {
          for (let v = 0; v < nVerts; v++) {
            const sp = cloth.renderVertexToSimParticle[rvOff + v]
            const y = cloth.simRestPositions[sp * 3 + 1]
            if (y < minY) minY = y
          }
        }
        rvOff += nVerts
      }
      expect(minY, `${id} leotard minY above crotch floor`).toBeGreaterThanOrEqual(floorCrotch)
    }
  }, 45000)
})
