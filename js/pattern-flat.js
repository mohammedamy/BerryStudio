// js/pattern-flat.js — deterministic garment-flat thumbnail renderer.
// docs/plan 4.md §7.3 (Phase 1 of the pattern-library rebuild): "Build a
// deterministic garment-flat renderer" so every library card shows a
// technical flat DERIVED from that pattern's own pieces(m) geometry,
// instead of one of 13 shared generic glyphs (js/app.js's LIB_ICONS —
// still kept, as the documented fallback, see renderPatternFlat below).
//
// Why this can't be hand-drawn: 300+ garments, offline, no raster assets,
// build-free — and a hand-drawn SVG silently drifts out of sync the
// moment a piece is regraded. Composing the flat FROM the same outline/
// curves/darts/role data Check Pattern and the Cloth Lab already consume
// means a wrong-looking thumbnail is telling you the geometry is wrong,
// not that the artwork is stale.
//
// This is intentionally a FLAT, not a seam-solved 3D drape: pieces are
// positioned by a handful of generic role-based anchor rules (stack
// accessories above/below the core panel, flank it with side/sleeve
// pieces, mirror cut-on-fold halves and bilateral pairs), not by literal
// edge-to-edge seam matching. The library spans dozens of independently
// authored generators (js/data.js, js/library.js, js/fancy-patterns.js,
// js/girls-leotards.js, js/underwear-library.js) that don't all draft
// sibling pieces in a shared coordinate frame, so anchor rules that work
// generically across all of them are the honest choice here — precise
// per-construction assembly is future work, not something this Phase 1
// pass claims.
//
// Consumed by js/app.js's renderLibraryPane (renderPatternFlat(id)).

import { PATTERNS, computeMeasurements } from './data.js';

// ---------- outline/curves -> SVG path (matches js/canvas.js's
// outlinePathD / js/pattern-export.js's outlinePathOps convention: a real
// cubic bezier for any edge `curves` declares, straight lines otherwise) ----------
function outlinePathD(outline, curves) {
  const n = outline.length;
  if (n < 2) return '';
  const curveByFrom = new Map((curves || []).map((c) => [c.fromIdx, c]));
  let d = `M ${outline[0][0].toFixed(2)} ${outline[0][1].toFixed(2)}`;
  let i = 0, guard = 0;
  while (i < n - 1 && guard++ < n * 2) {
    const c = curveByFrom.get(i);
    if (c && c.toIdx > i && c.toIdx < n && c.c1 && c.c2) {
      d += ` C ${c.c1[0].toFixed(2)} ${c.c1[1].toFixed(2)} ${c.c2[0].toFixed(2)} ${c.c2[1].toFixed(2)} ${outline[c.toIdx][0].toFixed(2)} ${outline[c.toIdx][1].toFixed(2)}`;
      i = c.toIdx;
    } else {
      i++;
      d += ` L ${outline[i][0].toFixed(2)} ${outline[i][1].toFixed(2)}`;
    }
  }
  return d + ' Z';
}

// ---------- geometry helpers ----------
function bboxOf(outline) {
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}
function mirrorPt(p) { return [-p[0], p[1]]; }
function shiftPt(p, dx, dy) { return [p[0] + dx, p[1] + dy]; }

// A piece as a plain, mutation-free shape record this module works with —
// decoupled from the live piece object so translate/mirror never touch
// pieces(m)'s own output (pieces(m) MUST stay pure per docs/plan 4.md §2).
function toShape(piece) {
  return {
    outline: (piece.outline || []).map((p) => [p[0], p[1]]),
    curves: (piece.curves || []).map((c) => ({ ...c, c1: [c.c1[0], c.c1[1]], c2: [c.c2[0], c.c2[1]] })),
    darts: (piece.darts || []).map((d) => d.map((p) => [p[0], p[1]])),
    notches: (piece.notches || []).map((p) => [p[0], p[1]]),
  };
}

function translateShape(shape, dx, dy) {
  return {
    outline: shape.outline.map((p) => shiftPt(p, dx, dy)),
    curves: shape.curves.map((c) => ({ ...c, c1: shiftPt(c.c1, dx, dy), c2: shiftPt(c.c2, dx, dy) })),
    darts: shape.darts.map((d) => d.map((p) => shiftPt(p, dx, dy))),
    notches: shape.notches.map((p) => shiftPt(p, dx, dy)),
  };
}

// Mirrors a shape across X=0 IN PLACE (point order/indices unchanged — a
// pure reflection, not a reordering) — used for bilateral pieces (a
// generator's single symmetric piece standing in for a mirrored L/R pair,
// e.g. a sleeve) and for flanking a princess-seam side panel on both
// sides of the center panel. Mirroring a curve's control points alongside
// its endpoints keeps the same physical curve shape, reflected.
function mirrorShape(shape) {
  return {
    outline: shape.outline.map(mirrorPt),
    curves: shape.curves.map((c) => ({ ...c, c1: mirrorPt(c.c1), c2: mirrorPt(c.c2) })),
    darts: shape.darts.map((d) => d.map(mirrorPt)),
    notches: shape.notches.map(mirrorPt),
  };
}

// Unfolds a cutOnFold half-piece into the full piece it represents:
// appends the interior points mirrored-and-reversed after the original
// ones, so walking the result traces one continuous closed polygon (the
// SAME technique cloth-lab/src/pattern/importFromApp.js's unfoldPiece
// uses for the identical problem — reimplemented locally here since
// cloth-lab is a separate Vite/React package the build-free root app
// cannot import from). A curve on the original half gets a second,
// reflected-and-reversed copy for the mirrored half (fromIdx/toIdx and c1/
// c2 swapped, since walking the mirrored tail runs the opposite physical
// direction) — see the tailIndexOf derivation in this function's own
// history/comment in docs/plan 4.md's working notes; verified against
// test/library-thumbnails.test.js's own re-derivation for princess-seamed
// (curved) pieces, not just straight-edged ones.
function unfoldPiece(shape) {
  const o = shape.outline;
  const n = o.length;
  if (n < 3) return shape;
  const tail = [];
  for (let k = n - 2; k >= 1; k--) tail.push(mirrorPt(o[k]));
  const outline = o.concat(tail);
  const tailIndexOf = (k) => 2 * n - 2 - k;
  const remapTail = (k) => (k === 0 || k === n - 1) ? k : tailIndexOf(k);

  const curves = [];
  for (const c of shape.curves) {
    curves.push({ ...c }); // forward copy, unchanged
    const ta = remapTail(c.toIdx), tb = remapTail(c.fromIdx);
    if (ta === c.toIdx && tb === c.fromIdx) continue; // both endpoints on the fold line — no distinct mirrored copy
    curves.push({ fromIdx: ta, toIdx: tb, c1: mirrorPt(c.c2), c2: mirrorPt(c.c1) });
  }
  const darts = shape.darts.concat(shape.darts.map((d) => d.map(mirrorPt)));
  const notches = shape.notches.concat(shape.notches.map(mirrorPt));
  return { outline, curves, darts, notches };
}

// Recenters a shape so its own horizontal midpoint sits at world X=0 and
// its topmost point sits at world Y=0 — the common "local origin" every
// placement rule below measures offsets from.
function normalize(shape) {
  const b = bboxOf(shape.outline);
  const cx = (b.minX + b.maxX) / 2;
  return { shape: translateShape(shape, -cx, -b.minY), box: { w: b.w, h: b.h }, dx: -cx, dy: -b.minY };
}

// A princess-seamed (or any edges[]-carrying) generator drafts its center
// and side panels in ONE shared coordinate space — js/fancy-patterns.js's
// princessBodice literally builds frontSide's points by reversing and
// extending frontCenter's own princess-curve points (see that function's
// own comment). When both pieces declare the SAME seamId on a piece-level
// `edges` entry, that shared frame is real, authored data, not a guess —
// placing the side piece with the CENTER's own shift (not an independent
// bbox re-center) makes the princess seam actually meet, instead of the
// generic flank-with-overlap heuristic every other pairing has to fall
// back to.
function sharedSeamId(a, b) {
  const aIds = (a.edges || []).map((e) => e.seamId).filter(Boolean);
  const bIds = (b.edges || []).map((e) => e.seamId).filter(Boolean);
  return aIds.find((id) => bIds.includes(id)) || null;
}

// ---------- role selection (docs/plan 4.md §7.3 step 2) ----------
function byRole(pieces, role) { return pieces.filter((p) => p.role === role); }
function firstNonEmpty(pieces, roles) {
  for (const r of roles) { const found = byRole(pieces, r); if (found.length) return found; }
  return [];
}
// Same last-resort "front" name idiom js/validate.js's pairFrontBack and
// cloth-lab's classifyLegacy both already use for pieces with no
// placement-relevant role — js/ai.js's buildTrousers/buildSkirt declare
// none at all, and this generator's own trouser/short leg panels declare
// role:'other' (honest per docs/plan 4.md §4.2: there is no trouser-front
// role in the 46-value vocabulary). Used ONLY as a last resort, ONLY for
// the thumbnail (never for validator pairing/roles), and only among
// pieces with no useful role already — bounded exactly the way
// classifyLegacy's own fallback is.
const FRONT_NAME_RE = /front/i;
function selectParts(pieces) {
  let core = firstNonEmpty(pieces, ['bodice-front-center', 'front-panel', 'brief-front', 'shorts-front', 'bodice-front-side']);
  if (!core.length) {
    // A skirt/hip-only pattern (no bodice at all) — the skirt panel IS
    // the silhouette, not an accessory stacked below something else.
    // composePattern() detects sel.lower === sel.core and skips
    // re-adding it, while still running the side-gore flanking below
    // against it.
    core = firstNonEmpty(pieces, ['skirt-front-gore', 'hip-panel-front', 'godet']);
  }
  if (!core.length) {
    const other = pieces.filter((p) => (!p.role || p.role === 'other') && p.name && FRONT_NAME_RE.test(p.name.en || ''));
    core = other.slice(0, 1);
  }
  return {
    core: core[0] || null,
    extraCore: core.slice(1),
    side: byRole(pieces, 'bodice-front-side').filter((p) => p !== core[0]),
    lower: firstNonEmpty(pieces, ['hip-panel-front', 'skirt-front-gore', 'godet'])[0] || null,
    lowerSide: [...byRole(pieces, 'skirt-side-gore-left'), ...byRole(pieces, 'skirt-side-gore-right')],
    sleeve: firstNonEmpty(pieces, ['sleeve', 'sleeve-upper', 'cap-sleeve', 'puff-sleeve', 'butterfly-sleeve'])[0] || null,
    hood: byRole(pieces, 'hood')[0] || null,
    collar: firstNonEmpty(pieces, ['collar', 'collar-band', 'collar-stand', 'undercollar'])[0] || null,
    yoke: byRole(pieces, 'yoke')[0] || null,
    waistband: byRole(pieces, 'waistband')[0] || null,
    peplum: byRole(pieces, 'peplum-front')[0] || null,
    tier: firstNonEmpty(pieces, ['tier'])[0] || null,
    cape: firstNonEmpty(pieces, ['cape', 'cape-overlay'])[0] || null,
    cuff: firstNonEmpty(pieces, ['cuff', 'rib-cuff', 'hem-band'])[0] || null,
    pocket: byRole(pieces, 'pocket')[0] || null,
  };
}

function shapeOf(piece) {
  const raw = toShape(piece);
  return piece.cutOnFold ? unfoldPiece(raw) : raw;
}

// ---------- composition (docs/plan 4.md §7.3 steps 3-5) ----------
// Every placed part carries a `kind` used only to pick a fill shade
// (`accessory` reads one step lighter than `main`) so accessories stay
// visually distinct from body fabric without a second colour needing to
// be authored anywhere.
function composePattern(pieces) {
  const sel = selectParts(pieces);
  if (!sel.core) return null;

  const parts = []; // { shape, kind, z }
  const add = (shape, kind = 'main', z = 0) => parts.push({ shape, kind, z });

  const { shape: coreShape, box: coreBox, dx: coreDx, dy: coreDy } = normalize(shapeOf(sel.core));
  add(coreShape, 'main', 1);

  let rightEdge = coreBox.w / 2;
  const OVERLAP = 0.15;

  // Side (princess-seam) panels and any extra same-role core pieces flank
  // the center panel on both sides.
  for (const p of [...sel.side, ...sel.extraCore]) {
    const seamId = sharedSeamId(sel.core, p);
    let right;
    if (seamId) {
      // Real shared coordinate frame (see sharedSeamId's own comment) —
      // reuse the CENTER's shift verbatim so the declared seam actually
      // meets, instead of an independent bbox re-center.
      right = translateShape(shapeOf(p), coreDx, coreDy);
    } else {
      const norm = normalize(shapeOf(p));
      const dx = rightEdge - norm.box.w * OVERLAP - (-norm.box.w / 2); // shift so this shape's left edge overlaps rightEdge
      right = translateShape(norm.shape, dx, 0); // tops aligned (both normalized to top=0 already)
    }
    add(right, 'main', 0);
    rightEdge = Math.max(rightEdge, bboxOf(right.outline).maxX);
    if (p.bilateral) {
      add(mirrorShape(right), 'main', 0);
    }
  }

  // Sleeves flank further out, cap aligned roughly to shoulder height.
  if (sel.sleeve) {
    const { shape: raw, box } = normalize(shapeOf(sel.sleeve));
    const shoulderY = coreBox.h * 0.05;
    const dx = rightEdge - 0.4 - (-box.w / 2);
    const dy = shoulderY - 0; // sleeve cap (its own top, y=0 post-normalize) at shoulder line
    const right = translateShape(raw, dx, dy);
    add(right, 'main', 0);
    const left = mirrorShape(right);
    add(left, 'main', 0);

    if (sel.cuff) {
      const rb = bboxOf(right.outline);
      const { shape: cuffShape, box: cuffBox } = normalize(shapeOf(sel.cuff));
      const cdx = (rb.minX + rb.maxX) / 2;
      const cdy = rb.maxY - cuffBox.h * OVERLAP;
      const cuffRight = translateShape(cuffShape, cdx, cdy);
      add(cuffRight, 'accessory', 2);
      add(mirrorShape(cuffRight), 'accessory', 2);
    }
  }

  // Lower panel (skirt/hip) stacks below the core; any side gores
  // (skirt-side-gore-left/right — a multi-gore skirt cut in thirds, not a
  // bilateral pair) flank it the same way bodice side panels flank the
  // center, seam-sharing when the generator declared it.
  let bottomY = coreBox.h;
  // A skirt/hip-only pattern (selectParts() has no bodice to pick, so it
  // promotes the skirt panel itself to core) — sel.lower === sel.core
  // here. It's already been added once as the core; this block only
  // needs to run far enough to flank it with any side gores, not add it
  // a second time or shift it below itself.
  if (sel.lower && sel.lower === sel.core) {
    const rawToWorld = { dx: coreDx, dy: coreDy };
    let gRightEdge = coreBox.w / 2, gLeftEdge = -coreBox.w / 2;
    for (const g of sel.lowerSide) {
      const isLeft = g.role === 'skirt-side-gore-left';
      const seamId = sharedSeamId(sel.core, g);
      let gShape;
      if (seamId) {
        gShape = translateShape(shapeOf(g), rawToWorld.dx, rawToWorld.dy);
        if (isLeft && bboxOf(gShape.outline).minX >= 0) gShape = mirrorShape(gShape);
        if (!isLeft && bboxOf(gShape.outline).maxX <= 0) gShape = mirrorShape(gShape);
      } else {
        const norm = normalize(shapeOf(g));
        const dx = isLeft
          ? gLeftEdge + norm.box.w * OVERLAP - norm.box.w / 2
          : gRightEdge - norm.box.w * OVERLAP - (-norm.box.w / 2);
        gShape = translateShape(norm.shape, dx, 0);
      }
      add(gShape, 'main', 1);
      const gb = bboxOf(gShape.outline);
      if (isLeft) gLeftEdge = Math.min(gLeftEdge, gb.minX);
      else gRightEdge = Math.max(gRightEdge, gb.maxX);
      bottomY = Math.max(bottomY, gb.maxY);
    }
  } else if (sel.lower) {
    const { shape: lowerShape, box: lowerBox, dx: lowerDx, dy: lowerDy } = normalize(shapeOf(sel.lower));
    // The Y-translate actually applied to the (already-normalized)
    // lowerShape — captured once, before bottomY advances, since both
    // branches below need to reproduce this exact placement, not
    // whatever bottomY becomes after.
    const placementDy = bottomY - lowerBox.h * OVERLAP;
    const placed = translateShape(lowerShape, 0, placementDy);
    add(placed, 'main', 1);
    bottomY = Math.max(bottomY, bboxOf(placed.outline).maxY);
    // Composed raw->world shift (normalize's own shift, then the
    // placement shift above) — only meaningful for the seamId branch,
    // which starts from shapeOf(g)'s RAW (un-normalized) coordinates.
    const rawToWorld = { dx: lowerDx, dy: lowerDy + placementDy };

    // skirt-side-gore-left/right are two DISTINCT declared pieces (not a
    // bilateral mirror pair), so which side each renders on comes from
    // its own declared role, not an alternating guess.
    let gRightEdge = bboxOf(placed.outline).maxX;
    let gLeftEdge = -gRightEdge;
    for (const g of sel.lowerSide) {
      const isLeft = g.role === 'skirt-side-gore-left';
      const seamId = sharedSeamId(sel.lower, g);
      let gShape;
      if (seamId) {
        gShape = translateShape(shapeOf(g), rawToWorld.dx, rawToWorld.dy);
        // Safety: if this piece's own raw coordinates land on the wrong
        // side for its declared role (e.g. right/left gores authored
        // from literally the same symmetric shape), mirror it rather
        // than render two gores stacked on the same side.
        if (isLeft && bboxOf(gShape.outline).minX >= 0) gShape = mirrorShape(gShape);
        if (!isLeft && bboxOf(gShape.outline).maxX <= 0) gShape = mirrorShape(gShape);
      } else {
        const norm = normalize(shapeOf(g));
        const dx = isLeft
          ? gLeftEdge + norm.box.w * OVERLAP - norm.box.w / 2
          : gRightEdge - norm.box.w * OVERLAP - (-norm.box.w / 2);
        gShape = translateShape(norm.shape, dx, placementDy);
      }
      add(gShape, 'main', 1);
      const gb = bboxOf(gShape.outline);
      if (isLeft) gLeftEdge = Math.min(gLeftEdge, gb.minX);
      else gRightEdge = Math.max(gRightEdge, gb.maxX);
      bottomY = Math.max(bottomY, gb.maxY);
    }
  }

  // Waist/peplum/tier accessories continue stacking below whichever is
  // currently the lowest edge.
  for (const p of [sel.waistband, sel.peplum, sel.tier]) {
    if (!p) continue;
    const { shape: raw, box } = normalize(shapeOf(p));
    const dy = bottomY - box.h * OVERLAP;
    const placed = translateShape(raw, 0, dy);
    add(placed, 'accessory', 2);
    bottomY = bboxOf(placed.outline).maxY;
  }

  // Hood/collar/yoke stack above the core, nearest-to-farthest overlap so
  // they read as attached at the neckline rather than floating.
  let topY = 0;
  for (const p of [sel.yoke, sel.collar, sel.hood]) {
    if (!p) continue;
    const { shape: raw, box } = normalize(shapeOf(p));
    const dy = topY - box.h * (1 - OVERLAP);
    const placed = translateShape(raw, 0, dy);
    add(placed, 'accessory', 2);
    topY = bboxOf(placed.outline).minY;
  }

  // Cape drawn behind everything (z=-1), roughly centered over the torso.
  if (sel.cape) {
    const { shape: raw } = normalize(shapeOf(sel.cape));
    add(raw, 'accessory', -1);
  }

  // Pocket(s) overlay directly on the core panel, lower-third, offset from
  // center — the only position derivable without literal placement data.
  if (sel.pocket) {
    const { shape: raw, box } = normalize(shapeOf(sel.pocket));
    const anchorX = coreBox.w * 0.16;
    const anchorY = coreBox.h * 0.58;
    const dx = anchorX - box.w / 2;
    const placed = translateShape(raw, dx, anchorY);
    add(placed, 'accessory', 3);
  }

  parts.sort((a, b) => a.z - b.z);
  return parts;
}

// ---------- colourway ----------
// docs/plan 4.md §7.3: "a per-design colourway... so cards are visually
// distinguishable at a glance." Phase 1 keeps library CONTENT unchanged
// (§9), so rather than requiring every LIBRARY.push() call site across
// js/data.js/js/library.js/js/fancy-patterns.js/js/girls-leotards.js/js/
// underwear-library.js to author one, the colourway is derived
// deterministically from the pattern id itself — stable across reloads,
// distinct enough across the library, zero content edits required. A
// future registration MAY set an explicit `color` on its LIBRARY entry
// (checked first) to art-direct a specific design without touching this
// file.
function hashHue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}
function colourwayFor(id, explicit) {
  if (explicit && explicit.fill) return explicit;
  const hue = hashHue(id);
  return {
    fill: `hsl(${hue} 42% 72%)`,
    fillAccessory: `hsl(${hue} 38% 62%)`,
    accent: `hsl(${hue} 55% 40%)`,
  };
}

// ---------- SVG assembly ----------
function partsToSvg(parts, colours) {
  const allPts = parts.flatMap((p) => p.shape.outline);
  const b = bboxOf(allPts);
  const pad = Math.max(1, Math.max(b.w, b.h) * 0.06);
  const minX = b.minX - pad, minY = b.minY - pad, w = b.w + pad * 2, h = b.h + pad * 2;

  let body = '';
  for (const part of parts) {
    const fill = part.kind === 'accessory' ? colours.fillAccessory : colours.fill;
    const d = outlinePathD(part.shape.outline, part.shape.curves);
    body += `<path d="${d}" fill="${fill}" style="stroke:var(--ink);stroke-width:${(w * 0.006).toFixed(3)}" stroke-linejoin="round"/>`;
    for (const dart of part.shape.darts) {
      if (dart.length < 3) continue;
      const [apex, legA, legB] = dart;
      body += `<path d="M ${legA[0].toFixed(2)} ${legA[1].toFixed(2)} L ${apex[0].toFixed(2)} ${apex[1].toFixed(2)} L ${legB[0].toFixed(2)} ${legB[1].toFixed(2)}" fill="none" style="stroke:var(--ink-2);stroke-width:${(w * 0.003).toFixed(3)}"/>`;
    }
  }
  return `<svg viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" xmlns="http://www.w3.org/2000/svg" role="img">${body}</svg>`;
}

// ---------- public API ----------
// Cached per pattern id — thumbnails are always composed at size M
// (docs/plan 4.md §7.3 step 1) and don't need to regrade; the library
// grid renders every card at once and must stay responsive.
const cache = new Map();

// entry: the LIBRARY.push() row for this id ({id, cat, tag, type, color?})
// — only `color` is read here, and only if a future registration adds it.
export function renderPatternFlat(id, entry) {
  if (cache.has(id)) return cache.get(id);
  let svg = null;
  try {
    const pattern = PATTERNS[id];
    if (pattern) {
      const category = pattern.category || 'women';
      const m = computeMeasurements({ category, size: 'M', standard: 'intl' });
      const pieces = pattern.pieces(m);
      const parts = composePattern(pieces);
      if (parts && parts.length) {
        const colours = colourwayFor(id, entry && entry.color);
        svg = partsToSvg(parts, colours);
      }
    }
  } catch (e) {
    svg = null; // fall back to LIB_ICONS — never let a bad pattern break the library grid
  }
  cache.set(id, svg);
  return svg;
}

// Test-only: bypasses the cache (library-thumbnails.test.js needs a fresh
// render per call to compare distinctness; production code should always
// use renderPatternFlat).
export function _renderUncached(id, entry) {
  cache.delete(id);
  const svg = renderPatternFlat(id, entry);
  cache.delete(id);
  return svg;
}
