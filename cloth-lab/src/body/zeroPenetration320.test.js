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
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from './computeBodyDims.js'
import { deriveCollisionRigFromLimbs, projectPointOutsideCapsules } from './collisionRig.js'
import { buildBodyEnvelopeTexture, computeEnvelopeFramesFromLimbs, projectPointOutsideBodyEnvelope } from './bodyEnvelope.js'

function buildCategoryRig(category) {
  const isKids = category === 'girls' || category === 'boys'
  const measurements = computeMeasurements({ category, size: 'M', standard: 'intl', kids: isKids ? '8-9' : undefined })
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

const CATEGORY_DATA = {
  women: buildCategoryRig('women'),
  men: buildCategoryRig('men'),
  girls: buildCategoryRig('girls'),
  boys: buildCategoryRig('boys'),
}

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

describe('340-pattern zero-penetration and seam integrity sweep', () => {
  test('all 340 patterns assemble with finite coordinates, zero capsule penetration, and no stretched cross-body seams', () => {
    const ids = Object.keys(PATTERNS)
    expect(ids.length).toBeGreaterThanOrEqual(340)

    const failures = []
    for (const id of ids) {
      const entry = PATTERNS[id]
      const cat = entry.category
      const { measurements, dims, env, rig, frames } = CATEGORY_DATA[cat]
      const raw = entry.pieces(measurements)
      const converted = convertAppPattern({
        pieces: raw.map(toPayloadPiece),
        measurements,
        category: cat,
        fabricId: entry.fabricId || null,
        avatarGLB: {},
      })
      if (converted.skipped.length > 0) {
        failures.push(`${id}: skipped=${JSON.stringify(converted.skipped)}`)
        continue
      }

      const drafts = converted.rawPieces.map((rp) => createDraftPiece(rp, converted.roles[rp.id], converted.placementHints[rp.id]))
      const byId = Object.fromEntries(drafts.map((d) => [d.id, d]))
      for (const { pieceId, edgeName, fromIdx, toIdx } of converted.edgeInstructions) {
        const d = byId[pieceId]
        if (d) addEdge(d, edgeName, fromIdx, toIdx)
      }
      const finalPieces = drafts.map((d) => finalizeDraftPiece({
        id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges }, placementHint: d.placementHint,
      }))
      const spacing = adaptiveSpacingCm(finalPieces, { qualityTier: 'high' })
      const triangulated = triangulateAll(finalPieces, converted.seamInstructions, spacing)
      const cloth = assembleCloth(triangulated, dims, converted.seamInstructions, 'standing')

      const pos = cloth.simRestPositions
      const projected = new Float32Array(pos.length)
      let hasNaN = false
      let residualCapPen = 0
      for (let i = 0; i < cloth.simParticleCount; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          hasNaN = true
          break
        }
        let p = projectPointOutsideBodyEnvelope([x, y, z], env, frames)
        p = projectPointOutsideCapsules(p, rig)
        const pCheck = projectPointOutsideCapsules(p, rig)
        const disp = Math.hypot(pCheck[0] - p[0], pCheck[1] - p[1], pCheck[2] - p[2])
        if (disp > residualCapPen) residualCapPen = disp
        projected[i * 3] = p[0]
        projected[i * 3 + 1] = p[1]
        projected[i * 3 + 2] = p[2]
      }
      if (hasNaN) { failures.push(`${id}: NaN in simRestPositions`); continue }
      if (residualCapPen > 1e-4) failures.push(`${id}: residual capsule penetration ${(residualCapPen * 1000).toFixed(2)}mm`)

      let maxEdge = 0
      const tris = cloth.renderTriangles
      const rv2sp = cloth.renderVertexToSimParticle
      for (let t = 0; t < tris.length; t += 3) {
        const i0 = rv2sp[tris[t]], i1 = rv2sp[tris[t + 1]], i2 = rv2sp[tris[t + 2]]
        const d01 = Math.hypot(pos[i0 * 3] - pos[i1 * 3], pos[i0 * 3 + 1] - pos[i1 * 3 + 1], pos[i0 * 3 + 2] - pos[i1 * 3 + 2])
        const d12 = Math.hypot(pos[i1 * 3] - pos[i2 * 3], pos[i1 * 3 + 1] - pos[i2 * 3 + 1], pos[i1 * 3 + 2] - pos[i2 * 3 + 2])
        const d20 = Math.hypot(pos[i2 * 3] - pos[i0 * 3], pos[i2 * 3 + 1] - pos[i0 * 3 + 1], pos[i2 * 3 + 2] - pos[i0 * 3 + 2])
        if (d01 > maxEdge) maxEdge = d01
        if (d12 > maxEdge) maxEdge = d12
        if (d20 > maxEdge) maxEdge = d20
      }
      if (maxEdge >= 0.32) failures.push(`${id}: stretched triangle edge ${(maxEdge * 100).toFixed(1)}cm`)
    }

    expect(failures, `Failures: ${failures.join('; ')}`).toEqual([])
  }, 60000)
})
