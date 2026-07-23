// Hardcoded Phase-1 starter garment: a basic set-in-sleeve T-shirt (front,
// back, 2 sleeves), authored the same way the production app's own
// hand-crafted PATTERNS entries are (flat cm-space outlines) — plus explicit
// seam-edge metadata, which the existing 2D pattern system has no concept of
// at all (a real gap this new pipeline needs and the old one doesn't have).
//
// Authoring convention: each piece is a set of NAMED points + an explicit
// point order (the polygon walk) + a set of named edges given as
// [startPointName, endPointName] — the edge covers every point between them
// in the walk order (inclusive), so a curve's intermediate points are swept
// in automatically without manually tracking array indices.

// Shared by buildPiece/mirrorPieceX: asserts the declared edges chain into
// exactly one closed cycle covering the whole perimeter with no gaps and no
// overlaps (edge[i].to must equal edge[i+1].from, all the way around) — the
// triangulator resamples the boundary one declared edge at a time, in walk
// order, so a gap or overlap here would silently corrupt the outline. Also
// derives `edgeOrder` (edges in polygon-walk order — the wraparound edge,
// whose `from` is the highest index, naturally sorts last, right where it
// belongs).
function finalizePiece(id, role, outline, seamEdges) {
  const n = outline.length
  const edgeOrder = Object.keys(seamEdges).sort((a, b) => seamEdges[a].from - seamEdges[b].from)
  let totalSteps = 0
  for (let i = 0; i < edgeOrder.length; i++) {
    const cur = seamEdges[edgeOrder[i]]
    const next = seamEdges[edgeOrder[(i + 1) % edgeOrder.length]]
    if (cur.to !== next.from) {
      throw new Error(`${id}: edge "${edgeOrder[i]}" ends at point ${cur.to} but the next edge "${edgeOrder[(i + 1) % edgeOrder.length]}" starts at ${next.from} — the perimeter must chain into one closed loop with no gaps/overlaps`)
    }
    totalSteps += (cur.to - cur.from + n) % n || n
  }
  if (totalSteps !== n) {
    throw new Error(`${id}: declared edges cover ${totalSteps} steps but the outline has ${n} points — perimeter isn't fully (and only once) tiled`)
  }
  return { id, role, outline, seamEdges, edgeOrder }
}

function buildPiece(id, role, points, order, edgeDefs) {
  const outline = order.map((name) => points[name])
  const seamEdges = {}
  for (const [edgeName, [fromName, toName]] of Object.entries(edgeDefs)) {
    const from = order.indexOf(fromName)
    const to = order.indexOf(toName)
    if (from < 0 || to < 0) throw new Error(`buildPiece(${id}): edge "${edgeName}" references an unknown point`)
    seamEdges[edgeName] = { from, to }
  }
  return finalizePiece(id, role, outline, seamEdges)
}

// Mirror a piece across x=0 (for the left sleeve from the right sleeve) —
// negates x, and reverses point order so the polygon winding (and therefore
// outward-facing normals) stays consistent after the flip. Forward-walking
// from remap(to) to remap(from) is what stays a short, non-wrapping span
// after the array itself has been reversed.
function mirrorPieceX(piece, newId) {
  const n = piece.outline.length
  const outline = piece.outline.slice().reverse().map(([x, y]) => [-x, y])
  const remap = (i) => n - 1 - i
  const seamEdges = {}
  for (const [name, { from, to }] of Object.entries(piece.seamEdges)) {
    seamEdges[name] = { from: remap(to), to: remap(from) }
  }
  return finalizePiece(newId, piece.role, outline, seamEdges)
}

// ---- Front panel (full symmetric piece; y grows downward from shoulder=0) ----
const frontPts = {
  cfNeck: [0, 8], rNeckShoulder: [4, 1], rShoulder: [16, 0],
  rArmUpper: [19, 6], rArmMid: [24, 12], rUnderarm: [24, 22],
  rHem: [23, 62], lHem: [-23, 62], lUnderarm: [-24, 22],
  lArmMid: [-24, 12], lArmUpper: [-19, 6], lShoulder: [-16, 0], lNeckShoulder: [-4, 1],
}
const frontOrder = ['cfNeck', 'rNeckShoulder', 'rShoulder', 'rArmUpper', 'rArmMid', 'rUnderarm', 'rHem', 'lHem', 'lUnderarm', 'lArmMid', 'lArmUpper', 'lShoulder', 'lNeckShoulder']
const front = buildPiece('front', 'frontPanel', frontPts, frontOrder, {
  rightShoulder: ['rNeckShoulder', 'rShoulder'],
  rightArmhole: ['rShoulder', 'rUnderarm'],
  rightSide: ['rUnderarm', 'rHem'],
  hem: ['rHem', 'lHem'],
  leftSide: ['lHem', 'lUnderarm'],
  leftArmhole: ['lUnderarm', 'lShoulder'],
  leftShoulder: ['lShoulder', 'lNeckShoulder'],
  neckline: ['lNeckShoulder', 'rNeckShoulder'],
})

// ---- Back panel (shallower neckline, otherwise the same block) ----
const backPts = {
  cbNeck: [0, 2], rNeckShoulder: [4, 0], rShoulder: [16, 0],
  rArmUpper: [19, 6], rArmMid: [24, 12], rUnderarm: [24, 22],
  rHem: [23, 62], lHem: [-23, 62], lUnderarm: [-24, 22],
  lArmMid: [-24, 12], lArmUpper: [-19, 6], lShoulder: [-16, 0], lNeckShoulder: [-4, 0],
}
const backOrder = ['cbNeck', 'rNeckShoulder', 'rShoulder', 'rArmUpper', 'rArmMid', 'rUnderarm', 'rHem', 'lHem', 'lUnderarm', 'lArmMid', 'lArmUpper', 'lShoulder', 'lNeckShoulder']
const back = buildPiece('back', 'backPanel', backPts, backOrder, {
  rightShoulder: ['rNeckShoulder', 'rShoulder'],
  rightArmhole: ['rShoulder', 'rUnderarm'],
  rightSide: ['rUnderarm', 'rHem'],
  hem: ['rHem', 'lHem'],
  leftSide: ['lHem', 'lUnderarm'],
  leftArmhole: ['lUnderarm', 'lShoulder'],
  leftShoulder: ['lShoulder', 'lNeckShoulder'],
  neckline: ['lNeckShoulder', 'rNeckShoulder'],
})

// ---- Right sleeve (cap curve split into front/back halves at capTop) ----
const sleeveRPts = {
  capTop: [0, -8], capBackPt: [-10, -2], backUnderarm: [-12, 8], backCuff: [-9, 44],
  frontCuff: [9, 44], frontUnderarm: [12, 8], capFrontPt: [10, -2],
}
const sleeveROrder = ['capTop', 'capBackPt', 'backUnderarm', 'backCuff', 'frontCuff', 'frontUnderarm', 'capFrontPt']
const sleeveR = buildPiece('sleeveR', 'sleeve', sleeveRPts, sleeveROrder, {
  capBack: ['capTop', 'backUnderarm'],
  backSeam: ['backUnderarm', 'backCuff'],
  cuff: ['backCuff', 'frontCuff'],
  frontSeam: ['frontCuff', 'frontUnderarm'],
  capFront: ['frontUnderarm', 'capTop'],
})
const sleeveL = mirrorPieceX(sleeveR, 'sleeveL')

export const TSHIRT_PIECES = [front, back, sleeveR, sleeveL]

// Which edge of which piece sews to which edge of which other piece.
// `reverse: true` means edge B is walked start-to-end while edge A is
// walked end-to-start (the normal case for two panels facing each other).
export const TSHIRT_SEAMS = [
  { id: 'rightShoulder', a: { piece: 'front', edge: 'rightShoulder' }, b: { piece: 'back', edge: 'rightShoulder' }, reverse: false },
  { id: 'leftShoulder', a: { piece: 'front', edge: 'leftShoulder' }, b: { piece: 'back', edge: 'leftShoulder' }, reverse: false },
  { id: 'rightSide', a: { piece: 'front', edge: 'rightSide' }, b: { piece: 'back', edge: 'rightSide' }, reverse: false },
  { id: 'leftSide', a: { piece: 'front', edge: 'leftSide' }, b: { piece: 'back', edge: 'leftSide' }, reverse: false },
  { id: 'rightCapFront', a: { piece: 'front', edge: 'rightArmhole' }, b: { piece: 'sleeveR', edge: 'capFront' }, reverse: true },
  { id: 'rightCapBack', a: { piece: 'back', edge: 'rightArmhole' }, b: { piece: 'sleeveR', edge: 'capBack' }, reverse: false },
  { id: 'leftCapFront', a: { piece: 'front', edge: 'leftArmhole' }, b: { piece: 'sleeveL', edge: 'capFront' }, reverse: true },
  { id: 'leftCapBack', a: { piece: 'back', edge: 'leftArmhole' }, b: { piece: 'sleeveL', edge: 'capBack' }, reverse: false },
  { id: 'rightSleeveTube', a: { piece: 'sleeveR', edge: 'frontSeam' }, b: { piece: 'sleeveR', edge: 'backSeam' }, reverse: true },
  { id: 'leftSleeveTube', a: { piece: 'sleeveL', edge: 'frontSeam' }, b: { piece: 'sleeveL', edge: 'backSeam' }, reverse: true },
]
