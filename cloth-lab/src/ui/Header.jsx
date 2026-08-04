import { CATEGORIES } from '../state/measurements'
import { t } from '../i18n'

const DEBUG_VIEW_KEYS = ['off', 'pieces', 'weld', 'cloth', 'seams']

// WP-5.3: `embedded` hides the title and category switcher — both are
// redundant chrome once mounted inside the root BerryStudio app's own tab
// UI, which already shows its own branding and its own Women/Men/Girls/
// Boys switcher one level up (category flows in via the `pattern` prop
// instead — see App.jsx). The debug-view switcher (Off/Pieces/Weld/Cloth/
// Seams) stays either way: it's genuinely unique to cloth-lab, no root-app
// equivalent exists to defer to.
// WP-10: `bodyOnly` (the standalone BodyForm page) additionally hides the
// debug-view switcher — there's no garment/cloth/seams to switch between,
// only the avatar, so every one of those buttons would be a dead end.
export default function Header({ embedded = false, bodyOnly = false, lang = 'en', category, onCategoryChange, debugView, onDebugViewChange }) {
  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px',
        borderBottom: '1px solid var(--border)', background: 'var(--panel)', flex: '0 0 auto',
      }}
    >
      {!embedded && <strong style={{ fontSize: 15 }}>{t(lang, 'title')}</strong>}
      {!bodyOnly && (
        <div style={{ display: 'flex', gap: 4 }}>
          {DEBUG_VIEW_KEYS.map((id) => (
            <button
              key={id}
              onClick={() => onDebugViewChange(id)}
              title={t(lang, `dv_${id}_title`)}
              style={{
                padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border)', fontSize: 13,
                background: id === debugView ? 'var(--accent-2)' : 'var(--panel-2)',
                color: id === debugView ? '#fff' : 'var(--text-2)',
              }}
            >
              {t(lang, `dv_${id}`)}
            </button>
          ))}
        </div>
      )}
      {!embedded && (
        <div style={{ display: 'flex', gap: 4, marginInlineStart: 'auto' }}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => onCategoryChange(c)}
              style={{
                padding: '6px 14px', borderRadius: 999, border: '1px solid var(--border)',
                background: c === category ? 'var(--accent)' : 'var(--panel-2)',
                color: c === category ? '#fff' : 'var(--text)',
              }}
            >
              {t(lang, `cat_${c}`)}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
