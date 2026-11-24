import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATTERNS, LIBRARY, computeMeasurements } from '../js/data.js';
import '../js/library.js';
import '../js/fancy-patterns.js';
import '../js/girls-leotards.js';
import '../js/underwear-library.js';
import '../js/reference-patterns.js';
import '../js/abaya-collection.js';
import { getPatternLookbookStyle, applyLookbookPieceColors } from '../js/pattern-lookbook-styles.js';
import { PATTERN_SPECIFIC_THUMBS } from '../js/thumbnails.js';
import { computePatternMetrics3D } from '../js/pattern-3d-metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const girlsLeotardsSrc = fs.readFileSync(path.resolve(__dirname, '../js/girls-leotards.js'), 'utf8');

function makeM(cat) {
  const isKids = cat === 'girls' || cat === 'boys';
  return computeMeasurements({ category: cat, size: isKids ? '8Y' : 'M', standard: 'egyptian', kids: isKids });
}

function getMetrics(id) {
  const pat = PATTERNS[id];
  const m = makeM(pat.category);
  const lb = getPatternLookbookStyle(id, pat);
  const pcs = applyLookbookPieceColors(pat.pieces(m).map((p) => ({ ...p, visible: true })), id, pat);
  return { pat, m, lb, pcs, met: computePatternMetrics3D(pcs, m, pat.category, pat, lb) };
}

test('all 340 patterns exist in both PATTERNS and LIBRARY with 1:1 unique lookbook thumbnails', () => {
  const ids = Object.keys(PATTERNS);
  assert.equal(ids.length, 340);
  assert.equal(LIBRARY.length, 340);
  for (const id of ids) {
    assert.ok(PATTERN_SPECIFIC_THUMBS[id], `missing thumbnail map for ${id}`);
  }
});

test('all 100 girls leotards (gy001..gy100) have zero drift between girls-leotards.js and pattern-lookbook-styles.js', () => {
  const re = /\{\s*id:"(gy\d+)".*?neckline:"([^"]+)".*?backStyle:"([^"]+)".*?legHeight:"([^"]+)".*?skirt:(true|false).*?colorBlock:"([^"]+)".*?sleeveKey:"([^"]+)"/g;
  let match;
  let count = 0;
  while ((match = re.exec(girlsLeotardsSrc))) {
    count++;
    const [, id, neck, back, leg, skirtStr, blk, slv] = match;
    const pat = PATTERNS[id];
    const lb = getPatternLookbookStyle(id, pat);
    const leo = lb?.silhouette?.leotard || {};
    assert.equal(leo.neckline, neck, `${id} neckline drift`);
    assert.equal(leo.backStyle, back, `${id} backStyle drift`);
    assert.equal(leo.legHeight, leg, `${id} legHeight drift`);
    assert.equal(Boolean(leo.skirt), skirtStr === 'true', `${id} skirt drift`);
    assert.equal(leo.colorBlock, blk, `${id} colorBlock drift`);
    assert.equal(leo.sleeveKey, slv, `${id} sleeveKey drift`);
  }
  assert.equal(count, 100);
});

test('long-sleeve garments produce full sleeve length (>= 0.84) and short-sleeve shirts match half sleeves', () => {
  const longIds = ['w11', 'w16', 'w18', 'w21', 'm07', 'm08', 'm13', 'm16', 'm20', 'g07', 'b06', 'b11', 'b14', 'b20', 'b22', 'wf09'];
  for (const id of longIds) {
    const { met } = getMetrics(id);
    assert.equal(met.present.sleeve, true, `${id} must have sleeves`);
    assert.ok(met.sleeve.lengthFrac >= 0.84, `${id} long sleeve too short: ${met.sleeve.lengthFrac}`);
  }
  for (const id of ['m03', 'b01']) {
    const { met } = getMetrics(id);
    assert.ok(met.sleeve.lengthFrac >= 0.26 && met.sleeve.lengthFrac <= 0.45, `${id} short sleeve out of range: ${met.sleeve.lengthFrac}`);
  }
  assert.equal(getMetrics('w17').met.sleeve.style, 'fitted', 'w17 3/4 sleeve stays fitted');
  assert.equal(getMetrics('w18').met.sleeve.isColdShoulder, true, 'w18 triggers 3D cold-shoulder cutout');
  for (const id of ['gy008', 'gy015', 'gy020', 'gy031', 'gy051', 'gy062', 'gy064']) {
    const { met } = getMetrics(id);
    assert.ok(met.sleeve.lengthFrac <= 0.42, `${id} short-sleeve leotard too long: ${met.sleeve.lengthFrac}`);
  }
  for (const id of ['gy037', 'gy046', 'gy058', 'gy074']) {
    const { met } = getMetrics(id);
    assert.equal(met.present.sleeve, false, `${id} must be sleeveless per thumbnail`);
  }
  for (const id of ['gy006', 'gy008']) {
    const { met } = getMetrics(id);
    assert.equal(met.present.skirt, false, `${id} must not have extra skirt per thumbnail`);
  }
});

test('cropped tops, culottes, cropped trousers, polo collars, and hoodie hood match thumbnails', () => {
  for (const id of ['w13', 'g23']) {
    assert.equal(getMetrics(id).met.bodice.style, 'crop', `${id} must be crop in 3D`);
  }
  assert.ok(getMetrics('w20').met.trousers.inseamFrac <= 0.76, 'w20 culottes must be cropped below calf');
  assert.ok(getMetrics('m15').met.trousers.inseamFrac <= 0.86, 'm15 cropped trousers must stop above ankle');
  for (const id of ['m10', 'b10']) {
    const { pcs, met } = getMetrics(id);
    assert.ok(pcs.some((p) => p.role === 'collar'), `${id} must include collar piece`);
    assert.ok(pcs.some((p) => p.role === 'placket-facing'), `${id} must include placket piece`);
    assert.equal(met.bodice.hasCollar, true, `${id} must have collar in 3D`);
  }
  const b06 = getMetrics('b06');
  assert.ok(b06.pcs.some((p) => p.role === 'hood'), 'b06 must include hood piece');
  assert.equal(b06.met.bodice.hasHood, true, 'b06 must have hood in 3D');
  assert.equal(b06.met.bodice.hasCollar, false, 'b06 hoodie must not have pointed shirt collar');
});

test('girls floor gowns, blazer/coat dresses, jumpsuits, and false-collar guards stay synchronized', () => {
  for (const id of ['gf01', 'gf02', 'gf03', 'gf06', 'gf08', 'gf11', 'gf12', 'gf15']) {
    const { m, met } = getMetrics(id);
    assert.equal(met.present.skirt, true, `${id} skirt must be present`);
    assert.ok(met.skirt.lengthCm >= m.inseam * 1.05, `${id} gown skirt too short (${met.skirt.lengthCm}cm vs inseam ${m.inseam}cm)`);
  }
  for (const id of ['wf06', 'gf05', 'gf14', 'gf16']) {
    const { met } = getMetrics(id);
    assert.equal(met.present.skirt, true, `${id} blazer/coat dress must render lower skirt`);
  }
  for (const id of ['wf08', 'gf13', 'wf11']) {
    assert.equal(getMetrics(id).met.bodice.style, 'waist', `${id} must have waist bodice`);
  }
  for (const id of ['bf06', 'bf10', 'bf11', 'bf14', 'm08', 'm18']) {
    assert.equal(getMetrics(id).met.bodice.style, 'tunic', `${id} coat/tunic must use tunic length`);
  }
  for (const id of ['ref_m_tee', 'ref_b_tee', 'b06', 'wf04', 'wf07', 'wf10', 'wf11', 'wf14', 'gf02', 'gf07', 'gf11', 'gf12', 'gf13']) {
    // Only collared patterns should emit a collar
    const expectedCollar = id === 'gf13' || id === 'wf14';
    assert.equal(getMetrics(id).met.bodice.hasCollar, expectedCollar, `${id} hasCollar mismatch`);
  }
});
