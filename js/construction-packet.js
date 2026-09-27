// P7-05: a portable, honest construction handoff for supported drafts.
// It reports declared geometry and cut intent; it never upgrades evidence
// into maker, fit, or production approval.
const clone = value => JSON.parse(JSON.stringify(value));
const skirtRoles = new Set(['skirt-front', 'skirt-back', 'waistband']);

function edgeLength(piece, edge) {
  const outline = piece?.outline;
  if (!Array.isArray(outline) || !Number.isInteger(edge?.fromIdx) || !Number.isInteger(edge?.toIdx)) return null;
  if (edge.fromIdx < 0 || edge.toIdx < 0 || edge.fromIdx >= outline.length || edge.toIdx >= outline.length || edge.fromIdx === edge.toIdx) return null;
  let total = 0;
  for (let index = edge.fromIdx; index !== edge.toIdx; index = (index + 1) % outline.length) {
    const a = outline[index], b = outline[(index + 1) % outline.length];
    if (!Array.isArray(a) || !Array.isArray(b) || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return null;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total > 0 ? Math.round(total * 1000) / 1000 : null;
}

function declaredSeams(pieces) {
  const groups = new Map();
  pieces.forEach(piece => (piece.edges || []).forEach(edge => {
    if (typeof edge?.seamId !== 'string' || !edge.seamId) return;
    const entries = groups.get(edge.seamId) || [];
    entries.push({ piece, edge }); groups.set(edge.seamId, entries);
  }));
  return [...groups.entries()].map(([id, entries]) => ({
    id,
    declared: entries.length === 2,
    participants: entries.map(({ piece, edge }) => ({ pieceKey: piece.key || null, lengthCm: edgeLength(piece, edge) })),
  }));
}

export function createConstructionPacket(project) {
  const pieces = Array.isArray(project?.pieces) ? project.pieces.filter(piece => skirtRoles.has(piece?.role)) : [];
  const supported = project?.patternConfiguration?.family === 'woven-a-line-skirt' || pieces.some(piece => piece.role === 'skirt-front');
  const cutList = pieces.map(piece => ({
    key: piece.key || null,
    name: piece.name || { en: piece.key || 'Piece', ar: piece.key || 'قطعة' },
    role: piece.role,
    quantity: Number.isInteger(piece.quantity) ? piece.quantity : 1,
    cutOnFold: piece.cutOnFold === true,
    grainline: Array.isArray(piece.grain) && piece.grain.length >= 2 ? 'declared' : 'missing',
    notchCount: Array.isArray(piece.notches) ? piece.notches.length : 0,
  }));
  const seams = declaredSeams(pieces);
  const sideSeam = seams.find(seam => seam.id === 'skirt-side');
  const waistband = pieces.find(piece => piece.role === 'waistband');
  const instructions = supported ? [
    { step: 1, instruction: 'Cut each listed piece, respecting fold and grainline declarations.' },
    { step: 2, instruction: 'Transfer the declared side-seam notches before assembly.' },
    { step: 3, instruction: sideSeam?.declared ? 'Match and sew the declared skirt side seam; press the seam as appropriate for the fabric.' : 'Do not sew the side seam until its pairing is reviewed.' },
    { step: 4, instruction: waistband ? 'Waistband attachment and any closure remain review items because no waistband join or closure is declared in this draft.' : 'A waistband is not declared; resolve the waist finish before cutting.' },
    { step: 5, instruction: 'Confirm fit on a sample before final hemming or production cutting.' },
  ] : [];
  return clone({
    schema: 'berrystudio.construction-packet.v1',
    supported,
    family: supported ? 'woven-a-line-skirt' : null,
    patternConfiguration: project?.patternConfiguration || null,
    cutList,
    declaredSeams: seams,
    instructions,
    readiness: {
      geometry: sideSeam?.declared ? 'declared-side-seam' : 'incomplete',
      waistbandAttachment: 'not-verified',
      closure: 'not-verified',
      makerApproval: null,
      sampleApproval: null,
      productionEligible: false,
    },
    limitations: [
      'This packet does not calculate fabric consumption or validate seam allowance offsets.',
      'It does not verify material behavior, fit, assembly, grading, maker review, or a sewn sample.',
    ],
  });
}
