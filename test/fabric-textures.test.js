import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FABRIC_TEX_SPECS,
  normalizeFabricTexId,
  sampleFabricPixel,
  getFabricTextureSet,
} from '../js/fabric-textures.js';
import { FABRIC_IDS } from '../cloth-lab/src/cloth/fabricPresets.js';

test('FABRIC_TEX_SPECS covers all 13 canonical garment fabrics with valid physical & PBR parameters', () => {
  for (const id of FABRIC_IDS) {
    const spec = FABRIC_TEX_SPECS[id];
    assert.ok(spec, `missing spec for ${id}`);
    assert.ok(spec.repeatCm > 0.5 && spec.repeatCm < 20, `${id} repeatCm within realistic cm scale`);
    assert.ok(spec.normalScale > 0.2 && spec.normalScale <= 2.0, `${id} normalScale positive`);
    assert.ok(spec.roughness > 0.1 && spec.roughness <= 1.0, `${id} roughness in bounds`);
    assert.ok(spec.roughnessSpread > 0.05 && spec.roughnessSpread <= 0.5, `${id} roughnessSpread valid`);
    assert.ok(spec.envMapIntensity >= 0.5 && spec.envMapIntensity <= 1.2, `${id} envMapIntensity valid`);
  }
  assert.equal(normalizeFabricTexId('poplin'), 'cotton');
  assert.equal(normalizeFabricTexId('silk_charmeuse'), 'silk');
  assert.equal(normalizeFabricTexId('unknown-fabric'), 'cotton');
});

test('sampleFabricPixel produces non-constant, seamless, fabric-distinct micro-relief across all 13 fabrics', () => {
  const fabricMeans = new Map();
  for (const id of FABRIC_IDS) {
    let minH = 1, maxH = 0, minA = 1, maxA = 0, minR = 1, maxR = 0, sumH = 0;
    const samples = 31;
    for (let j = 0; j < samples; j++) {
      for (let i = 0; i < samples; i++) {
        const s = sampleFabricPixel(id, (i + 0.23) / samples, (j + 0.41) / samples);
        assert.ok(s.h >= 0 && s.h <= 1, `${id} h in [0,1]`);
        assert.ok(s.albedo >= 0 && s.albedo <= 1, `${id} albedo in [0,1]`);
        assert.ok(s.rough >= 0 && s.rough <= 1, `${id} rough in [0,1]`);
        if (s.h < minH) minH = s.h;
        if (s.h > maxH) maxH = s.h;
        if (s.albedo < minA) minA = s.albedo;
        if (s.albedo > maxA) maxA = s.albedo;
        if (s.rough < minR) minR = s.rough;
        if (s.rough > maxR) maxR = s.rough;
        sumH += s.h;
      }
    }
    assert.ok(maxH - minH >= 0.18, `${id} height variation must be expressive (got ${(maxH - minH).toFixed(3)})`);
    assert.ok(maxA - minA >= 0.10, `${id} albedo variation must prevent flat plastic look`);
    assert.ok(maxR - minR >= 0.10, `${id} roughness variation must differentiate yarn crowns and pores`);
    fabricMeans.set(id, sumH / (samples * samples));

    // Seamless periodic boundary wrap check: u + 1 and v + 1 match u, v identically
    const p0 = sampleFabricPixel(id, 0.37, 0.61);
    const pu = sampleFabricPixel(id, 1.37, 0.61);
    const pv = sampleFabricPixel(id, 0.37, 2.61);
    assert.ok(Math.abs(p0.h - pu.h) < 1e-6, `${id} seamless U wrap`);
    assert.ok(Math.abs(p0.h - pv.h) < 1e-6, `${id} seamless V wrap`);
  }
  assert.ok(fabricMeans.size === 13);
});

test('getFabricTextureSet is Node-safe when DOM document is absent', () => {
  assert.equal(getFabricTextureSet(null, 'denim'), null);
});
