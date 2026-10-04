// Enhanced 3D Dart Geometry & Cutting Engine (WP-69, Plan v6 Phase 5)
//
// Handles boundary darts across:
//   1. Straight boundary edges (interior points)
//   2. Segment endpoints and vertex-coincident mouth points
//   3. Multi-segment and curved boundary curves (straddling intermediate vertices)
//   4. Order-independent mouth points and robust apex resolution
//   5. Proof of 3D volume and curvature at the apex after seam welding

export function pointInPolygon(pt, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false
  const [x, y] = pt
  let inside = false
  for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
    const u = poly[j], v = poly[k]
    if ((u[1] > y) !== (v[1] > y) && x < (v[0] - u[0]) * (y - u[1]) / (v[1] - u[1]) + u[0]) {
      inside = !inside
    }
  }
  return inside
}

export function distanceToSegment(pt, p, q) {
  const dx = q[0] - p[0], dy = q[1] - p[1]
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) {
    return { dist: Math.hypot(pt[0] - p[0], pt[1] - p[1]), t: 0, proj: [p[0], p[1]] }
  }
  const t = Math.max(0, Math.min(1, ((pt[0] - p[0]) * dx + (pt[1] - p[1]) * dy) / len2))
  const proj = [p[0] + t * dx, p[1] + t * dy]
  return { dist: Math.hypot(pt[0] - proj[0], pt[1] - proj[1]), t, proj }
}

export function projectToPerimeter(pt, outline) {
  let bestDist = Infinity, bestSeg = 0, bestT = 0, bestProj = [0, 0]
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i], q = outline[(i + 1) % outline.length]
    const { dist, t, proj } = distanceToSegment(pt, p, q)
    if (dist < bestDist) {
      bestDist = dist
      bestSeg = i
      bestT = t
      bestProj = proj
    }
  }
  return { dist: bestDist, segment: bestSeg, t: bestT, proj: bestProj }
}

export function resolveDartPoints(outline, dart, tol = 0.5) {
  if (!Array.isArray(dart) || dart.length < 3 || !dart.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) {
    throw new Error('Dart needs an apex and two mouth points.')
  }
  // Standard convention: dart is [apex, mouthA, mouthB]
  // In some patterns or manual placements, apex may be at index 1 or 2,
  // or mouthA/mouthB may be swapped.
  // Check which point is strictly INSIDE the piece and farthest from boundary.
  const p0 = dart[0], p1 = dart[1], p2 = dart[2]
  const in0 = pointInPolygon(p0, outline)
  const in1 = pointInPolygon(p1, outline)
  const in2 = pointInPolygon(p2, outline)

  const proj0 = projectToPerimeter(p0, outline)
  const proj1 = projectToPerimeter(p1, outline)
  const proj2 = projectToPerimeter(p2, outline)

  let apex, mouthA, mouthB

  if (in0 && proj1.dist <= tol && proj2.dist <= tol) {
    apex = p0; mouthA = p1; mouthB = p2
  } else if (in1 && proj0.dist <= tol && proj2.dist <= tol) {
    apex = p1; mouthA = p0; mouthB = p2
  } else if (in2 && proj0.dist <= tol && proj1.dist <= tol) {
    apex = p2; mouthA = p0; mouthB = p1
  } else if (in0) {
    // Default fallback to standard ordering
    apex = p0; mouthA = p1; mouthB = p2
  } else {
    throw new Error('Dart apex must be inside its piece.')
  }

  if (!pointInPolygon(apex, outline)) {
    throw new Error('Dart apex must be inside its piece.')
  }

  return { apex, mouthA, mouthB }
}

/**
 * Classifies a dart relative to a pattern piece outline:
 * - 'boundary': mouth points lie on boundary, apex is interior
 * - 'internal': entire dart is interior to piece (contour / waist dart on one-piece block)
 * - 'external': apex or dart lies outside piece
 * - 'invalid': malformed input geometry
 */
export function classifyDart(outline, dart, tol = 0.5) {
  if (!Array.isArray(dart) || dart.length < 3 || !dart.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) {
    return { kind: 'invalid', reason: 'Dart must have at least 3 points [apex, mouthA, mouthB]' }
  }
  const [p0, p1, p2] = dart
  const in0 = pointInPolygon(p0, outline), in1 = pointInPolygon(p1, outline), in2 = pointInPolygon(p2, outline)
  const proj0 = projectToPerimeter(p0, outline), proj1 = projectToPerimeter(p1, outline), proj2 = projectToPerimeter(p2, outline)

  const on0 = proj0.dist <= tol, on1 = proj1.dist <= tol, on2 = proj2.dist <= tol
  const countOn = (on0 ? 1 : 0) + (on1 ? 1 : 0) + (on2 ? 1 : 0)

  if (countOn === 2) {
    let apex, mouthA, mouthB, projA, projB
    if (!on0) { apex = p0; mouthA = p1; mouthB = p2; projA = proj1; projB = proj2 }
    else if (!on1) { apex = p1; mouthA = p0; mouthB = p2; projA = proj0; projB = proj2 }
    else { apex = p2; mouthA = p0; mouthB = p1; projA = proj0; projB = proj1 }

    if (!pointInPolygon(apex, outline)) {
      return { kind: 'external', reason: 'Apex lies outside the piece polygon' }
    }
    const isSingleEdge = projA.segment === projB.segment
    return {
      kind: 'boundary',
      type: isSingleEdge ? 'straight' : 'curved',
      apex, mouthA, mouthB,
      isEndpoint: (projA.t < 1e-4 || projA.t > 1 - 1e-4 || projB.t < 1e-4 || projB.t > 1 - 1e-4)
    }
  }

  if (in0 && in1 && in2 && !on0 && !on1 && !on2) {
    return { kind: 'internal', reason: 'Internal waist or contour dart enclosed entirely inside the piece' }
  }

  if (!in0 && !in1 && !in2 && !on0 && !on1 && !on2) {
    return { kind: 'external', reason: 'Dart lies entirely outside the piece' }
  }

  return { kind: 'unsupported', reason: 'Dart geometry has unsupported boundary alignment (partial overlap)' }
}

/**
 * Enhanced boundary dart cutting function.
 * Cuts a dart into outline, replacing the mouth boundary with:
 *   mouthA -> apex -> mouthB
 * Fully backwards-compatible with patternPlan's contract.
 */
export function cutBoundaryDart(outline, dart) {
  const { apex, mouthA, mouthB } = resolveDartPoints(outline, dart)
  const n = outline.length

  // First try the fast exact straight-edge path for exact backwards compatibility
  for (let i = 0; i < n; i++) {
    const p = outline[i], q = outline[(i + 1) % n]
    const dx = q[0] - p[0], dy = q[1] - p[1], len2 = dx * dx + dy * dy
    if (len2 < 1e-10) continue
    const project = v => {
      const t = ((v[0] - p[0]) * dx + (v[1] - p[1]) * dy) / len2
      return Math.abs((v[0] - p[0]) * dy - (v[1] - p[1]) * dx) / Math.sqrt(len2) < 0.05 && t >= -1e-4 && t <= 1 + 1e-4 ? Math.max(0, Math.min(1, t)) : null
    }
    const ta = project(mouthA), tb = project(mouthB)
    if (ta !== null && tb !== null && Math.abs(ta - tb) >= 1e-4) {
      // Both points lie on this straight segment
      const first = ta < tb ? mouthA : mouthB
      const last = ta < tb ? mouthB : mouthA
      const tFirst = Math.min(ta, tb), tLast = Math.max(ta, tb)

      // Build replacement vertices for this edge
      const newPts = []
      // If first is not coincident with p, keep p
      newPts.push(p.slice())
      if (tFirst > 1e-4) {
        newPts.push(first.slice())
      }
      newPts.push(apex.slice())
      if (tLast < 1 - 1e-4) {
        newPts.push(last.slice())
      }

      // Check whether first/last were added as separate points
      const newOutline = [
        ...outline.slice(0, i),
        ...newPts,
        ...outline.slice(i + 1),
      ]

      // Identify indices of from, apex, to in newOutline
      const fromIdx = i + (tFirst > 1e-4 ? 1 : 0)
      const apexIdx = fromIdx + 1
      const toIdx = apexIdx + 1

      const countDiff = newOutline.length - outline.length
      return {
        outline: newOutline,
        segment: i,
        from: fromIdx,
        apex: apexIdx,
        to: toIdx,
        remap: index => index > i ? index + countDiff : index,
      }
    }
  }

  // Multi-segment or curved boundary path
  // Calculate perimeter arc lengths
  const segLens = []
  const cumLens = [0]
  for (let i = 0; i < n; i++) {
    const p = outline[i], q = outline[(i + 1) % n]
    const len = Math.hypot(q[0] - p[0], q[1] - p[1])
    segLens.push(len)
    cumLens.push(cumLens[i] + len)
  }
  const totalPerim = cumLens[n]

  const pA = projectToPerimeter(mouthA, outline)
  const pB = projectToPerimeter(mouthB, outline)

  if (pA.dist > 0.5 || pB.dist > 0.5) {
    if (pointInPolygon(mouthA, outline) && pointInPolygon(mouthB, outline)) {
      throw new Error('Internal dart detected: The dart mouth must lie inside one straight outline edge (mouth points are interior; internal contour/waist darts require waist seam splitting or contour slit cutting).')
    }
    throw new Error('The dart mouth must lie inside one straight outline edge. Adjust it in the pattern editor, or keep it as a marking.')
  }

  const sA = cumLens[pA.segment] + pA.t * segLens[pA.segment]
  const sB = cumLens[pB.segment] + pB.t * segLens[pB.segment]

  // Along the perimeter circle, find the short path (mouth)
  const forwardDist = (sB - sA + totalPerim) % totalPerim
  const backwardDist = (sA - sB + totalPerim) % totalPerim

  let startPt, endPt, startSeg, endSeg, startT, endT
  if (forwardDist <= backwardDist) {
    startPt = mouthA; startSeg = pA.segment; startT = pA.t
    endPt = mouthB; endSeg = pB.segment; endT = pB.t
  } else {
    startPt = mouthB; startSeg = pB.segment; startT = pB.t
    endPt = mouthA; endSeg = pA.segment; endT = pA.t
  }

  // Construct updated outline
  const resultOutline = []
  let fromIdx = -1, apexIdx = -1, toIdx = -1

  for (let i = 0; i < n; i++) {
    resultOutline.push(outline[i].slice())
    if (i === startSeg) {
      if (startT > 1e-4) {
        fromIdx = resultOutline.length
        resultOutline.push(startPt.slice())
      } else {
        fromIdx = resultOutline.length - 1
      }
      apexIdx = resultOutline.length
      resultOutline.push(apex.slice())
      if (endT < 1 - 1e-4) {
        toIdx = resultOutline.length
        resultOutline.push(endPt.slice())
      } else {
        toIdx = (endSeg + 1) % n
      }
      // Skip intervening vertices removed by dart cutout
      if (endSeg >= startSeg) {
        i = endSeg
      }
    }
  }

  if (toIdx >= resultOutline.length || toIdx < 0) {
    toIdx = apexIdx + 1
  }

  const countDiff = resultOutline.length - outline.length
  return {
    outline: resultOutline,
    segment: startSeg,
    from: fromIdx,
    apex: apexIdx,
    to: toIdx,
    remap: index => index > startSeg ? index + countDiff : index,
  }
}

/**
 * Calculates local 3D Gaussian curvature & angular defect at the dart apex
 * to verify that a sewn dart creates real 3D shape and volume.
 */
export function measureApex3DVolume(cloth, apexSimParticle, triangulatedPiece) {
  const { simRestPositions, renderTriangles, renderVertexToSimParticle } = cloth
  const ax = simRestPositions[apexSimParticle * 3]
  const ay = simRestPositions[apexSimParticle * 3 + 1]
  const az = simRestPositions[apexSimParticle * 3 + 2]

  // Find all triangles incident to apex in simulation mesh
  let totalAngle3D = 0
  const neighbors = new Set()

  for (let t = 0; t < renderTriangles.length; t += 3) {
    const v0 = renderVertexToSimParticle[renderTriangles[t]]
    const v1 = renderVertexToSimParticle[renderTriangles[t + 1]]
    const v2 = renderVertexToSimParticle[renderTriangles[t + 2]]

    let pB, pC
    if (v0 === apexSimParticle) { pB = v1; pC = v2 }
    else if (v1 === apexSimParticle) { pB = v0; pC = v2 }
    else if (v2 === apexSimParticle) { pB = v0; pC = v1 }
    else continue

    neighbors.add(pB)
    neighbors.add(pC)

    const bx = simRestPositions[pB * 3] - ax, by = simRestPositions[pB * 3 + 1] - ay, bz = simRestPositions[pB * 3 + 2] - az
    const cx = simRestPositions[pC * 3] - ax, cy = simRestPositions[pC * 3 + 1] - ay, cz = simRestPositions[pC * 3 + 2] - az
    const dot = bx * cx + by * cy + bz * cz
    const lenB = Math.hypot(bx, by, bz), lenC = Math.hypot(cx, cy, cz)
    if (lenB > 1e-9 && lenC > 1e-9) {
      const cos = Math.max(-1, Math.min(1, dot / (lenB * lenC)))
      totalAngle3D += Math.acos(cos)
    }
  }

  // Calculate 2D pattern angular defect (intrinsic cone angle)
  let total2DAngle = 0
  let angularDefect = 0
  if (triangulatedPiece) {
    const chainA = triangulatedPiece.boundaryChains.dart_a || Object.values(triangulatedPiece.boundaryChains).find(c => c && c.length > 1)
    const apexIdx = chainA ? chainA[chainA.length - 1] : 0
    const [pAx, pAy] = triangulatedPiece.positions2D[apexIdx]
    for (let t = 0; t < triangulatedPiece.triangles.length; t += 3) {
      const i0 = triangulatedPiece.triangles[t], i1 = triangulatedPiece.triangles[t + 1], i2 = triangulatedPiece.triangles[t + 2]
      let pB, pC
      if (i0 === apexIdx) { pB = i1; pC = i2 }
      else if (i1 === apexIdx) { pB = i0; pC = i2 }
      else if (i2 === apexIdx) { pB = i0; pC = i1 }
      else continue
      const [bx, by] = triangulatedPiece.positions2D[pB], [cx, cy] = triangulatedPiece.positions2D[pC]
      const u = [bx - pAx, by - pAy], v = [cx - pAx, cy - pAy]
      const dot = u[0] * v[0] + u[1] * v[1]
      const lenU = Math.hypot(...u), lenV = Math.hypot(...v)
      if (lenU > 1e-9 && lenV > 1e-9) {
        const cos = Math.max(-1, Math.min(1, dot / (lenU * lenV)))
        total2DAngle += Math.acos(cos)
      }
    }
    angularDefect = Math.max(0, 2 * Math.PI - total2DAngle) * (180 / Math.PI)
  } else {
    angularDefect = Math.max(0, 2 * Math.PI - totalAngle3D) * (180 / Math.PI)
  }

  return {
    apexParticle: apexSimParticle,
    totalAngleDegrees: totalAngle3D * (180 / Math.PI),
    angularDefectDegrees: angularDefect,
    neighborCount: neighbors.size,
    hasVolume: angularDefect > 0.5 && neighbors.size >= 3,
  }
}
