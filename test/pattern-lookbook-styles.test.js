import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, computeMeasurements } from '../js/data.js';
import '../js/library.js';
import '../js/girls-leotards.js';
import '../js/fancy-patterns.js';
import '../js/underwear-library.js';
import '../js/reference-patterns.js';
import {
  PATTERN_LOOKBOOK_STYLES,
  getPatternLookbookStyle,
  applyLookbookPieceColors,
} from '../js/pattern-lookbook-styles.js';
import {
  resolvePartsFabric3D,
  computePatternMetrics3D,
} from '../js/pattern-3d-metrics.js';

const VALID_FABRICS = new Set([
  'cotton', 'denim', 'silk', 'satin', 'chiffon', 'wool',
  'linen', 'leather', 'jersey', 'scuba', 'tulle', 'velvet', 'lace',
]);

const HEX_RE = /^#[0-9a-f]{6}$/i

function parseHex(c) {
  if (typeof c === 'number') return c
  if (!c) return 0x4f46e5
  const s = String(c).trim()
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).split('').map((x) => x + x).join('') : s.slice(1)
    return parseInt(h, 16)
  }
  return 0x4f46e5
}

function assertHex(val, label) {
  if (val == null) return;
  assert.match(String(val), HEX_RE, `${label}: expected #rrggbb hex, got ${val}`);
}

function makeMeasurements(category) {
  const isKids = category === 'girls' || category === 'boys';
  return computeMeasurements({
    category,
    size: 'M',
    standard: 'intl',
    kids: isKids ? '8-9' : undefined,
  });
}

test('PATTERN_LOOKBOOK_STYLES has exact 1:1 coverage across all 320 PATTERNS with valid fabrics and hex colors', () => {
  const patIds = new Set(Object.keys(PATTERNS));
  const styleIds = new Set(Object.keys(PATTERN_LOOKBOOK_STYLES));
  assert.equal(patIds.size, 320, 'expected 320 PATTERNS');
  const missing = [...patIds].filter((id) => !styleIds.has(id));
  const extra = [...styleIds].filter((id) => !patIds.has(id));
  assert.deepEqual(missing, [], `missing lookbook styles: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `unexpected lookbook styles: ${extra.join(', ')}`);

  for (const [id, st] of Object.entries(PATTERN_LOOKBOOK_STYLES)) {
    assert.ok(VALID_FABRICS.has(st.fabric), `${id}: invalid fabric "${st.fabric}"`);
    assertHex(st.primaryColor, `${id}.primaryColor`);
    assertHex(st.secondaryColor, `${id}.secondaryColor`);
    assertHex(st.trimColor, `${id}.trimColor`);

    if (st.partColors) {
      for (const [part, hex] of Object.entries(st.partColors)) {
        assertHex(hex, `${id}.partColors.${part}`);
      }
    }
    if (st.print?.colors) {
      for (let i = 0; i < st.print.colors.length; i++) {
        assertHex(st.print.colors[i], `${id}.print.colors[${i}]`);
      }
    }
    if (st.print?.palette) {
      for (let i = 0; i < st.print.palette.length; i++) {
        assertHex(st.print.palette[i], `${id}.print.palette[${i}]`);
      }
    }
    if (st.silhouette) {
      assertHex(st.silhouette.sashColor, `${id}.silhouette.sashColor`);
      assertHex(st.silhouette.waistbandColor, `${id}.silhouette.waistbandColor`);
      assertHex(st.silhouette.cuffColor, `${id}.silhouette.cuffColor`);
      if (st.silhouette.outerLayer) {
        assertHex(st.silhouette.outerLayer.color, `${id}.silhouette.outerLayer.color`);
        assertHex(st.silhouette.outerLayer.lapelColor, `${id}.silhouette.outerLayer.lapelColor`);
        assertHex(st.silhouette.outerLayer.innerColor, `${id}.silhouette.outerLayer.innerColor`);
      }
      if (st.silhouette.leotard) {
        assertHex(st.silhouette.leotard.skirtColor, `${id}.silhouette.leotard.skirtColor`);
      }
    }
    if (st.accessories?.belt?.color) assertHex(st.accessories.belt.color, `${id}.accessories.belt.color`);
    if (st.accessories?.bow?.color) assertHex(st.accessories.bow.color, `${id}.accessories.bow.color`);
  }
});

test('applyLookbookPieceColors sets lookbookColor=true, customColor=false, and never mutates outlines or edges', () => {
  for (const id of ['womens_dress', 'gy001', 'mf05', 'wb02', 'wf09', 'ref_w_shirtdress']) {
    const pat = PATTERNS[id];
    const m = makeMeasurements(pat.category);
    const orig = pat.pieces(m).map((p) => ({ ...p, customColor: false, visible: true }));
    const snapBefore = orig.map((p) => ({ outline: p.outline, curves: p.curves, edges: p.edges }));
    const styled = applyLookbookPieceColors(orig, id, pat);
    assert.equal(styled.length, orig.length);
    styled.forEach((p, idx) => {
      assert.equal(p.lookbookColor, true, `${id}[${idx}] lookbookColor`);
      assert.equal(p.customColor, false, `${id}[${idx}] customColor`);
      assert.match(String(p.color), HEX_RE, `${id}[${idx}] color`);
      assert.deepEqual(p.outline, snapBefore[idx].outline);
      assert.deepEqual(p.curves, snapBefore[idx].curves);
      assert.deepEqual(p.edges, snapBefore[idx].edges);
    });
  }
});

test('resolvePartsFabric3D keeps default palette sync without lookbookStyle AND honors lookbookStyle + outer/trim parts', () => {
  const m = makeMeasurements('women');
  const raw = PATTERNS.womens_dress.pieces(m).map((p, i) => ({
    ...p,
    color: ['#4f46e5', '#db2777', '#059669'][i % 3],
    customColor: false,
    visible: true,
  }));
  const fallback = resolvePartsFabric3D(raw, { defaultColor: '#4f46e5', defaultMaterial: 'cotton', colorToInt: parseHex });
  assert.equal(fallback.bodice.front.color, 0x4f46e5);
  assert.equal(fallback.sleeve.front.color, 0x4f46e5);
  assert.equal(fallback.outer, undefined);

  const mf11 = PATTERNS.mf11;
  const mf11Style = getPatternLookbookStyle('mf11', mf11);
  const mf11Styled = applyLookbookPieceColors(mf11.pieces(makeMeasurements('men')).map((p) => ({ ...p, visible: true })), 'mf11', mf11);
  const mf11Parts = resolvePartsFabric3D(mf11Styled, {
    defaultColor: mf11Style.primaryColor,
    defaultMaterial: mf11Style.fabric,
    lookbookStyle: mf11Style,
    colorToInt: parseHex,
  });
  assert.ok(mf11Parts.outer?.front?.color, 'mf11 outer jacket slot populated');
  assert.ok(mf11Parts.trim?.front?.color, 'mf11 trim slot populated');
  assert.notEqual(mf11Parts.bodice.front.color, mf11Parts.outer.front.color, 'inner tee contrasts outer denim jacket');

  // Clearing lookbookColor across pieces (e.g. unified 3D color picker) lets unified hex override lookbook palette
  const clearedPieces = styledPieces(mf11, 'mf11', '#b91c1c');
  const clearedParts = resolvePartsFabric3D(clearedPieces, {
    defaultColor: mf11Style.primaryColor,
    defaultMaterial: mf11Style.fabric,
    lookbookStyle: mf11Style,
    colorToInt: parseHex,
  });
  assert.equal(clearedParts.bodice.front.color, 0xb91c1c);
  assert.equal(clearedParts.sleeve.front.color, 0xb91c1c);
});

function styledPieces(pat, id, hex) {
  const m = makeMeasurements(pat.category);
  return applyLookbookPieceColors(pat.pieces(m).map((p) => ({ ...p, visible: true })), id, pat)
    .map((p) => ({ ...p, color: hex, customColor: false, lookbookColor: false }));
}

test('computePatternMetrics3D emits specialized lookbook descriptors for leotards, bras, suits, tiered dresses, and briefs', () => {
  const specs = [
    ['gy001', (r) => { assert.ok(r.bodice.leotard && r.bodice.style === 'leotard', 'gy001 leotard'); assert.equal(r.present.trousers, false, 'gy001 must not trigger trousers for Leg Opening Binding'); }],
    ['gy007', (r) => { assert.ok(r.bodice.leotard?.skirt && r.bodice.style === 'leotard', 'gy007 skirted leotard'); assert.equal(r.present.trousers, false, 'gy007 must not trigger trousers for Leg Opening Binding'); }],
    ['wf01', (r) => { assert.equal(r.bodice.style, 'waist', 'wf01 ballgown bodice must not trigger bra'); assert.equal(r.present.skirt, true, 'wf01 ballgown skirt present'); assert.ok(r.skirt.lengthCm > 80, 'wf01 floor-length skirt'); }],
    ['wb02', (r) => assert.ok(r.bodice.bra && r.bodice.style === 'bra', 'wb02 bra')],
    ['wb09', (r) => assert.equal(r.bodice.bra?.style, 'sport', 'wb09 sport bra')],
    ['mf05', (r) => assert.ok(r.bodice.outerLayer?.enabled, 'mf05 outerLayer')],
    ['mf11', (r) => assert.ok(r.bodice.outerLayer?.enabled && r.bodice.outerLayer.style === 'jacket', 'mf11 outerLayer denim jacket')],
    ['mf14', (r) => assert.equal(r.bodice.outerLayer?.style, 'bisht', 'mf14 bisht')],
    ['mf16', (r) => assert.ok(r.bodice.outerLayer?.enabled && r.bodice.hasHood, 'mf16 parka outerLayer+hood')],
    ['wf04', (r) => assert.ok(r.skirt.tiers >= 2, 'wf04 multi-tier skirt')],
    ['wf09', (r) => assert.equal(r.bodice.lapelStyle, 'notched', 'wf09 notched trench lapels')],
    ['gf01', (r) => assert.ok(r.skirt.tiers >= 2, 'gf01 tiers')],
    ['bu01', (r) => assert.equal(r.trousers.briefCut, 'boxer', 'bu01 boxer cut')],
    ['mu03', (r) => assert.ok(r.trousers.isBrief || r.trousers.briefCut, 'mu03 brief/trunk cut')],
    ['wu03', (r) => assert.equal(r.trousers.briefRise, 'low', 'wu03 low rise')],
  ];
  for (const [id, verify] of specs) {
    const pat = PATTERNS[id];
    const m = makeMeasurements(pat.category);
    const lb = getPatternLookbookStyle(id, pat);
    const pieces = applyLookbookPieceColors(pat.pieces(m).map((p) => ({ ...p, visible: true })), id, pat);
    const metrics = computePatternMetrics3D(pieces, m, pat.category, pat, lb);
    verify(metrics);
  }
});
