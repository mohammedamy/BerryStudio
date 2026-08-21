import { useState } from 'react'
import { t } from '../i18n'

// HTML sidebar counterpart to SeamEditorScene's 3D vertex-picking — the seam
// list, commit/remove controls, and the handoff to the simulation pipeline.
export default function SeamEditorPanel({ lang = 'en', editor, onSimulate }) {
  const { drafts, pendingStart, pendingEdges, seams, error, commitSeam, removeSeam, toggleReverse, clearPending, finalize } = editor
  const [reverseNext, setReverseNext] = useState(false)

  const pieceLabel = (pieceIdx) => drafts[pieceIdx]?.label || drafts[pieceIdx]?.id

  return (
    <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {t(lang, 'seamAuthoring')}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 10px' }}>
        {t(lang, 'seamAuthoringHint')}
      </p>

      {pendingStart && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--panel-2)', border: '1px solid #ffcc33', borderRadius: 8, padding: 8, marginBottom: 10, fontSize: 12.5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffcc33', flexShrink: 0 }} />
          <span>{t(lang, 'startPointPicked', { piece: pieceLabel(pendingStart.pieceIdx) })}</span>
        </div>
      )}

      {pendingEdges.length > 0 && (
        <div style={{ background: 'var(--panel-2)', borderRadius: 8, padding: 8, marginBottom: 10, fontSize: 12.5 }}>
          {pendingEdges.map((pe, i) => (
            <div key={i}>{t(lang, 'edgeN', { n: i + 1 })}: {pieceLabel(pe.pieceIdx)} [{pe.from}→{pe.to}]</div>
          ))}
          {pendingEdges.length === 1 && <div style={{ color: 'var(--text-2)' }}>{t(lang, 'pickTwoMore')}</div>}
        </div>
      )}

      {pendingEdges.length === 2 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
            <input type="checkbox" checked={reverseNext} onChange={(e) => setReverseNext(e.target.checked)} />
            {t(lang, 'reverse')}
          </label>
          <button
            onClick={() => { commitSeam(reverseNext); setReverseNext(false) }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 12.5 }}
          >
            {t(lang, 'createSeam')}
          </button>
        </div>
      )}
      {(pendingEdges.length > 0) && (
        <button onClick={clearPending} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text-2)', fontSize: 11.5, marginBottom: 10 }}>
          {t(lang, 'clearSelection')}
        </button>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>{t(lang, 'seamsCount', { n: seams.length })}</div>
      {seams.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>{t(lang, 'noneYet')}</div>}
      {seams.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ flex: 1 }}>{s.a.piece}.{s.a.edge} ⟷ {s.b.piece}.{s.b.edge}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" checked={s.reverse} onChange={() => toggleReverse(s.id)} /> {t(lang, 'rev')}
          </label>
          <button onClick={() => removeSeam(s.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }} title={t(lang, 'removeSeam')}>×</button>
        </div>
      ))}

      <button
        onClick={() => { const result = finalize(); if (result) onSimulate(result) }}
        style={{ marginTop: 14, width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--accent-2)', color: '#fff', fontWeight: 700, fontSize: 13 }}
      >
        {t(lang, 'simulateGarment')}
      </button>
    </div>
  )
}
