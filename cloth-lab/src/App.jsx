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
import PatternReview from './workflow/PatternReview'
import SewingDesk from './workflow/SewingDesk'
import SceneBoundary from './workflow/SceneBoundary'
import { planPattern, designKey } from './workflow/patternPlan'
import { readSession, writeSession } from './workflow/session'
import { useSeamEditor } from './seam/useSeamEditor'
import SeamEditorPanel from './seam/SeamEditorPanel'
import { t, dirFor } from './i18n'

function patternSignature(payload) { return designKey(payload) }

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
  const [debugView, setDebugView] = useState(bodyOnly ? 'off' : 'seams')
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

  // Whatever the bridge (root BerryStudio app — iframe postMessage in
  // standalone/legacy mode, the `pattern` prop when embedded) last sent,
  // reviewed before conversion. null means no imported design; no demo fallback.
  const [source, setSource] = useState(pattern)
  const [answers, setAnswers] = useState(() => readSession(pattern)?.answers || (pattern?.clothLabSetup?.design === designKey(pattern) ? pattern.clothLabSetup.answers : {}))
  const [configuring, setConfiguring] = useState(!bodyOnly)
  const [savedEditor, setSavedEditor] = useState(() => readSession(pattern)?.editor || (pattern?.clothLabSetup?.design === designKey(pattern) ? pattern.clothLabSetup.editor : null))
  const [storageWarning, setStorageWarning] = useState(false)
  const plan = useMemo(() => planPattern(source, answers), [source, answers])
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
  // Seams view for review — never auto-simulate, see importFromApp.js's
  // header comment for why.
  //
  // `lang` (WP-9 issue #7) resends the FULL bridge payload every time the
  // root app's language changes (see js/app.js's applyLang()), reusing this
  // exact same message/prop path rather than a separate one — simplest to
  // wire, but it means a payload whose ONLY actual change is `lang` must be
  // told apart from a genuinely new pattern. Without the signature check
  // below, every language switch bumped garmentVersion (full Workspace
  // remount — seam-editor progress lost) and forced debugView back to
  // 'seams' (silently yanking the user off whatever view — Cloth, Weld,
  // Pieces — they were actually looking at) purely from switching languages.
  const lastPatternSignatureRef = useRef(pattern ? patternSignature(pattern) : null)
  function applyIncomingPattern(payload) {
    if (payload.lang) setLang(payload.lang)
    setCategory(payload.category)
    setMeasurementsByCategory(prev => ({ ...prev, [payload.category]: payload.measurements }))
    if (payload.fabricId) setFabricId(payload.fabricId)
    setAvatarGLBByCategory(payload.avatarGLB || {})
    const signature = patternSignature(payload)
    if (signature === lastPatternSignatureRef.current) return
    lastPatternSignatureRef.current = signature
    const saved = readSession(payload) || (payload.clothLabSetup?.design === signature ? payload.clothLabSetup : null)
    setSource(payload)
    setAnswers(saved?.answers || {})
    setSavedEditor(saved?.editor || null)
    setGarment(null)
    setConfiguring(!bodyOnly)
    setGarmentVersion(v => v + 1)
    setDebugView(bodyOnly ? 'off' : 'seams')
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

  return (
    <div className="cloth-lab-root" dir={dirFor(lang)} lang={lang}>
      <Header
        embedded={embedded} bodyOnly={bodyOnly} lang={lang}
        category={category} onCategoryChange={setCategory} linked={!!source}
        configuring={configuring} onConfigure={() => { setConfiguring(true); setDebugView('seams') }}
        debugView={debugView} onDebugViewChange={(view) => {
          if (configuring && plan?.ready) { setConfiguring(false); setGarmentVersion(v => v + 1) }
          // Imported designs must be finalized before any garment preview.
          if ((!garment || configuring) && ['cloth', 'weld', 'pieces'].includes(view)) {
            setDebugView('seams')
          } else setDebugView(view)
        }}
      />
      {storageWarning && <div role="status" className="cl-error">{lang === 'ar' ? 'تعذر الحفظ المحلي. أبقِ هذه الصفحة مفتوحة.' : 'Local saving failed. Keep this page open to retain your work.'}</div>}
      {!bodyOnly && configuring ? (source ? <PatternReview source={source} plan={plan} lang={lang}
        onAnswer={(id, answer) => { const next = { ...answers, [id]: answer }; setAnswers(next); setGarment(null); setSavedEditor(null); persist(next, null) }}
        onContinue={() => { if (!plan.ready) return; setConfiguring(false); setDebugView('seams'); setGarmentVersion(v => v + 1) }} /> :
        <div className="cl-empty"><h2>{lang === 'ar' ? 'ابدأ من الباترون الخاص بك' : 'Start with your pattern'}</h2><p>{lang === 'ar' ? 'أنشئ أو افتح تصميماً في BerryStudio ثم افتح Cloth Lab. لن يتم استبداله بقطعة تجريبية.' : 'Create or open a design in BerryStudio, then open Cloth Lab. Your design will never be replaced with a demo garment.'}</p></div>) : <Workspace
        key={garmentVersion}
        bodyOnly={bodyOnly} lang={lang}
        dims={dims} measurements={measurements}
        onMeasurementsChange={(next) => setMeasurementsByCategory((prev) => ({ ...prev, [category]: next }))}
        fabricId={fabricId} onFabricChange={setFabricId}
        qualityTier={qualityTier} onQualityTierChange={setQualityTier}
        skinToneId={skinToneId} onSkinToneChange={setSkinToneId}
        poseId={poseId} onPoseChange={setPoseId}
        poseWarning={poseWarning} onPoseWarning={setPoseWarning}
        debugView={debugView} garment={garment}
        imported={imported} restored={savedEditor}
        onEditorChange={editor => { setSavedEditor(editor); persist(answers, editor); setGarment(null) }}
        onReview={() => { setConfiguring(true); setDebugView("seams") }}
        onViewChange={setDebugView}
        avatarGLBUrl={avatarGLBByCategory[category]}
        onReset={() => { setGarment(null); setDebugView("seams"); setGarmentVersion((v) => v + 1) }}
        onSimulate={(result) => { setGarment(result); setDebugView('cloth') }}
      />}
    </div>
  )
}

// Owns the one useSeamEditor instance shared by the sidebar panel and flat
// sewing desk — split out from App so the whole thing can be remounted
// (via App's key={garmentVersion}) as a unit whenever a new garment import
// needs a fresh seam-editor rather than picking up on top of a stale one.
function Workspace({ bodyOnly, lang, dims, measurements, onMeasurementsChange, fabricId, onFabricChange, qualityTier, onQualityTierChange, skinToneId, onSkinToneChange, poseId, onPoseChange, poseWarning, onPoseWarning, debugView, garment, imported, restored, onEditorChange, onReview, onViewChange, avatarGLBUrl, onReset, onSimulate }) {
  const rawPieces = imported ? imported.rawPieces : []
  const roles = imported ? imported.roles : {}
  const seedEdges = imported ? imported.edgeInstructions : undefined
  const seedSeams = imported ? imported.seamInstructions : undefined
  const placementHints = imported ? imported.placementHints : undefined
  const seamEditor = useSeamEditor(rawPieces, roles, seedEdges, seedSeams, placementHints, restored)
  const [paused, setPaused] = useState(false)
  const [restartVersion, setRestartVersion] = useState(0)
  const editorChangedRef = useRef(onEditorChange)
  editorChangedRef.current = onEditorChange
  const initialEditorRef = useRef(true)
  useEffect(() => {
    if (initialEditorRef.current) { initialEditorRef.current = false; return }
    editorChangedRef.current?.({ drafts: seamEditor.drafts, seams: seamEditor.seams, separate: seamEditor.separate, reviewed: seamEditor.reviewed })
  }, [seamEditor.drafts, seamEditor.seams, seamEditor.separate, seamEditor.reviewed])
  const statsRef = useRef({ substeps: 0, emaMs: 0, lastCostMs: 0 })
  const exportRef = useRef(null)

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

  return (
    <div className="cl-workspace">
      <aside className="cl-sidebar">
        {!bodyOnly && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-2)' }}>{t(lang, 'garment')}</span>
            <strong>{imported ? t(lang, 'garmentFromDesign') : garment ? t(lang, 'garmentCustom') : t(lang, 'garmentDefault')}</strong>
            {(garment || imported) && (
              <button
                onClick={onReset}
                style={{ marginInlineStart: 'auto', border: 'none', background: 'transparent', color: 'var(--accent-2)', fontSize: 12, cursor: 'pointer' }}
              >
                {t(lang, 'reset')}
              </button>
            )}
          </div>
        )}
        {!bodyOnly && <button className="cl-link" onClick={onReview}>{lang === 'ar' ? 'مراجعة جميع قطع التصميم' : 'Review all source pieces'}</button>}
        {!bodyOnly && debugView === 'seams' && <SeamEditorPanel lang={lang} editor={seamEditor} onSimulate={onSimulate} />}
        <details open={bodyOnly}><summary>{lang === 'ar' ? 'الجسم والقياسات' : 'Body & measurements'}</summary>
        <MeasurementPanel lang={lang} measurements={measurements} onChange={onMeasurementsChange} />
        </details>
        {!bodyOnly && <details open={debugView === 'cloth'}><summary>{lang === 'ar' ? 'القماش' : 'Fabric'}</summary><FabricPanel lang={lang} fabricId={fabricId} onChange={onFabricChange} qualityTier={qualityTier} onQualityTierChange={onQualityTierChange} /></details>}
        <details><summary>{lang === 'ar' ? 'المظهر والوضعية' : 'Appearance & pose'}</summary><AvatarPanel lang={lang} skinTone={skinToneId} onChange={onSkinToneChange} pose={poseId} onPoseChange={onPoseChange} /></details>
        {(bodyOnly || (garment && debugView !== 'seams')) && <details open={bodyOnly}><summary>{lang === 'ar' ? 'التصدير' : 'Export'}</summary><ExportPanel lang={lang} exportRef={exportRef} /></details>}
      </aside>
      <main className="cl-preview">
        {poseWarning && debugView !== 'seams' && (
          <div
            role="alert"
            style={{
              position: 'absolute', insetInlineStart: 12, insetInlineEnd: 12, top: 12, zIndex: 5,
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'color-mix(in srgb, #e0a83a 16%, var(--panel))',
              border: '1px solid color-mix(in srgb, #e0a83a 55%, var(--border))',
              borderRadius: 'var(--radius)', padding: '9px 12px', fontSize: 12.5, lineHeight: 1.45,
              color: 'var(--text)',
            }}
          >
            <span style={{ flex: '0 0 auto', fontSize: 14 }}>⚠</span>
            <span style={{ flex: '1 1 auto' }}>{poseWarning}</span>
            <button
              onClick={() => onPoseWarning(null)}
              aria-label={lang === 'ar' ? 'إغلاق' : 'Dismiss'}
              style={{ flex: '0 0 auto', border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}
            >
              ×
            </button>
          </div>
        )}
        {debugView === 'seams' && !bodyOnly ? <SewingDesk editor={seamEditor} lang={lang} /> : <>
          <div className="cl-preview-tools"><button onClick={fitCamera}>{lang === 'ar' ? 'ملاءمة العرض' : 'Fit view'}</button><button onClick={() => zoomBy(1.2)} aria-label="Zoom in">+</button><button onClick={() => zoomBy(0.83)} aria-label="Zoom out">−</button>{debugView === 'cloth' && <><button onClick={() => setPaused(v => !v)}>{paused ? (lang === 'ar' ? 'تشغيل' : 'Resume') : (lang === 'ar' ? 'إيقاف مؤقت' : 'Pause')}</button><button onClick={() => { setPaused(false); setRestartVersion(v => v + 1) }}>{lang === 'ar' ? 'إعادة المعاينة' : 'Restart drape'}</button></>}</div>
          <SceneBoundary key={`${debugView}-${garment?.pieces?.length}`} lang={lang} onRecover={() => onViewChange('seams')}>
            <Canvas key={restartVersion} shadows camera={{ position: [1.6, dims.H * 0.6, 2.2], fov: 40 }}>
              <Scene dims={dims} lang={lang} debugView={debugView} fabricId={fabricId} qualityTier={qualityTier} skinToneId={skinToneId} poseId={poseId} garment={garment} seamEditor={seamEditor} avatarGLBUrl={avatarGLBUrl} statsRef={statsRef} exportRef={exportRef} onPoseWarning={onPoseWarning} controlsRef={controlsRef} paused={paused} />
            </Canvas>
          </SceneBoundary>
        </>}
        {debugView === 'cloth' && isSolverHUDEnabled() && <SolverHUD statsRef={statsRef} />}
      </main>
    </div>
  )
}
