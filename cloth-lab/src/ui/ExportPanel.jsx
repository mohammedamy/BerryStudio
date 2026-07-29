import { useState } from 'react'

// WP-9.5: buttons call whatever ExportControls.jsx (a Canvas child, see its
// own header comment) most recently populated onto exportRef.current — a
// plain ref read here since this panel lives in the sidebar, outside the
// r3f tree, and has no other way to reach live scene/renderer/camera state.
const BUTTONS = [
  { key: 'exportGLB', label: 'Export GLB' },
  { key: 'exportOBJ', label: 'Export OBJ' },
  { key: 'exportUSDZ', label: 'Export USDZ' },
  { key: 'exportTurntablePNGs', label: 'Turntable PNGs' },
  { key: 'recordTurntableVideo', label: 'Record Turntable Video' },
]

export default function ExportPanel({ exportRef }) {
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
      setError(`${key} failed: ${e && e.message ? e.message : e}`)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        Export
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {BUTTONS.map(({ key, label }) => (
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
            {busyKey === key ? 'Working…' : label}
          </button>
        ))}
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--danger, #e57373)' }}>{error}</div>}
    </div>
  )
}
