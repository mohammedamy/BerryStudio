import { assessWovenSkirtConstruction } from './construction-acceptance.js';

const clone = value => JSON.parse(JSON.stringify(value));
const skirtRoles = new Set(['skirt-front', 'skirt-back', 'waistband']);

// A portable evidence snapshot, not an approval object. It deliberately
// records absence as absence so downstream tools cannot infer production status.
export function createConstructionEvidenceRecord(project, { evaluatedAt = new Date().toISOString() } = {}) {
  const pieces = Array.isArray(project?.pieces) ? project.pieces : [];
  const roles = [...new Set(pieces.map(piece => typeof piece?.role === 'string' ? piece.role : null).filter(Boolean))].sort();
  const isSkirt = project?.patternProgram?.family === 'woven-a-line-skirt' || roles.some(role => skirtRoles.has(role));
  const assessment = isSkirt
    ? assessWovenSkirtConstruction(pieces)
    : { family: null, decision: 'not-applicable', checks: [], blockers: ['constructionFamilyUnsupported'], makerApproval: null, sampleApproval: null, productionEligible: false };
  return clone({
    schema: 'berrystudio.construction-evidence.v1',
    evaluatedAt,
    project: {
      id: typeof project?.projectMeta?.id === 'string' ? project.projectMeta.id : null,
      revision: Number.isSafeInteger(project?.projectMeta?.revision) ? project.projectMeta.revision : null,
      pieceCount: pieces.length,
      roles,
      briefPresent: !!project?.brief,
      patternProgramFamily: typeof project?.patternProgram?.family === 'string' ? project.patternProgram.family : null,
    },
    assessment,
    approvals: { makerApproval: null, sampleApproval: null, productionEligible: false },
    limitations: [
      'This record measures only declared geometry evidence.',
      'It does not verify material behavior, fit, assembly, grading, maker review or a sewn sample.',
    ],
  });
}
