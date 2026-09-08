import { CATEGORIES } from '../state/measurements'
import { t } from '../i18n'
export default function Header({ embedded = false, bodyOnly = false, linked = false, configuring = false, onConfigure, lang = 'en', category, onCategoryChange, debugView, onDebugViewChange }) {
  const ar = lang === 'ar'
  return <header className="cl-header">
    {!embedded && <strong>{t(lang, 'title')}</strong>}
    {!bodyOnly && <nav aria-label={ar ? 'خطوات العمل' : 'Garment workflow'}>
      <button aria-current={configuring ? 'step' : undefined} onClick={onConfigure}>{ar ? '١ · القطع' : '1 · Pieces'}</button>
      <button aria-current={!configuring && debugView === 'seams' ? 'step' : undefined} onClick={() => onDebugViewChange('seams')}>{ar ? '٢ · الوصلات' : '2 · Joins'}</button>
      <button aria-current={!configuring && debugView === 'cloth' ? 'step' : undefined} onClick={() => onDebugViewChange('cloth')}>{ar ? '٣ · المحاكاة' : '3 · Simulate'}</button>
      <details className="cl-inspect"><summary>{ar ? 'فحص العرض' : 'Inspect'}</summary><div>{[['off', 'Body', 'الجسم'], ['pieces', 'Placed panels', 'القطع الموضوعة'], ['weld', 'Join alignment', 'محاذاة الوصلات']].map(([id, en, arabic]) => <button key={id} onClick={() => onDebugViewChange(id)}>{ar ? arabic : en}</button>)}</div></details>
    </nav>}
    {!embedded && !linked && <div className="cl-categories">{CATEGORIES.map(c => <button key={c} aria-pressed={c === category} onClick={() => onCategoryChange(c)}>{t(lang, `cat_${c}`)}</button>)}</div>}
  </header>
}
