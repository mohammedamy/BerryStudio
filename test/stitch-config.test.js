import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  STITCH_PARTS,
  STITCH_STYLES,
  THREAD_COLOR_PRESETS,
  createDefaultStitchConfig,
  normalizeStitchConfig,
  computeAutoContrastThreadHex,
  resolveStitchThreadColor,
  isExternalStitchPiece,
  mapClothPieceToStitchPart,
} from '../js/stitch-config.js';
import { I18N } from '../js/i18n.js';

test('stitch-config: defaults, normalization, and all 4 stitch styles have valid parameters', () => {
  const def = createDefaultStitchConfig();
  assert.equal(def.enabled, false);
  assert.equal(def.style, 'lockstitch');
  assert.equal(def.visibility, 'external');
  assert.equal(def.defaultColor, '#d99b38');
  assert.equal(def.autoContrast, false);
  assert.equal(Object.keys(def.parts).length, STITCH_PARTS.length);
  for (const part of STITCH_PARTS) {
    assert.equal(def.parts[part.id].enabled, true);
    assert.equal(def.parts[part.id].color, null);
  }

  for (const sid of ['lockstitch', 'twin', 'zigzag', 'saddle']) {
    const s = STITCH_STYLES[sid];
    assert.ok(s && s.dashMm > 0 && s.gapMm > 0 && s.widthMm > 0 && s.liftMm > 0);
  }
  assert.equal(STITCH_STYLES.twin.rows, 2);
  assert.ok(THREAD_COLOR_PRESETS.length >= 10);

  const sanitized = normalizeStitchConfig({
    enabled: 1,
    style: 'bogus',
    visibility: 'bogus',
    defaultColor: '#abc',
    autoContrast: true,
    parts: { sleeve: { enabled: false, color: '#ff00aa' }, invalid: { color: '#111111' } },
    pieceColors: { p1: '#123', p2: 'bad' },
  });
  assert.equal(sanitized.enabled, true);
  assert.equal(sanitized.style, 'lockstitch');
  assert.equal(sanitized.visibility, 'external');
  assert.equal(sanitized.defaultColor, '#aabbcc');
  assert.equal(sanitized.parts.sleeve.enabled, false);
  assert.equal(sanitized.parts.sleeve.color, '#ff00aa');
  assert.equal(sanitized.parts.invalid, undefined);
  assert.equal(sanitized.pieceColors.p1, '#112233');
  assert.equal(sanitized.pieceColors.p2, undefined);
});

test('stitch-config: color precedence resolves pieceColors > parts[part] > lookbook > autoContrast > default', () => {
  const cfg = normalizeStitchConfig({
    enabled: true,
    defaultColor: '#d99b38',
    autoContrast: true,
    parts: { sleeve: { enabled: true, color: '#e11d48' } },
    pieceColors: { customSleeveLeft: '#22c55e' },
  });

  // 1. Per-piece wins over per-part and global
  assert.equal(
    resolveStitchThreadColor({ partKey: 'sleeve', pieceId: 'customSleeveLeft', baseFabricHex: '#111827', stitchConfig: cfg }),
    '#22c55e',
  );
  // 2. Per-part wins over autoContrast and global
  assert.equal(
    resolveStitchThreadColor({ partKey: 'sleeve', pieceId: 'otherSleeve', baseFabricHex: '#ffffff', stitchConfig: cfg }),
    '#e11d48',
  );
  // 3. Auto contrast chooses bright warm gold/cream on dark fabric and charcoal on pale fabric
  assert.equal(computeAutoContrastThreadHex('#141416'), '#e2b259');
  assert.equal(computeAutoContrastThreadHex('#f8fafc'), '#343238');
  assert.equal(
    resolveStitchThreadColor({ partKey: 'bodice', pieceId: 'front', baseFabricHex: '#f8fafc', stitchConfig: cfg }),
    '#343238',
  );
  // 4. Lookbook contrast stitch when user keeps default settings
  const defaultCfg = createDefaultStitchConfig({ enabled: true });
  assert.equal(
    resolveStitchThreadColor({ partKey: 'trousers', stitchConfig: defaultCfg, lookbookContrastHex: '#cc7a2b' }),
    '#cc7a2b',
  );
});

test('stitch-config: distinguishes external visible pieces from linings/interfacing and maps custom designer pieces', () => {
  assert.equal(isExternalStitchPiece({ role: 'bodice-front', label: { en: 'Front Bodice' }, visible: true }), true);
  assert.equal(isExternalStitchPiece({ role: 'placket-facing', label: { en: 'Button Placket' }, visible: true }), true);
  assert.equal(isExternalStitchPiece({ role: 'lining', label: { en: 'Skirt Lining' }, visible: true }), false);
  assert.equal(isExternalStitchPiece({ role: 'facing', label: { en: 'Inner Neck Facing' }, visible: true }), false);
  assert.equal(isExternalStitchPiece({ label: { en: 'Custom Fusible Interfacing', ar: 'فازلين داخلي' }, visible: true }), false);

  assert.equal(mapClothPieceToStitchPart({ id: 'cust1', label: { en: 'Ruffled Peplum Tier' } }), 'skirt');
  assert.equal(mapClothPieceToStitchPart({ id: 'cust2', label: { en: 'Mandarin Collar Stand' } }), 'trim');
  assert.equal(mapClothPieceToStitchPart({ id: 'cust3', label: { en: 'كم فستان واسع' } }), 'sleeve');
  assert.equal(mapClothPieceToStitchPart({ id: 'cust4', label: { en: 'Palazzo Trouser Leg' } }), 'trousers');
  assert.equal(mapClothPieceToStitchPart({ id: 'cust5', label: { en: 'Blazer Jacket Front' } }), 'outer');
  assert.equal(mapClothPieceToStitchPart({ id: 'cust6', label: { en: 'My Custom Panel' } }), 'bodice');
});

test('UI wiring: index.html, css/styles.css, and js/i18n.js contain complete Stitches UI controls & bilingual strings', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('css/styles.css', 'utf8');

  for (const id of ['v3dStitchBtn', 'v3dStitchPanel', 'v3dStitchToggle', 'v3dStitchStyle', 'v3dStitchScope', 'v3dStitchColor', 'v3dStitchAutoContrast', 'v3dStitchSwatches', 'v3dStitchPartsList']) {
    assert.ok(html.includes(`id="${id}"`), `index.html has #${id}`);
  }
  assert.ok(css.includes('.v3d-stitch-panel'), 'styles.css styles .v3d-stitch-panel');

  const keys = ['v3dStitchesShort', 'sewingStitches', 'enableStitches', 'stitchStyle', 'stitchLockstitch', 'stitchTwin', 'stitchZigzag', 'stitchSaddle', 'stitchScope', 'stitchScopeExternal', 'stitchScopeAll', 'stitchGlobalColor', 'stitchAutoContrast', 'stitchPerPartTitle', 'stitchPart_bodice', 'stitchPart_sleeve', 'stitchPart_skirt', 'stitchPart_trousers', 'stitchPart_outer', 'stitchPart_trim'];
  for (const k of keys) {
    assert.ok(I18N.en[k], `I18N.en missing ${k}`);
    assert.ok(I18N.ar[k], `I18N.ar missing ${k}`);
  }
});
