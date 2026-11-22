import { describe, test, expect } from 'vitest'
import '../../../js/library.js'
import '../../../js/girls-leotards.js'
import '../../../js/fancy-patterns.js'
import '../../../js/underwear-library.js'
import '../../../js/reference-patterns.js'
import '../../../js/abaya-collection.js'
import { PATTERNS, computeMeasurements } from '../../../js/data.js'
import { convertAppPattern } from './importFromApp.js'
import { createDraftPiece, addEdge, finalizeDraftPiece } from './seamAuthoring.js'
import { triangulateAll, adaptiveSpacingCm } from './triangulate.js'
import { assembleCloth } from '../cloth/assemble.js'
import { computeBodyDims } from '../body/computeBodyDims.js'
import { placePiece } from './placement.js'

const measCache = new Map()
const dimsCache = new Map()

function makeMeasurements(category) {
  if (!measCache.has(category)) {
    const isKids = category === 'girls' || category === 'boys'
    measCache.set(
      category,
      computeMeasurements({ category, size: 'M', standard: 'intl', kids: isKids ? '8-9' : undefined }),
    )
  }
  return measCache.get(category)
}

function getCategoryDims(category) {
  if (!dimsCache.has(category)) {
    dimsCache.set(category, computeBodyDims(makeMeasurements(category), category))
  }
  return dimsCache.get(category)
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

function edgeArcCm(outline, fromIdx, toIdx) {
  const n = outline.length
  let i = fromIdx, len = 0, guard = 0
  while (i !== toIdx) {
    const nxt = (i + 1) % n
    len += Math.hypot(outline[nxt][0] - outline[i][0], outline[nxt][1] - outline[i][1])
    i = nxt
    if (++guard > n) break
  }
  return len
}

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('shoulder sewing, orientation, length parity, and 3D shoulder alignment across all 340 patterns', () => {
  test('zero twisted shoulder seams, full coverage on robes/yoked-shirts/leotards/jackets/vests, and tight jacket/vest shoulder parity', () => {
    const allIds = Object.keys(PATTERNS)
    expect(allIds.length).toBe(340)

    const ROBE_IDS = ['w08', 'w21', 'm07', 'm16', 'm21', 'b11', 'b22']
    const YOKED_SHIRT_IDS = ['m03', 'm04', 'm05', 'm17', 'm23', 'b01', 'b02', 'b15', 'ref_w_shirtdress', 'ref_g_shirtdress', 'ref_b_shirt', 'ref_m_shirt']
    const WRAP_COAT_IDS = ['wf04', 'mf04', 'wf07', 'mf10']
    const JACKET_VEST_IDS = ['mf01', 'mf02', 'mf05', 'mf06', 'bf01', 'bf04', 'bf06', 'wf06', 'wf12', 'wf14', 'wf16', 'gf13']
    const LEO_IDS = allIds.filter((id) => /^gy\d+$/.test(id))
    expect(LEO_IDS.length).toBe(100)

    const twistedShoulders = []
    const missingRequired = []
    const stretchedJacketShoulders = []

    for (const id of allIds) {
      const entry = PATTERNS[id]
      const category = entry.category || 'women'
      const m = makeMeasurements(category)
      const dims = getCategoryDims(category)
      const conv = convertAppPattern({
        patternId: id,
        designId: id,
        designName: entry.name?.en || id,
        pieces: entry.pieces(m).map(toPayloadPiece),
        measurements: m,
        category,
      })

      const byId = Object.fromEntries(conv.rawPieces.map((rp) => [rp.id, rp]))
      const shoulderSeams = conv.seamInstructions.filter((s) =>
        /(?:top|shoulder|princessSide_shoulder)/i.test(s.id) ||
        (/top|shoulder/i.test(s.a.edge) && /top|shoulder/i.test(s.b.edge)),
      )

      const needsShoulders =
        ROBE_IDS.includes(id) ||
        YOKED_SHIRT_IDS.includes(id) ||
        WRAP_COAT_IDS.includes(id) ||
        JACKET_VEST_IDS.includes(id) ||
        LEO_IDS.includes(id)
      if (needsShoulders && shoulderSeams.length < 2) {
        missingRequired.push(`${id} (found ${shoulderSeams.length})`)
      }

      for (const s of shoulderSeams) {
        const pa = byId[s.a.piece], pb = byId[s.b.piece]
        const ea = conv.edgeInstructions.find((e) => e.pieceId === s.a.piece && e.edgeName === s.a.edge)
        const eb = conv.edgeInstructions.find((e) => e.pieceId === s.b.piece && e.edgeName === s.b.edge)
        if (!pa || !pb || !ea || !eb) continue

        const p3A = placePiece({ pieceId: s.a.piece, role: conv.roles[s.a.piece], positions2D: pa.outline, placementHint: conv.placementHints[s.a.piece] }, dims, 'standing')
        const p3B = placePiece({ pieceId: s.b.piece, role: conv.roles[s.b.piece], positions2D: pb.outline, placementHint: conv.placementHints[s.b.piece] }, dims, 'standing')
        const a0 = p3A[ea.fromIdx], a1 = p3A[ea.toIdx]
        const b0 = s.reverse ? p3B[eb.toIdx] : p3B[eb.fromIdx]
        const b1 = s.reverse ? p3B[eb.fromIdx] : p3B[eb.toIdx]
        const dUsed = dist3(a0, b0) + dist3(a1, b1)
        const dOpp = dist3(a0, b1) + dist3(a1, b0)
        if (dUsed > dOpp + 0.03) {
          twistedShoulders.push(`${id}:${s.id} (used=${dUsed.toFixed(3)}m opp=${dOpp.toFixed(3)}m rev=${s.reverse})`)
        }

        if (/^(?:jacket|vest|wrapCoat)Shoulder_/.test(s.id)) {
          const la = edgeArcCm(pa.outline, ea.fromIdx, ea.toIdx)
          const lb = edgeArcCm(pb.outline, eb.fromIdx, eb.toIdx)
          const ratio = Math.max(la, lb) / Math.max(1e-4, Math.min(la, lb))
          if (ratio > 1.35) {
            stretchedJacketShoulders.push(`${id}:${s.id} (${la.toFixed(1)}cm vs ${lb.toFixed(1)}cm, ratio=${ratio.toFixed(2)})`)
          }
        }
      }
    }

    expect(missingRequired, `Missing shoulder seams: ${missingRequired.join(', ')}`).toEqual([])
    expect(twistedShoulders, `Twisted shoulder seams: ${twistedShoulders.join(', ')}`).toEqual([])
    expect(stretchedJacketShoulders, `Stretched jacket/vest shoulders: ${stretchedJacketShoulders.join(', ')}`).toEqual([])
  }, 30000)

  test('placed 3D shoulder seam endpoint gaps stay tightly aligned across standard bodices, coats, and vests', () => {
    const checkMaxGap = (ids, maxInnerCm, maxOuterCm) => {
      for (const id of ids) {
        const entry = PATTERNS[id]
        const cat = entry.category || 'women'
        const m = makeMeasurements(cat)
        const dims = getCategoryDims(cat)
        const conv = convertAppPattern({
          patternId: id,
          designId: id,
          designName: entry.name?.en || id,
          pieces: entry.pieces(m).map(toPayloadPiece),
          measurements: m,
          category: cat,
        })
        const byId = Object.fromEntries(conv.rawPieces.map((rp) => [rp.id, rp]))
        const sh = conv.seamInstructions.find((s) => /(?:rightTop|jacketShoulder_R|vestShoulder_R)/.test(s.id))
        expect(sh, `${id} should emit a right shoulder seam`).toBeTruthy()
        const pa = byId[sh.a.piece], pb = byId[sh.b.piece]
        const ea = conv.edgeInstructions.find((e) => e.pieceId === sh.a.piece && e.edgeName === sh.a.edge)
        const eb = conv.edgeInstructions.find((e) => e.pieceId === sh.b.piece && e.edgeName === sh.b.edge)
        const p3A = placePiece({ pieceId: pa.id, role: conv.roles[pa.id], positions2D: pa.outline, placementHint: conv.placementHints[pa.id] }, dims, 'standing')
        const p3B = placePiece({ pieceId: pb.id, role: conv.roles[pb.id], positions2D: pb.outline, placementHint: conv.placementHints[pb.id] }, dims, 'standing')
        const d0Cm = dist3(p3A[ea.fromIdx], p3B[sh.reverse ? eb.toIdx : eb.fromIdx]) * 100
        const d1Cm = dist3(p3A[ea.toIdx], p3B[sh.reverse ? eb.fromIdx : eb.toIdx]) * 100
        expect(d0Cm, `${id} inner shoulder gap ${d0Cm.toFixed(1)}cm`).toBeLessThan(maxInnerCm)
        expect(d1Cm, `${id} outer shoulder gap ${d1Cm.toFixed(1)}cm`).toBeLessThan(maxOuterCm)
      }
    }

    checkMaxGap(['m09', 'w04', 'w03', 'm08'], 5.0, 5.0)
    checkMaxGap(['mf05', 'bf04', 'wf06', 'wf12'], 19.5, 6.0)
    checkMaxGap(['mf02'], 19.5, 12.0)

    // Verify assembled meshes triangulate cleanly on newly shoulder-seamed representatives
    for (const id of ['m04', 'm07', 'w08', 'gy001', 'gy002', 'mf05', 'wf04', 'wf14']) {
      const entry = PATTERNS[id]
      const cat = entry.category || 'women'
      const m = makeMeasurements(cat)
      const dims = getCategoryDims(cat)
      const conv = convertAppPattern({
        patternId: id,
        designId: id,
        designName: entry.name?.en || id,
        pieces: entry.pieces(m).map(toPayloadPiece),
        measurements: m,
        category: cat,
      })
      const drafts = conv.rawPieces.map((rp) => createDraftPiece(rp, conv.roles[rp.id], conv.placementHints[rp.id]))
      const draftById = Object.fromEntries(drafts.map((d) => [d.id, d]))
      for (const { pieceId, edgeName, fromIdx, toIdx } of conv.edgeInstructions) {
        if (draftById[pieceId]) addEdge(draftById[pieceId], edgeName, fromIdx, toIdx)
      }
      const finalPieces = drafts.map((d) => finalizeDraftPiece({
        id: d.id, role: d.role, outline: d.outline, edges: { ...d.edges }, placementHint: d.placementHint,
      }))
      const triangulated = triangulateAll(finalPieces, conv.seamInstructions, adaptiveSpacingCm(finalPieces))
      const cloth = assembleCloth(triangulated, dims, conv.seamInstructions, 'standing')
      expect(cloth.simParticleCount, id).toBeGreaterThan(0)
    }
  })
})
