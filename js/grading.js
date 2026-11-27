/* ============================================================
   WP-13: Industrial grading — optional per-point grade rules
   layered on top of the existing formula-based size engine.

   Today every measurement (computeMeasurements in data.js) grades by
   one flat cm-per-step value applied uniformly across the whole body,
   and every piece outline is a pure function of that resolved
   measurement set. That's correct for most points but real industrial
   grading often hand-tunes individual pattern points (a dart apex, a
   notch) to a different dx/dy-per-step than the formula implies.

   gradeRules are purely additive: `{ [outlineIndex]: { dx, dy } }`,
   keyed by index into a piece's existing `outline` array. A point with
   a rule resolves as `basePointAtSizeM + rule*step` instead of the
   formula's value at the target size; every point without a rule keeps
   resolving through the formula exactly as it does today. No existing
   pattern's behavior changes unless a user explicitly authors rules.
   ============================================================ */

import { SIZE_STEP } from './data.js';

// Kids sizing scales the whole body by height ratio and always forces
// step=0 (see computeMeasurements) — grade rules are step-based deltas
// and have no meaning there, so grading always resolves to the plain
// formula path in kids mode.
export function stepForSize(size, kids) {
  if (kids) return 0;
  return SIZE_STEP[size] ?? 0;
}

// Apply one piece's grade rules. `basePiece` and `formulaPiece` must be
// the SAME piece (same key) resolved at size M (step 0) and at the
// target size respectively — both plain `pattern.pieces(m)` output.
export function applyGradeRules(basePiece, formulaPiece, gradeRules, step) {
  if (!gradeRules || !step) return formulaPiece;
  const outline = formulaPiece.outline.map((pt, i) => {
    const r = gradeRules[i];
    const base = basePiece.outline[i];
    if (!r || !base) return pt;
    return [base[0] + (r.dx || 0) * step, base[1] + (r.dy || 0) * step];
  });
  return { ...formulaPiece, outline };
}

// Batch version, matching pieces across the two arrays by `.key`.
export function applyGradeRulesToPieces(basePieces, formulaPieces, gradeRulesByKey, step) {
  if (!gradeRulesByKey || !step) return formulaPieces;
  const baseByKey = new Map(basePieces.map(p => [p.key, p]));
  return formulaPieces.map(p => {
    const rules = gradeRulesByKey[p.key];
    const base = baseByKey.get(p.key);
    if (!rules || !base) return p;
    return applyGradeRules(base, p, rules, step);
  });
}

// The one entry point both `grade()` and the Grade Nest preview need:
// resolve a pattern's pieces at `opts.size` with any authored grade
// rules applied. `opts` is the same shape computeMeasurements takes
// ({category,size,standard,kids,custom}); `gradeRulesByKey` is
// state.gradeRules[patternId] (may be null/undefined — no rules authored).
export function resolveGradedPieces(pattern, opts, computeMeasurements, gradeRulesByKey) {
  const formulaPieces = pattern.pieces(computeMeasurements(opts));
  const step = stepForSize(opts.size, opts.kids);
  if (!step || !gradeRulesByKey) return formulaPieces;
  const basePieces = pattern.pieces(computeMeasurements({ ...opts, size: "M", kids: null }));
  return applyGradeRulesToPieces(basePieces, formulaPieces, gradeRulesByKey, step);
}

/**
 * Industry Burda/Vogue color & dash styles for multi-size nested pattern sheets.
 */
export const NESTED_SIZE_STYLES = Object.freeze({
  XXS:   { color: '#0891b2', rgb: [0.03, 0.57, 0.70], dash: [2, 3],       pdfDash: '[2 3] 0 d' },
  XS:    { color: '#0d9488', rgb: [0.05, 0.58, 0.53], dash: [3, 2],       pdfDash: '[3 2] 0 d' },
  S:     { color: '#2563eb', rgb: [0.15, 0.39, 0.92], dash: [7, 3],       pdfDash: '[7 3] 0 d' },
  M:     { color: '#111827', rgb: [0.07, 0.09, 0.15], dash: [],           pdfDash: '[] 0 d' },
  L:     { color: '#dc2626', rgb: [0.86, 0.15, 0.15], dash: [9, 3, 2, 3], pdfDash: '[9 3 2 3] 0 d' },
  XL:    { color: '#7c3aed', rgb: [0.49, 0.23, 0.93], dash: [12, 4],      pdfDash: '[12 4] 0 d' },
  XXL:   { color: '#d97706', rgb: [0.85, 0.47, 0.02], dash: [4, 2, 1, 2], pdfDash: '[4 2 1 2] 0 d' },
  XXXL:  { color: '#db2777', rgb: [0.86, 0.15, 0.47], dash: [6, 2, 6, 4], pdfDash: '[6 2 6 4] 0 d' },
  XXXXL: { color: '#4f46e5', rgb: [0.31, 0.27, 0.90], dash: [1, 2],       pdfDash: '[1 2] 0 d' },
  '5XL': { color: '#059669', rgb: [0.02, 0.59, 0.41], dash: [10, 2, 2, 2],pdfDash: '[10 2 2 2] 0 d' },
  '6XL': { color: '#9333ea', rgb: [0.58, 0.20, 0.92], dash: [5, 5],       pdfDash: '[5 5] 0 d' },
});

function classifyAnatomicalPiece(piece) {
  const s = `${piece?.role || ''} ${piece?.key || ''} ${piece?.name?.en || ''}`.toLowerCase();
  if (/collar|neckband|stand/.test(s) && !/front|back|bodice/.test(s)) return 'collar';
  if (/waistband|belt|sash/.test(s)) return 'waistband';
  if (/cuff|wristband/.test(s)) return 'cuff';
  if (/pocket|tab|flap|epaulet/.test(s)) return 'pocket';
  if (/sleeve/.test(s)) return 'sleeve';
  if (/trouser|pant|short|legging|culotte/.test(s)) return 'trouser';
  if (/skirt/.test(s)) return 'skirt';
  if (/bodice|dress|coat|jacket|shirt|blouse|top|abaya|kaftan|front|back|yoke|panel/.test(s)) return 'bodice';
  return 'generic';
}

function lerpBand(v, stops) {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const t = (v - stops[i - 1][0]) / Math.max(1e-6, stops[i][0] - stops[i - 1][0]);
      return stops[i - 1][1] + (stops[i][1] - stops[i - 1][1]) * t;
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Lossless anatomical grading for ANY pattern piece (AI-generated, imported SVG/DXF,
 * custom drafted, or saved) from `fromMeas` to `toMeas`. Keeps Cut-on-Fold X edges anchored,
 * preserves fixed band heights on collars/cuffs/waistbands, and grades body zones proportionally.
 */
export function gradePieceAnatomically(piece, fromMeas, toMeas, gradeRulesForPiece = null, step = 0) {
  if (!piece || !Array.isArray(piece.outline) || piece.outline.length < 3 || !fromMeas || !toMeas) {
    return piece;
  }
  const clone = JSON.parse(JSON.stringify(piece));
  const o = clone.outline;
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1e-4), h = Math.max(maxY - minY, 1e-4);

  const dChest = (toMeas.chest ?? fromMeas.chest ?? 0) - (fromMeas.chest ?? toMeas.chest ?? 0);
  const dWaist = (toMeas.waist ?? fromMeas.waist ?? 0) - (fromMeas.waist ?? toMeas.waist ?? 0);
  const dHips = (toMeas.hips ?? fromMeas.hips ?? 0) - (fromMeas.hips ?? toMeas.hips ?? 0);
  const dShoulder = (toMeas.shoulder ?? fromMeas.shoulder ?? 0) - (fromMeas.shoulder ?? toMeas.shoulder ?? 0);
  const dNeck = (toMeas.neck ?? fromMeas.neck ?? 0) - (fromMeas.neck ?? toMeas.neck ?? 0);
  const dBackLen = (toMeas.backLen ?? fromMeas.backLen ?? 0) - (fromMeas.backLen ?? toMeas.backLen ?? 0);
  const dSleeve = (toMeas.sleeve ?? fromMeas.sleeve ?? 0) - (fromMeas.sleeve ?? toMeas.sleeve ?? 0);
  const dBicep = (toMeas.bicep ?? fromMeas.bicep ?? 0) - (fromMeas.bicep ?? toMeas.bicep ?? 0);
  const dInseam = (toMeas.inseam ?? fromMeas.inseam ?? 0) - (fromMeas.inseam ?? toMeas.inseam ?? 0);
  const dHeight = (toMeas.height ?? fromMeas.height ?? 0) - (fromMeas.height ?? toMeas.height ?? 0);

  const kind = classifyAnatomicalPiece(clone);
  // Horizontal anchor: lock fold edge at dx=0 when cutOnFold, otherwise piece centerline.
  let ax = (minX + maxX) * 0.5;
  if (clone.cutOnFold) {
    const leftTouch = o.filter((pt) => Math.abs(pt[0] - minX) <= Math.max(0.35, w * 0.02)).length;
    const rightTouch = o.filter((pt) => Math.abs(pt[0] - maxX) <= Math.max(0.35, w * 0.02)).length;
    ax = rightTouch > leftTouch ? maxX : minX;
  }
  const ay = minY;
  // Bilateral full-front/full-back pieces span roughly half the chest circumference.
  const baseChest = Math.max(40, fromMeas.chest || 88);
  const isFullSym = !clone.cutOnFold && w > baseChest * 0.34;
  const circumferenceDivisor = isFullSym ? 2 : 4;
  const halfSymMult = isFullSym ? 1.0 : 0.5;

  const mapPt = ([x, y]) => {
    const v = (y - minY) / h;
    // Signed offset ratio: 0..1 from left fold, -0.5..+0.5 from center.
    const sX = (x - ax) / w;
    let dx = 0, dy = 0;

    if (kind === 'collar') {
      const horiz = w >= h;
      if (horiz) {
        dx = sX * dNeck * halfSymMult;
      } else {
        dy = (v - 0.5) * dNeck * 0.5;
      }
    } else if (kind === 'waistband') {
      dx = sX * dWaist * halfSymMult;
    } else if (kind === 'cuff') {
      dx = sX * dBicep * 0.45;
    } else if (kind === 'pocket') {
      const k = dChest / baseChest;
      dx = (x - ax) * k * 0.35;
      dy = (y - ay) * k * 0.35;
    } else if (kind === 'sleeve') {
      const span = lerpBand(v, [[0, dBicep * 0.65], [0.28, dBicep * 1.0], [1, dBicep * 0.48]]);
      dx = sX * span;
      dy = v * dSleeve;
    } else if (kind === 'trouser') {
      const totalSpan = lerpBand(v, [[0, dWaist / circumferenceDivisor], [0.26, dHips / circumferenceDivisor], [0.6, dHips * 0.16], [1, dHips * 0.14]]);
      dx = sX * totalSpan;
      dy = v <= 0.25 ? (v / 0.25) * (dHips * 0.08) : (dHips * 0.08) + ((v - 0.25) / 0.75) * dInseam;
    } else if (kind === 'skirt') {
      const totalSpan = lerpBand(v, [[0, dWaist / circumferenceDivisor], [0.35, dHips / circumferenceDivisor], [1, dHips / circumferenceDivisor]]);
      dx = sX * totalSpan;
      dy = v * dHeight * 0.35;
    } else if (kind === 'bodice') {
      const neckOrShoulderSpan = Math.abs(sX) < 0.32 ? (dNeck * halfSymMult * 0.8) : (dShoulder * halfSymMult);
      const chestSpan = dChest / circumferenceDivisor;
      const waistSpan = dWaist / circumferenceDivisor;
      const hipSpan = dHips / circumferenceDivisor;
      const totalSpan = lerpBand(v, [
        [0, neckOrShoulderSpan],
        [0.24, chestSpan],
        [0.52, waistSpan],
        [0.8, hipSpan],
        [1, hipSpan],
      ]);
      dx = sX * totalSpan;
      dy = v <= 0.55
        ? (v / 0.55) * dBackLen
        : dBackLen + ((v - 0.55) / 0.45) * (dBackLen * 0.35 + dHeight * 0.25);
    } else {
      const rX = (toMeas.chest || baseChest) / baseChest;
      const rY = (toMeas.height || 168) / (fromMeas.height || 168);
      dx = (x - ax) * (Math.max(0.65, Math.min(1.55, rX)) - 1);
      dy = (y - ay) * (Math.max(0.65, Math.min(1.55, rY)) - 1);
    }

    return [+(x + dx).toFixed(3), +(y + dy).toFixed(3)];
  };

  clone.outline = clone.outline.map(mapPt);
  if (Array.isArray(clone.curves)) {
    clone.curves = clone.curves.map((c) => ({
      ...c,
      c1: c.c1 ? mapPt(c.c1) : c.c1,
      c2: c.c2 ? mapPt(c.c2) : c.c2,
    }));
  }
  if (Array.isArray(clone.darts)) {
    clone.darts = clone.darts.map((d) => d.map(mapPt));
  }
  if (Array.isArray(clone.notches)) {
    clone.notches = clone.notches.map(mapPt);
  }
  if (Array.isArray(clone.grain) && clone.grain.length === 2) {
    clone.grain = clone.grain.map(mapPt);
  }
  if (gradeRulesForPiece && step) {
    return applyGradeRules(piece, clone, gradeRulesForPiece, step);
  }
  return clone;
}

/**
 * Batch-grades an array of pieces from `fromMeas` to `toMeas` anatomically.
 */
export function gradePiecesAnatomically(basePieces, fromMeas, toMeas, gradeRulesByKey = null, step = 0) {
  if (!Array.isArray(basePieces)) return [];
  return basePieces.map((p) => {
    const rules = gradeRulesByKey ? gradeRulesByKey[p.key] : null;
    return gradePieceAnatomically(p, fromMeas, toMeas, rules, step);
  });
}

function pieceBoxRef(piece, alignMode = 'leftTop') {
  const o = piece?.outline || [];
  if (!o.length) return [0, 0];
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys);
  if (alignMode === 'foldOrCenter') {
    if (piece.cutOnFold) return [minX, minY];
    return [(minX + maxX) * 0.5, minY];
  }
  return [minX, minY];
}

function translatePiece(piece, dx, dy) {
  const shift = ([x, y]) => [+(x + dx).toFixed(3), +(y + dy).toFixed(3)];
  return {
    ...piece,
    outline: (piece.outline || []).map(shift),
    curves: (piece.curves || []).map((c) => ({ ...c, c1: c.c1 ? shift(c.c1) : c.c1, c2: c.c2 ? shift(c.c2) : c.c2 })),
    darts: (piece.darts || []).map((d) => d.map(shift)),
    notches: (piece.notches || []).map(shift),
    grain: Array.isArray(piece.grain) && piece.grain.length === 2 ? piece.grain.map(shift) : piece.grain,
  };
}

/**
 * Builds aligned multi-size nested layers (e.g., S/M/L/XL) aligned concentrically onto
 * `activePieces` (the currently displayed layout positions on the drafting board/sheet),
 * supporting both Parametric Library patterns AND custom/AI/imported base snapshots.
 */
export function buildNestedSizeLayers(source, sizes, baseOpts, computeMeasurements, gradeRulesByKey = null) {
  const targetSizes = Array.isArray(sizes) && sizes.length ? sizes : ['S', 'M', 'L', 'XL'];
  const activePieces = Array.isArray(source?.activePieces) ? source.activePieces : [];
  const baseStepRef = stepForSize(source?.baseSize || 'M', null);

  return targetSizes.map((size) => {
    let graded;
    if (source?.pattern) {
      graded = resolveGradedPieces(source.pattern, { ...baseOpts, size, kids: null }, computeMeasurements, gradeRulesByKey);
    } else if (Array.isArray(source?.basePieces) && source?.baseMeas) {
      const toMeas = computeMeasurements({ ...baseOpts, size, kids: null });
      const stepDelta = stepForSize(size, null) - baseStepRef;
      graded = gradePiecesAnatomically(source.basePieces, source.baseMeas, toMeas, gradeRulesByKey, stepDelta);
    } else {
      graded = [];
    }

    const aligned = graded.map((gp, idx) => {
      const target = activePieces[idx] || activePieces.find((ap) => gp.key && ap.key === gp.key);
      if (!target?.outline?.length || !gp?.outline?.length) return gp;
      const [ax, ay] = pieceBoxRef(target, 'foldOrCenter');
      const [gx, gy] = pieceBoxRef(gp, 'foldOrCenter');
      return translatePiece(gp, ax - gx, ay - gy);
    });

    return {
      size,
      style: NESTED_SIZE_STYLES[size] || NESTED_SIZE_STYLES.M,
      pieces: aligned,
    };
  });
}
