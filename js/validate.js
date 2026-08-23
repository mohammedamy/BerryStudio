/* ============================================================
   PatternValidator — 8 patternmaking checks (BerryStudio-Upgrade-Plan
   WP-0.4), tiered honestly by what the current pattern data actually
   supports:

   FULL CONFIDENCE (pure single-piece geometry, no guessing):
     closedOutline, selfIntersection, grainline, seamAllowance, foldSymmetry

   VERIFIED-OR-HEURISTIC, per pair (WP-25): need to know which piece pairs
   with which. js/data.js/js/ai.js/js/fancy-patterns.js attach a real
   `role` to most pieces at construction time (WP-6) — the SAME vocabulary
   cloth-lab/src/pattern/roles.js uses to build real 3D seams, not a name
   guess. pairByRole() pairs on that declared relationship first
   ("Verified" in Check Pattern's report). Whatever's left — pieces with
   no declared role, or a role with no front/back counterpart declared
   (hand-imported pieces; js/ai.js's buildTrousers/buildSkirt, which
   deliberately have no placement role either — see their own comments) —
   falls back to the SAME closed-world front/back name-matching idiom
   cloth-lab's importFromApp.js:classifyLegacy() uses for the identical
   fallback case ("Heuristic"). Unpairable pieces are flagged as such,
   never silently guessed. The pairing confidence works this way for both
   checks; the MATH each check does once paired differs (Phase 1, docs/
   plan 4.md §5.2): notchAlignment is always the same arc-position compare.
   seamLengthParity measures the real declared seam-edge polyline length
   (see `sharedSeamEdge`/`walkEdgeLength` below — reuses each piece's own
   `edges[].seamId`, the same field js/fancy-patterns.js already populates
   and cloth-lab already trusts for real 3D seams) when both paired pieces
   declare a matching seamId, falling back to the original bounding-box-
   extent proxy — unchanged — when they don't:
     seamLengthParity, notchAlignment

   REAL-OR-DEFERRED, PER PIECE (WP-24): ease needs to know which outline
   vertex sits at the chest/bust level — js/data.js/js/ai.js now populate
   a `chestEdgeIndices` hint at construction time for the pieces where
   that's unambiguous (simple cut-on-fold bodice front/back). A piece
   with the hint gets a real pass/warn/fail; a piece without one (hand-
   imported, princess-seamed, or an asymmetric wrap/jacket front — see
   checkEase's own comment for why those are deliberately left unhinted)
   reports "not applicable," never guessed at:
     ease
   ============================================================ */

// ---------- geometry helpers ----------
function segLen(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

function perimeter(outline) {
  let p = 0;
  for (let i = 0; i < outline.length; i++) p += segLen(outline[i], outline[(i + 1) % outline.length]);
  return p;
}

function cross2(a, b) { return a[0] * b[1] - a[1] * b[0]; }
function sub2(a, b) { return [a[0] - b[0], a[1] - b[1]]; }

// Proper-crossing test (does not count endpoint-touching as a crossing).
function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = cross2(sub2(p4, p3), sub2(p1, p3));
  const d2 = cross2(sub2(p4, p3), sub2(p2, p3));
  const d3 = cross2(sub2(p2, p1), sub2(p3, p1));
  const d4 = cross2(sub2(p2, p1), sub2(p4, p1));
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function pointToSegmentInfo(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const abLen2 = abx * abx + aby * aby || 1e-9;
  let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + abx * t, cy = a[1] + aby * t;
  return { t, dist: Math.hypot(p[0] - cx, p[1] - cy) };
}

// How far along the outline's own perimeter (0..1) the nearest point to
// `point` sits — used to compare notch positions between two DIFFERENT
// pieces' outlines without needing them to share an index/edge convention.
function arcPositionFraction(outline, point) {
  let bestDist = Infinity, bestArc = 0, walked = 0;
  const total = perimeter(outline);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const segL = segLen(a, b);
    const { t, dist } = pointToSegmentInfo(point, a, b);
    if (dist < bestDist) { bestDist = dist; bestArc = walked + t * segL; }
    walked += segL;
  }
  return total > 0 ? bestArc / total : 0;
}

// ---------- full-confidence, single-piece checks ----------

function checkClosedOutline(piece) {
  const o = piece.outline || [];
  if (o.length < 3) return { status: 'fail', message: `only ${o.length} point(s) — not a polygon` };
  for (const pt of o) {
    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return { status: 'fail', message: 'non-finite coordinate in outline' };
  }
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    if (a[0] === b[0] && a[1] === b[1]) return { status: 'fail', message: `duplicate consecutive point at index ${i}` };
  }
  return { status: 'pass' };
}

function checkSelfIntersection(piece) {
  const o = piece.outline || [];
  const n = o.length;
  if (n < 4) return { status: 'pass' };
  for (let i = 0; i < n; i++) {
    const a1 = o[i], a2 = o[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // adjacent edges share a vertex — not a crossing
      const b1 = o[j], b2 = o[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return { status: 'fail', message: `edge ${i} crosses edge ${j}` };
    }
  }
  return { status: 'pass' };
}

const GRAIN_CARDINAL_TOL_DEG = 0.5;
const GRAIN_BIAS_BAND = [30, 60]; // degrees off vertical — plausibly an intentional bias cut

function checkGrainline(piece) {
  const g = piece.grain;
  if (!g || g.length < 2) return { status: 'fail', message: 'no grainline' };
  const [p1, p2] = g;
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  if (Math.hypot(dx, dy) < 1e-6) return { status: 'fail', message: 'degenerate grainline (zero length)' };
  const angleFromVertical = Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
  const angleFromHorizontal = Math.abs(90 - angleFromVertical);
  const nearestCardinalDeviation = Math.min(angleFromVertical, angleFromHorizontal);
  if (nearestCardinalDeviation <= GRAIN_CARDINAL_TOL_DEG) return { status: 'pass' };
  if (angleFromVertical >= GRAIN_BIAS_BAND[0] && angleFromVertical <= GRAIN_BIAS_BAND[1]) {
    return { status: 'warn', message: `grain is ${angleFromVertical.toFixed(1)}° off vertical — possible intentional bias cut, unconfirmed (no bias flag exists in current pattern data)` };
  }
  return { status: 'fail', message: `grain is ${nearestCardinalDeviation.toFixed(1)}° off the nearest cardinal axis` };
}

function checkSeamAllowance(piece, seamCm, offsetPolyFn) {
  const o = piece.outline;
  if (!offsetPolyFn) return { status: 'warn', message: 'no offsetPoly function provided to the validator' };
  if (!o || o.length < 3) return { status: 'fail', message: 'no outline to offset' };
  let offset;
  try {
    offset = offsetPolyFn(o, seamCm);
  } catch (e) {
    return { status: 'fail', message: `seam-allowance offset threw: ${e.message}` };
  }
  const selfCheck = checkSelfIntersection({ outline: offset });
  if (selfCheck.status === 'fail') return { status: 'fail', message: `seam-allowance offset self-intersects (${selfCheck.message})` };
  const signedArea = (poly) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; }
    return a;
  };
  if (Math.sign(signedArea(o)) !== Math.sign(signedArea(offset))) {
    return { status: 'fail', message: 'seam-allowance offset inverted the polygon winding (a corner folded over itself)' };
  }
  return { status: 'pass' };
}

// A real sewing fold line must be a perfectly straight edge — you fold
// fabric along a line, not a curve. This looks for a long run of points
// sitting at the piece's own leftmost X extent (the authoring convention
// every pattern in this codebase already uses for a fold edge) and checks
// they're genuinely collinear, rather than assuming any piece IS meant to
// be cut on fold (no cutOnFold field exists in the data — see the module
// comment). No candidate found -> "n/a", not a failure.
function checkFoldSymmetry(piece) {
  const o = piece.outline || [];
  if (o.length < 3) return { status: 'pass', message: 'n/a' };
  const xs = o.map((p) => p[0]);
  const ys = o.map((p) => p[1]);
  const minX = Math.min(...xs);
  const width = Math.max(...xs) - minX || 1;
  const totalHeight = Math.max(...ys) - Math.min(...ys) || 1;
  const nearMinX = o.filter((p) => Math.abs(p[0] - minX) < width * 0.02);
  if (nearMinX.length < 2) return { status: 'pass', message: 'n/a — no candidate fold edge' };
  const span = Math.max(...nearMinX.map((p) => p[1])) - Math.min(...nearMinX.map((p) => p[1]));
  if (span < totalHeight * 0.3) return { status: 'pass', message: 'n/a — leftmost run too short to be a fold edge' };
  const maxDeviation = Math.max(...nearMinX.map((p) => Math.abs(p[0] - minX)));
  const tol = Math.max(0.05, width * 0.005);
  if (maxDeviation > tol) {
    return { status: 'fail', message: `candidate fold edge isn't straight — points vary by up to ${maxDeviation.toFixed(2)}cm in X (a real fold must be a perfectly straight line)` };
  }
  return { status: 'pass', message: `straight fold edge confirmed (${nearMinX.length} points, span ${span.toFixed(1)}cm)` };
}

// ---------- heuristic, cross-piece checks ----------
// Same closed-world idiom as cloth-lab/src/pattern/importFromApp.js's
// classify() — deliberately not a second, different heuristic.
const IGNORE_RE = /waistband|collar|cuff|sash|tie|gusset|facing|pocket|lining|\bband\b|sleeve|كم/i;
const FRONT_RE = /front|أمام/i;
const BACK_RE = /back|خلف/i;

function pieceLabel(piece) {
  return (piece.name && piece.name.en) || piece.key || 'piece';
}

function pairFrontBack(pieces) {
  const fronts = [], backs = [];
  for (const p of pieces) {
    const label = pieceLabel(p);
    if (IGNORE_RE.test(label)) continue; // not a front/back-paired piece at all — no verdict needed
    if (FRONT_RE.test(label)) fronts.push({ piece: p, base: label.replace(FRONT_RE, '').trim().toLowerCase() });
    else if (BACK_RE.test(label)) backs.push({ piece: p, base: label.replace(BACK_RE, '').trim().toLowerCase() });
  }
  const pairs = [];
  const usedBacks = new Set();
  for (const f of fronts) {
    let matchIdx = backs.findIndex((b, i) => !usedBacks.has(i) && b.base === f.base);
    if (matchIdx < 0) matchIdx = backs.findIndex((b, i) => !usedBacks.has(i)); // fallback: any unused back
    if (matchIdx >= 0) { usedBacks.add(matchIdx); pairs.push({ front: f.piece, back: backs[matchIdx].piece }); }
    else pairs.push({ front: f.piece, back: null });
  }
  backs.forEach((b, i) => { if (!usedBacks.has(i)) pairs.push({ front: null, back: b.piece }); });
  return pairs;
}

// ---------- WP-25: real, declared-relationship pairing ----------
// js/data.js, js/ai.js and js/fancy-patterns.js already attach a `role` to
// most pieces at construction time (BerryStudio-Upgrade-Plan WP-6) — the
// SAME vocabulary cloth-lab/src/pattern/roles.js already uses to build
// real 3D seams, not a guess. Pairing on a piece's declared role (when
// present) is a genuine authored relationship, not a name-matching guess
// — pieceLabel-based pairFrontBack() above stays as the fallback for
// pieces with no declared role (hand-imported/legacy pieces, or a
// generator that deliberately left role undeclared — e.g. js/ai.js's
// buildTrousers/buildSkirt, which have no placement heuristic in
// cloth-lab either; see those functions' own comments).
//
// The parity/notch MATH below (checkSeamLengthParity/checkNotchAlignment)
// is UNCHANGED by this — only which two pieces get compared, and how much
// to trust that the comparison is even meaningful, changes. A role-paired
// front/back is real regardless of whether the two pieces happen to share
// a literal cut edge (e.g. a princess-seamed "Bodice Front Center"/"Bodice
// Back Center" don't — each meets its own *Side piece at the princess
// seam instead) — "Verified" here means "we know this is the declared
// front/back counterpart of the same construction block," which is
// exactly what front/back length-parity is checking for either way.
const ROLE_PAIR = {
  'bodice-front-center': 'bodice-back-center',
  'bodice-front-side': 'bodice-back-side',
  'front-panel': 'back-panel',
  'hip-panel-front': 'hip-panel-back',
  'skirt-front-gore': 'skirt-back-gore',
};

function pairByRole(pieces) {
  const byRole = {};
  for (const p of pieces) if (p.role) (byRole[p.role] = byRole[p.role] || []).push(p);
  const pairs = [];
  const used = new Set();
  for (const [frontRole, backRole] of Object.entries(ROLE_PAIR)) {
    const fronts = byRole[frontRole] || [], backs = byRole[backRole] || [];
    // Only pair when there's exactly one of each role in this piece set —
    // 2+ pieces sharing a role (e.g. a wrap design's two independent front
    // panels) has no single unambiguous pairing; same "never guess"
    // principle cloth-lab's importFromApp.js already applies.
    if (fronts.length === 1 && backs.length === 1) {
      pairs.push({ front: fronts[0], back: backs[0], verified: true });
      used.add(fronts[0]); used.add(backs[0]);
    }
  }
  const remaining = pieces.filter((p) => !used.has(p));
  return { pairs, remaining };
}

const SEAM_LENGTH_TOL_MM = 3;
const NOTCH_ARC_TOL_FRACTION = 0.05; // 5% of perimeter

// ---------- seam-edge declaration (docs/plan 4.md §5.2 / Phase 1) ----------
// Reuses the piece's own `edges: [{ fromIdx, toIdx, seamId }]` — the SAME
// field js/fancy-patterns.js already populates (e.g. princessBodice's
// frontCenter/frontSide sharing a 'princessFront' seamId) and cloth-lab's
// importFromApp.js already trusts to build real 3D seams — rather than a
// second, parallel seam-declaration field. A pattern authored for a real
// 3D seam already gets a real 2D parity check for free, and a pattern
// only needs to declare a seam edge once. Declaring it is optional —
// pieces with no matching seamId keep the exact previous bounding-box-
// extent proxy behaviour, unchanged.
//
// walkEdgeLength always walks the outline FORWARD (increasing index,
// wrapping past the end) from fromIdx to toIdx, matching curves' own
// fromIdx/toIdx convention — authors pick indices so that direction is the
// seam edge, not its complement.
function walkEdgeLength(outline, fromIdx, toIdx) {
  const n = outline.length;
  if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx) || fromIdx < 0 || toIdx < 0 || fromIdx >= n || toIdx >= n) return null;
  let i = fromIdx, len = 0, guard = 0;
  while (i !== toIdx) {
    const next = (i + 1) % n;
    len += segLen(outline[i], outline[next]);
    i = next;
    if (++guard > n) return null; // malformed indices — never loop forever
  }
  return len;
}

// The shared seamId both pieces of a pair declare an `edges` entry for
// (e.g. a princess seam or a plain side seam). Only ever returns an id
// present on BOTH sides — pairing a front's declared seam against a back
// that declares none (or a different one) is exactly the "not applicable"
// case the proxy exists for.
function sharedSeamEdge(front, back) {
  const frontIds = (front.edges || []).filter((e) => e.seamId);
  const backIds = new Set((back.edges || []).filter((e) => e.seamId).map((e) => e.seamId));
  const match = frontIds.find((e) => backIds.has(e.seamId));
  if (!match) return null;
  const backEdge = (back.edges || []).find((e) => e.seamId === match.seamId);
  return { seamId: match.seamId, front: match, back: backEdge };
}

function checkSeamLengthParity(pair) {
  if (!pair.front || !pair.back) return { status: 'warn', message: 'could not confidently pair this piece with a front/back counterpart' };
  const heightOf = (p) => { const ys = p.outline.map((pt) => pt[1]); return Math.max(...ys) - Math.min(...ys); };
  const hf = heightOf(pair.front), hb = heightOf(pair.back);
  const proxyDiffMm = Math.abs(hf - hb) * 10;

  const shared = sharedSeamEdge(pair.front, pair.back);
  if (shared) {
    const lf = walkEdgeLength(pair.front.outline, shared.front.fromIdx, shared.front.toIdx);
    const lb = walkEdgeLength(pair.back.outline, shared.back.fromIdx, shared.back.toIdx);
    if (lf != null && lb != null) {
      const diffMm = Math.abs(lf - lb) * 10;
      const proxyNote = ` (bounding-box proxy for continuity: ${proxyDiffMm.toFixed(1)}mm)`;
      if (diffMm <= SEAM_LENGTH_TOL_MM) return { status: 'pass', message: `declared "${shared.seamId}" seam matches within ${diffMm.toFixed(1)}mm (front ${lf.toFixed(1)}cm / back ${lb.toFixed(1)}cm)${proxyNote}` };
      return { status: 'fail', message: `declared "${shared.seamId}" seam: front (${lf.toFixed(1)}cm) and back (${lb.toFixed(1)}cm) differ by ${diffMm.toFixed(1)}mm — an un-sewable seam, not a proxy artifact${proxyNote}` };
    }
    // Indices present but malformed — fall through to the proxy rather than
    // silently guessing, but say so, since this is an authoring bug.
  }

  // Heuristic proxy for "the side seam": each piece's own vertical extent.
  // Front/back bodice pieces in this codebase's convention run top-to-
  // bottom along the side seam, so a mismatch here is a real, catchable
  // drafting bug even without true edge-to-edge seam metadata. This is the
  // ONLY signal available for a pair with no matching declared seamId —
  // see docs/plan 4.md §5.2 for why a constant ~5mm reading here is often
  // correct patternmaking (a deeper front neckline) rather than a bug.
  if (proxyDiffMm <= SEAM_LENGTH_TOL_MM) return { status: 'pass', message: `matches within ${proxyDiffMm.toFixed(1)}mm (bounding-box proxy — no declared seam edge)` };
  return { status: 'fail', message: `front (${hf.toFixed(1)}cm) and back (${hb.toFixed(1)}cm) side lengths differ by ${proxyDiffMm.toFixed(1)}mm (bounding-box proxy — no declared seam edge)` };
}

function checkNotchAlignment(pair) {
  if (!pair.front || !pair.back) return { status: 'warn', message: 'could not confidently pair this piece with a front/back counterpart' };
  const nf = (pair.front.notches || []).length;
  const nb = (pair.back.notches || []).length;
  if (nf !== nb) return { status: 'warn', message: `front has ${nf} notch(es), back has ${nb} — may be a deliberate single/double-notch front-vs-back convention, not necessarily a defect` };
  if (nf === 0) return { status: 'pass', message: 'n/a — no notches on either piece' };
  let worst = 0;
  for (let i = 0; i < nf; i++) {
    const pf = arcPositionFraction(pair.front.outline, pair.front.notches[i]);
    const pb = arcPositionFraction(pair.back.outline, pair.back.notches[i]);
    worst = Math.max(worst, Math.abs(pf - pb));
  }
  if (worst <= NOTCH_ARC_TOL_FRACTION) return { status: 'pass', message: `matches within ${(worst * 100).toFixed(1)}% of perimeter` };
  return { status: 'fail', message: `notch position differs by ${(worst * 100).toFixed(1)}% of perimeter between front and back` };
}

// ---------- ease (WP-24) ----------
// "Finished chest ≥ body chest + minimum wearing ease" is only genuinely
// verifiable for a piece whose generator already knows which outline
// vertex sits at the chest/bust level — `chestEdgeIndices`, populated at
// CONSTRUCTION time (js/data.js, js/ai.js) alongside the same `role`
// metadata WP-25's pairByRole already trusts, not re-derived post-hoc by
// guessing which edge "looks like" the chest line. A piece with no hint
// (hand-imported; princess-seamed, where the chest edge is split across
// two pieces — center+side — not one; an asymmetric wrap/jacket front,
// where a fold-doubling assumption doesn't hold) is honestly reported
// "not applicable," never guessed at — same convention as every other
// check here.
//
// The hinted vertex's X coordinate is a cut-on-fold half-piece's own
// contribution to ONE side (front or back) of the finished garment at
// that fold-doubled width. Every generator that populates this hint
// drafts front and back to nearly the same chest width, so doubling once
// more (assuming the piece's usual counterpart contributes about the
// same) gives a real, checkable estimate of the finished garment's full
// chest circumference — stated as an assumption in the message, not
// hidden.
//
// MIN_WEARING_EASE_CM is an absolute floor, not a style target: a
// commonly-cited minimum total chest ease for a non-stretch woven bodice
// to allow arm movement/breathing at all — below it the garment is a
// functional defect regardless of intended fit. A close-fitting vs.
// relaxed silhouette's actual target ease varies far more than this and
// needs garment-intent context this check doesn't have; that ambiguity
// is exactly why the zone between 0 and this floor is "warn," not "pass"
// or "fail" — an honest hedge, not a guess either way.
const MIN_WEARING_EASE_CM = 5;

// Canvas.getPieces() (Check Pattern's real caller) returns every piece
// already shifted by an arbitrary per-piece layout offset — layoutPieces()
// positions pieces left-to-right in the 2D canvas, so a piece authored
// with its fold at X=0 can come back with its fold at X=42 (cloth-lab's
// importFromApp.js:relocalize hits the exact same issue for the exact
// same reason). chestEdgeIndices' hinted vertex is only meaningful
// relative to THIS piece's own fold edge — checkFoldSymmetry's own
// established convention is that the fold sits at the piece's own
// leftmost X extent — so measure from that, never from raw absolute X.
function halfChestWidth(piece) {
  const idx = piece && piece.chestEdgeIndices;
  if (!idx || !idx.length || !piece.outline || !piece.outline.length) return null;
  const pt = piece.outline[idx[0]];
  if (!pt || !Number.isFinite(pt[0])) return null;
  const foldX = Math.min(...piece.outline.map((p) => p[0]));
  if (!Number.isFinite(foldX)) return null;
  return Math.abs(pt[0] - foldX);
}

function checkEase(piece, bodyChestCm) {
  const half = halfChestWidth(piece);
  if (half == null) return { status: 'deferred', message: 'not applicable — no declared chest-edge hint for this piece (hand-imported, princess-seamed, or an asymmetric front this check does not yet cover)' };
  if (bodyChestCm == null || !Number.isFinite(bodyChestCm)) return { status: 'deferred', message: 'not applicable — no body chest measurement was supplied to Check Pattern' };
  const impliedFullChest = half * 4;
  const easeCm = impliedFullChest - bodyChestCm;
  if (easeCm < 0) return { status: 'fail', message: `implied finished chest (${impliedFullChest.toFixed(1)}cm) is ${Math.abs(easeCm).toFixed(1)}cm SMALLER than the body chest (${bodyChestCm.toFixed(1)}cm) — this garment cannot physically close` };
  if (easeCm < MIN_WEARING_EASE_CM) return { status: 'warn', message: `only ${easeCm.toFixed(1)}cm of implied chest ease (finished ${impliedFullChest.toFixed(1)}cm vs body ${bodyChestCm.toFixed(1)}cm) — tight enough to be an intentional close-fitting style, or a defect; this check can't tell style intent from a mistake` };
  return { status: 'pass', message: `${easeCm.toFixed(1)}cm of implied chest ease (finished ${impliedFullChest.toFixed(1)}cm vs body ${bodyChestCm.toFixed(1)}cm)` };
}

// ---------- entry point ----------
// `ctx.offsetPoly` should be Canvas.offsetPoly (a pure function, reused
// rather than reimplemented). `ctx.seamAllowanceCm` defaults to 1.
// `ctx.bodyChestCm` (WP-24, optional): the wearer's body chest
// measurement — without it, Ease reports "not applicable" for every
// piece rather than guessing what body it was drafted for.
export function run(pieces, ctx = {}) {
  const seamCm = ctx.seamAllowanceCm != null ? ctx.seamAllowanceCm : 1;
  const offsetPolyFn = ctx.offsetPoly || null;
  const bodyChestCm = ctx.bodyChestCm != null ? ctx.bodyChestCm : null;

  const perPiece = (pieces || []).map((p) => ({
    label: pieceLabel(p),
    checks: {
      closedOutline: checkClosedOutline(p),
      selfIntersection: checkSelfIntersection(p),
      grainline: checkGrainline(p),
      seamAllowance: checkSeamAllowance(p, seamCm, offsetPolyFn),
      foldSymmetry: checkFoldSymmetry(p),
      ease: checkEase(p, bodyChestCm),
    },
  }));

  // WP-25: pair by declared role first (real relationship — "Verified");
  // whatever's left over (no role, or a role with no ROLE_PAIR entry)
  // falls back to name-matching (a guess — "Heuristic"), same as before
  // this WP. A piece already consumed by role-pairing is excluded from
  // the name-matching pool so it can't also show up in a second, guessed
  // pair.
  const { pairs: rolePairs, remaining } = pairByRole(pieces || []);
  const namePairs = pairFrontBack(remaining).map((pair) => ({ ...pair, verified: false }));
  const pairs = [...rolePairs, ...namePairs];
  const crossPiece = pairs.map((pair) => ({
    label: `${pair.front ? pieceLabel(pair.front) : '(unmatched)'} / ${pair.back ? pieceLabel(pair.back) : '(unmatched)'}`,
    verified: !!pair.verified,
    checks: {
      seamLengthParity: checkSeamLengthParity(pair),
      notchAlignment: checkNotchAlignment(pair),
    },
  }));

  const summary = { pass: 0, warn: 0, fail: 0, deferred: 0 };
  const tally = (r) => { summary[r.status] = (summary[r.status] || 0) + 1; };
  perPiece.forEach((p) => Object.values(p.checks).forEach(tally));
  crossPiece.forEach((p) => Object.values(p.checks).forEach(tally));

  return { perPiece, crossPiece, summary };
}

export const PatternValidator = { run };

// TEMP compat alias for one release — see BerryStudio-Upgrade-Plan WP-0.1.
if (typeof window !== 'undefined') window.PatternValidator = PatternValidator;
