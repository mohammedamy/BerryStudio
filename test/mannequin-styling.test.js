import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../cloth-lab/node_modules/three/build/three.module.js';
import { computeMeasurements } from '../js/data.js';
import { getMannequinFor } from '../js/mannequin-catalog.js';
import {
  HAIR_TYPES,
  HAIR_COLOR_PRESETS,
  HAIRCUT_CATALOG,
  HEADWEAR_CATALOG,
  HEADWEAR_COLOR_PRESETS,
  getHaircutsForCategory,
  getHeadwearForCategory,
  getHeadwearSpec,
  resolveMannequinStyling,
} from '../js/mannequin-styling.js';
import { buildHumanMannequin } from '../js/human-mannequin.js';

function assertGroupGeometryFinite(group, label) {
  let meshCount = 0;
  let totalVerts = 0;
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    meshCount++;
    const pos = obj.geometry.attributes?.position;
    assert.ok(pos && pos.count > 0, `${label}: mesh ${obj.name || 'unnamed'} must have positions`);
    totalVerts += pos.count;
    for (let i = 0; i < pos.count; i++) {
      assert.ok(
        Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)),
        `${label}: vertex ${i} must be finite`
      );
    }
  });
  return { meshCount, totalVerts };
}

test('Mannequin Styling Catalog: complete EN/AR parity and category filtering', () => {
  assert.ok(HAIR_TYPES.length >= 5);
  assert.ok(HAIR_COLOR_PRESETS.length >= 10);
  assert.ok(HEADWEAR_COLOR_PRESETS.length >= 10);

  for (const ht of HAIR_TYPES) {
    assert.ok(ht.label.en && ht.label.ar, `hairType ${ht.id} must have EN & AR labels`);
  }
  for (const sw of HAIR_COLOR_PRESETS) {
    assert.match(sw.hex, /^#[0-9a-f]{6}$/i);
    assert.ok(sw.label.en && sw.label.ar);
  }
  for (const sw of HEADWEAR_COLOR_PRESETS) {
    assert.match(sw.hex, /^#[0-9a-f]{6}$/i);
    assert.ok(sw.label.en && sw.label.ar);
  }
  for (const hw of HEADWEAR_CATALOG) {
    assert.ok(hw.label.en && hw.label.ar, `headwear ${hw.id} must have EN & AR labels`);
  }

  for (const cat of ['women', 'girls', 'men', 'boys']) {
    const cuts = getHaircutsForCategory(cat);
    assert.ok(cuts.some((c) => c.id === 'bald'), `${cat} must include bald/clean shave option`);
    assert.equal(HAIRCUT_CATALOG[cat].length, cuts.length);

    const hws = getHeadwearForCategory(cat);
    assert.equal(hws[0].id, 'none', `${cat} headwear starts with none`);
    if (cat === 'women' || cat === 'girls') {
      for (const expectedId of ['hijab_classic', 'hijab_turkish', 'hijab_turban', 'hijab_shayla', 'hijab_khimar', 'hijab_niqab', 'hijab_sport', 'sun_hat', 'beret', 'beanie']) {
        assert.ok(hws.some((h) => h.id === expectedId), `${cat} includes ${expectedId}`);
      }
      assert.equal(hws.some((h) => h.id === 'ghutra_iqal'), false, `${cat} excludes men headwear`);
    } else {
      for (const expectedId of ['ghutra_iqal', 'shemagh_iqal', 'shemagh_black_iqal', 'ghutra_hamdaniyah', 'taqiyah', 'shawl_wrap', 'fedora', 'baseball_cap', 'beret', 'beanie']) {
        assert.ok(hws.some((h) => h.id === expectedId), `${cat} includes ${expectedId}`);
      }
      assert.equal(hws.some((h) => h.id === 'hijab_classic'), false, `${cat} excludes women hijab`);
    }
  }
});

test('resolveMannequinStyling: validates category headwear & override merging', () => {
  const womenM = getMannequinFor('women', 'M');
  const menM = getMannequinFor('men', 'M');

  const womenStyled = resolveMannequinStyling('women', womenM, {
    hairStyle: 'long_wavy',
    hairType: 'curly',
    hairColor: '#b88b4a',
    headwear: 'hijab_turkish',
    headwearColor: '#1f513f',
  });
  assert.equal(womenStyled.hairStyle, 'long_wavy');
  assert.equal(womenStyled.hairType, 'curly');
  assert.equal(womenStyled.hairHex, '#b88b4a');
  assert.equal(womenStyled.headwear, 'hijab_turkish');
  assert.equal(womenStyled.headwearHex, '#1f513f');
  assert.equal(womenStyled.hasOverrides, true);

  // Attempting to pass hijab to a male mannequin resets headwear cleanly to 'none'
  const menMismatch = resolveMannequinStyling('men', menM, { headwear: 'hijab_niqab' });
  assert.equal(menMismatch.headwear, 'none');

  const menShemagh = resolveMannequinStyling('men', menM, { headwear: 'shemagh_iqal' });
  assert.equal(menShemagh.headwear, 'shemagh_iqal');
  assert.equal(menShemagh.headwearHex, '#b8232c');
});

test('3D Hair Customization: all 5 hair types, new cuts, and bald option build valid finite meshes across sizes', () => {
  const mWomenXS = computeMeasurements({ category: 'women', size: 'XS', standard: 'intl' });
  const mMen4XL = computeMeasurements({ category: 'men', size: 'XXXXL', standard: 'intl' });

  for (const hairType of HAIR_TYPES.map((t) => t.id)) {
    const built = buildHumanMannequin(THREE, 'women', mWomenXS, {
      hairStyle: 'long_wavy',
      hairType,
      hairColor: '#b88b4a',
      pose: 'standing',
    });
    const hairGroup = built.headGroup.getObjectByName('hairGroup');
    assert.ok(hairGroup, `hairGroup exists for hairType=${hairType}`);
    const stats = assertGroupGeometryFinite(hairGroup, `women long_wavy ${hairType}`);
    assert.ok(stats.meshCount >= 2, `${hairType}: expected flowing back curtain + shoulder locks + cranial shell`);
  }

  for (const cut of ['long_straight', 'curly_afro', 'bald']) {
    const built = buildHumanMannequin(THREE, 'women', mWomenXS, {
      hairStyle: cut,
      hairColor: '#581c2b',
    });
    const hairGroup = built.headGroup.getObjectByName('hairGroup');
    assert.ok(hairGroup);
    const stats = assertGroupGeometryFinite(hairGroup, `women ${cut}`);
    if (cut === 'bald') {
      assert.equal(stats.meshCount, 0, 'bald cut produces zero hair meshes');
    } else {
      assert.ok(stats.meshCount >= 1, `${cut} produces hair meshes`);
    }
  }

  for (const cut of ['curly_fade', 'long_men', 'man_bun', 'bald']) {
    const built = buildHumanMannequin(THREE, 'men', mMen4XL, {
      hairStyle: cut,
      hairType: 'coily',
      hairColor: '#c7b08b',
      bakeStatic: true,
    });
    const hairGroup = built.headGroup.getObjectByName('hairGroup');
    assert.ok(hairGroup);
    const stats = assertGroupGeometryFinite(hairGroup, `men 4XL ${cut}`);
    if (cut === 'bald') assert.equal(stats.meshCount, 0);
    else assert.ok(stats.meshCount >= 1);
  }
});

test('3D Headwear Engine: all women hijabs/hats and all men ghutra/shemagh/shawl/hats build finite geometry & suppress covered hair', () => {
  const mWomen = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  const mGirls = computeMeasurements({ category: 'girls', size: 'L', standard: 'intl' });
  const mMen = computeMeasurements({ category: 'men', size: 'M', standard: 'intl' });
  const mBoys = computeMeasurements({ category: 'boys', size: 'XL', standard: 'intl' });

  for (const hw of getHeadwearForCategory('women')) {
    if (hw.id === 'none') continue;
    const built = buildHumanMannequin(THREE, 'women', mWomen, {
      headwear: hw.id,
      headwearColor: '#1f513f',
      hairStyle: 'high_bun',
      bakeStatic: true,
    });
    const hwGroup = built.headGroup.getObjectByName('headwearGroup');
    assert.ok(hwGroup, `women ${hw.id}: headwearGroup present`);
    const stats = assertGroupGeometryFinite(hwGroup, `women ${hw.id}`);
    assert.ok(stats.meshCount >= 1 && stats.totalVerts > 50, `women ${hw.id}: renders non-trivial 3D geometry`);

    const hairGroup = built.headGroup.getObjectByName('hairGroup');
    const hairStats = assertGroupGeometryFinite(hairGroup, `women hair under ${hw.id}`);
    if (getHeadwearSpec(hw.id).hidesHair) {
      assert.equal(hairStats.meshCount, 0, `women ${hw.id}: hides exterior hair cleanly to prevent clipping`);
    } else {
      assert.ok(hairStats.meshCount >= 1, `women ${hw.id}: keeps peeking lower hair visible under hat`);
    }
  }

  for (const hw of getHeadwearForCategory('men')) {
    if (hw.id === 'none') continue;
    const built = buildHumanMannequin(THREE, 'men', mMen, {
      headwear: hw.id,
      headwearColor: hw.id === 'shemagh_iqal' ? '#b8232c' : '#d7c3a3',
      hairStyle: 'classic_men',
      bakeStatic: true,
    });
    const hwGroup = built.headGroup.getObjectByName('headwearGroup');
    assert.ok(hwGroup, `men ${hw.id}: headwearGroup present`);
    const stats = assertGroupGeometryFinite(hwGroup, `men ${hw.id}`);
    assert.ok(stats.meshCount >= 1 && stats.totalVerts > 50, `men ${hw.id}: renders non-trivial 3D geometry`);

    const hairGroup = built.headGroup.getObjectByName('hairGroup');
    const hairStats = assertGroupGeometryFinite(hairGroup, `men hair under ${hw.id}`);
    if (getHeadwearSpec(hw.id).hidesHair) {
      assert.equal(hairStats.meshCount, 0, `men ${hw.id}: suppresses exterior hair cleanly under wrap`);
    }
  }

  // Spot check kids sizes (girls + boys) with hijabs and ghutra+iqal
  const girlHijab = buildHumanMannequin(THREE, 'girls', mGirls, { headwear: 'hijab_classic', bakeStatic: true });
  assert.ok(assertGroupGeometryFinite(girlHijab.headGroup.getObjectByName('headwearGroup'), 'girls hijab').meshCount >= 2);
  const boyGhutra = buildHumanMannequin(THREE, 'boys', mBoys, { headwear: 'ghutra_iqal', bakeStatic: true });
  assert.ok(assertGroupGeometryFinite(boyGhutra.headGroup.getObjectByName('headwearGroup'), 'boys ghutra_iqal').meshCount >= 4);
});
