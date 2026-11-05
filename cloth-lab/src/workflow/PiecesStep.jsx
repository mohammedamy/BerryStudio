import { useState } from 'react'
import { PLACEMENTS, labelOf, shapeKey } from './patternPlan'
import { asUserAnswer } from './autoSetup'
import { resolveSchemaRole } from '../pattern/roles'

// Step 1 of the guided workflow. Every piece arrives already set up (see
// autoSetup.js), so this screen is a calm overview rather than a form: one
// card per source piece with plain-language chips, a badge saying where the
// setup came from, and an inline editor that only opens on request.
export const COPIES = [
  ['single', 'One piece', 'قطعة واحدة'],
  ['pair', 'Mirrored pair (left + right)', 'زوج معكوس (يسار + يمين)'],
  ['fold', 'Half pattern, cut on the fold', 'نصف باترون، يُقص على الطي'],
]
export const DARTS = [
  ['close', 'Sew closed (shapes the cloth)', 'تُخاط مغلقة (تشكّل القماش)'],
  ['mark', 'Keep as a marking only', 'تبقى علامة فقط'],
]
const pick = (list, value, ar) => { const row = list.find(r => r[0] === value); return row ? row[ar ? 2 : 1] : '' }

// Plain-language names for every schema role (roles.js), so no raw ids like
// "bodice-front-center" ever reach the user. Falls back by placement family,
// then to a humanized id.
const ROLE_NAMES = {
  'bodice-front-center': ['Upper body · front centre', 'الجزء العلوي · وسط أمامي'], 'bodice-front-side': ['Upper body · front side', 'الجزء العلوي · جانب أمامي'],
  'bodice-back-center': ['Upper body · back centre', 'الجزء العلوي · وسط خلفي'], 'bodice-back-side': ['Upper body · back side', 'الجزء العلوي · جانب خلفي'],
  'brief-front': ['Brief · front', 'سروال داخلي · أمام'], 'brief-back': ['Brief · back', 'سروال داخلي · خلف'],
  'skirt-front-gore': ['Skirt · front gore', 'تنورة · قطعة أمامية'], 'skirt-back-gore': ['Skirt · back gore', 'تنورة · قطعة خلفية'],
  'skirt-side-gore-left': ['Skirt · left gore', 'تنورة · قطعة يسرى'], 'skirt-side-gore-right': ['Skirt · right gore', 'تنورة · قطعة يمنى'],
  'sleeve-upper': ['Sleeve · upper half', 'كم · النصف العلوي'], 'sleeve-under': ['Sleeve · under half', 'كم · النصف السفلي'],
  'cap-sleeve': ['Cap sleeve', 'كم قصير'], 'puff-sleeve': ['Puff sleeve', 'كم منفوخ'], 'butterfly-sleeve': ['Butterfly sleeve', 'كم فراشة'],
  undercollar: ['Under collar', 'ياقة سفلية'], 'collar-stand': ['Collar stand', 'قاعدة الياقة'], 'collar-band': ['Collar band', 'شريط الياقة'],
  'lapel-facing': ['Lapel facing', 'تبطين الصدر'], 'placket-facing': ['Placket', 'مرد الأزرار'], hood: ['Hood', 'قبعة'], cape: ['Cape', 'كاب'], 'cape-overlay': ['Cape overlay', 'كاب علوي'],
  yoke: ['Yoke', 'نير'], epaulette: ['Shoulder tab', 'كتافة'], 'peplum-front': ['Peplum · front', 'ببلوم · أمام'], 'peplum-back': ['Peplum · back', 'ببلوم · خلف'],
  sash: ['Sash', 'وشاح'], 'wrap-tie': ['Wrap tie', 'رباط'], belt: ['Belt', 'حزام'], godet: ['Godet (flare insert)', 'قطعة توسيع'], tier: ['Tier', 'طبقة'],
  facing: ['Facing', 'تبطين'], lining: ['Lining', 'بطانة'], cuff: ['Cuff', 'كفة'], 'rib-cuff': ['Rib cuff', 'كفة مضلعة'], 'hem-band': ['Hem band', 'شريط الذيل'],
  cup: ['Bra cup', 'كوب الصدرية'], band: ['Band', 'شريط'], strap: ['Strap', 'حمالة'], 'elastic-band': ['Elastic band', 'شريط مطاطي'], gusset: ['Gusset', 'قطعة تقوية'],
  other: ['Body attachment', 'قطعة ملحقة'],
}
export function roleLabel(role, lang = 'en') {
  const ar = lang === 'ar'
  if (!role) return ''
  const direct = pick(PLACEMENTS, role, ar)
  if (direct) return direct
  if (ROLE_NAMES[role]) return ROLE_NAMES[role][ar ? 1 : 0]
  return String(role).replaceAll('-', ' ')
}

export function effectiveCopies(piece, answer, role) {
  if (answer?.copies) return answer.copies
  const info = resolveSchemaRole(role)
  return (piece.cutOnFold ?? info?.cutOnFold) ? 'fold' : (piece.bilateral ?? info?.bilateral) ? 'pair' : 'single'
}

export function Thumb({ outline, darts, color, size = 120 }) {
  if (!outline?.length) return <div className="cl-thumb cl-thumb-empty" style={{ height: size }} aria-hidden="true">?</div>
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1])
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX || 1, h = Math.max(...ys) - minY || 1
  const pad = Math.max(w, h) * 0.08, s = Math.max(w, h)
  return <svg className="cl-thumb" style={{ height: size }} viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <polygon points={outline.map(p => p.join(',')).join(' ')} fill={color || '#8477ff'} fillOpacity=".28" stroke="currentColor" strokeWidth={s * 0.012} strokeLinejoin="round" />
    {(darts || []).filter(d => d?.length === 3).map((d, i) => <polyline key={i} points={[d[1], d[0], d[2]].map(p => p.join(',')).join(' ')} fill="none" stroke="#e9aa59" strokeWidth={s * 0.012} />)}
  </svg>
}

function statusOf(row, questions, ar) {
  const text = (en, arabic) => ar ? arabic : en
  if (!row.valid) return ['blocked', text('Can’t be used', 'غير صالحة')]
  if (row.excluded) return ['off', text('Left out', 'مستبعدة')]
  if (questions.length) return ['attention', text('Needs a choice', 'تحتاج اختياراً')]
  if (row.answer.auto && row.answer.autoFields?.length) return ['guess', text('Auto-guessed · check', 'تخمين تلقائي · راجِع')]
  if (row.answer.auto) return ['ok', text('Ready', 'جاهزة')]
  return ['edited', text('Your setup', 'إعدادك')]
}

function PieceCard({ row, questions, lang, onAnswer }) {
  const ar = lang === 'ar', text = (en, arabic) => ar ? arabic : en
  const { piece, answer, role, excluded, valid } = row
  const [open, setOpen] = useState(false)
  const [tone, status] = statusOf(row, questions, ar)
  const copies = effectiveCopies(piece, answer, role)
  const set = (field, value) => onAnswer(piece.id, { ...asUserAnswer(answer), shape: shapeKey(piece), [field]: value })
  const hasDarts = (piece.darts || []).length > 0
  const editing = open || tone === 'attention'
  return <article className={`cl-piece-card tone-${tone}${editing ? ' is-open' : ''}`}>
    <div className="cl-card-top">
      <Thumb outline={piece.outline} darts={piece.darts} color={piece.color} size={96} />
      <div className="cl-card-info">
        <strong className="cl-card-title">{labelOf(piece, lang)}</strong>
        <span className={`cl-badge tone-${tone}`}>{status}</span>
        {valid && !excluded && <ul className="cl-chips" aria-label={text('Setup', 'الإعداد')}>
          {role && <li>{roleLabel(role, lang)}</li>}
          <li>{pick(COPIES, copies, ar)}</li>
          {hasDarts && <li>{answer.darts === 'close' ? text('Darts sewn', 'بنسات مخيطة') : text('Darts marked', 'بنسات كعلامة')}</li>}
        </ul>}
        {!valid && <p className="cl-card-note">{text('This outline is incomplete. Fix it in the pattern editor to include it.', 'حدود هذه القطعة غير مكتملة. أصلحها في محرر الباترون لتضمينها.')}</p>}
        {valid && excluded && <p className="cl-card-note">{piece.visible === false ? text('Hidden in your pattern, so it is left out.', 'مخفية في الباترون، لذلك استُبعدت.') : text('Not part of this try-on.', 'ليست جزءاً من هذه التجربة.')}</p>}
      </div>
    </div>
    {valid && (excluded
      ? <button className="cl-btn cl-btn-ghost cl-btn-sm" onClick={() => onAnswer(piece.id, { shape: shapeKey(piece), include: 'include' })}>{text('Include this piece', 'ضمّ هذه القطعة')}</button>
      : tone !== 'attention' && <button className="cl-btn cl-btn-ghost cl-btn-sm" aria-expanded={editing} onClick={() => setOpen(v => !v)}>{editing ? text('Done', 'تم') : text('Change', 'تغيير')}</button>)}
    {valid && !excluded && editing && <div className="cl-card-edit">
      <label className="cl-field">{text('Where does it go on the body?', 'أين توضع على الجسم؟')}
        <select value={role || ''} onChange={e => set('role', e.target.value)}>
          {!role && <option value="">{text('Choose…', 'اختر…')}</option>}
          {PLACEMENTS.map(([value, en, arabic]) => <option key={value} value={value}>{ar ? arabic : en}</option>)}
          {role && !PLACEMENTS.some(p => p[0] === role) && <option value={role}>{roleLabel(role, lang)}</option>}
        </select>
      </label>
      <label className="cl-field">{text('How is it cut?', 'كيف تُقص؟')}
        <select value={copies} onChange={e => set('copies', e.target.value)}>
          {COPIES.map(([value, en, arabic]) => <option key={value} value={value}>{ar ? arabic : en}</option>)}
        </select>
      </label>
      {hasDarts && <label className="cl-field">{text('Darts', 'البنسات')}
        <select value={answer.darts || ''} onChange={e => set('darts', e.target.value)}>
          {!answer.darts && <option value="">{text('Choose…', 'اختر…')}</option>}
          {DARTS.map(([value, en, arabic]) => <option key={value} value={value}>{ar ? arabic : en}</option>)}
        </select>
      </label>}
      <button className="cl-btn cl-btn-link cl-btn-sm" onClick={() => set('include', 'exclude')}>{text('Leave this piece out', 'استبعاد هذه القطعة')}</button>
    </div>}
  </article>
}

export default function PiecesStep({ source, plan, lang, onAnswer }) {
  const ar = lang === 'ar', text = (en, arabic) => ar ? arabic : en
  const rows = plan.inventory
  const used = rows.filter(r => r.valid && !r.excluded)
  const guessed = used.filter(r => r.answer.auto && r.answer.autoFields?.length).length
  const off = rows.length - used.length
  return <section className="cl-step cl-pieces" aria-label={text('Check your pieces', 'راجع القطع')}>
    <div className="cl-hero">
      <div className="cl-hero-text">
        <span className="cl-eyebrow">{text('Step 1 of 3 · Check pieces', 'الخطوة ١ من ٣ · مراجعة القطع')}</span>
        <h2>{source.designName || text('Your design', 'تصميمك')}</h2>
        <p>{text('We prepared every piece for you automatically. New here? Just press “Try it on” — you can fine-tune anything afterwards. Your 2D pattern is never changed.', 'جهّزنا كل القطع تلقائياً. جديد هنا؟ اضغط «جرّبه على المجسم» مباشرة — يمكنك تعديل أي شيء لاحقاً. لن يتغير الباترون ثنائي الأبعاد.')}</p>
      </div>
      <dl className="cl-stats">
        <div><dt>{text('In this try-on', 'في هذه التجربة')}</dt><dd>{used.length}</dd></div>
        <div className={guessed ? 'is-guess' : ''}><dt>{text('Worth a look', 'تستحق المراجعة')}</dt><dd>{guessed}</dd></div>
        <div><dt>{text('Left out', 'مستبعدة')}</dt><dd>{off}</dd></div>
      </dl>
    </div>
    {plan.problems.length > 0 && <div role="alert" className="cl-callout tone-warn">
      <strong>{text('A piece needs a small change before it can be simulated', 'قطعة تحتاج تعديلاً بسيطاً قبل المحاكاة')}</strong>
      <ul>{plan.problems.map((problem, i) => <li key={i}>{problem}</li>)}</ul>
      <p>{text('Tip: set its darts to “Keep as a marking only”, or leave the piece out.', 'نصيحة: اجعل بنساتها «علامة فقط»، أو استبعد القطعة.')}</p>
    </div>}
    <div className="cl-piece-grid">
      {rows.map(row => <PieceCard key={row.piece.id} row={row} questions={plan.questions.filter(q => q.piece.id === row.piece.id)} lang={lang} onAnswer={onAnswer} />)}
    </div>
  </section>
}
