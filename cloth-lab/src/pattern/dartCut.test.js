import { describe, it, expect } from 'vitest'
import { cutBoundaryDart, resolveDartPoints, classifyDart, measureApex3DVolume } from './dartCut.js'
import { triangulatePiece, computeSubdivisions } from './triangulate.js'
import { finalizePiece } from './piece.js'
import { assembleCloth } from '../cloth/assemble.js'

describe('dartCut — WP-69 3D dart geometry engine', () => {
  const square = [[0, 0], [20, 0], [20, 30], [0, 30]]

  it('cuts a standard straight-edge interior boundary dart', () => {
    const dart = [[10, 20], [8, 30], [12, 30]]
    const cut = cutBoundaryDart(square, dart)
    expect(cut.outline).toHaveLength(7)
    expect(cut.from).toBe(3)
    expect(cut.apex).toBe(4)
    expect(cut.to).toBe(5)
    expect(cut.outline[cut.apex]).toEqual([10, 20])
  })

  it('supports endpoint / vertex-coincident dart mouth points', () => {
    // Dart mouth where legA is at vertex [0, 30] and legB is at [6, 30]
    const dart = [[5, 20], [0, 30], [6, 30]]
    const cut = cutBoundaryDart(square, dart)
    expect(cut.outline[cut.apex]).toEqual([5, 20])
    expect(cut.from).toBeLessThan(cut.apex)
    expect(cut.to).toBeGreaterThan(cut.apex)
  })

  it('supports reversed mouth point ordering [apex, legC, legA]', () => {
    const dartReversed = [[10, 20], [12, 30], [8, 30]]
    const cut = cutBoundaryDart(square, dartReversed)
    expect(cut.outline).toHaveLength(7)
    expect(cut.outline[cut.apex]).toEqual([10, 20])
    expect(cut.from).toBe(3)
    expect(cut.to).toBe(5)
  })

  it('supports a curved / multi-segment boundary edge', () => {
    // Edge on top has 3 segments: [0,30] -> [7,32] -> [13,32] -> [20,30]
    const curvedOutline = [[0, 0], [20, 0], [20, 30], [13, 32], [7, 32], [0, 30]]
    // Dart mouth straddles across the curve: [5, 31.4] to [15, 31.4]
    const dart = [[10, 20], [5, 31.4], [15, 31.4]]
    const cut = cutBoundaryDart(curvedOutline, dart)
    expect(cut.outline[cut.apex]).toEqual([10, 20])
    expect(cut.from).toBeDefined()
    expect(cut.to).toBeDefined()
    expect(cut.to).toBeGreaterThan(cut.apex)
  })

  it('rejects a dart whose apex lies outside the piece', () => {
    const outsideDart = [[10, 50], [8, 30], [12, 30]]
    expect(() => cutBoundaryDart(square, outsideDart)).toThrow('inside')
  })

  it('rejects when mouth points do not lie on any boundary edge', () => {
    const floatingDart = [[10, 15], [8, 20], [12, 20]]
    expect(() => cutBoundaryDart(square, floatingDart)).toThrow()
  })

  it('produces a valid 3D triangulation and verifies real 3D volume at the apex', () => {
    const dart = [[10, 20], [8, 30], [12, 30]]
    const cut = cutBoundaryDart(square, dart)

    // Build finalized piece with dart edges and boundary seam
    const seamEdges = {
      edge_bottom_1: { from: 0, to: 1 },
      edge_right: { from: 1, to: 2 },
      edge_top_pre: { from: 2, to: cut.from },
      dart_a: { from: cut.from, to: cut.apex },
      dart_b: { from: cut.apex, to: cut.to },
      edge_top_post: { from: cut.to, to: 0 },
    }
    const piece = finalizePiece('test_panel', 'frontPanel', cut.outline, seamEdges, '#8477ff')

    const seams = [
      { id: 'dart_seam', a: { piece: 'test_panel', edge: 'dart_a' }, b: { piece: 'test_panel', edge: 'dart_b' }, reverse: true }
    ]

    const subdivMap = computeSubdivisions([piece], seams, 2)
    const triangulated = triangulatePiece(piece, subdivMap.test_panel, 2)

    expect(triangulated.triangles.length).toBeGreaterThan(0)
    expect(triangulated.positions2D.length).toBeGreaterThan(0)

    // Assemble cloth
    const dims = {
      hipY: 0.8, shoulderY: 1.4, span: 0.6, chestR: 0.16, waistR: 0.14, hipR: 0.18, thighR: 0.12, legLen: 0.8
    }
    const cloth = assembleCloth([triangulated], dims, seams)

    // The apex render vertex
    const apexLocalIdx = triangulated.boundaryChains.dart_a[triangulated.boundaryChains.dart_a.length - 1]
    const apexSim = cloth.renderVertexToSimParticle[apexLocalIdx]

    // Measure 3D volume / angular defect
    const vol = measureApex3DVolume(cloth, apexSim, triangulated)
    expect(vol.neighborCount).toBeGreaterThan(2)
    expect(vol.angularDefectDegrees).toBeGreaterThan(0)
    expect(vol.hasVolume).toBe(true)
  })

  it('cuts and triangulates ref_w_skirt back gore waist dart with 3D volume', () => {
    const qw = 18, qh = 24
    const hipDrop = 18, hemLen = 55
    // Gore panel top edge is waistline at y = 0
    const backW = [
      [0, 0], [qw * 0.48, 0], [qh * 0.54, hipDrop], [qh * 0.64, hemLen], [0, hemLen]
    ]
    const backDart = [[qw * 0.24, 8], [qw * 0.24 - 1.5, 0], [qw * 0.24 + 1.5, 0]]
    const cut = cutBoundaryDart(backW, backDart)

    expect(cut.outline).toHaveLength(backW.length + 3)
    expect(cut.outline[cut.apex]).toEqual([qw * 0.24, 8])

    const seamEdges = {
      waist_pre: { from: 0, to: cut.from },
      dart_a: { from: cut.from, to: cut.apex },
      dart_b: { from: cut.apex, to: cut.to },
      waist_post: { from: cut.to, to: 1 + 3 },
      side: { from: 1 + 3, to: 2 + 3 },
      hem: { from: 2 + 3, to: 3 + 3 },
      center_fold: { from: 3 + 3, to: 0 },
    }
    const piece = finalizePiece('back_gore', 'goreBack', cut.outline, seamEdges, '#e9aa59')
    const seams = [
      { id: 'waist_dart', a: { piece: 'back_gore', edge: 'dart_a' }, b: { piece: 'back_gore', edge: 'dart_b' }, reverse: true }
    ]

    const subdivMap = computeSubdivisions([piece], seams, 2)
    const triangulated = triangulatePiece(piece, subdivMap.back_gore, 2)
    expect(triangulated.triangles.length).toBeGreaterThan(0)

    const dims = {
      hipY: 0.8, shoulderY: 1.4, span: 0.6, chestR: 0.16, waistR: 0.14, hipR: 0.18, thighR: 0.12, legLen: 0.8
    }
    const cloth = assembleCloth([triangulated], dims, seams)
    const apexLocal = triangulated.boundaryChains.dart_a[triangulated.boundaryChains.dart_a.length - 1]
    const apexSim = cloth.renderVertexToSimParticle[apexLocal]
    const vol = measureApex3DVolume(cloth, apexSim, triangulated)
    expect(vol.hasVolume).toBe(true)
  })

  it('handles multiple darts sequentially on the same outline', () => {
    let currentOutline = square
    const dart1 = [[6, 20], [5, 30], [7, 30]]
    const dart2 = [[14, 20], [13, 30], [15, 30]]

    const cut1 = cutBoundaryDart(currentOutline, dart1)
    expect(cut1.outline).toHaveLength(7)
    currentOutline = cut1.outline

    const cut2 = cutBoundaryDart(currentOutline, dart2)
    expect(cut2.outline).toHaveLength(10)
    expect(cut2.outline[cut2.apex]).toEqual([14, 20])
  })

  it('classifies straight boundary, curved boundary, internal, and external darts', () => {
    const straightDart = [[10, 20], [8, 30], [12, 30]]
    expect(classifyDart(square, straightDart)).toMatchObject({
      kind: 'boundary',
      type: 'straight',
      isEndpoint: false,
    })

    const curvedOutline = [[0, 0], [20, 0], [20, 30], [13, 32], [7, 32], [0, 30]]
    const curvedDart = [[10, 20], [5, 31], [15, 31]]
    expect(classifyDart(curvedOutline, curvedDart)).toMatchObject({
      kind: 'boundary',
      type: 'curved',
    })

    const internalDart = [[10, 15], [8, 10], [12, 10]]
    expect(classifyDart(square, internalDart)).toMatchObject({
      kind: 'internal',
    })

    const externalDart = [[10, 45], [8, 50], [12, 50]]
    expect(classifyDart(square, externalDart)).toMatchObject({
      kind: 'external',
    })

    expect(classifyDart(square, null)).toMatchObject({
      kind: 'invalid',
    })
  })

  it('cuts ref_m_trousers front panel waist dart and measures 3D volume at apex', () => {
    const outline = [
      [11.68, 0], [15.5, 27], [22.5, 109], [2.976, 109],
      [-1.074, 24.3], [-0.742, 20.58], [-0.316, 16.74],
      [0.204, 12.75], [0.82, 8.64], [1.53, 4.38], [2.336, 0]
    ]
    const dart = [[6.45, 9], [4.95, 0], [7.95, 0]]
    const cut = cutBoundaryDart(outline, dart)

    expect(cut.outline).toHaveLength(14)
    expect(cut.outline[cut.apex]).toEqual([6.45, 9])

    const seamEdges = {
      outseam: { from: 0, to: 2 },
      hem: { from: 2, to: 3 },
      inseam: { from: 3, to: 4 },
      crotch: { from: 4, to: 10 },
      waist_pre: { from: 10, to: cut.from },
      dart_a: { from: cut.from, to: cut.apex },
      dart_b: { from: cut.apex, to: cut.to },
      waist_post: { from: cut.to, to: 0 },
    }
    const piece = finalizePiece('trouser_front', 'legFront', cut.outline, seamEdges, '#556677')
    const seams = [
      { id: 'front_dart', a: { piece: 'trouser_front', edge: 'dart_a' }, b: { piece: 'trouser_front', edge: 'dart_b' }, reverse: true },
    ]
    const subdivMap = computeSubdivisions([piece], seams, 2)
    const triangulated = triangulatePiece(piece, subdivMap.trouser_front, 2)
    expect(triangulated.triangles.length).toBeGreaterThan(0)

    const dims = {
      hipY: 0.8, shoulderY: 1.4, span: 0.6, chestR: 0.16, waistR: 0.14, hipR: 0.18, thighR: 0.12, legLen: 0.8
    }
    const cloth = assembleCloth([triangulated], dims, seams)
    const apexLocal = triangulated.boundaryChains.dart_a[triangulated.boundaryChains.dart_a.length - 1]
    const apexSim = cloth.renderVertexToSimParticle[apexLocal]
    const vol = measureApex3DVolume(cloth, apexSim, triangulated)

    expect(vol.neighborCount).toBeGreaterThanOrEqual(4)
    expect(vol.angularDefectDegrees).toBeGreaterThan(15) // ~18.9°
    expect(vol.hasVolume).toBe(true)
  })

  it('rejects an internal dart with an explicit descriptive error', () => {
    const internalDart = [[10, 15], [8, 10], [12, 10]]
    expect(() => cutBoundaryDart(square, internalDart)).toThrow(/Internal dart detected/)
  })
})
