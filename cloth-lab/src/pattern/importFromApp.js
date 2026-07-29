// Converts a postMessage payload from the root BerryStudio app (see
// js/app.js's buildClothLabPayload/syncClothLab) into raw pieces + roles +
// a best-effort seam suggestion, ready to seed useSeamEditor.
//
// BerryStudio-Upgrade-Plan WP-6: pieces that declare a `role` (js/data.js,
// js/ai.js, js/fancy-patterns.js all now attach role/cutOnFold/bilateral/
// edges at construction time — see pattern/roles.js) go through the THIN
// METADATA-PATH VALIDATOR below — no name guessing, no geometric
// classification of WHAT a piece is. Only pieces with no declared role (or
// an unrecognized one — legacy saved projects, hand-typed piece names)
// fall back to CLASSIFY_LEGACY, the original closed-world name-matching
// classifier this file used exclusively before WP-6. Both paths feed the
// same rawPieces/roles/edgeInstructions/seamInstructions/recognized/skipped
// collections, so a payload can freely mix metadata-bearing and legacy
// pieces (e.g. an old saved project touched up with newer patterns).
//
// The caller (App.jsx) always lands the result in the Seams debug view for
// human review before simulating; nothing here ever calls setGarment
// directly.
import { resolveSchemaRole } from './roles.js'

// ---------- CLASSIFY_LEGACY: role classification (mirrors js/app.js's classifyPart) ----------

const IGNORE_RE = /waistband|collar|cuff|sash|tie|gusset|facing|pocket|lining|\bband\b/i
const SLEEVE_RE = /sleeve|كم/i
const SKIRT_RE = /skirt|تنور/i
const TROUSERS_RE = /trouser|بنطل|pant|\bleg\b/i
const FRONT_RE = /front|أمام/i
const BACK_RE = /back|خلف/i

// Returns one of: 'sleeve' | 'bodice-front' | 'bodice-back' | 'skirt-front' |
// 'skirt-back' | {ignore:true} | {unrecognized:true} — never guesses front
// vs back when neither name pattern matches. UNCHANGED from the pre-WP-6
// classifier — kept verbatim as the fallback for pieces with no declared
// (or unrecognized) role.
function classifyLegacy(labelEn) {
  const name = (labelEn || '').toLowerCase()
  if (IGNORE_RE.test(name)) return { ignore: true, reason: 'accessory piece (no 3D placement for it yet)' }
  if (SLEEVE_RE.test(name)) return 'sleeve'
  if (TROUSERS_RE.test(name)) return { ignore: true, reason: 'trousers/leg pieces aren’t supported in 3D yet' }
  const isSkirt = SKIRT_RE.test(name)
  if (FRONT_RE.test(name)) return isSkirt ? 'skirt-front' : 'bodice-front'
  if (BACK_RE.test(name)) return isSkirt ? 'skirt-back' : 'bodice-back'
  return { unrecognized: true, reason: 'couldn’t tell if this is a front or back piece from its name' }
}

// ---------- geometry (shared by both paths) ----------

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
// vertically (small X span relative to the piece's total width). Still used
// by classifyLegacy's path (geometric detection, no declared metadata to
// trust); the metadata path trusts a declared `cutOnFold` instead of
// re-deriving this.
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

// Duplicates into a SEPARATE mirrored outline (for sleeves and, since WP-6,
// any other `bilateral` piece: the root app draws one symmetric piece
// standing in for a mirrored L/R pair).
function mirrorOutline(outline) {
  return outline.slice().reverse().map(([x, y]) => [-x, y])
}

// Transforms declared edge index ranges to refer to the correct points in a
// MIRROR-DUPLICATED copy of a piece (see mirrorOutline): mirroring reverses
// point order and negates X, so a forward walk [fromIdx,toIdx] in the
// original corresponds to a forward walk [n-1-toIdx, n-1-fromIdx] in the
// mirrored copy (same physical curve, opposite winding).
function mirrorEdgeIndices(edges, n) {
  return edges.map((e) => ({ ...e, fromIdx: (n - 1 - e.toIdx + n) % n, toIdx: (n - 1 - e.fromIdx + n) % n }))
}

// Locates the shoulder/side (or waist/side, for a skirt panel) seam-worthy
// edges on an unfolded full torso/hip outline, by VALUE rather than a fixed
// point index — robust to different source generators producing different
// point counts/hem shapes. Point 0 is always the fold-line's shared top
// vertex (center-front/back neck or waist) by construction of unfoldPiece.
// Used by BOTH paths: classifyLegacy's simple front/back panels, and the
// metadata path's princess-center panels (post-unfold, its rightSide/
// leftSide split IS the princess seam — see convertAppPattern below).
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

// Self-tube-seams a single sleeve outline (cap-top(0)/cuff-bottom split,
// matched by VALUE — max Y = cuff — same reasoning as deriveTorsoEdgeInstructions).
// Shared by both paths' sleeve handling.
function sleeveTubeEdges(outline) {
  const n = outline.length
  let cuffIdx = 0, cuffY = -Infinity
  for (let i = 0; i < n; i++) if (outline[i][1] > cuffY) { cuffY = outline[i][1]; cuffIdx = i }
  if (cuffIdx <= 0 || cuffIdx >= n - 1) return null
  return { frontSeam: { from: 0, to: cuffIdx }, backSeam: { from: cuffIdx, to: n - 1 } }
}

const FABRIC_NAME_TO_ID = new Set(['chiffon', 'silk', 'satin', 'cotton', 'linen', 'wool', 'denim', 'leather'])

const SLEEVE_ROLES = new Set(['sleeve', 'cap-sleeve', 'puff-sleeve', 'butterfly-sleeve'])
// Roles that get bilateral duplication but NOT auto-seamed (drape from
// placement + gravity alone this pass — see pattern/roles.js's header for
// the "unstitched but well-placed" precedent this follows).
const UNSEAMED_BILATERAL_ROLES = new Set(['hood', 'godet', 'sleeve-upper', 'sleeve-under'])

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

  const bySlot = { frontPanel: [], backPanel: [], hipPanelFront: [], hipPanelBack: [] }
  const sleeves = []
  const seamIdEdges = {} // seamId -> [{pieceId, fromIdx, toIdx}] — resolved into seams after the main loop

  function pushEdge(pieceId, edgeName, from, to) {
    edgeInstructions.push({ pieceId, edgeName, fromIdx: from, toIdx: to })
  }

  for (const p of payload.pieces || []) {
    const label = (p.label && p.label.en) || p.id
    const resolved = resolveSchemaRole(p.role)

    if (!resolved) {
      // ---------- CLASSIFY_LEGACY path (unchanged from pre-WP-6) ----------
      const cls = classifyLegacy(label)
      if (cls && typeof cls === 'object') { skipped.push({ label, reason: cls.reason }); continue }
      const local = relocalize(p.outline)

      if (cls === 'sleeve') { sleeves.push({ id: p.id, label, outline: local }); continue }

      const slotKey = { 'bodice-front': 'frontPanel', 'bodice-back': 'backPanel', 'skirt-front': 'hipPanelFront', 'skirt-back': 'hipPanelBack' }[cls]
      if (bySlot[slotKey].length) {
        skipped.push({ label, reason: `already have a piece for "${cls}" (${bySlot[slotKey][0].label}) — this pattern has more structure than the importer understands` })
        continue
      }
      const isSkirt = cls.startsWith('skirt')
      const outline = isFoldPiece(local) ? unfoldPiece(local) : local
      rawPieces.push({ id: p.id, label: p.label, outline })
      roles[p.id] = slotKey
      bySlot[slotKey].push({ id: p.id, label })
      for (const e of deriveTorsoEdgeInstructions(outline, { includeTop: !isSkirt })) pushEdge(p.id, e.name, e.from, e.to)
      recognized.push({ id: p.id, label })
      continue
    }

    // ---------- WP-6 metadata path: thin structural validation, trust the declared role ----------
    const { role: schemaRole, placement, cutOnFold, bilateral, edges, princessSeamId } = resolved
    const local = relocalize(p.outline)

    if (SLEEVE_ROLES.has(schemaRole)) {
      sleeves.push({ id: p.id, label, outline: local })
      continue
    }

    if (schemaRole === 'skirt-front-gore' || schemaRole === 'skirt-back-gore' || schemaRole === 'skirt-side-gore-left' || schemaRole === 'skirt-side-gore-right') {
      const internalRole = { 'skirt-front-gore': 'goreFront', 'skirt-back-gore': 'goreBack', 'skirt-side-gore-left': 'goreSideLeft', 'skirt-side-gore-right': 'goreSideRight' }[schemaRole]
      rawPieces.push({ id: p.id, label: p.label, outline: local })
      roles[p.id] = internalRole
      recognized.push({ id: p.id, label })
      continue
    }

    if (cutOnFold) {
      // Princess-center or simple front/back-equivalent half-piece — unfold,
      // trusting the DECLARATION (no isFoldPiece re-derivation) since the
      // generator that authored this outline already knows it's a half.
      const outline = unfoldPiece(local)
      rawPieces.push({ id: p.id, label: p.label, outline })
      roles[p.id] = placement
      if (princessSeamId) {
        // Post-unfold, the shape's own rightSide/leftSide split (found the
        // same value-based way deriveTorsoEdgeInstructions always has) IS
        // the two halves of the (now-doubled) princess curve.
        const [right, left] = deriveTorsoEdgeInstructions(outline, { includeTop: false })
        pushEdge(p.id, right.name, right.from, right.to)
        pushEdge(p.id, left.name, left.from, left.to)
        ;(seamIdEdges[princessSeamId + '_R'] ||= []).push({ pieceId: p.id, fromIdx: right.from, toIdx: right.to })
        ;(seamIdEdges[princessSeamId + '_L'] ||= []).push({ pieceId: p.id, fromIdx: left.from, toIdx: left.to })
      } else {
        bySlot[placement].push({ id: p.id, label })
        for (const e of deriveTorsoEdgeInstructions(outline, { includeTop: placement === 'frontPanel' || placement === 'backPanel' })) pushEdge(p.id, e.name, e.from, e.to)
      }
      recognized.push({ id: p.id, label })
      continue
    }

    if (bilateral) {
      const rId = p.id + '_r', lId = p.id + '_l'
      const n = local.length
      rawPieces.push({ id: rId, label: p.label, outline: local })
      rawPieces.push({ id: lId, label: p.label, outline: mirrorOutline(local) })
      roles[rId] = placement
      roles[lId] = placement
      if (edges && edges.length && !UNSEAMED_BILATERAL_ROLES.has(schemaRole)) {
        edges.forEach((e, i) => {
          const edgeName = `seam${i}`
          pushEdge(rId, edgeName, e.fromIdx, e.toIdx)
          ;(seamIdEdges[e.seamId + '_R'] ||= []).push({ pieceId: rId, fromIdx: e.fromIdx, toIdx: e.toIdx })
        })
        const mirrored = mirrorEdgeIndices(edges, n)
        mirrored.forEach((e, i) => {
          const edgeName = `seam${i}`
          pushEdge(lId, edgeName, e.fromIdx, e.toIdx)
          ;(seamIdEdges[edges[i].seamId + '_L'] ||= []).push({ pieceId: lId, fromIdx: e.fromIdx, toIdx: e.toIdx })
        })
      }
      recognized.push({ id: rId, label: label + ' (R)' })
      recognized.push({ id: lId, label: label + ' (L)' })
      continue
    }

    // Plain single piece — front-panel/back-panel/hip-panel-* not on fold
    // (e.g. an asymmetric jacket front), or a decorative attach-only role
    // (collar/cuff/pocket/facing/waistband/sash/yoke/peplum/tier/cape/lining/
    // other) — placed via its role's placement family, not auto-seamed.
    rawPieces.push({ id: p.id, label: p.label, outline: local })
    roles[p.id] = placement
    if (placement === 'frontPanel' || placement === 'backPanel' || placement === 'hipPanelFront' || placement === 'hipPanelBack') {
      bySlot[placement].push({ id: p.id, label })
      for (const e of deriveTorsoEdgeInstructions(local, { includeTop: placement === 'frontPanel' || placement === 'backPanel' })) pushEdge(p.id, e.name, e.from, e.to)
    }
    recognized.push({ id: p.id, label })
  }

  // Sleeves (both paths converge here): duplicate+mirror into R/L, self-
  // seamed into a tube, placed near the shoulder — NOT seamed to the
  // front/back armhole (no reliable armhole marker survives on every source
  // shape; an unstitched-but-correctly-placed sleeve drapes plausibly from
  // gravity+placement alone, safer than guessing a seam location).
  for (const s of sleeves) {
    const rId = s.id + '_r', lId = s.id + '_l'
    rawPieces.push({ id: rId, label: s.label, outline: s.outline })
    rawPieces.push({ id: lId, label: s.label, outline: mirrorOutline(s.outline) })
    roles[rId] = 'sleeve'
    roles[lId] = 'sleeve'
    const tube = sleeveTubeEdges(s.outline)
    if (tube) {
      pushEdge(rId, 'frontSeam', tube.frontSeam.from, tube.frontSeam.to)
      pushEdge(rId, 'backSeam', tube.backSeam.from, tube.backSeam.to)
      pushEdge(lId, 'frontSeam', tube.frontSeam.from, tube.frontSeam.to)
      pushEdge(lId, 'backSeam', tube.backSeam.from, tube.backSeam.to)
      seamInstructions.push({ id: rId + '_tube', a: { piece: rId, edge: 'frontSeam' }, b: { piece: rId, edge: 'backSeam' }, reverse: true })
      seamInstructions.push({ id: lId + '_tube', a: { piece: lId, edge: 'frontSeam' }, b: { piece: lId, edge: 'backSeam' }, reverse: true })
    }
    recognized.push({ id: rId, label: s.label + ' (R)' })
    recognized.push({ id: lId, label: s.label + ' (L)' })
  }

  // Front/back seams (both paths converge here) — only when BOTH sides of a
  // slot were recognized, and there's exactly one of each (more than one —
  // e.g. a wrap design's two independent front panels — means there's no
  // single unambiguous pairing, so those pieces stay placed-but-unseamed
  // rather than guessed at).
  for (const [frontKey, backKey, includeTop] of [['frontPanel', 'backPanel', true], ['hipPanelFront', 'hipPanelBack', false]]) {
    if (bySlot[frontKey].length === 1 && bySlot[backKey].length === 1) {
      const f = bySlot[frontKey][0].id, b = bySlot[backKey][0].id
      if (includeTop) {
        seamInstructions.push({ id: frontKey + '_rightTop', a: { piece: f, edge: 'rightTop' }, b: { piece: b, edge: 'rightTop' }, reverse: false })
        seamInstructions.push({ id: frontKey + '_leftTop', a: { piece: f, edge: 'leftTop' }, b: { piece: b, edge: 'leftTop' }, reverse: false })
      }
      seamInstructions.push({ id: frontKey + '_rightSide', a: { piece: f, edge: 'rightSide' }, b: { piece: b, edge: 'rightSide' }, reverse: false })
      seamInstructions.push({ id: frontKey + '_leftSide', a: { piece: f, edge: 'leftSide' }, b: { piece: b, edge: 'leftSide' }, reverse: false })
    }
    // A recognized front (or back) with no matching other half (or more
    // than one candidate) still gets placed and simulated on its own —
    // honest (nothing invented) rather than excluding an otherwise-good piece.
  }

  // WP-6 seamId-tagged edges (princess seams, and any future declared-edge
  // role): pair up every seamId with EXACTLY 2 contributing edges. A seamId
  // used once (a design error) or 3+ times (ambiguous) is left unseamed
  // rather than guessed — same "never guess" principle as everywhere else
  // in this file.
  let seamIdCounter = 0
  for (const [seamId, contributors] of Object.entries(seamIdEdges)) {
    if (contributors.length !== 2) continue
    const [a, b] = contributors
    const aEdgeName = edgeInstructions.find((e) => e.pieceId === a.pieceId && e.fromIdx === a.fromIdx && e.toIdx === a.toIdx)?.edgeName
    const bEdgeName = edgeInstructions.find((e) => e.pieceId === b.pieceId && e.fromIdx === b.fromIdx && e.toIdx === b.toIdx)?.edgeName
    if (!aEdgeName || !bEdgeName) continue
    seamInstructions.push({ id: `seamId_${seamIdCounter++}_${seamId}`, a: { piece: a.pieceId, edge: aEdgeName }, b: { piece: b.pieceId, edge: bEdgeName }, reverse: true })
  }

  const fabricId = FABRIC_NAME_TO_ID.has(payload.fabricId) ? payload.fabricId : null

  return { rawPieces, roles, edgeInstructions, seamInstructions, recognized, skipped, fabricId }
}
