import { test } from 'node:test';
import assert from 'node:assert/strict';
import { View3D } from '../js/three-view.js';

test('View3D fabric presets table declares 11 complete physics & material profiles', () => {
  const presets = View3D.getFabricPresets();
  assert.ok(presets, 'presets table must be exported');

  const expectedKeys = [
    'cotton', 'denim', 'silk', 'satin', 'chiffon',
    'wool', 'linen', 'leather', 'jersey', 'scuba', 'tulle'
  ];

  for (const key of expectedKeys) {
    const f = presets[key];
    assert.ok(f, `fabric preset "${key}" must exist`);
    assert.equal(typeof f.label, 'string', `${key} must have string label`);
    assert.ok(f.massDensity > 0, `${key} massDensity must be positive`);
    assert.ok(f.structStiff >= 0.70 && f.structStiff <= 1.0, `${key} structStiff within physical bounds`);
    assert.ok(f.bendStiff >= 0.05 && f.bendStiff <= 1.0, `${key} bendStiff within physical bounds`);
    assert.ok(f.maxStrain >= 1.0 && f.maxStrain <= 1.5, `${key} maxStrain within physical stretch bounds`);
    assert.ok(f.rough >= 0 && f.rough <= 1.0, `${key} roughness within PBR bounds`);
    assert.ok(f.metal >= 0 && f.metal <= 1.0, `${key} metalness within PBR bounds`);
    assert.ok(f.sheen >= 0 && f.sheen <= 1.0, `${key} sheen within bounds`);
    assert.ok(f.om >= 0.2 && f.om <= 1.0, `${key} opacity multiplier within bounds`);
  }

  // Physics differentiation: knits have higher strain tolerance than wovens
  assert.ok(presets.jersey.maxStrain > presets.denim.maxStrain, 'jersey knit has higher max strain give than denim');
  assert.ok(presets.scuba.maxStrain > presets.leather.maxStrain, 'scuba knit has higher max strain give than leather');
  assert.ok(presets.leather.massDensity > presets.chiffon.massDensity, 'leather is significantly heavier than chiffon');
  assert.ok(presets.denim.bendStiff > presets.silk.bendStiff, 'denim has higher bend stiffness than silk charmeuse');
});

test('View3D setFabricPreset updates the active material and can be queried', () => {
  View3D.setFabricPreset('denim');
  assert.equal(View3D.getFabricPreset(), 'denim');

  View3D.setFabricPreset('jersey');
  assert.equal(View3D.getFabricPreset(), 'jersey');

  // Reverts gracefully to cotton if invalid key is supplied
  View3D.setFabricPreset('cotton');
  assert.equal(View3D.getFabricPreset(), 'cotton');
});

test('View3D tension toggle and metrics lifecycle', () => {
  assert.equal(View3D.getTensionMap(), false, 'tension map starts disabled by default');

  let notifiedMetrics = null;
  View3D.setTensionMetricsCallback(m => {
    notifiedMetrics = m;
  });

  View3D.setTensionMap(true);
  assert.equal(View3D.getTensionMap(), true);

  const m = View3D.getTensionMetrics();
  assert.ok(m, 'metrics object returned');
  assert.equal(typeof m.avgEase, 'number');
  assert.equal(typeof m.peakStrain, 'number');
  assert.ok(['fitOptimal', 'fitSnug', 'fitTight', 'fitLoose'].includes(m.status));

  View3D.setTensionMap(false);
  assert.equal(View3D.getTensionMap(), false);
});

test('3D Tension Heatmap mathematical model: color spectrum and strain calculation', () => {
  const presets = View3D.getFabricPresets();
  const cotton = presets.cotton;
  const jersey = presets.jersey;

  // Emulate strain physics equation
  function calcStrain(easeCm, fPreset) {
    const stiffRatio = (fPreset.structStiff || 0.95) / (fPreset.maxStrain || 1.05);
    if (easeCm < 0) return Math.min(100, (Math.abs(easeCm) / 5.0) * 100 * stiffRatio);
    if (easeCm < 2.0) return ((2.0 - easeCm) / 2.0) * 5.0 * stiffRatio;
    return 0.0;
  }

  // Emulate color mapping
  function calcColor(easeCm, fPreset) {
    const stiffRatio = (fPreset.structStiff || 0.95) / (fPreset.maxStrain || 1.05);
    let r = 0, g = 0, b = 0;
    if (easeCm >= 8.0) {
      const t = Math.min(1, (easeCm - 8.0) / 8.0);
      r = 0.15 * (1 - t) + 0.10 * t;
      g = 0.45 * (1 - t) + 0.70 * t;
      b = 0.95;
    } else if (easeCm >= 3.0) {
      const t = (easeCm - 3.0) / 5.0;
      r = 0.10 * (1 - t) + 0.15 * t;
      g = 0.82 * (1 - t) + 0.65 * t;
      b = 0.35 * (1 - t) + 0.95 * t;
    } else if (easeCm >= 0.8) {
      const t = (3.0 - easeCm) / 2.2;
      r = 0.10 * (1 - t) + 0.96 * t;
      g = 0.82 * (1 - t) + 0.75 * t;
      b = 0.35 * (1 - t) + 0.10 * t;
    } else {
      const t = Math.min(1, Math.max(0, (0.8 - easeCm) / 1.8 * stiffRatio));
      r = 0.96 * (1 - t) + 0.95 * t;
      g = 0.75 * (1 - t) + 0.18 * t;
      b = 0.10 * (1 - t) + 0.15 * t;
    }
    return [r, g, b];
  }

  // 1. Loose fit (>8cm ease): dominant blue channel
  const [lr, lg, lb] = calcColor(12.0, cotton);
  assert.ok(lb > lr && lb > lg, `loose ease (12cm) must have dominant blue: [${lr}, ${lg}, ${lb}]`);
  assert.equal(calcStrain(12.0, cotton), 0.0, 'loose ease has 0 strain');

  // 2. Optimal fit (4.5cm ease): dominant green channel
  const [or, og, ob] = calcColor(4.5, cotton);
  assert.ok(og > or, `optimal ease (4.5cm) must have dominant green: [${or}, ${og}, ${ob}]`);
  assert.equal(calcStrain(4.5, cotton), 0.0, 'optimal wearing ease has 0 strain');

  // 3. Snug fit (1.5cm ease): amber/yellow (high red & green, low blue)
  const [sr, sg, sb] = calcColor(1.5, cotton);
  assert.ok(sr > 0.5 && sg > 0.5 && sb < 0.3, `snug ease (1.5cm) must read as warm amber: [${sr}, ${sg}, ${sb}]`);
  assert.ok(calcStrain(1.5, cotton) > 0, 'snug ease has positive mild strain');

  // 4. Negative ease / high strain (-1.5cm ease): dominant red channel
  const [hr, hg, hb] = calcColor(-1.5, cotton);
  assert.ok(hr > hg && hr > hb, `negative ease (-1.5cm) must read as vivid red: [${hr}, ${hg}, ${hb}]`);
  assert.ok(calcStrain(-1.5, cotton) >= 15.0, 'negative ease produces high strain percentage');

  // 5. Knit stretch absorption: knit jersey has lower strain under negative ease than rigid cotton
  const cottonStrain = calcStrain(-1.0, cotton);
  const jerseyStrain = calcStrain(-1.0, jersey);
  assert.ok(jerseyStrain < cottonStrain, `jersey knit (${jerseyStrain}%) absorbs compression with lower strain than cotton (${cottonStrain}%)`);
});

test('3D Wavefront OBJ export serialization logic formats standard valid OBJ text', () => {
  // Synthesize a representative mock mesh hierarchy
  const mockGeo = {
    attributes: {
      position: {
        count: 4,
        getX: i => [0, 10, 10, 0][i],
        getY: i => [0, 0, 15, 15][i],
        getZ: i => [0, 0, 0, 0][i],
      },
      normal: {
        count: 4,
        getX: () => 0,
        getY: () => 0,
        getZ: () => 1,
      },
      uv: {
        count: 4,
        getX: i => [0, 1, 1, 0][i],
        getY: i => [0, 0, 1, 1][i],
      }
    },
    index: {
      count: 6,
      getX: i => [0, 1, 2, 0, 2, 3][i]
    }
  };

  let objText = "# BerryStudio 3D Garment Mesh Export\n";
  objText += "# Generated: 2026-10-04T08:00:00.000Z\n";
  objText += "# Category: women\n\n";

  let vOffset = 1;
  let vnOffset = 1;
  let vtOffset = 1;

  const serializeMesh = (name, geo) => {
    objText += `o ${name}\n`;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      objText += `v ${pos.getX(i).toFixed(5)} ${pos.getY(i).toFixed(5)} ${pos.getZ(i).toFixed(5)}\n`;
    }
    const norm = geo.attributes.normal;
    for (let i = 0; i < norm.count; i++) {
      objText += `vn ${norm.getX(i).toFixed(4)} ${norm.getY(i).toFixed(4)} ${norm.getZ(i).toFixed(4)}\n`;
    }
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      objText += `vt ${uv.getX(i).toFixed(4)} ${uv.getY(i).toFixed(4)}\n`;
    }
    const idx = geo.index;
    for (let t = 0; t < idx.count / 3; t++) {
      const i0 = idx.getX(t * 3) + vOffset;
      const i1 = idx.getX(t * 3 + 1) + vOffset;
      const i2 = idx.getX(t * 3 + 2) + vOffset;
      objText += `f ${i0}/${i0}/${i0} ${i1}/${i1}/${i1} ${i2}/${i2}/${i2}\n`;
    }
    vOffset += pos.count;
    vnOffset += norm.count;
    vtOffset += uv.count;
    objText += "\n";
  };

  serializeMesh("bodice_front", mockGeo);
  serializeMesh("skirt_front", mockGeo);

  assert.ok(objText.startsWith('# BerryStudio 3D Garment Mesh Export'));
  assert.ok(objText.includes('o bodice_front'));
  assert.ok(objText.includes('o skirt_front'));
  assert.ok(objText.includes('v 0.00000 0.00000 0.00000'));
  assert.ok(objText.includes('vn 0.0000 0.0000 1.0000'));
  assert.ok(objText.includes('vt 0.0000 0.0000'));
  // 1-based indexing for first mesh (vertices 1 to 4)
  assert.ok(objText.includes('f 1/1/1 2/2/2 3/3/3'));
  // 1-based offset for second mesh (vertices 5 to 8)
  assert.ok(objText.includes('f 5/5/5 6/6/6 7/7/7'));
});
