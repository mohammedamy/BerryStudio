import { PLACEMENTS, labelOf, shapeKey } from './patternPlan'

export default function PatternReview({ source, plan, lang, onAnswer, onContinue }) {
  const ar = lang === 'ar'
  const text = (en, arabic) => ar ? arabic : en
  const optionsFor = kind => ({
    placement: PLACEMENTS.map(([value, en, arabic]) => [value, text(en, arabic)]),
    copies: [['single', text('One complete piece', 'قطعة كاملة واحدة')], ['pair', text('Two mirrored pieces (left and right)', 'قطعتان معكوستان (يسار ويمين)')], ['fold', text('Half pattern — fold on its left boundary', 'نصف باترون — الطي عند الحد الأيسر')]],
    darts: [['close', text('Sew the dart closed to shape the cloth', 'خياطة البنسة لإعطاء القماش شكله')], ['mark', text('Keep as a marking; do not shape the cloth', 'إبقاؤها كعلامة دون تشكيل القماش')]],
    hidden: [['include', text('Include in this garment', 'ضمّها إلى هذا التصميم')], ['exclude', text('Leave out of this simulation', 'استبعادها من هذه المحاكاة')]],
    invalid: [['exclude', text('Leave out for now; repair in the pattern editor', 'استبعادها مؤقتاً وإصلاحها في محرر الباترون')]],
  })[kind]
  const questionFor = kind => ({ placement: text('Where does this piece belong?', 'أين توضع هذه القطعة؟'), copies: text('How is this piece cut?', 'كيف تُقص هذه القطعة؟'), darts: text('What should happen to its darts?', 'كيف تُنفّذ البنسات؟'), hidden: text('This piece is hidden in the pattern. Include it?', 'هذه القطعة مخفية في الباترون. هل نضمّها؟'), invalid: text('The outline is incomplete or invalid. How should we proceed?', 'حدود القطعة غير مكتملة أو غير صالحة. كيف نتابع؟') })[kind]
  return <section className="cl-review" aria-label={text('Pattern setup', 'إعداد الباترون')}>
    <div className="cl-heading"><span className="cl-eyebrow">{text('1 · Review your pattern', '١ · مراجعة الباترون')}</span><h2>{source.designName || text('Your current design', 'تصميمك الحالي')}</h2><p>{text('Every pattern piece is listed below. Confirm only what is unclear; your 2D pattern stays unchanged.', 'كل قطع الباترون مدرجة أدناه. أكّد المعلومات غير الواضحة فقط؛ لن تتغير هندسة الباترون الأصلي.')}</p></div>
    <div className="cl-summary">{plan.inventory.length} {text('source pieces', 'قطع أصلية')} · {plan.imported.rawPieces.length} {text('cloth panels', 'ألواح قماش')} · {plan.questions.length} {text('answers needed', 'إجابات مطلوبة')}</div>
    <div className="cl-inventory">
      {plan.inventory.map(({ piece, answer, excluded, role, valid }) => {
        const questions = plan.questions.filter(q => q.piece.id === piece.id)
        return <article key={piece.id} className="cl-piece-card">
          <header><strong>{labelOf(piece, lang)}</strong><span>{excluded ? text('Excluded by you', 'مستبعد باختيارك') : questions.length ? text('Needs your choice', 'يحتاج اختيارك') : text('Configured', 'تم الإعداد')}</span></header>
          {valid && (() => { const xs = piece.outline.map(p => p[0]), ys = piece.outline.map(p => p[1]); const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys); return <svg className="cl-pattern-svg" style={{ height: 130 }} viewBox={`${Math.min(...xs)-2} ${Math.min(...ys)-2} ${w+4} ${h+4}`} role="img" aria-label={labelOf(piece, lang)}><polygon points={piece.outline.map(p => p.join(',')).join(' ')} fill={piece.color || '#8477ff'} fillOpacity=".18" stroke="currentColor" strokeWidth={Math.max(w,h)*.006} />{(piece.darts || []).filter(d => d.length === 3).map((d,i) => <polyline key={i} points={[d[1],d[0],d[2]].map(p => p.join(',')).join(' ')} fill="none" stroke="#e9aa59" strokeWidth={Math.max(w,h)*.008} />)}</svg> })()}
          <p>{piece.outline?.length || 0} {text('outline points', 'نقطة حدود')} · {piece.darts?.length || 0} {text('darts', 'بنسات')}{role ? ` · ${PLACEMENTS.find(p => p[0] === role)?.[ar ? 2 : 1] || role}` : ''}</p>
          {excluded ? <button onClick={() => onAnswer(piece.id, { shape: shapeKey(piece) })}>{text('Include / review again', 'ضمّها ومراجعتها من جديد')}</button> : <>
            {questions.map(q => <fieldset key={q.field}><legend>{questionFor(q.kind)}</legend>{optionsFor(q.kind).map(([value, label]) => <label className="cl-choice" key={value}><input type="radio" name={`${piece.id}-${q.field}`} checked={answer[q.field] === value} onChange={() => onAnswer(piece.id, { ...answer, shape: shapeKey(piece), [q.field]: value })} />{label}</label>)}{q.kind === 'darts' && <p>{text('Closed darts need an apex inside the piece and two mouth points on one straight edge. Other dart shapes must be prepared in the pattern editor.', 'تحتاج البنسة المغلقة رأساً داخل القطعة ونقطتي فتحة على ضلع مستقيم واحد. تُجهّز الأشكال الأخرى في محرر الباترون.')}</p>}</fieldset>)}
            {!questions.length && <button onClick={() => onAnswer(piece.id, { shape: shapeKey(piece), role: '', copies: '', darts: '' , review: true })}>{text('Change setup', 'تغيير الإعداد')}</button>}
            <button className="cl-link" onClick={() => onAnswer(piece.id, { ...answer, shape: shapeKey(piece), include: 'exclude' })}>{text('Exclude from this simulation', 'استبعاد من هذه المحاكاة')}</button>
          </>}
        </article>
      })}
    </div>
    {plan.problems.length > 0 && <div role="alert" className="cl-error"><strong>{text('Needs adjustment before simulation', 'يحتاج تعديلاً قبل المحاكاة')}</strong>{plan.problems.map((problem, i) => <p key={i}>{problem}</p>)}<p>{text('Change the dart choice to marking only, or adjust the source geometry in the pattern editor.', 'غيّر اختيار البنسة إلى علامة فقط، أو عدّل هندسة القطعة في محرر الباترون.')}</p></div>}
    <button className="cl-primary" disabled={!plan.ready} onClick={onContinue}>{text('Continue to joins', 'المتابعة إلى الوصلات')}</button>
  </section>
}
