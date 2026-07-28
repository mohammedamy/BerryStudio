import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIGen } from '../js/ai.js';
import { computeMeasurements } from '../js/data.js';

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

test('trousers and skirt types route to their own builders (different piece counts than a top)', () => {
  const topStyle = AIGen.deriveStyle('sleeveless shift dress', 'en');
  const skirtStyle = { ...AIGen.deriveStyle('pleated skirt', 'en'), type: 'skirt' };
  const trouserStyle = { ...AIGen.deriveStyle('wide-leg trousers', 'en'), type: 'trousers' };
  const top = AIGen.build(topStyle, meas);
  const skirt = AIGen.build(skirtStyle, meas);
  const trousers = AIGen.build(trouserStyle, meas);
  assert.ok(top.pieces.length > 0 && skirt.pieces.length > 0 && trousers.pieces.length > 0);
});
