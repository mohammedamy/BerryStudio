import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WOVEN_BASIC_TROUSERS_CONFIG_VERSION,
  WOVEN_BASIC_TROUSERS_OPTIONS,
  createWovenBasicTrousersConfiguration,
  validateWovenBasicTrousersConfiguration,
  configurationToWovenBasicTrousersProgram,
  summarizeWovenBasicTrousersConfiguration,
  diffWovenBasicTrousersConfiguration,
  serializeWovenBasicTrousersConfiguration,
} from '../js/trouser-configurator.js';
import { executePatternProgram, validatePatternProgram } from '../js/pattern-program.js';
import { MANNEQUIN_CATALOG } from '../js/mannequin-catalog.js';
import { run as runValidator } from '../js/validate.js';
import { offsetPoly } from '../js/geometry.js';
import { assessWovenTrouserConstruction } from '../js/construction-acceptance.js';
import { createConstructionEvidenceRecord } from '../js/construction-evidence-record.js';
import { createConstructionPacket } from '../js/construction-packet.js';
import { updateDesignBrief, prepareBriefDraft, toggleDesignBriefFieldLock } from '../js/design-brief.js';
import { migrateProject } from '../js/project-revisions.js';

const sampleMeasurements = { waist: 72, hips: 98, inseam: 76 };

function edgeXs(outline, edge) {
  const xs = [outline[edge.fromIdx][0]];
  let idx = edge.fromIdx;
  while (idx !== edge.toIdx) {
    idx = (idx + 1) % outline.length;
    xs.push(outline[idx][0]);
  }
  return xs;
}

const avg = arr => arr.reduce((sum, val) => sum + val, 0) / arr.length;

test('basic woven trousers configuration is bounded, serializable and diffs cleanly', () => {
  assert.equal(WOVEN_BASIC_TROUSERS_CONFIG_VERSION, 1);
  assert.deepEqual(WOVEN_BASIC_TROUSERS_OPTIONS.length, ['short', 'regular', 'long']);
  const base = createWovenBasicTrousersConfiguration({ measurementProfileId: 'mp-client-1' });
  const long = createWovenBasicTrousersConfiguration({ length: 'long', measurementProfileId: 'mp-client-1' });
  assert.equal(validateWovenBasicTrousersConfiguration(base), true);
  assert.equal(validateWovenBasicTrousersConfiguration(long), true);
  assert.match(summarizeWovenBasicTrousersConfiguration(long), /long straight woven trousers/);
  assert.match(summarizeWovenBasicTrousersConfiguration(long, 'ar'), /طويل/);
  assert.deepEqual(diffWovenBasicTrousersConfiguration(base, long), [
    { field: 'length', before: 'regular', after: 'long' },
  ]);
  assert.deepEqual(diffWovenBasicTrousersConfiguration(base, base), []);
  const serialized = serializeWovenBasicTrousersConfiguration(long);
  assert.equal(serialized.family, 'woven-basic-trousers');
  assert.equal(serialized.length, 'long');

  const output = executePatternProgram(configurationToWovenBasicTrousersProgram(long), sampleMeasurements);
  assert.deepEqual(output.pieces.map(piece => piece.role), ['trouser-front', 'trouser-back', 'waistband']);
  assert.equal(output.pieces[0].quantity, 2);
  assert.equal(output.pieces[0].cutOnFold, false);
  assert.equal(output.pieces[1].quantity, 2);
  assert.equal(output.pieces[1].cutOnFold, false);
  assert.equal(output.pieces[2].quantity, 2);
});

test('unimplemented trouser construction choices are rejected before drafting', () => {
  assert.throws(() => createWovenBasicTrousersConfiguration({ length: 'cropped' }), /trouserConfigurationInvalid/);
  assert.throws(() => createWovenBasicTrousersConfiguration({ silhouette: 'wide' }), /trouserConfigurationInvalid/);
  assert.throws(() => createWovenBasicTrousersConfiguration({ waistband: 'elastic' }), /trouserConfigurationInvalid/);
  assert.throws(() => createWovenBasicTrousersConfiguration({ closure: 'zip' }), /trouserConfigurationInvalid/);
  assert.throws(
    () => validateWovenBasicTrousersConfiguration({ version: 1, family: 'woven-basic-trousers', length: 'regular' }),
    /trouserConfigurationInvalid/,
  );
});

test('woven trousers program passes 2D geometry, dual-seam 0.0mm parity, and notch alignment across all 44 mannequins and all 3 lengths', () => {
  assert.equal(MANNEQUIN_CATALOG.length, 44);
  for (const mannequin of MANNEQUIN_CATALOG) {
    for (const length of WOVEN_BASIC_TROUSERS_OPTIONS.length) {
      const config = createWovenBasicTrousersConfiguration({ length });
      const program = configurationToWovenBasicTrousersProgram(config);
      assert.equal(validatePatternProgram(program), true);
      const result = executePatternProgram(program, mannequin.measurements);
      const report = runValidator(result.pieces, { seamAllowanceCm: 1, offsetPoly });
      assert.equal(
        report.summary.fail,
        0,
        `${mannequin.id} (${length}) failed validation: ${JSON.stringify(report)}`,
      );
      const cross = report.crossPiece[0];
      assert.equal(cross.checks.seamLengthParity.status, 'pass', `${mannequin.id} (${length}) seamLengthParity`);
      assert.equal(cross.checks.notchAlignment.status, 'pass', `${mannequin.id} (${length}) notchAlignment`);

      const acceptance = assessWovenTrouserConstruction(result.pieces);
      assert.equal(acceptance.family, 'woven-basic-trousers');
      assert.equal(acceptance.decision, 'trouser-seams-checked');
      assert.equal(acceptance.productionEligible, false);
      assert.equal(acceptance.makerApproval, null);
      assert.equal(acceptance.checks.length, 2, `${mannequin.id} (${length}) expected 2 declared seam checks`);
      for (const check of acceptance.checks) {
        assert.ok(check.differenceMm <= 1e-6, `${mannequin.id} (${length}) ${check.seamId} mismatch ${check.differenceMm}mm`);
      }

      // Medial crotch/inseam edge must sit on smallest X and lateral outseam on largest X for Cloth Lab bilateral placement
      for (const legRole of ['trouser-front', 'trouser-back']) {
        const piece = result.pieces.find(p => p.role === legRole);
        const xs = piece.outline.map(([x]) => x);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const inseam = piece.edges.find(e => e.seamId === 'trouser-inseam');
        const outseam = piece.edges.find(e => e.seamId === 'trouser-outseam');
        const inseamXs = edgeXs(piece.outline, inseam);
        const outseamXs = edgeXs(piece.outline, outseam);
        assert.ok(inseamXs.some(x => x <= minX + 1e-6));
        assert.ok(outseamXs.some(x => x >= maxX - 1e-6));
        assert.ok(avg(outseamXs) > avg(inseamXs));
      }
    }
  }
});

test('multi-seam 2D validator and trouser acceptance catch mismatches on secondary shared seams (inseam)', () => {
  const result = executePatternProgram(
    configurationToWovenBasicTrousersProgram(createWovenBasicTrousersConfiguration()),
    sampleMeasurements,
  );
  const brokenPieces = structuredClone(result.pieces);
  const back = brokenPieces.find(piece => piece.role === 'trouser-back');
  const inseam = back.edges.find(edge => edge.seamId === 'trouser-inseam');
  // Perturb only the inseam crotch vertex on the back piece while leaving trouser-outseam untouched
  back.outline[inseam.toIdx][1] -= 3;

  const report = runValidator(brokenPieces, { seamAllowanceCm: 1, offsetPoly });
  assert.equal(report.crossPiece[0].checks.seamLengthParity.status, 'fail');
  assert.match(report.crossPiece[0].checks.seamLengthParity.message, /trouser-inseam/);

  const acceptance = assessWovenTrouserConstruction(brokenPieces);
  assert.ok(acceptance.blockers.includes('constructionMismatch'));
  assert.equal(acceptance.productionEligible, false);
});

test('trouser construction evidence record and packet emit honest, bounded construction artifacts', () => {
  const config = createWovenBasicTrousersConfiguration({ length: 'regular' });
  const result = executePatternProgram(configurationToWovenBasicTrousersProgram(config), sampleMeasurements);
  const evidence = createConstructionEvidenceRecord(
    { projectMeta: { id: 'tr-project-1', revision: 2 }, patternConfiguration: config, pieces: result.pieces },
    { evaluatedAt: '2026-11-22T00:00:00.000Z' },
  );
  assert.equal(evidence.schema, 'berrystudio.construction-evidence.v1');
  assert.equal(evidence.assessment.family, 'woven-basic-trousers');
  assert.equal(evidence.assessment.decision, 'trouser-seams-checked');
  assert.equal(evidence.approvals.productionEligible, false);
  assert.equal(evidence.approvals.makerApproval, null);

  const packet = createConstructionPacket({ patternConfiguration: config, pieces: result.pieces });
  assert.equal(packet.schema, 'berrystudio.construction-packet.v1');
  assert.equal(packet.supported, true);
  assert.equal(packet.family, 'woven-basic-trousers');
  assert.equal(packet.cutList.length, 3);
  assert.deepEqual(packet.declaredSeams.map(seam => seam.id), ['trouser-outseam', 'trouser-inseam']);
  assert.equal(packet.instructions.length, 6);
  assert.equal(packet.readiness.productionEligible, false);
});

test('bilingual EN/AR design briefs capture inseam, respect locks, and validate trousers readiness', () => {
  const enBrief = updateDesignBrief(null, 'woven basic straight trousers long waist 72 cm hips 98 cm inseam 76 cm', 'en');
  assert.equal(enBrief.fields.family?.value, 'trousers');
  assert.equal(enBrief.fields.length?.value, 'long');
  assert.equal(enBrief.fields.waist?.value, 72);
  assert.equal(enBrief.fields.hips?.value, 98);
  assert.equal(enBrief.fields.inseam?.value, 76);

  const enReady = prepareBriefDraft(enBrief, { waist: 70, hips: 96, inseam: 74 });
  assert.equal(enReady.decision, 'propose');
  assert.equal(enReady.provenance.inseam.source, 'user');

  const locked = toggleDesignBriefFieldLock(enBrief, 'inseam');
  const blocked = updateDesignBrief(locked, 'inseam 84 cm', 'en');
  assert.equal(blocked.fields.inseam.value, 76);
  assert.ok(blocked.issues.some(issue => issue.field === 'inseam' && issue.code === 'locked'));
  assert.equal(prepareBriefDraft(blocked, { waist: 70, hips: 96, inseam: 74 }).decision, 'clarify');

  const arBrief = updateDesignBrief(null, 'بنطلون منسوج قصير خصر 74 سم أرداف 100 سم طول الساق الداخلي 78 سم', 'ar');
  assert.equal(arBrief.fields.family?.value, 'trousers');
  assert.equal(arBrief.fields.length?.value, 'short');
  assert.equal(arBrief.fields.waist?.value, 74);
  assert.equal(arBrief.fields.hips?.value, 100);
  assert.equal(arBrief.fields.inseam?.value, 78);
  assert.equal(prepareBriefDraft(arBrief, { waist: 72, hips: 98, inseam: 76 }).decision, 'propose');
});

test('project revision migration preserves valid woven-basic-trousers configs and rejects malformed ones', () => {
  const validConfig = serializeWovenBasicTrousersConfiguration(createWovenBasicTrousersConfiguration({ length: 'long' }));
  const baseProject = {
    version: 2,
    projectMeta: { id: 'tr-1', revision: 0, status: 'draft' },
    pieces: [
      {
        name: { en: 'Front Leg', ar: 'الساق الأمامية' },
        outline: [[0, 0], [10, 0], [10, 40], [0, 40]],
        darts: [],
        grain: [[5, 5], [5, 35]],
        notches: [],
        curves: [],
        color: '#2d3748',
      },
    ],
    variables: {},
  };
  const migrated = migrateProject({ ...baseProject, patternConfiguration: validConfig });
  assert.equal(migrated.patternConfiguration.family, 'woven-basic-trousers');
  assert.equal(migrated.patternConfiguration.length, 'long');

  assert.throws(
    () => migrateProject({
      ...baseProject,
      patternConfiguration: { version: 1, family: 'woven-basic-trousers', length: 'cropped' },
    }),
    /projectInvalid/,
  );
});
