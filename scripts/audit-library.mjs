// Reporting only. Eligibility and final quality gates need pattern-maker review.
import { PATTERNS, computeMeasurements } from '../js/data.js';
import '../js/library.js';
import '../js/girls-leotards.js';
import '../js/fancy-patterns.js';
import '../js/underwear-library.js';
import { run } from '../js/validate.js';
const result = {
  scope: 'All registered patterns; category defaults, international size M; validator called without body measurements, matching the existing library sweep. Not a drape or fit test.',
  patterns: 0, pieces: 0, piecesWithNotches: 0, piecesWithChestHints: 0,
  pairs: { verified: 0, heuristic: 0, unmatched: 0 },
  checks: { pass: 0, warn: 0, fail: 0, deferred: 0 },
};
for (const entry of Object.values(PATTERNS)) {
  const measurements = computeMeasurements({ category: entry.category || 'women', size: 'M', standard: 'intl' });
  const pieces = entry.pieces(measurements);
  const report = run(pieces);
  result.patterns++;
  result.pieces += pieces.length;
  result.piecesWithNotches += pieces.filter(piece => piece.notches?.length).length;
  result.piecesWithChestHints += pieces.filter(piece => piece.chestEdgeIndices?.length).length;
  for (const key of Object.keys(result.checks)) result.checks[key] += report.summary[key] || 0;
  for (const pair of report.crossPiece) {
    result.pairs[pair.verified ? 'verified' : pair.label.includes('(unmatched)') ? 'unmatched' : 'heuristic']++;
  }
}
console.log(JSON.stringify(result, null, 2));
