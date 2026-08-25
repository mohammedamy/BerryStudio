import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, BASE, SIZES, KIDS_AGES, STANDARDS, computeMeasurements } from '../js/data.js';
import '../js/reference-patterns.js';
import { run } from '../js/validate.js';
import { offsetPoly } from '../js/geometry.js';
import { _renderUncached } from '../js/pattern-flat.js';

// docs/plan 4.md Phase 2: 12 reference patterns (3 per category) drafted
// to the FULL §7.1 standard. Unlike test/validate-library.test.js's sweep
// over the legacy 264-pattern catalogue (which reports known deferred
// issues rather than asserting them clean — see that file's own header),
// these 12 are the proof that the standard is actually achievable: every
// assertion here is the real §8 gate, not a regression floor. A future
// phase extending the idiom to the 100/64/100/44-pattern collections
// should hold to the same bar these tests check.
const REFERENCE_IDS = ['ref_w_blouse', 'ref_w_skirt', 'ref_w_shirtdress', 'ref_m_tee', 'ref_m_trousers', 'ref_m_shirt', 'ref_g_top', 'ref_g_skirt', 'ref_g_shirtdress', 'ref_b_tee', 'ref_b_shorts', 'ref_b_shirt'];

const ROLE_VOCABULARY = new Set([
  'front-panel', 'back-panel', 'hip-panel-front', 'hip-panel-back', 'sleeve',
  'brief-front', 'brief-back',
  'bodice-front-center', 'bodice-front-side', 'bodice-back-center', 'bodice-back-side',
  'skirt-front-gore', 'skirt-back-gore', 'skirt-side-gore-left', 'skirt-side-gore-right',
  'sleeve-upper', 'sleeve-under', 'cap-sleeve', 'puff-sleeve', 'butterfly-sleeve',
  'collar', 'undercollar', 'collar-stand', 'collar-band', 'lapel-facing', 'placket-facing',
  'hood', 'cape', 'cape-overlay', 'yoke', 'epaulette',
  'peplum-front', 'peplum-back', 'sash', 'wrap-tie', 'belt', 'waistband',
  'godet', 'tier', 'pocket', 'facing', 'lining', 'cuff', 'rib-cuff', 'hem-band', 'other',
]);

test('all 12 reference patterns are registered', () => {
  for (const id of REFERENCE_IDS) assert.ok(PATTERNS[id], `${id} missing from PATTERNS`);
  assert.equal(Object.keys(PATTERNS).filter((id) => id.startsWith('ref_')).length, 12, 'expected exactly 12 ref_ patterns — update REFERENCE_IDS deliberately if this changed on purpose');
});

test('every reference pattern validates with zero failures at size M', () => {
  const allFails = [];
  let totalPieces = 0;
  for (const id of REFERENCE_IDS) {
    const entry = PATTERNS[id];
    const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl' });
    let pieces;
    try {
      pieces = entry.pieces(m);
    } catch (e) {
      allFails.push(`${id}: pieces(m) threw: ${e.message}`);
      continue;
    }
    totalPieces += pieces.length;
    const report = run(pieces, { seamAllowanceCm: 1, offsetPoly, bodyChestCm: BASE[entry.category].chest });
    const collect = (items) => items.forEach((item) => {
      Object.entries(item.checks).forEach(([checkName, result]) => {
        if (result.status === 'fail') allFails.push(`${id}: ${item.label} — ${checkName}: ${result.message}`);
      });
    });
    collect(report.perPiece);
    collect(report.crossPiece);
  }
  console.log(`  ${REFERENCE_IDS.length} reference patterns / ${totalPieces} pieces, 0 failures required`);
  assert.deepEqual(allFails, [], `reference patterns must validate with zero failures:\n${allFails.join('\n')}`);
});

test('every piece declares a role from the 46-value vocabulary', () => {
  const bad = [];
  let total = 0;
  for (const id of REFERENCE_IDS) {
    const entry = PATTERNS[id];
    const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl' });
    entry.pieces(m).forEach((piece) => {
      total++;
      if (!piece.role || !ROLE_VOCABULARY.has(piece.role)) bad.push(`${id}/${piece.key}: role "${piece.role}"`);
    });
  }
  console.log(`  ${total} pieces, all must declare a valid role`);
  assert.deepEqual(bad, [], `piece(s) with no/invalid role:\n${bad.join('\n')}`);
});

test('every design carries at least one real construction feature beyond a plain panel', () => {
  // docs/plan 4.md §8 gate 17 — dart, princess/raglan seam (via a
  // declared edges[].seamId), yoke, placket, collar, cuff, waistband,
  // pocket, godet, gusset, peplum or tier.
  const FEATURE_ROLES = new Set(['yoke', 'placket-facing', 'collar', 'collar-stand', 'collar-band', 'undercollar', 'cuff', 'rib-cuff', 'hem-band', 'waistband', 'pocket', 'godet', 'tier', 'peplum-front', 'peplum-back']);
  const missing = [];
  for (const id of REFERENCE_IDS) {
    const entry = PATTERNS[id];
    const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl' });
    const pieces = entry.pieces(m);
    const hasDart = pieces.some((p) => (p.darts || []).length > 0);
    const hasSeamId = pieces.some((p) => (p.edges || []).some((e) => e.seamId));
    const hasFeatureRole = pieces.some((p) => FEATURE_ROLES.has(p.role));
    if (!hasDart && !hasSeamId && !hasFeatureRole) missing.push(id);
  }
  assert.deepEqual(missing, [], `pattern(s) with no real construction feature: ${missing.join(', ')}`);
});

test('at least 80% of pieces carry notches, and every notch lies on its own outline', () => {
  let total = 0, withNotches = 0;
  const offOutline = [];
  for (const id of REFERENCE_IDS) {
    const entry = PATTERNS[id];
    const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl' });
    entry.pieces(m).forEach((piece) => {
      total++;
      const notches = piece.notches || [];
      if (notches.length) withNotches++;
      for (const n of notches) {
        // "On the outline" — within a small tolerance of the nearest
        // edge, matching checkNotchAlignment's own arc-position math
        // rather than requiring an exact vertex.
        const onEdge = piece.outline.some((pt, i) => {
          const nxt = piece.outline[(i + 1) % piece.outline.length];
          const abx = nxt[0] - pt[0], aby = nxt[1] - pt[1];
          const len2 = abx * abx + aby * aby || 1e-9;
          let t = ((n[0] - pt[0]) * abx + (n[1] - pt[1]) * aby) / len2;
          t = Math.max(0, Math.min(1, t));
          const cx = pt[0] + abx * t, cy = pt[1] + aby * t;
          return Math.hypot(n[0] - cx, n[1] - cy) < 0.01;
        });
        if (!onEdge) offOutline.push(`${id}/${piece.key}: notch [${n}] not on outline`);
      }
    });
  }
  const pct = (100 * withNotches) / total;
  console.log(`  notch coverage: ${withNotches}/${total} (${pct.toFixed(1)}%)`);
  assert.deepEqual(offOutline, [], `notch(es) not on their own piece outline:\n${offOutline.join('\n')}`);
  assert.ok(pct >= 80, `notch coverage ${pct.toFixed(1)}% is below the 80% target`);
});

test('every pattern and piece is fully bilingual', () => {
  const missing = [];
  const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
  for (const id of REFERENCE_IDS) {
    const entry = PATTERNS[id];
    if (!nonEmpty(entry.name.en) || !nonEmpty(entry.name.ar)) missing.push(`${id}: pattern name`);
    if (!nonEmpty(entry.desc.en) || !nonEmpty(entry.desc.ar)) missing.push(`${id}: pattern desc`);
    const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl' });
    entry.pieces(m).forEach((piece) => {
      if (!nonEmpty(piece.name && piece.name.en) || !nonEmpty(piece.name && piece.name.ar)) missing.push(`${id}/${piece.key}: name`);
      if (!nonEmpty(piece.desc && piece.desc.en) || !nonEmpty(piece.desc && piece.desc.ar)) missing.push(`${id}/${piece.key}: desc`);
    });
  }
  assert.deepEqual(missing, [], `bilingual gaps:\n${missing.join('\n')}`);
});

test('every reference pattern composes a distinct generated thumbnail', () => {
  const seen = new Map();
  const dupes = [];
  const declined = [];
  for (const id of REFERENCE_IDS) {
    const svg = _renderUncached(id);
    if (svg == null) { declined.push(id); continue; }
    if (seen.has(svg)) dupes.push(`${id} duplicates ${seen.get(svg)}`);
    else seen.set(svg, id);
  }
  assert.deepEqual(declined, [], `pattern(s) failed to compose a thumbnail: ${declined.join(', ')}`);
  assert.deepEqual(dupes, [], `identical thumbnails: ${dupes.join('; ')}`);
});

test('grading stays clean (no self-intersection, no degeneracy) at XXS/M/6XL × intl/egypt/saudi for the adult patterns', () => {
  const failures = [];
  const adultIds = REFERENCE_IDS.filter((id) => ['women', 'men'].includes(PATTERNS[id].category));
  for (const id of adultIds) {
    const entry = PATTERNS[id];
    for (const size of ['XXS', 'M', '6XL']) {
      for (const standard of Object.keys(STANDARDS)) {
        const m = computeMeasurements({ category: entry.category, size, standard });
        let pieces;
        try {
          pieces = entry.pieces(m);
        } catch (e) {
          failures.push(`${id} @ ${size}/${standard}: threw: ${e.message}`);
          continue;
        }
        const report = run(pieces);
        report.perPiece.forEach((item) => {
          if (item.checks.selfIntersection.status === 'fail') failures.push(`${id} @ ${size}/${standard}: "${item.label}" self-intersects`);
          if (item.checks.closedOutline.status === 'fail') failures.push(`${id} @ ${size}/${standard}: "${item.label}" ${item.checks.closedOutline.message}`);
        });
      }
    }
  }
  assert.deepEqual(failures, [], `grading defects:\n${failures.join('\n')}`);
});

test('grading stays clean across all 7 KIDS_AGES bands for the girls/boys patterns', () => {
  assert.equal(KIDS_AGES.length, 7);
  const failures = [];
  const kidsIds = REFERENCE_IDS.filter((id) => ['girls', 'boys'].includes(PATTERNS[id].category));
  for (const id of kidsIds) {
    const entry = PATTERNS[id];
    for (const age of KIDS_AGES) {
      const m = computeMeasurements({ category: entry.category, size: 'M', standard: 'intl', kids: age.id });
      let pieces;
      try {
        pieces = entry.pieces(m);
      } catch (e) {
        failures.push(`${id} @ kids:${age.id}: threw: ${e.message}`);
        continue;
      }
      const report = run(pieces);
      report.perPiece.forEach((item) => {
        if (item.checks.selfIntersection.status === 'fail') failures.push(`${id} @ kids:${age.id}: "${item.label}" self-intersects`);
      });
    }
  }
  assert.deepEqual(failures, [], `grading defects across kids age bands:\n${failures.join('\n')}`);
});

test('SIZES still has M at index 3', () => {
  assert.equal(SIZES[3], 'M');
});
