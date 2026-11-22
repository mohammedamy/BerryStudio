import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../cloth-lab/node_modules/three/build/three.module.js';
import { BASE, STANDARDS } from '../js/data.js';
import { buildHumanMannequin, computeHumanBodyDims } from '../js/human-mannequin.js';
import {
  ACTIVE_MANNEQUIN_SIZES,
  MANNEQUIN_CATALOG,
  MANNEQUIN_CATEGORIES,
  MANNEQUINS_BY_CATEGORY,
  PLANNED_MANNEQUIN_SIZES,
  getMannequinById,
  getMannequinFor,
  getMannequinsByCategory,
  isActiveMannequinSize,
  normalizeMannequinSize,
  resolveMannequinMeasurements,
} from '../js/mannequin-catalog.js';

function analyzeWatertightManifold(geometry) {
  const pos = geometry.attributes.position;
  const idx = geometry.getIndex();
  assert.ok(pos && idx, 'geometry must be indexed with position attribute');

  const vCount = pos.count;
  const triCount = idx.count / 3;
  const directed = new Set();
  const undirected = new Map();
  let signedVolume6 = 0;
  let degenerate = 0;

  for (let i = 0; i < vCount; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), `vertex ${i} must be finite`);
  }

  for (let t = 0; t < triCount; t++) {
    const a = idx.getX(t * 3);
    const b = idx.getX(t * 3 + 1);
    const c = idx.getX(t * 3 + 2);
    if (a === b || b === c || c === a) degenerate++;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const dk = `${u}->${v}`;
      assert.ok(!directed.has(dk), `duplicate directed edge ${dk}`);
      directed.add(dk);
      const uk = u < v ? `${u}-${v}` : `${v}-${u}`;
      undirected.set(uk, (undirected.get(uk) || 0) + 1);
    }
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
    const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
    signedVolume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }

  let boundary = 0;
  let nonManifold = 0;
  for (const [, count] of undirected) {
    if (count === 1) boundary++;
    else if (count !== 2) nonManifold++;
  }

  return {
    degenerate,
    boundary,
    nonManifold,
    euler: vCount - undirected.size + triCount,
    signedVolume: signedVolume6 / 6,
  };
}

test('Mannequin Catalog: 24 curated mannequins (4 base M + 20 new across XS–XXL × 4 categories)', () => {
  assert.deepEqual(ACTIVE_MANNEQUIN_SIZES, ['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  assert.deepEqual(PLANNED_MANNEQUIN_SIZES, ['XXS', 'XXXL', '4XL', '5XL']);
  assert.equal(MANNEQUIN_CATALOG.length, 24);

  const baseCount = MANNEQUIN_CATALOG.filter((m) => m.isBase).length;
  const newCount = MANNEQUIN_CATALOG.filter((m) => !m.isBase).length;
  assert.equal(baseCount, 4, '4 baseline M mannequins');
  assert.equal(newCount, 20, '20 new mannequins (5 per category)');

  const ids = new Set();
  for (const cat of MANNEQUIN_CATEGORIES) {
    const list = getMannequinsByCategory(cat);
    assert.equal(list.length, 6, `${cat}: must have 6 mannequins (XS..XXL)`);
    assert.equal(MANNEQUINS_BY_CATEGORY[cat].length, 6);
    assert.deepEqual(list.map((m) => m.size), ['XS', 'S', 'M', 'L', 'XL', 'XXL']);

    const hairStyles = new Set(list.map((m) => m.hairStyle));
    assert.equal(hairStyles.size, 6, `${cat}: all 6 mannequins have distinct curated hairstyles`);

    for (const mq of list) {
      assert.ok(!ids.has(mq.id), `duplicate mannequin id ${mq.id}`);
      ids.add(mq.id);
      assert.equal(getMannequinById(mq.id), mq);
      assert.ok(mq.name.en && mq.name.ar, `${mq.id}: bilingual name required`);
      assert.ok(mq.buildLabel.en && mq.buildLabel.ar, `${mq.id}: bilingual buildLabel required`);
      assert.match(mq.skinHex, /^#[0-9a-f]{6}$/);
      assert.match(mq.hairHex, /^#[0-9a-f]{6}$/);
    }

    // Baseline M matches js/data.js BASE verbatim
    const mEntry = getMannequinFor(cat, 'M');
    assert.equal(mEntry.isBase, true);
    assert.deepEqual(mEntry.measurements, BASE[cat]);

    // Strict monotonic anatomical progression from XS -> XXL
    const measKeys = Object.keys(BASE[cat]);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      for (const k of measKeys) {
        assert.ok(
          b.measurements[k] > a.measurements[k],
          `${cat}: ${b.size}.${k} (${b.measurements[k]}) must be strictly greater than ${a.size}.${k} (${a.measurements[k]})`
        );
      }
    }
  }
});

test('Mannequin Catalog: standards resolution and future extended size extensibility (XXS..5XL)', () => {
  assert.equal(normalizeMannequinSize('xxxxl'), '4XL');
  assert.equal(isActiveMannequinSize('XS'), true);
  assert.equal(isActiveMannequinSize('XXL'), true);
  assert.equal(isActiveMannequinSize('XXS'), false);
  assert.equal(isActiveMannequinSize('XXXL'), false);
  assert.equal(isActiveMannequinSize('4XL'), false);
  assert.equal(isActiveMannequinSize('5XL'), false);

  for (const stdKey of ['intl', 'egypt', 'saudi']) {
    const std = STANDARDS[stdKey];
    const resolved = resolveMannequinMeasurements('women', 'XL', { standard: stdKey });
    const mq = getMannequinFor('women', 'XL');
    assert.equal(resolved.chest, +((mq.measurements.chest + std.chest) * std.ease).toFixed(1));
    assert.equal(resolved.waist, +((mq.measurements.waist + std.waist) * std.ease).toFixed(1));
    assert.equal(resolved.hips, +((mq.measurements.hips + std.hips) * std.ease).toFixed(1));
  }

  // Extrapolation for future planned sizes builds valid finite watertight geometry
  const womenXL = getMannequinFor('women', 'XXL');
  for (const planned of ['XXS', 'XXXL', '4XL', 'XXXXL', '5XL']) {
    const futureMq = getMannequinFor('women', planned);
    assert.ok(futureMq.id.startsWith('women_'));
    if (planned === 'XXS') {
      assert.ok(futureMq.measurements.chest < getMannequinFor('women', 'XS').measurements.chest);
    } else {
      assert.ok(futureMq.measurements.chest > womenXL.measurements.chest);
    }
    const built = buildHumanMannequin(THREE, 'women', futureMq.measurements, { mannequin: futureMq });
    const topo = analyzeWatertightManifold(built.bodyMesh.geometry);
    assert.equal(topo.boundary, 0, `${planned}: future mannequin remains 100% watertight`);
    assert.equal(topo.euler, 2, `${planned}: future mannequin keeps genus-0 topology`);
  }
});

test('All 24 Mannequins build watertight genus-0 meshes, smiling faces, grounded feet, and monotonic volume', () => {
  for (const cat of MANNEQUIN_CATEGORIES) {
    const list = getMannequinsByCategory(cat);
    const volumes = [];

    for (const mq of list) {
      const dims = computeHumanBodyDims(cat, mq.measurements, null, mq.morph);
      assert.equal(dims.morph, mq.morph, `${mq.id}: morph propagates into computeHumanBodyDims`);

      const built = buildHumanMannequin(THREE, cat, mq.measurements, { mannequin: mq });
      assert.equal(built.mannequinMeta, mq);
      assert.equal(built.skeleton.bones.length, 17, `${mq.id}: 17-bone skeleton`);

      const topo = analyzeWatertightManifold(built.bodyMesh.geometry);
      assert.equal(topo.degenerate, 0, `${mq.id}: zero degenerate triangles`);
      assert.equal(topo.boundary, 0, `${mq.id}: zero boundary edges`);
      assert.equal(topo.nonManifold, 0, `${mq.id}: zero non-manifold edges`);
      assert.equal(topo.euler, 2, `${mq.id}: euler === 2`);
      assert.ok(topo.signedVolume > 0.012, `${mq.id}: positive volume (${topo.signedVolume.toFixed(4)})`);
      volumes.push(topo.signedVolume);

      const bb = built.bodyMesh.geometry.boundingBox;
      assert.ok(Math.abs(bb.min.y) < 0.002, `${mq.id}: soles grounded at y=0 (got ${bb.min.y})`);
      const expectedH = mq.measurements.height * 0.01;
      assert.ok(Math.abs(bb.max.y - expectedH) < expectedH * 0.025, `${mq.id}: height matches (${bb.max.y.toFixed(3)} vs ${expectedH.toFixed(3)})`);

      // Verify smiling lipMesh present
      let lipMesh = null;
      built.headGroup.traverse((o) => { if (o.isMesh && o.name === 'lipMesh') lipMesh = o; });
      assert.ok(lipMesh, `${mq.id}: smiling lipMesh present`);
      const lp = lipMesh.geometry.attributes.position;
      let centerYSum = 0, centerN = 0, cornerYSum = 0, cornerN = 0, maxAx = 0;
      for (let i = 0; i < lp.count; i++) maxAx = Math.max(maxAx, Math.abs(lp.getX(i)));
      for (let i = 0; i < lp.count; i++) {
        const ax = Math.abs(lp.getX(i)), ly = lp.getY(i);
        if (ax <= maxAx * 0.12) { centerYSum += ly; centerN++; }
        else if (ax >= maxAx * 0.82) { cornerYSum += ly; cornerN++; }
      }
      assert.ok(cornerYSum / cornerN > centerYSum / centerN, `${mq.id}: natural smile lift preserved`);
    }

    for (let i = 0; i < volumes.length - 1; i++) {
      assert.ok(
        volumes[i + 1] > volumes[i],
        `${cat}: ${list[i + 1].size} volume (${volumes[i + 1].toFixed(4)}) must exceed ${list[i].size} (${volumes[i].toFixed(4)})`
      );
    }
  }
});
