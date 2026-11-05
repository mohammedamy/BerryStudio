import { CATEGORIES } from '../state/measurements'
import { t } from '../i18n'

// Guided-workflow header: a numbered 3-step stepper (Pieces → Sew → Try on)
// that is always clickable — App decides what each jump needs (e.g. "Try
// on" builds the garment first) instead of silently bouncing the user back
// like the old tab row did. The standalone build also shows its title and,
// when no design is linked, the body category switcher.
export const STEPS = [
  ['pieces', 'Check pieces', 'مراجعة القطع'],
  ['sew', 'Sew', 'الخياطة'],
  ['tryon', 'Try on', 'التجربة'],
]
export default function Header({ embedded = false, bodyOnly = false, linked = false, lang = 'en', category, onCategoryChange, step, onStep, busy = false }) {
  const ar = lang === 'ar'
  const index = STEPS.findIndex(s => s[0] === step)
  return <header className="cl-header">
    {!embedded && <strong className="cl-brand">{t(lang, 'title')}</strong>}
    {!bodyOnly && linked && <nav className="cl-stepper" aria-label={ar ? 'خطوات العمل' : 'Garment workflow'}>
      <ol>
        {STEPS.map(([id, en, arabic], i) => <li key={id} className={i < index ? 'is-done' : i === index ? 'is-current' : ''}>
          <button aria-current={i === index ? 'step' : undefined} disabled={busy} onClick={() => onStep?.(id)}>
            <span className="cl-step-num" aria-hidden="true">{i < index ? '✓' : (ar ? '١٢٣'[i] : i + 1)}</span>
            <span className="cl-step-label">{ar ? arabic : en}</span>
          </button>
        </li>)}
      </ol>
    </nav>}
    {!embedded && !linked && <div className="cl-categories" role="group" aria-label={ar ? 'الفئة' : 'Category'}>{CATEGORIES.map(c => <button key={c} aria-pressed={c === category} onClick={() => onCategoryChange(c)}>{t(lang, `cat_${c}`)}</button>)}</div>}
  </header>
}
