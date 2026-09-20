// A narrow seam audit, never an approval of construction or physical fit.
export function assessWovenSkirtConstruction(pieces) {
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
  return {family:'woven-skirt',decision:blockers.length?'needs-construction-evidence':'side-seam-checked',checks,
    blockers:[...new Set(blockers)],makerApproval:null,sampleApproval:null,productionEligible:false};
}
