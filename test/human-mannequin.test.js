import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../cloth-lab/node_modules/three/build/three.module.js';
import { computeMeasurements } from '../js/data.js';
import {
  applyNaturalHumanMotion,
  buildHumanMannequin,
  computeHumanBodyDims,
  createHumanSkinMaterial,
} from '../js/human-mannequin.js';

function analyzeTopology(geometry) {
  const pos = geometry.attributes.position;
  const idx = geometry.getIndex();
  assert.ok(pos, 'geometry must have position attribute');
  assert.ok(idx, 'geometry must be indexed');

  const vCount = pos.count;
  const triCount = idx.count / 3;

  const directedEdges = new Set();
  const undirectedCounts = new Map();
  let signedVolume6 = 0;
  let degenerateTris = 0;

  for (let i = 0; i < vCount; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), `vertex ${i} must be finite`);
  }

  for (let t = 0; t < triCount; t++) {
    const a = idx.getX(t * 3);
    const b = idx.getX(t * 3 + 1);
    const c = idx.getX(t * 3 + 2);
    assert.ok(a >= 0 && a < vCount && b >= 0 && b < vCount && c >= 0 && c < vCount, 'triangle indices in bounds');
    if (a === b || b === c || c === a) degenerateTris++;

    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const dKey = `${u}->${v}`;
      assert.ok(!directedEdges.has(dKey), `duplicate directed half-edge ${dKey} (winding flip or non-manifold)`);
      directedEdges.add(dKey);
      const uKey = u < v ? `${u}-${v}` : `${v}-${u}`;
      undirectedCounts.set(uKey, (undirectedCounts.get(uKey) || 0) + 1);
    }

    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
    const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
    signedVolume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const [, count] of undirectedCounts) {
    if (count === 1) boundaryEdges++;
    else if (count !== 2) nonManifoldEdges++;
  }

  const eCount = undirectedCounts.size;
  const euler = vCount - eCount + triCount;

  return {
    vCount,
    eCount,
    triCount,
    boundaryEdges,
    nonManifoldEdges,
    degenerateTris,
    euler,
    signedVolume: signedVolume6 / 6,
  };
}

test('Unified Human Mannequin: single watertight 2-manifold closed surface across all 4 categories', () => {
  for (const cat of ['women', 'men', 'girls', 'boys']) {
    const m = computeMeasurements({ category: cat, size: 'M', standard: 'intl' });
    const res = buildHumanMannequin(THREE, cat, m);

    assert.ok(res.bodyMesh.isSkinnedMesh, `${cat}: bodyMesh must be a single SkinnedMesh`);
    assert.equal(res.skeleton.bones.length, 17, `${cat}: humanoid skeleton must have 17 bones`);

    const skinMeshes = [];
    res.group.traverse((o) => {
      if (o.isMesh && o.name === 'humanBody') skinMeshes.push(o);
    });
    assert.equal(skinMeshes.length, 1, `${cat}: entire body from head to toes & fingertips is ONE unified mesh`);

    const topo = analyzeTopology(res.bodyMesh.geometry);
    assert.equal(topo.degenerateTris, 0, `${cat}: zero degenerate triangles`);
    assert.equal(topo.boundaryEdges, 0, `${cat}: zero open holes / boundary edges (100% watertight)`);
    assert.equal(topo.nonManifoldEdges, 0, `${cat}: zero non-manifold edges`);
    assert.equal(topo.euler, 2, `${cat}: genus-0 sphere topology (V - E + F = 2)`);
    assert.ok(topo.signedVolume > 0.015, `${cat}: positive outward-oriented volume (${topo.signedVolume.toFixed(4)} m^3)`);

    const bb = res.bodyMesh.geometry.boundingBox;
    assert.ok(Math.abs(bb.min.y) < 0.002, `${cat}: feet planted cleanly at y=0 (got ${bb.min.y})`);
    const expectedH = m.height * 0.01;
    assert.ok(Math.abs(bb.max.y - expectedH) < expectedH * 0.025, `${cat}: height matches measurement (${bb.max.y} vs ${expectedH})`);

    // Verify 4-bone skin weights sum to 1.0 on every vertex
    const sw = res.bodyMesh.geometry.attributes.skinWeight;
    for (let i = 0; i < sw.count; i++) {
      const sum = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
      assert.ok(Math.abs(sum - 1.0) < 1e-4, `${cat}: vertex ${i} skin weights must sum to 1.0 (got ${sum})`);
    }

    // Verify opaque dermal skin contract
    const mat = createHumanSkinMaterial(THREE, cat);
    assert.equal(mat.transparent, false);
    assert.equal(mat.opacity, 1.0);
    assert.equal(mat.depthWrite, true);
    assert.equal(mat.sheen, 0.0);
    assert.equal(mat.side, THREE.DoubleSide);
  }
});

test('Unified Human Mannequin: responsive to size & measurement changes (XS vs XXXXL) and Cloth Lab baked poses', () => {
  const mXS = computeMeasurements({ category: 'women', size: 'XS', standard: 'intl' });
  const m4XL = computeMeasurements({ category: 'women', size: 'XXXXL', standard: 'intl' });

  const dimsXS = computeHumanBodyDims('women', mXS);
  const dims4XL = computeHumanBodyDims('women', m4XL);
  assert.ok(dims4XL.chestR > dimsXS.chestR * 1.25, 'XXXXL chest radius is substantially larger than XS');
  assert.ok(dims4XL.waistR > dimsXS.waistR * 1.30, 'XXXXL waist radius is substantially larger than XS');
  assert.ok(dims4XL.hipR > dimsXS.hipR * 1.20, 'XXXXL hip radius is substantially larger than XS');

  const manXS = buildHumanMannequin(THREE, 'women', mXS, { bakeStatic: true, pose: 'standing' });
  const man4XL = buildHumanMannequin(THREE, 'women', m4XL, { bakeStatic: true, pose: 'standing' });

  const volXS = analyzeTopology(manXS.bodyMesh.geometry).signedVolume;
  const vol4XL = analyzeTopology(man4XL.bodyMesh.geometry).signedVolume;
  assert.ok(vol4XL > volXS * 1.45, `XXXXL body volume (${vol4XL.toFixed(4)}) scales responsively above XS (${volXS.toFixed(4)})`);

  // Verify all 5 Cloth Lab poses bake cleanly into plain THREE.Mesh with finite watertight geometry
  for (const pose of ['standing', 'apose', 'tpose', 'contrapposto', 'seated']) {
    const posed = buildHumanMannequin(THREE, 'women', mXS, { bakeStatic: true, pose });
    assert.equal(posed.bodyMesh.isMesh, true);
    assert.equal(Boolean(posed.bodyMesh.isSkinnedMesh), false, `${pose}: baked mesh is plain THREE.Mesh for exporter compatibility`);
    const topo = analyzeTopology(posed.bodyMesh.geometry);
    assert.equal(topo.boundaryEdges, 0, `${pose}: baked pose remains 100% watertight`);
    assert.ok(topo.signedVolume > 0.015, `${pose}: baked pose preserves positive volume`);
  }
});

test('Unified Human Mannequin: natural asymmetric gait, plantar floor grounding, garment arm clearance, and idle breathing', () => {
  const vTmp = new THREE.Vector3();
  for (const cat of ['women', 'men', 'girls', 'boys']) {
    const m = computeMeasurements({ category: cat, size: 'M', standard: 'intl' });
    const man = buildHumanMannequin(THREE, cat, m);
    const { limbs, dims, landmarks, bodyMesh, skeleton, group } = man;
    const freq = (cat === 'girls' || cat === 'boys') ? 3.35 : 2.95;

    let maxKneeFlex = 0;
    for (let step = 0; step < 24; step++) {
      const t = (step / 24) * ((2 * Math.PI) / freq);
      applyNaturalHumanMotion(limbs, dims, landmarks, {
        time: t,
        walking: true,
        category: cat,
        minArmAbduct: 0.24,
        blend: 1.0,
      });
      group.updateMatrixWorld(true);
      skeleton.update();

      // Knees never hyperextend forward
      assert.ok(limbs.knee1.rotation.x >= -1e-4, `${cat}: knee1 must never hyperextend (${limbs.knee1.rotation.x})`);
      assert.ok(limbs['knee-1'].rotation.x >= -1e-4, `${cat}: knee-1 must never hyperextend (${limbs['knee-1'].rotation.x})`);
      maxKneeFlex = Math.max(maxKneeFlex, limbs.knee1.rotation.x, limbs['knee-1'].rotation.x);

      // Garment-aware abduction guard keeps arms outside flared garments
      assert.ok(limbs.arm1.rotation.z >= 0.239, `${cat}: arm1 respects minArmAbduct (${limbs.arm1.rotation.z})`);
      assert.ok(limbs['arm-1'].rotation.z <= -0.239, `${cat}: arm-1 respects minArmAbduct (${limbs['arm-1'].rotation.z})`);

      // Counter-rotating pelvis & ribcage during active stride
      if (Math.abs(limbs.pelvis.rotation.y) > 0.01) {
        assert.equal(Math.sign(limbs.chest.rotation.y), -Math.sign(limbs.pelvis.rotation.y), `${cat}: chest counter-rotates pelvis yaw`);
      }

      // Plantar foot grounding: lowest vertex stays planted near floor y = 0
      let minY = Infinity;
      const posCount = bodyMesh.geometry.attributes.position.count;
      for (let i = 0; i < posCount; i++) {
        bodyMesh.getVertexPosition(i, vTmp);
        vTmp.applyMatrix4(bodyMesh.matrixWorld);
        if (vTmp.y < minY) minY = vTmp.y;
      }
      assert.ok(minY >= -0.015 && minY <= 0.018, `${cat} step ${step}: plantar sole stays grounded near y=0 (got ${minY.toFixed(4)}m)`);
    }
    assert.ok(maxKneeFlex > 0.35, `${cat}: swing-phase knee clearance flexion reaches natural amplitude (${maxKneeFlex.toFixed(3)} rad)`);

    // Living idle posture: gentle breathing & weight shift while feet stay planted
    applyNaturalHumanMotion(limbs, dims, landmarks, { time: 0.0, walking: false, category: cat, blend: 1.0 });
    const chestPitch0 = limbs.chest.rotation.x;
    applyNaturalHumanMotion(limbs, dims, landmarks, { time: 1.15, walking: false, category: cat, blend: 1.0 });
    const chestPitch1 = limbs.chest.rotation.x;
    assert.notEqual(chestPitch0, chestPitch1, `${cat}: idle breathing gently animates thoracic posture`);
  }
});
