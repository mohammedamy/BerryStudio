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
    } else {
      i++;
      cs += `${X(o[i][0]).toFixed(2)} ${Y(o[i][1]).toFixed(2)} l\n`;
    }
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
