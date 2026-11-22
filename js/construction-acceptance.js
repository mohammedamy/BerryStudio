// A narrow seam audit, never an approval of construction or physical fit.
export function assessWovenSkirtConstruction(pieces) {
  return assessDeclaredSeams(pieces, { family: 'woven-skirt', decision: 'side-seam-checked' });
}

// Audits only geometry that the pattern itself explicitly declares as a
// two-sided seam. It intentionally does not infer joins from proximity, role
// names or silhouettes, which makes it safe to use for other supported
// families without presenting a construction or fit conclusion.
export function assessDeclaredSeamConstruction(pieces) {
  return assessDeclaredSeams(pieces, { family: 'declared-seams', decision: 'declared-seams-checked' });
}

function assessNamedFamilyConstruction(pieces, { family, decision, requiredRoles, requiredSeams }) {
  const report = assessDeclaredSeams(pieces, { family, decision });
  const roles = new Set((Array.isArray(pieces) ? pieces : []).map(piece => piece?.role).filter(Boolean));
  const blockers = [...report.blockers];
  if (!requiredRoles.every(role => roles.has(role))) blockers.push('constructionPieces');
  const seamIds = new Set(report.checks.map(check => check.seamId));
  if (!requiredSeams.every(seamId => seamIds.has(seamId))) blockers.push('constructionSeam');
  const uniqueBlockers = [...new Set(blockers)];
  return {
    family,
    decision: uniqueBlockers.length ? 'needs-construction-evidence' : decision,
    checks: report.checks,
    blockers: uniqueBlockers,
    makerApproval: null,
    sampleApproval: null,
    productionEligible: false,
  };
}

export function assessWovenBodiceConstruction(pieces) {
  return assessNamedFamilyConstruction(pieces, {
    family: 'woven-basic-bodice',
    decision: 'bodice-seams-checked',
    requiredRoles: ['bodice-front', 'bodice-back'],
    requiredSeams: ['bodice-side'],
  });
}

export function assessWovenDressConstruction(pieces) {
  return assessNamedFamilyConstruction(pieces, {
    family: 'woven-basic-dress',
    decision: 'dress-seams-checked',
    requiredRoles: ['bodice-front', 'bodice-back', 'skirt-front', 'skirt-back'],
    requiredSeams: ['dress-bodice-side', 'dress-skirt-side'],
  });
}

export function assessWovenTrouserConstruction(pieces) {
  return assessNamedFamilyConstruction(pieces, {
    family: 'woven-basic-trousers',
    decision: 'trouser-seams-checked',
    requiredRoles: ['trouser-front', 'trouser-back', 'waistband'],
    requiredSeams: ['trouser-outseam', 'trouser-inseam'],
  });
}

const GEOMETRY_CHECKED_DECISIONS = new Set([
  'side-seam-checked',
  'bodice-seams-checked',
  'dress-seams-checked',
  'trouser-seams-checked',
  'declared-seams-checked',
]);

export function deriveReadinessStage(assessment) {
  if (assessment?.decision === 'not-applicable') return 'unsupported';
  if (assessment?.makerApproval && assessment?.sampleApproval) return 'sample-approved';
  if (assessment?.makerApproval) return 'maker-reviewed';
  if (GEOMETRY_CHECKED_DECISIONS.has(assessment?.decision)) return 'geometry-checked';
  return 'draft';
}

function assessDeclaredSeams(pieces, { family, decision }) {
  if (!Array.isArray(pieces)) throw new Error('constructionInvalid');
  const blockers = [], groups = new Map();
  for (const piece of pieces) {
    for (const edge of Array.isArray(piece?.edges) ? piece.edges : []) {
      if (typeof edge?.seamId !== 'string' || !edge.seamId) continue;
      const entries = groups.get(edge.seamId) || [];
      entries.push({piece, edge}); groups.set(edge.seamId, entries);
    }
  }
  const checks = [];
  for (const [seamId, entries] of groups) {
    if (entries.length !== 2 || entries[0].piece === entries[1].piece) { blockers.push('constructionSeam'); continue; }
    const lengths = entries.map(({piece,edge}) => {
      const o = piece.outline;
      if (!Array.isArray(o) || !o.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) ||
        !Number.isInteger(edge.fromIdx) || !Number.isInteger(edge.toIdx) || edge.fromIdx < 0 || edge.toIdx < 0 ||
        edge.fromIdx >= o.length || edge.toIdx >= o.length || edge.fromIdx === edge.toIdx) return null;
      let length = 0;
      for (let i = edge.fromIdx; i !== edge.toIdx; i = (i + 1) % o.length) {
        const a = o[i], b = o[(i + 1) % o.length]; length += Math.hypot(b[0]-a[0],b[1]-a[1]);
      }
      return length > 0 ? length : null;
    });
    if (lengths.includes(null)) blockers.push('constructionEdge');
    else {
      const differenceMm = Math.abs(lengths[0]-lengths[1])*10;
      checks.push({seamId,lengthsCm:lengths,differenceMm});
      if (differenceMm > 3 + 1e-8) blockers.push('constructionMismatch');
    }
  }
  if (!groups.size) blockers.push('constructionSeam');
  return {family,decision:blockers.length?'needs-construction-evidence':decision,checks,
    blockers:[...new Set(blockers)],makerApproval:null,sampleApproval:null,productionEligible:false};
}
