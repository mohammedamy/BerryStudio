import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDXF, buildHPGL, buildPDF, computeTileGrid, parseDXFEntities, isTurnPoint } from '../js/pattern-export.js';

// A rectangle (4 real 90° corners) plus a coarsely-sampled "curve" (a
// gently bulging edge, points staying near-collinear) — the test shape
// this whole layer-numbering scheme has to get right: real corners on
// layer 2, smoothly-curved intermediate points NOT flagged as corners.
const RECT_PIECE = {
  name: { en: 'Test Rect' },
  outline: [[0, 0], [10, 0], [10, 20], [0, 20]],
  darts: [[[3, 5], [3.5, 6], [4, 5]]], // [legA, apex, legC] — apex at index 1
  notches: [[0, 10]],
  grain: [[5, 2], [5, 18]],
};
function curvedEdgePoints() {
  // A gentle arc sampled into 6 points — each consecutive triple should
  // have a near-180° interior angle (well under the 20° turn threshold),
  // unlike a real corner.
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push([t * 10, Math.sin(t * Math.PI) * 0.6]); // shallow bulge
  }
  return pts;
}

test('isTurnPoint flags a real 90° corner', () => {
  const outline = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(isTurnPoint(outline, 1), true); // the corner at (10,0)
});

test('isTurnPoint does NOT flag a smoothly-curved intermediate point', () => {
  const outline = curvedEdgePoints();
  for (let i = 1; i < outline.length - 1; i++) {
    assert.equal(isTurnPoint(outline, i), false, `point ${i} of the curve was wrongly flagged as a corner`);
  }
});

test('buildDXF returns empty string for no pieces', () => {
  assert.equal(buildDXF([]), '');
  assert.equal(buildDXF(null), '');
});

test('buildDXF emits the real AAMA/ASTM D6673 layer numbers, not the old CUT/GRAIN/DART names', () => {
  const dxf = buildDXF([RECT_PIECE]);
  const entities = parseDXFEntities(dxf);
  const layers = new Set(entities.map((e) => e.layer));
  // layer 1: boundary polyline
  assert.ok(entities.some((e) => e.entityType === 'LWPOLYLINE' && e.layer === '1'));
  // layer 2: turn/corner points — a rectangle has 4 real corners
  const layer2 = entities.filter((e) => e.layer === '2' && e.entityType === 'POINT');
  assert.equal(layer2.length, 4);
  // layer 4: grade-reference centroid + 1 notch = 2 points
  const layer4 = entities.filter((e) => e.layer === '4' && e.entityType === 'POINT');
  assert.equal(layer4.length, 2);
  // layer 8: dart leg lines (2 legs for a 3-point dart)
  const layer8 = entities.filter((e) => e.layer === '8' && e.entityType === 'LINE');
  assert.equal(layer8.length, 2);
  // layer 11: grainline
  assert.ok(entities.some((e) => e.entityType === 'LINE' && e.layer === '11'));
  // layer 13: dart apex drill hole
  assert.ok(entities.some((e) => e.entityType === 'POINT' && e.layer === '13'));
  // no old-style named layers leaked through
  assert.ok(!layers.has('CUT') && !layers.has('GRAIN') && !layers.has('DART'));
});

test('buildDXF leaves layer 3 (curve points) empty when no piece has curve metadata', () => {
  const dxf = buildDXF([RECT_PIECE]);
  const entities = parseDXFEntities(dxf);
  assert.equal(entities.filter((e) => e.layer === '3').length, 0);
});

test('buildDXF populates layer 3 once a piece declares WP-14-style curve metadata', () => {
  const withCurve = { ...RECT_PIECE, curves: [{ fromIdx: 0, toIdx: 1, c1: [3, 1], c2: [7, 1] }] };
  const entities = parseDXFEntities(buildDXF([withCurve]));
  assert.equal(entities.filter((e) => e.layer === '3' && e.entityType === 'POINT').length, 2);
});

test('buildHPGL emits a real IN;SP1;...PU/PD...;SP0; plotter sequence', () => {
  const hpgl = buildHPGL([RECT_PIECE]);
  assert.match(hpgl, /^IN;SP1;/);
  assert.match(hpgl, /PU-?\d+,-?\d+;/);
  assert.match(hpgl, /PD-?\d+,-?\d+;/);
  assert.match(hpgl, /PU;SP0;\s*$/);
  // no grain/dart layer output — a plotter is one pen, cut line only
  const pdCount = (hpgl.match(/PD/g) || []).length;
  assert.equal(pdCount, RECT_PIECE.outline.length); // one PD per edge, back to start
});

test('buildHPGL returns empty string for no pieces', () => {
  assert.equal(buildHPGL([]), '');
});

// ---- tiled PDF ----

test('computeTileGrid returns a single tile for a pattern that fits one page', () => {
  const grid = computeTileGrid({ minX: 0, minY: 0, w: 15, h: 20 }, [210, 297], 10);
  assert.equal(grid.rows, 1);
  assert.equal(grid.cols, 1);
  assert.equal(grid.tiles.length, 1);
  assert.deepEqual(grid.tiles[0].originMm, [0, 0]);
});

test('computeTileGrid splits a wide pattern into the right number of columns', () => {
  // A4 content width = 210 - 2*10 = 190mm; step = 190-10(overlap) = 180mm.
  // A 50cm-wide (500mm) pattern needs ceil(500/180) = 3 columns.
  const grid = computeTileGrid({ minX: 0, minY: 0, w: 50, h: 20 }, [210, 297], 10);
  assert.equal(grid.cols, 3);
  assert.equal(grid.rows, 1);
  assert.equal(grid.tiles.length, 3);
  // tile origins step by stepWmm (180mm) each column
  assert.deepEqual(grid.tiles.map((t) => t.originMm[0]), [0, 180, 360]);
});

test('computeTileGrid splits both dimensions for a large pattern', () => {
  const grid = computeTileGrid({ minX: 0, minY: 0, w: 40, h: 60 }, [210, 297], 10);
  assert.ok(grid.cols >= 2);
  assert.ok(grid.rows >= 2);
  assert.equal(grid.tiles.length, grid.rows * grid.cols);
});

test('buildPDF({tiled:false}) (the default) still returns a single-page document', () => {
  const pdf = buildPDF([RECT_PIECE], { tiled: false });
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/Count 1/);
  assert.equal((pdf.match(/\/Type \/Page[^s]/g) || []).length, 1);
});

test('buildPDF({tiled:true}) produces an assembly-map page plus one page per tile', () => {
  const bigPiece = { ...RECT_PIECE, outline: [[0, 0], [50, 0], [50, 20], [0, 20]] };
  const pdf = buildPDF([bigPiece], { tiled: true, pageSize: 'a4', overlapMm: 10 });
  const countMatch = /\/Count (\d+)/.exec(pdf);
  const grid = computeTileGrid({ minX: 0, minY: 0, w: 50, h: 20 }, [210, 297], 10);
  assert.equal(+countMatch[1], grid.tiles.length + 1); // +1 for the assembly-map page
  assert.match(pdf, /Assembly map/);
  assert.match(pdf, /calibration/);
});

test('buildPDF({tiled:true, includeGuides:false}) skips the assembly-map page and registration marks', () => {
  const bigPiece = { ...RECT_PIECE, outline: [[0, 0], [50, 0], [50, 20], [0, 20]] };
  const pdf = buildPDF([bigPiece], { tiled: true, includeGuides: false });
  const grid = computeTileGrid({ minX: 0, minY: 0, w: 50, h: 20 }, [210, 297], 10);
  const countMatch = /\/Count (\d+)/.exec(pdf);
  assert.equal(+countMatch[1], grid.tiles.length); // no +1 — the assembly-map page is gone
  assert.doesNotMatch(pdf, /Assembly map/);
});

test('buildPDF returns null for no pieces regardless of tiled option', () => {
  assert.equal(buildPDF([], { tiled: true }), null);
  assert.equal(buildPDF([], { tiled: false }), null);
});
