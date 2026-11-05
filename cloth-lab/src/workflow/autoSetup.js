// Novice-first automatic setup for the Cloth Lab guided workflow.
//
// planPattern() (patternPlan.js) is deliberately strict: whenever a piece's
// placement, cut quantity, dart handling, visibility or outline is not
// declared by the source pattern, it raises a blocking question rather than
// guessing. Measured against the real BerryStudio library (308 designs),
// that strictness meant ~88% of designs opened in Cloth Lab with unanswered
// questions and ~92% had pieces that could not be simulated until the user
// hand-authored joins — the main reason novice users "always fail" to get a
// design into 3D.
//
// This module keeps planPattern() untouched and layers best-effort default
// answers on top of it. Every default is visible and editable in the UI
// (each auto-filled piece carries `auto: true`, shown as an "Auto" badge),
// and the user's own choices always take precedence. Defaults are kept to
// the same behaviour the importer itself would apply with no metadata
// (single copy, sleeves as a mirrored pair), plus a conservative
// name-keyword placement guess and a dart fallback that never produces an
// invalid garment: darts are sewn when the geometry supports it and kept
// as markings otherwise.
import { planPattern, shapeKey, labelOf } from './patternPlan'

const has = (re, s) => re.test(s)

// Placement guess from the piece's name (English and Arabic), body-zone
// override and declared schema role. Always returns one of PLACEMENTS'
// values — 'pocket' ("body attachment") is the safe fallback because it
// places a piece near the torso without sewing it to anything.
export function guessPlacement(piece) {
  const en = String((piece?.label && typeof piece.label === 'object' ? piece.label.en : piece?.label) || '').toLowerCase()
  const ar = String((piece?.label && typeof piece.label === 'object' ? piece.label.ar : '') || '')
  const name = `${en} ${ar}`
  const front = has(/front|أمام/, name), back = has(/back|خلف/, name)
  const lower = piece?.bodyZone === 'lower' || has(/skirt|hip|brief|tier|godet|peplum|تنور|ورك/, name)
  // Accessories first: a "Neckline Binding" or "Leg Opening Binding" must not
  // be mistaken for a full panel just because it also says "front"/"leg".
  if (has(/collar|neck|strap|yoke|shoulder|hood|cape|epaulet|ياقة|رقبة|حمالة|كتف/, name)) return 'collar'
  if (has(/waist|belt|sash|\btie\b|خصر|حزام/, name)) return 'waistband'
  if (has(/binding|gusset|insert|bridge|pocket|cuff|facing|placket|band|trim|جيب|كفة/, name)) return 'pocket'
  if (has(/sleeve|كم/, name)) return 'sleeve'
  if (has(/trouser|pant|\bleg\b|بنطال|بنطلون|ساق/, name)) return back ? 'trouser-back' : 'trouser-front'
  if (lower) return back ? 'hip-panel-back' : 'hip-panel-front'
  if (back) return 'back-panel'
  if (front) return 'front-panel'
  if (piece?.bodyZone === 'upper') return 'front-panel'
  return 'pocket'
}

// Mirrors importFromApp's own no-metadata behaviour: sleeves are drawn once
// and duplicated as a left/right pair; every other piece is a single copy.
export function guessCopies(piece, role) {
  if (role === 'sleeve' || /sleeve|كم/i.test(labelOf(piece, 'en') + labelOf(piece, 'ar'))) return 'pair'
  return 'single'
}

function defaultFor(q, answer) {
  switch (q.kind) {
    case 'invalid': return { include: 'exclude' }
    case 'hidden': return { include: 'exclude' }
    case 'placement': return { role: guessPlacement(q.piece) }
    case 'copies': return { copies: guessCopies(q.piece, answer.role || q.piece.role) }
    case 'darts': return { darts: 'close' }
    default: return {}
  }
}

// Returns { answers, plan } where `answers` = user answers (kept verbatim
// when they still match the piece's geometry) plus auto-filled answers for
// everything else, and `plan` = planPattern() run on those answers. The
// result is deterministic for a given payload + user answers, so callers can
// recompute it on every render (useMemo) instead of persisting it — only
// the user's explicit choices are ever saved.
export function autoPlan(payload, userAnswers = {}) {
  const answers = {}
  for (const piece of payload?.pieces || []) {
    const saved = userAnswers[piece.id]
    answers[piece.id] = saved?.shape === shapeKey(piece) ? { ...saved } : { shape: shapeKey(piece), auto: true }
  }
  // Answers can cascade (a placement choice can raise a copies question), so
  // iterate until stable. Each pass only fills fields that are still empty.
  let plan = planPattern(payload, answers)
  for (let pass = 0; pass < 4 && plan.questions.length; pass++) {
    for (const q of plan.questions) {
      const a = answers[q.piece.id]
      const fill = defaultFor(q, a)
      for (const [k, v] of Object.entries(fill)) if (a[k] === undefined || a[k] === '') { a[k] = v; a.autoFields = [...new Set([...(a.autoFields || []), k])] }
      if (q.kind === 'placement' || q.kind === 'copies') delete a.review
    }
    plan = planPattern(payload, answers)
  }
  // Sewn darts need specific geometry (apex inside, mouth on one straight
  // edge). Any auto-chosen "sew closed" that the geometry can't support is
  // downgraded to a marking, piece by piece, then globally as a last resort.
  const autoDarts = () => (payload?.pieces || []).filter(p => answers[p.id]?.darts === 'close' && answers[p.id]?.autoFields?.includes('darts'))
  if (plan.problems.length && autoDarts().length) {
    for (const p of autoDarts()) {
      const names = [labelOf(p, 'en'), labelOf(p, 'ar'), labelOf(p)].filter(Boolean)
      if (plan.problems.some(msg => names.some(n => msg.startsWith(`${n}:`)))) answers[p.id].darts = 'mark'
    }
    plan = planPattern(payload, answers)
    if (plan.problems.length) { for (const p of autoDarts()) answers[p.id].darts = 'mark'; plan = planPattern(payload, answers) }
  }
  return { answers, plan }
}

// Strips the bookkeeping flags before an answer is stored as the user's own.
export function asUserAnswer(answer) {
  const { auto: _auto, autoFields: _fields, ...rest } = answer || {}
  return rest
}
