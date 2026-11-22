// P7-05: a portable, honest construction handoff for supported drafts.
// It reports declared geometry and cut intent; it never upgrades evidence
// into maker, fit, or production approval.
const clone = value => JSON.parse(JSON.stringify(value));
const skirtRoles = new Set(['skirt-front', 'skirt-back', 'waistband']);
const bodiceRoles = new Set(['bodice-front', 'bodice-back']);
const dressRoles = new Set(['bodice-front', 'bodice-back', 'skirt-front', 'skirt-back']);
const trouserRoles = new Set(['trouser-front', 'trouser-back', 'waistband']);
const STANDARD_LIMITATIONS = [
  'This packet does not calculate fabric consumption or validate seam allowance offsets.',
  'It does not verify material behavior, fit, assembly, grading, maker review, or a sewn sample.',
];

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

function buildCutList(pieces) {
  return pieces.map(piece => ({
    key: piece.key || null,
    name: piece.name || { en: piece.key || 'Piece', ar: piece.key || 'قطعة' },
    role: piece.role,
    quantity: Number.isInteger(piece.quantity) ? piece.quantity : 1,
    cutOnFold: piece.cutOnFold === true,
    grainline: Array.isArray(piece.grain) && piece.grain.length >= 2 ? 'declared' : 'missing',
    notchCount: Array.isArray(piece.notches) ? piece.notches.length : 0,
  }));
}

export function createConstructionPacket(project) {
  const rawPieces = Array.isArray(project?.pieces) ? project.pieces : [];
  const configFamily = project?.patternConfiguration?.family || null;
  const programFamily = project?.patternProgram?.family || null;
  const seamAllowanceCm = Number.isFinite(project?.patternConfiguration?.seamAllowanceCm)
    ? project.patternConfiguration.seamAllowanceCm
    : null;

  const dressPieces = rawPieces.filter(piece => dressRoles.has(piece?.role));
  const dressSupported = configFamily === 'woven-basic-dress'
    || programFamily === 'woven-basic-dress'
    || (
      dressPieces.some(piece => piece.role === 'bodice-front')
      && dressPieces.some(piece => piece.role === 'bodice-back')
      && dressPieces.some(piece => piece.role === 'skirt-front')
      && dressPieces.some(piece => piece.role === 'skirt-back')
    );

  if (dressSupported) {
    const seams = declaredSeams(dressPieces);
    const bodiceSide = seams.find(seam => seam.id === 'dress-bodice-side');
    const skirtSide = seams.find(seam => seam.id === 'dress-skirt-side');
    const checked = !!(bodiceSide?.declared && skirtSide?.declared);
    return clone({
      schema: 'berrystudio.construction-packet.v1',
      supported: true,
      family: 'woven-basic-dress',
      seamAllowanceCm,
      patternConfiguration: project?.patternConfiguration || null,
      cutList: buildCutList(dressPieces),
      declaredSeams: seams,
      instructions: [
        { step: 1, instruction: 'Cut bodice front, bodice back, skirt front, and skirt back on the fold, respecting declared grainlines.' },
        { step: 2, instruction: 'Transfer the declared underarm and skirt side-seam notches before assembly.' },
        { step: 3, instruction: checked ? 'Match and sew the declared dress bodice side seam and skirt side seam separately.' : 'Review and align bodice and skirt side-seam pairings before sewing.' },
        { step: 4, instruction: 'Joining the bodice waist to the skirt waist remains unverified because the waist join is not declared in this block.' },
        { step: 5, instruction: 'Shoulder seams, neckline finish, armhole finish, and any closure remain unverified and require maker construction decisions.' },
        { step: 6, instruction: 'Confirm bodice bust/waist ease and skirt length on a sewn toile before final cutting.' },
      ],
      readiness: {
        stage: checked ? 'geometry-checked' : 'draft',
        geometry: checked ? 'declared-dress-seams' : 'incomplete',
        waistJoin: 'not-verified',
        necklineAndArmhole: 'not-verified',
        closure: 'not-verified',
        makerApproval: null,
        sampleApproval: null,
        productionEligible: false,
      },
      limitations: STANDARD_LIMITATIONS,
    });
  }

  const bodicePieces = rawPieces.filter(piece => bodiceRoles.has(piece?.role));
  const hasLowerRoles = rawPieces.some(piece => skirtRoles.has(piece?.role) || trouserRoles.has(piece?.role));
  const bodiceSupported = !hasLowerRoles && (
    configFamily === 'woven-basic-bodice'
    || programFamily === 'woven-basic-bodice'
    || (bodicePieces.some(piece => piece.role === 'bodice-front') && bodicePieces.some(piece => piece.role === 'bodice-back'))
  );

  if (bodiceSupported) {
    const seams = declaredSeams(bodicePieces);
    const bodiceSide = seams.find(seam => seam.id === 'bodice-side');
    const checked = !!bodiceSide?.declared;
    return clone({
      schema: 'berrystudio.construction-packet.v1',
      supported: true,
      family: 'woven-basic-bodice',
      seamAllowanceCm,
      patternConfiguration: project?.patternConfiguration || null,
      cutList: buildCutList(bodicePieces),
      declaredSeams: seams,
      instructions: [
        { step: 1, instruction: 'Cut the front and back bodice pieces on the fold, respecting declared grainlines.' },
        { step: 2, instruction: 'Transfer the declared underarm side-seam notches before assembly.' },
        { step: 3, instruction: checked ? 'Match and sew the declared bodice side seams with right sides together.' : 'Review bodice side-seam pairing before sewing.' },
        { step: 4, instruction: 'Shoulder seam join, neckline finish, armhole finish, and closure remain unverified because they are not declared in this block.' },
        { step: 5, instruction: 'Confirm chest/waist ease and armhole depth on a sewn toile before cutting final fabric.' },
      ],
      readiness: {
        stage: checked ? 'geometry-checked' : 'draft',
        geometry: checked ? 'declared-bodice-seam' : 'incomplete',
        shoulderAndNeckline: 'not-verified',
        armholeFinish: 'not-verified',
        closure: 'not-verified',
        makerApproval: null,
        sampleApproval: null,
        productionEligible: false,
      },
      limitations: STANDARD_LIMITATIONS,
    });
  }

  const trouserPieces = rawPieces.filter(piece => trouserRoles.has(piece?.role));
  const trouserSupported = configFamily === 'woven-basic-trousers'
    || programFamily === 'woven-basic-trousers'
    || (trouserPieces.some(piece => piece.role === 'trouser-front') && trouserPieces.some(piece => piece.role === 'trouser-back'));

  if (trouserSupported) {
    const seams = declaredSeams(trouserPieces);
    const outseam = seams.find(seam => seam.id === 'trouser-outseam');
    const inseam = seams.find(seam => seam.id === 'trouser-inseam');
    const waistband = trouserPieces.find(piece => piece.role === 'waistband');
    const checked = !!(outseam?.declared && inseam?.declared);
    return clone({
      schema: 'berrystudio.construction-packet.v1',
      supported: true,
      family: 'woven-basic-trousers',
      seamAllowanceCm,
      patternConfiguration: project?.patternConfiguration || null,
      cutList: buildCutList(trouserPieces),
      declaredSeams: seams,
      instructions: [
        { step: 1, instruction: 'Cut 2 front legs, 2 back legs, and 2 waistband pieces, respecting grainline alignment along each leg panel.' },
        { step: 2, instruction: 'Transfer the declared outseam and inseam knee notches before assembly.' },
        { step: 3, instruction: checked ? 'Join each front leg to its matching back leg along the declared outseam and inseam edges matching knee notches.' : 'Review and align leg outseam/inseam pairings before sewing.' },
        { step: 4, instruction: 'Crotch rise, seat curve, and fly/closure assembly remain review items because curved crotch-rise shaping and closure tolerances require maker verification.' },
        { step: 5, instruction: waistband ? 'Waistband attachment and any closure remain review items because no waistband join or closure is declared in this draft.' : 'A waistband is not declared; resolve the waist finish before cutting.' },
        { step: 6, instruction: 'Confirm stride ease and balance on a sewn toile before final hemming or production cutting.' },
      ],
      readiness: {
        stage: checked ? 'geometry-checked' : 'draft',
        geometry: checked ? 'declared-trouser-seams' : 'incomplete',
        crotchCurve: 'not-verified',
        waistbandAttachment: 'not-verified',
        closure: 'not-verified',
        makerApproval: null,
        sampleApproval: null,
        productionEligible: false,
      },
      limitations: STANDARD_LIMITATIONS,
    });
  }

  const pieces = rawPieces.filter(piece => skirtRoles.has(piece?.role));
  const supported = configFamily === 'woven-a-line-skirt'
    || programFamily === 'woven-a-line-skirt'
    || pieces.some(piece => piece.role === 'skirt-front');
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
    seamAllowanceCm,
    patternConfiguration: project?.patternConfiguration || null,
    cutList: buildCutList(pieces),
    declaredSeams: seams,
    instructions,
    readiness: {
      stage: !supported ? 'unsupported' : sideSeam?.declared ? 'geometry-checked' : 'draft',
      geometry: sideSeam?.declared ? 'declared-side-seam' : 'incomplete',
      waistbandAttachment: 'not-verified',
      closure: 'not-verified',
      makerApproval: null,
      sampleApproval: null,
      productionEligible: false,
    },
    limitations: STANDARD_LIMITATIONS,
  });
}