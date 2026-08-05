import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIGen } from '../js/ai.js';
import { computeMeasurements } from '../js/data.js';
import { computeGatherWidth, computeTucks } from '../js/pleats.js';

const meas = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });

test('deriveStyle + build produces at least one piece with the expected shape', () => {
  const style = AIGen.deriveStyle('a-line summer dress with cap sleeves and a boat neckline', 'en');
  const built = AIGen.build(style, meas);
  assert.ok(Array.isArray(built.pieces));
  assert.ok(built.pieces.length > 0);
  const p = built.pieces[0];
  assert.ok(p.name && typeof p.name.en === 'string' && typeof p.name.ar === 'string');
  assert.ok(Array.isArray(p.outline) && p.outline.length >= 3);
  // every outline point is a finite [x, y] pair
  for (const pt of p.outline) {
    assert.equal(pt.length, 2);
    assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
  }
});

test('build() is deterministic for the same style+measurements input', () => {
  const style = AIGen.deriveStyle('fitted pencil skirt', 'en');
  const a = AIGen.build(style, meas);
  const b = AIGen.build(style, meas);
  assert.deepEqual(a.pieces.map((p) => p.outline), b.pieces.map((p) => p.outline));
});

test('a "mock neck sleeveless zip romper" prompt is detected as a romper with mock neckline and zip closure', () => {
  const style = AIGen.deriveStyle({ metrics: null, prompt: 'Mock Neck Sleeveless Zip Romper', category: 'women', imageDataURL: null });
  assert.equal(style.type, 'romper');
  assert.equal(style.neckline, 'mock');
  assert.equal(style.zip, true);
  assert.equal(style.sleeveLenF, 0);
});

test('buildRomper produces a real bodice+shorts garment (front/back bodice, front/back shorts, binding, collar stand, zip facing)', () => {
  const style = AIGen.deriveStyle({ metrics: null, prompt: 'mock neck sleeveless zip romper', category: 'women', imageDataURL: null });
  const built = AIGen.build(style, meas);
  const names = built.pieces.map((p) => p.name.en);
  assert.ok(names.some((n) => /Front Bodice/.test(n)));
  assert.ok(names.some((n) => /Back Bodice/.test(n)));
  assert.ok(names.some((n) => /Front Shorts/.test(n)));
  assert.ok(names.some((n) => /Back Shorts/.test(n)));
  assert.ok(names.some((n) => /Armhole Binding/.test(n)), 'sleeveless romper should get an armhole binding, not a sleeve');
  assert.ok(names.some((n) => /Mock Neck Stand/.test(n)));
  assert.ok(names.some((n) => /Zip Facing/.test(n)));
  for (const p of built.pieces) {
    assert.ok(Array.isArray(p.outline) && p.outline.length >= 3);
    for (const pt of p.outline) assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
  }
});

test('a romper with sleeves gets a real sleeve piece instead of armhole binding', () => {
  const style = { ...AIGen.deriveStyle({ metrics: null, prompt: 'romper', category: 'women', imageDataURL: null }), sleeveLenF: 1.0 };
  const built = AIGen.build(style, meas);
  const names = built.pieces.map((p) => p.name.en);
  assert.ok(names.includes('Sleeve'));
  assert.ok(!names.some((n) => /Armhole Binding/.test(n)));
});

test('trousers and skirt types route to their own builders (different piece counts than a top)', () => {
  const topStyle = AIGen.deriveStyle('sleeveless shift dress', 'en');
  const skirtStyle = { ...AIGen.deriveStyle('pleated skirt', 'en'), type: 'skirt' };
  const trouserStyle = { ...AIGen.deriveStyle('wide-leg trousers', 'en'), type: 'trousers' };
  const top = AIGen.build(topStyle, meas);
  const skirt = AIGen.build(skirtStyle, meas);
  const trousers = AIGen.build(trouserStyle, meas);
  assert.ok(top.pieces.length > 0 && skirt.pieces.length > 0 && trousers.pieces.length > 0);
});

test('buildFromMeasuredPieces traces literal outlineCm coordinates instead of a style-factor guess', () => {
  const spec = {
    garment: { type: 'top', category: 'women' },
    pieces: [
      { id: 'front-bodice', role: 'bodice-front', cutOnFold: true, quantity: 1, grainline: 'straight',
        label: { en: 'Front Bodice', ar: 'صدرية أمامية' },
        outlineCm: [[0, 0], [21, 0], [22, 63], [0, 60]] },
      { id: 'placket', role: 'placket-facing', cutOnFold: false, quantity: 2, grainline: 'straight',
        label: { en: 'Front Placket', ar: 'باتة' },
        outlineCm: [[0, 0], [4, 0], [4, 40], [0, 40]] },
    ],
  };
  const built = AIGen.buildFromMeasuredPieces(spec, meas);
  assert.equal(built.length, 2);
  assert.equal(built[0].name.en, 'Front Bodice');
  assert.equal(built[1].name.en, 'Front Placket');
  // no referenceMeasurementsCm given -> traced exactly, sx=sy=1
  assert.deepEqual(built[0].outline, [[0, 0], [21, 0], [22, 63], [0, 60]]);
  assert.equal(built[0].cutOnFold, true);
  assert.ok(Array.isArray(built[0].grain) && built[0].grain.length === 2);
});

test('buildFromMeasuredPieces scales traced coordinates to the wearer when referenceMeasurementsCm is given', () => {
  const spec = {
    garment: {
      type: 'top', category: 'women',
      referenceMeasurementsCm: { chest: 80, backLen: 60 },
    },
    pieces: [
      { id: 'front-bodice', role: 'bodice-front', cutOnFold: true, quantity: 1, grainline: 'straight',
        outlineCm: [[0, 0], [20, 0], [20, 60], [0, 60]] },
    ],
  };
  // wearer's own chest/backLen differ from the reference sheet's 80/60
  const wearerMeas = { ...meas, chest: 88, backLen: 66 };
  const built = AIGen.buildFromMeasuredPieces(spec, wearerMeas);
  const sx = 88 / 80, sy = 66 / 60;
  assert.equal(built[0].outline[1][0], +(20 * sx).toFixed(2));
  assert.equal(built[0].outline[2][1], +(60 * sy).toFixed(2));
  // falls back to a role-derived label when no explicit label given
  assert.equal(built[0].name.en, 'Front Bodice');
});

test('buildFromMeasuredPieces output passes PatternValidator with no failures', () => {
  const spec = {
    garment: { type: 'top', category: 'women' },
    pieces: [
      { id: 'front-bodice', role: 'bodice-front', cutOnFold: true, quantity: 1, grainline: 'straight',
        outlineCm: [[0, 0], [21, 0], [22, 62], [0, 62]] },
      { id: 'back-bodice', role: 'bodice-back', cutOnFold: true, quantity: 1, grainline: 'straight',
        outlineCm: [[0, 0], [21, 0], [21, 62], [0, 62]] },
    ],
  };
  const built = AIGen.buildFromMeasuredPieces(spec, meas);
  return import('../js/validate.js').then(({ PatternValidator }) => {
    const validation = PatternValidator.run(built, {});
    assert.equal(validation.summary.fail, 0);
  });
});

// WP-20: gathers & tucks wired into the same builders pleats already uses.
const baseSkirtStyle = () => ({ ...AIGen.deriveStyle({ metrics: null, prompt: 'skirt', category: 'women', imageDataURL: null }), type: 'skirt' });
const frontSkirtWidth = (built) => built.pieces.find((p) => p.name.en === 'Front Skirt').outline[1][0];

test('buildSkirt: no technique selected keeps the panel at its plain finished width (byte-identical baseline)', () => {
  const style = baseSkirtStyle();
  const built = AIGen.build(style, meas);
  const w = (meas.hips / 4 + 2) * style.fitF;
  assert.ok(Math.abs(frontSkirtWidth(built) - w) < 1e-9);
  assert.equal(built.pieces.find((p) => p.name.en === 'Front Skirt').pleats, undefined);
});

test('buildSkirt: gatherRatio widens the panel to computeGatherWidth(w, ratio), no discrete pleats metadata', () => {
  const style = { ...baseSkirtStyle(), gatherRatio: 1.5 };
  const built = AIGen.build(style, meas);
  const w = (meas.hips / 4 + 2) * style.fitF;
  assert.ok(Math.abs(frontSkirtWidth(built) - computeGatherWidth(w, 1.5)) < 1e-9);
  assert.equal(built.pieces.find((p) => p.name.en === 'Front Skirt').pleats, undefined);
});

test('buildSkirt: tuckCount widens the panel via computeTucks and records discrete tuck positions', () => {
  const style = { ...baseSkirtStyle(), tuckCount: 4 };
  const built = AIGen.build(style, meas);
  const w = (meas.hips / 4 + 2) * style.fitF;
  const { addedWidthCm, pleats } = computeTucks(w, 4, 1.5);
  const front = built.pieces.find((p) => p.name.en === 'Front Skirt');
  assert.ok(Math.abs(frontSkirtWidth(built) - (w + addedWidthCm)) < 1e-9);
  assert.deepEqual(front.pleats, pleats);
});

test('buildSkirt: gatherRatio takes priority over a simultaneously-set pleatCount/tuckCount (never silently combines two techniques)', () => {
  const style = { ...baseSkirtStyle(), gatherRatio: 1.4, pleatCount: 6, tuckCount: 4 };
  const built = AIGen.build(style, meas);
  const w = (meas.hips / 4 + 2) * style.fitF;
  assert.ok(Math.abs(frontSkirtWidth(built) - computeGatherWidth(w, 1.4)) < 1e-9);
});

const sleeveCapWidth = (built) => built.pieces.find((p) => p.name.en === 'Sleeve').outline[2][0];

test('sleeve cap: no technique selected keeps the cap at its plain finished width (byte-identical baseline)', () => {
  const style = { ...AIGen.deriveStyle('short sleeve top', 'en'), type: 'top', sleeveLenF: 1 };
  const built = AIGen.build(style, meas);
  const finishedCapW = (meas.bicep / 4) * style.sleeveWideF * 2;
  assert.ok(Math.abs(sleeveCapWidth(built) - finishedCapW) < 1e-9);
});

test('sleeve cap: sleeveGatherRatio widens it to computeGatherWidth(finishedCapW, ratio) — a real gathered puff-sleeve cap', () => {
  const style = { ...AIGen.deriveStyle('short sleeve top', 'en'), type: 'top', sleeveLenF: 1, sleeveGatherRatio: 1.6 };
  const built = AIGen.build(style, meas);
  const finishedCapW = (meas.bicep / 4) * style.sleeveWideF * 2;
  assert.ok(Math.abs(sleeveCapWidth(built) - computeGatherWidth(finishedCapW, 1.6)) < 1e-9);
});

test('sleeve cap: sleevePleatCount widens it via computePleats and records discrete pleat positions', () => {
  const style = { ...AIGen.deriveStyle('short sleeve top', 'en'), type: 'top', sleeveLenF: 1, sleevePleatCount: 3 };
  const built = AIGen.build(style, meas);
  const finishedCapW = (meas.bicep / 4) * style.sleeveWideF * 2;
  const sleeve = built.pieces.find((p) => p.name.en === 'Sleeve');
  assert.ok(sleeve.pleats && sleeve.pleats.length === 3);
  assert.ok(sleeveCapWidth(built) > finishedCapW);
});

test('buildRomper sleeve honors the same gather/pleat/tuck technique as buildTop (shared sleevePiece helper)', () => {
  const style = { ...AIGen.deriveStyle({ metrics: null, prompt: 'romper', category: 'women', imageDataURL: null }), sleeveLenF: 1.0, sleeveGatherRatio: 1.5 };
  const built = AIGen.build(style, meas);
  const finishedCapW = (meas.bicep / 4) * style.sleeveWideF * 2;
  assert.ok(Math.abs(sleeveCapWidth(built) - computeGatherWidth(finishedCapW, 1.5)) < 1e-9);
});
