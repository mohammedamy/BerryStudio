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
import { getPatternThumbnail, ARCHETYPE_IMAGES } from '../js/thumbnails.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('all archetype images exist on disk in assets/thumbnails', () => {
  for (const [key, filename] of Object.entries(ARCHETYPE_IMAGES)) {
    const fullPath = path.join(projectRoot, 'assets/thumbnails', filename);
    assert.ok(fs.existsSync(fullPath), `Archetype image missing for ${key}: ${fullPath}`);
    const stats = fs.statSync(fullPath);
    assert.ok(stats.size > 1000, `Thumbnail ${filename} is too small (${stats.size} bytes)`);
  }
});

test('every single pattern in LIBRARY (308 patterns) resolves to a valid existing high-res thumbnail', () => {
  assert.ok(LIBRARY.length >= 300, `Expected at least 300 patterns, found ${LIBRARY.length}`);

  let resolvedCount = 0;
  for (const item of LIBRARY) {
    const pattern = PATTERNS[item.id];
    const thumbUrl = getPatternThumbnail(item, pattern);
    assert.ok(thumbUrl && typeof thumbUrl === 'string', `Failed to get thumb for ${item.id}`);

    const fullPath = path.join(projectRoot, thumbUrl);
    assert.ok(fs.existsSync(fullPath), `Thumb file does not exist for ${item.id}: ${fullPath}`);
    resolvedCount++;
  }

  assert.equal(resolvedCount, LIBRARY.length);
});

test('getPatternThumbnail respects custom item.thumb override', () => {
  const custom = { id: 'custom_1', thumb: 'assets/custom.jpg' };
  assert.equal(getPatternThumbnail(custom), 'assets/custom.jpg');
});

test('getPatternThumbnail correctly differentiates men trousers vs shorts', () => {
  const genericPants = { id: 'm14', cat: 'men', type: 'trousers', tag: { en: 'Formal Straight Trousers' } };
  const specificPants = { id: 'm01', cat: 'men', type: 'trousers', tag: { en: 'Trousers' } };
  const shorts = { id: 'm22', cat: 'men', type: 'trousers', tag: { en: 'Shorts' } };

  assert.ok(getPatternThumbnail(genericPants).includes('men_trousers.jpg'));
  assert.ok(getPatternThumbnail(specificPants).includes('m01.jpg'));
  assert.ok(getPatternThumbnail(shorts).includes('men_shorts.jpg'));
});

test('getPatternThumbnail maps athletic gymnastics leotard correctly', () => {
  const leotard = { id: 'gl01', cat: 'girls', type: 'leotard', tag: { en: 'Leotard' } };
  assert.ok(getPatternThumbnail(leotard).includes('girls_leotard.jpg'));
});
