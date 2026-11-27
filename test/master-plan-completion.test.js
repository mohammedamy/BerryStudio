import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../cloth-lab/node_modules/three/build/three.module.js';

import { ensureBundledPhoto2PatternModel, DEFAULT_PHOTO2PATTERN_ONNX_URL } from '../js/ai-providers.js';
import { FASHION_POSES, buildHumanMannequin, applyMannequinPose, evaluateCatwalkChoreography } from '../js/human-mannequin.js';
import { buildTechPackHTML } from '../js/pattern-export.js';
import { I18N } from '../js/i18n.js';
import { FABRIC_PRESETS, FABRIC_IDS } from '../cloth-lab/src/cloth/fabricPresets.js';
import { classifyPiecePhysics, INTERLINED_SCHEMA_ROLES, isPieceInterlined } from '../cloth-lab/src/cloth/piecePhysics.js';

test('Bundled Photo2Pattern ONNX file exists in models/, stays out of sw.js precache, and helper fails gracefully in Node', async () => {
  const onnxUrl = new URL('../models/berrystudio_photo2pattern_v1.onnx', import.meta.url);
  const stat = fs.statSync(onnxUrl);
  assert.ok(stat.size > 4_000_000, `Expected >4MB ONNX weights, got ${stat.size}`);
  assert.equal(DEFAULT_PHOTO2PATTERN_ONNX_URL, './models/berrystudio_photo2pattern_v1.onnx');

  const swSrc = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(!swSrc.includes('berrystudio_photo2pattern_v1.onnx'), 'Heavy ONNX weights must not be precached in sw.js');

  const deployYml = fs.readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
  assert.ok(/\bmodels\s+_site\//.test(deployYml), 'GitHub Pages assemble step includes models/ directory');

  const res = await ensureBundledPhoto2PatternModel({ fetchImpl: null });
  assert.equal(res.ok, false);
});

test('Phase 3 Completion: arms_up pose & 12s Catwalk 180-degree choreography', () => {
  assert.ok(FASHION_POSES.includes('arms_up'), 'FASHION_POSES includes arms_up');

  const man = buildHumanMannequin(THREE, 'women', null, { pose: 'arms_up', lowPower: true });
  applyMannequinPose(man.limbs, 'arms_up', man.dims);
  assert.ok(Math.abs(man.limbs.arm1.rotation.z) > 0.9, 'arms_up elevates left arm clear of torso');
  assert.ok(Math.abs(man.limbs['arm-1'].rotation.z) > 0.9, 'arms_up elevates right arm symmetrically');

  const walkOut = evaluateCatwalkChoreography(1.0);
  const frontPose = evaluateCatwalkChoreography(4.5);
  const turnBack = evaluateCatwalkChoreography(6.5);
  const walkBack = evaluateCatwalkChoreography(8.5);
  const turnFront = evaluateCatwalkChoreography(11.3);

  assert.equal(walkOut.stage, 'walk_out');
  assert.equal(walkOut.yawRad, 0);
  assert.equal(frontPose.stage, 'front_pose');
  assert.equal(frontPose.walkWeight, 0);
  assert.equal(turnBack.stage, 'turn_back');
  assert.ok(turnBack.yawRad > 0.1 && turnBack.yawRad < Math.PI, '180° pivot turn progresses smoothly');
  assert.equal(walkBack.stage, 'walk_back');
  assert.ok(Math.abs(walkBack.yawRad - Math.PI) < 1e-6, 'return walk faces 180°');
  assert.equal(turnFront.stage, 'turn_front');
  assert.ok(turnFront.yawRad > Math.PI && turnFront.yawRad < Math.PI * 2);
});

test('Phase 4 Completion: 13 fabrics define thicknessMm & interlined roles carry bendingBoost', () => {
  assert.equal(FABRIC_IDS.length, 13);
  for (const id of FABRIC_IDS) {
    assert.ok(Number.isFinite(FABRIC_PRESETS[id].thicknessMm) && FABRIC_PRESETS[id].thicknessMm > 0, `${id} defines thicknessMm`);
  }
  assert.ok(FABRIC_PRESETS.chiffon.thicknessMm < FABRIC_PRESETS.cotton.thicknessMm);
  assert.ok(FABRIC_PRESETS.cotton.thicknessMm < FABRIC_PRESETS.denim.thicknessMm);
  assert.ok(FABRIC_PRESETS.denim.thicknessMm < FABRIC_PRESETS.wool.thicknessMm);
  assert.ok(FABRIC_PRESETS.wool.thicknessMm < FABRIC_PRESETS.leather.thicknessMm);

  for (const sr of ['collar', 'collar-stand', 'cuff', 'waistband', 'lapel-facing', 'placket-facing']) {
    assert.ok(INTERLINED_SCHEMA_ROLES.has(sr), `${sr} in INTERLINED_SCHEMA_ROLES`);
    const info = classifyPiecePhysics({ role: 'frontPanel', placementHint: { schemaRole: sr }, positions2D: [[0, 0], [10, 0], [10, 4], [0, 4]] });
    assert.equal(info.interlined, true, `${sr} classified as interlined`);
    assert.ok(info.bendingBoost > 1.5, `${sr} carries bendingBoost > 1.5`);
  }

  const teeFront = classifyPiecePhysics({ role: 'frontPanel', placementHint: {}, positions2D: [[0, 0], [22, 0], [22, 48], [0, 48]] });
  assert.equal(isPieceInterlined({ role: 'frontPanel', placementHint: {} }), false);
  assert.equal(teeFront.interlined, false);
  assert.equal(teeFront.bendingBoost, 1.0);
});

test('Phase 5 Completion: 4-angle Tech Pack gallery, UI selectors, and bilingual EN/AR key parity', () => {
  const pieces = [
    {
      key: 'front',
      name: { en: 'Front Bodice', ar: 'أمام' },
      role: 'bodice-front-center',
      cutOnFold: true,
      outline: [[0, 0], [24, 0], [26, 40], [0, 42]],
    },
  ];
  const dummyImg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
  const views3d = { front: dummyImg, threeQuarter: dummyImg, side: dummyImg, back: dummyImg };

  const htmlEn = buildTechPackHTML(pieces, { lang: 'en', views3d });
  const htmlAr = buildTechPackHTML(pieces, { lang: 'ar', views3d });
  assert.ok(htmlEn.includes('3D Multi-Angle Drape'), 'EN Tech Pack renders 4-angle header');
  assert.ok(htmlEn.includes('class="views3d-grid"'), 'Tech Pack renders 4-column studio gallery');
  assert.ok(htmlAr.includes('معاينة الموديل ثلاثية الأبعاد من 4 زوايا'), 'AR Tech Pack renders RTL 4-angle header');

  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="v3dFitMapMode"'));
  assert.ok(html.includes('value="catwalk"'));
  assert.ok(html.includes('value="arms_up"'));

  const enKeys = Object.keys(I18N.en).sort();
  const arKeys = Object.keys(I18N.ar).sort();
  assert.deepEqual(arKeys, enKeys, 'I18N.en and I18N.ar keys maintain 1:1 parity');
});
