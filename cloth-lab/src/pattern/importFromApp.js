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

// WP-49: js/app.js's Layer Props panel lets a user explicitly mark ANY
// piece 'upper' or 'lower' body (js/body-zone.js), specifically to correct
// cases like this classifier's own name-guessing getting it wrong — e.g. a
// duplicated/hand-edited piece still named "Front Panel" that's actually a
// lower-body panel. classifyLegacy() above only sees the name, so a piece
// with no "skirt"/"trouser" keyword defaults to 'bodice-*' regardless of
// what it's actually for. This corrects that classification when the
// piece's own declared bodyZone disagrees, WITHOUT touching front-vs-back
// (still name-derived — never guessed) or the ignore/unrecognized/sleeve
// outcomes (an explicit zone can't turn an ignored accessory into a panel,
// or resolve a front-vs-back guess classifyLegacy couldn't make at all).
function applyBodyZoneOverride(cls, bodyZone) {
  if (typeof cls !== 'string' || (bodyZone !== 'upper' && bodyZone !== 'lower')) return cls
  if (bodyZone === 'lower' && cls === 'bodice-front') return 'skirt-front'
  if (bodyZone === 'lower' && cls === 'bodice-back') return 'skirt-back'
  if (bodyZone === 'upper' && cls === 'skirt-front') return 'bodice-front'
  if (bodyZone === 'upper' && cls === 'skirt-back') return 'bodice-back'
  return cls
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
//
// WP-61: `necklineEndIdx` (optional, ONLY ever set when a piece declares
// its own `p.necklineEndIdx` — never geometrically guessed) carves the
// neckline/waist-top curve out as its own named `rightNeckline`/
// `leftNeckline` region, instead of it being silently swallowed into
// `rightSide`/`leftSide` (which used to make a piece's neckline curve
// unreachable for anything wanting to seam an accessory — a collar, a
// leotard's neckline binding — to just that curve specifically, since
// `rightSide` already claimed every point on it as "the side seam,"
// and two different seams can't legitimately share a point). Omitting
// it (every caller not yet updated to pass it, and every piece that
// doesn't declare it) reproduces today's exact behavior byte-for-byte —
// `rightTop`/`leftTop` stay the tiny 1-segment shoulder-corner edge they
// always were, `rightSide`/`leftSide` stay unchanged, zero regression
// risk for the ~200+ patterns that don't use this. When present, it's
// an index into the piece's OWN original (pre-unfold) outline — same
// coordinate space `princessSeamId`/`edges` already use, and for the
// same reason: indices 0..n_orig-1 land at the identical position in
// the unfolded outline (unfoldPiece() appends the mirrored copy after
// them, never renumbers the original points) — a mirrored copy is at
// `unfoldedLen - i` (derived from unfoldPiece's own doubling: appended
// point k = mirror(original[n_orig-2-k]), placed at unfolded index
// n_orig+k; solving for i = n_orig-2-k gives unfolded index
// 2*n_orig-2-i = unfoldedLen-i).
// WP-61 code-review fix: `necklineEndIdx` alone only narrows where the
// side-seam claim STARTS — its far end (`rightHemIdx`/`leftHemIdx`, the
// geometric hem search) still ran all the way to the natural hem/fold
// point regardless, so it still swallowed a leotard's ENTIRE hip-to-leg-
// to-gusset region as part of "the side seam," same collision problem
// necklineEndIdx was built to solve, just at the other end — confirmed
// by direct reproduction (a leg-opening-binding seam declared exactly
// this way still silently never formed). `sideEndIdx` is the symmetric
// counterpart: narrows where the claim ENDS, same optional/opt-in
// contract, same coordinate space, same zero-regression guarantee when
// omitted (`rightSide`'s end stays `rightHemIdx`, unchanged).
function signedArea2(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return a
}

function dedupeConsecutive(outline) {
  const out = []
  for (const pt of outline) {
    const prev = out[out.length - 1]
    if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-5) out.push([pt[0], pt[1]])
  }
  if (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-5) {
    out.pop()
  }
  return out
}

// Decomposes ANY one-piece sleeve polygon (curved set-in, puff, butterfly/wide,
// raglan, 5-point pentagon, or 4-point user-drawn rectangle/trapezoid) into its
// 4 anatomical seam edges while leaving the bottom wrist/cuff edge 100% free:
//   - capFront:  underarmFront -> capTop   (sews to Front Bodice armhole)
//   - capBack:   capTop -> underarmBack    (sews to Back Bodice armhole)
//   - backSeam:  underarmBack -> cuffBack  (sews to frontSeam to close tube)
//   - [free]:    cuffBack -> cuffFront     (open arm exit!)
//   - frontSeam: cuffFront -> underarmFront
function prepareRightSleeve(rawOutline) {
  let pts = dedupeConsecutive(rawOutline)
  if (pts.length < 4) return { outline: rawOutline, edges: null }
  if (signedArea2(pts) < 0) pts = pts.slice().reverse()

  function findCuffPair(p) {
    const { minX, minY, maxX, maxY } = bbox(p)
    const w = Math.max(1e-6, maxX - minX), h = Math.max(1e-6, maxY - minY)
    let cands = []
    for (let i = 0; i < p.length; i++) {
      if ((p[i][1] - minY) / h >= 0.75) cands.push(i)
    }
    if (cands.length < 2) {
      cands = p.map((_, i) => i).sort((a, b) => p[b][1] - p[a][1]).slice(0, 2)
    }
    let cuffBack = cands[0], bestBack = -Infinity
    for (const i of cands) {
      const score = 0.55 * ((p[i][0] - minX) / w) + 0.85 * ((p[i][1] - minY) / h)
      if (score > bestBack) { bestBack = score; cuffBack = i }
    }
    let cuffFront = -1, bestFront = -Infinity
    for (const i of cands) {
      if (i === cuffBack) continue
      const score = 0.55 * (1 - (p[i][0] - minX) / w) + 0.85 * ((p[i][1] - minY) / h)
      if (score > bestFront) { bestFront = score; cuffFront = i }
    }
    if (cuffFront < 0) return null
    return { cuffBack, cuffFront, minX, minY, w, h }
  }

  function buildUpperArc(n, cuffFront, cuffBack) {
    const arc = []
    let i = cuffFront, guard = 0
    while (true) {
      arc.push(i)
      if (i === cuffBack) break
      i = (i + 1) % n
      if (++guard > n) return null
    }
    return arc
  }

  function insertMidAfter(arr, idxA) {
    const idxB = (idxA + 1) % arr.length
    const mid = [(arr[idxA][0] + arr[idxB][0]) / 2, (arr[idxA][1] + arr[idxB][1]) / 2]
    const next = arr.slice()
    next.splice(idxA + 1, 0, mid)
    return next
  }

  let pair = findCuffPair(pts)
  if (!pair) return { outline: pts, edges: null }
  let upperArc = buildUpperArc(pts.length, pair.cuffFront, pair.cuffBack)
  if (!upperArc || upperArc.length < 4) return { outline: pts, edges: null }

  // A 4-point rectangular/trapezoidal sleeve has only 2 upper corners
  // (underarmFront and underarmBack) with no crown midpoint between them;
  // insert the exact collinear top midpoint so capFront and capBack split cleanly.
  if (upperArc.length === 4) {
    pts = insertMidAfter(pts, upperArc[1])
    pair = findCuffPair(pts)
    upperArc = buildUpperArc(pts.length, pair.cuffFront, pair.cuffBack)
  }

  const m = upperArc.length
  const midTargetX = (pts[upperArc[1]][0] + pts[upperArc[m - 2]][0]) / 2
  let minCapY = Infinity
  for (let j = 1; j <= m - 2; j++) if (pts[upperArc[j]][1] < minCapY) minCapY = pts[upperArc[j]][1]
  const yTieTol = Math.max(0.05, pair.h * 0.006)
  let capPos = 1, bestDistX = Infinity
  for (let j = 1; j <= m - 2; j++) {
    const [x, y] = pts[upperArc[j]]
    if (y <= minCapY + yTieTol) {
      const dx = Math.abs(x - midTargetX)
      if (dx < bestDistX) { bestDistX = dx; capPos = j }
    }
  }

  if (capPos === 1) {
    pts = insertMidAfter(pts, upperArc[1])
    pair = findCuffPair(pts)
    upperArc = buildUpperArc(pts.length, pair.cuffFront, pair.cuffBack)
    capPos = 2
  } else if (capPos === upperArc.length - 2) {
    pts = insertMidAfter(pts, upperArc[upperArc.length - 3])
    pair = findCuffPair(pts)
    upperArc = buildUpperArc(pts.length, pair.cuffFront, pair.cuffBack)
    capPos = upperArc.length - 3
  }

  const mFinal = upperArc.length
  let underarmFrontPos = 1, minFrontX = Infinity
  for (let j = 1; j < capPos; j++) {
    const x = pts[upperArc[j]][0]
    if (x < minFrontX - 1e-4) { minFrontX = x; underarmFrontPos = j }
  }
  let underarmBackPos = mFinal - 2, maxBackX = -Infinity
  for (let j = capPos + 1; j <= mFinal - 2; j++) {
    const x = pts[upperArc[j]][0]
    if (x >= maxBackX - 1e-4) { maxBackX = x; underarmBackPos = j }
  }

  const underarmFront = upperArc[underarmFrontPos]
  const capTop = upperArc[capPos]
  const underarmBack = upperArc[underarmBackPos]
  const { cuffBack, cuffFront } = pair

  return {
    outline: pts,
    edges: [
      { name: 'capFront', from: underarmFront, to: capTop },
      { name: 'capBack', from: capTop, to: underarmBack },
      { name: 'backSeam', from: underarmBack, to: cuffBack },
      { name: 'frontSeam', from: cuffFront, to: underarmFront },
    ],
  }
}

// Subdivides a 4-point cut-on-fold bodice half (e.g. girls_dress or a user-drawn
// rectangle/trapezoid [[0,0],[w,1],[w,len],[0,len]]) with an exact collinear
// underarm vertex on its outer edge so armhole and side-seam can split cleanly.
function subdivideFoldBodiceArmhole(local) {
  if (local.length !== 4) return local
  const shoulder = local[1], hem = local[2]
  const segH = hem[1] - shoulder[1]
  if (segH <= 4) return local
  const t = Math.min(0.48, Math.max(0.18, 18 / segH))
  const underarm = [shoulder[0] + (hem[0] - shoulder[0]) * t, shoulder[1] + segH * t]
  return [local[0], shoulder, underarm, hem, local[3]]
}

// When a cut-on-fold upper-body panel goes straight from center-neck local[0]
// (x ≈ 0) to the outer shoulder tip local[1] (x >= 12 cm) in a single segment,
// insert a collinear neck-shoulder junction at 36% of that top span so 0 -> 1
// stays an open neckline hole and only 1 -> 2 is sewn as the shoulder seam.
function subdivideFoldBodiceNeckOpening(local) {
  if (local.length < 4) return local
  const p0 = local[0], p1 = local[1]
  if (p0[0] > 2 || p1[0] < 12) return local
  const { minY, maxY } = bbox(local)
  const h = Math.max(1, maxY - minY)
  if (Math.abs(p1[1] - p0[1]) > h * 0.16) return local
  const tNeck = 0.36
  const neckShoulder = [p0[0] + (p1[0] - p0[0]) * tNeck, p0[1] + (p1[1] - p0[1]) * tNeck]
  return [p0, neckShoulder, ...local.slice(1)]
}

// Same collinear underarm subdivision for a symmetric 4-point full-width (non-fold)
// rectangular/trapezoidal bodice panel when sleeves are present.
function subdivideFullRectBodiceArmhole(local) {
  if (local.length !== 4) return local
  const { minX, minY, maxX, maxY } = bbox(local)
  const w = maxX - minX, h = maxY - minY
  if (w <= 4 || h <= 4) return local
  const topW = Math.abs(local[1][0] - local[0][0])
  const botW = Math.abs(local[2][0] - local[3][0])
  if (Math.abs(local[0][1] - local[1][1]) > h * 0.15 || Math.abs(local[2][1] - local[3][1]) > h * 0.15) return local
  if (Math.abs(topW - botW) > w * 0.2) return local
  const t = Math.min(0.48, Math.max(0.18, 18 / h))
  const rightUnderarm = [local[1][0] + (local[2][0] - local[1][0]) * t, local[1][1] + (local[2][1] - local[1][1]) * t]
  const leftUnderarm = [local[0][0] + (local[3][0] - local[0][0]) * t, local[0][1] + (local[3][1] - local[0][1]) * t]
  return [local[0], local[1], rightUnderarm, local[2], local[3], leftUnderarm]
}

function turnAngleDeg(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1]
  const vx = c[0] - b[0], vy = c[1] - b[1]
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy)
  if (lu < 1e-6 || lv < 1e-6) return 0
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))
  return (Math.acos(cos) * 180) / Math.PI
}

function deriveTorsoEdgeInstructions(outline, { includeTop, necklineEndIdx, sideEndIdx } = {}) {
  const n = outline.length
  const half = Math.floor(n / 2) // unfoldPiece is symmetric: n = 2*(orig-1)
  let rightHemIdx = 1, rightHemY = -Infinity
  for (let i = 1; i <= half; i++) if (outline[i][1] > rightHemY) { rightHemY = outline[i][1]; rightHemIdx = i }
  let leftHemIdx = half + 1, leftHemY = -Infinity
  for (let i = half + 1; i < n; i++) if (outline[i][1] > leftHemY) { leftHemY = outline[i][1]; leftHemIdx = i }

  const rightSideEnd = sideEndIdx != null ? sideEndIdx : rightHemIdx
  const leftSideStart = sideEndIdx != null ? n - sideEndIdx : leftHemIdx
  const h = Math.max(1, rightHemY - outline[0][1])
  const hasNeckStep = includeTop &&
    necklineEndIdx == null &&
    rightSideEnd >= 3 &&
    Math.abs(outline[0][0]) <= 2 &&
    outline[1][0] > outline[0][0] + 2 &&
    outline[2][0] > outline[1][0] + 4 &&
    Math.abs(outline[2][1] - outline[0][1]) <= h * 0.16 &&
    Math.abs(outline[1][0] + outline[n - 1][0]) < 1

  const rightTopFrom = hasNeckStep ? 1 : 0
  const rightTopTo = hasNeckStep ? 2 : 1
  const leftTopFrom = hasNeckStep ? n - 2 : n - 1
  const leftTopTo = hasNeckStep ? n - 1 : 0
  const rightNeckEnd = necklineEndIdx != null ? necklineEndIdx : rightTopTo
  const leftNeckEnd = necklineEndIdx != null ? n - necklineEndIdx : leftTopFrom

  const out = []
  if (includeTop) out.push({ name: 'rightTop', from: rightTopFrom, to: rightTopTo })
  if (rightNeckEnd !== rightSideEnd) out.push({ name: 'rightSide', from: rightNeckEnd, to: rightSideEnd })
  if (includeTop) out.push({ name: 'leftTop', from: leftTopFrom, to: leftTopTo })
  if (leftSideStart !== leftNeckEnd) out.push({ name: 'leftSide', from: leftSideStart, to: leftNeckEnd })
  return out
}

// When sleeves are present in the garment, splits an upper-body front/back panel's
// right and left contours into distinct shoulder (optional), armhole, and side-seam
// edges so the front armhole sews to sleeve capFront, the back armhole sews to
// sleeve capBack, and only the true underarm-to-hem side seams weld front-to-back.
function deriveSleevedTorsoEdges(outline, { includeTop, necklineEndIdx, sideEndIdx, edges, curves } = {}) {
  const n = outline.length
  const half = Math.floor(n / 2)
  let rightHemIdx = 1, rightHemY = -Infinity
  for (let i = 1; i <= half; i++) if (outline[i][1] > rightHemY) { rightHemY = outline[i][1]; rightHemIdx = i }
  let leftHemIdx = half + 1, leftHemY = -Infinity
  for (let i = half + 1; i < n; i++) if (outline[i][1] > leftHemY) { leftHemY = outline[i][1]; leftHemIdx = i }

  const rightSideEnd = sideEndIdx != null ? sideEndIdx : rightHemIdx
  const leftSideStart = sideEndIdx != null ? n - sideEndIdx : leftHemIdx
  if (rightSideEnd < 2 || leftSideStart >= n - 1) {
    return deriveTorsoEdgeInstructions(outline, { includeTop, necklineEndIdx, sideEndIdx })
  }

  let minY = Infinity, maxY = -Infinity
  for (let i = 0; i <= rightSideEnd; i++) {
    if (outline[i][1] < minY) minY = outline[i][1]
    if (outline[i][1] > maxY) maxY = outline[i][1]
  }
  const h = Math.max(1, maxY - minY)

  let crownIdx = 0, shoulderIdx = 1
  if (necklineEndIdx != null) {
    crownIdx = necklineEndIdx
    shoulderIdx = necklineEndIdx
  } else {
    let minIdx = 0
    for (let i = 1; i < rightSideEnd; i++) {
      if (outline[i][1] < outline[minIdx][1] - 1e-4) minIdx = i
    }
    // Scooped/curved neckline: center-front/back (index 0) sits deeper than the
    // high-point shoulder (minIdx > 0), so leave 0 -> minIdx free as the neck hole.
    if (minIdx > 0 && outline[0][1] > outline[minIdx][1] + 0.4) {
      crownIdx = minIdx
      shoulderIdx = minIdx
      if (minIdx + 1 < rightSideEnd - 1) {
        const p0 = outline[minIdx], p1 = outline[minIdx + 1], p2 = outline[minIdx + 2]
        const dx = p1[0] - p0[0], dy = Math.abs(p1[1] - p0[1])
        if (p1[1] <= minY + h * 0.16 && dx > dy && turnAngleDeg(p0, p1, p2) >= 26) {
          shoulderIdx = minIdx + 1
        }
      }
      if (shoulderIdx === minIdx && minIdx >= 2 && outline[minIdx][0] - outline[minIdx - 1][0] >= 2.0) {
        crownIdx = minIdx - 1
      }
    } else if (
      rightSideEnd >= 3 &&
      Math.abs(outline[0][0]) <= 2 &&
      outline[1][0] > outline[0][0] + 2 &&
      outline[2][0] > outline[1][0] + 4 &&
      Math.abs(outline[2][1] - outline[0][1]) <= h * 0.16 &&
      Math.abs(outline[1][0] + outline[n - 1][0]) < 1
    ) {
      // Leave 0 -> 1 (and n-1 -> 0) open as the neck hole; sew 1 -> 2 (and n-2 -> n-1) as shoulder seams
      crownIdx = 1
      shoulderIdx = 2
    } else {
      crownIdx = 0
      shoulderIdx = 1
    }
  }

  // Locate underarmIdx along shoulderIdx + 1 .. rightSideEnd - 1:
  // 1) Authoritative declared side seam ending at rightSideEnd (library.js, leotards, ref_b_tee).
  let underarmIdx = null
  const declaredSide = (edges || []).find((e) => e && e.seamId && e.toIdx === rightSideEnd && e.fromIdx >= shoulderIdx && e.fromIdx < rightSideEnd)
  if (declaredSide) {
    underarmIdx = declaredSide.fromIdx
  }
  // 2) If declaredSide starts right at shoulderIdx (e.g. lower body below a separate yoke),
  //    this panel sits below the armhole and has no armhole of its own.
  if (underarmIdx === shoulderIdx) {
    return deriveTorsoEdgeInstructions(outline, { includeTop, necklineEndIdx, sideEndIdx })
  }
  if (underarmIdx == null) {
    if (shoulderIdx + 1 >= rightSideEnd) {
      return deriveTorsoEdgeInstructions(outline, { includeTop, necklineEndIdx, sideEndIdx })
    }
    if (shoulderIdx + 2 === rightSideEnd) {
      underarmIdx = shoulderIdx + 1
    } else {
      const armCurve = (curves || outline.curves || []).find(
        (c) => c && c.fromIdx >= crownIdx && c.fromIdx <= shoulderIdx + 1 && c.toIdx > shoulderIdx && c.toIdx < rightSideEnd && outline[c.toIdx][1] <= minY + h * 0.6
      )
      if (armCurve) {
        underarmIdx = armCurve.toIdx
      } else {
        const cands = []
        for (let i = shoulderIdx + 1; i < rightSideEnd; i++) {
          if (outline[i][1] <= minY + h * 0.58) cands.push(i)
        }
        if (!cands.length) {
          underarmIdx = shoulderIdx + 1
        } else {
          const peak = cands.find((i) => outline[i + 1][0] <= outline[i][0] + 0.5)
          underarmIdx = peak != null ? peak : cands[cands.length - 1]
        }
      }
    }
  }

  // Mirror right-side landmarks to the left half. Unfolded fold pieces satisfy
  // mirror(i) = n - i (with 0 -> 0); full-width symmetric rectangles (e.g. 6-pt
  // subdivided rectangle) map shoulder(1)->0? Wait: on a 6-pt full rect
  // [topL(0), topR(1), underarmR(2), botR(3), botL(4), underarmL(5)],
  // leftSide is 4->5 and leftArmhole is 5->0!
  const unfoldedSymmetric = Math.abs(outline[1][0] + outline[n - 1][0]) < Math.max(1, Math.abs(outline[1][0]) * 0.2) &&
    Math.abs(outline[1][1] - outline[n - 1][1]) < 1
  let leftUnderarmIdx, leftShoulderIdx, leftCrownIdx
  if (unfoldedSymmetric) {
    leftUnderarmIdx = n - underarmIdx
    leftShoulderIdx = n - shoulderIdx
    leftCrownIdx = crownIdx === 0 ? 0 : n - crownIdx
  } else {
    // Full-width non-unfolded symmetric piece (e.g. [topL(0), topR(1), underR(2), botR(3), botL(4), underL(5)])
    leftShoulderIdx = 0
    leftCrownIdx = 0
    leftUnderarmIdx = leftSideStart + 1 < n ? leftSideStart + 1 : null
    for (let i = leftSideStart + 1; i < n; i++) {
      if (Math.abs(outline[i][1] - outline[underarmIdx][1]) < h * 0.15) { leftUnderarmIdx = i; break }
    }
    if (leftUnderarmIdx == null || leftUnderarmIdx <= leftSideStart) {
      return deriveTorsoEdgeInstructions(outline, { includeTop, necklineEndIdx, sideEndIdx })
    }
  }

  const out = []
  if (includeTop && shoulderIdx > crownIdx && unfoldedSymmetric) {
    out.push({ name: 'rightTop', from: crownIdx, to: shoulderIdx })
  }
  if (underarmIdx > shoulderIdx) out.push({ name: 'rightArmhole', from: shoulderIdx, to: underarmIdx })
  if (rightSideEnd > underarmIdx) out.push({ name: 'rightSide', from: underarmIdx, to: rightSideEnd })
  if (leftUnderarmIdx > leftSideStart) out.push({ name: 'leftSide', from: leftSideStart, to: leftUnderarmIdx })
  if (leftShoulderIdx !== leftUnderarmIdx) out.push({ name: 'leftArmhole', from: leftUnderarmIdx, to: leftShoulderIdx })
  if (includeTop && shoulderIdx > crownIdx && unfoldedSymmetric) {
    out.push({ name: 'leftTop', from: leftShoulderIdx, to: leftCrownIdx })
  }
  return out
}

// Extracts shoulder, armhole, and outer side-seam spans on a princess side panel
// (`bodice-front-side` / `bodice-back-side`), whose index 0..pEnd is the declared
// princess curve (hem -> inner shoulder) and pEnd..n-1 walks shoulder -> armhole -> side.
function derivePrincessSideExtraEdges(local, edges, curves) {
  const n = local.length
  const pEdge = edges?.[0]
  if (!pEdge || pEdge.fromIdx !== 0 || !(pEdge.toIdx > 0 && pEdge.toIdx < n - 2)) return null
  const pEnd = pEdge.toIdx
  const { minY, maxY } = bbox(local)
  const h = Math.max(1, maxY - minY)
  const hasShoulderStep = pEnd + 1 < n - 2 &&
    local[pEnd + 1][0] > local[pEnd][0] + 0.5 &&
    local[pEnd + 1][1] <= local[pEnd][1] + h * 0.08
  const shoulderTip = hasShoulderStep ? pEnd + 1 : pEnd
  if (shoulderTip + 1 >= n - 1) return null

  let underarmIdx = null
  const armCurve = (curves || local.curves || []).find(
    (c) => c && c.fromIdx === shoulderTip && c.toIdx > shoulderTip && c.toIdx < n - 1
  )
  if (armCurve) {
    underarmIdx = armCurve.toIdx
  } else {
    let bestX = -Infinity
    for (let i = shoulderTip + 1; i < n - 1; i++) {
      if (local[i][1] <= minY + h * 0.6 && local[i][0] > bestX) {
        bestX = local[i][0]
        underarmIdx = i
      }
    }
  }
  if (underarmIdx == null || underarmIdx <= shoulderTip || underarmIdx >= n - 1) return null

  const out = []
  if (shoulderTip > pEnd) out.push({ name: 'shoulder', fromIdx: pEnd, toIdx: shoulderTip })
  out.push({ name: 'armhole', fromIdx: shoulderTip, toIdx: underarmIdx })
  out.push({ name: 'outerSide', fromIdx: underarmIdx, toIdx: n - 1 })
  return out
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
  const princessSides = { front: [], back: [] }
  const sleeves = []
  const seamIdEdges = {} // seamId -> [{pieceId, fromIdx, toIdx}] — resolved into seams after the main loop

  const claimedIndices = {} // pieceId -> Set<pointIdx>
  function edgeIndexSet(outlineLen, fromIdx, toIdx) {
    const idxs = new Set()
    let i = fromIdx, guard = 0
    while (true) {
      idxs.add(i)
      if (i === toIdx) break
      i = (i + 1) % outlineLen
      if (++guard > outlineLen) break // malformed — bail rather than loop forever
    }
    return idxs
  }
  function pushEdge(pieceId, edgeName, from, to) {
    edgeInstructions.push({ pieceId, edgeName, fromIdx: from, toIdx: to })
  }
  function pushClaimedEdge(pieceId, edgeName, from, to, outlineLen) {
    pushEdge(pieceId, edgeName, from, to)
    const set = (claimedIndices[pieceId] ||= new Set())
    for (const i of edgeIndexSet(outlineLen, from, to)) set.add(i)
  }

  function pushSeamIdEdges(pieceId, edgesArr, outlineLen) {
    if (!edgesArr) return
    const claimed = claimedIndices[pieceId]
    for (const e of edgesArr) {
      if (!e || !e.seamId) continue
      if (claimed && outlineLen != null) {
        const want = edgeIndexSet(outlineLen, e.fromIdx, e.toIdx)
        let overlaps = false
        for (const i of want) { if (claimed.has(i) && i !== e.fromIdx && i !== e.toIdx) { overlaps = true; break } }
        if (overlaps) continue
      }
      pushEdge(pieceId, `seamId_${e.seamId}`, e.fromIdx, e.toIdx)
      if (outlineLen != null) { const set = (claimedIndices[pieceId] ||= new Set()); for (const i of edgeIndexSet(outlineLen, e.fromIdx, e.toIdx)) set.add(i) }
      ;(seamIdEdges[e.seamId] ||= []).push({ pieceId, fromIdx: e.fromIdx, toIdx: e.toIdx, reverse: e.reverse })
    }
  }

  const allInputPieces = payload.pieces || []
  const hasSleeves = allInputPieces.some((p) => {
    if (p.visible === false) return false
    const r = resolveSchemaRole(p.role)
    if (r) return SLEEVE_ROLES.has(r.role)
    const label = (p.label && p.label.en) || p.id
    return classifyLegacy(label) === 'sleeve'
  })

  const activePieces = allInputPieces.filter((p) => p.visible !== false)
  const hasSideGores = activePieces.some((p) => {
    const r = resolveSchemaRole(p.role)?.role
    return r === 'skirt-side-gore-left' || r === 'skirt-side-gore-right'
  })
  const frontGores = activePieces.filter((p) => resolveSchemaRole(p.role)?.role === 'skirt-front-gore')
  const backGores = activePieces.filter((p) => resolveSchemaRole(p.role)?.role === 'skirt-back-gore')
  const pairGoresAsHipPanels = !hasSideGores &&
    frontGores.length === 1 && backGores.length === 1 &&
    Boolean(frontGores[0].cutOnFold) && Boolean(backGores[0].cutOnFold) &&
    !frontGores[0].edges?.length && !backGores[0].edges?.length

  for (const p of allInputPieces) {
    const label = (p.label && p.label.en) || p.id
    const resolved = resolveSchemaRole(p.role)

    if (!resolved) {
      // ---------- CLASSIFY_LEGACY path (unchanged from pre-WP-6, plus WP-49's explicit-zone correction) ----------
      const cls = applyBodyZoneOverride(classifyLegacy(label), p.bodyZone)
      if (cls && typeof cls === 'object') { skipped.push({ label, reason: cls.reason }); continue }
      const local = relocalize(p.outline)

      if (cls === 'sleeve') { sleeves.push({ id: p.id, label: p.label || label, labelEn: label, outline: local, color: p.color, bilateral: true, darts: p.darts }); continue }

      const slotKey = { 'bodice-front': 'frontPanel', 'bodice-back': 'backPanel', 'skirt-front': 'hipPanelFront', 'skirt-back': 'hipPanelBack' }[cls]
      const isSkirt = cls.startsWith('skirt')
      const fold = isFoldPiece(local)
      const armholeLocal = hasSleeves && !isSkirt
        ? (fold ? subdivideFoldBodiceArmhole(local) : subdivideFullRectBodiceArmhole(local))
        : local
      const baseLocal = fold && !isSkirt ? subdivideFoldBodiceNeckOpening(armholeLocal) : armholeLocal
      const outline = fold ? unfoldPiece(baseLocal) : baseLocal
      rawPieces.push({ id: p.id, label: p.label, outline, color: p.color, darts: p.darts })
      roles[p.id] = slotKey
      {
        const geo = hasSleeves && !isSkirt
          ? deriveSleevedTorsoEdges(outline, { includeTop: true, curves: p.curves || p.outline?.curves })
          : deriveTorsoEdgeInstructions(outline, { includeTop: !isSkirt })
        if (geo.some((e) => e.name === 'rightSide') && geo.some((e) => e.name === 'leftSide')) {
          bySlot[slotKey].push({ id: p.id, label })
          for (const e of geo) pushClaimedEdge(p.id, e.name, e.from, e.to, outline.length)
        }
      }
      recognized.push({ id: p.id, label })
      continue
    }

    // ---------- WP-6 metadata path: thin structural validation, trust the declared role ----------
    const { role: schemaRole } = resolved
    const declaredPlacement = pairGoresAsHipPanels && schemaRole === 'skirt-front-gore'
      ? 'hipPanelFront'
      : pairGoresAsHipPanels && schemaRole === 'skirt-back-gore'
        ? 'hipPanelBack'
        : resolved.placement
    const cutOnFold = p.cutOnFold ?? resolved.cutOnFold
    const bilateral = p.bilateral ?? resolved.bilateral
    const edges = p.edges
    const necklineEndIdx = p.necklineEndIdx
    const sideEndIdx = p.sideEndIdx
    const autoTorsoSeams = p.autoTorsoSeams !== false
    const princessSeamId = p.princessSeamId
    const local = relocalize(p.outline)

    const ZONE_FLIP = { frontPanel: 'hipPanelFront', backPanel: 'hipPanelBack', hipPanelFront: 'frontPanel', hipPanelBack: 'backPanel' }
    const placement = (p.bodyZone && p.bodyZone !== resolved.zone && ZONE_FLIP[declaredPlacement])
      ? ZONE_FLIP[declaredPlacement]
      : declaredPlacement

    if (SLEEVE_ROLES.has(schemaRole)) {
      sleeves.push({ id: p.id, label: p.label || label, labelEn: label, outline: cutOnFold ? unfoldPiece(local) : local, color: p.color, bilateral: bilateral !== false && !cutOnFold, darts: p.darts })
      continue
    }

    if (!pairGoresAsHipPanels && (schemaRole === 'skirt-front-gore' || schemaRole === 'skirt-back-gore' || schemaRole === 'skirt-side-gore-left' || schemaRole === 'skirt-side-gore-right')) {
      const internalRole = { 'skirt-front-gore': 'goreFront', 'skirt-back-gore': 'goreBack', 'skirt-side-gore-left': 'goreSideLeft', 'skirt-side-gore-right': 'goreSideRight' }[schemaRole]
      const outline = cutOnFold ? unfoldPiece(local) : local
      const copies = bilateral && !cutOnFold ? [
        { id: p.id + '_r', outline }, { id: p.id + '_l', outline: mirrorOutline(outline) },
      ] : [{ id: p.id, outline }]
      for (const copy of copies) {
        rawPieces.push({ id: copy.id, label: p.label, outline: copy.outline, color: p.color, darts: p.darts })
        roles[copy.id] = internalRole
        const copyEdges = copy.id.endsWith('_l') && bilateral && !cutOnFold && edges ? mirrorEdgeIndices(edges, local.length) : edges
        const tagged = bilateral && !cutOnFold ? copyEdges?.map(e => ({ ...e, seamId: e.seamId ? e.seamId + (copy.id.endsWith('_r') ? '_R' : '_L') : e.seamId })) : copyEdges
        pushSeamIdEdges(copy.id, tagged, copy.outline.length)
        recognized.push({ id: copy.id, label })
      }
      continue
    }

    if (cutOnFold) {
      const isUpperPanel = placement === 'frontPanel' || placement === 'backPanel'
      const canSubdivideArmhole = isUpperPanel && !princessSeamId && !edges?.length && necklineEndIdx == null && sideEndIdx == null
      const armholeLocal = canSubdivideArmhole && hasSleeves ? subdivideFoldBodiceArmhole(local) : local
      const canSubdivideNeck = isUpperPanel && !princessSeamId && necklineEndIdx == null && sideEndIdx == null &&
        (!edges?.length || edges.every((e) => e && e.fromIdx >= 1 && e.toIdx >= 1))
      const baseLocal = canSubdivideNeck ? subdivideFoldBodiceNeckOpening(armholeLocal) : armholeLocal
      const neckAdded = baseLocal.length - armholeLocal.length
      const adjEdges = neckAdded > 0 && edges?.length
        ? edges.map((e) => ({ ...e, fromIdx: e.fromIdx + neckAdded, toIdx: e.toIdx + neckAdded }))
        : edges
      const outline = unfoldPiece(baseLocal)
      rawPieces.push({ id: p.id, label: p.label, outline, color: p.color, darts: p.darts })
      roles[p.id] = placement
      if (princessSeamId) {
        const [right, left] = deriveTorsoEdgeInstructions(outline, { includeTop: false, necklineEndIdx })
        pushClaimedEdge(p.id, right.name, right.from, right.to, outline.length)
        pushClaimedEdge(p.id, left.name, left.from, left.to, outline.length)
        ;(seamIdEdges[princessSeamId + '_R'] ||= []).push({ pieceId: p.id, fromIdx: right.from, toIdx: right.to })
        ;(seamIdEdges[princessSeamId + '_L'] ||= []).push({ pieceId: p.id, fromIdx: left.from, toIdx: left.to })
        pushSeamIdEdges(p.id, adjEdges, outline.length)
      } else {
        if (autoTorsoSeams && (placement === 'frontPanel' || placement === 'backPanel' || placement === 'hipPanelFront' || placement === 'hipPanelBack')) {
          const authoredTop = necklineEndIdx != null && adjEdges?.some(e => e.seamId && e.fromIdx === 0 && e.toIdx === necklineEndIdx)
          const authoredSides = adjEdges?.filter(e => e.seamId && /Side_[RL]$/.test(e.seamId)).length >= 2
          const geo = hasSleeves && isUpperPanel
            ? deriveSleevedTorsoEdges(outline, { includeTop: !authoredTop, necklineEndIdx, sideEndIdx, edges: adjEdges, curves: p.curves || p.outline?.curves })
            : deriveTorsoEdgeInstructions(outline, { includeTop: !authoredTop && isUpperPanel, necklineEndIdx, sideEndIdx })
          if (!authoredSides && geo.some((e) => e.name === 'rightSide') && geo.some((e) => e.name === 'leftSide')) {
            bySlot[placement].push({ id: p.id, label })
            for (const e of geo) pushClaimedEdge(p.id, e.name, e.from, e.to, outline.length)
          }
        }
        pushSeamIdEdges(p.id, adjEdges, outline.length)
      }
      recognized.push({ id: p.id, label })
      continue
    }

    if (bilateral) {
      const rId = p.id + '_r', lId = p.id + '_l'
      const n = local.length
      rawPieces.push({ id: rId, label: p.label, outline: local, color: p.color, darts: p.darts })
      rawPieces.push({ id: lId, label: p.label, outline: mirrorOutline(local), color: p.color, darts: (p.darts || []).map(d => d.map(([x, y]) => [-x, y])) })
      roles[rId] = placement
      roles[lId] = placement
      if (edges && edges.length && !UNSEAMED_BILATERAL_ROLES.has(schemaRole)) {
        const mirrored = mirrorEdgeIndices(edges, n)
        edges.forEach((e, i) => {
          const edgeName = `seam${i}`
          pushClaimedEdge(rId, edgeName, e.fromIdx, e.toIdx, n)
          pushClaimedEdge(lId, edgeName, mirrored[i].fromIdx, mirrored[i].toIdx, n)
          if (e.mirrorSelf) {
            seamInstructions.push({ id: `${p.id}_mirror${i}`, a: { piece: rId, edge: edgeName }, b: { piece: lId, edge: edgeName }, reverse: true })
          } else if (e.seamId) {
            ;(seamIdEdges[e.seamId + '_R'] ||= []).push({ pieceId: rId, fromIdx: e.fromIdx, toIdx: e.toIdx, reverse: e.reverse })
            ;(seamIdEdges[e.seamId + '_L'] ||= []).push({ pieceId: lId, fromIdx: mirrored[i].fromIdx, toIdx: mirrored[i].toIdx, reverse: e.reverse })
          }
        })
      }
      if (schemaRole === 'bodice-front-side' || schemaRole === 'bodice-back-side') {
        const extra = derivePrincessSideExtraEdges(local, edges, p.curves || p.outline?.curves)
        if (extra) {
          const mirroredExtra = mirrorEdgeIndices(extra, n)
          extra.forEach((e, idx) => {
            const claimedR = claimedIndices[rId]
            const wantR = edgeIndexSet(n, e.fromIdx, e.toIdx)
            let overlaps = false
            if (claimedR) for (const k of wantR) if (claimedR.has(k) && k !== e.fromIdx && k !== e.toIdx) { overlaps = true; break }
            if (!overlaps) {
              pushClaimedEdge(rId, e.name, e.fromIdx, e.toIdx, n)
              pushClaimedEdge(lId, e.name, mirroredExtra[idx].fromIdx, mirroredExtra[idx].toIdx, n)
            }
          })
          princessSides[schemaRole === 'bodice-front-side' ? 'front' : 'back'].push({ rId, lId })
        }
      }
      recognized.push({ id: rId, label: label + ' (R)' })
      recognized.push({ id: lId, label: label + ' (L)' })
      continue
    }

    // Plain single piece — front-panel/back-panel/hip-panel-* not on fold, or attach-only role.
    const isUpperSingle = placement === 'frontPanel' || placement === 'backPanel'
    const singleOutline = hasSleeves && isUpperSingle && !edges?.length
      ? subdivideFullRectBodiceArmhole(local)
      : local
    rawPieces.push({ id: p.id, label: p.label, outline: singleOutline, color: p.color, darts: p.darts })
    roles[p.id] = placement
    if (autoTorsoSeams && (placement === 'frontPanel' || placement === 'backPanel' || placement === 'hipPanelFront' || placement === 'hipPanelBack')) {
      const geo = hasSleeves && isUpperSingle
        ? deriveSleevedTorsoEdges(singleOutline, { includeTop: true, edges, curves: p.curves || p.outline?.curves })
        : deriveTorsoEdgeInstructions(singleOutline, { includeTop: isUpperSingle })
      if (geo.some((e) => e.name === 'rightSide') && geo.some((e) => e.name === 'leftSide')) {
        bySlot[placement].push({ id: p.id, label })
        for (const e of geo) pushClaimedEdge(p.id, e.name, e.from, e.to, singleOutline.length)
      }
    }
    pushSeamIdEdges(p.id, edges, singleOutline.length)
    recognized.push({ id: p.id, label })
  }

  // Sleeves (both paths converge here): decompose into capFront + capBack +
  // backSeam + frontSeam (leaving the bottom cuff edge completely free/open for
  // the arm), duplicate+mirror into R/L, weld frontSeam <-> backSeam into a
  // cylinder, and sew capFront -> Front Bodice armhole & capBack -> Back Bodice armhole!
  const sleevePairs = []
  for (const s of sleeves) {
    const prepared = prepareRightSleeve(s.outline)
    const rOutline = prepared.outline
    const rEdges = prepared.edges
    const lEdges = rEdges ? mirrorEdgeIndices(rEdges.map((e) => ({ name: e.name, fromIdx: e.from, toIdx: e.to })), rOutline.length) : null
    const copies = s.bilateral === false
      ? [{ id: s.id, outline: rOutline, edges: rEdges, suffix: '', darts: s.darts }]
      : [
          { id: s.id + '_r', outline: rOutline, edges: rEdges, suffix: ' (R)', darts: s.darts },
          {
            id: s.id + '_l',
            outline: mirrorOutline(rOutline),
            edges: lEdges ? lEdges.map((e) => ({ name: e.name, from: e.fromIdx, to: e.toIdx })) : null,
            suffix: ' (L)',
            darts: (s.darts || []).map((d) => d.map(([x, y]) => [-x, y])),
          },
        ]
    for (const copy of copies) {
      rawPieces.push({ id: copy.id, label: s.label, outline: copy.outline, color: s.color, darts: copy.darts })
      roles[copy.id] = 'sleeve'
      if (copy.edges) {
        for (const e of copy.edges) pushClaimedEdge(copy.id, e.name, e.from, e.to, copy.outline.length)
        seamInstructions.push({ id: copy.id + '_tube', a: { piece: copy.id, edge: 'frontSeam' }, b: { piece: copy.id, edge: 'backSeam' }, reverse: true })
      }
      recognized.push({ id: copy.id, label: (s.labelEn || s.id) + copy.suffix })
    }
    if (rEdges) {
      sleevePairs.push({
        rightId: copies[0].id,
        leftId: copies[1]?.id || null,
      })
    }
  }

  // Front/back torso & hip seams (both paths converge here)
  const hasEdge = (id, name) => edgeInstructions.some((e) => e.pieceId === id && e.edgeName === name)
  const getEdgeSpanX = (id, name) => {
    const e = edgeInstructions.find((inst) => inst.pieceId === id && inst.edgeName === name)
    const piece = rawPieces.find((p) => p.id === id)
    if (!e || !piece?.outline?.length) return 0
    const a = piece.outline[e.fromIdx], b = piece.outline[e.toIdx]
    return a && b ? Math.abs(b[0] - a[0]) : 0
  }
  for (const [frontKey, backKey, includeTop] of [['frontPanel', 'backPanel', true], ['hipPanelFront', 'hipPanelBack', false]]) {
    if (bySlot[frontKey].length === 1 && bySlot[backKey].length === 1) {
      const f = bySlot[frontKey][0].id, b = bySlot[backKey][0].id
      if (includeTop && [f, b].every((id) => hasEdge(id, 'rightTop') && hasEdge(id, 'leftTop'))) {
        const fSpan = getEdgeSpanX(f, 'rightTop'), bSpan = getEdgeSpanX(b, 'rightTop')
        const spanRatio = Math.max(fSpan, bSpan) / Math.max(1e-6, Math.min(fSpan, bSpan))
        if (spanRatio <= 2.2) {
          seamInstructions.push({ id: frontKey + '_rightTop', a: { piece: f, edge: 'rightTop' }, b: { piece: b, edge: 'rightTop' }, reverse: false })
          seamInstructions.push({ id: frontKey + '_leftTop', a: { piece: f, edge: 'leftTop' }, b: { piece: b, edge: 'leftTop' }, reverse: false })
        }
      }
      seamInstructions.push({ id: frontKey + '_rightSide', a: { piece: f, edge: 'rightSide' }, b: { piece: b, edge: 'rightSide' }, reverse: false })
      seamInstructions.push({ id: frontKey + '_leftSide', a: { piece: f, edge: 'leftSide' }, b: { piece: b, edge: 'leftSide' }, reverse: false })
    }
  }

  // Princess side-panel outer-side & shoulder seams (frontSide <-> backSide)
  if (princessSides.front.length === 1 && princessSides.back.length === 1) {
    const fs = princessSides.front[0], bs = princessSides.back[0]
    for (const [sideTag, fId, bId] of [['R', fs.rId, bs.rId], ['L', fs.lId, bs.lId]]) {
      if (hasEdge(fId, 'shoulder') && hasEdge(bId, 'shoulder')) {
        seamInstructions.push({ id: `princessSide_shoulder_${sideTag}`, a: { piece: fId, edge: 'shoulder' }, b: { piece: bId, edge: 'shoulder' }, reverse: false })
      }
      if (hasEdge(fId, 'outerSide') && hasEdge(bId, 'outerSide')) {
        seamInstructions.push({ id: `princessSide_outerSide_${sideTag}`, a: { piece: fId, edge: 'outerSide' }, b: { piece: bId, edge: 'outerSide' }, reverse: false })
      }
    }
  }

  // Automatic Sleeve Cap -> Front & Back Bodice Armhole seams!
  if (sleevePairs.length >= 1) {
    const primarySleeve = sleevePairs[0]
    let armTargets = null
    if (bySlot.frontPanel.length === 1 && bySlot.backPanel.length === 1) {
      const f = bySlot.frontPanel[0].id, b = bySlot.backPanel[0].id
      if (hasEdge(f, 'rightArmhole') && hasEdge(b, 'rightArmhole')) {
        armTargets = {
          rightFront: { piece: f, edge: 'rightArmhole' },
          rightBack: { piece: b, edge: 'rightArmhole' },
          leftFront: hasEdge(f, 'leftArmhole') ? { piece: f, edge: 'leftArmhole' } : null,
          leftBack: hasEdge(b, 'leftArmhole') ? { piece: b, edge: 'leftArmhole' } : null,
        }
      }
    } else if (princessSides.front.length === 1 && princessSides.back.length === 1) {
      const fs = princessSides.front[0], bs = princessSides.back[0]
      if (hasEdge(fs.rId, 'armhole') && hasEdge(bs.rId, 'armhole')) {
        armTargets = {
          rightFront: { piece: fs.rId, edge: 'armhole' },
          rightBack: { piece: bs.rId, edge: 'armhole' },
          leftFront: hasEdge(fs.lId, 'armhole') ? { piece: fs.lId, edge: 'armhole' } : null,
          leftBack: hasEdge(bs.lId, 'armhole') ? { piece: bs.lId, edge: 'armhole' } : null,
        }
      }
    }
    if (armTargets) {
      seamInstructions.push(
        { id: `${primarySleeve.rightId}_capFront`, a: armTargets.rightFront, b: { piece: primarySleeve.rightId, edge: 'capFront' }, reverse: true },
        { id: `${primarySleeve.rightId}_capBack`, a: armTargets.rightBack, b: { piece: primarySleeve.rightId, edge: 'capBack' }, reverse: false },
      )
      if (primarySleeve.leftId && armTargets.leftFront && armTargets.leftBack) {
        seamInstructions.push(
          { id: `${primarySleeve.leftId}_capFront`, a: armTargets.leftFront, b: { piece: primarySleeve.leftId, edge: 'capFront' }, reverse: true },
          { id: `${primarySleeve.leftId}_capBack`, a: armTargets.leftBack, b: { piece: primarySleeve.leftId, edge: 'capBack' }, reverse: false },
        )
      }
    }
  }

  // WP-6 seamId-tagged edges (princess seams, and any future declared-edge role)
  let seamIdCounter = 0
  for (const [seamId, contributors] of Object.entries(seamIdEdges)) {
    if (contributors.length !== 2) continue
    const [a, b] = contributors
    const aEdgeName = edgeInstructions.find((e) => e.pieceId === a.pieceId && e.fromIdx === a.fromIdx && e.toIdx === a.toIdx)?.edgeName
    const bEdgeName = edgeInstructions.find((e) => e.pieceId === b.pieceId && e.fromIdx === b.fromIdx && e.toIdx === b.toIdx)?.edgeName
    if (!aEdgeName || !bEdgeName) continue
    const aReverse = typeof a.reverse === 'boolean' ? a.reverse : undefined
    const bReverse = typeof b.reverse === 'boolean' ? b.reverse : undefined
    if (aReverse !== undefined && bReverse !== undefined && aReverse !== bReverse) continue
    seamInstructions.push({ id: `seamId_${seamIdCounter++}_${seamId}`, a: { piece: a.pieceId, edge: aEdgeName }, b: { piece: b.pieceId, edge: bEdgeName }, reverse: aReverse ?? bReverse ?? true })
  }

  const fabricId = FABRIC_NAME_TO_ID.has(payload.fabricId) ? payload.fabricId : null

  // Same-slot siblings (bySlot already collects every recognized piece for
  // each of the 4 torso/hip roles, from every path above — classifyLegacy,
  // plain WP-6 single pieces, and cutOnFold non-princess pieces all push
  // into it): when a slot has more than one member, tag each with its
  // {index, count} so placement.js's placePiece can spread them apart
  // instead of stacking every "front" piece at the exact same spot. A
  // slot with exactly one member gets no hint at all (undefined), so
  // ordinary single-front/single-back patterns place exactly as before.
  const placementHints = {}
  for (const members of Object.values(bySlot)) {
    if (members.length > 1) members.forEach((m, i) => { placementHints[m.id] = { index: i, count: members.length } })
  }

  return { rawPieces, roles, edgeInstructions, seamInstructions, recognized, skipped, fabricId, placementHints }
}
