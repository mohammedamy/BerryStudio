import { useEffect, useRef, useState } from 'react'
import { labelOf } from './patternPlan'

// Step 2 of the guided workflow: one visual board for sewing pieces
// together, replacing the old split between a sidebar seam list and a desk
// of point dropdowns.
//
// Interaction model (novice-first):
//  - every stretch of outline is a big clickable target (named edges AND
//    the un-named gaps between them — see useSeamEditor's gapsByPiece), so
//    a whole side is picked with one click; individual points only appear
//    in the optional "Precise" mode;
//  - a live instruction banner always says what to do next and holds the
//    Sew / Flip / Cancel actions right where the user is looking;
//  - both halves of each seam share a colour and a number, on the board and
//    in the list;
//  - pieces the importer couldn't sew are already "placed on the body"
//    (non-blocking); the panel offers to sew them, never forces it.
const WORDS_AR = { right: 'يمين', left: 'يسار', side: 'جانب', top: 'أعلى', bottom: 'أسفل', shoulder: 'كتف', neckline: 'خط الرقبة', neck: 'رقبة', armhole: 'فتحة الإبط', waist: 'خصر', hem: 'ذيل', front: 'أمام', back: 'خلف', seam: 'وصلة', cap: 'رأس', dart: 'بنسة', sleeve: 'كم', center: 'منتصف', inseam: 'خياطة داخلية', outseam: 'خياطة خارجية', princess: 'برنسيس', mirror: 'مرآة', a: 'أ', b: 'ب' }
// Anonymous edges (picked by the user, named `edge_<from>_<to>`) are
// described by where they sit on the piece as drawn: top/bottom edge,
// left/right side.
export function positionLabel(draft, from, to, lang = 'en') {
  const ar = lang === 'ar'
  const out = draft?.outline
  if (!out?.[from] || !out?.[to]) return ar ? 'حافة' : 'edge'
  const xs = out.map(p => p[0]), ys = out.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const [mx, my] = midpoint(sidePath(out, from, to))
  const fx = (mx - minX) / ((maxX - minX) || 1), fy = (my - minY) / ((maxY - minY) || 1)
  const dx = Math.abs(out[to][0] - out[from][0]), dy = Math.abs(out[to][1] - out[from][1])
  if (dx >= dy) return fy < 0.5 ? (ar ? 'الحافة العليا' : 'top edge') : (ar ? 'الحافة السفلى' : 'bottom edge')
  return fx < 0.5 ? (ar ? 'الجانب الأيسر' : 'left side') : (ar ? 'الجانب الأيمن' : 'right side')
}
export function edgeLabel(name, lang = 'en', draft) {
  const m = /^edge_(\d+)_(\d+)$/.exec(name)
  if (m) return positionLabel(draft, +m[1], +m[2], lang)
  const words = String(name).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase().split(/\s+/).filter(Boolean)
  return lang === 'ar' ? words.map(w => WORDS_AR[w] || w).join(' ') : words.join(' ')
}

function sidePath(outline, from, to) {
  const pts = [], n = outline.length
  for (let j = 0; j <= n; j++) { const i = (from + j) % n; pts.push(outline[i]); if (i === to) break }
  return pts
}
function midpoint(pts) {
  let total = 0
  const lens = pts.slice(1).map((p, i) => { const d = Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]); total += d; return d })
  let acc = 0
  for (let i = 0; i < lens.length; i++) {
    if (acc + lens[i] >= total / 2) { const t = lens[i] ? (total / 2 - acc) / lens[i] : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t] }
    acc += lens[i]
  }
  return pts[0]
}

function PieceBoard({ draft, pieceIdx, editor, lang, precise, highlight, status }) {
  const ar = lang === 'ar', text = (en, arabic) => ar ? arabic : en
  const xs = draft.outline.map(p => p[0]), ys = draft.outline.map(p => p[1])
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY
  const scale = Math.max(w, h, 1), pad = scale * 0.1
  const name = labelOf(draft, lang)
  const side = draft.id.endsWith('_l') ? text('Left', 'يسار') : draft.id.endsWith('_r') ? text('Right', 'يمين') : ''
  const isPending = (edgeName) => editor.pendingEdges.some(e => e.pieceIdx === pieceIdx && e.edgeName === edgeName)
  const targets = [
    ...Object.entries(draft.edges).map(([edgeName, e]) => ({ key: `e:${edgeName}`, edgeName, from: e.from, to: e.to, mark: editor.seamMarks?.[`${draft.id}:${edgeName}`], pending: isPending(edgeName), onPick: () => editor.chooseEdge(pieceIdx, edgeName) })),
    ...(editor.gapsByPiece?.[pieceIdx] || []).map(g => ({ key: `g:${g.from}:${g.to}`, edgeName: null, from: g.from, to: g.to, onPick: () => editor.chooseSpan(pieceIdx, g.from, g.to) })),
  ]
  return <article className={`cl-board-card${highlight ? ' is-highlight' : ''}`} data-piece={draft.id}>
    <header>
      <strong>{name}</strong>{side && <span className="cl-side">{side}</span>}
      <span className={`cl-badge tone-${status.tone}`}>{status.label}</span>
    </header>
    <svg className="cl-board-svg" viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`} role="group" aria-label={name}>
      <polygon points={draft.outline.map(p => p.join(',')).join(' ')} fill={draft.color || '#8477ff'} fillOpacity=".16" stroke="none" />
      {(draft.darts || []).map((dart, i) => <polyline key={i} points={[dart[1], dart[0], dart[2]].map(p => p.join(',')).join(' ')} fill="none" stroke="#e9aa59" strokeWidth={scale * .006} strokeDasharray={`${scale * .02} ${scale * .012}`} />)}
      {targets.map(t => {
        const pts = sidePath(draft.outline, t.from, t.to)
        const points = pts.map(p => p.join(',')).join(' ')
        const label = `${name}${side ? ` (${side})` : ''}: ${t.edgeName ? edgeLabel(t.edgeName, lang, draft) : positionLabel(draft, t.from, t.to, lang)} ${t.from + 1}→${t.to + 1}`
        const cls = t.pending ? 'is-pending' : t.mark ? 'is-sewn' : t.edgeName ? 'is-named' : 'is-free'
        return <g key={t.key} className={`cl-edge ${cls}`} role="button" tabIndex={0} aria-pressed={t.pending} aria-label={label}
          onClick={t.onPick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.onPick() } }}>
          <title>{label}</title>
          <polyline className="cl-edge-hit" points={points} fill="none" strokeWidth={scale * .06} />
          <polyline className="cl-edge-line" points={points} fill="none" stroke={t.pending ? '#ffc34a' : t.mark ? t.mark.color : undefined} strokeWidth={scale * (t.pending ? .022 : t.mark ? .018 : .011)} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      })}
      {targets.filter(t => t.mark).map(t => { const [x, y] = midpoint(sidePath(draft.outline, t.from, t.to)); return <g key={`m${t.key}`} className="cl-seam-badge" aria-hidden="true">
        <circle cx={x} cy={y} r={scale * .045} fill={t.mark.color} />
        <text x={x} y={y} fontSize={scale * .055} textAnchor="middle" dominantBaseline="central">{t.mark.n}</text>
      </g> })}
      {precise && draft.outline.map(([x, y], i) => <circle key={i} className="cl-point" cx={x} cy={y} r={scale * .018} fill={editor.pendingStart?.pieceIdx === pieceIdx && editor.pendingStart.vertIdx === i ? '#ffc34a' : '#e6e7eb'} role="button" tabIndex={0} aria-label={`${name} ${text('point', 'نقطة')} ${i + 1}`} onClick={() => editor.handleVertexClick(pieceIdx, i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editor.handleVertexClick(pieceIdx, i) } }}><title>{i + 1}</title></circle>)}
    </svg>
  </article>
}

export default function SewStep({ editor, lang }) {
  const ar = lang === 'ar', text = (en, arabic) => ar ? arabic : en
  const [precise, setPrecise] = useState(false)
  const [flip, setFlip] = useState(false)
  const [highlight, setHighlight] = useState(null)
  const [dismissed, setDismissed] = useState([])
  const boardRef = useRef(null)
  const { drafts, pendingEdges, pendingStart, seams } = editor
  const pieceName = id => { const d = drafts.find(x => x.id === id); if (!d) return id; const side = d.id.endsWith('_l') ? text(' (left)', ' (يسار)') : d.id.endsWith('_r') ? text(' (right)', ' (يمين)') : ''; return labelOf(d, lang) + side }
  const pendingText = e => `${pieceName(drafts[e.pieceIdx]?.id)} · ${edgeLabel(e.edgeName, lang, drafts[e.pieceIdx])}`
  const sewnCount = id => seams.filter(s => (s.a.piece === id || s.b.piece === id) && s.a.piece !== s.b.piece).length
  const statusFor = d => {
    if (editor.unjoined?.some(u => u.id === d.id)) return { tone: 'attention', label: text('Needs a decision', 'يحتاج قراراً') }
    if (editor.separate?.includes(d.id)) return { tone: 'guess', label: text('Not attached', 'غير موصولة') }
    const n = sewnCount(d.id)
    return { tone: 'ok', label: n === 1 ? text('1 seam', 'وصلة واحدة') : text(`${n} seams`, `${n} وصلات`) }
  }
  useEffect(() => { if (pendingEdges.length < 2) setFlip(false) }, [pendingEdges.length])
  useEffect(() => {
    function onKey(e) {
      if (e.target?.tagName === 'SELECT' || e.target?.tagName === 'INPUT') return
      if (e.key === 'Escape') editor.clearPending()
      if (e.key === 'Enter' && pendingEdges.length >= 2 && !e.target?.closest?.('[role=button],button')) editor.sewSelected(flip)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  function focusPiece(id) {
    setHighlight(id)
    const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
    boardRef.current?.querySelector(`[data-piece="${sel}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    setTimeout(() => setHighlight(h => h === id ? null : h), 2400)
  }
  const loose = drafts.filter(d => editor.separate?.includes(d.id))
  const undecided = editor.unjoined || []
  const notices = (editor.dartNotices || []).filter(id => !dismissed.includes(id))

  let banner
  if (pendingEdges.length >= 2) banner = <div className="cl-banner tone-ready" role="status">
    <div className="cl-banner-text"><strong>{text('Ready to sew', 'جاهز للخياطة')}</strong>
      <span>{pendingEdges.map(pendingText).join('  ⟷  ')}</span>
      <small>{text('Tip: select more edges to join 3–4 pieces at one seam.', 'نصيحة: اختر حوافاً أخرى لوصل ٣–٤ قطع في وصلة واحدة.')}</small></div>
    <div className="cl-banner-actions">
      <label className="cl-toggle" title={text('Use this if the seam looks twisted in the try-on', 'استخدمه إذا بدت الوصلة ملتوية في التجربة')}><input type="checkbox" checked={flip} onChange={e => setFlip(e.target.checked)} />{text('Flip direction', 'اعكس الاتجاه')}</label>
      <button className="cl-btn cl-btn-ghost" onClick={editor.clearPending}>{text('Cancel', 'إلغاء')}</button>
      <button className="cl-btn cl-btn-primary" onClick={() => editor.sewSelected(flip)}>{text('Sew these edges', 'خِط هذه الحواف')}</button>
    </div>
  </div>
  else if (pendingEdges.length === 1) banner = <div className="cl-banner tone-active" role="status">
    <div className="cl-banner-text"><strong>{text('Now click the edge it sews to', 'الآن انقر الحافة التي تُخاط بها')}</strong><span>{text('Selected:', 'المحدد:')} {pendingText(pendingEdges[0])}</span></div>
    <div className="cl-banner-actions"><button className="cl-btn cl-btn-ghost" onClick={editor.clearPending}>{text('Cancel', 'إلغاء')}</button></div>
  </div>
  else if (pendingStart) banner = <div className="cl-banner tone-active" role="status">
    <div className="cl-banner-text"><strong>{text('Now click the end point on the same piece', 'الآن انقر نقطة النهاية على القطعة نفسها')}</strong><span>{text('Start point', 'نقطة البداية')} {pendingStart.vertIdx + 1} · {pieceName(drafts[pendingStart.pieceIdx]?.id)}</span></div>
    <div className="cl-banner-actions"><button className="cl-btn cl-btn-ghost" onClick={editor.clearPending}>{text('Cancel', 'إلغاء')}</button></div>
  </div>
  else banner = <div className="cl-banner" role="status">
    <ol className="cl-howto">
      <li>{text('Click an edge of a piece', 'انقر حافة قطعة')}</li>
      <li>{text('Click the edge it sews to', 'انقر الحافة التي تُخاط بها')}</li>
      <li>{text('Press “Sew these edges”', 'اضغط «خِط هذه الحواف»')}</li>
    </ol>
    <span className="cl-banner-hint">{seams.length
      ? text('Most seams are already done for you — this step is optional.', 'معظم الوصلات جاهزة مسبقاً — هذه الخطوة اختيارية.')
      : text('This pattern came without seams, so pieces will hang in place. You can try it on now, or sew matching edges (e.g. side to side) for a closer fit.', 'هذا الباترون بلا وصلات، لذا ستتدلى القطع في مكانها. يمكنك التجربة الآن، أو خياطة الحواف المتقابلة (مثل الجانب بالجانب) لملاءمة أفضل.')}</span>
  </div>

  return <section className="cl-step cl-sew" aria-label={text('Sew pieces together', 'خياطة القطع معاً')}>
    <div className="cl-sew-main">
      <div className="cl-sew-head">
        <div>
          <span className="cl-eyebrow">{text('Step 2 of 3 · Sew', 'الخطوة ٢ من ٣ · الخياطة')}</span>
          <h2>{text('Check how the pieces join', 'تحقق من وصل القطع')}</h2>
        </div>
        <label className="cl-toggle"><input type="checkbox" checked={precise} onChange={e => { setPrecise(e.target.checked); if (!e.target.checked && pendingStart) editor.clearPending() }} />{text('Precise mode (pick points)', 'وضع دقيق (اختيار النقاط)')}</label>
      </div>
      <div className="cl-banner-wrap">{banner}
        {editor.error && <div className="cl-callout tone-warn" role="alert">{friendlyError(editor.error, ar)}</div>}
      </div>
      <div className="cl-legend" aria-hidden="true">
        <span><i className="sw sw-free" />{text('Free edge (click to pick)', 'حافة حرة (انقر للاختيار)')}</span>
        <span><i className="sw sw-pending" />{text('Selected', 'محددة')}</span>
        <span><i className="sw sw-sewn" />{text('Sewn — same colour & number = same seam', 'مخيطة — اللون والرقم نفسه = الوصلة نفسها')}</span>
      </div>
      <div className="cl-board" ref={boardRef}>
        {drafts.map((draft, i) => <PieceBoard key={draft.id} draft={draft} pieceIdx={i} editor={editor} lang={lang} precise={precise} highlight={highlight === draft.id} status={statusFor(draft)} />)}
      </div>
    </div>
    <aside className="cl-sew-panel" aria-label={text('Seams', 'الوصلات')}>
      {undecided.length > 0 && <div className="cl-panel-block">
        <h3>{text('Needs a decision', 'يحتاج قراراً')}</h3>
        {undecided.map(d => <div key={d.id} className="cl-loose-row">
          <span>{pieceName(d.id)}</span>
          <div className="cl-row-actions">
            <button className="cl-btn cl-btn-sm" onClick={() => focusPiece(d.id)}>{text('Sew it', 'خِطها')}</button>
            <button className="cl-btn cl-btn-sm cl-btn-ghost" onClick={() => { editor.acknowledgeJoins(d.id); if (!sewnCount(d.id)) editor.markSeparate(d.id, true) }}>{sewnCount(d.id) ? text('Seams are fine', 'الوصلات سليمة') : text('Just place it', 'ضعها فقط')}</button>
          </div>
        </div>)}
      </div>}
      <div className="cl-panel-block">
        <h3>{text('Seams', 'الوصلات')} <span className="cl-count">{seams.length}</span></h3>
        {seams.length === 0 && <p className="cl-muted">{text('No seams yet. Pieces will simply hang in place.', 'لا وصلات بعد. ستتدلى القطع في مكانها فقط.')}</p>}
        <ul className="cl-seam-list">
          {seams.map(s => { const mark = editor.seamMarks?.[`${s.a.piece}:${s.a.edge}`]; return <li key={s.id}>
            <span className="cl-seam-dot" style={{ background: mark?.color }}>{mark?.n}</span>
            <span className="cl-seam-text">{s.a.piece === s.b.piece && /^dart_/.test(s.a.edge) ? `${pieceName(s.a.piece)} · ${text('dart', 'بنسة')}` : <>{pieceName(s.a.piece)} <small>{edgeLabel(s.a.edge, lang, drafts.find(d => d.id === s.a.piece))}</small> ⟷ {pieceName(s.b.piece)} <small>{edgeLabel(s.b.edge, lang, drafts.find(d => d.id === s.b.piece))}</small></>}</span>
            <button className="cl-icon-btn" onClick={() => editor.toggleReverse(s.id)} title={text('Flip direction (if this seam looks twisted)', 'اعكس الاتجاه (إن بدت الوصلة ملتوية)')} aria-label={text('Flip direction', 'اعكس الاتجاه')}>⇅</button>
            <button className="cl-icon-btn tone-danger" onClick={() => editor.removeSeam(s.id)} title={text('Remove seam', 'إزالة الوصلة')} aria-label={text('Remove seam', 'إزالة الوصلة')}>×</button>
          </li> })}
        </ul>
      </div>
      {loose.length > 0 && <div className="cl-panel-block">
        <h3>{text('Not attached to other pieces', 'غير موصولة بقطع أخرى')} <span className="cl-count">{loose.length}</span></h3>
        <p className="cl-muted">{text('These are placed on the body and hang naturally. Sew one to another piece if you want it attached.', 'موضوعة على الجسم وتتدلى طبيعياً. خِطها بقطعة أخرى إن أردت تثبيتها.')}</p>
        {loose.map(d => <div key={d.id} className="cl-loose-row"><span>{pieceName(d.id)}</span><button className="cl-btn cl-btn-sm" onClick={() => focusPiece(d.id)}>{text('Sew it', 'خِطها')}</button></div>)}
      </div>}
      {notices.length > 0 && <div className="cl-panel-block">
        <h3>{text('Worth a look', 'تستحق المراجعة')}</h3>
        {notices.map(id => <div key={id} className="cl-loose-row"><span>{text(`A sewn dart changed a seam on ${pieceName(id)}.`, `غيّرت بنسة مخيطة وصلة على ${pieceName(id)}.`)}</span><button className="cl-btn cl-btn-sm cl-btn-ghost" onClick={() => setDismissed(v => [...v, id])}>{text('OK', 'حسناً')}</button></div>)}
      </div>}
      {(editor.warnings || []).length > 0 && <details className="cl-panel-block"><summary>{text('Import notes', 'ملاحظات الاستيراد')}</summary>{editor.warnings.map((w, i) => <p key={i} className="cl-muted">{w}</p>)}</details>}
    </aside>
  </section>
}

export function friendlyError(message, ar) {
  const m = String(message || '')
  if (/overlaps existing edge/.test(m)) return ar ? 'هذه الحافة تتداخل مع حافة أخرى. اختر جزءاً حراً من الحدود.' : 'That edge overlaps another one. Pick a free part of the outline instead.'
  if (/same point/.test(m)) return ar ? 'نقطتا البداية والنهاية متطابقتان. اختر نقطتين مختلفتين.' : 'Start and end are the same point — pick two different points.'
  if (/unjoined|attached/.test(m)) return ar ? 'قرّر لكل قطعة في «يحتاج قراراً»: خياطتها أو وضعها فقط.' : 'For each piece under “Needs a decision”, choose to sew it or just place it.'
  if (/no longer exists/.test(m)) return ar ? 'وصلة تشير إلى حافة لم تعد موجودة. أزلها ثم أعد اختيار الحواف.' : 'A seam points to an edge that no longer exists. Remove it and pick the edges again.'
  return m
}
