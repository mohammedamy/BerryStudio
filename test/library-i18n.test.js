import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, LIBRARY, computeMeasurements } from '../js/data.js';
import '../js/library.js';
import '../js/girls-leotards.js';
import { FancyGen } from '../js/fancy-patterns.js';
import '../js/underwear-library.js';

void FancyGen; // side-effect import only

// docs/plan 4.md §7.2/§8 gate 12: "Every pattern and piece has non-empty
// en AND ar name and desc." Unlike test/library-roles.test.js and
// test/library-thumbnails.test.js, this one already passes 100% clean
// across the full 308-pattern catalogue (measured 2026-08-22) — so unlike
// those two, this asserts the REAL final gate outright, not a regression
// floor, on the theory that a check the library already satisfies should
// never be allowed to regress even partially. Bilingual completeness for
// any pattern or piece a future phase adds is exactly as non-negotiable
// as it is for the ones that exist today.
//
// Directional control characters (RTL/LRM/etc. embedded in the text
// itself) are checked for separately — §7.2 is explicit that RTL is a
// rendering concern already handled by the app, not something pattern
// data should encode.
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
// U+200E..200F (LRM/RLM), U+202A..202E (embedding/override), U+2066..2069
// (isolates) — the full set of Unicode bidi control characters.
const BIDI_CONTROL_RE = /[‎‏‪-‮⁦-⁩]/;

test('every pattern (name/desc) and LIBRARY entry (tag) is fully bilingual', () => {
  const missing = [];
  for (const entry of LIBRARY) {
    const p = PATTERNS[entry.id];
    if (!p) { missing.push(`${entry.id}: no matching PATTERNS entry for this LIBRARY row`); continue; }
    if (!nonEmpty(p.name && p.name.en)) missing.push(`${entry.id}: pattern name.en empty`);
    if (!nonEmpty(p.name && p.name.ar)) missing.push(`${entry.id}: pattern name.ar empty`);
    if (!nonEmpty(p.desc && p.desc.en)) missing.push(`${entry.id}: pattern desc.en empty`);
    if (!nonEmpty(p.desc && p.desc.ar)) missing.push(`${entry.id}: pattern desc.ar empty`);
    if (!nonEmpty(entry.tag && entry.tag.en)) missing.push(`${entry.id}: LIBRARY tag.en empty`);
    if (!nonEmpty(entry.tag && entry.tag.ar)) missing.push(`${entry.id}: LIBRARY tag.ar empty`);
  }
  assert.deepEqual(missing, [], `bilingual gaps found:\n${missing.join('\n')}`);
});

test('every piece of every pattern is fully bilingual (name and desc)', () => {
  const missing = [];
  let pieceCount = 0;
  for (const id of Object.keys(PATTERNS)) {
    const entry = PATTERNS[id];
    const category = entry.category || 'women';
    const m = computeMeasurements({ category, size: 'M', standard: 'intl' });
    const pieces = entry.pieces(m);
    pieces.forEach((piece, i) => {
      pieceCount++;
      const label = piece.key || `piece[${i}]`;
      if (!nonEmpty(piece.name && piece.name.en)) missing.push(`${id}/${label}: name.en empty`);
      if (!nonEmpty(piece.name && piece.name.ar)) missing.push(`${id}/${label}: name.ar empty`);
      if (!nonEmpty(piece.desc && piece.desc.en)) missing.push(`${id}/${label}: desc.en empty`);
      if (!nonEmpty(piece.desc && piece.desc.ar)) missing.push(`${id}/${label}: desc.ar empty`);
    });
  }
  console.log(`  checked ${pieceCount} pieces across ${Object.keys(PATTERNS).length} patterns`);
  assert.deepEqual(missing, [], `bilingual gaps found:\n${missing.slice(0, 40).join('\n')}${missing.length > 40 ? `\n  ...and ${missing.length - 40} more` : ''}`);
});

test('no pattern/piece name or desc embeds a directional control character', () => {
  const offenders = [];
  const check = (label, s) => { if (typeof s === 'string' && BIDI_CONTROL_RE.test(s)) offenders.push(label); };
  for (const id of Object.keys(PATTERNS)) {
    const entry = PATTERNS[id];
    check(`${id}: name.en`, entry.name && entry.name.en);
    check(`${id}: name.ar`, entry.name && entry.name.ar);
    check(`${id}: desc.en`, entry.desc && entry.desc.en);
    check(`${id}: desc.ar`, entry.desc && entry.desc.ar);
    const category = entry.category || 'women';
    const m = computeMeasurements({ category, size: 'M', standard: 'intl' });
    entry.pieces(m).forEach((piece, i) => {
      const label = piece.key || `piece[${i}]`;
      check(`${id}/${label}: name.en`, piece.name && piece.name.en);
      check(`${id}/${label}: name.ar`, piece.name && piece.name.ar);
      check(`${id}/${label}: desc.en`, piece.desc && piece.desc.en);
      check(`${id}/${label}: desc.ar`, piece.desc && piece.desc.ar);
    });
  }
  assert.deepEqual(offenders, [], `directional control characters found in:\n${offenders.join('\n')}`);
});
