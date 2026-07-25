// Converts a postMessage payload from the root BerryStudio app (see
// js/app.js's buildClothLabPayload/syncClothLab) into raw pieces + roles +
// a best-effort seam suggestion, ready to seed useSeamEditor.
//
// Closed-world by design: only pieces that look like they came from the root
// app's js/ai.js / js/data.js generator family (front/back torso or hip
// panels, a single symmetric sleeve) are recognized. Anything else — most
// notably js/fancy-patterns.js's princess-seam/gore/godet shapes, which are
// structurally incompatible with this classifier and would silently mis-
// drape if treated as a plain front/back panel — is excluded with a reason
// rather than guessed at. The caller (App.jsx) always lands the result in
// the Seams debug view for human review before simulating; nothing here ever
// calls setGarment directly.
//
// Two geometric operations this file introduces, neither of which exists
// elsewhere in cloth-lab:
//  - unfoldPiece: the root app draws torso/hip panels as HALF pieces (cut on
//    fold, one side only — confirmed directly against js/ai.js's buildTop/
//    buildSkirt AND against a real hand-authored js/data.js pattern), while
//    cloth-lab's placement (placeTorsoPanel/placeHipPanel) expects a FULL
//    symmetric panel like tshirt.js's hand-authored front/back. This mirrors
//    the half across its fold edge and merges it into one full outline —
//    distinct from tshirt.js's existing mirrorPieceX, which duplicates a
//    piece into a SEPARATE one (used below for sleeves) rather than merging.
//  - isFoldPiece: detects a half-piece by checking whether the outline's
//    closing edge (last point back to first) sits at the piece's own
//    leftmost extent — a position-invariant structural test (survives
//    js/canvas.js's layoutPieces() shifting every piece's coordinates by an
//    arbitrary amount, confirmed against real payload data) that doesn't
//    depend on matching any generator's exact point count/formula.

// ---------- role classification (mirrors js/app.js's classifyPart) ----------

const IGNORE_RE = /waistband|collar|cuff|sash|tie|gusset|facing|pocket|lining|\bband\b/i
const SLEEVE_RE = /sleeve|كم/i
const SKIRT_RE = /skirt|تنور/i
const TROUSERS_RE = /trouser|بنطل|pant|\bleg\b/i
const FRONT_RE = /front|أمام/i
const BACK_RE = /back|خلف/i

// Returns one of: 'sleeve' | 'bodice-front' | 'bodice-back' | 'skirt-front' |
// 'skirt-back' | {ignore:true} | {unrecognized:true} — never guesses front
// vs back when neither name pattern matches.
function classify(labelEn) {
  const name = (labelEn || '').toLowerCase()
  if (IGNORE_RE.test(name)) return { ignore: true, reason: 'accessory piece (no 3D placement for it yet)' }
  if (SLEEVE_RE.test(name)) return 'sleeve'
  if (TROUSERS_RE.test(name)) return { ignore: true, reason: 'trousers/leg pieces aren’t supported in 3D yet' }
  const isSkirt = SKIRT_RE.test(name)
  if (FRONT_RE.test(name)) return isSkirt ? 'skirt-front' : 'bodice-front'
  if (BACK_RE.test(name)) return isSkirt ? 'skirt-back' : 'bodice-back'
  return { unrecognized: true, reason: 'couldn’t tell if this is a front or back piece from its name' }
}

// ---------- geometry ----------

function bbox(outline) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of outline) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

// Undo js/canvas.js's layoutPieces() cursor-position shift — every piece
// Canvas.getPieces() returns has already been translated so its own bbox min
// lands at an arbitrary "where this sits in the 2D layout grid" position, not
// "center-front = 0". Confirmed directly against a live payload: a piece
// authored with outline X starting at 0 arrived with minX=4 (or 42.5, or
// 106.5 — whatever the next open slot in the layout row was).
function relocalize(outline) {
  const { minX, minY } = bbox(outline)
  return outline.map(([x, y]) => [x - minX, y - minY])
}

// A half (cut-on-fold) piece's closing edge — outline[last] back to
// outline[0] — sits at the piece's own leftmost extent and runs roughly
// vertically (small X span relative to the piece's total width). Checked
// against real data: both js/ai.js-generated and hand-authored js/data.js
// front/back panels and skirt panels satisfy this; a sleeve (which needs
// duplication, not unfolding — filtered out by role before this ever runs)
// would too by coincidence, which is exactly why role is checked first.
function isFoldPiece(outline) {
  const n = outline.length
  if (n < 3) return false
  const { minX, maxX } = bbox(outline)
  const width = maxX - minX
  if (width <= 0) return false
  const first = outline[0], last = outline[n - 1]
  const edgeDX = Math.abs(first[0] - last[0])
  const edgeAvgX = (first[0] + last[0]) / 2
  return edgeDX < width * 0.25 && edgeAvgX < minX + width * 0.4
}

// Mirrors the "interior" points (everything except the two fold-edge
// endpoints, which stay as single shared vertices) across X=0 and appends
// them in reverse, producing one full closed polygon out of a half piece.
// Assumes `outline` is already relocalized (fold edge at/near X=0).
function unfoldPiece(outline) {
  const n = outline.length
  const interior = outline.slice(1, n - 1)
  const mirrored = interior.slice().reverse().map(([x, y]) => [-x, y])
  return outline.concat(mirrored)
}

// tshirt.js's own mirrorPieceX, adapted to work on a plain outline (before
// finalizePiece) rather than an already-finalized piece — duplicates into a
// SEPARATE mirrored outline (for sleeves: the root app draws one symmetric
// sleeve standing in for a mirrored L/R pair, unlike a fold piece which is
// one physical half of a single piece).
function mirrorOutline(outline) {
  return outline.slice().reverse().map(([x, y]) => [-x, y])
}

// Locates the shoulder/side (or waist/side, for a skirt panel) seam-worthy
// edges on an unfolded full torso/hip outline, by VALUE rather than a fixed
// point index — robust to different source generators producing different
// point counts/hem shapes. Point 0 is always the fold-line's shared top
// vertex (center-front/back neck or waist) by construction of unfoldPiece.
// Returns edge instructions only (fromIdx/toIdx) — never touches seam state
// directly, see convertAppPattern for why.
function deriveTorsoEdgeInstructions(outline, { includeTop }) {
  const n = outline.length
  const half = Math.floor(n / 2) // unfoldPiece is symmetric: n = 2*(orig-1)
  let rightHemIdx = 1, rightHemY = -Infinity
  for (let i = 1; i <= half; i++) if (outline[i][1] > rightHemY) { rightHemY = outline[i][1]; rightHemIdx = i }
  let leftHemIdx = half + 1, leftHemY = -Infinity
  for (let i = half + 1; i < n; i++) if (outline[i][1] > leftHemY) { leftHemY = outline[i][1]; leftHemIdx = i }

  const out = []
  if (includeTop) out.push({ name: 'rightTop', from: 0, to: 1 })
  out.push({ name: 'rightSide', from: 1, to: rightHemIdx })
  if (includeTop) out.push({ name: 'leftTop', from: n - 1, to: 0 })
  out.push({ name: 'leftSide', from: leftHemIdx, to: n - 1 })
  return out
}

const FABRIC_NAME_TO_ID = new Set(['chiffon', 'silk', 'satin', 'cotton', 'linen', 'wool', 'denim', 'leather'])

// The single entry point. Never throws — always returns a best-effort
// result; anything it couldn't use is in `skipped` with a human-readable
// reason, ready to surface near the "Garment:" label.
export function convertAppPattern(payload) {
  const rawPieces = []
  const roles = {}
  const edgeInstructions = [] // {pieceId, edgeName, fromIdx, toIdx}
  const seamInstructions = [] // full seam objects, same shape as TSHIRT_SEAMS
  const recognized = []
  const skipped = []

  const bySlot = {} // 'bodice-front' | 'bodice-back' | 'skirt-front' | 'skirt-back' -> converted piece id
  const sleeves = []

  for (const p of payload.pieces || []) {
    const label = (p.label && p.label.en) || p.id
    const cls = classify(label)
    if (cls && typeof cls === 'object') {
      skipped.push({ label, reason: cls.reason })
      continue
    }
    const local = relocalize(p.outline)

    if (cls === 'sleeve') {
      sleeves.push({ id: p.id, label, outline: local })
      continue
    }

    // bodice-front / bodice-back / skirt-front / skirt-back. A SECOND piece
    // landing on the same slot (e.g. a princess-seam pattern's "Bodice Front
    // Center" AND "Bodice Front Side" both matching /front/) is a sign this
    // pattern has more structure than the classifier understands — placing
    // both independently would silently overlap them in 3D, and pairing the
    // wrong one into the auto-seam would silently seam the wrong panels. Skip
    // the extra rather than guess which one is "right".
    if (bySlot[cls]) {
      skipped.push({ label, reason: `already have a piece for "${cls}" (${bySlot[cls].label}) — this pattern has more structure than the importer understands` })
      continue
    }
    const isSkirt = cls.startsWith('skirt')
    const outline = isFoldPiece(local) ? unfoldPiece(local) : local
    const role = { 'bodice-front': 'frontPanel', 'bodice-back': 'backPanel', 'skirt-front': 'hipPanelFront', 'skirt-back': 'hipPanelBack' }[cls]
    rawPieces.push({ id: p.id, label: p.label, outline })
    roles[p.id] = role
    bySlot[cls] = { id: p.id, label }
    for (const e of deriveTorsoEdgeInstructions(outline, { includeTop: !isSkirt })) {
      edgeInstructions.push({ pieceId: p.id, edgeName: e.name, fromIdx: e.from, toIdx: e.to })
    }
    recognized.push({ id: p.id, label })
  }

  // Sleeves: duplicate+mirror into R/L (root app draws one piece standing in
  // for a mirrored pair — see mirrorOutline above). Self-seamed into a tube
  // (matching tshirt.js's own rightSleeveTube/leftSleeveTube precedent) and
  // placed near the shoulder by cloth-lab's existing placeSleeve — NOT seamed
  // to the front/back armhole in this pass (no reliable armhole marker
  // survives on every source shape; an unstitched-but-correctly-placed
  // sleeve drapes plausibly from gravity+placement alone, which is safer
  // than guessing a seam location and risking a visibly torn result).
  for (const s of sleeves) {
    const rId = s.id + '_r', lId = s.id + '_l'
    rawPieces.push({ id: rId, label: s.label, outline: s.outline })
    rawPieces.push({ id: lId, label: s.label, outline: mirrorOutline(s.outline) })
    roles[rId] = 'sleeve'
    roles[lId] = 'sleeve'
    const n = s.outline.length
    // Long edges of the tube run the full point range on either side of the
    // cap-top(0)/cuff-bottom(roughly n/2) split — matched by value (max Y =
    // cuff) for the same reason deriveTorsoEdgeInstructions is value-based.
    let cuffIdx = 0, cuffY = -Infinity
    for (let i = 0; i < n; i++) if (s.outline[i][1] > cuffY) { cuffY = s.outline[i][1]; cuffIdx = i }
    if (cuffIdx > 0 && cuffIdx < n - 1) {
      edgeInstructions.push({ pieceId: rId, edgeName: 'frontSeam', fromIdx: 0, toIdx: cuffIdx })
      edgeInstructions.push({ pieceId: rId, edgeName: 'backSeam', fromIdx: cuffIdx, toIdx: n - 1 })
      edgeInstructions.push({ pieceId: lId, edgeName: 'frontSeam', fromIdx: 0, toIdx: cuffIdx })
      edgeInstructions.push({ pieceId: lId, edgeName: 'backSeam', fromIdx: cuffIdx, toIdx: n - 1 })
      seamInstructions.push({ id: rId + '_tube', a: { piece: rId, edge: 'frontSeam' }, b: { piece: rId, edge: 'backSeam' }, reverse: true })
      seamInstructions.push({ id: lId + '_tube', a: { piece: lId, edge: 'frontSeam' }, b: { piece: lId, edge: 'backSeam' }, reverse: true })
    }
    recognized.push({ id: rId, label: s.label + ' (R)' })
    recognized.push({ id: lId, label: s.label + ' (L)' })
  }

  // Front/back seams — only when BOTH sides of a slot were recognized.
  for (const kind of ['bodice', 'skirt']) {
    const f = bySlot[kind + '-front']?.id, b = bySlot[kind + '-back']?.id
    if (!f || !b) continue
    const includeTop = kind === 'bodice'
    if (includeTop) {
      seamInstructions.push({ id: kind + '_rightTop', a: { piece: f, edge: 'rightTop' }, b: { piece: b, edge: 'rightTop' }, reverse: false })
      seamInstructions.push({ id: kind + '_leftTop', a: { piece: f, edge: 'leftTop' }, b: { piece: b, edge: 'leftTop' }, reverse: false })
    }
    seamInstructions.push({ id: kind + '_rightSide', a: { piece: f, edge: 'rightSide' }, b: { piece: b, edge: 'rightSide' }, reverse: false })
    seamInstructions.push({ id: kind + '_leftSide', a: { piece: f, edge: 'leftSide' }, b: { piece: b, edge: 'leftSide' }, reverse: false })
  }
  // A recognized front (or back) with no matching other half still gets
  // placed and simulated on its own — just unseamed to anything, which is
  // honest (nothing invented) rather than excluding an otherwise-good piece.

  const fabricId = FABRIC_NAME_TO_ID.has(payload.fabricId) ? payload.fabricId : null

  return { rawPieces, roles, edgeInstructions, seamInstructions, recognized, skipped, fabricId }
}
