import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../cloth-lab/node_modules/three/build/three.module.js';
import { computeMeasurements } from '../js/data.js';
import { getMannequinFor } from '../js/mannequin-catalog.js';
import {
  HAIR_TYPES,
  HAIR_LENGTH_PRESETS,
  HAIR_HIGHLIGHT_PRESETS,
  HAIR_COLOR_PRESETS,
  HAIRCUT_CATALOG,
  HEADWEAR_CATALOG,
  HEADWEAR_COLOR_PRESETS,
  HEADWEAR_FABRIC_PRESETS,
  HEADWEAR_LENGTH_PRESETS,
  UNDERCAP_COLOR_PRESETS,
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

function groupWorldYBounds(group) {
  group.updateMatrixWorld(true);
  let minY = Infinity;
  let maxY = -Infinity;
  const v = new THREE.Vector3();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
    const pos = obj.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(obj.matrixWorld);
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  });
  return { minY, maxY };
}

test('Customization Presets, Long Hairstyles, Long Islamic Hijabs & Long Niqabs across sizes', () => {
  assert.ok(HAIR_LENGTH_PRESETS.length >= 4);
  assert.ok(HAIR_HIGHLIGHT_PRESETS.length >= 5);
  assert.ok(HEADWEAR_FABRIC_PRESETS.length >= 4);
  assert.ok(HEADWEAR_LENGTH_PRESETS.length >= 3);
  assert.ok(UNDERCAP_COLOR_PRESETS.length >= 6);

  for (const list of [HAIR_LENGTH_PRESETS, HAIR_HIGHLIGHT_PRESETS, HEADWEAR_FABRIC_PRESETS, HEADWEAR_LENGTH_PRESETS, UNDERCAP_COLOR_PRESETS]) {
    for (const item of list) {
      assert.ok(item.label?.en && item.label?.ar, `preset ${item.id} has EN/AR labels`);
      if (item.hex) assert.match(item.hex, /^#[0-9a-f]{6}$/i);
    }
  }

  // Verify resolveMannequinStyling resolves all new hair & hijab/niqab customization fields cleanly
  const womenM = getMannequinFor('women', 'M');
  const niqabResolved = resolveMannequinStyling('women', womenM, {
    hairStyle: 'long_waist_straight',
    hairLength: 'extra_long',
    hairHighlight: 'warm_honey',
    headwear: 'niqab_eye_screen',
    headwearFabric: 'silk',
    headwearLength: 'extra_long',
    undercapColor: '#5c2030',
  });
  assert.equal(niqabResolved.hairLength, 'extra_long');
  assert.equal(niqabResolved.hairHighlight, 'warm_honey');
  assert.equal(niqabResolved.headwearFabric, 'silk');
  assert.equal(niqabResolved.headwearLength, 'extra_long');
  assert.equal(niqabResolved.undercapHex, '#5c2030');
  assert.equal(niqabResolved.niqabEyeScreen, true);
  assert.equal(niqabResolved.hasOverrides, true);

  const eyeOffResolved = resolveMannequinStyling('women', womenM, {
    headwear: 'niqab_eye_screen',
    niqabEyeScreen: false,
  });
  assert.equal(eyeOffResolved.niqabEyeScreen, false);

  // Verify every new long hairstyle across women, girls, men, and boys builds finite geometry
  const mWomenXS = computeMeasurements({ category: 'women', size: 'XS', standard: 'intl' });
  const mWomenM = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  const mWomen4XL = computeMeasurements({ category: 'women', size: 'XXXXL', standard: 'intl' });
  const mGirls = computeMeasurements({ category: 'girls', size: 'L', standard: 'intl' });
  const mMen = computeMeasurements({ category: 'men', size: 'M', standard: 'intl' });
  const mBoys = computeMeasurements({ category: 'boys', size: 'XL', standard: 'intl' });

  const womenLongCuts = [
    'long_waist_straight',
    'long_hollywood_waves',
    'long_layered_curls',
    'long_half_up',
    'long_high_ponytail',
    'long_side_sweep',
    'long_twin_braids',
  ];
  for (const cut of womenLongCuts) {
    const built = buildHumanMannequin(THREE, 'women', mWomenM, {
      hairStyle: cut,
      hairType: 'wavy',
      hairLength: 'long',
      hairHighlight: 'warm_honey',
      hairColor: '#3f281b',
      bakeStatic: true,
    });
    const hairGroup = built.headGroup.getObjectByName('hairGroup');
    const stats = assertGroupGeometryFinite(hairGroup, `women ${cut}`);
    assert.ok(stats.meshCount >= 2 && stats.totalVerts > 200, `women ${cut}: lush multi-mesh long hair geometry`);
  }

  for (const cut of ['long_waist_straight', 'long_hollywood_waves', 'long_layered_curls', 'long_twin_braids', 'long_high_ponytail']) {
    const built = buildHumanMannequin(THREE, 'girls', mGirls, { hairStyle: cut, bakeStatic: true });
    assert.ok(assertGroupGeometryFinite(built.headGroup.getObjectByName('hairGroup'), `girls ${cut}`).meshCount >= 2);
  }
  for (const cut of ['long_men_waves', 'long_men_straight', 'long_men_half_up']) {
    const built = buildHumanMannequin(THREE, 'men', mMen, { hairStyle: cut, bakeStatic: true });
    assert.ok(assertGroupGeometryFinite(built.headGroup.getObjectByName('hairGroup'), `men ${cut}`).meshCount >= 2);
  }
  for (const cut of ['long_men_waves', 'long_men_straight']) {
    const built = buildHumanMannequin(THREE, 'boys', mBoys, { hairStyle: cut, bakeStatic: true });
    assert.ok(assertGroupGeometryFinite(built.headGroup.getObjectByName('hairGroup'), `boys ${cut}`).meshCount >= 2);
  }

  // Verify hairLength visibly extends downward reach (extra_long minY < short minY)
  const shortLongBuilt = buildHumanMannequin(THREE, 'women', mWomenM, { hairStyle: 'long_waist_straight', hairLength: 'short', bakeStatic: true });
  const extraLongBuilt = buildHumanMannequin(THREE, 'women', mWomenM, { hairStyle: 'long_waist_straight', hairLength: 'extra_long', bakeStatic: true });
  assert.ok(
    groupWorldYBounds(extraLongBuilt.headGroup.getObjectByName('hairGroup')).minY
    < groupWorldYBounds(shortLongBuilt.headGroup.getObjectByName('hairGroup')).minY - 0.08,
    'extra_long hair drapes significantly deeper than trimmed hair'
  );

  // Verify all 8 new long Islamic hijabs & niqabs across XS, M, and 4XL sizes
  const newIslamicStyles = [
    'hijab_long_draped',
    'hijab_long_khimar',
    'hijab_french_jilbab',
    'hijab_long_shayla',
    'niqab_long_saudi',
    'niqab_long_layered',
    'niqab_khimar_long',
    'niqab_eye_screen',
  ];
  for (const hwId of newIslamicStyles) {
    assert.ok(getHeadwearForCategory('women').some((h) => h.id === hwId), `women catalog includes ${hwId}`);
    assert.ok(getHeadwearForCategory('girls').some((h) => h.id === hwId), `girls catalog includes ${hwId}`);
    assert.equal(getHeadwearForCategory('men').some((h) => h.id === hwId), false, `men excludes ${hwId}`);
    for (const [sizeTag, meas] of [['XS', mWomenXS], ['M', mWomenM], ['4XL', mWomen4XL]]) {
      const built = buildHumanMannequin(THREE, 'women', meas, {
        headwear: hwId,
        headwearColor: '#1e2028',
        headwearFabric: 'chiffon',
        headwearLength: 'extra_long',
        undercapColor: '#131418',
        hairStyle: 'long_waist_straight',
        bakeStatic: true,
      });
      const hwGroup = built.headGroup.getObjectByName('headwearGroup');
      const stats = assertGroupGeometryFinite(hwGroup, `women ${sizeTag} ${hwId}`);
      assert.ok(stats.meshCount >= 3 && stats.totalVerts > 500, `${sizeTag} ${hwId}: rich sculpted Islamic headwear`);
      const hairStats = assertGroupGeometryFinite(built.headGroup.getObjectByName('hairGroup'), `hair under ${hwId}`);
      assert.equal(hairStats.meshCount, 0, `${sizeTag} ${hwId}: hides exterior hair cleanly`);

      // Check torso clearance around mid-chest / underbust (no cape vertices inside core chest ellipsoid)
      built.group.updateMatrixWorld(true);
      const yCheckLo = built.dims.hipY + built.dims.span * 0.45;
      const yCheckHi = built.dims.hipY + built.dims.span * 0.78;
      const minFrontClear = built.dims.chestR * 0.85;
      const vTmp = new THREE.Vector3();
      hwGroup.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
        const pos = obj.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          vTmp.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(obj.matrixWorld);
          if (vTmp.y >= yCheckLo && vTmp.y <= yCheckHi && Math.abs(vTmp.x) < built.dims.chestR * 0.5) {
            assert.ok(Math.hypot(vTmp.x, vTmp.z) > minFrontClear, `${sizeTag} ${hwId}: mid-torso cape clears core body`);
          }
        }
      });
    }
  }

  // Verify headwearLength visibly lowers drape hem (extra_long < standard)
  const khimarStd = buildHumanMannequin(THREE, 'women', mWomenM, { headwear: 'hijab_long_khimar', headwearLength: 'standard', bakeStatic: true });
  const khimarXLong = buildHumanMannequin(THREE, 'women', mWomenM, { headwear: 'hijab_long_khimar', headwearLength: 'extra_long', bakeStatic: true });
  assert.ok(
    groupWorldYBounds(khimarXLong.headGroup.getObjectByName('headwearGroup')).minY
    < groupWorldYBounds(khimarStd.headGroup.getObjectByName('headwearGroup')).minY - 0.10,
    'extra_long khimar drapes significantly lower than standard length'
  );

  // Verify niqabEyeScreen adds/removes the semi-sheer ghashwa mesh on demand
  const withEyeScreen = buildHumanMannequin(THREE, 'women', mWomenM, { headwear: 'niqab_long_saudi', niqabEyeScreen: true, bakeStatic: true });
  assert.ok(withEyeScreen.headGroup.getObjectByName('niqabEyeScreenMesh'), 'eye screen mesh built when niqabEyeScreen=true');
  const withoutEyeScreen = buildHumanMannequin(THREE, 'women', mWomenM, { headwear: 'niqab_eye_screen', niqabEyeScreen: false, bakeStatic: true });
  assert.equal(withoutEyeScreen.headGroup.getObjectByName('niqabEyeScreenMesh'), undefined, 'eye screen omitted when niqabEyeScreen=false');
});

test('3D Long Hair Geometry: zero floating cheek roots, clean back hug, true waist reach, and curly volume', () => {
  const measureHairGeometry = (category, size, opts) => {
    const meas = computeMeasurements({ category, size, standard: 'intl' });
    const built = buildHumanMannequin(THREE, category, meas, { ...opts, bakeStatic: false });
    const h = built.dims.headH;
    const hc = built.landmarks.headCenterY;
    const ySh = built.dims.shoulderY - hc;
    const yWa = built.dims.hipY + built.dims.span * 0.34 - hc;
    const hg = built.headGroup.getObjectByName('hairGroup');
    assert.ok(hg, `${category} ${size} ${opts.hairStyle}: hairGroup present`);

    let maxEarR = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let underMassBackZ = Infinity;
    hg.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
      const pos = obj.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y >= -0.15 * h && y <= 0.35 * h) {
          maxEarR = Math.max(maxEarR, Math.hypot(x, z));
        }
        if (obj.name === 'hairUnderMass' && Math.abs(y - (ySh - 0.25 * h)) < 0.035 && Math.abs(x) < built.dims.chestR * 0.55 && z < 0) {
          if (z < underMassBackZ) underMassBackZ = z;
        }
      }
    });

    let bodyBackZ = Infinity;
    const bp = built.bodyMesh.geometry.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i);
      const y = bp.getY(i) - hc;
      const z = bp.getZ(i);
      if (Math.abs(y - (ySh - 0.25 * h)) < 0.035 && Math.abs(x) < built.dims.chestR * 0.55 && z < 0) {
        if (z < bodyBackZ) bodyBackZ = z;
      }
    }

    return {
      headH: h,
      yWaist: yWa,
      maxEarRatio: maxEarR / h,
      minY,
      xSpan: maxX - minX,
      backGapMm: (bodyBackZ - underMassBackZ) * 1000,
      hasUnderMass: Number.isFinite(underMassBackZ),
    };
  };

  // 1. Zero floating cheek/ear roots across women XS/M/4XL & girls L for long cuts and textures
  for (const [cat, sz] of [['women', 'XS'], ['women', 'M'], ['women', 'XXXXL'], ['girls', 'L']]) {
    for (const style of ['long_straight', 'long_wavy', 'long_waist_straight', 'long_twin_braids']) {
      for (const hairType of ['straight', 'curly', 'braided']) {
        const stats = measureHairGeometry(cat, sz, { hairStyle: style, hairType, hairLength: 'extra_long' });
        assert.ok(
          stats.maxEarRatio <= 0.72,
          `${cat} ${sz} ${style} (${hairType}): cheek/ear radius ratio ${stats.maxEarRatio.toFixed(3)} must stay <= 0.72`
        );
      }
    }
  }

  // 2. Zero floating back shelf ("jetpack") and zero body clipping on upper back across sizes
  for (const [cat, sz] of [['women', 'XS'], ['women', 'M'], ['women', 'XXXXL'], ['girls', 'L'], ['men', 'M'], ['boys', 'XL']]) {
    const cut = cat === 'men' || cat === 'boys' ? 'long_men_straight' : 'long_straight';
    const stats = measureHairGeometry(cat, sz, { hairStyle: cut, hairType: 'straight', hairLength: 'extra_long' });
    assert.ok(stats.hasUnderMass, `${cat} ${sz} ${cut}: continuous hairUnderMass present`);
    assert.ok(
      stats.backGapMm >= 6 && stats.backGapMm <= 68,
      `${cat} ${sz} ${cut}: upper-back gap ${stats.backGapMm.toFixed(1)}mm must stay within [6mm, 68mm]`
    );
  }

  // 3. True waist-reaching extra_long length & distinct curly lateral volume
  const straightStats = measureHairGeometry('women', 'M', { hairStyle: 'long_straight', hairType: 'straight', hairLength: 'extra_long' });
  const curlyStats = measureHairGeometry('women', 'M', { hairStyle: 'long_straight', hairType: 'curly', hairLength: 'extra_long' });
  assert.ok(
    straightStats.minY <= straightStats.yWaist + 0.06,
    `extra_long straight reaches near/below waist (${straightStats.minY.toFixed(3)} <= ${(straightStats.yWaist + 0.06).toFixed(3)})`
  );
  assert.ok(
    curlyStats.xSpan >= straightStats.xSpan * 1.12,
    `curly extra_long X span (${curlyStats.xSpan.toFixed(3)}m) must exceed straight (${straightStats.xSpan.toFixed(3)}m) by >= 12%`
  );
});

test('3D Hijab Proportions: clear face/mouth, zero cheek undercap poke, and contoured chest drape without shoulder bar', () => {
  const mWomenM = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  for (const hwId of ['hijab_classic', 'hijab_turkish', 'hijab_shayla', 'hijab_sport', 'hijab_long_draped']) {
    const built = buildHumanMannequin(THREE, 'women', mWomenM, {
      headwear: hwId,
      headwearColor: '#f8f8f6',
      undercapColor: '#18191e',
      bakeStatic: false,
    });
    const h = built.dims.headH;
    const hc = built.landmarks.headCenterY;
    const yShoulder = built.dims.shoulderY - hc;
    const hwGroup = built.headGroup.getObjectByName('headwearGroup');
    assert.ok(hwGroup && hwGroup.children.length >= 2, `${hwId}: headwearGroup children built`);

    // Child 0 = undercap, Child 1 = outer hood
    const underPos = hwGroup.children[0].geometry.attributes.position;
    const hoodPos = hwGroup.children[1].geometry.attributes.position;
    let underMaxR = 0;
    let hoodMaxR = 0;
    for (let i = 0; i < underPos.count; i++) {
      const y = underPos.getY(i);
      if (y > -0.15 * h && y < 0.25 * h) underMaxR = Math.max(underMaxR, Math.hypot(underPos.getX(i), underPos.getZ(i)));
    }
    for (let i = 0; i < hoodPos.count; i++) {
      const y = hoodPos.getY(i);
      if (y > -0.15 * h && y < 0.25 * h) hoodMaxR = Math.max(hoodMaxR, Math.hypot(hoodPos.getX(i), hoodPos.getZ(i)));
    }
    assert.ok(
      hoodMaxR >= underMaxR + 0.006 * h,
      `${hwId}: outer hood (${(hoodMaxR / h).toFixed(3)}h) clears undercap (${(underMaxR / h).toFixed(3)}h) at cheeks`
    );

    // Child 2 = neck/shoulder drape; Child 3 (when present on classic/shayla/long_draped) = crossed scarf ribbon
    const drapePos = hwGroup.children[2].geometry.attributes.position;
    let drapeMaxY = -Infinity;
    let drapeMinY = Infinity;
    let drapeMaxAbsX = 0;
    let drapeMaxFrontZ = -Infinity;
    for (let i = 0; i < drapePos.count; i++) {
      const x = drapePos.getX(i);
      const y = drapePos.getY(i);
      const z = drapePos.getZ(i);
      if (y > drapeMaxY) drapeMaxY = y;
      if (y < drapeMinY) drapeMinY = y;
      drapeMaxAbsX = Math.max(drapeMaxAbsX, Math.abs(x));
      if (z > drapeMaxFrontZ) drapeMaxFrontZ = z;
    }
    assert.ok(drapeMaxY <= -0.28 * h, `${hwId}: drape stays below mouth/chin (${(drapeMaxY / h).toFixed(3)}h <= -0.28h)`);
    if (hwId !== 'hijab_sport') {
      assert.ok(
        drapeMinY < yShoulder - 0.30 * h,
        `${hwId}: drape extends well onto upper chest below shoulder line (${(drapeMinY / h).toFixed(3)}h < ${(yShoulder / h - 0.30).toFixed(3)}h)`
      );
      assert.ok(
        drapeMaxAbsX <= built.dims.shoulderHalf * 1.28,
        `${hwId}: drape width ${(drapeMaxAbsX / built.dims.shoulderHalf).toFixed(2)}x shoulderHalf avoids stiff shoulder shelf`
      );
    }

    if (hwId !== 'hijab_sport' && hwGroup.children[3]) {
      const scarfPos = hwGroup.children[3].geometry.attributes.position;
      let scarfMaxY = -Infinity;
      let scarfMaxAbsX = 0;
      for (let i = 0; i < scarfPos.count; i++) {
        if (scarfPos.getY(i) > scarfMaxY) scarfMaxY = scarfPos.getY(i);
        scarfMaxAbsX = Math.max(scarfMaxAbsX, Math.abs(scarfPos.getX(i)));
      }
      assert.ok(scarfMaxY <= -0.44 * h, `${hwId}: crossed scarf stays below chin/mouth (${(scarfMaxY / h).toFixed(3)}h <= -0.44h)`);
      assert.ok(scarfMaxAbsX <= built.dims.shoulderHalf * 1.12, `${hwId}: crossed scarf hugs within shoulder contour`);
    }
  }
});

test('3D Khimar & Niqab Seamless Drape: monotonic gravity fall, full cheek/jaw wrap, matte sheen, and live cape metadata', () => {
  const mWomenM = computeMeasurements({ category: 'women', size: 'M', standard: 'intl' });
  for (const hwId of ['hijab_khimar', 'hijab_long_khimar', 'hijab_french_jilbab', 'niqab_long_saudi', 'niqab_khimar_long']) {
    const built = buildHumanMannequin(THREE, 'women', mWomenM, {
      headwear: hwId,
      headwearColor: '#131418',
      headwearFabric: 'crepe',
      headwearLength: 'extra_long',
      undercapColor: '#131418',
      bakeStatic: false,
    });
    const h = built.dims.headH;
    const hwGroup = built.headGroup.getObjectByName('headwearGroup');
    const capes = hwGroup.children.filter((ch) => ch.userData?.isCapeDrape);
    assert.ok(capes.length >= 1, `${hwId}: at least one cape drape mesh tagged`);

    for (const cape of capes) {
      assert.equal(cape.userData.isFullCape, true, `${hwId}: cape tagged isFullCape=true`);
      assert.ok(cape.geometry.userData.baseCapePos instanceof Float32Array, `${hwId}: stores baseCapePos for live garment fitting`);
      assert.ok((cape.material.roughness ?? 0.85) >= 0.82, `${hwId}: dark matte crepe stays non-glossy`);
      if (cape.material.sheenColor) {
        assert.ok(cape.material.sheenColor.r < 0.22, `${hwId}: dark cloth sheen stays subtle without white plastic glare`);
      }

      if (!cape.userData.isNiqabVeil && cape.userData.capeGrid) {
        const { U, V } = cape.userData.capeGrid;
        const pos = cape.geometry.attributes.position;
        const stride = U + 1;
        // Verify monotonic outward/straight gravity drape across lower half of khimar (no inward waist pinch)
        for (let iu = 0; iu <= U; iu += 4) {
          let prevR = 0;
          for (let iv = Math.ceil(V * 0.25); iv <= V; iv++) {
            const idx = iv * stride + iu;
            const r = Math.hypot(pos.getX(idx), pos.getZ(idx));
            assert.ok(r >= prevR - 0.022 * h, `${hwId} col=${iu} row=${iv}: maintains gravity fall (${r.toFixed(4)} >= ${(prevR - 0.022 * h).toFixed(4)})`);
            prevR = Math.max(prevR, r);
          }
        }
      }

      if (cape.userData.isNiqabVeil) {
        const pos = cape.geometry.attributes.position;
        let maxAbsPhi = 0;
        for (let i = 0; i < pos.count; i++) {
          const phi = Math.abs(Math.atan2(pos.getX(i), pos.getZ(i)));
          if (phi > maxAbsPhi) maxAbsPhi = phi;
        }
        assert.ok(maxAbsPhi >= 1.25, `${hwId}: niqab facial veil wraps past cheekbones (|phi|=${maxAbsPhi.toFixed(2)} >= 1.25)`);
      }
    }
  }

  const threeViewSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'three-view.js'), 'utf8');
  assert.match(threeViewSrc, /function fitHeadwearCapeOverGarment\(/);
  assert.match(threeViewSrc, /updateAccessoriesPose\(\);\s*fitHeadwearCapeOverGarment\(\);/);
});
