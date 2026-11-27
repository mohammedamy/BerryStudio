import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rgbaToOnnxCHW224, mapOnnx12dToStyle, PHOTO2PATTERN_INPUT_SIZE } from '../js/photo2pattern.js';
import { PATTERNS, LIBRARY, computeMeasurements } from '../js/data.js';
import { offsetPoly } from '../js/geometry.js';
import { PatternValidator } from '../js/validate.js';
import '../js/colab-patterns.js';

test('rgbaToOnnxCHW224 produces a finite [1, 3, 224, 224] ImageNet-normalized Float32Array', () => {
  const srcW = 64, srcH = 48;
  const rgba = new Uint8ClampedArray(srcW * srcH * 4).fill(180);
  const chw = rgbaToOnnxCHW224(rgba, srcW, srcH);
  assert.ok(chw instanceof Float32Array);
  assert.equal(chw.length, 3 * PHOTO2PATTERN_INPUT_SIZE * PHOTO2PATTERN_INPUT_SIZE);
  for (let i = 0; i < chw.length; i += 257) {
    assert.ok(Number.isFinite(chw[i]));
  }
  const expectedR = ((180 / 255) - 0.485) / 0.229;
  assert.ok(Math.abs(chw[0] - expectedR) < 1e-4);
});

test('mapOnnx12dToStyle maps and clamps 12-D ONNX predictions into safe AIGen.build ranges', () => {
  const sample12d = [0.65, 0.72, 0.60, 0.45, 0.85, 0.70, 0.50, 0.80, 0.05, 0.20, 0.60, 0.35];
  const { style, provenance } = mapOnnx12dToStyle(sample12d, { color: '#ff5d8f' });
  assert.equal(style.type, 'dress');
  assert.equal(style.color, '#ff5d8f');
  assert.ok(style.lengthF >= 0.55 && style.lengthF <= 1.60);
  assert.ok(style.flareF >= 0.82 && style.flareF <= 1.90);
  assert.ok(style.fitF >= 0.80 && style.fitF <= 1.25);
  assert.ok(style.sleeveLenF >= 0.25 && style.sleeveLenF <= 1.50);
  assert.ok(style.sleeveWideF >= 0.80 && style.sleeveWideF <= 1.80);
  assert.equal(provenance.type.source, 'vision');

  // Extreme out-of-range inputs stay strictly clamped and sleeveless turns off sleeveLenF
  const extreme12d = [0.1, 2.0, -0.5, 5.0, 0.1, 0.9, 2.0, 0.1, 0.1, 0.8, 0.2, 0.1];
  const { style: clamped } = mapOnnx12dToStyle(extreme12d);
  assert.equal(clamped.type, 'shirt');
  assert.equal(clamped.lengthF, 1.60);
  assert.equal(clamped.flareF, 0.82);
  assert.equal(clamped.fitF, 1.25);
  assert.equal(clamped.sleeveLenF, 0);
  assert.equal(clamped.sleeveWideF, 1.0);
});

test('colab-patterns.js registers Zenodo/GarmentCode patterns that pass closedOutline and grainline across XXS, M, and 6XL', () => {
  const colabIds = Object.keys(PATTERNS).filter((id) => id.startsWith('zc_'));
  assert.ok(colabIds.length >= 50, `expected >=50 colab patterns, found ${colabIds.length}`);
  assert.ok(LIBRARY.some((item) => item.id === 'zc_001'));

  for (const standard of ['saudi', 'intl']) {
    for (const size of ['XXS', 'M', '6XL']) {
      const m = computeMeasurements({ category: 'women', size, standard });
      for (const id of colabIds) {
        const pieces = PATTERNS[id].pieces(m);
        assert.ok(pieces.length >= 2, `${id} should produce at least 2 pieces`);
        const report = PatternValidator.run(pieces, { seamAllowanceCm: 1, offsetPoly, bodyChestCm: m.chest });
        for (const pc of report.perPiece) {
          assert.equal(pc.checks.closedOutline.status, 'pass', `${id} (${standard}/${size}) ${pc.label} closedOutline`);
          assert.equal(pc.checks.grainline.status, 'pass', `${id} (${standard}/${size}) ${pc.label} grainline`);
        }
      }
    }
  }
});
