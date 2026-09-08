import { shapeKey } from '../../../js/cloth-workflow-contract.js'
export { shapeKey, designKey } from '../../../js/cloth-workflow-contract.js'
import { convertAppPattern } from '../pattern/importFromApp'
import { resolveSchemaRole } from '../pattern/roles'

export const PLACEMENTS = [
  ['front-panel', 'Upper body · front', 'الجزء العلوي · أمام'],
  ['back-panel', 'Upper body · back', 'الجزء العلوي · خلف'],
  ['hip-panel-front', 'Lower body · front', 'الجزء السفلي · أمام'],
  ['hip-panel-back', 'Lower body · back', 'الجزء السفلي · خلف'],
  ['trouser-front', 'Trouser leg · front', 'ساق البنطال · أمام'],
  ['trouser-back', 'Trouser leg · back', 'ساق البنطال · خلف'],
  ['sleeve', 'Sleeve', 'كم'], ['collar', 'Neck / collar', 'رقبة / ياقة'],
  ['waistband', 'Waist attachment', 'قطعة عند الخصر'], ['pocket', 'Body attachment / pocket', 'قطعة ملحقة / جيب'],
]
export const labelOf = (piece, lang = 'en') => typeof piece?.label === 'object' ? piece.label[lang] || piece.label.en || piece.id : piece?.label || piece?.id || ''
export function validOutline(outline) {
  if (!Array.isArray(outline) || outline.length < 3 || !outline.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return false
  const area = outline.reduce((sum, p, i) => { const q = outline[(i + 1) % outline.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0)
  return Math.abs(area) > 1e-6
}

// A boundary dart is [apex, mouthA, mouthB], the root editor's contract.
// Only cut mouths on the SAME straight boundary segment. Internal/curved
// darts require explicit geometry authoring rather than an invented fold.
export function cutBoundaryDart(outline, dart) {
  if (!Array.isArray(dart) || dart.length !== 3 || !dart.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) throw new Error('Dart needs an apex and two mouth points.')
  const [apex, a, b] = dart
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i], q = outline[(i + 1) % outline.length]
    const dx = q[0] - p[0], dy = q[1] - p[1], len2 = dx * dx + dy * dy
    if (len2 < 1e-10) continue
    const project = v => { const t = ((v[0] - p[0]) * dx + (v[1] - p[1]) * dy) / len2; return Math.abs((v[0] - p[0]) * dy - (v[1] - p[1]) * dx) / Math.sqrt(len2) < 0.01 && t > 1e-5 && t < 1 - 1e-5 ? t : null }
    const ta = project(a), tb = project(b)
    if (ta === null || tb === null || Math.abs(ta - tb) < 1e-5) continue
    // Apex must lie inside the polygon and away from the mouth segment.
    let inside = false
    for (let j = 0, k = outline.length - 1; j < outline.length; k = j++) {
      const u = outline[j], v = outline[k]
      if ((u[1] > apex[1]) !== (v[1] > apex[1]) && apex[0] < (v[0] - u[0]) * (apex[1] - u[1]) / (v[1] - u[1]) + u[0]) inside = !inside
    }
    if (!inside) throw new Error('Dart apex must be inside its piece.')
    const first = ta < tb ? a : b, last = ta < tb ? b : a
    return { outline: [...outline.slice(0, i + 1), first.slice(), apex.slice(), last.slice(), ...outline.slice(i + 1)], segment: i, from: i + 1, apex: i + 2, to: i + 3, remap: index => index > i ? index + 3 : index }
  }
  throw new Error('The dart mouth must lie inside one straight outline edge. Adjust it in the pattern editor, or keep it as a marking.')
}

export function planPattern(payload, answers = {}) {
  const inventory = [], questions = [], prepared = [], problems = []
  for (const piece of payload?.pieces || []) {
    const saved = answers[piece.id]
    const answer = saved?.shape === shapeKey(piece) ? saved : {}
    const excluded = answer.include === 'exclude'
    const resolved = resolveSchemaRole(piece.role)
    const role = (resolveSchemaRole(answer.role) && answer.role !== 'other' ? answer.role : null) || (!answer.review && piece.role !== 'other' && resolved ? piece.role : null)
    const valid = validOutline(piece.outline)
    inventory.push({ piece, answer, role, valid, excluded })
    if (excluded) continue
    if (!valid) { questions.push({ piece, field: 'include', kind: 'invalid' }); continue }
    if (piece.visible === false && !answer.include) questions.push({ piece, field: 'include', kind: 'hidden' })
    if (!role) questions.push({ piece, field: 'role', kind: 'placement' })
    const info = resolveSchemaRole(role)
    const copies = answer.copies || (!answer.review && ((piece.cutOnFold ?? info?.cutOnFold) ? 'fold' : (piece.bilateral ?? info?.bilateral) ? 'pair' : (typeof piece.cutOnFold === 'boolean' || typeof piece.bilateral === 'boolean') ? 'single' : null))
    if (!copies) questions.push({ piece, field: 'copies', kind: 'copies' })
    if (piece.darts?.length && !answer.darts) questions.push({ piece, field: 'darts', kind: 'darts' })
    if (!role) continue
    prepared.push({ ...piece, role, cutOnFold: copies === 'fold', bilateral: copies === 'pair', bodyZone: answer.role ? info?.zone : piece.bodyZone })
  }
  let imported
  try { imported = convertAppPattern({ ...payload, pieces: prepared }) }
  catch (error) { problems.push(error.message); imported = { rawPieces: [], roles: {}, edgeInstructions: [], seamInstructions: [], recognized: [], skipped: [] } }
  const originals = new Map(prepared.map(p => [p.id, p]))
  for (const raw of imported.rawPieces) {
    const source = originals.get(raw.id) || originals.get(raw.id.replace(/_[rl]$/, ''))
    if (!source) { problems.push(`Missing source for ${raw.id}`); continue }
    raw.sourceId = source.id
    const minX = Math.min(...source.outline.map(p => p[0])), minY = Math.min(...source.outline.map(p => p[1]))
    const mirror = raw.id === `${source.id}_l`
    const darts = (source.darts || []).map(d => d.map(([x, y]) => [(x - minX) * (mirror ? -1 : 1), y - minY]))
    if (source.cutOnFold) darts.push(...darts.map(d => d.map(([x, y]) => [-x, y])))
    raw.darts = darts
    if (inventory.find(row => row.piece.id === source.id)?.answer.darts !== 'close') continue
    for (const [di, dart] of darts.entries()) {
      try {
        const cut = cutBoundaryDart(raw.outline, dart)
        const n = raw.outline.length
        const removed = new Set()
        imported.edgeInstructions = (imported.edgeInstructions || []).filter(edge => {
          if (edge.pieceId !== raw.id) return true
          const steps = (edge.toIdx - edge.fromIdx + n) % n || n
          if ((cut.segment - edge.fromIdx + n) % n < steps) { removed.add(edge.edgeName); return false }
          edge.fromIdx = cut.remap(edge.fromIdx); edge.toIdx = cut.remap(edge.toIdx)
          return true
        })
        imported.seamInstructions = (imported.seamInstructions || []).filter(seam => {
          const affected = [seam.a, seam.b].some(end => end.piece === raw.id && removed.has(end.edge))
          if (affected) raw.joinReview = true
          return !affected
        })
        raw.outline = cut.outline
        const a = `dart_${di}_a`, b = `dart_${di}_b`
        imported.edgeInstructions.push({ pieceId: raw.id, edgeName: a, fromIdx: cut.from, toIdx: cut.apex }, { pieceId: raw.id, edgeName: b, fromIdx: cut.apex, toIdx: cut.to })
        imported.seamInstructions.push({ id: `${raw.id}_dart_${di}`, a: { piece: raw.id, edge: a }, b: { piece: raw.id, edge: b }, reverse: true })
      } catch (error) { problems.push(`${labelOf(source)}: ${error.message}`) }
    }
  }
  for (const skipped of imported.skipped) problems.push(`${skipped.label}: ${skipped.reason}`)
  return { inventory, questions, problems, imported, ready: questions.length === 0 && problems.length === 0 && imported.rawPieces.length > 0 }
}
