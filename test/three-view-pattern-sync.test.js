import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, computeMeasurements } from '../js/data.js';
import '../js/library.js';
import '../js/underwear-library.js';
import '../js/reference-patterns.js';

const PALETTE = ['#4f46e5', '#db2777', '#059669', '#d97706', '#2563eb', '#7c3aed'];
import {
  classifyPiecePart,
  resolvePartsFabric3D,
  computePatternMetrics3D,
} from '../js/pattern-3d-metrics.js';

function parseHex(c) {
  if (typeof c === 'number') return c;
  if (!c) return 0x6d5efc;
  const s = String(c).trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).split('').map((x) => x + x).join('') : s.slice(1);
    return parseInt(h, 16);
  }
  return 0x6d5efc;
}

function buildPiecesFor(id, size = 'M') {
  const pat = PATTERNS[id];
  assert.ok(pat, `Pattern ${id} must exist`);
  const isKids = pat.category === 'girls' || pat.category === 'boys';
  const m = computeMeasurements({
    category: pat.category,
    size,
    standard: 'intl',
    kids: isKids ? '8-9' : undefined,
  });
  const pieces = pat.pieces(m).map((p, idx) => ({
    ...p,
    color: PALETTE[idx % PALETTE.length],
    customColor: false,
    visible: true,
  }));
  return { pat, m, pieces };
}

test('classifyPiecePart: routes lower-body trims (waistband, pocket, gusset, fly) without spawning phantom bodices', () => {
  // Boys' Chino Trousers includes front/back leg + waistband + pocket:
  // ZERO pieces may classify as 'bodice'!
  const { pat: boysPat, pieces: boysPieces } = buildPiecesFor('boys_trousers');
  for (const p of boysPieces) {
    const part = classifyPiecePart(p, boysPieces, boysPat.category);
    assert.equal(
      part,
      'trousers',
      `boys_trousers piece "${p.key}" must route to trousers, got "${part}"`
    );
  }

  // Women's briefs (wu01) includes front/back brief + gusset: all route to 'trousers'
  if (PATTERNS.wu01) {
    const { pat: wuPat, pieces: wuPieces } = buildPiecesFor('wu01');
    for (const p of wuPieces) {
      const part = classifyPiecePart(p, wuPieces, wuPat.category);
      assert.equal(
        part,
        'trousers',
        `wu01 piece "${p.key}" must route to trousers, got "${part}"`
      );
    }
  }

  // Skirt with waistband routes waistband to 'skirt', never 'bodice'
  const { pat: skPat, pieces: skPieces } = buildPiecesFor('ref_w_skirt');
  for (const p of skPieces) {
    const part = classifyPiecePart(p, skPieces, skPat.category);
    assert.equal(
      part,
      'skirt',
      `ref_w_skirt piece "${p.key}" must route to skirt, got "${part}"`
    );
  }

  // Men's shirt cuffs route to 'sleeve' when sleeves exist
  const { pat: shirtPat, pieces: shirtPieces } = buildPiecesFor('mens_shirt');
  const cuffPiece = shirtPieces.find((p) => /cuff/i.test(p.key || p.name?.en || ''));
  assert.ok(cuffPiece, 'mens_shirt should include a cuff piece');
  assert.equal(classifyPiecePart(cuffPiece, shirtPieces, shirtPat.category), 'sleeve');
});

test('resolvePartsFabric3D: unifies default 2D PALETTE rainbow into a single cohesive 3D color unless customColor is set', () => {
  const { pat, pieces } = buildPiecesFor('womens_dress');

  // By default, 2D drafting assigns distinct PALETTE colors per piece (customColor = false)
  const partsDefault = resolvePartsFabric3D(pieces, {
    category: pat.category,
    defaultColor: 0x6d5efc,
    defaultMaterial: 'satin',
    colorToInt: parseHex,
  });

  const expectedUnified = parseHex(pieces[0].color);
  assert.equal(partsDefault.bodice.front.color, expectedUnified, 'bodice front uses unified color');
  assert.equal(partsDefault.sleeve.front.color, expectedUnified, 'sleeve uses unified color (not rainbow PALETTE[2])');
  assert.equal(partsDefault.skirt.front.color, expectedUnified, 'skirt uses unified color (not rainbow PALETTE[3])');
  assert.equal(partsDefault.bodice.back, undefined, 'bodice back omits duplicate descriptor when identical to front');

  // When user explicitly custom-colors the skirt (customColor = true), contrast is preserved
  const skirtIdx = pieces.findIndex((p) => classifyPiecePart(p, pieces, pat.category) === 'skirt');
  pieces[skirtIdx].color = '#b91c1c';
  pieces[skirtIdx].customColor = true;

  const partsContrast = resolvePartsFabric3D(pieces, {
    category: pat.category,
    defaultColor: 0x6d5efc,
    defaultMaterial: 'satin',
    colorToInt: parseHex,
  });
  assert.equal(partsContrast.skirt.front.color, 0xb91c1c, 'explicit customColor on skirt is honored');
});

test('computePatternMetrics3D: differentiates garment silhouettes across catalog families', () => {
  const dress = buildPiecesFor('womens_dress');
  const mDress = computePatternMetrics3D(dress.pieces, dress.m, 'women', dress.pat);
  assert.equal(mDress.bodice.style, 'waist', 'dress bodice with separate skirt terminates cleanly at waist');
  assert.ok(mDress.skirt.flare > 1.25, 'fit & flare dress has flared skirt');

  const abaya = buildPiecesFor('abaya');
  const mAbaya = computePatternMetrics3D(abaya.pieces, abaya.m, 'women', abaya.pat);
  assert.equal(mAbaya.bodice.style, 'robe', 'abaya builds full-length flowing robe');

  const thobe = buildPiecesFor('thobe');
  const mThobe = computePatternMetrics3D(thobe.pieces, thobe.m, 'men', thobe.pat);
  assert.equal(mThobe.bodice.style, 'robe', 'thobe builds full-length robe');
  assert.equal(mThobe.bodice.hasCollar, true, 'thobe includes standing collar');

  const shirt = buildPiecesFor('mens_shirt');
  const mShirt = computePatternMetrics3D(shirt.pieces, shirt.m, 'men', shirt.pat);
  assert.equal(mShirt.bodice.hasCollar, true, 'mens_shirt includes collar');
  assert.ok(mShirt.sleeve.lengthFrac > 0.75, 'mens_shirt has full-length sleeves');

  const trousers = buildPiecesFor('boys_trousers');
  const mTrousers = computePatternMetrics3D(trousers.pieces, trousers.m, 'boys', trousers.pat);
  assert.ok(mTrousers.trousers.inseamFrac > 0.78, `boys_trousers must be full-length (${mTrousers.trousers.inseamFrac}), not knee shorts`);

  const shorts = buildPiecesFor('ref_b_shorts');
  const mShorts = computePatternMetrics3D(shorts.pieces, shorts.m, 'boys', shorts.pat);
  assert.ok(mShorts.trousers.inseamFrac < 0.55, `ref_b_shorts must render short inseam (${mShorts.trousers.inseamFrac})`);
  assert.ok(mTrousers.trousers.inseamFrac > mShorts.trousers.inseamFrac + 0.25, 'full trousers are longer than shorts');
});

test('computePatternMetrics3D: sleeve length metric is 100% invariant to 2D Canvas.layoutPieces translation', () => {
  const { pat, m, pieces } = buildPiecesFor('womens_dress');
  const rawMetrics = computePatternMetrics3D(pieces, m, 'women', pat);

  // Simulate Canvas.layoutPieces shifting every piece into positive 2D workspace coordinates
  const shiftedPieces = pieces.map((p, idx) => ({
    ...p,
    outline: p.outline.map(([x, y]) => [x + 35 + idx * 40, y + 48]),
  }));
  const shiftedMetrics = computePatternMetrics3D(shiftedPieces, m, 'women', pat);

  assert.ok(
    Math.abs(rawMetrics.sleeve.lengthFrac - shiftedMetrics.sleeve.lengthFrac) < 1e-6,
    `sleeve.lengthFrac must be translation-invariant (${rawMetrics.sleeve.lengthFrac} vs ${shiftedMetrics.sleeve.lengthFrac})`
  );
  assert.equal(rawMetrics.sleeve.style, shiftedMetrics.sleeve.style);
  assert.ok(Math.abs(rawMetrics.skirt.lengthCm - shiftedMetrics.skirt.lengthCm) < 1e-6);
});

test('computePatternMetrics3D: responds monotonically to XS vs XXXXL grading and Mini vs Maxi skirt lengths', () => {
  const xs = buildPiecesFor('womens_dress', 'XS');
  const xxxxl = buildPiecesFor('womens_dress', 'XXXXL');
  const mXS = computePatternMetrics3D(xs.pieces, xs.m, 'women', xs.pat);
  const m4XL = computePatternMetrics3D(xxxxl.pieces, xxxxl.m, 'women', xxxxl.pat);

  assert.ok(xxxxl.m.chest > xs.m.chest + 20, 'XXXXL chest exceeds XS chest');
  assert.ok(xxxxl.m.hips > xs.m.hips + 20, 'XXXXL hips exceed XS hips');
  assert.ok(m4XL.skirt.lengthCm >= mXS.skirt.lengthCm, 'XXXXL skirt length >= XS skirt length');

  // Mini vs Maxi custom skirt outlines
  const baseMeas = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  const miniSkirt = [{
    key: 'mini_skirt',
    role: 'skirt-front-gore',
    name: { en: 'Mini Skirt Front', ar: 'تنورة قصيرة' },
    outline: [[0, 0], [22, 0], [27, 36], [0, 36]],
    visible: true,
  }];
  const maxiSkirt = [{
    key: 'maxi_skirt',
    role: 'skirt-front-gore',
    name: { en: 'Maxi Pleated Skirt Front', ar: 'تنورة طويلة بكسرات' },
    outline: [[0, 0], [22, 0], [42, 96], [0, 96]],
    visible: true,
  }];

  const mMini = computePatternMetrics3D(miniSkirt, baseMeas, 'women');
  const mMaxi = computePatternMetrics3D(maxiSkirt, baseMeas, 'women');
  assert.ok(mMaxi.skirt.lengthCm > mMini.skirt.lengthCm + 45, 'Maxi skirt renders substantially longer than Mini skirt');
  assert.ok(mMaxi.skirt.flare > mMini.skirt.flare, 'Flared pleated maxi skirt has wider flare than slight A-line mini');
  assert.ok(mMaxi.skirt.pleats > mMini.skirt.pleats, 'Pleated maxi skirt generates 3D pleats');
});
