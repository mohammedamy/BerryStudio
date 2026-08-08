import { describe, it, expect } from 'vitest'
import { deriveNeighbors } from './assemble.js'
import { dihedralAngle } from './dihedralBend.js'

// A minimal, hand-built `cloth` fixture — deriveNeighbors only reads these
// four fields, so this bypasses the full triangulate/assemble pipeline for
// a fully controllable topology, the same way dihedralBend.test.js builds
// exact hinge shapes instead of opaque fixtures.
//
// Flat quad, split along the (v0,v2) diagonal:
//   v3(0,1,0) ---- v2(1,1,0)
//     |    tri B  /   |
//     |          /    |
//     |  tri A  /     |
//   v0(0,0,0) ---- v1(1,0,0)
// Both triangles coplanar (z=0 for every vertex) — a perfectly flat rest
// hinge, angle ~0, same known-good case dihedralBend.test.js already
// verifies dihedralAngle against independently.
function flatQuadCloth() {
  const positions = [
    [0, 0, 0], // v0
    [1, 0, 0], // v1
    [1, 1, 0], // v2
    [0, 1, 0], // v3
  ]
  const simRestPositions = new Float32Array(positions.flat())
  return {
    renderTriangles: [0, 1, 2, 0, 2, 3],
    renderVertexToSimParticle: [0, 1, 2, 3],
    simParticleCount: 4,
    simRestPositions,
  }
}

// Same quad, but folded along the shared diagonal (v0,v2) by lifting v3 out
// of plane — a non-trivial, non-zero rest angle to confirm bendHinge
// carries whatever the ACTUAL rest shape is, not always ~0.
function foldedQuadCloth() {
  const positions = [
    [0, 0, 0],   // v0
    [1, 0, 0],   // v1
    [1, 1, 0],   // v2
    [0, 1, 0.8], // v3 — lifted out of the z=0 plane
  ]
  const simRestPositions = new Float32Array(positions.flat())
  return {
    renderTriangles: [0, 1, 2, 0, 2, 3],
    renderVertexToSimParticle: [0, 1, 2, 3],
    simParticleCount: 4,
    simRestPositions,
  }
}

describe('deriveNeighbors — bend (existing distance-based path, must stay unchanged)', () => {
  it('still produces the wing-to-wing distance pair for a flat quad, exactly as before WP-35', () => {
    const { bend } = deriveNeighbors(flatQuadCloth(), 8)
    // v1's only bend neighbor is v3 (the opposite corner across the shared
    // v0-v2 diagonal), at slot 0.
    expect(bend.idx[1 * 8 + 0]).toBe(3)
    expect(bend.rest[1 * 8 + 0]).toBeCloseTo(Math.hypot(1 - 0, 0 - 1, 0 - 0), 6)
    expect(bend.idx[3 * 8 + 0]).toBe(1)
  })
})

// A CLOSED hexagonal fan (center v0 + 6 outer vertices forming a full ring,
// 6 triangles) — every spoke (0,i) is now shared by 2 triangles (no
// boundary edges among the spokes), which makes every OUTER vertex the
// "opposite corner" wing for exactly 2 different spokes, i.e. 2 real bend
// neighbors each. A more thorough exercise of packHinges' slot alignment
// than the single-hinge quad fixtures above (which can't distinguish
// "correctly aligned" from "trivially aligned because there's only one
// slot to get right").
function closedFanCloth() {
  const positions = [[0, 0, 0]] // v0 — center
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    positions.push([Math.cos(a), Math.sin(a), 0]) // v1..v6
  }
  const tris = []
  for (let i = 1; i <= 6; i++) {
    const next = i === 6 ? 1 : i + 1
    tris.push(0, i, next)
  }
  return {
    renderTriangles: tris,
    renderVertexToSimParticle: [0, 1, 2, 3, 4, 5, 6],
    simParticleCount: 7,
    simRestPositions: new Float32Array(positions.flat()),
  }
}

describe('deriveNeighbors — bendHinge (WP-35 true dihedral-angle data)', () => {
  it('carries the same (particle, neighbor) pairing as bend, at the same slot', () => {
    const { bend, bendHinge } = deriveNeighbors(flatQuadCloth(), 8)
    expect(bendHinge.idx[1 * 8 + 0]).toBe(bend.idx[1 * 8 + 0])
    expect(bendHinge.idx[3 * 8 + 0]).toBe(bend.idx[3 * 8 + 0])
  })

  it('stays slot-aligned with bend across every neighbor for vertices with multiple hinges (regression: an earlier version reindexed on skip, shifting later slots)', () => {
    const { bend, bendHinge, maxNeighbors } = deriveNeighbors(closedFanCloth(), 8)
    for (let p = 1; p <= 6; p++) {
      for (let k = 0; k < maxNeighbors; k++) {
        const slot = p * maxNeighbors + k
        expect(bendHinge.idx[slot]).toBe(bend.idx[slot])
      }
    }
    // Confirm the fixture actually exercises multiple slots per vertex,
    // not just slot 0 — every outer vertex has exactly 2 bend neighbors.
    for (let p = 1; p <= 6; p++) {
      const nonEmptySlots = bend.idx.slice(p * maxNeighbors, p * maxNeighbors + maxNeighbors).filter((v) => v !== -1).length
      expect(nonEmptySlots).toBe(2)
    }
  })

  it('records the correct shared-edge endpoints (v0, v2) for the diagonal hinge', () => {
    const { bendHinge } = deriveNeighbors(flatQuadCloth(), 8)
    const v0v1 = new Set([bendHinge.edgeV0[1 * 8 + 0], bendHinge.edgeV1[1 * 8 + 0]])
    expect(v0v1).toEqual(new Set([0, 2]))
  })

  it('computes a rest angle of ~0 for a perfectly flat quad', () => {
    const { bendHinge } = deriveNeighbors(flatQuadCloth(), 8)
    expect(bendHinge.restAngle[1 * 8 + 0]).toBeCloseTo(0, 5)
    expect(bendHinge.restAngle[3 * 8 + 0]).toBeCloseTo(0, 5)
  })

  it('computes a non-zero rest angle for a folded quad, matching dihedralAngle computed independently', () => {
    const cloth = foldedQuadCloth()
    const { bendHinge } = deriveNeighbors(cloth, 8)
    const v0 = [0, 0, 0], v2 = [1, 1, 0], v1 = [1, 0, 0], v3 = [0, 1, 0.8]
    const expected = dihedralAngle(v0, v2, v1, v3)
    expect(Math.abs(bendHinge.restAngle[1 * 8 + 0])).toBeCloseTo(Math.abs(expected), 5)
    expect(bendHinge.restAngle[1 * 8 + 0]).toBeCloseTo(-bendHinge.restAngle[3 * 8 + 0], 5) // opposite side, opposite sign
  })

  it('leaves an unpaired (boundary-edge) particle with -1 in idx, never a fabricated hinge', () => {
    // A single triangle has no bend neighbors at all (every edge is a
    // boundary edge — only one triangle touches it).
    const cloth = {
      renderTriangles: [0, 1, 2],
      renderVertexToSimParticle: [0, 1, 2],
      simParticleCount: 3,
      simRestPositions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    }
    const { bendHinge } = deriveNeighbors(cloth, 8)
    expect([...bendHinge.idx]).toEqual(new Array(3 * 8).fill(-1))
  })
})
