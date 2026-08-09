import { test } from "node:test";
import assert from "node:assert/strict";
import { Canvas } from "../js/canvas.js";

// WP-17: nudgePiece is the geometry backing the canvas's keyboard-nudge
// shortcut (arrow keys in js/app.js's keys() handler). Canvas.init() is
// deliberately never called here — render()/pushUndo() both no-op safely
// without a real <canvas> (see canvas.js:231's `if (!ctx) return`), so the
// pure piece-mutation logic is testable directly in Node.

test("nudgePiece translates outline, darts, notches, and grain together", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Test", ar: "اختبار" });
  Canvas.setPieceProps(i, {
    darts: [[[5, 5], [4, 6], [6, 6]]],
    notches: [[3, 3]],
  });
  const before = JSON.parse(JSON.stringify(Canvas.getPieces()[i]));
  Canvas.nudgePiece(i, 2, -1);
  const after = Canvas.getPieces()[i];

  before.outline.forEach((pt, k) => {
    assert.equal(after.outline[k][0], pt[0] + 2);
    assert.equal(after.outline[k][1], pt[1] - 1);
  });
  before.darts[0].forEach((pt, k) => {
    assert.equal(after.darts[0][k][0], pt[0] + 2);
    assert.equal(after.darts[0][k][1], pt[1] - 1);
  });
  assert.equal(after.notches[0][0], before.notches[0][0] + 2);
  assert.equal(after.notches[0][1], before.notches[0][1] - 1);
  before.grain.forEach((pt, k) => {
    assert.equal(after.grain[k][0], pt[0] + 2);
    assert.equal(after.grain[k][1], pt[1] - 1);
  });
});

test("nudgePiece also translates curve control points when present (WP-14 metadata)", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Test2", ar: "اختبار2" });
  Canvas.setPieceProps(i, {
    curves: [{ fromIdx: 0, toIdx: 1, c1: [1, 1], c2: [2, 2] }],
  });
  Canvas.nudgePiece(i, 3, 3);
  const after = Canvas.getPieces()[i];
  assert.deepEqual(after.curves[0].c1, [4, 4]);
  assert.deepEqual(after.curves[0].c2, [5, 5]);
});

test("nudgePiece is undoable", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Test3", ar: "اختبار3" });
  const originalX = Canvas.getPieces()[i].outline[0][0];
  Canvas.nudgePiece(i, 5, 0);
  assert.equal(Canvas.getPieces()[i].outline[0][0], originalX + 5);
  Canvas.doUndo();
  assert.equal(Canvas.getPieces()[i].outline[0][0], originalX);
});

test("nudgePiece on a non-existent index is a safe no-op", () => {
  Canvas.clearAll();
  assert.equal(Canvas.nudgePiece(0, 1, 1), false);
});

// ---- multi-select group nudge ----
test("nudgePieces moves every listed piece as one undo step", () => {
  Canvas.clearAll();
  const a = Canvas.addPiece({ en: "A", ar: "أ" });
  const b = Canvas.addPiece({ en: "B", ar: "ب" });
  const c = Canvas.addPiece({ en: "C", ar: "ج" });
  const before = Canvas.getPieces().map(p => p.outline[0].slice());
  assert.equal(Canvas.nudgePieces([a, c], 3, -2), true);
  const after = Canvas.getPieces();
  assert.equal(after[a].outline[0][0], before[a][0] + 3);
  assert.equal(after[a].outline[0][1], before[a][1] - 2);
  assert.equal(after[c].outline[0][0], before[c][0] + 3);
  // the un-listed piece is untouched
  assert.deepEqual(after[b].outline[0], before[b]);
  // one undo reverts BOTH moved pieces together, not one at a time
  Canvas.doUndo();
  assert.deepEqual(Canvas.getPieces()[a].outline[0], before[a]);
  assert.deepEqual(Canvas.getPieces()[c].outline[0], before[c]);
});
test("nudgePieces with an empty list is a safe no-op", () => {
  Canvas.clearAll();
  assert.equal(Canvas.nudgePieces([], 1, 1), false);
});

// ---- Add Point: outline splice reindexing (edges[]/curves[]/chestEdgeIndices) ----
test("insertOutlinePoint shifts edges[], curves[], and chestEdgeIndices past the insertion point", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "T", ar: "ت" });
  Canvas.setPieceProps(i, {
    edges: [{ fromIdx: 0, toIdx: 3 }, { fromIdx: 1, toIdx: 2 }],
    curves: [{ fromIdx: 2, toIdx: 3, c1: [1, 1], c2: [2, 2] }],
    chestEdgeIndices: [1, 3],
  });
  // insert a new vertex right after edge index 1 (between outline[1] and outline[2])
  assert.equal(Canvas.insertOutlinePoint(i, 1, [99, 99]), true);
  const p = Canvas.getPieces()[i];
  assert.equal(p.outline.length, 5);
  assert.deepEqual(p.outline[2], [99, 99]);
  // edges/curves/chestEdgeIndices referencing index >1 shift up by one; <=1 stay put
  assert.deepEqual(p.edges, [{ fromIdx: 0, toIdx: 4 }, { fromIdx: 1, toIdx: 3 }]);
  assert.deepEqual(p.curves, [{ fromIdx: 3, toIdx: 4, c1: [1, 1], c2: [2, 2] }]);
  assert.deepEqual(p.chestEdgeIndices, [1, 4]);
});
test("insertOutlinePoint on a non-existent piece is a safe no-op", () => {
  Canvas.clearAll();
  assert.equal(Canvas.insertOutlinePoint(0, 0, [1, 1]), false);
});

// ---- outline vertex deletion (select-a-point-and-delete-it) ----
test("removeOutlinePoint removes the right vertex and shifts edges[]/curves[]/chestEdgeIndices past it", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "T", ar: "ت" });
  Canvas.setPieceProps(i, {
    edges: [{ fromIdx: 0, toIdx: 3 }, { fromIdx: 2, toIdx: 3 }],
    curves: [{ fromIdx: 2, toIdx: 3, c1: [1, 1], c2: [2, 2] }],
    chestEdgeIndices: [1, 3],
  });
  const before = JSON.parse(JSON.stringify(Canvas.getPieces()[i].outline));
  assert.equal(Canvas.removeOutlinePoint(i, 1), true);
  const p = Canvas.getPieces()[i];
  assert.equal(p.outline.length, 3);
  // outline[1] is gone; outline[0] untouched, what was outline[2]/[3] shift down to [1]/[2]
  assert.deepEqual(p.outline[0], before[0]);
  assert.deepEqual(p.outline[1], before[2]);
  assert.deepEqual(p.outline[2], before[3]);
  // indices >1 (the removed index) shift down by one; the untouched edge (toIdx:3->2) still
  // points at the same physical vertex it always did
  assert.deepEqual(p.edges, [{ fromIdx: 0, toIdx: 2 }, { fromIdx: 1, toIdx: 2 }]);
  assert.deepEqual(p.curves, [{ fromIdx: 1, toIdx: 2, c1: [1, 1], c2: [2, 2] }]);
  // chestEdgeIndices' 1 (the vertex physically right after the one just
  // removed) shifts down to 0 same as everything else past the removal —
  // spliceOutline()'s bump() has no special case for "was adjacent to the
  // removed index", only "was after it".
  assert.deepEqual(p.chestEdgeIndices, [0, 2]);
});
test("removeOutlinePoint at index 0 removes the first vertex correctly", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "T0", ar: "ت٠" });
  const before = JSON.parse(JSON.stringify(Canvas.getPieces()[i].outline));
  assert.equal(Canvas.removeOutlinePoint(i, 0), true);
  const p = Canvas.getPieces()[i];
  assert.equal(p.outline.length, 3);
  assert.deepEqual(p.outline, before.slice(1));
});
test("removeOutlinePoint refuses to drop a piece below 3 points", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Tri", ar: "مثلث" });
  Canvas.removeOutlinePoint(i, 0); // 4 -> 3, allowed
  assert.equal(Canvas.getPieces()[i].outline.length, 3);
  assert.equal(Canvas.removeOutlinePoint(i, 0), false); // 3 -> 2, refused
  assert.equal(Canvas.getPieces()[i].outline.length, 3);
});
test("removeOutlinePoint is undoable", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "U", ar: "ت" });
  const before = JSON.parse(JSON.stringify(Canvas.getPieces()[i].outline));
  Canvas.removeOutlinePoint(i, 1);
  assert.equal(Canvas.getPieces()[i].outline.length, 3);
  Canvas.doUndo();
  assert.deepEqual(Canvas.getPieces()[i].outline, before);
});
test("removeOutlinePoint on a non-existent piece is a safe no-op", () => {
  Canvas.clearAll();
  assert.equal(Canvas.removeOutlinePoint(0, 0), false);
});

// ---- WP-46: closing edges ----
test("toggleClosingEdge turns an edge on then off, and isClosingEdge reflects it", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "CE", ar: "ح" });
  const p = () => Canvas.getPieces()[i];
  assert.equal(Canvas.isClosingEdge(p(), 1), false);
  assert.equal(Canvas.toggleClosingEdge(i, 1), true);
  assert.equal(Canvas.isClosingEdge(p(), 1), true);
  assert.equal(Canvas.toggleClosingEdge(i, 1), true);
  assert.equal(Canvas.isClosingEdge(p(), 1), false);
});
test("toggleClosingEdge rejects an out-of-range edge index or a non-existent piece", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "CE2", ar: "ح٢" });
  assert.equal(Canvas.toggleClosingEdge(i, 99), false);
  assert.equal(Canvas.toggleClosingEdge(i, -1), false);
  assert.equal(Canvas.toggleClosingEdge(5, 0), false);
});
test("toggleClosingEdge is undoable", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "CE3", ar: "ح٣" });
  Canvas.toggleClosingEdge(i, 0);
  assert.equal(Canvas.isClosingEdge(Canvas.getPieces()[i], 0), true);
  Canvas.doUndo();
  assert.equal(Canvas.isClosingEdge(Canvas.getPieces()[i], 0), false);
});
test("insertOutlinePoint splits a closing edge into two closing edges", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Split", ar: "تقسيم" });
  Canvas.toggleClosingEdge(i, 1); // outline[1] -> outline[2]
  assert.equal(Canvas.insertOutlinePoint(i, 1, [99, 99]), true);
  const p = Canvas.getPieces()[i];
  assert.equal(p.outline.length, 5);
  assert.deepEqual(p.closingEdges.slice().sort((a, b) => a - b), [1, 2]);
});
test("removeOutlinePoint drops closing-edge flags on both edges touching the deleted vertex, shifting the rest", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Rm", ar: "حذف" });
  Canvas.toggleClosingEdge(i, 0); // outline[0]->outline[1] — touches the deleted vertex, dropped
  Canvas.toggleClosingEdge(i, 1); // outline[1]->outline[2] — touches the deleted vertex, dropped
  Canvas.toggleClosingEdge(i, 2); // outline[2]->outline[3] — untouched, shifts down to 1
  assert.equal(Canvas.removeOutlinePoint(i, 1), true);
  assert.deepEqual(Canvas.getPieces()[i].closingEdges, [1]);
});

// ---- WP-46: named (matched) outline points ----
test("setOutlinePointName sets a name; an empty/whitespace name clears it", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Nm", ar: "اسم" });
  assert.equal(Canvas.setOutlinePointName(i, 2, "A"), true);
  assert.equal(Canvas.getOutlinePointName(i, 2), "A");
  assert.equal(Canvas.setOutlinePointName(i, 2, "  "), true);
  assert.equal(Canvas.getOutlinePointName(i, 2), undefined);
});
test("setOutlinePointName on a non-existent point or piece is a safe no-op", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Nm2", ar: "اسم٢" });
  assert.equal(Canvas.setOutlinePointName(i, 99, "A"), false);
  assert.equal(Canvas.setOutlinePointName(5, 0, "A"), false);
});
test("insertOutlinePoint shifts pointNames past the insertion point", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "NmShift", ar: "ن" });
  Canvas.setOutlinePointName(i, 2, "A");
  assert.equal(Canvas.insertOutlinePoint(i, 0, [50, 50]), true); // new vertex lands at index 1
  assert.equal(Canvas.getOutlinePointName(i, 3), "A"); // shifted from 2 to 3
  assert.equal(Canvas.getOutlinePointName(i, 2), undefined);
});
test("removeOutlinePoint drops the deleted vertex's own name and shifts the rest down", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "NmRm", ar: "نذ" });
  Canvas.setOutlinePointName(i, 1, "A");
  Canvas.setOutlinePointName(i, 3, "B");
  assert.equal(Canvas.removeOutlinePoint(i, 1), true);
  assert.equal(Canvas.getOutlinePointName(i, 1), undefined);
  assert.equal(Canvas.getOutlinePointName(i, 2), "B");
});
test("getMatchedPointGroups groups same-named points across pieces and excludes unmatched singles", () => {
  Canvas.clearAll();
  const a = Canvas.addPiece({ en: "PieceA", ar: "أ" });
  const b = Canvas.addPiece({ en: "PieceB", ar: "ب" });
  Canvas.setOutlinePointName(a, 0, "M");
  Canvas.setOutlinePointName(b, 2, "M");
  Canvas.setOutlinePointName(a, 1, "Solo");
  const groups = Canvas.getMatchedPointGroups();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "M");
  const pieceIdxs = groups[0].points.map(pt => pt.pieceIdx).sort((x, y) => x - y);
  assert.deepEqual(pieceIdxs, [a, b].sort((x, y) => x - y));
});

// ---- WP-46: numeric corner-point coordinates ----
test("setOutlinePointXY sets exact coordinates and is undoable", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "XY", ar: "س ص" });
  assert.equal(Canvas.setOutlinePointXY(i, 0, 12.5, -3), true);
  assert.deepEqual(Canvas.getPieces()[i].outline[0], [12.5, -3]);
  Canvas.doUndo();
  assert.deepEqual(Canvas.getPieces()[i].outline[0], [8, 8]); // addPiece's default first-piece origin
});
test("setOutlinePointXY rejects non-finite coordinates and a non-existent point/piece", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "XY2", ar: "س ص٢" });
  assert.equal(Canvas.setOutlinePointXY(i, 0, NaN, 1), false);
  assert.equal(Canvas.setOutlinePointXY(i, 99, 1, 1), false);
  assert.equal(Canvas.setOutlinePointXY(5, 0, 1, 1), false);
});

// ---- Curve Edge tool ----
test("curveEdge bows a straight edge into a real bezier and records exact-endpoint sample points", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Sq", ar: "مربع" });
  const before = JSON.parse(JSON.stringify(Canvas.getPieces()[i].outline));
  assert.equal(Canvas.curveEdge(i, 0, [before[0][0] + 5, before[0][1] - 3]), true);
  const p = Canvas.getPieces()[i];
  assert.equal(p.outline.length, before.length - 1 + 6, "delCount=1, +6 sampled points");
  assert.equal(p.curves.length, 1);
  assert.equal(p.curves[0].fromIdx, 0);
  assert.equal(p.curves[0].toIdx, 6);
  // the outline still passes exactly through the edge's original two endpoints
  assert.deepEqual(p.outline[0], before[0]);
  assert.deepEqual(p.outline[6], before[1]);
  // every OTHER outline point shifted up by exactly 5 (6 sampled - 1 removed), unmoved otherwise
  for (let k = 2; k < before.length; k++) assert.deepEqual(p.outline[k + 5], before[k]);
});
test("curveEdge rejects the wraparound (closing) edge", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Sq", ar: "مربع" });
  const before = JSON.parse(JSON.stringify(Canvas.getPieces()[i]));
  const lastEdge = before.outline.length - 1;
  assert.equal(Canvas.curveEdge(i, lastEdge, [0, 0]), false);
  assert.deepEqual(Canvas.getPieces()[i].outline, before.outline);
  assert.equal((Canvas.getPieces()[i].curves || []).length, 0);
});
test("revertCurveEdge undoes curveEdge exactly — a full round-trip returns the original outline", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Sq", ar: "مربع" });
  const before = JSON.parse(JSON.stringify(Canvas.getPieces()[i]));
  Canvas.curveEdge(i, 0, [before.outline[0][0] + 5, before.outline[0][1] - 3]);
  assert.equal(Canvas.revertCurveEdge(i, 0), true);
  const after = Canvas.getPieces()[i];
  assert.deepEqual(after.outline, before.outline);
  assert.equal((after.curves || []).length, 0);
});
test("revertCurveEdge on an edge with no curve is a safe no-op", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Sq", ar: "مربع" });
  assert.equal(Canvas.revertCurveEdge(i, 0), false);
});
test("re-dragging an already-curved edge REPLACES it, not duplicates it", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Sq", ar: "مربع" });
  const before = JSON.parse(JSON.stringify(Canvas.getPieces()[i].outline));
  Canvas.curveEdge(i, 0, [before[0][0] + 5, before[0][1] - 3]);
  const midLen = Canvas.getPieces()[i].outline.length;
  Canvas.curveEdge(i, 0, [before[0][0] + 8, before[0][1] - 1]); // re-drag the SAME edge, different bulge
  const p = Canvas.getPieces()[i];
  assert.equal(p.curves.length, 1, "still exactly one curve entry for this edge, not two");
  assert.equal(p.outline.length, midLen, "outline length stable across a re-drag (revert-then-reapply, not accumulate)");
  assert.deepEqual(p.outline[6], before[1], "still passes exactly through the edge's original far endpoint");
});
test("curving a second edge correctly reindexes an earlier-curved edge's own fromIdx/toIdx", () => {
  Canvas.clearAll();
  const i = Canvas.addPiece({ en: "Pent", ar: "خماسي" });
  const P = [[0, 0], [10, 0], [20, 0], [20, 10], [0, 10]];
  Canvas.setPieceProps(i, { outline: P.map(pt => pt.slice()) });
  Canvas.curveEdge(i, 2, [25, 5]);     // P2->P3 first
  Canvas.curveEdge(i, 0, [5, -5]);     // then P0->P1 — must shift the P2->P3 curve's indices
  const p = Canvas.getPieces()[i];
  assert.equal(p.outline.length, 15);
  assert.equal(p.curves.length, 2);
  const c02 = p.curves.find(c => c.fromIdx === 0);
  const c23 = p.curves.find(c => c.fromIdx === 7);
  assert.ok(c02 && c23, "both curves present at their correctly-shifted indices");
  assert.equal(c02.toIdx, 6);
  assert.equal(c23.toIdx, 13);
  assert.deepEqual(p.outline[0], P[0]);       // untouched, before any curved span
  assert.deepEqual(p.outline[6], P[1]);       // second curve's own far endpoint
  assert.deepEqual(p.outline[7], P[2]);       // shifted +5 by the second splice, coords unchanged
  assert.deepEqual(p.outline[13], P[3]);      // first curve's far endpoint, shifted +5
  assert.deepEqual(p.outline[14], P[4]);      // trailing untouched point, shifted +5
});
test("curveEdge on a non-existent piece/edge is a safe no-op", () => {
  Canvas.clearAll();
  assert.equal(Canvas.curveEdge(0, 0, [1, 1]), false);
  const i = Canvas.addPiece({ en: "Sq", ar: "مربع" });
  assert.equal(Canvas.curveEdge(i, 99, [1, 1]), false);
});

// ---- "make any closed figure a layer": promoting a closed sketch shape ----
test("promoteSketchToPiece promotes a closed Filled Shape (polygon) stroke and removes the source stroke", () => {
  Canvas.clearAll();
  const idx = Canvas.addSketchStroke({ tool: "polygon", pts: [[0, 0], [10, 0], [10, 10], [0, 10]] });
  let requested = null;
  Canvas.onPromoteRequest(pts => { requested = pts; });
  assert.equal(Canvas.promoteSketchToPiece(idx), true);
  assert.ok(requested && requested.length === 4);
  assert.equal(Canvas.finishPromotePiece("Sketch Piece", "قطعة مرسومة"), true);
  const pieces = Canvas.getPieces();
  const created = pieces[pieces.length - 1];
  assert.equal(created.name.en, "Sketch Piece");
  assert.deepEqual(created.outline, [[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.equal(Canvas.getSketch().length, 0, "the source stroke was consumed, not left behind as a duplicate");
});
test("promoteSketchToPiece rejects an open (not self-closing) Pen/Freehand stroke", () => {
  Canvas.clearAll();
  const idx = Canvas.addSketchStroke({ tool: "pen", pts: [[0, 0], [10, 0], [10, 10]] });
  let warned = null;
  Canvas.onWarnRequest(key => { warned = key; });
  assert.equal(Canvas.promoteSketchToPiece(idx), false);
  assert.equal(warned, "promoteNotClosed");
  assert.equal(Canvas.getSketch().length, 1, "nothing was consumed on rejection");
});
test("promoteSketchToPiece accepts a Pen/Freehand stroke whose own first and last points meet", () => {
  Canvas.clearAll();
  const idx = Canvas.addSketchStroke({ tool: "pen", pts: [[0, 0], [10, 0], [10, 10], [0.4, 0.4]] });
  assert.equal(Canvas.isSketchClosed(Canvas.getSketch()[idx]), true);
  assert.equal(Canvas.promoteSketchToPiece(idx), true);
});
test("isSketchClosed rejects a 2-point stroke (just a line) even if its endpoints coincide", () => {
  Canvas.clearAll();
  assert.equal(Canvas.isSketchClosed({ tool: "line", pts: [[0, 0], [0, 0]] }), false);
});

// ---- Shift-constrain a drawn line to the nearest 0/45/90/…/315° ----
// (Line and Construction Line tools, js/canvas.js pointermove handler.)
// This exercises the exact shipped snapAngle45(), not a re-implementation —
// interactively driving a real Shift-held drag isn't reliably simulatable
// in this project's browser-automation tooling (modifier keys don't
// propagate through synthesized intermediate pointermove events), so this
// unit coverage is deliberately the primary regression guard for the
// algorithm itself; the wiring into the two pointermove branches was
// verified by direct code inspection instead — see WP-45's CHANGELOG entry.
test("snapAngle45 snaps a near-horizontal line to exactly horizontal, keeping the real distance", () => {
  const [x, y] = Canvas.snapAngle45(10, 10, 25, 13);
  assert.equal(y, 10);
  assert.equal(Math.round(Math.hypot(x - 10, y - 10) * 1000) / 1000, Math.round(Math.hypot(15, 3) * 1000) / 1000);
});
test("snapAngle45 snaps a near-vertical line to exactly vertical", () => {
  const [x, y] = Canvas.snapAngle45(10, 10, 12, 30);
  assert.equal(Math.round(x * 1e9) / 1e9, 10); // Math.cos(Math.PI/2) isn't exactly 0 in floating point
  assert.ok(y > 10);
});
test("snapAngle45 snaps a ~39° line to an exact 45° diagonal (dx === dy)", () => {
  const [x, y] = Canvas.snapAngle45(10, 10, 21, 19);
  assert.equal(Math.round((x - 10) * 1000), Math.round((y - 10) * 1000));
});
test("snapAngle45 leaves an already-exact angle unchanged", () => {
  assert.deepEqual(Canvas.snapAngle45(10, 10, 40, 10), [40, 10]);
});
test("snapAngle45 on a zero-length drag is a safe no-op (no NaN)", () => {
  assert.deepEqual(Canvas.snapAngle45(10, 10, 10, 10), [10, 10]);
});
test("snapAngle45 covers all four quadrants (up-left, up-right, down-left, down-right)", () => {
  const r = (pt) => pt.map(n => Math.round(n * 1e6) / 1e6); // floating-point noise from cos/sin at exact angles
  assert.deepEqual(r(Canvas.snapAngle45(0, 0, -10, 10)), [-10, 10]);   // 135°, already exact
  assert.deepEqual(r(Canvas.snapAngle45(0, 0, 10, -10)), [10, -10]);   // -45°/315°, already exact
  assert.deepEqual(r(Canvas.snapAngle45(0, 0, -10, -10)), [-10, -10]); // 225°, already exact
});
