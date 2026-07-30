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
