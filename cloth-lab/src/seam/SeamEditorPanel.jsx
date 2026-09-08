import { useState } from 'react'
import { t } from '../i18n'

// HTML sidebar counterpart to SeamEditorScene's 3D vertex-picking — the seam
// list, commit/remove controls, and the handoff to the simulation pipeline.
export default function SeamEditorPanel({ lang = 'en', editor, onSimulate }) {
  const { drafts, pendingStart, pendingEdges, seams, error, commitSeam, removeSeam, toggleReverse, clearPending, finalize } = editor
  const [reverseNext, setReverseNext] = useState(false)
  const [attachIntent, setAttachIntent] = useState({})

  // Real imported pieces carry a bilingual `label: {en, ar}` object (every
  // rawPieces.push() in pattern/importFromApp.js passes p.label straight
  // through) — only the built-in skirt demo (pattern/library/skirt.js)
  // happens to use a plain string, which is why this went unnoticed until
  // a real garment was tested. Rendering the raw object directly as a JSX
  // child (the old `drafts[pieceIdx]?.label` return value) makes React
  // throw "Objects are not valid as a React child" the instant it's
  // rendered below — i.e. crashes the whole panel the moment a SECOND
  // vertex click completes an edge and this label is first displayed.
  const pieceLabel = (pieceIdx) => {
    const draft = drafts[pieceIdx]
    if (!draft) return ''
    const { label, id } = draft
    if (label && typeof label === 'object') return label[lang] || label.en || id
    return label || id
  }

  return (
    <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {t(lang, 'seamAuthoring')}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 10px' }}>
        {lang === 'ar' ? 'حدد الحواف على رسومات القطع. أضف حواف أخرى لوصلة متعددة القطع.' : 'Select edges on the piece drawings. Add more edges for a multi-piece join.'}
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
            <div key={i}>{t(lang, 'edgeN', { n: i + 1 })}: {pieceLabel(pe.pieceIdx)} [{pe.from + 1}→{pe.to + 1}]</div>
          ))}
          {pendingEdges.length === 1 && <div style={{ color: 'var(--text-2)' }}>{t(lang, 'pickTwoMore')}</div>}
        </div>
      )}

      {pendingEdges.length >= 2 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
            <input type="checkbox" checked={reverseNext} onChange={(e) => setReverseNext(e.target.checked)} />
            {lang === 'ar' ? 'مطابقة النهايات المتعاكسة' : 'Match opposite ends'}
          </label>
          <button
            onClick={() => { commitSeam(reverseNext); setReverseNext(false) }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 12.5 }}
          >
            {lang === 'ar' ? 'وصل الحواف المحددة' : 'Join selected edges'}
          </button>
        </div>
      )}
      {(pendingStart || pendingEdges.length > 0) && (
        <button onClick={clearPending} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text-2)', fontSize: 11.5, marginBottom: 10 }}>
          {t(lang, 'clearSelection')}
        </button>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <details open={seams.length <= 6}><summary>{t(lang, 'seamsCount', { n: seams.length })}</summary>
      {seams.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>{t(lang, 'noneYet')}</div>}
      {seams.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ flex: 1 }}>{pieceLabel(drafts.findIndex(d => d.id === s.a.piece))} ({s.a.edge.replaceAll('_', ' ')}) ⟷ {pieceLabel(drafts.findIndex(d => d.id === s.b.piece))} ({s.b.edge.replaceAll('_', ' ')})</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" checked={s.reverse} onChange={() => toggleReverse(s.id)} /> {t(lang, 'rev')}
          </label>
          <button onClick={() => removeSeam(s.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }} title={t(lang, 'removeSeam')}>×</button>
        </div>
      ))}

      </details>
      {(editor.unjoined || []).map(draft => <fieldset key={draft.id} className="cl-attachment-question"><legend>{lang === 'ar' ? 'كيف تتصل هذه القطعة؟' : 'How does this piece attach?'} {pieceLabel(drafts.findIndex(d => d.id === draft.id))}</legend>
        <label className="cl-choice"><input type="radio" name={`attach-${draft.id}`} checked={!!attachIntent[draft.id]} onChange={() => { setAttachIntent(v => ({ ...v, [draft.id]: true })); document.querySelector('.cl-sewing')?.scrollIntoView({ block: 'nearest' }) }} />{lang === 'ar' ? 'سأحدد حوافها وأوصلها بقطعة أخرى' : 'I will select its edges and join it to another piece'}</label>
        {draft.joinReview && <><p>{lang === 'ar' ? 'غيّرت البنسة حافة وصلة سابقة. راجع الوصلات المتبقية.' : 'The dart changed an existing join edge. Review the remaining attachments.'}</p><label className="cl-choice"><input type="radio" name={`attach-${draft.id}`} checked={false} onChange={() => editor.acknowledgeJoins(draft.id)} />{lang === 'ar' ? 'الوصلات المتبقية صحيحة؛ تبقى الحافة الجديدة حرة' : 'The remaining joins are correct; leave the new boundary free'}</label></>}
        <label className="cl-choice"><input type="radio" name={`attach-${draft.id}`} checked={false} onChange={() => editor.markSeparate(draft.id, true)} />{lang === 'ar' ? 'تبقى قطعة منفصلة في هذه المعاينة' : 'Keep it separate in this preview'}</label>
      </fieldset>)}
      {(editor.separate || []).map(id => <p key={id}>{pieceLabel(drafts.findIndex(d => d.id === id))}: {lang === 'ar' ? 'منفصلة' : 'separate'} <button onClick={() => editor.markSeparate(id, false)}>{lang === 'ar' ? 'تغيير' : 'Change'}</button></p>)}
      {(editor.warnings || []).length > 0 && <details><summary>{lang === 'ar' ? 'وصلات تحتاج مراجعة' : 'Import edges needing review'}</summary>{editor.warnings.map((w, i) => <p key={i}>{w}</p>)}</details>}
      <button
        onClick={() => { const result = finalize(); if (result) onSimulate(result) }}
        disabled={!!editor.unjoined?.length || !!pendingStart || pendingEdges.length > 0}
        style={{ marginTop: 14, width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--accent-2)', color: '#fff', fontWeight: 700, fontSize: 13 }}
      >
        {t(lang, 'simulateGarment')}
      </button>
    </div>
  )
}
