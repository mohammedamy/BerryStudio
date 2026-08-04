import { useState } from 'react'
import { t } from '../i18n'

// WP-9.5: buttons call whatever ExportControls.jsx (a Canvas child, see its
// own header comment) most recently populated onto exportRef.current — a
// plain ref read here since this panel lives in the sidebar, outside the
// r3f tree, and has no other way to reach live scene/renderer/camera state.
// Each `key` doubles as its own i18n.js dictionary key (exportGLB,
// exportOBJ, exportUSDZ, exportTurntablePNGs, recordTurntableVideo).
const BUTTONS = [
  { key: 'exportGLB' },
  { key: 'exportOBJ' },
  { key: 'exportUSDZ' },
  { key: 'exportTurntablePNGs' },
  { key: 'recordTurntableVideo' },
]

export default function ExportPanel({ lang = 'en', exportRef }) {
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState(null)

  async function run(key) {
    const fn = exportRef.current?.[key]
    if (!fn) return
    setBusyKey(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(t(lang, 'exportFailed', { key, msg: e && e.message ? e.message : String(e) }))
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        {t(lang, 'export')}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {BUTTONS.map(({ key }) => (
          <button
            key={key}
            onClick={() => run(key)}
            disabled={busyKey !== null}
            style={{
              padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 600,
              background: 'var(--panel-2)', color: 'var(--text)', cursor: busyKey ? 'default' : 'pointer',
              opacity: busyKey && busyKey !== key ? 0.5 : 1,
            }}
          >
            {busyKey === key ? t(lang, 'working') : t(lang, key)}
          </button>
        ))}
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--danger, #e57373)' }}>{error}</div>}
    </div>
  )
}
