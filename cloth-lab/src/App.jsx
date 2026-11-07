import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Header from './ui/Header'
import MeasurementPanel from './ui/MeasurementPanel'
import FabricPanel from './ui/FabricPanel'
import AvatarPanel, { DEFAULT_SKIN_TONE, DEFAULT_POSE } from './ui/AvatarPanel'
import ExportPanel from './ui/ExportPanel'
import SolverHUD, { isSolverHUDEnabled } from './ui/SolverHUD'
import Scene from './scene/Scene'
import { DEFAULT_MEASUREMENTS } from './state/measurements'
import { computeBodyDims } from './body/computeBodyDims'
import { DEFAULT_FABRIC } from './cloth/fabricPresets'
import { QUALITY_TIER_DEFAULT } from './cloth/ClothSimulation'
import PiecesStep from './workflow/PiecesStep'
import SewStep, { friendlyError } from './workflow/SewStep'
import SceneBoundary from './workflow/SceneBoundary'
import { designKey } from './workflow/patternPlan'
import { autoPlan, asUserAnswer } from './workflow/autoSetup'
import { readSession, writeSession } from './workflow/session'
import { useSeamEditor } from './seam/useSeamEditor'
import { t, dirFor } from './i18n'

function patternSignature(payload) { return designKey(payload) }

// Novice-first guided workflow (UI v2): Pieces → Sew → Try on.
//
// The previous flow blocked at every unanswered question and every unsewn
// piece, hid its only "continue" button below the fold, and silently
// bounced the user back when they clicked ahead. Now:
//  - every piece arrives pre-configured by autoSetup.js (visible "Auto"
//    badges, the user's own choices always win, only those are persisted);
//  - pieces the importer can't sew are placed on the body automatically
//    (useSeamEditor's `autoPlace`) — sewing them is optional;
//  - "Try it on" is available from every step and builds the garment on
//    the way; if something really blocks it, the user lands on the step
//    that explains why instead of nothing happening;
//  - a persistent action bar always shows the one obvious next action.
//
// WP-5.3: `embedded`/`pattern`/`onReady` are only used by the new embedded
// entry point (embed.js) — the standalone build (main.jsx) renders <App />
// with none of them and waits for a real pattern handoff. `pattern`, when given, is the SAME payload
// shape buildClothLabPayload() (js/app.js) already builds for the iframe
// bridge — embed.js's update() re-renders this component with a new
// `pattern` object each time the root app's own state changes, replacing
// the postMessage round-trip with a plain prop (no serialization tax, no
// separate "is cloth-lab ready yet" handshake needed since there's no
// cross-document boundary to wait for).
// WP-10: `bodyOnly` is the standalone BodyForm page's mode (body.html) — no
// garment, cloth sim, or seam authoring, just the avatar matching the given
// measurements. It reuses debugView's existing 'off' state (Scene.jsx
// already renders nothing but BodyAvatar for any debugView other than
// pieces/weld/cloth/seams) rather than adding a new rendering path.
export default function App({ embedded = false, pattern = null, onReady, bodyOnly = false } = {}) {
  const hostOriginRef = useRef(embedded ? window.location.origin : null)
  const [category, setCategory] = useState(pattern?.category || 'women')
  const [measurementsByCategory, setMeasurementsByCategory] = useState(
    pattern ? { ...DEFAULT_MEASUREMENTS, [pattern.category]: pattern.measurements } : DEFAULT_MEASUREMENTS,
  )
  // 'pieces' | 'sew' | 'tryon'. bodyOnly is always on the try-on canvas.
  const [step, setStep] = useState(bodyOnly ? 'tryon' : 'pieces')
  // Try-on render mode: 'cloth' (simulation) or one of the inspection views
  // ('pieces' flat placed panels, 'weld' seam alignment, 'off' body only).
  const [view, setView] = useState(bodyOnly ? 'off' : 'cloth')
  const [fabricId, setFabricId] = useState((pattern && pattern.fabricId) || DEFAULT_FABRIC)
  // WP-35: 'default' (unchanged) or 'high' (true dihedral-angle bend) — a
  // real sim rebuild when toggled, not a live uniform swap like fabricId
  // (see ClothMesh.jsx's own comment on why it's a separate effect
  // dependency). Always starts at the default regardless of `pattern` —
  // this is a local rendering-quality preference, not part of a garment's
  // own saved data the way fabricId is.
  const [qualityTier, setQualityTier] = useState(QUALITY_TIER_DEFAULT)
  const [skinToneId, setSkinToneId] = useState(DEFAULT_SKIN_TONE)
  const [poseId, setPoseId] = useState(DEFAULT_POSE)
  // Surfaced from deep inside GLBAvatar (see its own header comment) —
  // unrecognized rig, VRM, no walk clip, no leg rig for "seated". null when
  // the current avatar/pose combination has full support.
  const [poseWarning, setPoseWarning] = useState(null)
  const [garment, setGarment] = useState(null) // null = no finalized garment; never substituted with demo cloth
  // Per-category GLB avatar URLs from the bridge (root app's state.avatarGLB
  // dict) — keyed by category, not a single URL, because cloth-lab's own
  // Header category switcher is independent of the bridge: switching
  // category in here must not lose the association or need a resend.
  const [avatarGLBByCategory, setAvatarGLBByCategory] = useState((pattern && pattern.avatarGLB) || {})
  // cloth-lab has no language switcher of its own — it always mirrors
  // whichever language the root BerryStudio app last sent (see
  // buildClothLabPayload()'s `lang` field, js/app.js). Defaults to 'en' for
  // the standalone dev preview (no `pattern`/bridge at all) and stays 'en'
  // until the first real bridge payload arrives for the iframe path (mirrors
  // every other bridged field's own "nothing yet" default).
  const [lang, setLang] = useState((pattern && pattern.lang) || 'en')
  const ar = lang === 'ar', text = (en, arabic) => ar ? arabic : en

  // Whatever the bridge (root BerryStudio app — iframe postMessage in
  // standalone/legacy mode, the `pattern` prop when embedded) last sent,
  // reviewed before conversion. null means no imported design; no demo fallback.
  const [source, setSource] = useState(pattern)
  // The user's OWN answers only — auto-filled defaults are recomputed from
  // the source on every render (autoPlan) and never persisted, so an
  // improved guesser benefits saved sessions too.
  const [answers, setAnswers] = useState(() => readSession(pattern)?.answers || (pattern?.clothLabSetup?.design === designKey(pattern) ? pattern.clothLabSetup.answers : {}))
  const [savedEditor, setSavedEditor] = useState(() => readSession(pattern)?.editor || (pattern?.clothLabSetup?.design === designKey(pattern) ? pattern.clothLabSetup.editor : null))
  const [storageWarning, setStorageWarning] = useState(false)
  const [notice, setNotice] = useState(null)
  const { plan } = useMemo(() => autoPlan(source, answers), [source, answers])
  const imported = source ? plan.imported : null
  function persist(nextAnswers, editor) {
    if (!source) return
    const state = { answers: nextAnswers, editor }
    setStorageWarning(!writeSession(source, state))
    // The host validates the sending frame, design identity and source shape
    // before saving. Standalone stores locally when no host is present.
    if (hostOriginRef.current) (embedded ? window : window.parent).postMessage({ type: 'clothlab:setup', designId: source.designId, design: designKey(source), setup: state }, hostOriginRef.current)
  }
  // Bumped once per accepted bridge payload. useSeamEditor's drafts/seams are
  // lazy-initialized (useState(() => ...)) and won't pick up new rawPieces on
  // their own — Workspace below is remounted via key={garmentVersion} to
  // force a clean re-init, the standard React fix for that.
  const [garmentVersion, setGarmentVersion] = useState(0)

  const measurements = measurementsByCategory[category]
  const dims = useMemo(() => computeBodyDims(measurements, category), [measurements, category])

  // Shared by both ingestion paths below: convert (closed-world classifier
  // — see importFromApp.js for exactly what is/isn't recognized), sync
  // category/measurements/fabric/avatar to match, and always land on the
  // Pieces step — never auto-simulate, see importFromApp.js's header
  // comment for why.
  //
  // `lang` (WP-9 issue #7) resends the FULL bridge payload every time the
  // root app's language changes (see js/app.js's applyLang()), reusing this
  // exact same message/prop path rather than a separate one — simplest to
  // wire, but it means a payload whose ONLY actual change is `lang` must be
  // told apart from a genuinely new pattern. Without the signature check
  // below, every language switch bumped garmentVersion (full Workspace
  // remount — seam-editor progress lost) and forced the user back to the
  // first step purely from switching languages.
  const lastPatternSignatureRef = useRef(pattern ? patternSignature(pattern) : null)
  function applyIncomingPattern(payload) {
    if (payload.lang) setLang(payload.lang)
    setCategory(payload.category)
    setMeasurementsByCategory(prev => ({ ...prev, [payload.category]: payload.measurements }))
    if (payload.fabricId) setFabricId(payload.fabricId)
    setAvatarGLBByCategory(payload.avatarGLB || {})
    const signature = patternSignature(payload)
    if (signature === lastPatternSignatureRef.current) {
      setSource(payload)
      return
    }
    lastPatternSignatureRef.current = signature
    const saved = readSession(payload) || (payload.clothLabSetup?.design === signature ? payload.clothLabSetup : null)
    setSource(payload)
    setAnswers(saved?.answers || {})
    setSavedEditor(saved?.editor || null)
    setGarment(null)
    setNotice(null)
    setStep(bodyOnly ? 'tryon' : 'pieces')
    setView(bodyOnly ? 'off' : 'cloth')
    setGarmentVersion(v => v + 1)
  }

  // Legacy/standalone bridge from the root BerryStudio app when embedded
  // via iframe (not used when `embedded` — see the prop-based path below
  // instead). Announces mounted-and-ready first (the root app waits for
  // this before posting, to avoid a race where it sends before this
  // listener exists).
  useEffect(() => {
    if (embedded) return
    function onMessage(e) {
      if (e.source !== window.parent || !e.data || e.data.type !== 'berrystudio:pattern') return
      hostOriginRef.current = e.origin
      applyIncomingPattern(e.data)
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage({ type: 'clothlab:ready' }, '*')
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded])

  // Embedded path: onReady fires once, synchronously reachable (no
  // cross-document handshake needed) — embed.js's mount() can call
  // update() immediately after if a pattern is already available.
  useEffect(() => {
    if (embedded && onReady) onReady()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded])

  // Re-applies whenever embed.js's update() passes a NEW pattern object
  // (reference-checked — the caller, js/app.js, already dedupes identical
  // payloads before calling update() at all, same as it does today for the
  // iframe's postMessage path).
  const lastAppliedPatternRef = useRef(pattern)
  useEffect(() => {
    if (!embedded || !pattern || pattern === lastAppliedPatternRef.current) return
    lastAppliedPatternRef.current = pattern
    applyIncomingPattern(pattern)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, pattern])

  // Step navigation. Leaving the Pieces step (re)mounts the Workspace so the
  // seam editor picks up the current piece setup; moving between Sew and
  // Try on keeps it mounted (and the user's in-progress seams with it).
  function goTo(next) {
    setNotice(null)
    if (next === step) return
    if (next === 'pieces') { setStep('pieces'); return }
    if (step === 'pieces') {
      if (!plan.ready) { setNotice(text('One piece still needs a small change — see the highlighted card.', 'ما زالت قطعة تحتاج تعديلاً بسيطاً — انظر البطاقة المميزة.')); return }
      setGarment(null)
      setGarmentVersion(v => v + 1)
    }
    if (next === 'tryon') setView('cloth')
    setStep(next)
  }

  const piecesInUse = plan.inventory.filter(r => r.valid && !r.excluded).length
  const guessed = plan.inventory.filter(r => r.valid && !r.excluded && r.answer.auto && r.answer.autoFields?.length).length

  return (
    <div className="cloth-lab-root" dir={dirFor(lang)} lang={lang}>
      <Header
        embedded={embedded} bodyOnly={bodyOnly} lang={lang}
        category={category} onCategoryChange={setCategory} linked={!!source}
        step={step} onStep={goTo}
      />
      {storageWarning && <div role="status" className="cl-callout tone-warn cl-inline">{ar ? 'تعذر الحفظ المحلي. أبقِ هذه الصفحة مفتوحة.' : 'Local saving failed. Keep this page open to retain your work.'}</div>}
      {!bodyOnly && !source ? <div className="cl-empty">
        <div className="cl-empty-art" aria-hidden="true">✂︎</div>
        <h2>{ar ? 'ابدأ من الباترون الخاص بك' : 'Start with your pattern'}</h2>
        <p>{ar ? 'أنشئ أو افتح تصميماً في BerryStudio ثم افتح Cloth Lab. لن يتم استبداله بقطعة تجريبية.' : 'Create or open a design in BerryStudio, then open Cloth Lab. Your design will never be replaced with a demo garment.'}</p>
        <ol className="cl-howto cl-howto-big">
          <li>{text('Design or open a pattern in BerryStudio', 'صمّم أو افتح باتروناً في BerryStudio')}</li>
          <li>{text('Open the Cloth Lab tab', 'افتح تبويب Cloth Lab')}</li>
          <li>{text('Press “Try it on”', 'اضغط «جرّبه على المجسم»')}</li>
        </ol>
      </div> : !bodyOnly && step === 'pieces' ? <>
        <PiecesStep source={source} plan={plan} lang={lang}
          onAnswer={(id, answer) => { const next = { ...answers, [id]: asUserAnswer(answer) }; setAnswers(next); setGarment(null); setSavedEditor(null); persist(next, null) }} />
        <ActionBar lang={lang} notice={notice}
          status={plan.ready ? (guessed ? text(`${piecesInUse} pieces ready · ${guessed} guessed automatically, worth a quick look`, `${piecesInUse} قطع جاهزة · ${guessed} مخمّنة تلقائياً، تستحق نظرة`) : text(`${piecesInUse} pieces ready`, `${piecesInUse} قطع جاهزة`)) : text('A piece needs a small change before trying on', 'قطعة تحتاج تعديلاً قبل التجربة')}
          secondary={{ label: text('Next: check the seams', 'التالي: تحقق من الوصلات'), onClick: () => goTo('sew'), disabled: !plan.ready }}
          primary={{ label: text('Try it on', 'جرّبه على المجسم'), onClick: () => goTo('tryon'), disabled: !plan.ready }} />
      </> : <Workspace
        key={garmentVersion}
        bodyOnly={bodyOnly} lang={lang} step={step} onStep={goTo} onStepForce={setStep}
        view={view} onViewChange={setView}
        dims={dims} measurements={measurements}
        onMeasurementsChange={(next) => setMeasurementsByCategory((prev) => ({ ...prev, [category]: next }))}
        fabricId={fabricId} onFabricChange={setFabricId}
        qualityTier={qualityTier} onQualityTierChange={setQualityTier}
        skinToneId={skinToneId} onSkinToneChange={setSkinToneId}
        poseId={poseId} onPoseChange={setPoseId}
        poseWarning={poseWarning} onPoseWarning={setPoseWarning}
        garment={garment} notice={notice} onNotice={setNotice}
        imported={imported} restored={savedEditor}
        onEditorChange={editor => { setSavedEditor(editor); persist(answers, editor); setGarment(null) }}
        avatarGLBUrl={avatarGLBByCategory[category]}
        onSimulate={(result) => setGarment(result)}
      />}
    </div>
  )
}

// Sticky footer that always shows the single obvious next action.
function ActionBar({ lang, status, notice, back, secondary, primary }) {
  return <footer className="cl-actionbar">
    {back && <button className="cl-btn cl-btn-ghost" onClick={back.onClick}><span aria-hidden="true">{lang === 'ar' ? '→' : '←'}</span> {back.label}</button>}
    <p className={`cl-actionbar-status${notice ? ' is-notice' : ''}`} role="status">{notice || status}</p>
    {secondary && <button className="cl-btn" disabled={secondary.disabled} onClick={secondary.onClick}>{secondary.label}</button>}
    {primary && <button className="cl-btn cl-btn-primary cl-btn-lg" disabled={primary.disabled} onClick={primary.onClick}><span aria-hidden="true">▶</span> {primary.label}</button>}
  </footer>
}

const TABS = [
  ['fabric', 'Fabric', 'القماش'],
  ['body', 'Body', 'الجسم'],
  ['look', 'Look', 'المظهر'],
  ['export', 'Export', 'التصدير'],
]

// Owns the one useSeamEditor instance shared by the Sew board and the
// Try-on canvas — split out from App so the whole thing can be remounted
// (via App's key={garmentVersion}) as a unit whenever a new garment import
// needs a fresh seam-editor rather than picking up on top of a stale one.
function Workspace({ bodyOnly, lang, step, onStep, onStepForce, view, onViewChange, dims, measurements, onMeasurementsChange, fabricId, onFabricChange, qualityTier, onQualityTierChange, skinToneId, onSkinToneChange, poseId, onPoseChange, poseWarning, onPoseWarning, garment, notice, onNotice, imported, restored, onEditorChange, avatarGLBUrl, onSimulate }) {
  const ar = lang === 'ar', text = (en, arabic) => ar ? arabic : en
  const rawPieces = imported ? imported.rawPieces : []
  const roles = imported ? imported.roles : {}
  const seedEdges = imported ? imported.edgeInstructions : undefined
  const seedSeams = imported ? imported.seamInstructions : undefined
  const placementHints = imported ? imported.placementHints : undefined
  const seamEditor = useSeamEditor(rawPieces, roles, seedEdges, seedSeams, placementHints, restored, { autoPlace: true })
  const [paused, setPaused] = useState(false)
  const [restartVersion, setRestartVersion] = useState(0)
  const [tab, setTab] = useState('fabric')
  const editorChangedRef = useRef(onEditorChange)
  editorChangedRef.current = onEditorChange
  const initialEditorRef = useRef(true)
  useEffect(() => {
    if (initialEditorRef.current) { initialEditorRef.current = false; return }
    editorChangedRef.current?.({ drafts: seamEditor.drafts, seams: seamEditor.seams, separate: seamEditor.separate, reviewed: seamEditor.reviewed })
  }, [seamEditor.drafts, seamEditor.seams, seamEditor.separate, seamEditor.reviewed])
  const statsRef = useRef({ substeps: 0, emaMs: 0, lastCostMs: 0 })
  const exportRef = useRef(null)

  // Entering Try on without a built garment builds it right away. An
  // unfinished selection is not sewn (and is cleared); anything that truly
  // blocks lands the user on the Sew step with a plain explanation.
  useEffect(() => {
    if (bodyOnly || step !== 'tryon' || garment) return
    const result = seamEditor.finalize({ ignorePending: true })
    if (result) {
      if (seamEditor.pendingEdges.length || seamEditor.pendingStart) seamEditor.clearPending()
      setPaused(false)
      onSimulate(result)
    } else {
      onNotice?.(text('Almost there — one piece needs a decision before trying on.', 'اقتربت — قطعة تحتاج قراراً قبل التجربة.'))
      onStepForce('sew')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, garment, bodyOnly])

  // Real bug fix: the root BerryStudio app's zoombar (js/app.js's
  // #zin/#zout/#zfit) sits ABOVE both the 3D Preview and Cloth Lab panes
  // and used to always call its own 2D pattern-canvas zoom/fit — the only
  // thing it had ever been wired to — so its buttons silently did nothing
  // whenever a user was actually looking at this app (iframe engine) or
  // the embedded engine (WP-5.4, same window, no iframe). Fixed on the
  // root app's side by dispatching a `postMessage` instead; this ref +
  // the listener below is the receiving end. `window.postMessage` reaches
  // both engines identically: for the iframe engine the root app posts to
  // `frame.contentWindow` and this `window` IS that iframe's window; for
  // the embedded engine there's no iframe at all, so the root app posts
  // to its own `window` and this `window` is that SAME window — either
  // way a listener registered here picks it up, so this one code path
  // (and this one listener) covers both engines with no extra plumbing.
  const controlsRef = useRef(null)

  function zoomBy(factor) {
    const c = controlsRef.current
    if (!c || !factor) return
    const dir = c.object.position.clone().sub(c.target)
    const dist = Math.min(c.maxDistance, Math.max(c.minDistance, dir.length() / factor))
    c.object.position.copy(c.target).add(dir.setLength(dist))
    c.update()
  }
  // Restores the exact same framing the Canvas/Scene start with (camera
  // position [1.6, dims.H*0.6, 2.2], target [0, dims.H*0.55, 0]) rather
  // than computing a fresh bounding-box fit — cheap, predictable, and
  // matches what "Fit" already means for a fresh load of this same dims.
  function fitCamera() {
    const c = controlsRef.current
    if (!c) return
    c.object.position.set(1.6, dims.H * 0.6, 2.2)
    c.target.set(0, dims.H * 0.55, 0)
    c.update()
  }
  useEffect(() => {
    function onControlMessage(e) {
      if (!e.data || typeof e.data !== 'object') return
      if (e.data.type === 'berrystudio:zoom') zoomBy(e.data.factor)
      else if (e.data.type === 'berrystudio:fit') fitCamera()
    }
    window.addEventListener('message', onControlMessage)
    return () => window.removeEventListener('message', onControlMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims])

  const seamCount = seamEditor.seams.length, looseCount = (seamEditor.separate || []).length
  if (!bodyOnly && step === 'sew') return <>
    <div className="cl-workspace-sew">
      {notice && <div className="cl-callout tone-warn cl-inline" role="alert">{notice}</div>}
      <SewStep editor={seamEditor} lang={lang} />
    </div>
    <ActionBar lang={lang}
      status={seamEditor.unjoined?.length ? text('Decide how the highlighted piece attaches, then try it on', 'قرّر كيف تتصل القطعة المميزة، ثم جرّب') : text(`${seamCount} seams · ${looseCount} pieces not attached (they hang in place)`, `${seamCount} وصلات · ${looseCount} قطع غير موصولة (تتدلى في مكانها)`)}
      back={{ label: text('Pieces', 'القطع'), onClick: () => onStep('pieces') }}
      primary={{ label: text('Try it on', 'جرّبه على المجسم'), onClick: () => { if (seamEditor.unjoined?.length) { onNotice?.(friendlyError('unjoined', ar)); return } onStep('tryon') } }} />
  </>

  const showCanvas = bodyOnly || garment
  return <>
    <div className="cl-workspace">
      <aside className="cl-sidebar" aria-label={text('Try-on settings', 'إعدادات التجربة')}>
        {bodyOnly ? (
          // BodyForm's whole job is measure → generate → export, so its
          // three short panels stay visible together (no tabs hiding Export).
          <div className="cl-tabpanel cl-stack">
            <MeasurementPanel lang={lang} measurements={measurements} onChange={onMeasurementsChange} />
            <AvatarPanel lang={lang} skinTone={skinToneId} onChange={onSkinToneChange} pose={poseId} onPoseChange={onPoseChange} />
            <ExportPanel lang={lang} exportRef={exportRef} />
          </div>
        ) : <>
          <div className="cl-tabs" role="tablist">
            {TABS.map(([id, en, arabic]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{ar ? arabic : en}</button>)}
          </div>
          <div className="cl-tabpanel" role="tabpanel">
            {tab === 'fabric' && <FabricPanel lang={lang} fabricId={fabricId} onChange={onFabricChange} qualityTier={qualityTier} onQualityTierChange={onQualityTierChange} />}
            {tab === 'body' && <MeasurementPanel lang={lang} measurements={measurements} onChange={onMeasurementsChange} />}
            {tab === 'look' && <AvatarPanel lang={lang} skinTone={skinToneId} onChange={onSkinToneChange} pose={poseId} onPoseChange={onPoseChange} />}
            {tab === 'export' && <ExportPanel lang={lang} exportRef={exportRef} />}
          </div>
        </>}
        {!bodyOnly && <div className="cl-tip">
          <strong>{text('Tips', 'نصائح')}</strong>
          <ul>
            <li>{text('Drag the background to turn around the model.', 'اسحب الخلفية للدوران حول المجسم.')}</li>
            <li>{text('Drag the fabric to pull and adjust it.', 'اسحب القماش لشدّه وضبطه.')}</li>
            <li>{text('Seam looks twisted? Go back to Sew and flip it.', 'وصلة ملتوية؟ ارجع إلى الخياطة واعكسها.')}</li>
          </ul>
        </div>}
      </aside>
      <main className="cl-preview">
        {poseWarning && (
          <div role="alert" className="cl-callout tone-warn cl-floating">
            <span aria-hidden="true">⚠</span>
            <span style={{ flex: '1 1 auto' }}>{poseWarning}</span>
            <button className="cl-icon-btn" onClick={() => onPoseWarning(null)} aria-label={ar ? 'إغلاق' : 'Dismiss'}>×</button>
          </div>
        )}
        {showCanvas ? <>
          <div className="cl-preview-tools" role="toolbar" aria-label={text('View controls', 'أدوات العرض')}>
            <div className="cl-tool-group">
              <button onClick={fitCamera}>{ar ? 'ملاءمة العرض' : 'Fit view'}</button>
              <button onClick={() => zoomBy(1.2)} aria-label="Zoom in">+</button>
              <button onClick={() => zoomBy(0.83)} aria-label="Zoom out">−</button>
            </div>
            {!bodyOnly && view === 'cloth' && <div className="cl-tool-group">
              <button onClick={() => setPaused(v => !v)}>{paused ? (ar ? 'تشغيل' : 'Resume') : (ar ? 'إيقاف مؤقت' : 'Pause')}</button>
              <button onClick={() => { setPaused(false); setRestartVersion(v => v + 1) }}>{ar ? 'إعادة المعاينة' : 'Restart drape'}</button>
            </div>}
            {!bodyOnly && <label className="cl-tool-group cl-view-select">
              <span>{text('Show', 'عرض')}</span>
              <select value={view} onChange={e => onViewChange(e.target.value)}>
                <option value="cloth">{text('Draped garment', 'القطعة المنسدلة')}</option>
                <option value="pieces">{text('Placed panels (no physics)', 'القطع الموضوعة (دون فيزياء)')}</option>
                <option value="weld">{text('Seam check', 'فحص الوصلات')}</option>
                <option value="off">{text('Body only', 'الجسم فقط')}</option>
              </select>
            </label>}
          </div>
          {!bodyOnly && <p className="cl-simulation-note">{t(lang, 'simulationIndicative')}</p>}
          <SceneBoundary key={`${view}-${garment?.pieces?.length}`} lang={lang} onRecover={() => onStep('sew')}>
            <div className="cl-canvas">
              <Canvas key={restartVersion} shadows camera={{ position: [1.6, dims.H * 0.6, 2.2], fov: 40 }}>
                <Scene dims={dims} lang={lang} debugView={bodyOnly ? 'off' : view} fabricId={fabricId} qualityTier={qualityTier} skinToneId={skinToneId} poseId={poseId} garment={garment} seamEditor={seamEditor} avatarGLBUrl={avatarGLBUrl} statsRef={statsRef} exportRef={exportRef} onPoseWarning={onPoseWarning} controlsRef={controlsRef} paused={paused} />
              </Canvas>
            </div>
          </SceneBoundary>
        </> : <div className="cl-loading" role="status"><span className="cl-spinner" aria-hidden="true" />{text('Preparing your garment…', 'جارٍ تجهيز قطعتك…')}</div>}
        {view === 'cloth' && isSolverHUDEnabled() && <SolverHUD statsRef={statsRef} />}
      </main>
    </div>
    {!bodyOnly && <ActionBar lang={lang}
      status={seamCount === 0 && looseCount > 1
        ? text('Pieces are hanging loose because nothing is sewn yet. Go back to sewing to join matching edges.', 'القطع تتدلى منفصلة لأنه لم تُخَط أي وصلة بعد. ارجع إلى الخياطة لوصل الحواف المتقابلة.')
        : text('Like it? Export it from the Export tab. Want changes? Go back a step.', 'أعجبك؟ صدّره من تبويب التصدير. تريد تعديلاً؟ ارجع خطوة.')}
      back={{ label: text('Back to sewing', 'العودة إلى الخياطة'), onClick: () => onStep('sew') }} />}
  </>
}
