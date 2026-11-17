/* ============================================================
   BerryStudio-Upgrade-Plan WP-12 — export-format builders, extracted as
   pure functions (no DOM, no Canvas closure state) so they're directly
   unit-testable via `node --test` — same rationale as js/nesting-core.js:
   Canvas's own module needs a real <canvas> + 2D context (jsdom doesn't
   provide one without the native `canvas` package, which isn't a
   dependency here), so anything worth testing precisely has to live
   outside that closure. `js/canvas.js`'s exportDXF()/exportHPGL() are
   now thin wrappers calling into this module with their own `pieces`.
   ============================================================ */

import { offsetPoly } from './geometry.js';

// A vertex's interior angle deviating from straight (180°) by more than
// this counts as a real corner — a smoothly bezier-sampled curve's own
// intermediate points stay well under it.
const TURN_ANGLE_THRESHOLD_DEG = 20;

export function isTurnPoint(outline, i) {
  const n = outline.length;
  const prev = outline[(i - 1 + n) % n], o = outline[i], next = outline[(i + 1) % n];
  const v1 = [o[0] - prev[0], o[1] - prev[1]], v2 = [next[0] - o[0], next[1] - o[1]];
  const len1 = Math.hypot(v1[0], v1[1]) || 1, len2 = Math.hypot(v2[0], v2[1]) || 1;
  const cosA = (v1[0] * v2[0] + v1[1] * v2[1]) / (len1 * len2);
  const angleDeg = (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;
  return angleDeg > TURN_ANGLE_THRESHOLD_DEG;
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

// Emits the PDF content-stream path operators ('m'/'l'/'c') for one
// piece's outline — a real cubic bezier ('c') for any span p.curves (WP-14;
// see princessCurve() in js/fancy-patterns.js) declares, straight lines
// ('l') for everything else. Without this, every curved seam — including
// ones PDF natively supports as a real bezier — exported as the same
// flattened straight-segment polyline PDF drew for hard corners, needlessly
// faceted since the real control points were sitting right there in
// p.curves and simply never read. `X`/`Y` are raw-number coordinate
// transforms (this formats to 2dp itself); caller still appends its own
// "h S"-style close+stroke after this. A curve whose toIdx wraps past the
// end of the outline (not produced by princessCurve() today, but not
// guaranteed by the data shape either) falls back to straight segments
// for that span rather than assuming a direction that isn't there.
function outlinePathOps(p, X, Y) {
  const o = p.outline, n = o.length;
  const curveByFrom = new Map((p.curves || []).map((c) => [c.fromIdx, c]));
  let cs = `${X(o[0][0]).toFixed(2)} ${Y(o[0][1]).toFixed(2)} m\n`;
  let i = 0;
  while (i < n - 1) {
    const c = curveByFrom.get(i);
    if (c && c.toIdx > i && c.toIdx < n && c.c1 && c.c2) {
      cs += `${X(c.c1[0]).toFixed(2)} ${Y(c.c1[1]).toFixed(2)} ${X(c.c2[0]).toFixed(2)} ${Y(c.c2[1]).toFixed(2)} ${X(o[c.toIdx][0]).toFixed(2)} ${Y(o[c.toIdx][1]).toFixed(2)} c\n`;
      i = c.toIdx;
    } else if (c && c.toIdx === 0 && i > 0 && c.c1 && c.c2) {
      cs += `${X(c.c1[0]).toFixed(2)} ${Y(c.c1[1]).toFixed(2)} ${X(c.c2[0]).toFixed(2)} ${Y(c.c2[1]).toFixed(2)} ${X(o[0][0]).toFixed(2)} ${Y(o[0][1]).toFixed(2)} c\n`;
      i = n;
      break;
    } else {
      i++;
      cs += `${X(o[i][0]).toFixed(2)} ${Y(o[i][1]).toFixed(2)} l\n`;
    }
  }
  const closeC = curveByFrom.get(n - 1);
  if (i === n - 1 && closeC && closeC.toIdx === 0 && closeC.c1 && closeC.c2) {
    cs += `${X(closeC.c1[0]).toFixed(2)} ${Y(closeC.c1[1]).toFixed(2)} ${X(closeC.c2[0]).toFixed(2)} ${Y(closeC.c2[1]).toFixed(2)} ${X(o[0][0]).toFixed(2)} ${Y(o[0][1]).toFixed(2)} c\n`;
  }
  return cs;
}

// ---- DXF (AutoCAD R12 ENTITIES; cm units, y-up) ----
// Real AAMA/ASTM D6673 layer numbering:
//   1  piece boundary (cut line)        8  internal lines (dart legs)
//   2  turn/corner points               11 grainline
//   3  curve points (WP-14 piece.curves 13 drill holes (dart apexes)
//      metadata — empty until a piece
//      actually has it, never guessed)
//   4  grade-reference point (piece centroid placeholder until WP-13
//      adds a real declared reference point) + notches
export function buildDXF(pieces) {
  if (!pieces || !pieces.length) return "";
  const out = ["0", "SECTION", "2", "ENTITIES"];
  const push = (...l) => out.push(...l);
  pieces.forEach((p) => {
    push("0", "LWPOLYLINE", "8", "1", "90", String(p.outline.length), "70", "1", "43", "0");
    p.outline.forEach((pt) => push("10", pt[0].toFixed(3), "20", (-pt[1]).toFixed(3)));

    p.outline.forEach((pt, i) => { if (isTurnPoint(p.outline, i)) push("0", "POINT", "8", "2", "10", pt[0].toFixed(3), "20", (-pt[1]).toFixed(3)); });

    (p.curves || []).forEach((c) => {
      if (c.c1) push("0", "POINT", "8", "3", "10", c.c1[0].toFixed(3), "20", (-c.c1[1]).toFixed(3));
      if (c.c2) push("0", "POINT", "8", "3", "10", c.c2[0].toFixed(3), "20", (-c.c2[1]).toFixed(3));
    });

    const cx = avg(p.outline.map((pt) => pt[0])), cy = avg(p.outline.map((pt) => pt[1]));
    push("0", "POINT", "8", "4", "10", cx.toFixed(3), "20", (-cy).toFixed(3));
    (p.notches || []).forEach((nt) => push("0", "POINT", "8", "4", "10", nt[0].toFixed(3), "20", (-nt[1]).toFixed(3)));

    // Dart legs (layer 8) — this app's dart shape is [apex, legA, legC],
    // apex at index 0 (js/canvas.js's on-canvas renderer draws
    // `moveTo(legA=d[1]) -> lineTo(apex=d[0]) -> lineTo(legC=d[2])`; every
    // real dart in js/data.js and js/ai.js confirms apex is index 0, not
    // 1). Draw the two real legs (apex-to-legA, apex-to-legC) explicitly
    // rather than a naive d[i]-to-d[i+1] chain, which would instead draw
    // apex-to-legA plus a spurious line straight across the two leg ends.
    (p.darts || []).forEach((d) => {
      if (d.length < 3) return;
      const [apex, legA, legC] = d;
      push("0", "LINE", "8", "8", "10", apex[0].toFixed(3), "20", (-apex[1]).toFixed(3), "11", legA[0].toFixed(3), "21", (-legA[1]).toFixed(3));
      push("0", "LINE", "8", "8", "10", apex[0].toFixed(3), "20", (-apex[1]).toFixed(3), "11", legC[0].toFixed(3), "21", (-legC[1]).toFixed(3));
    });

    if (p.grain && p.grain.length === 2) push("0", "LINE", "8", "11", "10", p.grain[0][0].toFixed(3), "20", (-p.grain[0][1]).toFixed(3), "11", p.grain[1][0].toFixed(3), "21", (-p.grain[1][1]).toFixed(3));

    // Dart apex drill hole (layer 13) — apex at index 0, see above.
    (p.darts || []).forEach((d) => { if (d[0]) push("0", "POINT", "8", "13", "10", d[0][0].toFixed(3), "20", (-d[0][1]).toFixed(3)); });
  });
  push("0", "ENDSEC", "0", "EOF");
  return out.join("\n");
}

// Minimal DXF group-code reader — just enough to verify buildDXF()'s own
// output in tests, not a general-purpose DXF parser. Returns
// {entityType, layer}[] for every ENTITIES-section entity.
export function parseDXFEntities(dxfText) {
  const lines = dxfText.split("\n");
  const entities = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 2) {
    const code = lines[i], value = lines[i + 1];
    if (code === "0") {
      if (current) entities.push(current);
      current = value === "ENDSEC" || value === "SECTION" || value === "EOF" ? null : { entityType: value, layer: null };
    } else if (code === "8" && current) {
      current.layer = value;
    }
  }
  if (current) entities.push(current);
  return entities;
}

// ---- HPGL (genuine plotter output — cut line only, one pen) ----
// HPGL's native unit is 1/40mm ("plotter units") — PU/PD coordinates below
// are in that unit, converted from this app's cm working space.
const HPGL_UNITS_PER_CM = 400; // 1cm = 10mm = 400 * (1/40mm)

// ---- PDF (hand-built, valid PDF 1.4) ----

// Byte-for-byte verbatim port of the pre-WP-12 single-page exportPDF() —
// including its own original 1=Catalog/2=Pages/3=Page/4=Contents/5=Font
// object numbering, deliberately NOT routed through the generalized
// assemblePDFObjects() below (which numbers objects differently to
// accommodate an arbitrary page count). The default, unflagged path
// (`buildPDF(pieces, {tiled:false})`) must reproduce this exactly, so
// `state.tiled` toggling never changes existing behavior for anyone who
// doesn't opt in.
function buildSinglePagePDF(pieces) {
  if (!pieces.length) return null;
  const PT = 28.3465;
  const all = pieces.flatMap((p) => p.outline);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  const margin = 28;
  const W = (maxX - minX) * PT + margin * 2, H = (maxY - minY) * PT + margin * 2;
  const Xn = (x) => (x - minX) * PT + margin, Yn = (y) => H - ((y - minY) * PT + margin);
  const X = (x) => Xn(x).toFixed(2), Y = (y) => Yn(y).toFixed(2);
  let cs = "0.75 w 0 0 0 RG 0 0 0 rg\n";
  pieces.forEach((p) => {
    cs += outlinePathOps(p, Xn, Yn);
    cs += "h S\n";
    if (p.grain && p.grain.length === 2) cs += `${X(p.grain[0][0])} ${Y(p.grain[0][1])} m ${X(p.grain[1][0])} ${Y(p.grain[1][1])} l S\n`;
    (p.darts || []).forEach((d) => { d.forEach((pt, i) => cs += `${X(pt[0])} ${Y(pt[1])} ${i ? 'l' : 'm'}\n`); cs += "S\n"; });
    const cx = avg(p.outline.map((q) => q[0])), cy = avg(p.outline.map((q) => q[1]));
    const label = String((p.name && p.name.en) || "").replace(/[()\\]/g, "").replace(/[^\x20-\x7E]/g, "");
    cs += `BT /F1 9 Tf ${(Xn(cx) - label.length * 2.4).toFixed(2)} ${Yn(cy).toFixed(2)} Td (${label}) Tj ET\n`;
  });
  const objs = [null,
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${cs.length} >>\nstream\n${cs}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf = "%PDF-1.4\n"; const off = [];
  for (let i = 1; i <= 5; i++) { off[i] = pdf.length; pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) pdf += String(off[i]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

// Multi-page object numbering for the tiled path: 1=Catalog, 2=Pages,
// 3=Font, then a Page+Contents pair per page (4,5 / 6,7 / ...) — same
// hand-rolled technique as the single-page builder above, generalized to
// an arbitrary page count (which the single-page case never needed).
function assemblePDFObjects(pages) {
  const n = pages.length;
  const objs = {};
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((pg, i) => {
    const pageNum = 4 + i * 2, contentNum = pageNum + 1;
    objs[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pg.mediaBox[0].toFixed(2)} ${pg.mediaBox[1].toFixed(2)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`;
    objs[contentNum] = `<< /Length ${pg.contentStream.length} >>\nstream\n${pg.contentStream}endstream`;
  });
  const total = 3 + n * 2;
  let pdf = "%PDF-1.4\n"; const off = [];
  for (let i = 1; i <= total; i++) { off[i] = pdf.length; pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i++) pdf += String(off[i]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

const PAGE_SIZES_MM = { a4: [210, 297], letter: [215.9, 279.4] };
const TILE_MARGIN_MM = 10; // printer-safe margin within each tile's own page

// Pure tiling geometry: given the pattern's full bounding box (cm) and a
// page size + overlap (mm), returns the grid of tiles needed to print the
// whole pattern at 1:1 scale across multiple sheets, each overlapping its
// neighbors by `overlapMm` so adjacent sheets can be aligned (matching up
// the registration marks in the shared strip) and taped/trimmed together.
export function computeTileGrid(bboxCm, pageSizeMm, overlapMm) {
  const [pageWmm, pageHmm] = pageSizeMm;
  const contentWmm = pageWmm - 2 * TILE_MARGIN_MM;
  const contentHmm = pageHmm - 2 * TILE_MARGIN_MM;
  const stepWmm = Math.max(1, contentWmm - overlapMm);
  const stepHmm = Math.max(1, contentHmm - overlapMm);
  const totalWmm = bboxCm.w * 10, totalHmm = bboxCm.h * 10;
  const cols = Math.max(1, Math.ceil(totalWmm / stepWmm));
  const rows = Math.max(1, Math.ceil(totalHmm / stepHmm));
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({ row: r, col: c, originMm: [c * stepWmm, r * stepHmm] });
    }
  }
  return { rows, cols, tiles, contentWmm, contentHmm, stepWmm, stepHmm };
}

// `includeGuides` (default true) draws the registration crosshairs + the
// row/column label — the Export pane's own separate "Registration marks +
// assembly guide" toggle (distinct from "Tiled home printing" itself) maps
// to this. Turning it off still tiles+overlaps the pattern (a plain
// multi-page cut, no assembly help drawn on top) for a user who's already
// comfortable lining pages up by eye.
function tileContentStream(pieces, originXcm, originYcm, pageWpt, pageHpt, marginPt, tile, grid, includeGuides) {
  const PT_CM = 28.3465;
  const X = (xCm) => (xCm - originXcm) * PT_CM + marginPt;
  const Y = (yCm) => pageHpt - ((yCm - originYcm) * PT_CM + marginPt);
  const contentW = pageWpt - 2 * marginPt, contentH = pageHpt - 2 * marginPt;
  let cs = "0.75 w 0 0 0 RG 0 0 0 rg\n";
  // Clip to this tile's own content window (q/Q bracketed) so a piece
  // extending past this tile's edge doesn't draw over the registration
  // marks/labels, which are deliberately drawn AFTER the clip is lifted.
  cs += `q\n${marginPt.toFixed(2)} ${marginPt.toFixed(2)} ${contentW.toFixed(2)} ${contentH.toFixed(2)} re W n\n`;
  pieces.forEach((p) => {
    cs += outlinePathOps(p, X, Y);
    cs += "h S\n";
  });
  cs += "Q\n";
  if (!includeGuides) return cs;
  // Registration crosshairs at the 4 corners of the content window — the
  // SAME pattern-space location falls inside more than one tile's overlap
  // strip, so these marks line up when two printed sheets are overlaid.
  const armPt = 4 * (72 / 25.4); // ~4mm arm length, in points
  const corners = [[marginPt, marginPt], [pageWpt - marginPt, marginPt], [marginPt, pageHpt - marginPt], [pageWpt - marginPt, pageHpt - marginPt]];
  corners.forEach(([cx, cy]) => {
    cs += `0.4 w ${(cx - armPt).toFixed(2)} ${cy.toFixed(2)} m ${(cx + armPt).toFixed(2)} ${cy.toFixed(2)} l S\n`;
    cs += `${cx.toFixed(2)} ${(cy - armPt).toFixed(2)} m ${cx.toFixed(2)} ${(cy + armPt).toFixed(2)} l S\n`;
  });
  // Row/column label, bottom-left margin.
  cs += `BT /F1 8 Tf ${marginPt.toFixed(2)} ${(marginPt / 2).toFixed(2)} Td (R${tile.row + 1}C${tile.col + 1} of ${grid.rows}x${grid.cols}) Tj ET\n`;
  return cs;
}

function assemblyMapStream(grid, pageWpt, pageHpt, marginPt) {
  const PT_CM = 28.3465;
  let cs = "0.5 w 0 0 0 RG 0 0 0 rg\n";
  cs += `BT /F1 14 Tf ${marginPt.toFixed(2)} ${(pageHpt - marginPt - 14).toFixed(2)} Td (Assembly map — ${grid.rows}x${grid.cols} pages) Tj ET\n`;
  // Small thumbnail grid, one rectangle per tile, labelled.
  const availW = pageWpt - 2 * marginPt, availH = pageHpt - 3 * marginPt - 40;
  const cellW = availW / grid.cols, cellH = availH / grid.rows;
  grid.tiles.forEach((t) => {
    const x = marginPt + t.col * cellW, yTop = pageHpt - 2 * marginPt - 40 - t.row * cellH;
    cs += `${x.toFixed(2)} ${(yTop - cellH).toFixed(2)} ${(cellW - 2).toFixed(2)} ${(cellH - 2).toFixed(2)} re S\n`;
    cs += `BT /F1 9 Tf ${(x + 4).toFixed(2)} ${(yTop - 14).toFixed(2)} Td (R${t.row + 1}C${t.col + 1}) Tj ET\n`;
  });
  // A genuine 10cm x 10cm calibration square, drawn once — printing this
  // page at anything other than 100%/"actual size" is immediately obvious
  // if the square doesn't measure 10cm with a ruler.
  const sqPt = 10 * PT_CM, sqX = marginPt, sqY = marginPt;
  cs += `${sqX.toFixed(2)} ${sqY.toFixed(2)} ${sqPt.toFixed(2)} ${sqPt.toFixed(2)} re S\n`;
  cs += `BT /F1 8 Tf ${sqX.toFixed(2)} ${(sqY + sqPt + 4).toFixed(2)} Td (10cm x 10cm calibration — print at 100%\\/actual size) Tj ET\n`;
  return cs;
}

// `opts.tiled` (default false) reproduces buildSinglePagePDF() exactly —
// ship-behind-flag, per this project's own non-negotiable rule #5.
export function buildPDF(pieces, opts = {}) {
  const { tiled = false, pageSize = 'a4', overlapMm = 10, includeGuides = true } = opts;
  if (!pieces || !pieces.length) return null;
  if (!tiled) return buildSinglePagePDF(pieces);

  const PT_MM = 2.83465;
  const all = pieces.flatMap((p) => p.outline);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  const bboxCm = { minX, minY, w: maxX - minX, h: maxY - minY };
  const pageSizeMm = PAGE_SIZES_MM[pageSize] || PAGE_SIZES_MM.a4;
  const grid = computeTileGrid(bboxCm, pageSizeMm, overlapMm);
  const pageWpt = pageSizeMm[0] * PT_MM, pageHpt = pageSizeMm[1] * PT_MM, marginPt = TILE_MARGIN_MM * PT_MM;

  const pages = includeGuides ? [{ mediaBox: [pageWpt, pageHpt], contentStream: assemblyMapStream(grid, pageWpt, pageHpt, marginPt) }] : [];
  grid.tiles.forEach((tile) => {
    const originXcm = bboxCm.minX + tile.originMm[0] / 10;
    const originYcm = bboxCm.minY + tile.originMm[1] / 10;
    pages.push({ mediaBox: [pageWpt, pageHpt], contentStream: tileContentStream(pieces, originXcm, originYcm, pageWpt, pageHpt, marginPt, tile, grid, includeGuides) });
  });
  return assemblePDFObjects(pages);
}

export function buildHPGL(pieces) {
  if (!pieces || !pieces.length) return "";
  const toUnit = (v) => Math.round(v * HPGL_UNITS_PER_CM);
  let out = "IN;SP1;\n";
  pieces.forEach((p) => {
    if (!p.outline || !p.outline.length) return;
    out += `PU${toUnit(p.outline[0][0])},${toUnit(-p.outline[0][1])};\n`;
    for (let i = 1; i < p.outline.length; i++) out += `PD${toUnit(p.outline[i][0])},${toUnit(-p.outline[i][1])};\n`;
    // close the polygon back to the start
    out += `PD${toUnit(p.outline[0][0])},${toUnit(-p.outline[0][1])};\n`;
  });
  out += "PU;SP0;\n";
  return out;
}

// ---- Geometry & Piece Measurement Helpers for CAD / Tech-Pack Exports ----
function polyAreaCm2(outline) {
  if (!Array.isArray(outline) || outline.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i];
    const [x2, y2] = outline[(i + 1) % outline.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function polyPerimeterCm(outline) {
  if (!Array.isArray(outline) || outline.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i];
    const [x2, y2] = outline[(i + 1) % outline.length];
    len += Math.hypot(x2 - x1, y2 - y1);
  }
  return len;
}

function pieceStats(p) {
  const o = Array.isArray(p?.outline) ? p.outline : [];
  if (!o.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0, area: 0, perimeter: 0 };
  const xs = o.map((pt) => pt[0]), ys = o.map((pt) => pt[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return {
    minX, minY, maxX, maxY,
    w: +(maxX - minX).toFixed(2),
    h: +(maxY - minY).toFixed(2),
    area: +polyAreaCm2(o).toFixed(2),
    perimeter: +polyPerimeterCm(o).toFixed(2),
  };
}

function escXML(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function svgOutlinePathD(p, dx = 0, dy = 0) {
  const o = p.outline;
  if (!Array.isArray(o) || !o.length) return '';
  const n = o.length;
  const curveByFrom = new Map((p.curves || []).map((c) => [c.fromIdx, c]));
  const fx = (v) => +(v + dx).toFixed(3);
  const fy = (v) => +(v + dy).toFixed(3);
  let d = `M ${fx(o[0][0])} ${fy(o[0][1])}`;
  let i = 0;
  while (i < n - 1) {
    const c = curveByFrom.get(i);
    if (c && c.toIdx > i && c.toIdx < n && c.c1 && c.c2) {
      d += ` C ${fx(c.c1[0])} ${fy(c.c1[1])}, ${fx(c.c2[0])} ${fy(c.c2[1])}, ${fx(o[c.toIdx][0])} ${fy(o[c.toIdx][1])}`;
      i = c.toIdx;
    } else if (c && c.toIdx === 0 && i > 0 && c.c1 && c.c2) {
      d += ` C ${fx(c.c1[0])} ${fy(c.c1[1])}, ${fx(c.c2[0])} ${fy(c.c2[1])}, ${fx(o[0][0])} ${fy(o[0][1])}`;
      i = n;
      break;
    } else {
      i++;
      d += ` L ${fx(o[i][0])} ${fy(o[i][1])}`;
    }
  }
  const closeC = curveByFrom.get(n - 1);
  if (i === n - 1 && closeC && closeC.toIdx === 0 && closeC.c1 && closeC.c2) {
    d += ` C ${fx(closeC.c1[0])} ${fy(closeC.c1[1])}, ${fx(closeC.c2[0])} ${fy(closeC.c2[1])}, ${fx(o[0][0])} ${fy(o[0][1])}`;
  }
  return d + ' Z';
}

// Auto-pack pieces cleanly on a virtual sheet when raw pieces haven't been laid out on Canvas yet
function ensureSheetLayout(pieces) {
  if (!pieces || !pieces.length) return [];
  // Check if pieces all overlap near [0,0] (raw builder output) vs already positioned
  let nearOriginCount = 0;
  for (const p of pieces) {
    if (!p?.outline?.length) continue;
    const st = pieceStats(p);
    if (Math.abs(st.minX) < 5 && Math.abs(st.minY) < 8) nearOriginCount++;
  }
  if (nearOriginCount <= 1) return pieces;
  let curX = 4, curY = 4, rowH = 0;
  const maxRowW = 145, gap = 6;
  return pieces.map((p) => {
    if (!p?.outline?.length) return p;
    const st = pieceStats(p);
    if (curX > 4 && curX + st.w > maxRowW) {
      curX = 4;
      curY += rowH + gap;
      rowH = 0;
    }
    const dx = curX - st.minX, dy = curY - st.minY;
    const shift = ([x, y]) => [+(x + dx).toFixed(3), +(y + dy).toFixed(3)];
    const moved = {
      ...p,
      outline: p.outline.map(shift),
      curves: (p.curves || []).map((c) => ({ ...c, c1: c.c1 ? shift(c.c1) : c.c1, c2: c.c2 ? shift(c.c2) : c.c2 })),
      darts: (p.darts || []).map((d) => d.map(shift)),
      notches: (p.notches || []).map(shift),
      grain: Array.isArray(p.grain) && p.grain.length === 2 ? p.grain.map(shift) : p.grain,
    };
    curX += st.w + gap;
    rowH = Math.max(rowH, st.h);
    return moved;
  });
}

// ---- Standalone 1:1 Vector SVG Pattern Builder (.svg) ----
export function buildSVG(pieces, opts = {}) {
  if (!pieces || !pieces.length) return "";
  const laid = opts.preservePositions ? pieces : ensureSheetLayout(pieces);
  const seamCm = Number(opts.seamAllowanceCm) > 0 ? Number(opts.seamAllowanceCm) : 0;
  const includeScaleBar = opts.includeScaleBar !== false;
  const lang = opts.lang === 'ar' ? 'ar' : 'en';
  const all = laid.flatMap((p) => p.outline || []);
  if (!all.length) return "";
  const pad = Math.max(4, seamCm + 3);
  const xs = all.map((pt) => pt[0]), ys = all.map((pt) => pt[1]);
  const minX = +(Math.min(...xs) - pad).toFixed(2);
  const minY = +(Math.min(...ys) - pad).toFixed(2);
  const w = +(Math.max(...xs) - minX + pad).toFixed(2);
  const h = +(Math.max(...ys) - minY + pad + (includeScaleBar ? 5 : 0)).toFixed(2);

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}cm" height="${h}cm" data-generator="BerryStudio" data-units="cm">\n`;
  s += `  <g id="pattern-pieces" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
  laid.forEach((p, idx) => {
    if (!p?.outline?.length) return;
    const label = (p.name && (p.name[lang] || p.name.en)) || p.key || `Piece ${idx + 1}`;
    const role = p.role || 'other';
    s += `    <g id="piece-${idx + 1}" data-role="${escXML(role)}" data-name="${escXML(label)}">\n`;
    if (seamCm > 0 && p.outline.length >= 3) {
      try {
        const sa = offsetPoly(p.outline, seamCm);
        if (Array.isArray(sa) && sa.length >= 3) {
          const saD = sa.map((pt, j) => `${j === 0 ? 'M' : 'L'} ${pt[0].toFixed(3)} ${pt[1].toFixed(3)}`).join(' ') + ' Z';
          s += `      <path class="seam-allowance" d="${saD}" stroke="#888888" stroke-width="0.1" stroke-dasharray="0.45,0.3"/>\n`;
        }
      } catch { /* skip SA if degenerate */ }
    }
    s += `      <path class="cut-line" d="${svgOutlinePathD(p)}" stroke="#18181b" stroke-width="0.18"/>\n`;
    if (Array.isArray(p.grain) && p.grain.length === 2) {
      const [[gx1, gy1], [gx2, gy2]] = p.grain;
      s += `      <line class="grainline" x1="${gx1.toFixed(3)}" y1="${gy1.toFixed(3)}" x2="${gx2.toFixed(3)}" y2="${gy2.toFixed(3)}" stroke="#4f46e5" stroke-width="0.12"/>\n`;
    }
    (p.darts || []).forEach((d) => {
      if (Array.isArray(d) && d.length >= 3) {
        const [apex, legA, legC] = d;
        s += `      <path class="dart" d="M ${legA[0].toFixed(3)} ${legA[1].toFixed(3)} L ${apex[0].toFixed(3)} ${apex[1].toFixed(3)} L ${legC[0].toFixed(3)} ${legC[1].toFixed(3)}" stroke="#dc2626" stroke-width="0.12"/>\n`;
      }
    });
    (p.notches || []).forEach((nt) => {
      if (Array.isArray(nt) && nt.length === 2) {
        s += `      <circle class="notch" cx="${nt[0].toFixed(3)}" cy="${nt[1].toFixed(3)}" r="0.28" fill="#18181b" stroke="none"/>\n`;
      }
    });
    const cx = avg(p.outline.map((pt) => pt[0])), cy = avg(p.outline.map((pt) => pt[1]));
    const cutNote = p.cutOnFold ? (lang === 'ar' ? 'قص ١ على الثنية' : 'Cut 1 on Fold') : `Cut ${p.quantity || (p.bilateral ? 2 : 1)}`;
    s += `      <text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="1.35" font-weight="600" fill="#18181b" stroke="none" text-anchor="middle">${escXML(label)}</text>\n`;
    s += `      <text x="${cx.toFixed(2)}" y="${(cy + 1.7).toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="0.95" fill="#52525b" stroke="none" text-anchor="middle">${escXML(cutNote)}</text>\n`;
    s += `    </g>\n`;
  });
  s += `  </g>\n`;
  if (includeScaleBar) {
    const bx = +(minX + 2).toFixed(2), by = +(minY + h - 3).toFixed(2);
    s += `  <g id="calibration-scale" stroke="#18181b" stroke-width="0.16" fill="none">\n`;
    s += `    <rect x="${bx}" y="${by}" width="10" height="1.2"/>\n`;
    s += `    <text x="${(bx + 5).toFixed(2)}" y="${(by - 0.5).toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="0.95" fill="#18181b" stroke="none" text-anchor="middle">10 cm (1:1 Calibration)</text>\n`;
    s += `  </g>\n`;
  }
  s += `</svg>`;
  return s;
}

// ---- Encapsulated PostScript (.eps) Vector Pattern Builder ----
export function buildEPS(pieces, opts = {}) {
  if (!pieces || !pieces.length) return "";
  const laid = opts.preservePositions ? pieces : ensureSheetLayout(pieces);
  const PT = 28.3465; // exact PostScript points per cm (72 / 2.54)
  const all = laid.flatMap((p) => p.outline || []);
  if (!all.length) return "";
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
  const margin = 28;
  const W = (maxX - minX) * PT + margin * 2;
  const H = (maxY - minY) * PT + margin * 2;
  const Xn = (x) => (x - minX) * PT + margin;
  const Yn = (y) => H - ((y - minY) * PT + margin);

  let eps = `%!PS-Adobe-3.0 EPSF-3.0\n`;
  eps += `%%Creator: BerryStudio Master Atelier CAD\n`;
  eps += `%%Title: BerryStudio 1:1 Sewing Pattern\n`;
  eps += `%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}\n`;
  eps += `%%HiResBoundingBox: 0.00 0.00 ${W.toFixed(2)} ${H.toFixed(2)}\n`;
  eps += `%%LanguageLevel: 2\n%%EndComments\n`;
  eps += `0.75 setlinewidth 1 setlinecap 1 setlinejoin 0 0 0 setrgbcolor\n`;
  eps += `/Helvetica findfont 9 scalefont setfont\n`;

  laid.forEach((p) => {
    const o = p.outline;
    if (!o || !o.length) return;
    const n = o.length;
    const curveByFrom = new Map((p.curves || []).map((c) => [c.fromIdx, c]));
    eps += `newpath\n${Xn(o[0][0]).toFixed(2)} ${Yn(o[0][1]).toFixed(2)} moveto\n`;
    let i = 0;
    while (i < n - 1) {
      const c = curveByFrom.get(i);
      if (c && c.toIdx > i && c.toIdx < n && c.c1 && c.c2) {
        eps += `${Xn(c.c1[0]).toFixed(2)} ${Yn(c.c1[1]).toFixed(2)} ${Xn(c.c2[0]).toFixed(2)} ${Yn(c.c2[1]).toFixed(2)} ${Xn(o[c.toIdx][0]).toFixed(2)} ${Yn(o[c.toIdx][1]).toFixed(2)} curveto\n`;
        i = c.toIdx;
      } else {
        i++;
        eps += `${Xn(o[i][0]).toFixed(2)} ${Yn(o[i][1]).toFixed(2)} lineto\n`;
      }
    }
    eps += `closepath stroke\n`;
    if (Array.isArray(p.grain) && p.grain.length === 2) {
      eps += `newpath ${Xn(p.grain[0][0]).toFixed(2)} ${Yn(p.grain[0][1]).toFixed(2)} moveto ${Xn(p.grain[1][0]).toFixed(2)} ${Yn(p.grain[1][1]).toFixed(2)} lineto stroke\n`;
    }
    (p.darts || []).forEach((d) => {
      if (d.length >= 3) {
        const [apex, legA, legC] = d;
        eps += `newpath ${Xn(legA[0]).toFixed(2)} ${Yn(legA[1]).toFixed(2)} moveto ${Xn(apex[0]).toFixed(2)} ${Yn(apex[1]).toFixed(2)} lineto ${Xn(legC[0]).toFixed(2)} ${Yn(legC[1]).toFixed(2)} lineto stroke\n`;
      }
    });
    const cx = avg(o.map((pt) => pt[0])), cy = avg(o.map((pt) => pt[1]));
    const lbl = String((p.name && p.name.en) || p.key || "Piece").replace(/[()\\]/g, "").replace(/[^\x20-\x7E]/g, "");
    eps += `${(Xn(cx) - lbl.length * 2.4).toFixed(2)} ${Yn(cy).toFixed(2)} moveto (${lbl}) show\n`;
  });
  eps += `showpage\n%%EOF\n`;
  return eps;
}

// ---- Cut-List, Graded Measurement & Fabric Consumption CSV (.csv) ----
export function buildSpecCSV(pieces, meta = {}) {
  if (!pieces || !pieces.length) return "";
  const seamCm = Number(meta.seamAllowanceCm) >= 0 ? Number(meta.seamAllowanceCm) : 1.0;
  const csvCell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [];
  rows.push(['BerryStudio Atelier Pattern Specification', meta.title || 'Custom Pattern', 'Category', meta.category || 'women', 'Size', meta.size || 'Custom']);
  if (meta.measurements && typeof meta.measurements === 'object') {
    const mEntries = Object.entries(meta.measurements).filter(([, v]) => Number.isFinite(v));
    if (mEntries.length) {
      rows.push(['Body Measurements (cm)', ...mEntries.flatMap(([k, v]) => [k, (+v).toFixed(1)])]);
    }
  }
  rows.push([]);
  rows.push([
    'Piece_No', 'Key', 'Name_EN', 'Name_AR', 'Role', 'Cut_Qty', 'Cut_On_Fold',
    'Grainline', 'Width_cm', 'Length_cm', 'Net_Area_cm2', 'Perimeter_cm',
    'Notches', 'Darts', 'Bezier_Curves', 'Seam_Allowance_cm',
  ]);
  let totalAreaCm2 = 0;
  pieces.forEach((p, i) => {
    const st = pieceStats(p);
    const qty = Number.isInteger(p.quantity) ? p.quantity : (p.cutOnFold ? 1 : (p.bilateral ? 2 : 1));
    const effectiveArea = st.area * (p.cutOnFold ? 2 : 1) * qty;
    totalAreaCm2 += effectiveArea;
    rows.push([
      i + 1,
      p.key || `piece_${i + 1}`,
      p.name?.en || `Piece ${i + 1}`,
      p.name?.ar || p.name?.en || `قطعة ${i + 1}`,
      p.role || 'other',
      qty,
      p.cutOnFold ? 'Yes' : 'No',
      Array.isArray(p.grain) && p.grain.length === 2 ? 'Straight' : 'Declared',
      st.w,
      st.h,
      st.area,
      st.perimeter,
      (p.notches || []).length,
      (p.darts || []).length,
      (p.curves || []).length,
      seamCm,
    ]);
  });
  const estMeters150 = Math.max(0.4, (totalAreaCm2 / (145 * 100)) * 1.28);
  rows.push([]);
  rows.push(['Summary', 'Total_Pieces', pieces.length, 'Total_Garment_Area_cm2', totalAreaCm2.toFixed(1), 'Est_Fabric_150cm_Width_m', estMeters150.toFixed(2)]);
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---- Dynamic Role-Aware Sewing Construction Steps ----
export function deriveConstructionSteps(pieces, lang = 'en') {
  const ar = lang === 'ar';
  const roles = new Set((pieces || []).map((p) => p?.role).filter(Boolean));
  const hasDarts = (pieces || []).some((p) => Array.isArray(p?.darts) && p.darts.length > 0);
  const hasPleats = (pieces || []).some((p) => Array.isArray(p?.pleats) && p.pleats.length > 0);
  const steps = [];

  steps.push(ar
    ? 'التحضير والقص: افحص مربع المعايرة (10×10 سم)، ورتب القطع بموازاة سهم اتجاه النسيج تماماً، وانقل جميع علامات التقابل (الفرزات) والبنسات قبل رفع الباترون.'
    : 'Preparation & Cutting: Verify the 10×10 cm calibration square, align every piece strictly to the straight-grain arrow, respect Cut-on-Fold edges, and transfer all notches and dart markings.');

  if (hasDarts || roles.has('bodice-front-center') || roles.has('bodice-front-side')) {
    steps.push(ar
      ? 'التشكيل والتجسيم: قم بخياطة البنسات من القاعدة حتى الرأس واكْوِها باتجاه المنتصف، أو اجمع لوحات قصات الأميرة (الوسط والجانب) بمطابقة علامات الصدر والخصر بدقة.'
      : 'Shaping & Contouring: Stitch all bust/waist darts from base to apex and press toward center, or join Princess Center and Side panels matching bust and waist notches smoothly.');
  }
  if (hasPleats) {
    steps.push(ar
      ? 'الطيات أو الكشكشة: شكّل الكسرات أو اسحب خيوط الكشكشة لتطابق عرض خط الخصر أو الكتف النهائي وثبتها بخياطة تثبيت على بعد 0.5 سم.'
      : 'Pleats & Gathering: Fold declared pleats/tucks or draw gathering threads to match the target seam width, then baste 0.5 cm inside the seam line.');
  }
  if (roles.has('yoke')) {
    steps.push(ar
      ? 'تركيب الكوة (Yoke): ثبت كوة الكتف مع لوحة الظهر والكتف الأمامي بطريقة الساندويتش النظيفة واكْوِ الخياطة للأعلى.'
      : 'Shoulder Yoke Assembly: Attach the back yoke to the lower back panel, then enclose the front shoulder seams cleanly inside the yoke facing and press.');
  }
  if (roles.has('bodice-front') || roles.has('front-panel') || roles.has('bodice-front-center')) {
    steps.push(ar
      ? 'خياطة الأكتاف: طابق خياطات الكتف الأمامية والخلفية (وجه القماش للوجه)، واخِطها وافتح الخياطة بالمكواة.'
      : 'Shoulder Seams: Match front and back shoulder edges right-sides together, stitch at the declared seam allowance, finish raw edges, and press open.');
  }
  if (roles.has('collar') || roles.has('collar-stand') || roles.has('collar-band') || roles.has('hood')) {
    steps.push(ar
      ? 'تشطيب الرقبة / الياقة / القبعة: ركّب الياقة مع رجل الياقة (أو القبعة من قطعتين) وثبتها حول حردة الرقبة بمطابقة علامتي منتصف الخلف والكتف.'
      : 'Collar / Neckline / Hood: Assemble the collar and stand (or two-piece hood), notch curved seam allowances, and set cleanly into the neckline matching center-back and shoulder notches.');
  }
  if (roles.has('lapel-facing') || roles.has('placket-facing') || roles.has('facing')) {
    steps.push(ar
      ? 'السجاف والواجهة الأمامية: قوِّ قطع السجاف بالحشوة اللاصقة المناسبة، وخِطها على طول الفتحة الأمامية أو الرقبة مع خياطة تثبيت داخلية (Understitch) لمنع الانقلاب.'
      : 'Facings & Plackets: Fuse lightweight interfacing to facings/plackets, stitch along the front/neck edge, grade seam allowances, understitch, and press crisp.');
  }
  if (roles.has('sleeve') || roles.has('puff-sleeve') || roles.has('cap-sleeve') || roles.has('sleeve-upper')) {
    steps.push(ar
      ? 'تركيب الأكمام والأساور: اجمع درزات الكم (العلوي والسفلي إن وجد)، وطابق علامة الفرزة الأمامية المفردة والخلفية المزدوجة ورأس الكم مع خياطة الكتف، ثم ركّب الأساور.'
      : 'Sleeves & Cuffs: Join two-piece upper/under sleeve seams if present, ease the sleeve cap smoothly into the armscye matching single-front, crown, and double-back notches, and attach wrist cuffs.');
  }
  if (roles.has('pocket')) {
    steps.push(ar
      ? 'تركيب الجيوب: ثبّت الجيوب الجانبية المخفية على علامات الجيب أو ركّب جيوب الرقعة/الجيب المشقوق بموازاة خط الحبيبات.'
      : 'Pockets: Attach in-seam pocket bags at side-seam notches or topstitch patch/welt pockets square to the grainline before closing main seams.');
  }
  if (roles.has('trouser-front') || roles.has('shorts-front')) {
    steps.push(ar
      ? 'تجميع الساقين والحجر: اخِط الدرز الداخلي والجانبي لكل ساق، ثم ادخل إحدى الساقين داخل الأخرى (وجه القماش للوجه) لخياطة منحنى الحجر الأمامي والخلفي المتصل.'
      : 'Leg & Crotch Construction: Stitch inner leg (inseam) and outseam on left and right legs, then turn one leg right-side out inside the other to sew the continuous front-to-back crotch curve.');
  } else {
    steps.push(ar
      ? 'الخياطات الجانبية والخصر: أغلق الخياطات الجانبية بمطابقة الفرزات وتحت الإبط بدقة، واجمع الصدرية مع التنورة إذا كان التصميم مقسوماً عند الخصر.'
      : 'Side Seams & Waist Join: Stitch continuous side seams matching underarm and hip notches; if bodice and skirt are separate, join the waist seam matching center and side seams.');
  }
  if (roles.has('waistband') || roles.has('belt') || roles.has('sash')) {
    steps.push(ar
      ? 'حزام الخصر والإغلاق: ركّب كمر الخصر المبطن بالحشوة مع السحاب أو الأزرار، واختم الحاشية السفلية بثنية نظيفة وكوي نهائي بالبخار.'
      : 'Waistband, Closure & Hem: Apply the interfaced waistband and zipper/button closure, level the hemline, finish the hem cleanly, and give a final atelier steam press.');
  } else {
    steps.push(ar
      ? 'البطانة والحاشية النهائية: ركّب البطانة الداخلية (إن وجدت) مع ترك مسافة راحة للحركة، وأنهِ الحاشية السفلية مع الكي النهائي بالبخار.'
      : 'Lining & Final Hem: Attach interior lining (if included) with a 2 cm ease pleat at center back, finish the hemline cleanly, and complete final steam pressing.');
  }
  return steps;
}

// ---- Markdown Couture Tech Pack (.md) ----
export function buildTechPackMarkdown(pieces, meta = {}) {
  if (!pieces || !pieces.length) return "";
  const lang = meta.lang === 'ar' ? 'ar' : 'en';
  const title = meta.title || (lang === 'ar' ? 'ملف المواصفات الفنية للباترون' : 'BerryStudio Atelier Tech Pack');
  const seamCm = Number(meta.seamAllowanceCm) >= 0 ? Number(meta.seamAllowanceCm) : 1.0;
  const steps = deriveConstructionSteps(pieces, lang);
  let totalAreaCm2 = 0;

  const lines = [
    `# ${title}`,
    ``,
    `- **Generator**: BerryStudio Master Atelier CAD`,
    `- **Category**: ${meta.category || 'women'} | **Size**: ${meta.size || 'Custom'} | **Seam Allowance**: ${seamCm} cm`,
    meta.summary ? `- **Design Summary**: ${meta.summary}` : null,
    meta.validation ? `- **Pattern QA Validation**: ${meta.validation.summary?.fail === 0 ? 'PASS (0 failures)' : `${meta.validation.summary?.fail} issues`}` : null,
    ``,
  ].filter((x) => x !== null);

  if (meta.measurements && typeof meta.measurements === 'object') {
    lines.push(`## 1. Target Body Measurements`, ``, `| Measurement | cm | inches |`, `|---|---:|---:|`);
    for (const [k, v] of Object.entries(meta.measurements)) {
      if (Number.isFinite(v)) lines.push(`| ${k} | ${(+v).toFixed(1)} | ${(v / 2.54).toFixed(2)} |`);
    }
    lines.push(``);
  }

  lines.push(`## 2. Pattern Piece Cut Schedule`, ``, `| # | Piece (EN) | Piece (AR) | Role | Cut Qty | Fold | Size (W × L cm) | Area (cm²) |`, `|---:|---|---|---|---:|---|---|---:|`);
  pieces.forEach((p, i) => {
    const st = pieceStats(p);
    const qty = Number.isInteger(p.quantity) ? p.quantity : (p.cutOnFold ? 1 : (p.bilateral ? 2 : 1));
    totalAreaCm2 += st.area * (p.cutOnFold ? 2 : 1) * qty;
    lines.push(`| ${i + 1} | ${p.name?.en || `Piece ${i + 1}`} | ${p.name?.ar || '—'} | \`${p.role || 'other'}\` | ${qty} | ${p.cutOnFold ? 'Fold' : 'Single'} | ${st.w} × ${st.h} | ${st.area} |`);
  });

  const estMeters150 = Math.max(0.4, (totalAreaCm2 / (145 * 100)) * 1.28);
  lines.push(``, `**Estimated Shell Fabric (150 cm width)**: **${estMeters150.toFixed(2)} m** (${(estMeters150 * 1.09361).toFixed(2)} yd)`, ``);
  lines.push(`## 3. Atelier Sewing & Assembly Sequence`, ``);
  steps.forEach((s, idx) => lines.push(`${idx + 1}. ${s}`));
  lines.push(``);
  return lines.join('\n');
}

// ---- Print-Ready HTML Couture Tech Pack (.html) ----
export function buildTechPackHTML(pieces, meta = {}) {
  if (!pieces || !pieces.length) return "";
  const lang = meta.lang === 'ar' ? 'ar' : 'en';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const title = meta.title || (lang === 'ar' ? 'الملف الفني للخياطة والإنتاج — BerryStudio' : 'BerryStudio Master Atelier Tech Pack');
  const seamCm = Number(meta.seamAllowanceCm) >= 0 ? Number(meta.seamAllowanceCm) : 1.0;
  const svgDiagram = buildSVG(pieces, { seamAllowanceCm: seamCm, lang, includeScaleBar: true })
    .replace(/width="[^"]+" height="[^"]+"/, 'style="width:100%;max-height:420px;height:auto;display:block"');
  const steps = deriveConstructionSteps(pieces, lang);

  let totalAreaCm2 = 0;
  const pieceRows = pieces.map((p, i) => {
    const st = pieceStats(p);
    const qty = Number.isInteger(p.quantity) ? p.quantity : (p.cutOnFold ? 1 : (p.bilateral ? 2 : 1));
    totalAreaCm2 += st.area * (p.cutOnFold ? 2 : 1) * qty;
    return `<tr>
      <td>${i + 1}</td>
      <td><b>${escXML(p.name?.en || `Piece ${i + 1}`)}</b><br><small style="color:#64748b">${escXML(p.name?.ar || '')}</small></td>
      <td><code>${escXML(p.role || 'other')}</code></td>
      <td>${qty}</td>
      <td>${p.cutOnFold ? (lang === 'ar' ? 'على الثنية' : 'Cut on Fold') : '—'}</td>
      <td>${st.w} × ${st.h} cm</td>
      <td>${st.area} cm²</td>
      <td>${(p.notches || []).length}N · ${(p.darts || []).length}D · ${(p.curves || []).length}C</td>
    </tr>`;
  }).join('\n');

  const measRows = meta.measurements && typeof meta.measurements === 'object'
    ? Object.entries(meta.measurements)
      .filter(([, v]) => Number.isFinite(v))
      .map(([k, v]) => `<tr><td>${escXML(k)}</td><td>${(+v).toFixed(1)} cm</td><td>${(v / 2.54).toFixed(2)} in</td></tr>`)
      .join('\n')
    : '';

  const estMeters150 = Math.max(0.4, (totalAreaCm2 / (145 * 100)) * 1.28);
  const qaPass = !meta.validation || meta.validation.summary?.fail === 0;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${escXML(title)}</title>
<style>
  body { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, sans-serif; color: #18181b; margin: 28px auto; max-width: 980px; padding: 0 20px; line-height: 1.5; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #18181b; padding-bottom: 14px; margin-bottom: 22px; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e4e4e7; padding-bottom: 6px; margin-top: 24px; color: #3f3f46; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; background: ${qaPass ? '#dcfce7' : '#fef3c7'}; color: ${qaPass ? '#166534' : '#92400e'}; }
  .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .meta-card { border: 1px solid #e4e4e7; border-radius: 8px; padding: 10px 12px; background: #fafafa; }
  .meta-card small { color: #71717a; display: block; font-size: 11px; }
  .diagram-box { border: 1px solid #d4d4d8; border-radius: 10px; padding: 14px; background: #ffffff; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0; }
  th, td { border: 1px solid #e4e4e7; padding: 7px 9px; text-align: start; }
  th { background: #f4f4f5; font-weight: 600; }
  ol li { margin-bottom: 8px; }
  @media print { body { margin: 0; max-width: none; } .no-print { display: none; } }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${escXML(title)}</h1>
      <div style="color:#52525b;font-size:13px">${escXML(meta.summary || '1:1 Parametric Couture Pattern Specification')}</div>
    </div>
    <div>
      <span class="badge">${qaPass ? '✓ Atelier QA Validated (0 Errors)' : 'QA Review Recommended'}</span>
    </div>
  </header>
  <div class="meta-grid">
    <div class="meta-card"><small>Category &amp; Size</small><b>${escXML((meta.category || 'women').toUpperCase())} · ${escXML(meta.size || 'Custom')}</b></div>
    <div class="meta-card"><small>Pattern Pieces</small><b>${pieces.length} Pieces</b></div>
    <div class="meta-card"><small>Seam Allowance</small><b>${seamCm.toFixed(1)} cm</b></div>
    <div class="meta-card"><small>Est. Fabric (150 cm wide)</small><b>${estMeters150.toFixed(2)} m (${(estMeters150 * 1.09361).toFixed(2)} yd)</b></div>
  </div>
  <h2>1. Technical Pattern Layout (1:1 Proportions)</h2>
  <div class="diagram-box">${svgDiagram}</div>
  <h2>2. Pattern Cut List &amp; Geometry Schedule</h2>
  <table>
    <thead><tr><th>#</th><th>Piece Name</th><th>Role</th><th>Cut Qty</th><th>Fold</th><th>Dimensions</th><th>Net Area</th><th>Details</th></tr></thead>
    <tbody>${pieceRows}</tbody>
  </table>
  ${measRows ? `<h2>3. Target Body Measurements</h2><table><thead><tr><th>Measurement</th><th>Metric (cm)</th><th>Imperial (in)</th></tr></thead><tbody>${measRows}</tbody></table>` : ''}
  <h2>${measRows ? '4' : '3'}. Atelier Construction &amp; Sewing Sequence</h2>
  <ol>${steps.map((s) => `<li>${escXML(s)}</li>`).join('')}</ol>
</body>
</html>`;
}

// ---- Portable Editable Pattern JSON (.json) ----
export function buildPatternJSON(pieces, meta = {}) {
  return JSON.stringify({
    app: 'BerryStudio',
    version: 2,
    exportedAt: meta.exportedAt || '2026-01-01T00:00:00.000Z',
    category: meta.category || 'women',
    size: meta.size || 'M',
    seamAllowanceCm: Number(meta.seamAllowanceCm) >= 0 ? Number(meta.seamAllowanceCm) : 1.0,
    summary: meta.summary || '',
    measurements: meta.measurements || null,
    pieces: (pieces || []).map((p, i) => ({
      id: p.id || `piece-${i + 1}`,
      key: p.key || `piece_${i + 1}`,
      name: p.name || { en: `Piece ${i + 1}`, ar: `قطعة ${i + 1}` },
      desc: p.desc || { en: '', ar: '' },
      role: p.role || 'other',
      cutOnFold: !!p.cutOnFold,
      bilateral: !!p.bilateral,
      quantity: p.quantity || (p.cutOnFold ? 1 : (p.bilateral ? 2 : 1)),
      outline: p.outline,
      curves: p.curves || [],
      darts: p.darts || [],
      notches: p.notches || [],
      grain: p.grain || [],
      edges: p.edges || [],
      pleats: p.pleats || undefined,
      color: p.color || undefined,
    })),
  }, null, 2);
}

