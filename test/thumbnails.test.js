import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATTERNS, LIBRARY } from '../js/data.js';
import '../js/library.js';
import '../js/girls-leotards.js';
import '../js/fancy-patterns.js';
import '../js/underwear-library.js';
import { getPatternThumbnail, ARCHETYPE_IMAGES, PATTERN_SPECIFIC_THUMBS } from '../js/thumbnails.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('all assigned images exist on disk in assets/thumbnails', () => {
  for (const [key, filename] of Object.entries(PATTERN_SPECIFIC_THUMBS)) {
    const fullPath = path.join(projectRoot, 'assets/thumbnails', filename);
    assert.ok(fs.existsSync(fullPath), `Thumbnail image missing for ${key}: ${fullPath}`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size > 1000, `Thumbnail ${filename} is too small (${stats.size} bytes)`);
  }
});

test('every assigned photo in PATTERN_SPECIFIC_THUMBS is unique (zero repetitions)', () => {
  const values = Object.values(PATTERN_SPECIFIC_THUMBS);
  const unique = new Set(values);
  assert.equal(unique.size, values.length, `Expected all assigned photos to be unique, but found ${values.length - unique.size} duplicate(s)`);
  assert.ok(unique.size >= 68, `Expected at least 68 unique lookbook photos, got ${unique.size}`);
});

test('no generic archetype fallback filenames are used in PATTERN_SPECIFIC_THUMBS', () => {
  const genericPrefixes = ['women_', 'men_', 'girls_', 'boys_'];
  for (const [id, file] of Object.entries(PATTERN_SPECIFIC_THUMBS)) {
    // Base garments named exactly like the pattern (e.g. girls_dress.jpg for girls_dress) are valid
    if (file === `${id}.jpg`) continue;
    const isGeneric = genericPrefixes.some(p => file.startsWith(p));
    assert.ok(!isGeneric, `Pattern ${id} must not use generic archetype thumbnail ${file}`);
  }
});

test('ghost mannequin intimate garments and leotard are assigned unique dedicated photos', () => {
  const intimate = ['wu01', 'wb01', 'mu01', 'bu01', 'gu01', 'gy001'];
  for (const id of intimate) {
    assert.equal(PATTERN_SPECIFIC_THUMBS[id], `${id}.jpg`, `Expected ${id} to map to ${id}.jpg`);
  }
});

test('getPatternThumbnail respects custom item.thumb override', () => {
  const custom = { id: 'custom_1', thumb: 'assets/custom.jpg' };
  assert.equal(getPatternThumbnail(custom), 'assets/custom.jpg');
});

test('getPatternThumbnail returns null for unassigned patterns to avoid duplicate thumbnails', () => {
  const unassigned = { id: 'gy045', cat: 'girls', type: 'leotard' };
  assert.equal(getPatternThumbnail(unassigned), null);
});

test('every single pattern in LIBRARY (308 patterns) has either an exclusive photo or a unique flat', async () => {
  const { renderPatternFlat } = await import('../js/pattern-flat.js');
  assert.ok(LIBRARY.length >= 300, `Expected at least 300 patterns, found ${LIBRARY.length}`);

  let resolvedCount = 0;
  for (const item of LIBRARY) {
    const pattern = PATTERNS[item.id];
    const thumbUrl = getPatternThumbnail(item, pattern);
    const flatSvg = renderPatternFlat(item.id, item);

    assert.ok(thumbUrl || flatSvg, `Pattern ${item.id} has neither a photo nor a flat`);
    if (thumbUrl) {
      const fullPath = path.join(projectRoot, thumbUrl);
      assert.ok(fs.existsSync(fullPath), `Thumb file does not exist for ${item.id}: ${fullPath}`);
    } else {
      assert.ok(flatSvg.startsWith('<svg'), `Flat SVG is invalid for ${item.id}`);
    }
    resolvedCount++;
  }

  assert.equal(resolvedCount, LIBRARY.length);
});
