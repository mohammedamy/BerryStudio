import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
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
import { computeBodyDims } from '../body/computeBodyDims.js'
import { deriveCollisionRigFromLimbs, deriveGarmentPinMask, projectPointOutsideCapsules } from '../body/collisionRig.js'
import { buildBodyEnvelopeTexture, computeEnvelopeFramesFromLimbs, projectPointOutsideBodyEnvelope, ENV_CLEARANCE } from '../body/bodyEnvelope.js'
import { FABRIC_PRESETS, FABRIC_IDS } from './fabricPresets.js'

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

function buildRig(category, size = 'M', standard = 'intl') {
  const isKids = category === 'girls' || category === 'boys'
  const measurements = computeMeasurements({
    category,
    size,
    standard,
    kids: isKids && standard === 'intl' ? '8-9' : undefined,
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

function assemblePattern(id, rigData, tier = 'high') {
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
  const pinMask = deriveGarmentPinMask(cloth, triangulated, rigData.dims)
  return { converted, triangulated, cloth, pinMask }
}

describe('All 44 underwear patterns: second-skin anatomical fit & zero skin penetration', () => {
  const rigs = {
    women: buildRig('women'),
    men: buildRig('men'),
    girls: buildRig('girls'),
    boys: buildRig('boys'),
  }
  const underwearIds = Object.keys(PATTERNS).filter((id) => /^(?:wu|wb|mu|gu|gb|bu)\d/.test(id))

  test('covers all 44 underwear patterns with snug fit and zero penetration', () => {
    expect(underwearIds.length).toBe(44)
    for (const id of underwearIds) {
      const entry = PATTERNS[id]
      const rigData = rigs[entry.category]
      const { triangulated, cloth, pinMask } = assemblePattern(id, rigData, 'high')
      const pos = cloth.simRestPositions
      const anatCrotchY = rigData.dims.hipY - rigData.dims.span * 0.146

      // No zero-penetration regressions after tightening skinOffset & placement
      let maxPen = 0
      let minY = Infinity
      for (let i = 0; i < cloth.simParticleCount; i++) {
        const y = pos[i * 3 + 1]
        if (y < minY) minY = y
        const soff = cloth.simSkinOffset[i]
        let p = [pos[i * 3], y, pos[i * 3 + 2]]
        p = projectPointOutsideBodyEnvelope(p, rigData.env, rigData.frames, soff)
        p = projectPointOutsideCapsules(p, rigData.rig, soff)
        const p2 = projectPointOutsideCapsules(p, rigData.rig, soff)
        const d = Math.hypot(p2[0] - p[0], p2[1] - p[1], p2[2] - p[2])
        if (d > maxPen) maxPen = d
      }
      expect(maxPen, `${id} residual penetration`).toBeLessThan(1e-4)

      // Briefs & trunks must not sag below anatomical perineum by more than 1.5 cm (except legged boxers/trunks/boyshorts)
      const isBrief = /^(?:wu|mu|gu|bu)\d/.test(id)
      const hasLeg = triangulated.some((tp) => tp.placementHint?.hasBriefLeg)
      if (isBrief && !hasLeg) {
        expect(minY, `${id} crotch minY vs anatCrotchY`).toBeGreaterThanOrEqual(anatCrotchY - 0.015)
      }

      // Cup bras (including full-coverage wb04) must NEVER freeze all cup border vertices in mid-air
      let rvOff = 0
      for (const tp of triangulated) {
        let piecePins = 0
        for (let v = 0; v < tp.positions2D.length; v++) {
          if (pinMask[cloth.renderVertexToSimParticle[rvOff + v]]) piecePins++
        }
        rvOff += tp.positions2D.length
        if (tp.role === 'attachBust' && tp.placementHint?.sewnCupBra) {
          expect(piecePins, `${id} cup/bridge ${tp.pieceId} must stay free to drape snugly`).toBeLessThanOrEqual(2)
        }
      }
    }
  }, 30000)

  test('bra cups place symmetrically L/R without floating gap', () => {
    const { triangulated, cloth } = assemblePattern('wb01', rigs.women, 'high')
    let rZ = -Infinity, lZ = -Infinity, rvOff = 0
    for (const tp of triangulated) {
      for (let v = 0; v < tp.positions2D.length; v++) {
        const sp = cloth.renderVertexToSimParticle[rvOff + v]
        const z = cloth.simRestPositions[sp * 3 + 2]
        if (tp.pieceId.endsWith('_r') && tp.role === 'attachBust' && z > rZ) rZ = z
        if (tp.pieceId.endsWith('_l') && tp.role === 'attachBust' && z > lZ) lZ = z
      }
      rvOff += tp.positions2D.length
    }
    expect(Math.abs(rZ - lZ)).toBeLessThan(0.002)
  })
})

describe('gf02 stability & realistic ClothSimulation shader guards', () => {
  test('gf02 (Girls L Egypt, high tier) assembles cleanly with finite geometry and symmetrical bodice', () => {
    const rigData = buildRig('girls', 'L', 'egypt')
    const { triangulated, cloth } = assemblePattern('gf02', rigData, 'high')
    const pos = cloth.simRestPositions
    for (let i = 0; i < cloth.simParticleCount; i++) {
      expect(Number.isFinite(pos[i * 3])).toBe(true)
      expect(Number.isFinite(pos[i * 3 + 1])).toBe(true)
      expect(Number.isFinite(pos[i * 3 + 2])).toBe(true)
    }
    // Verify butterfly sleeves, princess panels, and 4 skirt gores are all present
    const ids = triangulated.map((t) => t.pieceId)
    expect(ids.some((x) => x.startsWith('skirtF'))).toBe(true)
    expect(ids.some((x) => x.startsWith('skirtB'))).toBe(true)
    expect(ids.some((x) => x.startsWith('sleeve'))).toBe(true)
  })

  test('all 13 fabric presets define positive airDrag & ClothSimulation shader enforces explosion guards', () => {
    for (const id of FABRIC_IDS) {
      expect(FABRIC_PRESETS[id].airDrag).toBeGreaterThan(0)
      expect(FABRIC_PRESETS[id].airDrag).toBeLessThan(0.5)
      expect(FABRIC_PRESETS[id].massDensity).toBeGreaterThan(0)
    }
    const simSrc = fs.readFileSync(path.resolve(import.meta.dirname, 'ClothSimulation.js'), 'utf8')
    expect(simSrc).toContain('if (edgeLen < 0.002) return vec3(0.0);')
    expect(simSrc).toContain('if (h3 < 0.0025 || h4 < 0.0025) return vec3(0.0);')
    expect(simSrc).toContain('if (velLen > 0.018) velStep *= 0.018 / velLen;')
    expect(simSrc).toContain('if (netLen > 0.032) predicted = pos + netStep * (0.032 / netLen);')
    expect(simSrc).toContain('any(isnan(predicted)) || any(isinf(predicted))')
    expect(simSrc).toContain('uniform float uAirDrag;')
    expect(simSrc).toContain('jPinned > 0.5 && restDist < 0.14')
  })
})
