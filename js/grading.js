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
