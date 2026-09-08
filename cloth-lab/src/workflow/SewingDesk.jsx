import { labelOf } from './patternPlan'

export default function SewingDesk({ editor, lang = 'en' }) {
  const ar = lang === 'ar', text = (en, arabic) => ar ? arabic : en
  return <section className="cl-sewing" aria-label={text('Join pattern pieces', 'وصل قطع الباترون')}>
    <div className="cl-heading"><span className="cl-eyebrow">{text('2 · Join your pieces', '٢ · وصل القطع')}</span><h2>{text('Choose the edges that meet', 'اختر الحواف التي تلتقي')}</h2><p>{text('Choose an existing edge, or click its start and end points. Select two or more edges, then Join selected edges. Four pieces can share one junction.', 'اختر حافة موجودة أو انقر نقطتي بدايتها ونهايتها. حدد حافتين أو أكثر ثم اضغط وصل الحواف. يمكن لأربع قطع المشاركة في وصلة واحدة.')}</p></div>
    <div className="cl-piece-grid">{editor.drafts.map((draft, pieceIdx) => {
      const xs = draft.outline.map(p => p[0]), ys = draft.outline.map(p => p[1])
      const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY
      const scale = Math.max(w, h, 1), pad = scale * 0.08
      const edgePath = (from, to) => { const pts = []; for (let j = 0; j < draft.outline.length; j++) { const i = (from + j) % draft.outline.length; pts.push(draft.outline[i].join(',')); if (i === to) break } return pts.join(' ') }
      return <article className="cl-piece-card" key={draft.id}>
        <header><strong>{labelOf(draft, lang)}</strong><span>{draft.id.endsWith('_l') ? text('Left', 'يسار') : draft.id.endsWith('_r') ? text('Right', 'يمين') : ''}</span></header>
        <svg className="cl-pattern-svg" viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`} role="group" aria-label={labelOf(draft, lang)}>
          <polygon points={draft.outline.map(p => p.join(',')).join(' ')} fill={draft.color || '#8477ff'} fillOpacity=".12" stroke="currentColor" strokeWidth={scale * .004} />
          {(draft.darts || []).map((dart, i) => <polyline key={i} points={[dart[1], dart[0], dart[2]].map(p => p.join(',')).join(' ')} fill="none" stroke="#e9aa59" strokeWidth={scale * .004} strokeDasharray={`${scale * .02} ${scale * .01}`} />)}
          {Object.entries(draft.edges).map(([name, edge]) => <polyline key={name} points={edgePath(edge.from, edge.to)} fill="none" stroke={editor.pendingEdges.some(e => e.pieceIdx === pieceIdx && e.edgeName === name) ? '#ffc34a' : '#37d2b4'} strokeWidth={scale * .013} role="button" tabIndex={0} aria-label={`${labelOf(draft, lang)}: ${name}`} onClick={() => editor.chooseEdge(pieceIdx, name)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editor.chooseEdge(pieceIdx, name) } }} />)}
          {draft.outline.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={scale * .013} fill={editor.pendingStart?.pieceIdx === pieceIdx && editor.pendingStart.vertIdx === i ? '#ffc34a' : '#cbd2df'} role="button" tabIndex={0} aria-label={`${labelOf(draft, lang)} ${text('point', 'نقطة')} ${i + 1}`} onClick={() => editor.handleVertexClick(pieceIdx, i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editor.handleVertexClick(pieceIdx, i) } }}><title>{i + 1}</title></circle>)}
        </svg>
        <label className="cl-field">{text('Named edge', 'حافة مسماة')}<select value="" onChange={e => { if (e.target.value) editor.chooseEdge(pieceIdx, e.target.value) }}><option value="">{text('Select an edge…', 'اختر حافة…')}</option>{Object.entries(draft.edges).map(([name, edge]) => <option key={name} value={name}>{name.replaceAll('_', ' ')} · {edge.from + 1} → {edge.to + 1}</option>)}</select></label>
        <div className="cl-point-selects">{['start', 'end'].map((which, n) => <label key={which}>{text(n ? 'End point' : 'Start point', n ? 'نقطة النهاية' : 'نقطة البداية')}<select value="" disabled={n === 1 && editor.pendingStart?.pieceIdx !== pieceIdx} onChange={e => { if (e.target.value !== '') editor.handleVertexClick(pieceIdx, Number(e.target.value)) }}><option value="">—</option>{draft.outline.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>)}</div>
      </article>
    })}</div>
  </section>
}
