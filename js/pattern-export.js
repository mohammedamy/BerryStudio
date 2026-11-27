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

import {
  offsetPoly,
  detectFoldEdgeIndex,
  resolvePieceSeamAllowances,
  offsetPieceOutline,
  edgeNormalAtPoint,
  findVisualLabelAnchor,
  inferPieceCutInstruction,
  analyzeSeamBalance,
} from './geometry.js';
import { gradePieceAnatomically, stepForSize } from './grading.js';

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

const PAGE_SIZES_MM = {
  a0: [841, 1189],
  a1: [594, 841],
  a2: [420, 594],
  a3: [297, 420],
  a4: [210, 297],
  letter: [215.9, 279.4],
};
const TILE_MARGIN_MM = 10; // printer-safe margin within each tile's own page

function pdfSafeText(s) {
  return String(s ?? '').replace(/[()\\]/g, '').replace(/[^\x20-\x7E]/g, '').trim();
}

function polygonPathOps(poly, X, Y) {
  if (!Array.isArray(poly) || poly.length < 3) return '';
  let cs = `${X(poly[0][0]).toFixed(2)} ${Y(poly[0][1]).toFixed(2)} m\n`;
  for (let i = 1; i < poly.length; i++) {
    cs += `${X(poly[i][0]).toFixed(2)} ${Y(poly[i][1]).toFixed(2)} l\n`;
  }
  return cs;
}

function pdfArrowHeadOps(fromCm, toCm, X, Y, lenPt = 6) {
  const fx = X(fromCm[0]), fy = Y(fromCm[1]);
  const tx = X(toCm[0]), ty = Y(toCm[1]);
  const a = Math.atan2(ty - fy, tx - fx);
  const lx1 = tx - lenPt * Math.cos(a - 0.42), ly1 = ty - lenPt * Math.sin(a - 0.42);
  const lx2 = tx - lenPt * Math.cos(a + 0.42), ly2 = ty - lenPt * Math.sin(a + 0.42);
  return `${lx1.toFixed(2)} ${ly1.toFixed(2)} m ${tx.toFixed(2)} ${ty.toFixed(2)} l ${lx2.toFixed(2)} ${ly2.toFixed(2)} l S\n`;
}

// Emits full atelier piece markings (outer cut line w/ variable SA + 0 cm fold,
// inner dashed stitch line with cubic beziers, grainline arrows, darts w/ center fold &
// diamond apex punch, perpendicular V-notches, Cut-on-Fold bracket, and spec stamp).
// Never emits 'c' operators on straight-edged pieces (keeps test/pattern-export.test.js green).
function pieceVectorPdfOps(p, X, Y, opts = {}) {
  if (!p?.outline?.length) return '';
  const seamCm = Number(opts.seamAllowanceCm) > 0 ? Number(opts.seamAllowanceCm) : 0;
  const variableSeam = opts.variableSeam !== false;
  const drawMarkings = opts.drawMarkings !== false;
  let cs = '';

  if (seamCm > 0 && p.outline.length >= 3) {
    const saPoly = offsetPieceOutline(p, seamCm, { variable: variableSeam });
    if (saPoly.length >= 3) {
      cs += '0.85 w [] 0 d 0.08 0.08 0.10 RG\n';
      cs += polygonPathOps(saPoly, X, Y) + 'h S\n';
    }
    cs += '0.55 w [4 3] 0 d 0.35 0.35 0.42 RG\n';
    cs += outlinePathOps(p, X, Y) + 'h S\n[] 0 d\n';
  } else {
    cs += '0.80 w [] 0 d 0 0 0 RG\n';
    cs += outlinePathOps(p, X, Y) + 'h S\n';
  }

  if (!drawMarkings) return cs;

  // Grainline + arrowheads + GRAIN tag
  if (Array.isArray(p.grain) && p.grain.length === 2) {
    const [g0, g1] = p.grain;
    cs += '0.55 w [] 0 d 0.28 0.25 0.72 RG 0.28 0.25 0.72 rg\n';
    cs += `${X(g0[0]).toFixed(2)} ${Y(g0[1]).toFixed(2)} m ${X(g1[0]).toFixed(2)} ${Y(g1[1]).toFixed(2)} l S\n`;
    cs += pdfArrowHeadOps(g0, g1, X, Y, 5.5);
    cs += pdfArrowHeadOps(g1, g0, X, Y, 5.5);
    const gx = (X(g0[0]) + X(g1[0])) * 0.5, gy = (Y(g0[1]) + Y(g1[1])) * 0.5;
    cs += `BT /F1 6.5 Tf ${(gx + 3).toFixed(2)} ${gy.toFixed(2)} Td (GRAIN) Tj ET\n`;
  }

  // Cut-on-Fold bracket symbol along detected fold edge
  const foldIdx = p.cutOnFold ? detectFoldEdgeIndex(p) : -1;
  if (foldIdx >= 0 && p.outline.length >= 3) {
    const a = p.outline[foldIdx], b = p.outline[(foldIdx + 1) % p.outline.length];
    const fLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (fLen >= 3) {
      const mid = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
      const nInfo = edgeNormalAtPoint(p.outline, mid);
      const tx = (b[0] - a[0]) / fLen, ty = (b[1] - a[1]) / fLen;
      const [ix, iy] = nInfo.inward;
      const halfSpan = Math.min(Math.max(fLen * 0.28, 2.5), 10);
      const inset = Math.min(1.5, Math.max(0.8, fLen * 0.08));
      const p1 = [mid[0] - tx * halfSpan, mid[1] - ty * halfSpan];
      const p2 = [mid[0] + tx * halfSpan, mid[1] + ty * halfSpan];
      const s1 = [p1[0] + ix * inset, p1[1] + iy * inset];
      const s2 = [p2[0] + ix * inset, p2[1] + iy * inset];
      cs += '0.6 w [] 0 d 0.02 0.42 0.64 RG 0.02 0.42 0.64 rg\n';
      cs += `${X(p1[0]).toFixed(2)} ${Y(p1[1]).toFixed(2)} m ${X(s1[0]).toFixed(2)} ${Y(s1[1]).toFixed(2)} l ${X(s2[0]).toFixed(2)} ${Y(s2[1]).toFixed(2)} l ${X(p2[0]).toFixed(2)} ${Y(p2[1]).toFixed(2)} l S\n`;
      cs += pdfArrowHeadOps(s1, p1, X, Y, 4.5);
      cs += pdfArrowHeadOps(s2, p2, X, Y, 4.5);
      const mx = (X(s1[0]) + X(s2[0])) * 0.5 + ix * 4;
      const my = (Y(s1[1]) + Y(s2[1])) * 0.5 - iy * 4;
      cs += `BT /F1 6.5 Tf ${mx.toFixed(2)} ${my.toFixed(2)} Td (FOLD / 0cm SA) Tj ET\n`;
    }
  }

  // Darts: solid legs + dashed center fold + diamond apex drill punch (zero 'c' ops!)
  (p.darts || []).forEach((d) => {
    if (!Array.isArray(d) || d.length < 3) return;
    const [apex, legA, legC] = d;
    cs += '0.55 w [] 0 d 0.72 0.14 0.14 RG\n';
    cs += `${X(legA[0]).toFixed(2)} ${Y(legA[1]).toFixed(2)} m ${X(apex[0]).toFixed(2)} ${Y(apex[1]).toFixed(2)} l ${X(legC[0]).toFixed(2)} ${Y(legC[1]).toFixed(2)} l S\n`;
    const mid = [(legA[0] + legC[0]) * 0.5, (legA[1] + legC[1]) * 0.5];
    cs += '0.45 w [2 2] 0 d\n';
    cs += `${X(apex[0]).toFixed(2)} ${Y(apex[1]).toFixed(2)} m ${X(mid[0]).toFixed(2)} ${Y(mid[1]).toFixed(2)} l S [] 0 d\n`;
    const dx = mid[0] - apex[0], dy = mid[1] - apex[1], dl = Math.hypot(dx, dy) || 1;
    const drill = dl > 1.2 ? [apex[0] + (dx / dl) * 0.5, apex[1] + (dy / dl) * 0.5] : apex;
    const dX = X(drill[0]), dY = Y(drill[1]), r = 2.4;
    cs += `${dX.toFixed(2)} ${(dY + r).toFixed(2)} m ${(dX + r).toFixed(2)} ${dY.toFixed(2)} l ${dX.toFixed(2)} ${(dY - r).toFixed(2)} l ${(dX - r).toFixed(2)} ${dY.toFixed(2)} l h S\n`;
  });

  // Perpendicular inward V-notches
  (p.notches || []).forEach((nt) => {
    const rawPt = Array.isArray(nt) ? nt : [nt?.x ?? 0, nt?.y ?? 0];
    const nInfo = edgeNormalAtPoint(p.outline, rawPt);
    const bp = nInfo.proj || rawPt;
    const [tx, ty] = nInfo.tangent;
    const [inx, iny] = nInfo.inward;
    const depth = 0.5, halfB = 0.25;
    const l = [bp[0] - tx * halfB, bp[1] - ty * halfB];
    const r = [bp[0] + tx * halfB, bp[1] + ty * halfB];
    const tip = [bp[0] + inx * depth, bp[1] + iny * depth];
    cs += '0.6 w [] 0 d 0.1 0.1 0.12 RG\n';
    cs += `${X(l[0]).toFixed(2)} ${Y(l[1]).toFixed(2)} m ${X(tip[0]).toFixed(2)} ${Y(tip[1]).toFixed(2)} l ${X(r[0]).toFixed(2)} ${Y(r[1]).toFixed(2)} l S\n`;
  });

  // Interior Piece Spec Stamp (ASCII Helvetica-safe)
  const anchor = findVisualLabelAnchor(p.outline);
  const lx = X(anchor.x), ly = Y(anchor.y);
  const pieceLabel = pdfSafeText((p.name && p.name.en) || p.key || 'Piece');
  const cutInfo = inferPieceCutInstruction(p);
  const sizeTxt = pdfSafeText(opts.size ? `Size: ${opts.size}` : '');
  const specLine = pdfSafeText([sizeTxt, cutInfo.en].filter(Boolean).join(' | '));
  let saLine = '';
  if (seamCm > 0) {
    const perEdge = resolvePieceSeamAllowances(p, seamCm, { variable: variableSeam });
    const maxSA = Math.max(...perEdge);
    saLine = `SA: ${seamCm}cm` + (maxSA > seamCm + 0.5 ? ` / Hem: ${maxSA.toFixed(0)}cm` : '') + (foldIdx >= 0 ? ' / Fold: 0cm' : '');
  }
  cs += '0 0 0 rg\n';
  if (pieceLabel) {
    cs += `BT /F1 9 Tf ${(lx - pieceLabel.length * 2.3).toFixed(2)} ${(ly + 8).toFixed(2)} Td (${pieceLabel}) Tj ET\n`;
  }
  if (specLine) {
    cs += `0.28 0.28 0.32 rg\nBT /F1 7.2 Tf ${(lx - specLine.length * 1.8).toFixed(2)} ${(ly - 2).toFixed(2)} Td (${specLine}) Tj ET\n`;
  }
  if (saLine) {
    cs += `0.42 0.42 0.48 rg\nBT /F1 6.8 Tf ${(lx - saLine.length * 1.65).toFixed(2)} ${(ly - 11).toFixed(2)} Td (${pdfSafeText(saLine)}) Tj ET\n`;
  }
  cs += '0 0 0 RG 0 0 0 rg\n';
  return cs;
}

function drawNestedPdfLayersOps(nestedLayers, X, Y) {
  if (!Array.isArray(nestedLayers) || !nestedLayers.length) return '';
  let cs = '';
  nestedLayers.forEach((layer) => {
    const rgb = layer?.style?.rgb || [0.43, 0.37, 0.99];
    const dash = layer?.style?.pdfDash || '[5 3] 0 d';
    cs += `0.65 w ${dash} ${rgb[0].toFixed(2)} ${rgb[1].toFixed(2)} ${rgb[2].toFixed(2)} RG\n`;
    (layer.pieces || []).forEach((np) => {
      if (!np?.outline?.length) return;
      cs += outlinePathOps(np, X, Y) + 'h S\n';
    });
  });
  cs += '[] 0 d 0 0 0 RG\n';
  return cs;
}

function drawCalibrationBoxesPdf(xPt, yPt, titleText = null) {
  const PT_CM = 28.3465;
  const sq10 = 10 * PT_CM;
  const sq2in = 2 * 2.54 * PT_CM;
  let cs = '0.6 w [] 0 d 0 0 0 RG 0 0 0 rg\n';
  cs += `${xPt.toFixed(2)} ${yPt.toFixed(2)} ${sq10.toFixed(2)} ${sq10.toFixed(2)} re S\n`;
  cs += `BT /F1 7.5 Tf ${(xPt + 4).toFixed(2)} ${(yPt + sq10 * 0.5).toFixed(2)} Td (10cm x 10cm calibration - print at 100%/actual size) Tj ET\n`;
  const x2 = xPt + sq10 + 18;
  cs += `${x2.toFixed(2)} ${yPt.toFixed(2)} ${sq2in.toFixed(2)} ${sq2in.toFixed(2)} re S\n`;
  cs += `BT /F1 7.5 Tf ${(x2 + 4).toFixed(2)} ${(yPt + sq2in * 0.5).toFixed(2)} Td (2in x 2in imperial check) Tj ET\n`;
  if (titleText) {
    cs += `BT /F1 8 Tf ${x2.toFixed(2)} ${(yPt + sq10 - 10).toFixed(2)} Td (${pdfSafeText(titleText)}) Tj ET\n`;
  }
  return cs;
}

function drawNestedLegendPdf(nestedLayers, xPt, yPt) {
  if (!Array.isArray(nestedLayers) || !nestedLayers.length) return '';
  let cs = '0 0 0 rg\n';
  cs += `BT /F1 8 Tf ${xPt.toFixed(2)} ${(yPt + nestedLayers.length * 13 + 4).toFixed(2)} Td (Multi-Size Nest Key:) Tj ET\n`;
  nestedLayers.forEach((layer, idx) => {
    const ry = yPt + (nestedLayers.length - 1 - idx) * 13;
    const rgb = layer?.style?.rgb || [0.1, 0.1, 0.1];
    const dash = layer?.style?.pdfDash || '[] 0 d';
    cs += `1.1 w ${dash} ${rgb[0].toFixed(2)} ${rgb[1].toFixed(2)} ${rgb[2].toFixed(2)} RG\n`;
    cs += `${xPt.toFixed(2)} ${(ry + 3).toFixed(2)} m ${(xPt + 26).toFixed(2)} ${(ry + 3).toFixed(2)} l S\n`;
    cs += `0 0 0 rg [] 0 d BT /F1 8 Tf ${(xPt + 32).toFixed(2)} ${ry.toFixed(2)} Td (${pdfSafeText(layer.size)}) Tj ET\n`;
  });
  return cs;
}

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
function tileContentStream(pieces, originXcm, originYcm, pageWpt, pageHpt, marginPt, tile, grid, includeGuides, opts = {}) {
  const PT_CM = 28.3465;
  const X = (xCm) => (xCm - originXcm) * PT_CM + marginPt;
  const Y = (yCm) => pageHpt - ((yCm - originYcm) * PT_CM + marginPt);
  const contentW = pageWpt - 2 * marginPt, contentH = pageHpt - 2 * marginPt;
  let cs = "0.75 w 0 0 0 RG 0 0 0 rg\n";
  // Clip to this tile's own content window (q/Q bracketed) so a piece
  // extending past this tile's edge doesn't draw over the registration marks/labels.
  cs += `q\n${marginPt.toFixed(2)} ${marginPt.toFixed(2)} ${contentW.toFixed(2)} ${contentH.toFixed(2)} re W n\n`;
  if (Array.isArray(opts.nestedLayers) && opts.nestedLayers.length) {
    cs += drawNestedPdfLayersOps(opts.nestedLayers, X, Y);
  }
  pieces.forEach((p) => {
    cs += pieceVectorPdfOps(p, X, Y, opts);
  });
  cs += "Q\n";
  if (!includeGuides) return cs;
  // Subtle dashed trim frame along printable boundary
  cs += `0.35 w [3 3] 0 d 0.55 0.55 0.60 RG ${marginPt.toFixed(2)} ${marginPt.toFixed(2)} ${contentW.toFixed(2)} ${contentH.toFixed(2)} re S [] 0 d 0 0 0 RG\n`;
  // Registration crosshairs + center diamond target at all 4 corners
  const armPt = 4 * (72 / 25.4);
  const dPt = 2.8;
  const corners = [[marginPt, marginPt], [pageWpt - marginPt, marginPt], [marginPt, pageHpt - marginPt], [pageWpt - marginPt, pageHpt - marginPt]];
  corners.forEach(([cx, cy]) => {
    cs += `0.45 w ${(cx - armPt).toFixed(2)} ${cy.toFixed(2)} m ${(cx + armPt).toFixed(2)} ${cy.toFixed(2)} l S\n`;
    cs += `${cx.toFixed(2)} ${(cy - armPt).toFixed(2)} m ${cx.toFixed(2)} ${(cy + armPt).toFixed(2)} l S\n`;
    cs += `${cx.toFixed(2)} ${(cy + dPt).toFixed(2)} m ${(cx + dPt).toFixed(2)} ${cy.toFixed(2)} l ${cx.toFixed(2)} ${(cy - dPt).toFixed(2)} l ${(cx - dPt).toFixed(2)} ${cy.toFixed(2)} l h S\n`;
  });
  const tileMeta = pdfSafeText([opts.title, opts.size ? `Size ${opts.size}` : ''].filter(Boolean).join(' | '));
  cs += `BT /F1 8 Tf ${marginPt.toFixed(2)} ${(marginPt / 2).toFixed(2)} Td (R${tile.row + 1}C${tile.col + 1} of ${grid.rows}x${grid.cols}${tileMeta ? ' - ' + tileMeta : ''}) Tj ET\n`;
  if (tile.col + 1 < grid.cols) {
    cs += `0.35 0.35 0.42 rg BT /F1 7 Tf ${(pageWpt - marginPt - 46).toFixed(2)} ${(pageHpt * 0.5).toFixed(2)} Td (Join R${tile.row + 1}C${tile.col + 2} >) Tj ET\n`;
  }
  if (tile.row + 1 < grid.rows) {
    cs += `0.35 0.35 0.42 rg BT /F1 7 Tf ${(pageWpt * 0.5 - 24).toFixed(2)} ${(marginPt / 2).toFixed(2)} Td (v Join R${tile.row + 2}C${tile.col + 1}) Tj ET\n`;
  }
  cs += '0 0 0 RG 0 0 0 rg\n';
  return cs;
}

function assemblyMapStream(pieces, box, grid, pageWpt, pageHpt, marginPt, opts = {}) {
  let cs = "0.5 w 0 0 0 RG 0 0 0 rg\n";
  const head = pdfSafeText(`Assembly map - ${grid.rows}x${grid.cols} pages` + (opts.title ? ` (${opts.title}${opts.size ? ' | ' + opts.size : ''})` : ''));
  cs += `BT /F1 13 Tf ${marginPt.toFixed(2)} ${(pageHpt - marginPt - 14).toFixed(2)} Td (${head}) Tj ET\n`;
  // Thumbnail tile grid positioned in upper area, reserving bottom strip for calibration squares & legend
  const calReservePt = 315;
  const availW = pageWpt - 2 * marginPt, availH = Math.max(120, pageHpt - 2 * marginPt - calReservePt - 30);
  const fullGridWmm = grid.cols * grid.stepWmm + (grid.contentWmm - grid.stepWmm);
  const fullGridHmm = grid.rows * grid.stepHmm + (grid.contentHmm - grid.stepHmm);
  const scaleMm = Math.min(availW / Math.max(fullGridWmm, 1), availH / Math.max(fullGridHmm, 1));
  const mapTopY = pageHpt - marginPt - 28;
  const mapLeftX = marginPt + (availW - fullGridWmm * scaleMm) * 0.5;
  const mapBottomY = mapTopY - fullGridHmm * scaleMm;

  // Draw mini silhouettes of every pattern piece across the map
  const mapX = (xCm) => mapLeftX + (xCm - box.minX) * 10 * scaleMm;
  const mapY = (yCm) => mapTopY - (yCm - box.minY) * 10 * scaleMm;
  cs += '0.7 w 0.32 0.28 0.85 RG\n';
  pieces.forEach((p) => {
    if (!p?.outline?.length) return;
    cs += polygonPathOps(p.outline, mapX, mapY) + 'h S\n';
  });

  // Draw tile boxes on top of silhouettes
  cs += '0.45 w 0.35 0.35 0.40 RG 0.25 0.25 0.30 rg\n';
  grid.tiles.forEach((t) => {
    const tx = mapLeftX + t.originMm[0] * scaleMm;
    const tw = grid.contentWmm * scaleMm, th = grid.contentHmm * scaleMm;
    const ty = mapTopY - t.originMm[1] * scaleMm - th;
    cs += `${tx.toFixed(2)} ${ty.toFixed(2)} ${tw.toFixed(2)} ${th.toFixed(2)} re S\n`;
    cs += `BT /F1 8 Tf ${(tx + 3).toFixed(2)} ${(ty + th - 11).toFixed(2)} Td (R${t.row + 1}C${t.col + 1}) Tj ET\n`;
  });

  const infoY = Math.max(marginPt + 295, mapBottomY - 16);
  const cutNote = pdfSafeText(`${pieces.length} pieces | SA: ${opts.seamAllowanceCm > 0 ? opts.seamAllowanceCm + 'cm' : 'Net'} (0cm fold)`);
  cs += `0 0 0 rg BT /F1 8.5 Tf ${marginPt.toFixed(2)} ${infoY.toFixed(2)} Td (${cutNote}) Tj ET\n`;
  if (Array.isArray(opts.nestedLayers) && opts.nestedLayers.length) {
    cs += drawNestedLegendPdf(opts.nestedLayers, marginPt, marginPt + 295);
  }
  cs += drawCalibrationBoxesPdf(marginPt, marginPt, opts.title ? `${opts.title} | 1:1 Check` : null);
  return cs;
}

function copyshopContentStream(pieces, box, originXcm, originYcm, pageWpt, pageHpt, marginPt, opts = {}) {
  const PT_CM = 28.3465;
  const X = (xCm) => (xCm - originXcm) * PT_CM + marginPt;
  const Y = (yCm) => pageHpt - ((yCm - originYcm) * PT_CM + marginPt + 38);
  const contentW = pageWpt - 2 * marginPt, contentH = pageHpt - 2 * marginPt;
  let cs = `0.5 w [] 0 d 0.5 0.5 0.55 RG ${marginPt.toFixed(2)} ${marginPt.toFixed(2)} ${contentW.toFixed(2)} ${contentH.toFixed(2)} re S\n`;
  const titleStr = pdfSafeText(`BerryStudio 1:1 Atelier Sheet - ${opts.title || 'Sewing Pattern'}${opts.size ? ' (' + opts.size + ')' : ''}`);
  cs += `0 0 0 rg BT /F1 12 Tf ${(marginPt + 8).toFixed(2)} ${(pageHpt - marginPt - 20).toFixed(2)} Td (${titleStr}) Tj ET\n`;
  cs += `q\n${marginPt.toFixed(2)} ${marginPt.toFixed(2)} ${contentW.toFixed(2)} ${contentH.toFixed(2)} re W n\n`;
  if (Array.isArray(opts.nestedLayers) && opts.nestedLayers.length) {
    cs += drawNestedPdfLayersOps(opts.nestedLayers, X, Y);
  }
  pieces.forEach((p) => { cs += pieceVectorPdfOps(p, X, Y, opts); });
  cs += 'Q\n';
  if (opts.includeGuides !== false) {
    cs += drawCalibrationBoxesPdf(marginPt + 8, marginPt + 8);
    if (Array.isArray(opts.nestedLayers) && opts.nestedLayers.length) {
      cs += drawNestedLegendPdf(opts.nestedLayers, pageWpt - marginPt - 130, marginPt + 12);
    }
  }
  return cs;
}

// `opts.tiled` (default false) reproduces original buildSinglePagePDF() unless
// rich atelier flags (`copyshop`, `seamAllowanceCm > 0`, `nestedLayers`, `richMarkings`) are passed.
export function buildPDF(pieces, opts = {}) {
  const {
    tiled = false,
    copyshop = false,
    pageSize = 'a4',
    overlapMm = 10,
    includeGuides = true,
  } = opts;
  if (!pieces || !pieces.length) return null;

  const hasRichOpts = copyshop || (Number(opts.seamAllowanceCm) > 0) || (Array.isArray(opts.nestedLayers) && opts.nestedLayers.length > 0) || opts.richMarkings === true;
  if (!tiled && !hasRichOpts) return buildSinglePagePDF(pieces);

  const PT_MM = 2.83465;
  const PT_CM = 28.3465;
  const saPad = Number(opts.seamAllowanceCm) > 0 ? Math.max(3.5, Number(opts.seamAllowanceCm) + 1) : 1;
  const allPts = [
    ...pieces.flatMap((p) => p.outline || []),
    ...(Array.isArray(opts.nestedLayers) ? opts.nestedLayers.flatMap((l) => (l.pieces || []).flatMap((np) => np.outline || [])) : []),
  ];
  const xs = allPts.map((p) => p[0]), ys = allPts.map((p) => p[1]);
  const minX = Math.min(...xs) - (hasRichOpts ? saPad : 0);
  const minY = Math.min(...ys) - (hasRichOpts ? saPad : 0);
  const maxX = Math.max(...xs) + (hasRichOpts ? saPad : 0);
  const maxY = Math.max(...ys) + (hasRichOpts ? saPad : 0);
  const bboxCm = { minX, minY, w: maxX - minX, h: maxY - minY };

  if (!tiled && copyshop) {
    let sheetMm = PAGE_SIZES_MM[pageSize] || PAGE_SIZES_MM.a0;
    // Pick portrait or landscape to minimize sheet overflow on large-format plotters/copyshop sheets
    if (bboxCm.w * 10 > sheetMm[0] - 2 * TILE_MARGIN_MM && bboxCm.w * 10 <= sheetMm[1] - 2 * TILE_MARGIN_MM && bboxCm.h * 10 <= sheetMm[0] - 2 * TILE_MARGIN_MM) {
      sheetMm = [sheetMm[1], sheetMm[0]];
    }
    const usableWcm = (sheetMm[0] - 2 * TILE_MARGIN_MM) / 10;
    const usableHcm = (sheetMm[1] - 2 * TILE_MARGIN_MM) / 10;
    if (bboxCm.w <= usableWcm && bboxCm.h + 2 <= usableHcm) {
      const pageWpt = sheetMm[0] * PT_MM, pageHpt = sheetMm[1] * PT_MM, marginPt = TILE_MARGIN_MM * PT_MM;
      return assemblePDFObjects([{
        mediaBox: [pageWpt, pageHpt],
        contentStream: copyshopContentStream(pieces, bboxCm, bboxCm.minX, bboxCm.minY, pageWpt, pageHpt, marginPt, opts),
      }]);
    }
    // Larger than one sheet: cleanly tile across multiple copyshop sheets
    const grid = computeTileGrid(bboxCm, sheetMm, overlapMm);
    const pageWpt = sheetMm[0] * PT_MM, pageHpt = sheetMm[1] * PT_MM, marginPt = TILE_MARGIN_MM * PT_MM;
    const pages = grid.tiles.map((tile) => ({
      mediaBox: [pageWpt, pageHpt],
      contentStream: tileContentStream(pieces, bboxCm.minX + tile.originMm[0] / 10, bboxCm.minY + tile.originMm[1] / 10, pageWpt, pageHpt, marginPt, tile, grid, includeGuides, opts),
    }));
    return assemblePDFObjects(pages);
  }

  if (!tiled) {
    // Rich single-page vector pattern PDF (with SA, notches, fold symbols, spec stamps & optional nested sizes)
    const margin = 28;
    const W = bboxCm.w * PT_CM + margin * 2, H = bboxCm.h * PT_CM + margin * 2;
    const X = (x) => (x - bboxCm.minX) * PT_CM + margin;
    const Y = (y) => H - ((y - bboxCm.minY) * PT_CM + margin);
    let cs = '';
    if (Array.isArray(opts.nestedLayers) && opts.nestedLayers.length) cs += drawNestedPdfLayersOps(opts.nestedLayers, X, Y);
    pieces.forEach((p) => { cs += pieceVectorPdfOps(p, X, Y, opts); });
    return assemblePDFObjects([{ mediaBox: [W, H], contentStream: cs }]);
  }

  const pageSizeMm = PAGE_SIZES_MM[pageSize] || PAGE_SIZES_MM.a4;
  const rawBboxCm = { minX: Math.min(...pieces.flatMap((p) => p.outline.map((q) => q[0]))), minY: Math.min(...pieces.flatMap((p) => p.outline.map((q) => q[1]))), w: 0, h: 0 };
  const rawMaxX = Math.max(...pieces.flatMap((p) => p.outline.map((q) => q[0])));
  const rawMaxY = Math.max(...pieces.flatMap((p) => p.outline.map((q) => q[1])));
  rawBboxCm.w = rawMaxX - rawBboxCm.minX;
  rawBboxCm.h = rawMaxY - rawBboxCm.minY;
  const tileBox = (Number(opts.seamAllowanceCm) > 0 || (Array.isArray(opts.nestedLayers) && opts.nestedLayers.length > 0)) ? bboxCm : rawBboxCm;

  const grid = computeTileGrid(tileBox, pageSizeMm, overlapMm);
  const pageWpt = pageSizeMm[0] * PT_MM, pageHpt = pageSizeMm[1] * PT_MM, marginPt = TILE_MARGIN_MM * PT_MM;

  const pages = includeGuides ? [{ mediaBox: [pageWpt, pageHpt], contentStream: assemblyMapStream(pieces, tileBox, grid, pageWpt, pageHpt, marginPt, opts) }] : [];
  grid.tiles.forEach((tile) => {
    const originXcm = tileBox.minX + tile.originMm[0] / 10;
    const originYcm = tileBox.minY + tile.originMm[1] / 10;
    pages.push({ mediaBox: [pageWpt, pageHpt], contentStream: tileContentStream(pieces, originXcm, originYcm, pageWpt, pageHpt, marginPt, tile, grid, includeGuides, opts) });
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
  const variableSeam = opts.variableSeam !== false;
  const includeScaleBar = opts.includeScaleBar !== false;
  const lang = opts.lang === 'ar' ? 'ar' : 'en';
  const nestedLayers = Array.isArray(opts.nestedLayers) ? opts.nestedLayers : [];
  const all = [
    ...laid.flatMap((p) => p.outline || []),
    ...nestedLayers.flatMap((l) => (l.pieces || []).flatMap((np) => np.outline || [])),
  ];
  if (!all.length) return "";
  const pad = Math.max(4, seamCm + 3.5);
  const xs = all.map((pt) => pt[0]), ys = all.map((pt) => pt[1]);
  const minX = +(Math.min(...xs) - pad).toFixed(2);
  const minY = +(Math.min(...ys) - pad).toFixed(2);
  const w = +(Math.max(...xs) - minX + pad).toFixed(2);
  const h = +(Math.max(...ys) - minY + pad + (includeScaleBar ? 7 : 0)).toFixed(2);

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}cm" height="${h}cm" data-generator="BerryStudio" data-units="cm">\n`;
  if (nestedLayers.length) {
    s += `  <g id="nested-size-grades" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
    nestedLayers.forEach((layer) => {
      const st = layer?.style || { color: '#6d5efc', dash: [5, 3] };
      const dashAttr = st.dash && st.dash.length ? ` stroke-dasharray="${st.dash.map((v) => +(v * 0.12).toFixed(2)).join(',')}"` : '';
      (layer.pieces || []).forEach((np) => {
        if (!np?.outline?.length) return;
        s += `    <path class="grade-line" data-size="${escXML(layer.size)}" d="${svgOutlinePathD(np)}" stroke="${escXML(st.color)}" stroke-width="0.14"${dashAttr}/>\n`;
      });
    });
    s += `  </g>\n`;
  }
  s += `  <g id="pattern-pieces" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
  laid.forEach((p, idx) => {
    if (!p?.outline?.length) return;
    const label = (p.name && (p.name[lang] || p.name.en)) || p.key || `Piece ${idx + 1}`;
    const altLabel = (p.name && (p.name[lang === 'ar' ? 'en' : 'ar'])) || '';
    const role = p.role || 'other';
    s += `    <g id="piece-${idx + 1}" data-role="${escXML(role)}" data-name="${escXML(label)}">\n`;
    if (seamCm > 0 && p.outline.length >= 3) {
      try {
        const sa = offsetPieceOutline(p, seamCm, { variable: variableSeam });
        if (Array.isArray(sa) && sa.length >= 3) {
          const saD = sa.map((pt, j) => `${j === 0 ? 'M' : 'L'} ${pt[0].toFixed(3)} ${pt[1].toFixed(3)}`).join(' ') + ' Z';
          s += `      <path class="seam-allowance" d="${saD}" stroke="#18181b" stroke-width="0.16"/>\n`;
        }
      } catch { /* skip SA if degenerate */ }
    }
    s += `      <path class="cut-line" d="${svgOutlinePathD(p)}" stroke="${seamCm > 0 ? '#52525b' : '#18181b'}" stroke-width="0.16"${seamCm > 0 ? ' stroke-dasharray="0.5,0.35"' : ''}/>\n`;
    if (Array.isArray(p.grain) && p.grain.length === 2) {
      const [[gx1, gy1], [gx2, gy2]] = p.grain;
      const gAng = Math.atan2(gy2 - gy1, gx2 - gx1);
      const ah = 0.7;
      const arr = (fx, fy, tx, ty) => {
        const a = Math.atan2(ty - fy, tx - fx);
        return `M ${(tx - ah * Math.cos(a - 0.42)).toFixed(3)} ${(ty - ah * Math.sin(a - 0.42)).toFixed(3)} L ${tx.toFixed(3)} ${ty.toFixed(3)} L ${(tx - ah * Math.cos(a + 0.42)).toFixed(3)} ${(ty - ah * Math.sin(a + 0.42)).toFixed(3)}`;
      };
      s += `      <path class="grainline" d="M ${gx1.toFixed(3)} ${gy1.toFixed(3)} L ${gx2.toFixed(3)} ${gy2.toFixed(3)} ${arr(gx1, gy1, gx2, gy2)} ${arr(gx2, gy2, gx1, gy1)}" stroke="#4f46e5" stroke-width="0.12"/>\n`;
      if (Math.hypot(gx2 - gx1, gy2 - gy1) > 12) {
        const gmx = ((gx1 + gx2) * 0.5).toFixed(2), gmy = ((gy1 + gy2) * 0.5).toFixed(2);
        const deg = +((gAng * 180) / Math.PI).toFixed(1);
        const uDeg = (deg > 90 || deg < -90) ? deg + 180 : deg;
        s += `      <text x="${gmx}" y="${gmy}" transform="rotate(${uDeg} ${gmx} ${gmy})" font-family="Inter, Arial, sans-serif" font-size="0.85" fill="#4f46e5" stroke="none" text-anchor="middle" dy="-0.35">GRAIN</text>\n`;
      }
    }
    const foldIdx = p.cutOnFold ? detectFoldEdgeIndex(p) : -1;
    if (foldIdx >= 0 && p.outline.length >= 3) {
      const a = p.outline[foldIdx], b = p.outline[(foldIdx + 1) % p.outline.length];
      const fLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (fLen >= 3) {
        const mid = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
        const nInfo = edgeNormalAtPoint(p.outline, mid);
        const tx = (b[0] - a[0]) / fLen, ty = (b[1] - a[1]) / fLen;
        const [ix, iy] = nInfo.inward;
        const hs = Math.min(Math.max(fLen * 0.28, 2.5), 10), ins = Math.min(1.5, Math.max(0.8, fLen * 0.08));
        const p1 = [mid[0] - tx * hs, mid[1] - ty * hs], p2 = [mid[0] + tx * hs, mid[1] + ty * hs];
        const s1 = [p1[0] + ix * ins, p1[1] + iy * ins], s2 = [p2[0] + ix * ins, p2[1] + iy * ins];
        s += `      <path class="fold-symbol" d="M ${p1[0].toFixed(3)} ${p1[1].toFixed(3)} L ${s1[0].toFixed(3)} ${s1[1].toFixed(3)} L ${s2[0].toFixed(3)} ${s2[1].toFixed(3)} L ${p2[0].toFixed(3)} ${p2[1].toFixed(3)}" stroke="#0284c7" stroke-width="0.14"/>\n`;
      }
    }
    (p.darts || []).forEach((d) => {
      if (Array.isArray(d) && d.length >= 3) {
        const [apex, legA, legC] = d;
        const mid = [(legA[0] + legC[0]) * 0.5, (legA[1] + legC[1]) * 0.5];
        const dx = mid[0] - apex[0], dy = mid[1] - apex[1], dl = Math.hypot(dx, dy) || 1;
        const drill = dl > 1.2 ? [apex[0] + (dx / dl) * 0.5, apex[1] + (dy / dl) * 0.5] : apex;
        s += `      <path class="dart" d="M ${legA[0].toFixed(3)} ${legA[1].toFixed(3)} L ${apex[0].toFixed(3)} ${apex[1].toFixed(3)} L ${legC[0].toFixed(3)} ${legC[1].toFixed(3)}" stroke="#dc2626" stroke-width="0.13"/>\n`;
        s += `      <line class="dart-fold" x1="${apex[0].toFixed(3)}" y1="${apex[1].toFixed(3)}" x2="${mid[0].toFixed(3)}" y2="${mid[1].toFixed(3)}" stroke="#ef4444" stroke-width="0.1" stroke-dasharray="0.3,0.3"/>\n`;
        s += `      <circle class="dart-apex" cx="${drill[0].toFixed(3)}" cy="${drill[1].toFixed(3)}" r="0.3" stroke="#dc2626" stroke-width="0.12" fill="#ffffff"/>\n`;
      }
    });
    (p.notches || []).forEach((nt) => {
      const rawPt = Array.isArray(nt) ? nt : [nt?.x ?? 0, nt?.y ?? 0];
      const nInfo = edgeNormalAtPoint(p.outline, rawPt);
      const bp = nInfo.proj || rawPt;
      const [tx, ty] = nInfo.tangent, [inx, iny] = nInfo.inward;
      const l = [bp[0] - tx * 0.28, bp[1] - ty * 0.28];
      const r = [bp[0] + tx * 0.28, bp[1] + ty * 0.28];
      const tip = [bp[0] + inx * 0.55, bp[1] + iny * 0.55];
      s += `      <path class="notch" d="M ${l[0].toFixed(3)} ${l[1].toFixed(3)} L ${tip[0].toFixed(3)} ${tip[1].toFixed(3)} L ${r[0].toFixed(3)} ${r[1].toFixed(3)}" fill="#18181b" stroke="#18181b" stroke-width="0.08"/>\n`;
    });
    const anchor = findVisualLabelAnchor(p.outline);
    const cutInfo = inferPieceCutInstruction(p);
    const sizeSpec = opts.size ? `${opts.size} · ${cutInfo[lang]}` : cutInfo[lang];
    s += `      <text x="${anchor.x.toFixed(2)}" y="${(anchor.y - 0.6).toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="1.3" font-weight="700" fill="#18181b" stroke="none" text-anchor="middle">${escXML(label)}</text>\n`;
    if (altLabel && altLabel !== label) {
      s += `      <text x="${anchor.x.toFixed(2)}" y="${(anchor.y + 0.9).toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="0.95" fill="#4f46e5" stroke="none" text-anchor="middle">${escXML(altLabel)}</text>\n`;
    }
    s += `      <text x="${anchor.x.toFixed(2)}" y="${(anchor.y + 2.3).toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="0.92" fill="#52525b" stroke="none" text-anchor="middle">${escXML(sizeSpec)}</text>\n`;
    s += `    </g>\n`;
  });
  s += `  </g>\n`;
  if (includeScaleBar) {
    const bx = +(minX + 2).toFixed(2), by = +(minY + h - 5).toFixed(2);
    s += `  <g id="calibration-scale" stroke="#18181b" stroke-width="0.16" fill="none">\n`;
    s += `    <rect x="${bx}" y="${by}" width="10" height="2"/>\n`;
    s += `    <text x="${(bx + 5).toFixed(2)}" y="${(by - 0.5).toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="0.95" fill="#18181b" stroke="none" text-anchor="middle">10 cm (1:1 Calibration)</text>\n`;
    s += `    <rect x="${(bx + 12).toFixed(2)}" y="${by}" width="5.08" height="2"/>\n`;
    s += `    <text x="${(bx + 14.54).toFixed(2)}" y="${(by - 0.5).toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="0.85" fill="#18181b" stroke="none" text-anchor="middle">2 in</text>\n`;
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

// ---- 1:1 Nested Fabric Marker Layout SVG (.svg) ----
export function buildNestedMarkerSVG(pieces, placements, matWidthCm, totalHeightCm, opts = {}) {
  if (!Array.isArray(placements) || !placements.length || !(matWidthCm > 0)) return "";
  const W = Number(matWidthCm) || 150;
  const H = Math.max(20, Number(totalHeightCm) || 100);
  const pad = 4;
  const utilPct = opts.utilization != null ? `${Math.round(opts.utilization * 100)}%` : "—";
  const lang = opts.lang === "ar" ? "ar" : "en";

  const transformPoly = (outline, xOff, yOff, angleDeg = 0) => {
    if (!Array.isArray(outline) || !outline.length) return [];
    const rad = (Number(angleDeg) * Math.PI) / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    const rot = outline.map(([px, py]) => [px * c - py * s, px * s + py * c]);
    const rMinX = Math.min(...rot.map((p) => p[0]));
    const rMinY = Math.min(...rot.map((p) => p[1]));
    return rot.map(([px, py]) => [+(px - rMinX + xOff).toFixed(2), +(py - rMinY + yOff).toFixed(2)]);
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${(W + pad * 2).toFixed(1)}cm" height="${(H + pad * 2 + 8).toFixed(1)}cm" viewBox="${-pad} ${-pad - 8} ${(W + pad * 2).toFixed(2)} ${(H + pad * 2 + 8).toFixed(2)}">\n`;
  svg += `  <rect x="0" y="-6.5" width="${W.toFixed(2)}" height="5.5" fill="#f4f4f5" stroke="#d4d4d8" stroke-width="0.15" rx="0.6"/>\n`;
  svg += `  <text x="1.5" y="-3.2" font-family="Inter, Arial, sans-serif" font-size="2.2" font-weight="700" fill="#18181b">BerryStudio 1:1 Marker · Width: ${W.toFixed(0)} cm · Length: ${(H / 100).toFixed(2)} m · Efficiency: ${utilPct}</text>\n`;
  svg += `  <rect x="0" y="0" width="${W.toFixed(2)}" height="${H.toFixed(2)}" fill="#ffffff" stroke="#18181b" stroke-width="0.25"/>\n`;
  svg += `  <line x1="0" y1="0" x2="0" y2="${H.toFixed(2)}" stroke="#4f46e5" stroke-width="0.18" stroke-dasharray="1.2,0.8"/>\n`;
  svg += `  <line x1="${W.toFixed(2)}" y1="0" x2="${W.toFixed(2)}" y2="${H.toFixed(2)}" stroke="#4f46e5" stroke-width="0.18" stroke-dasharray="1.2,0.8"/>\n`;

  placements.forEach((pl, idx) => {
    const srcPiece = pl.id != null ? pieces[pl.id] : pieces[idx];
    const lbl = escXML(pl.label || (srcPiece?.name && (srcPiece.name[lang] || srcPiece.name.en)) || `Piece ${idx + 1}`);
    if (srcPiece && Array.isArray(srcPiece.outline) && srcPiece.outline.length >= 3 && (pl.rotation != null || pl.x != null)) {
      const pts = transformPoly(srcPiece.outline, pl.x || 0, pl.y || 0, pl.rotation || 0);
      const d = `M ${pts.map((pt) => `${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`).join(" L ")} Z`;
      const cx = avg(pts.map((p) => p[0])), cy = avg(pts.map((p) => p[1]));
      svg += `  <path d="${d}" fill="rgba(109,94,252,0.08)" stroke="#18181b" stroke-width="0.18"/>\n`;
      svg += `  <text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="1.8" font-weight="700" fill="#18181b" text-anchor="middle">${lbl}</text>\n`;
    } else if (pl.w && pl.h) {
      svg += `  <rect x="${(pl.x || 0).toFixed(2)}" y="${(pl.y || 0).toFixed(2)}" width="${pl.w.toFixed(2)}" height="${pl.h.toFixed(2)}" fill="rgba(109,94,252,0.08)" stroke="#18181b" stroke-width="0.18"/>\n`;
      svg += `  <text x="${((pl.x || 0) + pl.w / 2).toFixed(2)}" y="${((pl.y || 0) + pl.h / 2).toFixed(2)}" font-family="Inter, Arial, sans-serif" font-size="1.8" font-weight="700" fill="#18181b" text-anchor="middle">${lbl}</text>\n`;
    }
  });

  if (W >= 14 && H >= 12) {
    svg += `  <rect x="${(W - 11).toFixed(2)}" y="1.0" width="10" height="10" fill="none" stroke="#18181b" stroke-width="0.16"/>\n`;
    svg += `  <text x="${(W - 6).toFixed(2)}" y="6.3" font-family="Inter, Arial, sans-serif" font-size="1.15" fill="#18181b" text-anchor="middle">10×10 cm 1:1</text>\n`;
  }
  svg += `</svg>`;
  return svg;
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
  const INTERFACE_ROLES = new Set(['collar', 'collar-stand', 'collar-band', 'cuff', 'waistband', 'facing', 'lapel-facing', 'placket-facing']);

  let totalAreaCm2 = 0;
  const pieceRows = pieces.map((p, i) => {
    const st = pieceStats(p);
    const qty = Number.isInteger(p.quantity) ? p.quantity : (p.cutOnFold ? 1 : (p.bilateral ? 2 : 1));
    totalAreaCm2 += st.area * (p.cutOnFold ? 2 : 1) * qty;
    const perEdge = seamCm > 0 ? resolvePieceSeamAllowances(p, seamCm, { variable: true }) : [];
    const maxSA = perEdge.length ? Math.max(...perEdge) : seamCm;
    const hasZeroFold = detectFoldEdgeIndex(p) >= 0;
    const saText = seamCm <= 0
      ? 'Net 0 cm'
      : `${seamCm.toFixed(1)} cm` + (maxSA > seamCm + 0.5 ? ` / Hem ${maxSA.toFixed(0)} cm` : '') + (hasZeroFold ? ' / Fold 0 cm' : '');
    const needsInterface = INTERFACE_ROLES.has(p.role || '') || /collar|cuff|waistband|facing|placket/i.test(p.name?.en || '');
    return `<tr>
      <td>${i + 1}</td>
      <td><b>${escXML(p.name?.en || `Piece ${i + 1}`)}</b><br><small style="color:#64748b">${escXML(p.name?.ar || '')}</small>${needsInterface ? `<br><span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:4px;font-weight:700">${lang === 'ar' ? 'حشوة مقواة (فازلين)' : 'Interfaced / Fusible'}</span>` : ''}</td>
      <td><code>${escXML(p.role || 'other')}</code></td>
      <td>${qty}</td>
      <td>${p.cutOnFold ? (lang === 'ar' ? 'على الثنية' : 'Cut on Fold') : '—'}</td>
      <td>${st.w} × ${st.h} cm</td>
      <td>${st.area} cm²</td>
      <td>${escXML(saText)}<br><small style="color:#64748b">${(p.notches || []).length}N · ${(p.darts || []).length}D · ${(p.curves || []).length}C</small></td>
    </tr>`;
  }).join('\n');

  const seamBalance = analyzeSeamBalance(pieces);
  const seamBalanceRows = (seamBalance || []).map((s) => `<tr>
    <td>${escXML(lang === 'ar' ? (s.labelAr || s.labelEn || s.id) : (s.labelEn || s.labelAr || s.id))}</td>
    <td>${Number(s.lenA || 0).toFixed(1)} cm</td>
    <td>${Number(s.lenB || 0).toFixed(1)} cm</td>
    <td>${(Number(s.diffCm) || 0) >= 0 ? '+' : ''}${Number(s.diffCm || 0).toFixed(1)} cm</td>
    <td><b>${s.status === 'ok' ? 'Matched' : (s.status === 'ease' ? 'Tailored Ease' : 'Check Fit')}</b></td>
  </tr>`).join('\n');

  // Multi-size Graded POM Spec Matrix (XS .. XXL)
  const gradeSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const baseMeas = meta.measurements && Object.keys(meta.measurements).length
    ? meta.measurements
    : { chest: 92, waist: 74, hips: 98, shoulder: 40, backLen: 40, sleeve: 58, inseam: 76, neck: 37, bicep: 30, thigh: 55 };
  const measAtSize = (sz) => {
    const step = stepForSize(sz, null);
    return {
      ...baseMeas,
      chest: +(baseMeas.chest + step * 5).toFixed(1),
      waist: +(baseMeas.waist + step * 5).toFixed(1),
      hips: +(baseMeas.hips + step * 5).toFixed(1),
      shoulder: +((baseMeas.shoulder || 40) + step * 1.2).toFixed(1),
      backLen: +((baseMeas.backLen || 40) + step * 0.7).toFixed(1),
      sleeve: +((baseMeas.sleeve || 58) + step * 0.9).toFixed(1),
      inseam: +((baseMeas.inseam || 76) + step * 0.6).toFixed(1),
    };
  };
  const primarySpecPieces = pieces.slice(0, 6);
  const gradedRows = primarySpecPieces.map((p) => {
    const cells = gradeSizes.map((sz) => {
      const gp = gradePieceAnatomically(p, baseMeas, measAtSize(sz), null, stepForSize(sz, null));
      const gst = pieceStats(gp);
      return `<td>${gst.w} × ${gst.h}</td>`;
    }).join('');
    return `<tr><td><b>${escXML(p.name?.[lang] || p.name?.en || p.key)}</b></td>${cells}</tr>`;
  }).join('\n');

  const measRows = meta.measurements && typeof meta.measurements === 'object'
    ? Object.entries(meta.measurements)
      .filter(([, v]) => Number.isFinite(v))
      .map(([k, v]) => `<tr><td>${escXML(k)}</td><td>${(+v).toFixed(1)} cm</td><td>${(v / 2.54).toFixed(2)} in</td></tr>`)
      .join('\n')
    : '';

  const estMeters150 = Math.max(0.4, (totalAreaCm2 / (145 * 100)) * 1.28);
  const qaPass = !meta.validation || meta.validation.summary?.fail === 0;
  const viewDefs = [
    ['front', lang === 'ar' ? 'أمامي' : 'Front'],
    ['threeQuarter', lang === 'ar' ? 'زاوية 3/4' : '3/4 Studio'],
    ['side', lang === 'ar' ? 'جانبي' : 'Side Profile'],
    ['back', lang === 'ar' ? 'خلفي' : 'Back'],
  ];
  const viewsObj = (meta.views3d && typeof meta.views3d === 'object') ? meta.views3d : null;
  const viewCards = viewsObj
    ? viewDefs
      .filter(([k]) => typeof viewsObj[k] === 'string' && viewsObj[k].startsWith('data:image/'))
      .map(([k, lbl]) => `<figure class="view3d-card"><img src="${escXML(viewsObj[k])}" alt="${escXML(lbl)}"><figcaption>${escXML(lbl)}</figcaption></figure>`)
      .join('')
    : '';
  const hasViewsGallery = Boolean(viewCards);
  const secOff = hasViewsGallery ? 1 : 0;

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
  .views3d-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 12px 0; }
  .view3d-card { margin: 0; border: 1px solid #e4e4e7; border-radius: 10px; overflow: hidden; background: #e7ecf4; text-align: center; }
  .view3d-card img { width: 100%; height: 240px; object-fit: contain; display: block; }
  .view3d-card figcaption { padding: 6px; font-size: 12px; font-weight: 600; color: #3f3f46; background: #ffffff; border-top: 1px solid #e4e4e7; }
  @media (max-width: 720px) { .views3d-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
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
  ${hasViewsGallery ? `<h2>1. ${lang === 'ar' ? 'معاينة الموديل ثلاثية الأبعاد من 4 زوايا' : '3D Multi-Angle Drape &amp; Fit Views'}</h2><div class="views3d-grid">${viewCards}</div>` : ''}
  <h2>${1 + secOff}. Technical Pattern Layout (1:1 Proportions)</h2>
  <div class="diagram-box">${svgDiagram}</div>
  <h2>${2 + secOff}. Pattern Cut List &amp; Seam Allowance Schedule</h2>
  <table>
    <thead><tr><th>#</th><th>Piece Name</th><th>Role</th><th>Cut Qty</th><th>Fold</th><th>Dimensions</th><th>Net Area</th><th>Seam Allowance &amp; Marks</th></tr></thead>
    <tbody>${pieceRows}</tbody>
  </table>
  <h2>${3 + secOff}. Graded Size Specification Matrix (W × L cm · XS–XXL)</h2>
  <table>
    <thead><tr><th>Pattern Piece</th>${gradeSizes.map((s) => `<th>${s}</th>`).join('')}</tr></thead>
    <tbody>${gradedRows}</tbody>
  </table>
  ${seamBalanceRows ? `<h2>${4 + secOff}. Seam Balance QA Audit</h2><table><thead><tr><th>Seam Pair</th><th>Edge A</th><th>Edge B</th><th>Diff / Ease</th><th>Status</th></tr></thead><tbody>${seamBalanceRows}</tbody></table>` : ''}
  ${measRows ? `<h2>${(seamBalanceRows ? 5 : 4) + secOff}. Target Body Measurements</h2><table><thead><tr><th>Measurement</th><th>Metric (cm)</th><th>Imperial (in)</th></tr></thead><tbody>${measRows}</tbody></table>` : ''}
  <h2>${(seamBalanceRows ? 4 : 3) + (measRows ? 2 : 1) + secOff}. Atelier Construction &amp; Sewing Sequence</h2>
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

