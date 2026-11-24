import * as THREE from 'three'
import {
  isExternalStitchPiece,
  mapClothPieceToStitchPart,
  normalizeStitchConfig,
  resolveStitchThreadColor,
  STITCH_PART_INDEX,
  STITCH_STYLES,
} from '../../../js/stitch-config.js'

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function hexToLinearRGB(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  const int = m ? parseInt(m[1], 16) : 0xd99b38
  return [
    srgbToLinear(((int >> 16) & 255) / 255),
    srgbToLinear(((int >> 8) & 255) / 255),
    srgbToLinear((int & 255) / 255),
  ]
}

// Finds an adjacent interior local vertex index on `tp` for a boundary edge `(la, lb)`.
function buildTriangleEdgeOppMap(triangles) {
  const map = new Map()
  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t], i1 = triangles[t + 1], i2 = triangles[t + 2]
    const pairs = [[i0, i1, i2], [i1, i2, i0], [i2, i0, i1]]
    for (const [a, b, opp] of pairs) {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`
      if (!map.has(k)) map.set(k, opp)
    }
  }
  return map
}

function buildChainSegments(chainVerts, offset, oppMap, cloth) {
  const segs = []
  const { renderVertexToSimParticle, simRestPositions } = cloth
  for (let k = 0; k < chainVerts.length - 1; k++) {
    const la = chainVerts[k], lb = chainVerts[k + 1]
    const ga = offset + la, gb = offset + lb
    const sp0 = renderVertexToSimParticle[ga]
    const sp1 = renderVertexToSimParticle[gb]
    if (sp0 === sp1) continue
    const key = la < lb ? `${la}_${lb}` : `${lb}_${la}`
    const lOpp = oppMap.get(key)
    const gOpp = lOpp != null ? offset + lOpp : ga
    const spIn = renderVertexToSimParticle[gOpp]

    const p0x = simRestPositions[sp0 * 3], p0y = simRestPositions[sp0 * 3 + 1], p0z = simRestPositions[sp0 * 3 + 2]
    const p1x = simRestPositions[sp1 * 3], p1y = simRestPositions[sp1 * 3 + 1], p1z = simRestPositions[sp1 * 3 + 2]
    const len = Math.hypot(p1x - p0x, p1y - p0y, p1z - p0z)
    if (len < 0.0015) continue

    const pix = simRestPositions[spIn * 3], piy = simRestPositions[spIn * 3 + 1], piz = simRestPositions[spIn * 3 + 2]
    segs.push({ sp0, sp1, spIn, p0: [p0x, p0y, p0z], p1: [p1x, p1y, p1z], pIn: [pix, piy, piz], len })
  }
  return segs
}

/**
 * Extracts ordered boundary/seam chains across both sewn seams and free hems
 * for any triangulated garment in Cloth Lab (library or custom designer-made).
 */
export function extractClothStitchChains(pieces, triangulatedPieces, seams, cloth) {
  const piecesById = new Map((pieces || []).map((p) => [p.id, p]))
  const tpById = new Map((triangulatedPieces || []).map((tp) => [tp.pieceId, tp]))
  const oppByPiece = new Map()
  for (const tp of triangulatedPieces || []) {
    oppByPiece.set(tp.pieceId, buildTriangleEdgeOppMap(tp.triangles || []))
  }

  const chains = []
  const sewnEdges = new Set()

  for (const seam of seams || []) {
    const pieceA = piecesById.get(seam.a?.piece) || tpById.get(seam.a?.piece)
    const tpA = tpById.get(seam.a?.piece)
    if (!tpA || !tpA.boundaryChains) continue
    const chainVerts = tpA.boundaryChains[seam.a.edge]
    if (!chainVerts || chainVerts.length < 2) continue
    sewnEdges.add(`${seam.a.piece}::${seam.a.edge}`)
    if (seam.b) sewnEdges.add(`${seam.b.piece}::${seam.b.edge}`)

    const offset = cloth.pieceOffset[tpA.pieceId] || 0
    const oppMap = oppByPiece.get(tpA.pieceId)
    const segs = buildChainSegments(chainVerts, offset, oppMap, cloth)
    if (!segs.length) continue
    chains.push({
      kind: 'seam',
      pieceId: tpA.pieceId,
      baseFabricHex: tpA.color || pieceA?.color || '#6d5efc',
      partKey: mapClothPieceToStitchPart(pieceA || tpA),
      isExternal: isExternalStitchPiece(pieceA || tpA),
      segs,
    })
  }

  for (const tp of triangulatedPieces || []) {
    if (!tp.boundaryChains) continue
    const pieceMeta = piecesById.get(tp.pieceId) || tp
    const offset = cloth.pieceOffset[tp.pieceId] || 0
    const oppMap = oppByPiece.get(tp.pieceId)
    const partKey = mapClothPieceToStitchPart(pieceMeta)
    const isExternal = isExternalStitchPiece(pieceMeta)
    const baseFabricHex = tp.color || pieceMeta?.color || '#6d5efc'

    for (const [edgeName, chainVerts] of Object.entries(tp.boundaryChains)) {
      if (sewnEdges.has(`${tp.pieceId}::${edgeName}`)) continue
      if (!chainVerts || chainVerts.length < 2) continue
      const segs = buildChainSegments(chainVerts, offset, oppMap, cloth)
      if (!segs.length) continue
      chains.push({
        kind: 'hem',
        pieceId: tp.pieceId,
        baseFabricHex,
        partKey,
        isExternal,
        segs,
      })
    }
  }

  return chains
}

/**
 * Updates per-vertex linear thread colors in-place cleanly without recreating buffers.
 */
export function updateClothStitchColors(geometry, stitchConfig) {
  if (!geometry || !geometry.userData?.stitchGroups || !geometry.attributes?.color) return false
  const cfg = normalizeStitchConfig(stitchConfig)
  const colArr = geometry.attributes.color.array
  for (const grp of geometry.userData.stitchGroups) {
    const hex = resolveStitchThreadColor({
      partKey: grp.partKey,
      pieceId: grp.pieceId,
      baseFabricHex: grp.baseFabricHex,
      stitchConfig: cfg,
    })
    const [r, g, b] = hexToLinearRGB(hex)
    for (let v = grp.startVert; v < grp.endVert; v++) {
      colArr[v * 3] = r
      colArr[v * 3 + 1] = g
      colArr[v * 3 + 2] = b
    }
  }
  geometry.attributes.color.needsUpdate = true
  return true
}

/**
 * Builds a batched GPU-skinned BufferGeometry of volumetric arched sewing stitches
 * matching the live ClothSimulation particle texture (`uSimPositionTex`).
 */
export function buildClothStitchGeometry({ chains = [], cloth, texDim, normalRing, stitchConfig }) {
  const cfg = normalizeStitchConfig(stitchConfig)
  const styleSpec = STITCH_STYLES[cfg.style] || STITCH_STYLES.lockstitch
  const dashM = styleSpec.dashMm * 0.001
  const gapM = styleSpec.gapMm * 0.001
  const pitchM = Math.max(0.0015, dashM + gapM)
  const halfW = Math.max(0.00105, styleSpec.widthMm * 0.00145)
  const liftM = styleSpec.liftMm * 0.001 + 0.00045
  const isZig = styleSpec.id === 'zigzag'
  const zigAmpM = (styleSpec.amplitudeMm || 0) * 0.001
  const rowOffsets = styleSpec.rows === 2
    ? [
      (styleSpec.insetMm - (styleSpec.rowSpacingMm || 3.2) * 0.5) * 0.001,
      (styleSpec.insetMm + (styleSpec.rowSpacingMm || 3.2) * 0.5) * 0.001,
    ]
    : [styleSpec.insetMm * 0.001]

  const positions = []
  const colors = []
  const simUVPair = []
  const simUVIn = []
  const nbrUV0 = []
  const nbrUV1 = []
  const stitchMeta = []
  const stitchPart = []
  const indices = []
  const stitchGroups = []

  const { simRestPositions } = cloth
  const ringSize = 4
  const toU = (sp) => (sp % texDim + 0.5) / texDim
  const toV = (sp) => (Math.floor(sp / texDim) + 0.5) / texDim

  const pushVertex = (seg, tSeg, insetOff, widthOff, archLift, r, g, b, partIdx, restNormal, restInDir) => {
    const px = seg.p0[0] + (seg.p1[0] - seg.p0[0]) * tSeg
    const py = seg.p0[1] + (seg.p1[1] - seg.p0[1]) * tSeg
    const pz = seg.p0[2] + (seg.p1[2] - seg.p0[2]) * tSeg
    positions.push(
      px + restInDir[0] * (insetOff + widthOff) + restNormal[0] * archLift,
      py + restInDir[1] * (insetOff + widthOff) + restNormal[1] * archLift,
      pz + restInDir[2] * (insetOff + widthOff) + restNormal[2] * archLift,
    )
    colors.push(r, g, b)
    simUVPair.push(toU(seg.sp0), toV(seg.sp0), toU(seg.sp1), toV(seg.sp1))
    simUVIn.push(toU(seg.spIn), toV(seg.spIn))

    const nBase = seg.sp0 * ringSize
    const r0 = normalRing[nBase], r1 = normalRing[nBase + 1], r2 = normalRing[nBase + 2], r3 = normalRing[nBase + 3]
    nbrUV0.push(toU(r0), toV(r0), toU(r1), toV(r1))
    nbrUV1.push(toU(r2), toV(r2), toU(r3), toV(r3))
    stitchMeta.push(tSeg, insetOff + widthOff, widthOff, archLift)
    stitchPart.push(partIdx)
  }

  for (const chain of chains) {
    if (cfg.visibility === 'external' && !chain.isExternal) continue
    const startVert = positions.length / 3
    const partIdx = STITCH_PART_INDEX[chain.partKey] ?? 0
    const hex = resolveStitchThreadColor({
      partKey: chain.partKey,
      pieceId: chain.pieceId,
      baseFabricHex: chain.baseFabricHex,
      stitchConfig: cfg,
    })
    const [r, g, b] = hexToLinearRGB(hex)

    for (const insetM of rowOffsets) {
      let cursor = 0
      let stepIdx = 0
      let nextDashAt = 0
      for (const seg of chain.segs) {
        const sLen = seg.len
        // Compute rest-pose outward ringN & inward inDir for initial BufferGeometry `position`
        const nBase = seg.sp0 * ringSize
        const getSp = (sp) => [simRestPositions[sp * 3], simRestPositions[sp * 3 + 1], simRestPositions[sp * 3 + 2]]
        const sPos0 = getSp(seg.sp0)
        const dVec = (sp) => {
          const v = getSp(sp)
          return [v[0] - sPos0[0], v[1] - sPos0[1], v[2] - sPos0[2]]
        }
        const n0 = dVec(normalRing[nBase]), n1 = dVec(normalRing[nBase + 1]), n2 = dVec(normalRing[nBase + 2]), n3 = dVec(normalRing[nBase + 3])
        const cProd = (a, bVec) => [a[1] * bVec[2] - a[2] * bVec[1], a[2] * bVec[0] - a[0] * bVec[2], a[0] * bVec[1] - a[1] * bVec[0]]
        const c0 = cProd(n0, n1), c1 = cProd(n1, n2), c2 = cProd(n2, n3), c3 = cProd(n3, n0)
        let rnx = c0[0] + c1[0] + c2[0] + c3[0]
        let rny = c0[1] + c1[1] + c2[1] + c3[1]
        let rnz = c0[2] + c1[2] + c2[2] + c3[2]
        const rnLen = Math.hypot(rnx, rny, rnz) || 1
        rnx /= rnLen; rny /= rnLen; rnz /= rnLen
        const restNormal = [rnx, rny, rnz]

        const edx = (seg.p1[0] - seg.p0[0]) / sLen, edy = (seg.p1[1] - seg.p0[1]) / sLen, edz = (seg.p1[2] - seg.p0[2]) / sLen
        const mx = (seg.p0[0] + seg.p1[0]) * 0.5, my = (seg.p0[1] + seg.p1[1]) * 0.5, mz = (seg.p0[2] + seg.p1[2]) * 0.5
        let ix = seg.pIn[0] - mx, iy = seg.pIn[1] - my, iz = seg.pIn[2] - mz
        const dE = ix * edx + iy * edy + iz * edz
        ix -= edx * dE; iy -= edy * dE; iz -= edz * dE
        const dN = ix * rnx + iy * rny + iz * rnz
        ix -= rnx * dN; iy -= rny * dN; iz -= rnz * dN
        const iLen = Math.hypot(ix, iy, iz) || 1
        const restInDir = [ix / iLen, iy / iLen, iz / iLen]

        while (nextDashAt + dashM * 0.35 < cursor + sLen) {
          const localStart = Math.max(0, nextDashAt - cursor)
          const localEnd = Math.min(sLen, nextDashAt + dashM - cursor)
          if (localEnd - localStart > dashM * 0.25) {
            const u0 = localStart / sLen
            const u1 = localEnd / sLen
            const SLICES = 3
            const baseV = positions.length / 3
            for (let s = 0; s <= SLICES; s++) {
              const f = s / SLICES
              const u = u0 + (u1 - u0) * f
              const archLift = 0.00125 + liftM * Math.sin(Math.PI * f)
              const zag = isZig ? (((stepIdx % 2) === 0 ? -1 : 1) * zigAmpM * (f - 0.5) * 2.0) : 0
              const offIn = insetM + zag
              pushVertex(seg, u, offIn, -halfW, archLift, r, g, b, partIdx, restNormal, restInDir)
              pushVertex(seg, u, offIn, halfW, archLift, r, g, b, partIdx, restNormal, restInDir)
            }
            for (let s = 0; s < SLICES; s++) {
              const row0 = baseV + s * 2
              const row1 = row0 + 2
              indices.push(row0, row0 + 1, row1 + 1, row0, row1 + 1, row1)
            }
          }
          if (nextDashAt + dashM <= cursor + sLen) {
            nextDashAt += pitchM
            stepIdx++
          } else {
            break
          }
        }
        cursor += sLen
        if (nextDashAt < cursor - dashM) nextDashAt = cursor
      }
    }

    const endVert = positions.length / 3
    if (endVert > startVert) {
      stitchGroups.push({
        startVert,
        endVert,
        partKey: chain.partKey,
        pieceId: chain.pieceId,
        baseFabricHex: chain.baseFabricHex,
      })
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geom.setAttribute('aSimUVPair', new THREE.Float32BufferAttribute(simUVPair, 4))
  geom.setAttribute('aSimUVIn', new THREE.Float32BufferAttribute(simUVIn, 2))
  geom.setAttribute('aNbrUV0', new THREE.Float32BufferAttribute(nbrUV0, 4))
  geom.setAttribute('aNbrUV1', new THREE.Float32BufferAttribute(nbrUV1, 4))
  geom.setAttribute('aStitchMeta', new THREE.Float32BufferAttribute(stitchMeta, 4))
  geom.setAttribute('aStitchPart', new THREE.Float32BufferAttribute(stitchPart, 1))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  geom.userData.stitchGroups = stitchGroups
  return geom
}
