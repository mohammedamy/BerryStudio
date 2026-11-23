import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../js/library.js';
import '../js/girls-leotards.js';
import '../js/fancy-patterns.js';
import '../js/underwear-library.js';
import '../js/reference-patterns.js';
import '../js/abaya-collection.js';
import { PATTERNS, computeMeasurements } from '../js/data.js';
import { getPatternLookbookStyle } from '../js/pattern-lookbook-styles.js';
import { computePatternMetrics3D } from '../js/pattern-3d-metrics.js';

function getMetrics(id) {
  const pat = PATTERNS[id];
  assert.ok(pat, `Pattern ${id} must exist`);
  const isKid = pat.category === 'girls' || pat.category === 'boys';
  const m = computeMeasurements({
    category: pat.category,
    size: 'M',
    standard: 'intl',
    kids: isKid ? '8-9' : undefined,
  });
  const pieces = pat.pieces(m);
  const lb = getPatternLookbookStyle(id, pat, pieces);
  return computePatternMetrics3D(pieces, m, pat.category, pat, lb);
}

test('computePatternMetrics3D assigns second-skin fitTier to bodycon, leggings, leotards, bras, and briefs', () => {
  const w11 = getMetrics('w11');
  assert.equal(w11.bodice.fitTier, 'second-skin');
  assert.equal(w11.sleeve.fitTier, 'second-skin');
  assert.equal(w11.skirt.pleats, 0);

  const g11 = getMetrics('g11');
  assert.equal(g11.trousers.fitTier, 'second-skin');

  for (const id of ['gy001', 'gy050', 'gy100']) {
    const leo = getMetrics(id);
    assert.equal(leo.bodice.fitTier, 'second-skin', `${id} bodice should be second-skin`);
    assert.equal(leo.sleeve.fitTier, 'second-skin', `${id} sleeve should be second-skin`);
  }

  const wb09 = getMetrics('wb09');
  assert.equal(wb09.bodice.fitTier, 'second-skin');

  const wu01 = getMetrics('wu01');
  assert.equal(wu01.trousers.fitTier, 'second-skin');
});

test('computePatternMetrics3D assigns fitted fitTier to slim, pencil, and close-fitting knit models', () => {
  const w07 = getMetrics('w07');
  assert.equal(w07.skirt.fitTier, 'fitted');

  for (const id of ['m10', 'ref_m_tee', 'm09', 'b05']) {
    const pm = getMetrics(id);
    assert.equal(pm.bodice.fitTier, 'fitted', `${id} bodice should be fitted`);
  }

  for (const id of ['m02', 'b12']) {
    const pm = getMetrics(id);
    assert.equal(pm.trousers.fitTier, 'fitted', `${id} trousers should be fitted`);
  }
});

test('computePatternMetrics3D keeps loose and relaxed garments out of second-skin/fitted tiers', () => {
  for (const id of ['abaya', 'thobe', 'w08', 'w22', 'b06', 'b08']) {
    const pm = getMetrics(id);
    assert.notEqual(pm.bodice.fitTier, 'second-skin', `${id} bodice must not be second-skin`);
    assert.notEqual(pm.bodice.fitTier, 'fitted', `${id} bodice must not be fitted`);
  }
  const w06 = getMetrics('w06');
  assert.equal(w06.trousers.fitTier, 'loose');
});
