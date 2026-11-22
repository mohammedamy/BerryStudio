import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../cloth-lab/node_modules/three/build/three.module.js';
import { MEAS_KEYS, MEAS_DIAGRAM_SVG } from '../js/measure-form.js';
import {
  MEAS_GUIDE_KEYS,
  MEAS_GUIDE_SPECS,
  applyConvexBridge,
  buildMeasurementPaths,
  polylineLengthCm,
} from '../js/measure-guide-data.js';
import { buildHumanMannequin } from '../js/human-mannequin.js';
import { getMannequinFor } from '../js/mannequin-catalog.js';

test('MEAS_GUIDE_SPECS covers every MEAS_KEYS entry with complete bilingual EN/AR teaching copy and camera choreography', () => {
  assert.deepEqual(MEAS_GUIDE_KEYS, MEAS_KEYS);
  assert.equal(MEAS_GUIDE_KEYS.length, 11);
  assert.match(MEAS_DIAGRAM_SVG, /viewBox="0 0 280 412"/);

  for (let i = 0; i < MEAS_GUIDE_KEYS.length; i++) {
    const k = MEAS_GUIDE_KEYS[i];
    const spec = MEAS_GUIDE_SPECS[k];
    assert.ok(spec, `missing spec for ${k}`);
    assert.equal(spec.index, i + 1);
    assert.equal(spec.key, k);
    for (const lang of ['en', 'ar']) {
      assert.ok(spec.title[lang]?.trim().length > 2, `${k}.title.${lang}`);
      assert.ok(spec.anatomy[lang]?.trim().length > 10, `${k}.anatomy.${lang}`);
      assert.equal(spec.steps[lang].length, 3, `${k}.steps.${lang} must have 3 steps`);
      for (const step of spec.steps[lang]) assert.ok(step.trim().length > 10);
      assert.ok(spec.easeTip[lang]?.trim().length > 10, `${k}.easeTip.${lang}`);
      assert.ok(spec.avoid[lang]?.trim().length > 10, `${k}.avoid.${lang}`);
    }
    assert.ok(spec.landmarkLabels.length >= 1, `${k} landmarks`);
    assert.ok(Number.isFinite(spec.camera.azimuth), `${k} camera azimuth`);
    assert.ok(spec.camera.distanceFactor > 0.2 && spec.camera.distanceFactor <= 1.5);
  }

  // Back-side measurements must automatically swing the 3D camera behind the mannequin
  assert.ok(Math.abs(MEAS_GUIDE_SPECS.shoulder.camera.azimuth) > 2.4, 'shoulder camera should face the back');
  assert.ok(Math.abs(MEAS_GUIDE_SPECS.backLen.camera.azimuth) > 2.4, 'backLen camera should face the back');
  // Sleeve rotates toward lateral outer arm
  assert.ok(MEAS_GUIDE_SPECS.sleeve.camera.azimuth < -1.0, 'sleeve camera should face outer arm side');
});

test('applyConvexBridge bridges concave sternum and gluteal cleft valleys without sinking inward', () => {
  const chestLoopWithValley = [
    [-0.14, 1.2, 0.02],
    [-0.08, 1.2, 0.14], // left bust peak
    [-0.04, 1.2, 0.11], // sternum valley dip
    [0.00, 1.2, 0.08],  // deep center cleavage dip
    [0.04, 1.2, 0.11],  // sternum valley dip
    [0.08, 1.2, 0.14],  // right bust peak
    [0.14, 1.2, 0.02],
    [0.00, 1.2, -0.10], // back spine
  ];
  const bridgedFront = applyConvexBridge(chestLoopWithValley, 'front');
  assert.ok(bridgedFront[3][2] >= 0.139, `expected bridged cleavage Z >= 0.139, got ${bridgedFront[3][2]}`);
  assert.equal(bridgedFront[7][2], -0.10);

  const gluteLoopWithCleft = [
    [-0.15, 0.88, 0.00],
    [-0.08, 0.88, -0.14], // left glute crest
    [0.00, 0.88, -0.08],  // cleft dip
    [0.08, 0.88, -0.14],  // right glute crest
    [0.15, 0.88, 0.00],
    [0.00, 0.88, 0.10],
  ];
  const bridgedBack = applyConvexBridge(gluteLoopWithCleft, 'back');
  assert.ok(bridgedBack[2][2] <= -0.139, `expected bridged glute cleft Z <= -0.139, got ${bridgedBack[2][2]}`);
  assert.equal(polylineLengthCm(bridgedBack, true) > 0, true);
});

test('buildMeasurementPaths projects all 11 3D tape loops & spans onto real baked mannequin meshes across sizes & categories', () => {
  const cases = [
    ['women', 'XS'],
    ['women', 'M'],
    ['women', '4XL'],
    ['men', 'M'],
    ['girls', 'M'],
    ['boys', 'M'],
  ];

  const raycaster = new THREE.Raycaster();
  const origVec = new THREE.Vector3();
  const dirVec = new THREE.Vector3();

  for (const [cat, size] of cases) {
    const mq = getMannequinFor(cat, size);
    const posedJoints = {};
    let bindDims = null;
    let bindLandmarks = null;

    const built = buildHumanMannequin(THREE, cat, mq.measurements, {
      mannequin: mq,
      pose: 'standing',
      bakeStatic: true,
      onBindData: ({ limbs, landmarks, dims }) => {
        bindDims = dims;
        bindLandmarks = landmarks;
        for (const jKey of ['arm1', 'elbow1', 'hand1', 'arm-1', 'elbow-1', 'hand-1', 'leg1', 'knee1', 'foot1']) {
          const bone = limbs?.[jKey];
          if (bone) {
            const v = new THREE.Vector3();
            bone.getWorldPosition(v);
            posedJoints[jKey] = [v.x, v.y, v.z];
          }
        }
      },
    });

    built.group.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(built.bodyMesh);
    if (built.headGroup) bbox.expandByObject(built.headGroup);
    const bounds = { minY: bbox.min.y, maxY: bbox.max.y };

    const raycastFn = (origin, dir, far = 0.5, near = 0.002) => {
      origVec.set(origin[0], origin[1], origin[2]);
      dirVec.set(dir[0], dir[1], dir[2]).normalize();
      raycaster.set(origVec, dirVec);
      raycaster.near = near;
      raycaster.far = far;
      const hits = raycaster.intersectObject(built.bodyMesh, false);
      if (!hits.length) return null;
      const h = hits[0];
      return {
        point: [h.point.x, h.point.y, h.point.z],
        normal: h.face ? [h.face.normal.x, h.face.normal.y, h.face.normal.z] : [0, 0, 1],
      };
    };

    const paths = buildMeasurementPaths(bindDims, bindLandmarks, posedJoints, bounds, raycastFn);

    for (const k of MEAS_GUIDE_KEYS) {
      const p = paths[k];
      assert.ok(p, `${cat}/${size} missing path ${k}`);
      assert.ok(p.points.length >= 3, `${cat}/${size} ${k} points length`);
      assert.equal(p.points.length, p.normals.length, `${cat}/${size} ${k} normals length`);
      assert.ok(p.landmarkPins.length >= 1, `${cat}/${size} ${k} landmark pins`);
      assert.ok(Number.isFinite(p.arcLengthCm) && p.arcLengthCm > 15, `${cat}/${size} ${k} arcLengthCm=${p.arcLengthCm}`);
      for (const pt of [...p.points, p.pinAnchor, p.cameraTarget, ...p.landmarkPins.map((lp) => lp.position)]) {
        assert.equal(pt.length, 3);
        assert.ok(pt.every(Number.isFinite), `${cat}/${size} ${k} non-finite coordinate ${JSON.stringify(pt)}`);
      }
      for (const nrm of p.normals) {
        const mag = Math.hypot(nrm[0], nrm[1], nrm[2]);
        assert.ok(Math.abs(mag - 1) < 1e-3, `${cat}/${size} ${k} non-unit normal ${mag}`);
      }
    }

    // Sanity check anthropometric tape order & scaling
    assert.ok(paths.hips.arcLengthCm > paths.waist.arcLengthCm * 0.98, `${cat}/${size} hips >= waist`);
    assert.ok(paths.thigh.arcLengthCm > paths.bicep.arcLengthCm, `${cat}/${size} thigh > bicep`);
    assert.ok(
      Math.abs(paths.height.arcLengthCm - mq.measurements.height) < 5,
      `${cat}/${size} height path ${paths.height.arcLengthCm}cm vs mannequin ${mq.measurements.height}cm`,
    );

    built.bodyMesh.geometry.dispose();
  }
});
