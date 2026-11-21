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
import { FABRIC_IDS } from '../cloth/fabricPresets.js'
import { computeBodyDims } from '../body/computeBodyDims.js'
import { placePiece } from './placement.js'

// ---------- CLASSIFY_LEGACY: role classification (mirrors js/app.js's classifyPart) ----------

const IGNORE_RE = /waistband|collar|cuff|sash|tie|gusset|facing|pocket|lining|\bband\b/i
const SLEEVE_EXCLUDE_RE = /sleeveless|بدون\s*أكمام|بلا\s*أكمام|كمر|محكم|كمثر|مكتمل/i
const NON_SLEEVE_PART_RE = /\b(front|back|bodice|dress|blouse|shirt|t-shirt|tee|top|tunic|vest|jacket|coat|skirt|trouser|pant|shorts|hem\s*band|binding|cuff|placket|facing|collar|yoke|pocket|lining)\b|مقدمة|خلفية|صدرية|فستان|بلوزة|قميص|توب|صديري|فانلة|تنورة|تحبيك|شريط|بطانة|ياقة/i
const EXPLICIT_SLEEVE_TAIL_RE = /\bsleeve(?:\s+(?:upper|under|front|back|panel|cap|top))?s?\s*$/i
const AR_SLEEVE_LEAD_RE = /^[\s\-_/]*(?:كم|الكم)(?=$|[\s\-_/])/
const SKIRT_RE = /skirt|تنور/i
const TROUSERS_RE = /trouser|بنطل|pant|\bleg\s*(?:panel|front|back|seam)|\bleg\b(?!\s*opening)/i
const FRONT_RE = /front|أمام/i
const BACK_RE = /back|خلف/i

function isSleeveLabel(labelEn = '', labelAr = '') {
  const combined = `${labelEn} ${labelAr}`.trim()
  if (!combined || SLEEVE_EXCLUDE_RE.test(combined)) return false
  if (/\b(?:hem\s*band|binding|cuff|placket|facing)\b|تحبيك|شريط|أسورة/i.test(combined)) return false
  const enTrim = String(labelEn || '').trim()
  const arTrim = String(labelAr || '').trim()
  if (EXPLICIT_SLEEVE_TAIL_RE.test(enTrim) || AR_SLEEVE_LEAD_RE.test(arTrim) || AR_SLEEVE_LEAD_RE.test(enTrim)) return true
  if (NON_SLEEVE_PART_RE.test(combined)) return false
  return /\bsleeves?\b/i.test(combined) || /(?:^|[\s\-_/])(?:كم|الكم)(?=$|[\s\-_/])/.test(combined)
}

// Returns one of: 'sleeve' | 'bodice-front' | 'bodice-back' | 'skirt-front' |
// 'skirt-back' | {ignore:true} | {unrecognized:true} — never guesses front
// vs back when neither name pattern matches.
function classifyLegacy(labelEn, labelAr = '') {
  const name = (labelEn || '').toLowerCase()
  if (IGNORE_RE.test(name)) return { ignore: true, reason: 'accessory piece (no 3D placement for it yet)' }
  if (isSleeveLabel(labelEn, labelAr)) return 'sleeve'
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
  let src = outline
  if (
    outline.length >= 4 &&
    Math.abs(outline[0][0]) < 1e-3 &&
    Math.abs(outline[1][0]) < 1e-3 &&
    Math.abs(outline[outline.length - 1][0]) > 0.05
  ) {
    src = [outline[1], ...outline.slice(2), outline[0]]
  }
  const n = src.length
  const interior = src.slice(1, n - 1)
  const mirrored = interior.slice().reverse().map(([x, y]) => [-x, y])
  return src.concat(mirrored)
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
    const botTol = Math.max(2.5, h * 0.12)
    let cands = []
    for (let i = 0; i < p.length; i++) {
      if (maxY - p[i][1] <= botTol) cands.push(i)
    }
    if (cands.length < 2) {
      cands = []
      for (let i = 0; i < p.length; i++) {
        if ((p[i][1] - minY) / h >= 0.75) cands.push(i)
      }
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
  const capMaxY = pair.minY + pair.h * 0.48
  let underarmFrontPos = 1, minFrontX = Infinity
  for (let j = 1; j < capPos; j++) {
    if (pts[upperArc[j]][1] > capMaxY) continue
    const x = pts[upperArc[j]][0]
    if (x < minFrontX - 1e-4) { minFrontX = x; underarmFrontPos = j }
  }
  let underarmBackPos = mFinal - 2, maxBackX = -Infinity
  for (let j = capPos + 1; j <= mFinal - 2; j++) {
    if (pts[upperArc[j]][1] > capMaxY) continue
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

// Extracts frontSeam, backSeam, and full armscye cap edges on a 2-piece sleeve panel:
// - `sleeve-upper`: capFront (underarmFront -> capTop) + capBack (capTop -> underarmBack)
// - `sleeve-under`: capUnderFront (underarmFront -> axillaMid) + capUnderBack (axillaMid -> underarmBack)
function prepareTwoPieceSleevePanel(rawOutline, schemaRole = 'sleeve-under') {
  let pts = dedupeConsecutive(rawOutline)
  if (pts.length < 4) return { outline: rawOutline, edges: null }
  if (signedArea2(pts) < 0) pts = pts.slice().reverse()

  function findCuffAndArc(p) {
    const { minX, minY, maxX, maxY } = bbox(p)
    const w = Math.max(1e-6, maxX - minX), h = Math.max(1e-6, maxY - minY)
    const botTol = Math.max(2.5, h * 0.12)
    let cands = []
    for (let i = 0; i < p.length; i++) {
      if (maxY - p[i][1] <= botTol) cands.push(i)
    }
    if (cands.length < 2) {
      cands = []
      for (let i = 0; i < p.length; i++) {
        if ((p[i][1] - minY) / h >= 0.72) cands.push(i)
      }
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
    const upperArc = []
    let cur = cuffFront, guard = 0
    while (true) {
      upperArc.push(cur)
      if (cur === cuffBack) break
      cur = (cur + 1) % p.length
      if (++guard > p.length) return null
    }
    return { cuffFront, cuffBack, upperArc, minX, minY, w, h }
  }

  let info = findCuffAndArc(pts)
  if (!info || info.upperArc.length < 4) return { outline: pts, edges: null }
  if (info.upperArc.length === 4) {
    const u0 = info.upperArc[1], u1 = info.upperArc[2]
    const mid = [(pts[u0][0] + pts[u1][0]) / 2, (pts[u0][1] + pts[u1][1]) / 2]
    const next = pts.slice()
    next.splice(u0 + 1, 0, mid)
    pts = next
    info = findCuffAndArc(pts)
    if (!info || info.upperArc.length < 5) return { outline: pts, edges: null }
  }

  const { cuffFront, cuffBack, upperArc, h } = info
  const m = upperArc.length
  const underarmFront = upperArc[1]
  const underarmBack = upperArc[m - 2]
  if (underarmFront === underarmBack) return { outline: pts, edges: null }

  if (schemaRole === 'sleeve-upper') {
    const midTargetX = (pts[underarmFront][0] + pts[underarmBack][0]) / 2
    let topY = Infinity
    for (let j = 1; j <= m - 2; j++) if (pts[upperArc[j]][1] < topY) topY = pts[upperArc[j]][1]
    const tolY = Math.max(0.05, h * 0.006)
    let capPos = Math.floor(m / 2), bestDX = Infinity
    for (let j = 2; j <= m - 3; j++) {
      const [px, py] = pts[upperArc[j]]
      if (py <= topY + tolY) {
        const dx = Math.abs(px - midTargetX)
        if (dx < bestDX) { bestDX = dx; capPos = j }
      }
    }
    const capTop = upperArc[capPos]
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

  // `sleeve-under`: split top underarm arch cleanly at its horizontal midpoint so front
  // half connects to lower front armhole and back half connects to lower back armhole.
  const midTargetX = (pts[underarmFront][0] + pts[underarmBack][0]) / 2
  let midPos = Math.floor(m / 2), bestDX = Infinity
  for (let j = 2; j <= m - 3; j++) {
    const dx = Math.abs(pts[upperArc[j]][0] - midTargetX)
    if (dx < bestDX) { bestDX = dx; midPos = j }
  }
  const axillaMid = upperArc[midPos]
  return {
    outline: pts,
    edges: [
      { name: 'capUnderFront', from: underarmFront, to: axillaMid },
      { name: 'capUnderBack', from: axillaMid, to: underarmBack },
      { name: 'backSeam', from: underarmBack, to: cuffBack },
      { name: 'frontSeam', from: cuffFront, to: underarmFront },
    ],
  }
}

// Subdivides a 4-point cut-on-fold bodice half (e.g. girls_dress or a user-drawn
// rectangle/trapezoid [[0,0],[w,1],[w,len],[0,len]]) with an exact collinear
// underarm vertex on its outer edge so armhole and side-seam can split cleanly.
// Also handles 5-point cut-on-fold robes (e.g. thobe) whose outer point sits at
// full waist/backLen depth so the armhole stops ~22cm below the shoulder.
function subdivideFoldBodiceArmhole(local) {
  if (local.length === 4) {
    const shoulder = local[1], hem = local[2]
    const segH = hem[1] - shoulder[1]
    if (segH <= 4) return local
    const t = Math.min(0.48, Math.max(0.18, 18 / segH))
    const underarm = [shoulder[0] + (hem[0] - shoulder[0]) * t, shoulder[1] + segH * t]
    return [local[0], shoulder, underarm, hem, local[3]]
  }
  if (local.length === 5 && local[1][1] <= 4 && local[2][1] - local[1][1] > 28 && local[1][0] >= 10) {
    const p1 = local[1], p2 = local[2]
    const dy = p2[1] - p1[1]
    const t = Math.min(0.48, 22 / dy)
    const underarm = [p1[0] + (p2[0] - p1[0]) * t, p1[1] + dy * t]
    return [local[0], p1, underarm, p2, local[3], local[4]]
  }
  return local
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

  // Unfolded curved skirt / hip panels (`womens_dress` skirt_front/back, ballet skirts):
  // isolate the true side seam from the outer waist corner down to the outer hem corner
  // so curved waist or hem contours are never absorbed into side seams.
  if (!includeTop && necklineEndIdx == null && sideEndIdx == null && n >= 8 && Math.abs(outline[0][0]) < 1e-3 && Math.abs(outline[half][0]) < 1e-3) {
    let sMinY = Infinity, sMaxY = -Infinity
    for (let i = 0; i <= half; i++) {
      if (outline[i][1] < sMinY) sMinY = outline[i][1]
      if (outline[i][1] > sMaxY) sMaxY = outline[i][1]
    }
    const spanH = Math.max(1, sMaxY - sMinY)
    let topCorner = 1, bestTopX = -Infinity
    for (let i = 1; i <= Math.max(1, half - 2); i++) {
      if (outline[i][1] <= sMinY + spanH * 0.20 && outline[i][0] > bestTopX) {
        bestTopX = outline[i][0]
        topCorner = i
      }
    }
    let botCorner = rightHemIdx
    for (let i = topCorner + 1; i <= half - 1; i++) {
      if (outline[i][1] >= sMaxY - spanH * 0.08) {
        botCorner = i
        break
      }
    }
    if (botCorner > topCorner && n - topCorner > n - botCorner) {
      return [
        { name: 'rightSide', from: topCorner, to: botCorner },
        { name: 'leftSide', from: n - botCorner, to: n - topCorner },
      ]
    }
  }

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
          const subdividedRobeUnderarm = peak == null && cands.length >= 2 &&
            outline[cands[0]][1] - outline[shoulderIdx][1] >= 12 &&
            outline[cands[0]][1] - outline[shoulderIdx][1] <= 26 &&
            outline[cands[1]][1] - outline[shoulderIdx][1] > 32
          underarmIdx = peak != null ? peak : (subdividedRobeUnderarm ? cands[0] : cands[cands.length - 1])
        }
      }
    }
  }

  // Split smooth shoulder+armhole Bezier curves (e.g. library.js plainBodicePanel)
  // at the outer shoulder crest so shoulder seams form and armhole length matches sleeves.
  if (
    shoulderIdx === crownIdx && necklineEndIdx == null && underarmIdx - shoulderIdx >= 5 &&
    outline[underarmIdx][1] - outline[shoulderIdx][1] >= 8 &&
    outline[shoulderIdx + 2][1] - outline[shoulderIdx][1] <= 4.5 &&
    outline[shoulderIdx + 2][0] - outline[shoulderIdx][0] >= 5 &&
    outline[shoulderIdx + 2][0] < outline[underarmIdx][0] - 4 &&
    !edges?.some((e) => e && e.seamId && e.fromIdx >= shoulderIdx && e.toIdx <= shoulderIdx + 2)
  ) {
    shoulderIdx = shoulderIdx + 2
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

function deriveGoreSideEdges(outline) {
  const n = outline.length
  if (n < 4) return null
  const { minY, maxY } = bbox(outline)
  const h = Math.max(1e-4, maxY - minY)
  const topTol = minY + h * 0.10
  const botTol = maxY - h * 0.10
  let rTop = -1, rTopX = -Infinity
  let rBot = -1, rBotX = -Infinity
  let lBot = -1, lBotX = Infinity
  let lTop = -1, lTopX = Infinity
  for (let i = 0; i < n; i++) {
    const [x, y] = outline[i]
    if (y <= topTol) {
      if (x > rTopX) { rTopX = x; rTop = i }
      if (x < lTopX) { lTopX = x; lTop = i }
    }
    if (y >= botTol) {
      if (x > rBotX) { rBotX = x; rBot = i }
      if (x < lBotX) { lBotX = x; lBot = i }
    }
  }
  if (rTop < 0 || rBot < 0 || lBot < 0 || lTop < 0) return null
  if (new Set([rTop, rBot, lBot, lTop]).size !== 4) return null
  const stepsR = (rBot - rTop + n) % n
  const stepsL = (lTop - lBot + n) % n
  if (stepsR < 1 || stepsL < 1 || stepsR + stepsL > n - 2) return null
  return [
    { name: 'goreRight', from: rTop, to: rBot },
    { name: 'goreLeft', from: lBot, to: lTop },
  ]
}

function edgeArcLen(outline, fromIdx, toIdx) {
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

function deriveSportBraSideEdges(outline) {
  const n = outline.length
  const half = Math.floor(n / 2)
  if (n < 6) return []
  let rightHemIdx = 1, rightHemY = -Infinity
  for (let i = 1; i <= half; i++) if (outline[i][1] > rightHemY) { rightHemY = outline[i][1]; rightHemIdx = i }
  let leftHemIdx = half + 1, leftHemY = -Infinity
  for (let i = half + 1; i < n; i++) if (outline[i][1] > leftHemY) { leftHemY = outline[i][1]; leftHemIdx = i }
  let underarmIdx = -1, bestX = -Infinity
  for (let i = 1; i < rightHemIdx; i++) {
    if (outline[i][0] > bestX) { bestX = outline[i][0]; underarmIdx = i }
  }
  if (underarmIdx <= 0 || underarmIdx >= rightHemIdx) return []
  const leftUnderarmIdx = n - underarmIdx
  if (leftUnderarmIdx <= leftHemIdx) return []
  return [
    { name: 'rightSide', from: underarmIdx, to: rightHemIdx },
    { name: 'leftSide', from: leftHemIdx, to: leftUnderarmIdx },
  ]
}

// Inserts sorted fractional intermediate vertices `tList` in `(0, 1)` along
// segment `segStart -> (segStart + 1) % pts.length` and shifts authored edge
// indices strictly beyond `segStart` (including pre-unfolded `>= pts.length` indices).
function insertSegmentSubdivisions(pts, edges, segStart, tList) {
  const n = pts.length
  if (!n || segStart < 0 || segStart >= n || !tList.length) return { outline: pts, edges }
  const nextIdx = (segStart + 1) % n
  const a = pts[segStart], b = pts[nextIdx]
  const inserted = tList.map((t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  const outline = [...pts.slice(0, segStart + 1), ...inserted, ...pts.slice(segStart + 1)]
  const add = inserted.length
  const preUnfoldLen = 2 * (n - 1)
  const shiftIdx = (idx) => {
    if (idx <= segStart) return idx
    if (idx < n) return idx + add
    // Pre-unfolded mirrored index `U - k` shifts by +add when `k > segStart`,
    // and by +2*add when `k <= segStart` (`idx >= preUnfoldLen - segStart`).
    return idx >= preUnfoldLen - segStart ? idx + 2 * add : idx + add
  }
  const adjEdges = edges?.map((e) => (!e ? e : { ...e, fromIdx: shiftIdx(e.fromIdx), toIdx: shiftIdx(e.toIdx) }))
  return { outline, edges: adjEdges }
}

const ZONE_FLIP = { frontPanel: 'hipPanelFront', backPanel: 'hipPanelBack', hipPanelFront: 'frontPanel', hipPanelBack: 'backPanel' }

function resolveEffectivePlacement(p, resolved, pairGoresAsHipPanels, hasUpperPanels = true) {
  const label = (p.label && p.label.en) || p.id || ''
  const bilingual = `${label} ${(p.label && p.label.ar) || ''} ${p.id || ''}`
  const schemaRole = resolved.role
  let declared = pairGoresAsHipPanels && schemaRole === 'skirt-front-gore'
    ? 'hipPanelFront'
    : pairGoresAsHipPanels && schemaRole === 'skirt-back-gore'
      ? 'hipPanelBack'
      : resolved.placement
  const cutOnFold = p.cutOnFold ?? resolved.cutOnFold
  if (!hasUpperPanels && (schemaRole === 'placket-facing' || schemaRole === 'facing' || schemaRole === 'lapel-facing')) {
    declared = 'attachWaistBack'
  }
  if (schemaRole === 'elastic-band') {
    if (/waist|خصر|كمر|waistelastic/i.test(bilingual)) {
      declared = 'attachWaist'
    } else if (/underbust|band\s*elastic|bandelastic|\bbra\b|صدرية/i.test(bilingual)) {
      declared = 'attachUnderbust'
    }
  } else if (schemaRole === 'lining' && /gusset|crotch|دكة/i.test(bilingual)) {
    declared = 'attachCrotch'
  } else if (schemaRole === 'other' || schemaRole === 'pocket') {
    if (!/underarm|إبط/i.test(bilingual) && /crotch|gusset|دكة\s*الجسم/i.test(bilingual)) {
      declared = 'attachCrotch'
    } else if (/neckline\s*binding|keyhole\s*binding|armhole\s*binding|تحبيك\s*(?:فتحة\s*الرقبة|فتحة\s*القفل|حلقة\s*الكم)/i.test(bilingual)) {
      declared = 'attachNeck'
    } else if (/leg\s*opening\s*binding|تحبيك\s*فتحة\s*الساق/i.test(bilingual)) {
      declared = 'attachHem'
    } else if (/cross[-\s]?back\s*strap|\bstrap\b|حزام\s*الظهر|حمالة/i.test(bilingual)) {
      declared = 'attachStrap'
    } else if (/mesh\s*back|back\s*panel|لوحة\s*شبك\s*خلفية/i.test(bilingual)) {
      declared = 'attachBodyBack'
    } else if (/center\s*bridge|\bbridge\b|الجسر\s*الأوسط/i.test(bilingual)) {
      declared = 'attachBust'
    }
  } else if (schemaRole === 'band' && cutOnFold) {
    if (/front|أمام/i.test(bilingual)) declared = 'frontPanel'
    else if (/back|خلف/i.test(bilingual)) declared = 'backPanel'
  }
  return (p.bodyZone && p.bodyZone !== resolved.zone && ZONE_FLIP[declared])
    ? ZONE_FLIP[declared]
    : declared
}

const FABRIC_NAME_TO_ID = new Set(FABRIC_IDS)

const SLEEVE_ROLES = new Set(['sleeve', 'cap-sleeve', 'puff-sleeve', 'butterfly-sleeve'])
// Roles that get bilateral duplication but NOT auto-seamed (drape from
// placement + gravity alone this pass — see pattern/roles.js's header for
// the "unstitched but well-placed" precedent this follows).
const UNSEAMED_BILATERAL_ROLES = new Set(['hood', 'godet'])

const UNTWISTABLE_ROLES = new Set([
  'frontPanel', 'backPanel', 'hipPanelFront', 'hipPanelBack',
  'legFront', 'legBack', 'goreFront', 'goreBack', 'goreSideLeft', 'goreSideRight',
  'attachNeck', 'attachHem', 'attachBust', 'attachUnderbust', 'attachStrap', 'sleeve',
])

function resolveGoreSeamTargets(goreByRole, edgeInstructions, seamInstructions, pushClaimedEdge, pairGoresAsHipPanels, placementHints = null) {
  if (pairGoresAsHipPanels) return
  if (
    goreByRole.goreFront.length === 1 && goreByRole.goreSideRight.length === 1 &&
    goreByRole.goreBack.length === 1 && goreByRole.goreSideLeft.length === 1 &&
    !Object.values(goreByRole).some(([g]) => g.hasAuthoredEdges)
  ) {
    const ring = [goreByRole.goreFront[0], goreByRole.goreSideRight[0], goreByRole.goreBack[0], goreByRole.goreSideLeft[0]]
    const derived = ring.map((g) => deriveGoreSideEdges(g.outline))
    if (derived.every(Boolean)) {
      const pairs = [
        [0, 1, 'front_to_sideRight'],
        [1, 2, 'sideRight_to_back'],
        [2, 3, 'back_to_sideLeft'],
        [3, 0, 'sideLeft_to_front'],
      ]
      const valid = pairs.every(([ai, bi]) => {
        const aLen = edgeArcLen(ring[ai].outline, derived[ai][0].from, derived[ai][0].to)
        const bLen = edgeArcLen(ring[bi].outline, derived[bi][1].from, derived[bi][1].to)
        return Math.min(aLen, bLen) > 1e-3 && Math.max(aLen, bLen) / Math.min(aLen, bLen) <= 1.75
      })
      if (valid) {
        ring.forEach((g, idx) => {
          if (placementHints) placementHints[g.id] = { ...(placementHints[g.id] || {}), goreSpan: Math.PI * 0.48 }
          for (const e of derived[idx]) pushClaimedEdge(g.id, e.name, e.from, e.to, g.outline.length)
        })
        for (const [ai, bi, tag] of pairs) {
          seamInstructions.push({
            id: `goreRing_${tag}`,
            a: { piece: ring[ai].id, edge: 'goreRight' },
            b: { piece: ring[bi].id, edge: 'goreLeft' },
            reverse: true,
          })
        }
      }
    }
    return
  }

  if (
    goreByRole.goreFront.length === 1 && goreByRole.goreBack.length === 1 &&
    goreByRole.goreSideRight.length === 0 && goreByRole.goreSideLeft.length === 0 &&
    !goreByRole.goreFront[0].hasAuthoredEdges && !goreByRole.goreBack[0].hasAuthoredEdges
  ) {
    const gf = goreByRole.goreFront[0], gb = goreByRole.goreBack[0]
    const df = deriveGoreSideEdges(gf.outline), db = deriveGoreSideEdges(gb.outline)
    if (df && db) {
      const lenFR = edgeArcLen(gf.outline, df[0].from, df[0].to)
      const lenFL = edgeArcLen(gf.outline, df[1].from, df[1].to)
      const lenBR = edgeArcLen(gb.outline, db[0].from, db[0].to)
      const lenBL = edgeArcLen(gb.outline, db[1].from, db[1].to)
      const ratioOk = (x, y) => Math.min(x, y) > 1e-3 && Math.max(x, y) / Math.min(x, y) <= 1.45
      if (ratioOk(lenFR, lenBL) && ratioOk(lenFL, lenBR)) {
        if (placementHints) {
          placementHints[gf.id] = { ...(placementHints[gf.id] || {}), goreSpan: Math.PI * 0.94 }
          placementHints[gb.id] = { ...(placementHints[gb.id] || {}), goreSpan: Math.PI * 0.94 }
        }
        for (const e of df) pushClaimedEdge(gf.id, e.name, e.from, e.to, gf.outline.length)
        for (const e of db) pushClaimedEdge(gb.id, e.name, e.from, e.to, gb.outline.length)
        seamInstructions.push(
          { id: 'gorePair_right', a: { piece: gf.id, edge: 'goreRight' }, b: { piece: gb.id, edge: 'goreLeft' }, reverse: true },
          { id: 'gorePair_left', a: { piece: gf.id, edge: 'goreLeft' }, b: { piece: gb.id, edge: 'goreRight' }, reverse: true },
        )
      }
    }
  }
}

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
  const placementHints = {}

  const bySlot = { frontPanel: [], backPanel: [], hipPanelFront: [], hipPanelBack: [] }
  const princessSides = { front: [], back: [] }
  const goreByRole = { goreFront: [], goreSideRight: [], goreBack: [], goreSideLeft: [] }
  const sleeves = []
  const twoPieceSleeves = { upper: [], under: [] }
  const openFrontPairs = []
  const layeredFronts = []
  const layeredBacks = []
  const vestFronts = []
  const vestBacks = []
  const peplumFronts = []
  const peplumBacks = []
  const closedBlazerFrontPairs = []
  let briefFrontId = null
  let briefBackId = null
  let briefWaistId = null
  let briefLegPair = null
  const briefGussets = []
  let jacketOuterFront = null // { rId, lId, rShoulderEdge, rArmEdge, rArmLowerEdge, lShoulderEdge, lArmEdge, lArmLowerEdge }
  let jacketOuterBack = null  // { pieceId, rShoulderEdge, rArmEdge, rArmLowerEdge, lShoulderEdge, lArmEdge, lArmLowerEdge }
  let wrapCoatFrontR = null
  let wrapCoatFrontL = null
  let wrapCoatBack = null
  const seamIdEdges = {} // seamId -> [{pieceId, fromIdx, toIdx, reverse, cutOnFold}] — resolved into seams after the main loop

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
  function hasInteriorOverlap(pid, len, fromIdx, toIdx) {
    const claimed = claimedIndices[pid]
    if (!claimed) return false
    for (const idx of edgeIndexSet(len, fromIdx, toIdx)) {
      if (claimed.has(idx) && idx !== fromIdx && idx !== toIdx) return true
    }
    return false
  }
  function addOrientedSeam(seamId, pieceA, edgeA, pieceB, edgeB, forceReverse = null, preferHorizontal = false) {
    const pA = rawPieces.find((p) => p.id === pieceA)
    const pB = rawPieces.find((p) => p.id === pieceB)
    const eA = edgeInstructions.find((e) => e.pieceId === pieceA && e.edgeName === edgeA)
    const eB = edgeInstructions.find((e) => e.pieceId === pieceB && e.edgeName === edgeB)
    if (!pA || !pB || !eA || !eB) return
    let rev = forceReverse
    if (rev === null) {
      const dxA = pA.outline[eA.toIdx][0] - pA.outline[eA.fromIdx][0]
      const dyA = pA.outline[eA.toIdx][1] - pA.outline[eA.fromIdx][1]
      const dxB = pB.outline[eB.toIdx][0] - pB.outline[eB.fromIdx][0]
      const dyB = pB.outline[eB.toIdx][1] - pB.outline[eB.fromIdx][1]
      if (!preferHorizontal && Math.abs(dyA) > 0.05 && Math.abs(dyB) > 0.05) {
        // Armhole-to-sleeve-cap seams MUST always align vertically (shoulder end <-> capTop, underarm <-> underarm)
        rev = dyA * dyB < 0
      } else {
        rev = dxA * dxB < 0
      }
    }
    seamInstructions.push({ id: seamId, a: { piece: pieceA, edge: edgeA }, b: { piece: pieceB, edge: edgeB }, reverse: Boolean(rev) })
  }

  function pushSeamIdEdges(pieceId, edgesArr, outlineLen, meta = {}) {
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
      ; (seamIdEdges[e.seamId] ||= []).push({ pieceId, fromIdx: e.fromIdx, toIdx: e.toIdx, reverse: e.reverse, cutOnFold: Boolean(meta.cutOnFold) })
    }
  }

  const allInputPieces = (payload.pieces || []).map((p, idx) => (p && (!p.id || !p.label)) ? { ...p, id: p.id || p.key || `p_${idx}`, label: p.label || p.name } : p)
  const hasSleeves = allInputPieces.some((p) => {
    if (p.visible === false) return false
    const r = resolveSchemaRole(p.role)
    if (r) return SLEEVE_ROLES.has(r.role) || r.role === 'sleeve-upper'
    const label = (p.label && p.label.en) || p.id
    return classifyLegacy(label, (p.label && p.label.ar) || '') === 'sleeve'
  })

  const activePieces = allInputPieces.filter((p) => p.visible !== false)
  const hasUpperPanels = activePieces.some((p) => {
    const r = resolveSchemaRole(p.role)
    if (r) {
      return (
        r.placement === 'frontPanel' ||
        r.placement === 'backPanel' ||
        r.placement === 'attachBust' ||
        r.placement === 'attachUnderbust' ||
        SLEEVE_ROLES.has(r.role) ||
        r.role === 'sleeve-upper'
      )
    }
    const cls = classifyLegacy((p.label && p.label.en) || p.id || '', (p.label && p.label.ar) || '')
    return cls === 'bodice-front' || cls === 'bodice-back' || cls === 'sleeve'
  })
  const hasBriefPanels = activePieces.some((p) => {
    const rn = resolveSchemaRole(p.role)?.role
    return rn === 'brief-front' || rn === 'brief-back'
  })
  const hasBriefWaistElastic = hasBriefPanels && activePieces.some((ap) => {
    const rn = resolveSchemaRole(ap.role)?.role
    const txt = `${(ap.label && ap.label.en) || ''} ${(ap.label && ap.label.ar) || ''} ${ap.id || ''}`
    return rn === 'elastic-band' && !(ap.bilateral ?? false) && /waist|خصر|كمر|waistelastic/i.test(txt) && ap.outline?.length === 4 && !ap.edges?.length
  })
  const hasBriefLegElastic = hasBriefPanels && activePieces.some((ap) => {
    const rn = resolveSchemaRole(ap.role)?.role
    const txt = `${(ap.label && ap.label.en) || ''} ${(ap.label && ap.label.ar) || ''} ${ap.id || ''}`
    return rn === 'elastic-band' && Boolean(ap.bilateral) && /leg\s*elastic|leg\s*opening|أستك.*ساق|legelastic/i.test(txt) && ap.outline?.length === 4 && !ap.edges?.length
  })
  let briefMeta = null
  if (hasBriefPanels) {
    const frontBrief = activePieces.find((p) => resolveSchemaRole(p.role)?.role === 'brief-front') ||
      activePieces.find((p) => resolveSchemaRole(p.role)?.role === 'brief-back')
    if (frontBrief?.outline?.length >= 8) {
      const loc = relocalize(frontBrief.outline)
      const be = frontBrief.edges?.find((e) => e?.seamId === 'briefSide')
      const { maxX, maxY } = bbox(loc)
      const bText = `${payload.designId || ''} ${payload.designName || ''} ${(frontBrief.label && frontBrief.label.en) || ''} ${(frontBrief.label && frontBrief.label.ar) || ''}`
      const sideTopY = be ? (loc[be.fromIdx]?.[1] ?? 1.2) : 1.2
      const sideBotY = be ? (loc[be.toIdx]?.[1] ?? 5.0) : 5.0
      const sideDY = Math.abs(sideBotY - sideTopY)
      const crotchDepthCm = Math.max(0, maxY - sideBotY)
      const isTrunkOrBoxer = /boxer|trunk|boyshort|بوكسر|ترنك|بويشورت/i.test(bText) || crotchDepthCm < maxX * 0.24
      const estLegExt = isTrunkOrBoxer ? Math.max(3.5, sideDY - 5.2) : 0
      const pureSideDY = Math.max(2.5, sideDY - estLegExt)
      const riseCm = Math.max(6, Math.min(20, Math.round(pureSideDY / 0.44)))
      briefMeta = { riseCm, sideSeamYCm: sideBotY, crotchYCm: maxY, hasBriefLeg: isTrunkOrBoxer, legExtCm: estLegExt }
    }
  }
  const hasSleeveUnder = activePieces.some((p) => resolveSchemaRole(p.role)?.role === 'sleeve-under')
  const hasPrincessFrontSide = activePieces.some((p) => resolveSchemaRole(p.role)?.role === 'bodice-front-side')
  const hasPrincessBackSide = activePieces.some((p) => resolveSchemaRole(p.role)?.role === 'bodice-back-side')
  const hasPeplumPieces = activePieces.some((p) => {
    const rn = resolveSchemaRole(p.role)?.role
    return rn === 'peplum-front' || rn === 'peplum-back'
  })
  const sideGoreLefts = activePieces.filter((p) => resolveSchemaRole(p.role)?.role === 'skirt-side-gore-left')
  const sideGoreRights = activePieces.filter((p) => resolveSchemaRole(p.role)?.role === 'skirt-side-gore-right')
  const hasSideGores = sideGoreLefts.length + sideGoreRights.length > 0
  const frontGores = activePieces.filter((p) => resolveSchemaRole(p.role)?.role === 'skirt-front-gore')
  const backGores = activePieces.filter((p) => resolveSchemaRole(p.role)?.role === 'skirt-back-gore')
  const pairGoresAsHipPanels = !hasSideGores &&
    frontGores.length === 1 && backGores.length === 1 &&
    Boolean(frontGores[0].cutOnFold) && Boolean(backGores[0].cutOnFold) &&
    !frontGores[0].edges?.length && !backGores[0].edges?.length

  const allGorePieces = [...frontGores, ...backGores, ...sideGoreLefts, ...sideGoreRights]
  const ignoreSharedGoreSide = !pairGoresAsHipPanels &&
    frontGores.length === 1 && backGores.length === 1 &&
    (sideGoreLefts.length + sideGoreRights.length === 0 || (sideGoreLefts.length === 1 && sideGoreRights.length === 1)) &&
    allGorePieces.every((gp) => !gp.edges?.length || gp.edges.every((e) => !e?.seamId || e.seamId === 'goreSide'))

  const nonLiningSeamIds = new Set()
  const foldSeamIds = new Set()
  const foldBackCountBySeamId = {}
  const unmirroredFrontCountBySeamId = {}
  const unedgedFoldBackWidths = []
  for (const ap of activePieces) {
    const r = resolveSchemaRole(ap.role)
    const roleName = r?.role
    const isFold = Boolean(ap.cutOnFold ?? r?.cutOnFold)
    const isBilateral = Boolean(ap.bilateral ?? r?.bilateral)
    const effPlacement = r ? resolveEffectivePlacement(ap, r, pairGoresAsHipPanels, hasUpperPanels) : null
    if (isFold && roleName !== 'lining' && effPlacement === 'backPanel' && !ap.edges?.length && ap.outline?.length >= 3) {
      const { minX, maxX } = bbox(relocalize(ap.outline))
      unedgedFoldBackWidths.push(maxX - minX)
    }
    if (!Array.isArray(ap.edges)) continue
    for (const e of ap.edges) {
      if (!e?.seamId) continue
      if (roleName !== 'lining') nonLiningSeamIds.add(e.seamId)
      if (isFold && roleName !== 'lining') {
        foldSeamIds.add(e.seamId)
        if (effPlacement === 'backPanel') foldBackCountBySeamId[e.seamId] = (foldBackCountBySeamId[e.seamId] || 0) + 1
      } else if (!isFold && !isBilateral && effPlacement === 'frontPanel') {
        unmirroredFrontCountBySeamId[e.seamId] = (unmirroredFrontCountBySeamId[e.seamId] || 0) + 1
      }
    }
  }
  const hasFoldBackBySeamId = new Set(
    Object.keys(foldBackCountBySeamId).filter((sid) => foldBackCountBySeamId[sid] >= (unmirroredFrontCountBySeamId[sid] || 0))
  )

  const seamIdCounts = {}
  for (const ap of activePieces) {
    if (!Array.isArray(ap.edges)) continue
    const roleName = resolveSchemaRole(ap.role)?.role
    for (const e of ap.edges) {
      if (!e?.seamId) continue
      if (roleName === 'lining' && nonLiningSeamIds.has(e.seamId)) continue
      if (ignoreSharedGoreSide && e.seamId === 'goreSide' && roleName?.startsWith('skirt-')) continue
      seamIdCounts[e.seamId] = (seamIdCounts[e.seamId] || 0) + 1
    }
  }

  for (const p of allInputPieces) {
    const label = (p.label && p.label.en) || p.id
    const resolved = resolveSchemaRole(p.role)

    if (!resolved) {
      // ---------- CLASSIFY_LEGACY path (unchanged from pre-WP-6, plus WP-49's explicit-zone correction) ----------
      const cls = applyBodyZoneOverride(classifyLegacy(label, (p.label && p.label.ar) || ''), p.bodyZone)
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
    const cutOnFold = p.cutOnFold ?? resolved.cutOnFold
    const bilateral = p.bilateral ?? resolved.bilateral
    const edges = p.edges
    const necklineEndIdx = p.necklineEndIdx
    const sideEndIdx = p.sideEndIdx
    const autoTorsoSeams = p.autoTorsoSeams !== false
    const princessSeamId = p.princessSeamId
    const local = relocalize(p.outline)

    const placement = resolveEffectivePlacement(p, resolved, pairGoresAsHipPanels, hasUpperPanels)

    if (hasSleeveUnder && (schemaRole === 'sleeve-upper' || schemaRole === 'sleeve-under')) {
      const prepared = prepareTwoPieceSleevePanel(local, schemaRole)
      const rOutline = prepared.outline
      const rEdges = prepared.edges
      const { minY: syMin, maxY: syMax } = bbox(rOutline)
      const heightCm = Math.max(0, syMax - syMin)
      const lEdges = rEdges ? mirrorEdgeIndices(rEdges.map((e) => ({ name: e.name, fromIdx: e.from, toIdx: e.to })), rOutline.length) : null
      const tubeHalf = schemaRole === 'sleeve-upper' ? 'upper' : 'under'
      const copies = bilateral !== false && !cutOnFold
        ? [
          { id: p.id + '_r', outline: rOutline, edges: rEdges, suffix: ' (R)', darts: p.darts },
          { id: p.id + '_l', outline: mirrorOutline(rOutline), edges: lEdges ? lEdges.map((e) => ({ name: e.name, from: e.fromIdx, to: e.toIdx })) : null, suffix: ' (L)', darts: (p.darts || []).map((d) => d.map(([x, y]) => [-x, y])) },
        ]
        : [{ id: p.id, outline: rOutline, edges: rEdges, suffix: '', darts: p.darts }]
      for (const copy of copies) {
        rawPieces.push({ id: copy.id, label: p.label, outline: copy.outline, color: p.color, darts: copy.darts })
        roles[copy.id] = 'sleeve'
        placementHints[copy.id] = { tubeHalf }
        if (copy.edges) {
          for (const e of copy.edges) pushClaimedEdge(copy.id, e.name, e.from, e.to, copy.outline.length)
        }
        recognized.push({ id: copy.id, label: label + copy.suffix })
      }
      if (rEdges) twoPieceSleeves[tubeHalf].push({ rId: copies[0].id, lId: copies[1]?.id || null, heightCm })
      continue
    }

    if (SLEEVE_ROLES.has(schemaRole) || (!hasSleeveUnder && schemaRole === 'sleeve-upper')) {
      sleeves.push({ id: p.id, label: p.label || label, labelEn: label, outline: cutOnFold ? unfoldPiece(local) : local, color: p.color, bilateral: bilateral !== false && !cutOnFold, darts: p.darts })
      continue
    }

    if (!pairGoresAsHipPanels && (schemaRole === 'skirt-front-gore' || schemaRole === 'skirt-back-gore' || schemaRole === 'skirt-side-gore-left' || schemaRole === 'skirt-side-gore-right')) {
      const internalRole = { 'skirt-front-gore': 'goreFront', 'skirt-back-gore': 'goreBack', 'skirt-side-gore-left': 'goreSideLeft', 'skirt-side-gore-right': 'goreSideRight' }[schemaRole]
      const outline = cutOnFold ? unfoldPiece(local) : local
      const goreEdges = ignoreSharedGoreSide ? edges?.filter((e) => e && e.seamId && e.seamId !== 'goreSide') : edges
      const copies = bilateral && !cutOnFold ? [
        { id: p.id + '_r', outline }, { id: p.id + '_l', outline: mirrorOutline(outline) },
      ] : [{ id: p.id, outline }]
      for (const copy of copies) {
        rawPieces.push({ id: copy.id, label: p.label, outline: copy.outline, color: p.color, darts: p.darts })
        roles[copy.id] = internalRole
        const copyEdges = copy.id.endsWith('_l') && bilateral && !cutOnFold && goreEdges ? mirrorEdgeIndices(goreEdges, local.length) : goreEdges
        const tagged = bilateral && !cutOnFold ? copyEdges?.map(e => ({ ...e, seamId: e.seamId ? e.seamId + (copy.id.endsWith('_r') ? '_R' : '_L') : e.seamId })) : copyEdges
        pushSeamIdEdges(copy.id, tagged, copy.outline.length, { cutOnFold })
        goreByRole[internalRole].push({ id: copy.id, outline: copy.outline, hasAuthoredEdges: Boolean(tagged?.some((e) => e?.seamId)) })
        recognized.push({ id: copy.id, label })
      }
      continue
    }

    if (cutOnFold) {
      const isUpperPanel = placement === 'frontPanel' || placement === 'backPanel'
      const isSportBraPanel = schemaRole === 'band' && isUpperPanel
      const isVestPiece = /\bvest\b|waistcoat|صديري/i.test(`${p.id || ''} ${label} ${(p.label && p.label.ar) || ''}`)
      const isPrincessCenter = Boolean(
        princessSeamId ||
        (hasPrincessFrontSide && schemaRole === 'bodice-front-center') ||
        (hasPrincessBackSide && schemaRole === 'bodice-back-center'),
      )
      const isWrapBackPiece = !isVestPiece && schemaRole !== 'lining' && placement === 'backPanel' && Boolean(edges?.some((e) => e?.seamId === 'wrapCoatSide'))
      const authoredSideEdge = edges?.find((e) => e?.seamId && /Side(?:_[RL])?$/.test(e.seamId) && e.seamId !== 'wrapCoatSide')
      const authoredNeckEdge = edges?.find((e) => e?.seamId && /Neck(?:Back)?(?:_[RL])?$/.test(e.seamId) && e.fromIdx === 0)
      const canSubdivideJacketBack = hasSleeves && !isVestPiece && schemaRole !== 'lining' && placement === 'backPanel' &&
        authoredSideEdge && authoredNeckEdge && authoredSideEdge.fromIdx === authoredNeckEdge.toIdx + 1
      const isShirtBack1SegArmhole = hasSleeves && hasSleeveUnder && !isVestPiece && !isPrincessCenter &&
        schemaRole !== 'lining' && placement === 'backPanel' &&
        authoredSideEdge && !authoredNeckEdge && authoredSideEdge.fromIdx === 2 && edges.length === 1

      let workLocal = local
      let workEdges = edges
      let wrapSubAdded = 0
      let jacketBackSubAdded = 0

      if (isWrapBackPiece && hasSleeves && edges[0]?.fromIdx === 1) {
        const sub = insertSegmentSubdivisions(workLocal, workEdges, 0, hasSleeveUnder ? [0.24, 0.56, 0.84] : [0.24, 0.58])
        wrapSubAdded = sub.outline.length - workLocal.length
        workLocal = sub.outline
        workEdges = sub.edges
      } else if (canSubdivideJacketBack) {
        const sub = insertSegmentSubdivisions(workLocal, workEdges, authoredNeckEdge.toIdx, hasSleeveUnder ? [0.40, 0.80] : [0.40])
        jacketBackSubAdded = sub.outline.length - workLocal.length
        workLocal = sub.outline
        workEdges = sub.edges
      } else if (isShirtBack1SegArmhole) {
        const sub = insertSegmentSubdivisions(workLocal, workEdges, 1, [0.74])
        workLocal = sub.outline
        workEdges = sub.edges
      }

      const canSubdivideArmhole = isUpperPanel && !isSportBraPanel && !isPrincessCenter && !workEdges?.length && necklineEndIdx == null && sideEndIdx == null
      const armholeLocal = canSubdivideArmhole && hasSleeves ? subdivideFoldBodiceArmhole(workLocal) : workLocal
      const canSubdivideNeck = isUpperPanel && !isSportBraPanel && !isPrincessCenter && !wrapSubAdded && !jacketBackSubAdded &&
        necklineEndIdx == null && sideEndIdx == null &&
        (!workEdges?.length || workEdges.every((e) => e && e.fromIdx >= 1 && e.toIdx >= 1))
      const baseLocal = canSubdivideNeck ? subdivideFoldBodiceNeckOpening(armholeLocal) : armholeLocal
      const neckAdded = baseLocal.length - armholeLocal.length
      const adjEdges = neckAdded > 0 && workEdges?.length
        ? workEdges.map((e) => ({ ...e, fromIdx: e.fromIdx + neckAdded, toIdx: e.toIdx + neckAdded }))
        : workEdges
      const outline = unfoldPiece(baseLocal)
      rawPieces.push({ id: p.id, label: p.label, outline, color: p.color, darts: p.darts })
      roles[p.id] = placement

      if (princessSeamId) {
        const [right, left] = deriveTorsoEdgeInstructions(outline, { includeTop: false, necklineEndIdx })
        pushClaimedEdge(p.id, right.name, right.from, right.to, outline.length)
        pushClaimedEdge(p.id, left.name, left.from, left.to, outline.length)
          ; (seamIdEdges[princessSeamId + '_R'] ||= []).push({ pieceId: p.id, fromIdx: right.from, toIdx: right.to })
          ; (seamIdEdges[princessSeamId + '_L'] ||= []).push({ pieceId: p.id, fromIdx: left.from, toIdx: left.to })
        pushSeamIdEdges(p.id, adjEdges, outline.length, { cutOnFold: true })
      } else if (isPrincessCenter) {
        // Explicit princess center panel without `p.princessSeamId` (e.g. w10, w11, w17, m10, b10, ref_w_blouse, ref_g_top):
        // register its unfolded R and L princess seam chains directly under `<seamId>_R` / `<seamId>_L` so
        // center panels never hijack bySlot armhole/side seams!
        const nOut = outline.length
        const pEdge = adjEdges?.find((e) => e?.seamId && /princess/i.test(e.seamId)) || adjEdges?.[0]
        if (pEdge?.seamId) {
          pushClaimedEdge(p.id, `seamId_${pEdge.seamId}_R`, pEdge.fromIdx, pEdge.toIdx, nOut)
            ; (seamIdEdges[pEdge.seamId + '_R'] ||= []).push({ pieceId: p.id, fromIdx: pEdge.fromIdx, toIdx: pEdge.toIdx, cutOnFold: false })
          const lFrom = (nOut - pEdge.toIdx + nOut) % nOut
          const lTo = (nOut - pEdge.fromIdx + nOut) % nOut
          pushClaimedEdge(p.id, `seamId_${pEdge.seamId}_L`, lFrom, lTo, nOut)
            ; (seamIdEdges[pEdge.seamId + '_L'] ||= []).push({ pieceId: p.id, fromIdx: lFrom, toIdx: lTo, cutOnFold: false })
        }
        const restEdges = adjEdges?.filter((e) => e !== pEdge)
        pushSeamIdEdges(p.id, restEdges, nOut, { cutOnFold: true })
      } else {
        const isBriefPanel = schemaRole === 'brief-front' || schemaRole === 'brief-back'
        const isMultiWrapPiece = Boolean(adjEdges?.some((e) => e && e.seamId && seamIdCounts[e.seamId] === 3))
        const hasJacketSideFold = Boolean(adjEdges?.some((e) => e && (e.seamId === 'jacketSide' || /^mf\d+Side/.test(e.seamId))))
        if (isBriefPanel && adjEdges?.length === 1 && adjEdges[0]?.seamId === 'briefSide') {
          const be = adjEdges[0]
          const N = outline.length
          pushClaimedEdge(p.id, 'rightSide', be.fromIdx, be.toIdx, N)
          pushClaimedEdge(p.id, 'leftSide', N - be.toIdx, N - be.fromIdx, N)
          const crotchFrom = baseLocal.length - 2
          const crotchTo = N - crotchFrom
          if (crotchFrom > be.toIdx && crotchTo < N - be.toIdx && !hasInteriorOverlap(p.id, N, crotchFrom, crotchTo)) {
            pushClaimedEdge(p.id, 'crotchSeam', crotchFrom, crotchTo, N)
          }
          if (hasBriefLegElastic && be.toIdx < crotchFrom && crotchTo < N - be.toIdx) {
            if (!hasInteriorOverlap(p.id, N, be.toIdx, crotchFrom)) {
              pushClaimedEdge(p.id, 'rightLegOpening', be.toIdx, crotchFrom, N)
            }
            if (!hasInteriorOverlap(p.id, N, crotchTo, N - be.toIdx)) {
              pushClaimedEdge(p.id, 'leftLegOpening', crotchTo, N - be.toIdx, N)
            }
          }
          if (hasBriefWaistElastic && !hasInteriorOverlap(p.id, N, N - be.fromIdx, be.fromIdx)) {
            pushClaimedEdge(p.id, 'waistSeam', N - be.fromIdx, be.fromIdx, N)
          }
          if (schemaRole === 'brief-front') briefFrontId = p.id
          else if (schemaRole === 'brief-back') briefBackId = p.id
          placementHints[p.id] = {
            ...(placementHints[p.id] || {}),
            isBrief: true,
            sewnWaistElastic: Boolean(hasBriefWaistElastic),
            riseCm: briefMeta?.riseCm ?? 12,
            sideSeamYCm: briefMeta?.sideSeamYCm ?? (baseLocal[be.toIdx]?.[1] ?? 5),
            crotchYCm: bbox(baseLocal).maxY,
            hasBriefLeg: Boolean(briefMeta?.hasBriefLeg),
            legExtCm: briefMeta?.legExtCm ?? 0,
          }
          bySlot[placement].push({ id: p.id, label })
          recognized.push({ id: p.id, label })
          continue
        }
        if (hasJacketSideFold) {
          const layerRank = schemaRole === 'lining' ? 0 : (isVestPiece ? 1 : 2)
          if (placement === 'backPanel') layeredBacks.push({ ids: [p.id], layerRank })
          else if (placement === 'frontPanel') layeredFronts.push({ ids: [p.id], layerRank })
          if (canSubdivideJacketBack && jacketBackSubAdded >= 1 && !jacketOuterBack && schemaRole !== 'lining') {
            const N = outline.length
            const sBase = authoredNeckEdge.toIdx + neckAdded
            const shIdx = sBase + 1
            const midIdx = hasSleeveUnder ? sBase + 2 : shIdx
            const armEndIdx = sBase + 1 + jacketBackSubAdded
            pushClaimedEdge(p.id, 'rightTop', sBase, shIdx, N)
            pushClaimedEdge(p.id, 'leftTop', N - shIdx, N - sBase, N)
            if (hasSleeveUnder) {
              pushClaimedEdge(p.id, 'rightArmholeUpper', shIdx, midIdx, N)
              pushClaimedEdge(p.id, 'rightArmholeLower', midIdx, armEndIdx, N)
              pushClaimedEdge(p.id, 'leftArmholeLower', N - armEndIdx, N - midIdx, N)
              pushClaimedEdge(p.id, 'leftArmholeUpper', N - midIdx, N - shIdx, N)
            } else {
              pushClaimedEdge(p.id, 'rightArmhole', shIdx, armEndIdx, N)
              pushClaimedEdge(p.id, 'leftArmhole', N - armEndIdx, N - shIdx, N)
            }
            jacketOuterBack = {
              pieceId: p.id,
              rShoulderEdge: 'rightTop',
              lShoulderEdge: 'leftTop',
              rArmEdge: hasSleeveUnder ? 'rightArmholeUpper' : 'rightArmhole',
              rArmLowerEdge: hasSleeveUnder ? 'rightArmholeLower' : null,
              lArmEdge: hasSleeveUnder && !jacketOuterFront ? 'leftArmholeUpper' : (hasSleeveUnder ? 'leftArmholeUpper' : 'leftArmhole'),
              lArmLowerEdge: hasSleeveUnder ? 'leftArmholeLower' : null,
            }
          } else if (hasSleeves && !isVestPiece && schemaRole !== 'lining' && placement === 'frontPanel' && !jacketOuterFront &&
            authoredSideEdge && authoredNeckEdge && authoredSideEdge.fromIdx - authoredNeckEdge.toIdx >= 3) {
            // Unfolded front panel (`cutOnFold: true`, e.g. `mf14` / `bf13` bisht/robe)
            const N = outline.length
            const nEnd = authoredNeckEdge.toIdx + neckAdded
            const sStart = authoredSideEdge.fromIdx + neckAdded
            const shIdx = nEnd + Math.max(1, Math.round((sStart - nEnd) * 0.42))
            const armMid = sStart - shIdx >= 2 ? sStart - 1 : shIdx
            pushClaimedEdge(p.id, 'rightTop', nEnd, shIdx, N)
            pushClaimedEdge(p.id, 'leftTop', N - shIdx, N - nEnd, N)
            if (hasSleeveUnder && armMid > shIdx) {
              pushClaimedEdge(p.id, 'rightArmholeUpper', shIdx, armMid, N)
              pushClaimedEdge(p.id, 'rightArmholeLower', armMid, sStart, N)
              pushClaimedEdge(p.id, 'leftArmholeLower', N - sStart, N - armMid, N)
              pushClaimedEdge(p.id, 'leftArmholeUpper', N - armMid, N - shIdx, N)
            } else {
              pushClaimedEdge(p.id, 'rightArmhole', shIdx, sStart, N)
              pushClaimedEdge(p.id, 'leftArmhole', N - sStart, N - shIdx, N)
            }
            jacketOuterFront = {
              rId: p.id,
              lId: p.id,
              rShoulderEdge: 'rightTop',
              lShoulderEdge: 'leftTop',
              rArmEdge: hasSleeveUnder && armMid > shIdx ? 'rightArmholeUpper' : 'rightArmhole',
              rArmLowerEdge: hasSleeveUnder && armMid > shIdx ? 'rightArmholeLower' : null,
              lArmEdge: hasSleeveUnder && armMid > shIdx ? 'leftArmholeUpper' : 'leftArmhole',
              lArmLowerEdge: hasSleeveUnder && armMid > shIdx ? 'leftArmholeLower' : null,
            }
          } else if (isVestPiece && schemaRole !== 'lining' && placement === 'backPanel' &&
            authoredSideEdge && authoredNeckEdge && authoredSideEdge.fromIdx > authoredNeckEdge.toIdx) {
            const N = outline.length
            const sBase = authoredNeckEdge.toIdx + neckAdded
            const shIdx = authoredSideEdge.fromIdx + neckAdded
            if (!hasInteriorOverlap(p.id, N, sBase, shIdx)) {
              pushClaimedEdge(p.id, 'rightTop', sBase, shIdx, N)
              pushClaimedEdge(p.id, 'leftTop', N - shIdx, N - sBase, N)
              vestBacks.push({ pieceId: p.id, rShoulderEdge: 'rightTop', lShoulderEdge: 'leftTop' })
            }
          }
        } else if (isWrapBackPiece && wrapSubAdded >= 2) {
          const N = outline.length
          const sIdx = 1 + neckAdded
          const armStart = sIdx + 1
          const armMid = hasSleeveUnder ? armStart + 1 : armStart
          const armEnd = 1 + wrapSubAdded + neckAdded
          pushClaimedEdge(p.id, 'rightTop', sIdx, armStart, N)
          pushClaimedEdge(p.id, 'leftTop', N - armStart, N - sIdx, N)
          if (hasSleeveUnder) {
            pushClaimedEdge(p.id, 'rightArmholeUpper', armStart, armMid, N)
            pushClaimedEdge(p.id, 'rightArmholeLower', armMid, armEnd, N)
            pushClaimedEdge(p.id, 'leftArmholeLower', N - armEnd, N - armMid, N)
            pushClaimedEdge(p.id, 'leftArmholeUpper', N - armMid, N - armStart, N)
          } else {
            pushClaimedEdge(p.id, 'rightArmhole', armStart, armEnd, N)
            pushClaimedEdge(p.id, 'leftArmhole', N - armEnd, N - armStart, N)
          }
          wrapCoatBack = {
            pieceId: p.id,
            rShoulderEdge: 'rightTop',
            lShoulderEdge: 'leftTop',
            rArmEdge: hasSleeveUnder ? 'rightArmholeUpper' : 'rightArmhole',
            rArmLowerEdge: hasSleeveUnder ? 'rightArmholeLower' : null,
            lArmEdge: hasSleeveUnder ? 'leftArmholeUpper' : 'leftArmhole',
            lArmLowerEdge: hasSleeveUnder ? 'leftArmholeLower' : null,
          }
        } else if (autoTorsoSeams && !isMultiWrapPiece && (placement === 'frontPanel' || placement === 'backPanel' || placement === 'hipPanelFront' || placement === 'hipPanelBack')) {
          if (isSportBraPanel) {
            const geo = deriveSportBraSideEdges(outline)
            if (geo.some((e) => e.name === 'rightSide') && geo.some((e) => e.name === 'leftSide')) {
              bySlot[placement].push({ id: p.id, label })
              for (const e of geo) pushClaimedEdge(p.id, e.name, e.from, e.to, outline.length)
            }
          } else {
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
        }
        pushSeamIdEdges(p.id, adjEdges, outline.length, { cutOnFold: true })
      }
      if (hasBriefPanels && placement === 'attachCrotch') {
        const N = outline.length
        const mid = baseLocal.length - 1
        const spanK = Math.min(3, Math.floor(mid / 3))
        const gfFrom = (N - spanK) % N, gfTo = spanK
        const gbFrom = mid - spanK, gbTo = (mid + spanK) % N
        if (schemaRole === 'gusset' && spanK >= 1 && !hasInteriorOverlap(p.id, N, gfFrom, gfTo) && !hasInteriorOverlap(p.id, N, gbFrom, gbTo)) {
          pushClaimedEdge(p.id, 'gussetFront', gfFrom, gfTo, N)
          pushClaimedEdge(p.id, 'gussetBack', gbFrom, gbTo, N)
          briefGussets.push(p.id)
          placementHints[p.id] = { ...(placementHints[p.id] || {}), isBriefGusset: true, sewnCrotchGusset: true, layerOffset: 0 }
        } else {
          placementHints[p.id] = { ...(placementHints[p.id] || {}), isBriefGusset: true, layerOffset: schemaRole === 'lining' ? -0.0015 : 0 }
        }
      }
      if (placement === 'attachWaist' && adjEdges?.some((e) => e?.fromIdx === 0 && /Back/i.test(e?.seamId || ''))) {
        placementHints[p.id] = { ...(placementHints[p.id] || {}), foldAtBack: true }
      }
      if (placement === 'attachNeck') {
        placementHints[p.id] = { ...(placementHints[p.id] || {}), neckKind: schemaRole }
      }
      if (schemaRole === 'peplum-front') peplumFronts.push({ id: p.id, outline })
      else if (schemaRole === 'peplum-back') peplumBacks.push({ id: p.id, outline })
      recognized.push({ id: p.id, label })
      continue
    }

    if (bilateral) {
      const rId = p.id + '_r', lId = p.id + '_l'
      const isBriefLegElastic = hasBriefPanels && placement === 'attachHem' && !edges?.length && local.length === 4 &&
        /leg\s*elastic|leg\s*opening|أستك.*ساق|legelastic/i.test(`${p.id || ''} ${label} ${(p.label && p.label.ar) || ''}`)
      if (isBriefLegElastic) {
        const midX = 0.5 * (local[0][0] + local[1][0])
        const rSub = [local[0], [midX, local[0][1]], local[1], local[2], [midX, local[2][1]], local[3]]
        const lSub = mirrorOutline(rSub)
        rawPieces.push({ id: rId, label: p.label, outline: rSub, color: p.color, darts: p.darts })
        rawPieces.push({ id: lId, label: p.label, outline: lSub, color: p.color, darts: p.darts })
        roles[rId] = placement
        roles[lId] = placement
        const legHint = {
          isLegOpeningElastic: true,
          sewnLegElastic: true,
          briefRiseCm: briefMeta?.riseCm ?? 12,
          hasBriefLeg: Boolean(briefMeta?.hasBriefLeg),
          legExtCm: briefMeta?.legExtCm ?? 0,
        }
        placementHints[rId] = { ...(placementHints[rId] || {}), ...legHint }
        placementHints[lId] = { ...(placementHints[lId] || {}), ...legHint }
        const rDefs = [
          { name: 'legAttachFront', fromIdx: 0, toIdx: 1 },
          { name: 'legAttachBack', fromIdx: 1, toIdx: 2 },
          { name: 'legEndBack', fromIdx: 2, toIdx: 3 },
          { name: 'legEndFront', fromIdx: 5, toIdx: 0 },
        ]
        const lDefs = mirrorEdgeIndices(rDefs, 6)
        for (const d of rDefs) pushClaimedEdge(rId, d.name, d.fromIdx, d.toIdx, 6)
        for (const d of lDefs) pushClaimedEdge(lId, d.name, d.fromIdx, d.toIdx, 6)
        briefLegPair = { rId, lId }
        recognized.push({ id: rId, label: label + ' (R)' })
        recognized.push({ id: lId, label: label + ' (L)' })
        continue
      }
      const n = local.length
      rawPieces.push({ id: rId, label: p.label, outline: local, color: p.color, darts: p.darts })
      rawPieces.push({ id: lId, label: p.label, outline: mirrorOutline(local), color: p.color, darts: (p.darts || []).map(d => d.map(([x, y]) => [-x, y])) })
      roles[rId] = placement
      roles[lId] = placement
      if (!hasBriefPanels && placement === 'attachHem' && /leg\s*opening|تحبيك\s*فتحة\s*الساق/i.test(`${p.id || ''} ${label} ${(p.label && p.label.ar) || ''}`)) {
        const leoLegHint = {
          isLegOpeningElastic: true,
          sewnLegElastic: true,
          briefRiseCm: 4,
          hasBriefLeg: false,
        }
        placementHints[rId] = { ...(placementHints[rId] || {}), ...leoLegHint }
        placementHints[lId] = { ...(placementHints[lId] || {}), ...leoLegHint }
      }
      if (placement === 'attachNeck') {
        placementHints[rId] = { ...(placementHints[rId] || {}), neckKind: schemaRole }
        placementHints[lId] = { ...(placementHints[lId] || {}), neckKind: schemaRole }
      }
      if (placement === 'legFront' || placement === 'legBack') {
        const { minY: lMinY, maxY: lMaxY } = bbox(local)
        const lH = Math.max(1e-4, lMaxY - lMinY)
        const ms = edges?.find((e) => e?.mirrorSelf)
        let crotchYCm = null
        if (ms && local[ms.fromIdx] && local[ms.toIdx]) {
          crotchYCm = Math.max(local[ms.fromIdx][1], local[ms.toIdx][1]) - lMinY
        } else {
          let bestX = Infinity
          for (const [lx, ly] of local) {
            const fy = (ly - lMinY) / lH
            if (fy >= 0.10 && fy <= 0.56 && lx < bestX) {
              bestX = lx
              crotchYCm = ly - lMinY
            }
          }
        }
        if (Number.isFinite(crotchYCm)) {
          placementHints[rId] = { ...(placementHints[rId] || {}), crotchYCm }
          placementHints[lId] = { ...(placementHints[lId] || {}), crotchYCm }
        }
      }
      if (edges && edges.length && !UNSEAMED_BILATERAL_ROLES.has(schemaRole)) {
        const mirrored = mirrorEdgeIndices(edges, n)
        edges.forEach((e, i) => {
          const edgeName = `seam${i}`
          pushClaimedEdge(rId, edgeName, e.fromIdx, e.toIdx, n)
          pushClaimedEdge(lId, edgeName, mirrored[i].fromIdx, mirrored[i].toIdx, n)
          if (e.mirrorSelf) {
            seamInstructions.push({ id: `${p.id}_mirror${i}`, a: { piece: rId, edge: edgeName }, b: { piece: lId, edge: edgeName }, reverse: true })
          } else if (e.seamId) {
            ; (seamIdEdges[e.seamId + '_R'] ||= []).push({ pieceId: rId, fromIdx: e.fromIdx, toIdx: e.toIdx, reverse: e.reverse })
              ; (seamIdEdges[e.seamId + '_L'] ||= []).push({ pieceId: lId, fromIdx: mirrored[i].fromIdx, toIdx: mirrored[i].toIdx, reverse: e.reverse })
          }
        })
      }
      if (schemaRole === 'bodice-front-side' || schemaRole === 'bodice-back-side') {
        placementHints[rId] = { ...(placementHints[rId] || {}), splitSide: 1, princessSide: 1 }
        placementHints[lId] = { ...(placementHints[lId] || {}), splitSide: -1, princessSide: -1 }
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
      } else if (hasSleeves && !jacketOuterFront && placement === 'frontPanel' && edges?.length >= 2) {
        // Non-fold bilateral jacket front (e.g. `mf11` declaring Neck + Side seams with unclaimed shoulder+armhole gap)
        const nEdge = edges.find((e) => e?.seamId && /Neck/i.test(e.seamId) && e.fromIdx === 0)
        const sEdge = edges.find((e) => e?.seamId && /Side/i.test(e.seamId))
        if (nEdge && sEdge && sEdge.fromIdx - nEdge.toIdx >= 3) {
          const shIdx = nEdge.toIdx + Math.max(1, Math.round((sEdge.fromIdx - nEdge.toIdx) * 0.42))
          const armMid = sEdge.fromIdx - shIdx >= 2 ? sEdge.fromIdx - 1 : shIdx
          const defs = [{ name: 'rightTop', fromIdx: nEdge.toIdx, toIdx: shIdx }]
          if (hasSleeveUnder && armMid > shIdx) {
            defs.push(
              { name: 'rightArmholeUpper', fromIdx: shIdx, toIdx: armMid },
              { name: 'rightArmholeLower', fromIdx: armMid, toIdx: sEdge.fromIdx },
            )
          } else {
            defs.push({ name: 'rightArmhole', fromIdx: shIdx, toIdx: sEdge.fromIdx })
          }
          const mDefs = mirrorEdgeIndices(defs, n)
          defs.forEach((d, idx) => {
            pushClaimedEdge(rId, d.name, d.fromIdx, d.toIdx, n)
            pushClaimedEdge(lId, d.name.replace(/^right/, 'left'), mDefs[idx].fromIdx, mDefs[idx].toIdx, n)
          })
          jacketOuterFront = {
            rId,
            lId,
            rShoulderEdge: 'rightTop',
            lShoulderEdge: 'leftTop',
            rArmEdge: hasSleeveUnder && armMid > shIdx ? 'rightArmholeUpper' : 'rightArmhole',
            rArmLowerEdge: hasSleeveUnder && armMid > shIdx ? 'rightArmholeLower' : null,
            lArmEdge: hasSleeveUnder && armMid > shIdx ? 'leftArmholeUpper' : 'leftArmhole',
            lArmLowerEdge: hasSleeveUnder && armMid > shIdx ? 'leftArmholeLower' : null,
          }
        }
      }
      recognized.push({ id: rId, label: label + ' (R)' })
      recognized.push({ id: lId, label: label + ' (L)' })
      continue
    }

    // Asymmetric open-front half-front panels (Case A: jacketSide open fronts; Case B: abaya-style un-edged half fronts)
    const isJacketSideOpenFront = placement === 'frontPanel' && Boolean(edges?.some((e) => e?.seamId && hasFoldBackBySeamId.has(e.seamId)))
    if (isJacketSideOpenFront) {
      const rId = p.id + '_r', lId = p.id + '_l'
      const n = local.length
      rawPieces.push({ id: rId, label: p.label, outline: local, color: p.color, darts: p.darts })
      rawPieces.push({ id: lId, label: p.label, outline: mirrorOutline(local), color: p.color, darts: (p.darts || []).map((d) => d.map(([x, y]) => [-x, y])) })
      roles[rId] = placement
      roles[lId] = placement
      placementHints[rId] = { splitSide: 1 }
      placementHints[lId] = { splitSide: -1 }
      const isVestFrontPiece = /\bvest\b|waistcoat|صديري/i.test(`${p.id || ''} ${label} ${(p.label && p.label.ar) || ''}`)
      layeredFronts.push({ ids: [rId, lId], layerRank: isVestFrontPiece ? 1 : 2 })
      const mirrored = mirrorEdgeIndices(edges, n)
      const rEdges = edges.map((e) => (e?.seamId && !foldSeamIds.has(e.seamId)) ? { ...e, seamId: e.seamId + '_R' } : e)
      const lEdges = mirrored.map((e) => (e?.seamId && !foldSeamIds.has(e.seamId)) ? { ...e, seamId: e.seamId + '_L' } : e)
      pushSeamIdEdges(rId, rEdges, n, { cutOnFold: false })
      pushSeamIdEdges(lId, lEdges, n, { cutOnFold: false })

      const nEdge = edges.find((e) => e?.seamId && /Neck/i.test(e.seamId) && e.fromIdx === 0)
      const sEdge = edges.find((e) => e?.seamId && e.seamId === 'jacketSide')
      if (isVestFrontPiece && nEdge && sEdge && sEdge.fromIdx > nEdge.toIdx) {
        const shIdx = nEdge.toIdx + Math.max(1, Math.round((sEdge.fromIdx - nEdge.toIdx) * 0.38))
        if (!hasInteriorOverlap(rId, n, nEdge.toIdx, shIdx)) {
          const shM = mirrorEdgeIndices([{ name: 'leftTop', fromIdx: nEdge.toIdx, toIdx: shIdx }], n)[0]
          pushClaimedEdge(rId, 'rightTop', nEdge.toIdx, shIdx, n)
          pushClaimedEdge(lId, 'leftTop', shM.fromIdx, shM.toIdx, n)
          vestFronts.push({ rId, lId, rShoulderEdge: 'rightTop', lShoulderEdge: 'leftTop' })
        }
      }
      if (sEdge && (sEdge.toIdx === n - 2 || sEdge.toIdx === n - 3) &&
        (isVestFrontPiece ||
          /^(?:wf06)$/i.test(payload.patternId || payload.designId || '') ||
          /peplum\s*blazer|فستان\s*بليزر/i.test(payload.designName || '') ||
          hasPeplumPieces)) {
        const cfFrom = sEdge.toIdx === n - 3 ? n - 2 : n - 1
        const cfTo = sEdge.toIdx === n - 3 ? n - 1 : 0
        const cfM = mirrorEdgeIndices([{ name: 'centerFront', fromIdx: cfFrom, toIdx: cfTo }], n)[0]
        if (!hasInteriorOverlap(rId, n, cfFrom, cfTo)) {
          pushClaimedEdge(rId, 'centerFront', cfFrom, cfTo, n)
          pushClaimedEdge(lId, 'centerFront', cfM.fromIdx, cfM.toIdx, n)
          closedBlazerFrontPairs.push({ rId, lId, edge: 'centerFront' })
        }
      }
      if (hasSleeves && !isVestFrontPiece && !jacketOuterFront && nEdge && sEdge && sEdge.fromIdx - nEdge.toIdx >= 3) {
        const shIdx = nEdge.toIdx + Math.max(1, Math.round((sEdge.fromIdx - nEdge.toIdx) * 0.42))
        const armMid = sEdge.fromIdx - shIdx >= 2 ? sEdge.fromIdx - 1 : shIdx
        const defs = [{ name: 'rightTop', fromIdx: nEdge.toIdx, toIdx: shIdx }]
        if (hasSleeveUnder && armMid > shIdx) {
          defs.push(
            { name: 'rightArmholeUpper', fromIdx: shIdx, toIdx: armMid },
            { name: 'rightArmholeLower', fromIdx: armMid, toIdx: sEdge.fromIdx },
          )
        } else {
          defs.push({ name: 'rightArmhole', fromIdx: shIdx, toIdx: sEdge.fromIdx })
        }
        const mDefs = mirrorEdgeIndices(defs, n)
        defs.forEach((d, idx) => {
          pushClaimedEdge(rId, d.name, d.fromIdx, d.toIdx, n)
          pushClaimedEdge(lId, d.name.replace(/^right/, 'left'), mDefs[idx].fromIdx, mDefs[idx].toIdx, n)
        })
        jacketOuterFront = {
          rId,
          lId,
          rShoulderEdge: 'rightTop',
          lShoulderEdge: 'leftTop',
          rArmEdge: hasSleeveUnder && armMid > shIdx ? 'rightArmholeUpper' : 'rightArmhole',
          rArmLowerEdge: hasSleeveUnder && armMid > shIdx ? 'rightArmholeLower' : null,
          lArmEdge: hasSleeveUnder && armMid > shIdx ? 'leftArmholeUpper' : 'leftArmhole',
          lArmLowerEdge: hasSleeveUnder && armMid > shIdx ? 'leftArmholeLower' : null,
        }
      }

      recognized.push({ id: rId, label: label + ' (R)' })
      recognized.push({ id: lId, label: label + ' (L)' })
      continue
    }

    const { minX: locMinX, maxX: locMaxX } = bbox(local)
    const locWidth = locMaxX - locMinX
    const isUnedgedHalfFront = placement === 'frontPanel' && !edges?.length &&
      unedgedFoldBackWidths.length === 1 &&
      locWidth <= unedgedFoldBackWidths[0] * 1.15 && locWidth >= unedgedFoldBackWidths[0] * 0.5
    if (isUnedgedHalfFront) {
      if (local.length === 4) {
        const armLocal = hasSleeves ? subdivideFoldBodiceArmhole(local) : local
        const rOutline = subdivideFoldBodiceNeckOpening(armLocal)
        const neckAdded = rOutline.length - armLocal.length
        const armAdded = armLocal.length - local.length
        if (rOutline.length >= 4 && neckAdded >= 1) {
          const rId = p.id + '_r', lId = p.id + '_l'
          const lOutline = mirrorOutline(rOutline)
          const rn = rOutline.length
          rawPieces.push({ id: rId, label: p.label, outline: rOutline, color: p.color, darts: p.darts })
          rawPieces.push({ id: lId, label: p.label, outline: lOutline, color: p.color, darts: (p.darts || []).map((d) => d.map(([x, y]) => [-x, y])) })
          roles[rId] = placement
          roles[lId] = placement
          placementHints[rId] = { splitSide: 1 }
          placementHints[lId] = { splitSide: -1 }
          const rDefs = [{ name: 'rightTop', lName: 'leftTop', fromIdx: neckAdded, toIdx: neckAdded + 1 }]
          if (hasSleeves && armAdded === 1 && neckAdded + 3 < rn) {
            rDefs.push(
              { name: 'rightArmhole', lName: 'leftArmhole', fromIdx: neckAdded + 1, toIdx: neckAdded + 2 },
              { name: 'rightSide', lName: 'leftSide', fromIdx: neckAdded + 2, toIdx: neckAdded + 3 },
            )
          } else if (neckAdded + 2 < rn) {
            rDefs.push({ name: 'rightSide', lName: 'leftSide', fromIdx: neckAdded + 1, toIdx: neckAdded + 2 })
          }
          const mDefs = mirrorEdgeIndices(rDefs, rn)
          rDefs.forEach((d, idx) => {
            pushClaimedEdge(rId, d.name, d.fromIdx, d.toIdx, rn)
            pushClaimedEdge(lId, d.lName, mDefs[idx].fromIdx, mDefs[idx].toIdx, rn)
          })
          openFrontPairs.push({ rId, lId })
          recognized.push({ id: rId, label: label + ' (R)' })
          recognized.push({ id: lId, label: label + ' (L)' })
          continue
        }
      } else if (local.length >= 8) {
        const curves = p.curves || p.outline?.curves || []
        const rId = p.id + '_r', lId = p.id + '_l'
        const rOutline = local
        const lOutline = mirrorOutline(rOutline)
        const rn = rOutline.length
        let rightSideEnd = 1, maxHemY = -Infinity
        for (let i = 1; i < rn - 1; i++) {
          if (rOutline[i][0] > 2 && rOutline[i][1] > maxHemY) {
            maxHemY = rOutline[i][1]
            rightSideEnd = i
          }
        }
        let crownIdx = 1, minCrownY = Infinity
        for (let i = 1; i < rightSideEnd - 1; i++) {
          if (rOutline[i][1] < minCrownY) {
            minCrownY = rOutline[i][1]
            crownIdx = i
          }
        }
        const nextPt = rOutline[crownIdx + 1]
        const curPt = rOutline[crownIdx]
        const shoulderIdx = (crownIdx + 1 < rightSideEnd && nextPt && (nextPt[0] - curPt[0]) > Math.abs(nextPt[1] - curPt[1]))
          ? crownIdx + 1
          : crownIdx
        let underarmIdx = shoulderIdx + 1 < rightSideEnd ? shoulderIdx + 1 : rightSideEnd
        const armCurve = curves.find((c) => c && c.fromIdx >= crownIdx && c.fromIdx <= shoulderIdx + 1 && c.toIdx > shoulderIdx && c.toIdx < rightSideEnd)
        if (armCurve) {
          underarmIdx = armCurve.toIdx
        } else {
          for (let i = shoulderIdx + 1; i < rightSideEnd; i++) {
            if (rOutline[i + 1][1] - rOutline[i][1] > (rOutline[rightSideEnd][1] - minCrownY) * 0.12) {
              underarmIdx = i
              break
            }
          }
        }
        if (rightSideEnd >= shoulderIdx + 1) {
          rawPieces.push({ id: rId, label: p.label, outline: rOutline, color: p.color, darts: p.darts })
          rawPieces.push({ id: lId, label: p.label, outline: lOutline, color: p.color, darts: (p.darts || []).map((d) => d.map(([x, y]) => [-x, y])) })
          roles[rId] = placement
          roles[lId] = placement
          placementHints[rId] = { splitSide: 1 }
          placementHints[lId] = { splitSide: -1 }
          const rDefs = []
          if (shoulderIdx > crownIdx) rDefs.push({ name: 'rightTop', lName: 'leftTop', fromIdx: crownIdx, toIdx: shoulderIdx })
          if (hasSleeves && underarmIdx > shoulderIdx && underarmIdx < rightSideEnd) {
            rDefs.push(
              { name: 'rightArmhole', lName: 'leftArmhole', fromIdx: shoulderIdx, toIdx: underarmIdx },
              { name: 'rightSide', lName: 'leftSide', fromIdx: underarmIdx, toIdx: rightSideEnd },
            )
          } else if (rightSideEnd > shoulderIdx) {
            rDefs.push({ name: 'rightSide', lName: 'leftSide', fromIdx: shoulderIdx, toIdx: rightSideEnd })
          }
          const mDefs = mirrorEdgeIndices(rDefs, rn)
          rDefs.forEach((d, idx) => {
            pushClaimedEdge(rId, d.name, d.fromIdx, d.toIdx, rn)
            pushClaimedEdge(lId, d.lName, mDefs[idx].fromIdx, mDefs[idx].toIdx, rn)
          })
          openFrontPairs.push({ rId, lId })
          recognized.push({ id: rId, label: label + ' (R)' })
          recognized.push({ id: lId, label: label + ' (L)' })
          continue
        }
      }
    }

    // Plain single piece — front-panel/back-panel/hip-panel-* not on fold, or attach-only role.
    const isUpperSingle = placement === 'frontPanel' || placement === 'backPanel'
    const isWrapFrontSingle = isUpperSingle && schemaRole !== 'lining' && Boolean(edges?.some((e) => e?.seamId === 'wrapCoatSide'))
    let singleOutline = local
    let effEdges = schemaRole === 'lining' && edges?.length
      ? edges.filter((e) => !e?.seamId || !nonLiningSeamIds.has(e.seamId))
      : edges
    let wrapFrontSub = 0
    if (isWrapFrontSingle && hasSleeves && effEdges?.[0]?.fromIdx === 1) {
      const sub = insertSegmentSubdivisions(singleOutline, effEdges, 0, hasSleeveUnder ? [0.24, 0.56, 0.84] : [0.24, 0.58])
      wrapFrontSub = sub.outline.length - singleOutline.length
      singleOutline = sub.outline
      effEdges = sub.edges
    } else if (hasBriefPanels && placement === 'attachWaist' && !effEdges?.length && singleOutline.length === 4 && !briefWaistId && hasBriefWaistElastic) {
      const midX = 0.5 * (singleOutline[0][0] + singleOutline[1][0])
      singleOutline = [
        singleOutline[0], [midX, singleOutline[0][1]], singleOutline[1],
        singleOutline[2], [midX, singleOutline[2][1]], singleOutline[3],
      ]
      rawPieces.push({ id: p.id, label: p.label, outline: singleOutline, color: p.color, darts: p.darts })
      roles[p.id] = placement
      pushClaimedEdge(p.id, 'waistEndBack', 2, 3, 6)
      pushClaimedEdge(p.id, 'waistAttachBack', 3, 4, 6)
      pushClaimedEdge(p.id, 'waistAttachFront', 4, 5, 6)
      pushClaimedEdge(p.id, 'waistEndFront', 5, 0, 6)
      briefWaistId = p.id
      placementHints[p.id] = {
        ...(placementHints[p.id] || {}),
        isBriefWaist: true,
        sewnBriefWaist: true,
        hasBriefLeg: Boolean(briefMeta?.hasBriefLeg),
        briefRiseCm: briefMeta?.riseCm ?? 12,
      }
      recognized.push({ id: p.id, label })
      continue
    } else if (hasSleeves && isUpperSingle && !effEdges?.length) {
      singleOutline = subdivideFullRectBodiceArmhole(local)
    }
    rawPieces.push({ id: p.id, label: p.label, outline: singleOutline, color: p.color, darts: p.darts })
    roles[p.id] = placement
    if (isWrapFrontSingle) {
      const isLeftHalf = p.outline[1][0] < p.outline[0][0] - 0.5
      placementHints[p.id] = { ...(placementHints[p.id] || {}), splitSide: isLeftHalf ? -1 : 1 }
    }
    const isMultiWrapPiece = Boolean(effEdges?.some((e) => e && e.seamId && seamIdCounts[e.seamId] === 3))
    if (isWrapFrontSingle && wrapFrontSub >= 2) {
      bySlot[placement].push({ id: p.id, label })
      const wrapSideStart = effEdges[0].fromIdx
      const shStart = 1
      const armStart = 2
      const isLeftHalf = p.outline[1][0] < p.outline[0][0] - 0.5
      if (isLeftHalf) {
        pushClaimedEdge(p.id, 'leftTop', shStart, armStart, singleOutline.length)
        if (hasSleeveUnder && wrapFrontSub >= 3) {
          pushClaimedEdge(p.id, 'leftArmholeUpper', armStart, armStart + 1, singleOutline.length)
          pushClaimedEdge(p.id, 'leftArmholeLower', armStart + 1, wrapSideStart, singleOutline.length)
          wrapCoatFrontL = { pieceId: p.id, shoulderEdge: 'leftTop', armEdge: 'leftArmholeUpper', armLowerEdge: 'leftArmholeLower' }
        } else {
          pushClaimedEdge(p.id, 'leftArmhole', armStart, wrapSideStart, singleOutline.length)
          wrapCoatFrontL = { pieceId: p.id, shoulderEdge: 'leftTop', armEdge: 'leftArmhole', armLowerEdge: null }
        }
      } else {
        pushClaimedEdge(p.id, 'rightTop', shStart, armStart, singleOutline.length)
        if (hasSleeveUnder && wrapFrontSub >= 3) {
          pushClaimedEdge(p.id, 'rightArmholeUpper', armStart, armStart + 1, singleOutline.length)
          pushClaimedEdge(p.id, 'rightArmholeLower', armStart + 1, wrapSideStart, singleOutline.length)
          wrapCoatFrontR = { pieceId: p.id, shoulderEdge: 'rightTop', armEdge: 'rightArmholeUpper', armLowerEdge: 'rightArmholeLower' }
        } else {
          pushClaimedEdge(p.id, 'rightArmhole', armStart, wrapSideStart, singleOutline.length)
          wrapCoatFrontR = { pieceId: p.id, shoulderEdge: 'rightTop', armEdge: 'rightArmhole', armLowerEdge: null }
        }
      }
    } else if (autoTorsoSeams && (placement === 'frontPanel' || placement === 'backPanel' || placement === 'hipPanelFront' || placement === 'hipPanelBack')) {
      if (isMultiWrapPiece) {
        bySlot[placement].push({ id: p.id, label })
      } else if (
        placement === 'hipPanelFront' && !effEdges?.length && singleOutline.length >= 4 && !cutOnFold &&
        Math.abs(singleOutline[0][1] - singleOutline[1][1]) < 0.5 && singleOutline[1][0] - singleOutline[0][0] > 20
      ) {
        let rightBot = 2
        for (let i = 2; i < singleOutline.length - 1; i++) {
          if (Math.abs(singleOutline[i][0] - singleOutline[1][0]) < 0.5) {
            rightBot = i
            break
          }
        }
        const leftBot = singleOutline.length - 1
        bySlot.hipPanelFront.push({ id: p.id, label })
        pushClaimedEdge(p.id, 'rightSide', 1, rightBot, singleOutline.length)
        pushClaimedEdge(p.id, 'leftSide', leftBot, 0, singleOutline.length)
      } else {
        const geo = hasSleeves && isUpperSingle
          ? deriveSleevedTorsoEdges(singleOutline, { includeTop: true, edges: effEdges, curves: p.curves || p.outline?.curves })
          : deriveTorsoEdgeInstructions(singleOutline, { includeTop: isUpperSingle })
        if (geo.some((e) => e.name === 'rightSide') && geo.some((e) => e.name === 'leftSide')) {
          bySlot[placement].push({ id: p.id, label })
          for (const e of geo) pushClaimedEdge(p.id, e.name, e.from, e.to, singleOutline.length)
        }
      }
    }
    pushSeamIdEdges(p.id, effEdges, singleOutline.length, { cutOnFold: false })
    if (schemaRole === 'tier') {
      const tierIds = activePieces.filter((ap) => resolveSchemaRole(ap.role)?.role === 'tier').map((ap) => ap.id)
      const tierIdx = Math.max(0, tierIds.indexOf(p.id))
      placementHints[p.id] = {
        ...(placementHints[p.id] || {}),
        isSkirtTier: true,
        tierIndex: tierIdx,
        tierCount: tierIds.length,
        hasUpperBodice: hasUpperPanels,
      }
    }
    if (placement === 'attachNeck') {
      placementHints[p.id] = { ...(placementHints[p.id] || {}), neckKind: schemaRole }
    }
    if (hasBriefPanels && placement === 'attachWaist') {
      placementHints[p.id] = {
        ...(placementHints[p.id] || {}),
        isBriefWaist: true,
        hasBriefLeg: Boolean(briefMeta?.hasBriefLeg),
        briefRiseCm: briefMeta?.riseCm ?? 12,
      }
    }
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

  // 2-piece sleeves (`sleeve-upper` + `sleeve-under`): join frontSeam and backSeam per R/L side
  const twoPieceCount = Math.min(twoPieceSleeves.upper.length, twoPieceSleeves.under.length)
  for (let i = 0; i < twoPieceCount; i++) {
    const up = twoPieceSleeves.upper[i], dn = twoPieceSleeves.under[i]
    const capOffsetCm = Math.max(0, (up.heightCm || 0) - (dn.heightCm || 0))
    if (capOffsetCm > 0.5) {
      if (dn.rId) placementHints[dn.rId] = { ...(placementHints[dn.rId] || {}), capOffsetCm }
      if (dn.lId) placementHints[dn.lId] = { ...(placementHints[dn.lId] || {}), capOffsetCm }
    }
    for (const [tag, uId, dId] of [['R', up.rId, dn.rId], ['L', up.lId, dn.lId]]) {
      if (!uId || !dId) continue
      const uPiece = rawPieces.find((p) => p.id === uId)
      const dPiece = rawPieces.find((p) => p.id === dId)
      if (!uPiece || !dPiece) continue
      for (const edgeName of ['frontSeam', 'backSeam']) {
        const ue = edgeInstructions.find((e) => e.pieceId === uId && e.edgeName === edgeName)
        const de = edgeInstructions.find((e) => e.pieceId === dId && e.edgeName === edgeName)
        if (!ue || !de) continue
        const dyU = uPiece.outline[ue.toIdx][1] - uPiece.outline[ue.fromIdx][1]
        const dyD = dPiece.outline[de.toIdx][1] - dPiece.outline[de.fromIdx][1]
        seamInstructions.push({
          id: `twoPcSleeve_${i}_${tag}_${edgeName}`,
          a: { piece: uId, edge: edgeName },
          b: { piece: dId, edge: edgeName },
          reverse: dyU * dyD < 0,
        })
      }
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

  // Fitted 4-panel dress waist join (`womens_dress`): connect bodice bottom waist to
  // skirt top waist when widths match closely and no separate waistband exists.
  if (
    bySlot.frontPanel.length === 1 && bySlot.backPanel.length === 1 &&
    bySlot.hipPanelFront.length === 1 && bySlot.hipPanelBack.length === 1 &&
    !Object.values(roles).some((r) => r === 'attachWaist' || r === 'attachWaistBack')
  ) {
    for (const [uId, lId, tag] of [
      [bySlot.frontPanel[0].id, bySlot.hipPanelFront[0].id, 'front'],
      [bySlot.backPanel[0].id, bySlot.hipPanelBack[0].id, 'back'],
    ]) {
      const uPiece = rawPieces.find((p) => p.id === uId)
      const lPiece = rawPieces.find((p) => p.id === lId)
      const uR = edgeInstructions.find((e) => e.pieceId === uId && e.edgeName === 'rightSide')
      const uL = edgeInstructions.find((e) => e.pieceId === uId && e.edgeName === 'leftSide')
      const lR = edgeInstructions.find((e) => e.pieceId === lId && e.edgeName === 'rightSide')
      const lL = edgeInstructions.find((e) => e.pieceId === lId && e.edgeName === 'leftSide')
      if (uPiece && lPiece && uR && uL && lR && lL) {
        const uFrom = uR.toIdx, uTo = uL.fromIdx
        const lFrom = lL.toIdx, lTo = lR.fromIdx
        if (
          uFrom !== uTo && lFrom !== lTo &&
          !hasInteriorOverlap(uId, uPiece.outline.length, uFrom, uTo) &&
          !hasInteriorOverlap(lId, lPiece.outline.length, lFrom, lTo)
        ) {
          const uLen = edgeArcLen(uPiece.outline, uFrom, uTo)
          const lLen = edgeArcLen(lPiece.outline, lFrom, lTo)
          if (uLen > 12 && lLen > 12 && Math.max(uLen, lLen) / Math.min(uLen, lLen) <= 1.25) {
            pushClaimedEdge(uId, 'waistBottom', uFrom, uTo, uPiece.outline.length)
            pushClaimedEdge(lId, 'waistTop', lFrom, lTo, lPiece.outline.length)
            addOrientedSeam(`dressWaist_${tag}`, uId, 'waistBottom', lId, 'waistTop', null, true)
          }
        }
      }
    }
  }

  // Underwear brief/trunk closure: weld crotch gusset, waistband elastic, and bilateral leg elastics
  if (briefFrontId && briefBackId && briefGussets.length > 0 && hasEdge(briefFrontId, 'crotchSeam') && hasEdge(briefBackId, 'crotchSeam')) {
    const gId = briefGussets[0]
    if (hasEdge(gId, 'gussetFront')) {
      seamInstructions.push({ id: 'briefCrotch_front', a: { piece: briefFrontId, edge: 'crotchSeam' }, b: { piece: gId, edge: 'gussetFront' }, reverse: true })
    }
    if (hasEdge(gId, 'gussetBack')) {
      seamInstructions.push({ id: 'briefCrotch_back', a: { piece: briefBackId, edge: 'crotchSeam' }, b: { piece: gId, edge: 'gussetBack' }, reverse: false })
    }
  }
  if (briefFrontId && briefBackId && briefWaistId && hasEdge(briefFrontId, 'waistSeam') && hasEdge(briefBackId, 'waistSeam')) {
    seamInstructions.push(
      { id: 'briefWaist_front', a: { piece: briefFrontId, edge: 'waistSeam' }, b: { piece: briefWaistId, edge: 'waistAttachFront' }, reverse: true },
      { id: 'briefWaist_back', a: { piece: briefBackId, edge: 'waistSeam' }, b: { piece: briefWaistId, edge: 'waistAttachBack' }, reverse: false },
      { id: 'briefWaist_close', a: { piece: briefWaistId, edge: 'waistEndBack' }, b: { piece: briefWaistId, edge: 'waistEndFront' }, reverse: true },
    )
  }
  if (briefFrontId && briefBackId && briefLegPair && hasEdge(briefFrontId, 'rightLegOpening') && hasEdge(briefBackId, 'rightLegOpening')) {
    const { rId, lId } = briefLegPair
    seamInstructions.push(
      { id: 'briefLegR_front', a: { piece: briefFrontId, edge: 'rightLegOpening' }, b: { piece: rId, edge: 'legAttachFront' }, reverse: false },
      { id: 'briefLegR_back', a: { piece: briefBackId, edge: 'rightLegOpening' }, b: { piece: rId, edge: 'legAttachBack' }, reverse: true },
      { id: 'briefLegR_close', a: { piece: rId, edge: 'legEndBack' }, b: { piece: rId, edge: 'legEndFront' }, reverse: true },
      { id: 'briefLegL_front', a: { piece: briefFrontId, edge: 'leftLegOpening' }, b: { piece: lId, edge: 'legAttachFront' }, reverse: false },
      { id: 'briefLegL_back', a: { piece: briefBackId, edge: 'leftLegOpening' }, b: { piece: lId, edge: 'legAttachBack' }, reverse: true },
      { id: 'briefLegL_close', a: { piece: lId, edge: 'legEndFront' }, b: { piece: lId, edge: 'legEndBack' }, reverse: true },
    )
  }

  // Open-front un-edged pairs (`abaya`): join right/left front halves to single backPanel with vertical/horizontal orientation check
  if (openFrontPairs.length === 1 && bySlot.backPanel.length === 1) {
    const { rId, lId } = openFrontPairs[0]
    const b = bySlot.backPanel[0].id
    if (hasEdge(rId, 'rightTop') && hasEdge(b, 'rightTop')) {
      addOrientedSeam('openFront_rightTop', rId, 'rightTop', b, 'rightTop', null, true)
    }
    if (hasEdge(lId, 'leftTop') && hasEdge(b, 'leftTop')) {
      addOrientedSeam('openFront_leftTop', lId, 'leftTop', b, 'leftTop', null, true)
    }
    if (hasEdge(rId, 'rightSide') && hasEdge(b, 'rightSide')) {
      addOrientedSeam('openFront_rightSide', rId, 'rightSide', b, 'rightSide', null, false)
    }
    if (hasEdge(lId, 'leftSide') && hasEdge(b, 'leftSide')) {
      addOrientedSeam('openFront_leftSide', lId, 'leftSide', b, 'leftSide', null, false)
    }
    const rPc = rawPieces.find((rp) => rp.id === rId)
    const lPc = rawPieces.find((rp) => rp.id === lId)
    const designTitle = `${payload.designId || payload.patternId || ''} ${payload.designName || ''} ${rPc?.label?.en || rPc?.label || ''}`
    if (
      rPc && lPc && rPc.outline.length >= 8 && lPc.outline.length === rPc.outline.length &&
      !/open|cardigan|kimono|coat|jacket|blazer|vest|cape|sherwani|كارديجان|كيمونو|معطف|جاكيت|بليزر/i.test(designTitle)
    ) {
      const rn = rPc.outline.length
      const cfM = mirrorEdgeIndices([{ name: 'centerFront', fromIdx: rn - 1, toIdx: 0 }], rn)[0]
      if (!hasInteriorOverlap(rId, rn, rn - 1, 0) && !hasInteriorOverlap(lId, rn, cfM.fromIdx, cfM.toIdx)) {
        pushClaimedEdge(rId, 'centerFront', rn - 1, 0, rn)
        pushClaimedEdge(lId, 'centerFront', cfM.fromIdx, cfM.toIdx, rn)
        addOrientedSeam('openFront_centerFront', rId, 'centerFront', lId, 'centerFront', null, false)
      }
    }
  }

  // Single full-width hip panel skirt (`girls_dress`): close rightSide <-> leftSide into a tube
  if (bySlot.hipPanelFront.length === 1 && bySlot.hipPanelBack.length === 0) {
    const f = bySlot.hipPanelFront[0].id
    const fPiece = rawPieces.find((p) => p.id === f)
    const hasAuthoredSeam = edgeInstructions.some((e) => e.pieceId === f && e.edgeName.startsWith('seamId_'))
    if (fPiece?.outline?.length >= 4 && !hasAuthoredSeam && hasEdge(f, 'rightSide') && hasEdge(f, 'leftSide')) {
      seamInstructions.push({ id: 'hipPanelFront_tube', a: { piece: f, edge: 'rightSide' }, b: { piece: f, edge: 'leftSide' }, reverse: true })
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

  // Outer jacket / wrap-coat shoulder seams (connect front shoulder <-> back shoulder on R & L)
  if (jacketOuterFront && jacketOuterBack) {
    addOrientedSeam('jacketShoulder_R', jacketOuterFront.rId, jacketOuterFront.rShoulderEdge, jacketOuterBack.pieceId, jacketOuterBack.rShoulderEdge, false, true)
    addOrientedSeam('jacketShoulder_L', jacketOuterFront.lId, jacketOuterFront.lShoulderEdge, jacketOuterBack.pieceId, jacketOuterBack.lShoulderEdge, false, true)
  }
  if (vestFronts.length === 1 && vestBacks.length === 1) {
    const vf = vestFronts[0], vb = vestBacks[0]
    addOrientedSeam('vestShoulder_R', vf.rId, vf.rShoulderEdge, vb.pieceId, vb.rShoulderEdge, false, true)
    addOrientedSeam('vestShoulder_L', vf.lId, vf.lShoulderEdge, vb.pieceId, vb.lShoulderEdge, false, true)
  }
  closedBlazerFrontPairs.forEach((cf, idx) => {
    addOrientedSeam(idx === 0 ? 'blazerCenterFront' : `blazerCenterFront_${idx}`, cf.rId, cf.edge, cf.lId, cf.edge, null, false)
  })
  if (peplumFronts.length === 1 && peplumBacks.length === 1) {
    const pf = peplumFronts[0], pb = peplumBacks[0]
    const fSides = deriveTorsoEdgeInstructions(pf.outline, { includeTop: false })
    const bSides = deriveTorsoEdgeInstructions(pb.outline, { includeTop: false })
    const fr = fSides.find((e) => e.name === 'rightSide'), fl = fSides.find((e) => e.name === 'leftSide')
    const br = bSides.find((e) => e.name === 'rightSide'), bl = bSides.find((e) => e.name === 'leftSide')
    if (fr && br && !hasInteriorOverlap(pf.id, pf.outline.length, fr.from, fr.to) && !hasInteriorOverlap(pb.id, pb.outline.length, br.from, br.to)) {
      pushClaimedEdge(pf.id, 'peplumRightSide', fr.from, fr.to, pf.outline.length)
      pushClaimedEdge(pb.id, 'peplumRightSide', br.from, br.to, pb.outline.length)
      addOrientedSeam('peplumSide_R', pf.id, 'peplumRightSide', pb.id, 'peplumRightSide', null, false)
    }
    if (fl && bl && !hasInteriorOverlap(pf.id, pf.outline.length, fl.from, fl.to) && !hasInteriorOverlap(pb.id, pb.outline.length, bl.from, bl.to)) {
      pushClaimedEdge(pf.id, 'peplumLeftSide', fl.from, fl.to, pf.outline.length)
      pushClaimedEdge(pb.id, 'peplumLeftSide', bl.from, bl.to, pb.outline.length)
      addOrientedSeam('peplumSide_L', pf.id, 'peplumLeftSide', pb.id, 'peplumLeftSide', null, false)
    }
  }
  if (wrapCoatFrontR && wrapCoatBack) {
    addOrientedSeam('wrapCoatShoulder_R', wrapCoatFrontR.pieceId, wrapCoatFrontR.shoulderEdge, wrapCoatBack.pieceId, wrapCoatBack.rShoulderEdge, false, true)
  }
  if (wrapCoatFrontL && wrapCoatBack) {
    addOrientedSeam('wrapCoatShoulder_L', wrapCoatFrontL.pieceId, wrapCoatFrontL.shoulderEdge, wrapCoatBack.pieceId, wrapCoatBack.lShoulderEdge, false, true)
  }
  if (wrapCoatFrontR && wrapCoatFrontL && wrapCoatBack) {
    const rPc = rawPieces.find((rp) => rp.id === wrapCoatFrontR.pieceId)
    const lPc = rawPieces.find((rp) => rp.id === wrapCoatFrontL.pieceId)
    const coatH = rPc ? (Math.max(...rPc.outline.map((q) => q[1])) - Math.min(...rPc.outline.map((q) => q[1]))) : 0
    const designTitle = `${payload.designId || payload.patternId || ''} ${payload.designName || ''}`
    if (
      rPc && lPc && coatH > 48 &&
      !/\b(open|trench|cardigan|kimono)\b|مفتوح|ترنش|كارديجان/i.test(designTitle)
    ) {
      const rN = rPc.outline.length, lN = lPc.outline.length
      if (!hasInteriorOverlap(rPc.id, rN, rN - 1, 0) && !hasInteriorOverlap(lPc.id, lN, lN - 1, 0)) {
        pushClaimedEdge(rPc.id, 'centerFront', rN - 1, 0, rN)
        pushClaimedEdge(lPc.id, 'centerFront', lN - 1, 0, lN)
        addOrientedSeam('wrapCoatCenterFront', rPc.id, 'centerFront', lPc.id, 'centerFront', null, false)
      }
    }
  }

  // Helper: ensures a multi-point armhole edge can split into Upper + Lower sub-edges when sewing 2-piece sleeves
  const ensureSplitArmhole = (pieceId, edgeName) => {
    const instIdx = edgeInstructions.findIndex((e) => e.pieceId === pieceId && e.edgeName === edgeName)
    if (instIdx < 0) return { upper: edgeName, lower: null }
    const inst = edgeInstructions[instIdx]
    const pc = rawPieces.find((p) => p.id === pieceId)
    if (!pc?.outline?.length) return { upper: edgeName, lower: null }
    const n = pc.outline.length
    const chain = []
    let cur = inst.fromIdx, guard = 0
    while (true) {
      chain.push(cur)
      if (cur === inst.toIdx) break
      cur = (cur + 1) % n
      if (++guard > n) return { upper: edgeName, lower: null }
    }
    if (chain.length < 3) return { upper: edgeName, lower: null }
    // Pick the penultimate point along the armhole toward underarm (y max end)
    const fromY = pc.outline[inst.fromIdx][1], toY = pc.outline[inst.toIdx][1]
    const splitPt = toY >= fromY ? chain[chain.length - 2] : chain[1]
    const uName = `${edgeName}_upper`
    const lName = `${edgeName}_lower`
    edgeInstructions.splice(instIdx, 1)
    if (toY >= fromY) {
      pushEdge(pieceId, uName, inst.fromIdx, splitPt)
      pushEdge(pieceId, lName, splitPt, inst.toIdx)
    } else {
      pushEdge(pieceId, lName, inst.fromIdx, splitPt)
      pushEdge(pieceId, uName, splitPt, inst.toIdx)
    }
    return { upper: uName, lower: lName }
  }

  // Automatic Sleeve Cap -> Front & Back Bodice / Jacket Armhole seams (1-piece AND 2-piece sleeves!)
  if (sleevePairs.length >= 1 || twoPieceCount >= 1) {
    let armTargets = null
    if (princessSides.front.length === 1 && princessSides.back.length === 1) {
      const fs = princessSides.front[0], bs = princessSides.back[0]
      if (hasEdge(fs.rId, 'armhole') && hasEdge(bs.rId, 'armhole')) {
        armTargets = {
          rightFront: { piece: fs.rId, edge: 'armhole' },
          rightBack: { piece: bs.rId, edge: 'armhole' },
          leftFront: hasEdge(fs.lId, 'armhole') ? { piece: fs.lId, edge: 'armhole' } : null,
          leftBack: hasEdge(bs.lId, 'armhole') ? { piece: bs.lId, edge: 'armhole' } : null,
        }
      }
    } else if (jacketOuterFront && jacketOuterBack) {
      armTargets = {
        rightFront: { piece: jacketOuterFront.rId, edge: jacketOuterFront.rArmEdge, lowerEdge: jacketOuterFront.rArmLowerEdge },
        rightBack: { piece: jacketOuterBack.pieceId, edge: jacketOuterBack.rArmEdge, lowerEdge: jacketOuterBack.rArmLowerEdge },
        leftFront: { piece: jacketOuterFront.lId, edge: jacketOuterFront.lArmEdge, lowerEdge: jacketOuterFront.lArmLowerEdge },
        leftBack: { piece: jacketOuterBack.pieceId, edge: jacketOuterBack.lArmEdge, lowerEdge: jacketOuterBack.lArmLowerEdge },
      }
    } else if (wrapCoatFrontR && wrapCoatFrontL && wrapCoatBack) {
      armTargets = {
        rightFront: { piece: wrapCoatFrontR.pieceId, edge: wrapCoatFrontR.armEdge, lowerEdge: wrapCoatFrontR.armLowerEdge },
        rightBack: { piece: wrapCoatBack.pieceId, edge: wrapCoatBack.rArmEdge, lowerEdge: wrapCoatBack.rArmLowerEdge },
        leftFront: { piece: wrapCoatFrontL.pieceId, edge: wrapCoatFrontL.armEdge, lowerEdge: wrapCoatFrontL.armLowerEdge },
        leftBack: { piece: wrapCoatBack.pieceId, edge: wrapCoatBack.lArmEdge, lowerEdge: wrapCoatBack.lArmLowerEdge },
      }
    } else if (bySlot.frontPanel.length === 1 && bySlot.backPanel.length === 1) {
      const f = bySlot.frontPanel[0].id, b = bySlot.backPanel[0].id
      if (hasEdge(f, 'rightArmhole') && hasEdge(b, 'rightArmhole')) {
        armTargets = {
          rightFront: { piece: f, edge: 'rightArmhole' },
          rightBack: { piece: b, edge: 'rightArmhole' },
          leftFront: hasEdge(f, 'leftArmhole') ? { piece: f, edge: 'leftArmhole' } : null,
          leftBack: hasEdge(b, 'leftArmhole') ? { piece: b, edge: 'leftArmhole' } : null,
        }
      }
    } else if (openFrontPairs.length === 1 && bySlot.backPanel.length === 1) {
      const { rId, lId } = openFrontPairs[0], b = bySlot.backPanel[0].id
      if (hasEdge(rId, 'rightArmhole') && hasEdge(b, 'rightArmhole')) {
        armTargets = {
          rightFront: { piece: rId, edge: 'rightArmhole' },
          rightBack: { piece: b, edge: 'rightArmhole' },
          leftFront: hasEdge(lId, 'leftArmhole') ? { piece: lId, edge: 'leftArmhole' } : null,
          leftBack: hasEdge(b, 'leftArmhole') ? { piece: b, edge: 'leftArmhole' } : null,
        }
      }
    }

    if (armTargets && sleevePairs.length >= 1) {
      const primarySleeve = sleevePairs[0]
      addOrientedSeam(`${primarySleeve.rightId}_capFront`, armTargets.rightFront.piece, armTargets.rightFront.edge, primarySleeve.rightId, 'capFront')
      addOrientedSeam(`${primarySleeve.rightId}_capBack`, armTargets.rightBack.piece, armTargets.rightBack.edge, primarySleeve.rightId, 'capBack')
      if (primarySleeve.leftId && armTargets.leftFront && armTargets.leftBack) {
        addOrientedSeam(`${primarySleeve.leftId}_capFront`, armTargets.leftFront.piece, armTargets.leftFront.edge, primarySleeve.leftId, 'capFront')
        addOrientedSeam(`${primarySleeve.leftId}_capBack`, armTargets.leftBack.piece, armTargets.leftBack.edge, primarySleeve.leftId, 'capBack')
      }
    }

    if (armTargets && twoPieceCount >= 1) {
      const up = twoPieceSleeves.upper[0], dn = twoPieceSleeves.under[0]
      const sides = [['R', up.rId, dn.rId, armTargets.rightFront, armTargets.rightBack]]
      if (up.lId && dn.lId && armTargets.leftFront && armTargets.leftBack) {
        sides.push(['L', up.lId, dn.lId, armTargets.leftFront, armTargets.leftBack])
      }
      for (const [tag, uId, dId, fTgt, bTgt] of sides) {
        const fSplit = fTgt.lowerEdge ? { upper: fTgt.edge, lower: fTgt.lowerEdge } : ensureSplitArmhole(fTgt.piece, fTgt.edge)
        const bSplit = bTgt.lowerEdge ? { upper: bTgt.edge, lower: bTgt.lowerEdge } : ensureSplitArmhole(bTgt.piece, bTgt.edge)
        addOrientedSeam(`${uId}_capFront_${tag}`, fTgt.piece, fSplit.upper, uId, 'capFront')
        addOrientedSeam(`${uId}_capBack_${tag}`, bTgt.piece, bSplit.upper, uId, 'capBack')
        if (fSplit.lower && hasEdge(dId, 'capUnderFront')) {
          addOrientedSeam(`${dId}_capUnderFront_${tag}`, fTgt.piece, fSplit.lower, dId, 'capUnderFront')
        }
        if (bSplit.lower && hasEdge(dId, 'capUnderBack')) {
          addOrientedSeam(`${dId}_capUnderBack_${tag}`, bTgt.piece, bSplit.lower, dId, 'capUnderBack')
        }
      }
    }
  }

  resolveGoreSeamTargets(goreByRole, edgeInstructions, seamInstructions, pushClaimedEdge, pairGoresAsHipPanels, placementHints)

  // Merge multi-layer sibling hints BEFORE lazy 3D untwisting so placed layers reflect their offset.
  for (const members of Object.values(bySlot)) {
    if (members.length > 1) {
      members.forEach((m, i) => { placementHints[m.id] = { ...(placementHints[m.id] || {}), index: i, count: members.length } })
    }
  }
  for (const group of [layeredFronts, layeredBacks]) {
    if (group.length > 1) {
      group.sort((a, b) => (a.layerRank ?? 2) - (b.layerRank ?? 2))
      group.forEach((entry, i) => {
        for (const id of entry.ids) placementHints[id] = { ...(placementHints[id] || {}), index: i, count: group.length }
      })
    }
  }

  // Lazy memoized 3D endpoint orienter for ambiguous 2-contributor body/vertical seams
  let placedCache = null
  const getPlaced3D = (pieceId) => {
    if (!payload.measurements) return null
    if (!placedCache) placedCache = new Map()
    if (placedCache.has(pieceId)) return placedCache.get(pieceId)
    const piece = rawPieces.find((rp) => rp.id === pieceId)
    const role = roles[pieceId]
    if (!piece?.outline?.length || !role) { placedCache.set(pieceId, null); return null }
    const dims = computeBodyDims(payload.measurements, payload.category || 'women')
    const placed = placePiece({ pieceId, role, positions2D: piece.outline, placementHint: placementHints[pieceId] }, dims, 'standing')
    placedCache.set(pieceId, placed)
    return placed
  }
  const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])

  // Sew 18 cup-bra designs (`wb01..gb10`) that declare no seam edges:
  // connect Center Bridge <-> R/L Cups <-> R/L Back Bands <-> Back Closure & R/L Straps.
  {
    const cupR = rawPieces.find((p) => roles[p.id] === 'attachBust' && p.id.endsWith('_r') && p.outline.length === 21)
    const cupL = rawPieces.find((p) => roles[p.id] === 'attachBust' && p.id.endsWith('_l') && p.outline.length === 21)
    const bridgeP = rawPieces.find((p) => roles[p.id] === 'attachBust' && !p.id.endsWith('_r') && !p.id.endsWith('_l') && p.outline.length === 16)
    const bandR = rawPieces.find((p) => roles[p.id] === 'attachUnderbust' && p.id.endsWith('_r') && p.outline.length === 9)
    const bandL = rawPieces.find((p) => roles[p.id] === 'attachUnderbust' && p.id.endsWith('_l') && p.outline.length === 9)
    const strapR = rawPieces.find((p) => roles[p.id] === 'attachStrap' && p.id.endsWith('_r') && p.outline.length === 4)
    const strapL = rawPieces.find((p) => roles[p.id] === 'attachStrap' && p.id.endsWith('_l') && p.outline.length === 4)
    const hasCupSeamAlready = seamInstructions.some((s) =>
      [cupR?.id, cupL?.id, bridgeP?.id, bandR?.id, bandL?.id].includes(s.a.piece) ||
      [cupR?.id, cupL?.id, bridgeP?.id, bandR?.id, bandL?.id].includes(s.b.piece),
    )
    if (cupR && cupL && bridgeP && bandR && bandL && !hasCupSeamAlready) {
      const hasStraps = Boolean(strapR && strapL)
      const braPieces = hasStraps
        ? [cupR, cupL, bridgeP, bandR, bandL, strapR, strapL]
        : [cupR, cupL, bridgeP, bandR, bandL]
      for (const bp of braPieces) {
        placementHints[bp.id] = {
          ...(placementHints[bp.id] || {}),
          sewnCupBra: true,
          pinTopForStrapless: !hasStraps,
        }
      }
      if (placedCache) placedCache.clear()

      pushClaimedEdge(bridgeP.id, 'bridgeRight', 6, 7, 16)
      pushClaimedEdge(bridgeP.id, 'bridgeLeft', 9, 10, 16)
      pushClaimedEdge(cupR.id, 'cupInner', 20, 0, 21)
      pushClaimedEdge(cupR.id, 'cupWing', 12, 16, 21)
      pushClaimedEdge(cupL.id, 'cupInner', 20, 0, 21)
      pushClaimedEdge(cupL.id, 'cupWing', 4, 8, 21)
      pushClaimedEdge(bandR.id, 'bandInner', 0, 1, 9)
      pushClaimedEdge(bandR.id, 'bandBack', 7, 8, 9)
      pushClaimedEdge(bandL.id, 'bandInner', 7, 8, 9)
      pushClaimedEdge(bandL.id, 'bandBack', 0, 1, 9)
      if (hasStraps) {
        pushClaimedEdge(cupR.id, 'cupApex', 5, 7, 21)
        pushClaimedEdge(cupL.id, 'cupApex', 13, 15, 21)
        pushClaimedEdge(bandR.id, 'bandStrap', 6, 7, 9)
        pushClaimedEdge(bandL.id, 'bandStrap', 1, 2, 9)
        pushClaimedEdge(strapR.id, 'strapFront', 0, 1, 4)
        pushClaimedEdge(strapR.id, 'strapBack', 2, 3, 4)
        pushClaimedEdge(strapL.id, 'strapFront', 2, 3, 4)
        pushClaimedEdge(strapL.id, 'strapBack', 0, 1, 4)
      }

      const pushOrientedBraSeam = (id, pAId, edgeA, pBId, edgeB, defaultRev = false) => {
        const eA = edgeInstructions.find((e) => e.pieceId === pAId && e.edgeName === edgeA)
        const eB = edgeInstructions.find((e) => e.pieceId === pBId && e.edgeName === edgeB)
        if (!eA || !eB) return
        let rev = defaultRev
        const p3A = getPlaced3D(pAId), p3B = getPlaced3D(pBId)
        if (p3A?.[eA.fromIdx] && p3A?.[eA.toIdx] && p3B?.[eB.fromIdx] && p3B?.[eB.toIdx]) {
          const dSame = dist3(p3A[eA.fromIdx], p3B[eB.fromIdx]) + dist3(p3A[eA.toIdx], p3B[eB.toIdx])
          const dRev = dist3(p3A[eA.fromIdx], p3B[eB.toIdx]) + dist3(p3A[eA.toIdx], p3B[eB.fromIdx])
          rev = !(dSame + 0.01 < dRev)
        } else {
          const aPc = rawPieces.find((p) => p.id === pAId), bPc = rawPieces.find((p) => p.id === pBId)
          if (aPc && bPc) {
            const dyA = aPc.outline[eA.toIdx][1] - aPc.outline[eA.fromIdx][1]
            const dyB = bPc.outline[eB.toIdx][1] - bPc.outline[eB.fromIdx][1]
            if (Math.abs(dyA) > 0.2 && Math.abs(dyB) > 0.2) rev = dyA * dyB < 0
          }
        }
        seamInstructions.push({ id, a: { piece: pAId, edge: edgeA }, b: { piece: pBId, edge: edgeB }, reverse: rev })
      }

      pushOrientedBraSeam('braBridge_R', bridgeP.id, 'bridgeRight', cupR.id, 'cupInner', true)
      pushOrientedBraSeam('braBridge_L', bridgeP.id, 'bridgeLeft', cupL.id, 'cupInner', false)
      pushOrientedBraSeam('braWing_R', cupR.id, 'cupWing', bandR.id, 'bandInner', true)
      pushOrientedBraSeam('braWing_L', cupL.id, 'cupWing', bandL.id, 'bandInner', true)
      pushOrientedBraSeam('braBackClose', bandR.id, 'bandBack', bandL.id, 'bandBack', true)
      if (hasStraps) {
        pushOrientedBraSeam('braStrapFront_R', cupR.id, 'cupApex', strapR.id, 'strapFront', false)
        pushOrientedBraSeam('braStrapBack_R', bandR.id, 'bandStrap', strapR.id, 'strapBack', true)
        pushOrientedBraSeam('braStrapFront_L', cupL.id, 'cupApex', strapL.id, 'strapFront', false)
        pushOrientedBraSeam('braStrapBack_L', bandL.id, 'bandStrap', strapL.id, 'strapBack', true)
      }
    }
  }

  // WP-6 seamId-tagged edges (princess seams, wrap coats, jackets, and any declared-edge role)
  let seamIdCounter = 0
  const emitFoldPairSeams = (seamId, a, aEdgeName, b, bEdgeName, tagSuffix = '') => {
    const aPiece = rawPieces.find((p) => p.id === a.pieceId)
    const bPiece = rawPieces.find((p) => p.id === b.pieceId)
    if (!aPiece?.outline?.length || !bPiece?.outline?.length) return
    const dyAR = aPiece.outline[a.toIdx][1] - aPiece.outline[a.fromIdx][1]
    const dyBR = bPiece.outline[b.toIdx][1] - bPiece.outline[b.fromIdx][1]
    seamInstructions.push({
      id: `seamId_${seamIdCounter++}_${seamId}_R`,
      a: { piece: a.pieceId, edge: aEdgeName },
      b: { piece: b.pieceId, edge: bEdgeName },
      reverse: dyAR * dyBR < 0,
    })
    const na = aPiece.outline.length, nb = bPiece.outline.length
    const aMirFrom = (na - a.toIdx + na) % na, aMirTo = (na - a.fromIdx + na) % na
    const bMirFrom = (nb - b.toIdx + nb) % nb, bMirTo = (nb - b.fromIdx + nb) % nb
    if (hasInteriorOverlap(a.pieceId, na, aMirFrom, aMirTo) || hasInteriorOverlap(b.pieceId, nb, bMirFrom, bMirTo)) return
    const mirAName = `seamId_${seamId}_mirrorA${tagSuffix}`
    const mirBName = `seamId_${seamId}_mirrorB${tagSuffix}`
    pushClaimedEdge(a.pieceId, mirAName, aMirFrom, aMirTo, na)
    pushClaimedEdge(b.pieceId, mirBName, bMirFrom, bMirTo, nb)
    const dyAL = aPiece.outline[aMirTo][1] - aPiece.outline[aMirFrom][1]
    const dyBL = bPiece.outline[bMirTo][1] - bPiece.outline[bMirFrom][1]
    seamInstructions.push({
      id: `seamId_${seamIdCounter++}_${seamId}_L`,
      a: { piece: a.pieceId, edge: mirAName },
      b: { piece: b.pieceId, edge: mirBName },
      reverse: dyAL * dyBL < 0,
    })
  }

  for (const [seamId, contributors] of Object.entries(seamIdEdges)) {
    if (/^jacket(?:Front|Back)Neck(?:_[RL])?$/.test(seamId)) {
      if (contributors.every((c) => roles[c.pieceId] === 'frontPanel') || contributors.every((c) => roles[c.pieceId] === 'backPanel')) continue
    }
    if (contributors.length === 2) {
      const [a, b] = contributors
      const aEdgeName = edgeInstructions.find((e) => e.pieceId === a.pieceId && e.fromIdx === a.fromIdx && e.toIdx === a.toIdx)?.edgeName
      const bEdgeName = edgeInstructions.find((e) => e.pieceId === b.pieceId && e.fromIdx === b.fromIdx && e.toIdx === b.toIdx)?.edgeName
      if (!aEdgeName || !bEdgeName) continue
      const aReverse = typeof a.reverse === 'boolean' ? a.reverse : undefined
      const bReverse = typeof b.reverse === 'boolean' ? b.reverse : undefined
      if (aReverse !== undefined && bReverse !== undefined && aReverse !== bReverse) continue

      if (a.cutOnFold && b.cutOnFold && a.pieceId !== b.pieceId && !/_[RL]$/.test(seamId) && aReverse === undefined && bReverse === undefined) {
        emitFoldPairSeams(seamId, a, aEdgeName, b, bEdgeName)
        continue
      }

      let resolvedReverse = aReverse ?? bReverse
      if (resolvedReverse === undefined && UNTWISTABLE_ROLES.has(roles[a.pieceId]) && UNTWISTABLE_ROLES.has(roles[b.pieceId])) {
        const p3A = getPlaced3D(a.pieceId), p3B = getPlaced3D(b.pieceId)
        if (p3A?.[a.fromIdx] && p3A?.[a.toIdx] && p3B?.[b.fromIdx] && p3B?.[b.toIdx]) {
          const dSame = dist3(p3A[a.fromIdx], p3B[b.fromIdx]) + dist3(p3A[a.toIdx], p3B[b.toIdx])
          const dRev = dist3(p3A[a.fromIdx], p3B[b.toIdx]) + dist3(p3A[a.toIdx], p3B[b.fromIdx])
          resolvedReverse = !(dSame + 0.02 < dRev)
        }
      }
      seamInstructions.push({ id: `seamId_${seamIdCounter++}_${seamId}`, a: { piece: a.pieceId, edge: aEdgeName }, b: { piece: b.pieceId, edge: bEdgeName }, reverse: resolvedReverse ?? true })
    } else if (contributors.length >= 3) {
      // Multi-contributor symmetric wrap / jacket sets (single triple OR 2-layer Jacket+Vest)
      const foldCs = contributors.filter((c) => c.cutOnFold)
      const sideCs = contributors.filter((c) => !c.cutOnFold)
      if (!foldCs.length) continue
      const enrichedSide = []
      for (const sc of sideCs) {
        const scPiece = rawPieces.find((p) => p.id === sc.pieceId)
        const scEdgeName = edgeInstructions.find((e) => e.pieceId === sc.pieceId && e.fromIdx === sc.fromIdx && e.toIdx === sc.toIdx)?.edgeName
        if (!scPiece?.outline?.length || !scEdgeName) continue
        const { minX, maxX } = bbox(scPiece.outline)
        const cx = 0.5 * (minX + maxX)
        const dxStart = scPiece.outline[sc.fromIdx][0] - cx
        const len = edgeArcLen(scPiece.outline, sc.fromIdx, sc.toIdx)
        enrichedSide.push({ ...sc, outline: scPiece.outline, edgeName: scEdgeName, isPos: dxStart >= 0, len, used: false })
      }
      const enrichedFold = []
      for (const fc of foldCs) {
        const foldPiece = rawPieces.find((p) => p.id === fc.pieceId)
        const foldEdgeName = edgeInstructions.find((e) => e.pieceId === fc.pieceId && e.fromIdx === fc.fromIdx && e.toIdx === fc.toIdx)?.edgeName
        if (!foldPiece?.outline?.length || !foldEdgeName) continue
        const len = edgeArcLen(foldPiece.outline, fc.fromIdx, fc.toIdx)
        enrichedFold.push({ ...fc, outline: foldPiece.outline, edgeName: foldEdgeName, len, used: false })
      }
      for (let fi = 0; fi < enrichedFold.length; fi++) {
        const fc = enrichedFold[fi]
        const tol = Math.max(1.5, 0.04 * fc.len)
        const findBest = (wantPos) => {
          let best = null, bestDiff = Infinity
          for (const sc of enrichedSide) {
            if (sc.used || sc.isPos !== wantPos || sc.pieceId === fc.pieceId) continue
            const diff = Math.abs(sc.len - fc.len)
            if (diff <= tol && diff < bestDiff) { best = sc; bestDiff = diff }
          }
          return best
        }
        const posC = findBest(true), negC = findBest(false)
        if (!posC || !negC) continue
        const N = fc.outline.length
        const mirFrom = (N - fc.toIdx + N) % N, mirTo = (N - fc.fromIdx + N) % N
        if (hasInteriorOverlap(fc.pieceId, N, mirFrom, mirTo)) continue
        fc.used = true; posC.used = true; negC.used = true
        const mirEdgeName = enrichedFold.length > 1 ? `seamId_${seamId}_mirror_${fi}` : `seamId_${seamId}_mirror`
        pushClaimedEdge(fc.pieceId, mirEdgeName, mirFrom, mirTo, N)
        for (const [sc, fFrom, fTo, fEdgeName, tag] of [
          [posC, fc.fromIdx, fc.toIdx, fc.edgeName, 'R'],
          [negC, mirFrom, mirTo, mirEdgeName, 'L'],
        ]) {
          const dySide = sc.outline[sc.toIdx][1] - sc.outline[sc.fromIdx][1]
          const dyFold = fc.outline[fTo][1] - fc.outline[fFrom][1]
          seamInstructions.push({
            id: `seamId_${seamIdCounter++}_${seamId}_${tag}`,
            a: { piece: sc.pieceId, edge: sc.edgeName },
            b: { piece: fc.pieceId, edge: fEdgeName },
            reverse: dySide * dyFold < 0,
          })
        }
      }
      // Pair any remaining unused fold pieces (e.g. bf13 thobe front+back) with each other
      const unusedFold = enrichedFold.filter((fc) => !fc.used)
      for (let i = 0; i < unusedFold.length; i++) {
        const fa = unusedFold[i]
        if (fa.used) continue
        const tol = Math.max(1.5, 0.04 * fa.len)
        let fb = null, bestDiff = Infinity
        for (let j = i + 1; j < unusedFold.length; j++) {
          const cand = unusedFold[j]
          if (cand.used || cand.pieceId === fa.pieceId) continue
          const diff = Math.abs(cand.len - fa.len)
          if (diff <= tol && diff < bestDiff) { fb = cand; bestDiff = diff }
        }
        if (!fb || /_[RL]$/.test(seamId)) continue
        fa.used = true; fb.used = true
        emitFoldPairSeams(seamId, fa, fa.edgeName, fb, fb.edgeName, `_${i}`)
      }
    }
  }

  const fabricId = FABRIC_NAME_TO_ID.has(payload.fabricId) ? payload.fabricId : null

  return { rawPieces, roles, edgeInstructions, seamInstructions, recognized, skipped, fabricId, placementHints }
}
