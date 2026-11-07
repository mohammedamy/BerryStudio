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
import { resolveSchemaRole } from '../pattern/roles'

const has = (re, s) => re.test(s)
const PANEL_NOUN_RE = /\b(bodice|shirt|t-shirt|tee|blouse|dress|gown|top|jacket|coat|vest|tunic|abaya|thobe|leotard|skirt|trouser|pant|shorts|panel|body)\b|\bleg\b|صدرية|قميص|بلوزة|فستان|جاكيت|معطف|عباية|ثوب|تنور|بنطال|بنطلون|ساق|لوحة/

// Placement guess from the piece's name (English and Arabic), body-zone
// override and declared schema role. Always returns one of PLACEMENTS'
// values — 'pocket' ("body attachment") is the safe fallback because it
// places a piece near the torso without sewing it to anything.
export function guessPlacement(piece) {
  const en = String((piece?.label && typeof piece.label === 'object' ? piece.label.en : piece?.label) || '').toLowerCase()
  const ar = String((piece?.label && typeof piece.label === 'object' ? piece.label.ar : '') || '')
  const rawName = `${en} ${ar}`
  // Strip trailing "with ..." / "مع ..." modifiers so "Shirt Back with Yoke"
  // or "Bodice Front with Placket" classifies by its primary garment noun.
  const name = rawName.replace(/\bwith\b.*|مع\s+.*/g, '').trim() || rawName
  const front = has(/front|أمام|مقدمة/, name), back = has(/back|خلف|ظهر/, name)
  const lower = piece?.bodyZone === 'lower' || has(/skirt|hip|brief|tier|godet|peplum|تنور|ورك/, name)
  const isPanel = has(PANEL_NOUN_RE, name)

  // Explicit accessory nouns win first so "Neckline Binding" or "Leg Opening
  // Binding" is never mistaken for a full panel just because it mentions a
  // body region, while modifier prefixes on real panels ("V-Neck Bodice
  // Front", "High-Waist Skirt Back", "One-Shoulder Dress Front") stay panels.
  if (has(/binding|band|facing|trim|placket|سجاف|شريط/, name) && has(/collar|neck|ياقة|رقبة/, name)) return 'collar'
  if (has(/\b(collar|undercollar|lapel|strap|hood|epaulet\w*|yoke)\b|ياقة|حمالة/, name)) return 'collar'
  if (has(/\b(waistband|belt|sash|peplum)\b|wrap[-\s]?tie|حزام/, name)) return 'waistband'
  if (has(/\b(binding|gusset|insert|bridge|pocket|cuff|facing|placket|trim|lining|cup)\b|\bband\b|جيب|كفة|أساور|بطانة|دكة/, name)) return 'pocket'
  if (has(/sleeve|كم/, name)) return 'sleeve'
  if (!isPanel && has(/collar|neck|shoulder|cape|ياقة|رقبة|كتف|كاب/, name)) return 'collar'
  if (!isPanel && has(/waist|\btie\b|خصر|رباط/, name)) return 'waistband'
  if (has(/trouser|pant|shorts|\bleg\b|بنطال|بنطلون|شورت|ساق/, name)) return back ? 'trouser-back' : 'trouser-front'
  if (lower) return back ? 'hip-panel-back' : 'hip-panel-front'
  if (back) return 'back-panel'
  if (front) return 'front-panel'
  if (piece?.bodyZone === 'upper') return 'front-panel'
  return 'pocket'
}

// Consults the resolved schema role first (so bilateral roles like
// trouser-front/back, bodice-*-side, hood, godet default to a mirrored pair
// and cutOnFold roles like bodice-*-center default to on-the-fold), then
// falls back to importFromApp's sleeve-pair / single-copy convention.
export function guessCopies(piece, role) {
  const info = resolveSchemaRole(role)
  if (info?.cutOnFold) return 'fold'
  if (info?.bilateral || info?.placement === 'sleeve') return 'pair'
  if (/sleeve|كم/i.test(labelOf(piece, 'en') + labelOf(piece, 'ar'))) return 'pair'
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
