// Per-piece physical material & role classification for Cloth Lab.
// Assigns each pattern piece a physics profile (`PHYS_CLASS`) so elastic bands,
// contoured bikini/intimate knits, loose flowing garments, and tailored structured
// trims respond authentically inside the GPU solver without adding extra samplers.

export const PHYS_CLASS = {
  STANDARD: 0,
  ELASTIC: 1,
  BIKINI_INTIMATE: 2,
  LOOSE_FLOW: 3,
  STRUCTURED: 4,
}

const STRUCTURED_SCHEMA_ROLES = new Set([
  'collar',
  'undercollar',
  'collar-stand',
  'collar-band',
  'lapel-facing',
  'placket-facing',
  'yoke',
  'epaulette',
  'waistband',
])

const LOOSE_SCHEMA_ROLES = new Set([
  'tier',
  'godet',
  'cape',
  'cape-overlay',
  'peplum-front',
  'peplum-back',
  'puff-sleeve',
  'butterfly-sleeve',
])

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function smoothstep(edge0, edge1, x) {
  if (edge1 === edge0) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function measure2DProfile(positions2D) {
  if (!positions2D || positions2D.length === 0) {
    return { heightCm: 0, topWidth: 0, botWidth: 0, maxWidth: 0, minY: 0, maxY: 0 }
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [x, y] of positions2D) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const heightCm = Math.max(0, maxY - minY)
  const band = Math.max(1.5, heightCm * 0.18)
  let topMinX = Infinity, topMaxX = -Infinity
  let botMinX = Infinity, botMaxX = -Infinity
  for (const [x, y] of positions2D) {
    if (y <= minY + band) {
      if (x < topMinX) topMinX = x
      if (x > topMaxX) topMaxX = x
    }
    if (y >= maxY - band) {
      if (x < botMinX) botMinX = x
      if (x > botMaxX) botMaxX = x
    }
  }
  return {
    heightCm,
    topWidth: Number.isFinite(topMaxX - topMinX) ? Math.max(0, topMaxX - topMinX) : 0,
    botWidth: Number.isFinite(botMaxX - botMinX) ? Math.max(0, botMaxX - botMinX) : 0,
    maxWidth: Number.isFinite(maxX - minX) ? Math.max(0, maxX - minX) : 0,
    minY,
    maxY,
  }
}

export function classifyPiecePhysics(tp, dims = null) {
  const role = tp?.role || ''
  const hint = tp?.placementHint || {}
  const schemaRole = hint.schemaRole || ''
  const siblingOffset = (hint.index || 0) > 0 ? 0.0010 : 0

  const isElasticBand = Boolean(
    hint.isElasticTrim ||
    hint.sewnBriefWaist ||
    hint.isBriefWaist ||
    hint.isLegOpeningElastic ||
    hint.sewnLegElastic ||
    hint.sewnSportBand ||
    role === 'attachUnderbust' ||
    role === 'attachStrap' ||
    schemaRole === 'elastic-band' ||
    schemaRole === 'rib-cuff' ||
    schemaRole === 'hem-band'
  )
  if (isElasticBand) {
    const isWaistOrUnderbust = Boolean(
      hint.sewnBriefWaist ||
      hint.isBriefWaist ||
      hint.sewnSportBand ||
      role === 'attachUnderbust'
    )
    const isLegOrStrap = Boolean(
      hint.isLegOpeningElastic ||
      hint.sewnLegElastic ||
      role === 'attachStrap'
    )
    const restScale = isWaistOrUnderbust ? 0.87 : (isLegOrStrap ? 0.89 : 0.92)
    return {
      physClass: PHYS_CLASS.ELASTIC,
      restScale,
      skinOffset: -0.0036,
      isElastic: true,
      isIntimateKnit: false,
      isLoose: false,
      flareFactor: 0,
    }
  }

  const isBikiniIntimate = Boolean(
    hint.isBrief ||
    hint.isBriefGusset ||
    hint.sewnCupBra ||
    hint.isSportBra ||
    hint.isFittedIntimate ||
    role === 'attachCrotch' ||
    role === 'attachBust'
  )
  if (isBikiniIntimate) {
    const restScale = (hint.isSportBra || hint.isFittedIntimate) ? 0.93 : 0.915
    return {
      physClass: PHYS_CLASS.BIKINI_INTIMATE,
      restScale,
      skinOffset: -0.0034 + siblingOffset,
      isElastic: false,
      isIntimateKnit: true,
      isLoose: false,
      flareFactor: 0,
    }
  }

  const isStructured = Boolean(
    (role === 'attachNeck' && hint.neckKind !== 'cape' && hint.neckKind !== 'cape-overlay' && hint.neckKind !== 'hood') ||
    role === 'attachWrist' ||
    STRUCTURED_SCHEMA_ROLES.has(schemaRole) ||
    hint.isStructuredOuter
  )
  if (isStructured) {
    return {
      physClass: PHYS_CLASS.STRUCTURED,
      restScale: 1.0,
      skinOffset: clamp((hint.index || 0) > 0 ? 0.0012 : 0.0004, -0.0032, 0.0020),
      isElastic: false,
      isIntimateKnit: false,
      isLoose: false,
      flareFactor: 0,
    }
  }

  const prof = measure2DProfile(tp?.positions2D)
  const hipWidthCm = dims?.hipR ? dims.hipR * 200 : 32
  const thighWidthCm = dims?.thighR ? dims.thighR * 200 : 17
  const hasLowerFlare =
    (role === 'hipPanelFront' || role === 'hipPanelBack' || role === 'frontPanel' || role === 'backPanel') &&
    prof.heightCm > 38 &&
    (prof.botWidth > Math.max(1e-4, prof.topWidth) * 1.16 || (prof.heightCm > 52 && prof.botWidth > hipWidthCm * 1.08))
  const isWideTrouser =
    (role === 'legFront' || role === 'legBack') &&
    prof.heightCm > 45 &&
    prof.botWidth > thighWidthCm * 1.25
  const isWideSleeve =
    role === 'sleeve' &&
    prof.topWidth > 1e-4 &&
    prof.botWidth > prof.topWidth * 0.72 &&
    prof.botWidth > 26

  const isLoose = Boolean(
    role.startsWith('gore') ||
    hint.isSkirtTier ||
    hint.isLooseGarment ||
    hint.neckKind === 'cape' ||
    hint.neckKind === 'cape-overlay' ||
    LOOSE_SCHEMA_ROLES.has(schemaRole) ||
    hasLowerFlare ||
    isWideTrouser ||
    isWideSleeve
  )
  if (isLoose) {
    const rawFlare = prof.topWidth > 1 ? clamp((prof.botWidth / prof.topWidth - 1.0) * 0.8, 0.25, 1.0) : 0.7
    return {
      physClass: PHYS_CLASS.LOOSE_FLOW,
      restScale: 1.0,
      skinOffset: clamp(0.0006 + siblingOffset, -0.0032, 0.0020),
      isElastic: false,
      isIntimateKnit: false,
      isLoose: true,
      flareFactor: Math.max(rawFlare, hint.isLooseGarment || role.startsWith('gore') || hint.isSkirtTier ? 0.75 : 0.4),
    }
  }

  return {
    physClass: PHYS_CLASS.STANDARD,
    restScale: 1.0,
    skinOffset: clamp((hint.index || 0) > 0 ? 0.0010 : -0.0008, -0.0032, 0.0020),
    isElastic: false,
    isIntimateKnit: false,
    isLoose: false,
    flareFactor: 0,
  }
}

export function computePerVertexFlowWeight(tp, physInfo) {
  const positions2D = tp?.positions2D || []
  const n = positions2D.length
  const out = new Float32Array(n)
  if (n === 0 || !physInfo) return out

  let minY = Infinity, maxY = -Infinity
  for (const [, y] of positions2D) {
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const h = Math.max(1e-4, maxY - minY)

  if (physInfo.physClass === PHYS_CLASS.LOOSE_FLOW) {
    for (let i = 0; i < n; i++) {
      const uY = clamp((positions2D[i][1] - minY) / h, 0, 1)
      out[i] = smoothstep(0.18, 0.92, uY)
    }
    return out
  }

  if (physInfo.physClass === PHYS_CLASS.ELASTIC) {
    for (let i = 0; i < n; i++) {
      const uY = clamp((positions2D[i][1] - minY) / h, 0, 1)
      out[i] = 0.85 + 0.15 * uY
    }
    return out
  }

  if (physInfo.physClass === PHYS_CLASS.BIKINI_INTIMATE) {
    for (let i = 0; i < n; i++) {
      const uY = clamp((positions2D[i][1] - minY) / h, 0, 1)
      out[i] = 0.75 + 0.25 * Math.sin(uY * Math.PI * 0.5)
    }
    return out
  }

  return out
}
