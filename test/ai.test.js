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
