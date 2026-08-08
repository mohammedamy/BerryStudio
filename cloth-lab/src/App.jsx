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
import { buildSkirtRaw, DEFAULT_SKIRT_STYLE } from './pattern/library/skirt'
import { useSeamEditor } from './seam/useSeamEditor'
import SeamEditorPanel from './seam/SeamEditorPanel'
import { convertAppPattern } from './pattern/importFromApp'
import { t, dirFor } from './i18n'

// Front/back skirt panels only — no waistband. A waistband needs its single
// bottom edge SPLIT into two sub-seams (one to the front top, one to the
// back top), which needs the seam-authoring UI to support inserting a new
// vertex mid-edge, not just picking among existing ones. Deliberately
// deferred: a waistband is also stiff/narrow enough to barely affect drape,
// so skipping it doesn't compromise proving the import->author->simulate
// pipeline on a real, non-T-shirt garment.
const SKIRT_ROLES = { frontSkirt: 'hipPanelFront', backSkirt: 'hipPanelBack' }

// WP-5.3: `embedded`/`pattern`/`onReady` are only used by the new embedded
// entry point (embed.js) — the standalone build (main.jsx) renders <App />
// with none of them, so every default below reproduces standalone's exact
// prior behavior unchanged. `pattern`, when given, is the SAME payload
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
  const [category, setCategory] = useState(pattern?.category || 'women')
  const [measurementsByCategory, setMeasurementsByCategory] = useState(
    pattern ? { ...DEFAULT_MEASUREMENTS, [pattern.category]: pattern.measurements } : DEFAULT_MEASUREMENTS,
  )
  const [debugView, setDebugView] = useState(bodyOnly ? 'off' : 'cloth')
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
  const [garment, setGarment] = useState(null) // null = default T-shirt; else {pieces, seams} from the seam editor
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
  // converted — see pattern/importFromApp.js. null = nothing imported yet,
  // falls back to the skirt-import demo below exactly as before this feature.
  const [imported, setImported] = useState(pattern ? convertAppPattern(pattern) : null)
  // Bumped once per accepted bridge payload. useSeamEditor's drafts/seams are
  // lazy-initialized (useState(() => ...)) and won't pick up new rawPieces on
  // their own — Workspace below is remounted via key={garmentVersion} to
  // force a clean re-init, the standard React fix for that.
  const [garmentVersion, setGarmentVersion] = useState(0)

  const measurements = measurementsByCategory[category]
  const dims = useMemo(() => computeBodyDims(measurements, category), [measurements, category])

  const skirtRawPieces = useMemo(
    () => buildSkirtRaw(measurements, DEFAULT_SKIRT_STYLE).filter((p) => p.id !== 'waistband'),
    [measurements],
  )

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
  const lastPatternSignatureRef = useRef(null)
  function applyIncomingPattern(payload) {
    if (payload.lang) setLang(payload.lang)
    const { lang: _lang, ...patternOnly } = payload
    const signature = JSON.stringify(patternOnly)
    if (signature === lastPatternSignatureRef.current) return // only `lang` differed — already applied above
    lastPatternSignatureRef.current = signature

    const result = convertAppPattern(payload)
    setCategory(payload.category)
    setMeasurementsByCategory((prev) => ({ ...prev, [payload.category]: payload.measurements }))
    if (result.fabricId) setFabricId(result.fabricId)
    setAvatarGLBByCategory(payload.avatarGLB || {})
    setGarment(null) // the previous "Simulate This Garment" result doesn't apply to a new pattern
    setImported(result)
    setGarmentVersion((v) => v + 1)
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
      if (!e.data || e.data.type !== 'berrystudio:pattern') return
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
        category={category} onCategoryChange={setCategory}
        debugView={debugView} onDebugViewChange={setDebugView}
      />
      <Workspace
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
        imported={imported} skirtRawPieces={skirtRawPieces}
        avatarGLBUrl={avatarGLBByCategory[category]}
        onReset={() => { setGarment(null); setImported(null); setGarmentVersion((v) => v + 1) }}
        onSimulate={(result) => { setGarment(result); setDebugView('cloth') }}
      />
    </div>
  )
}

// Owns the one useSeamEditor instance shared by the sidebar panel and the 3D
// Seams view — split out from App so the whole thing can be remounted
// (via App's key={garmentVersion}) as a unit whenever a new garment import
// needs a fresh seam-editor rather than picking up on top of a stale one.
function Workspace({ bodyOnly, lang, dims, measurements, onMeasurementsChange, fabricId, onFabricChange, qualityTier, onQualityTierChange, skinToneId, onSkinToneChange, poseId, onPoseChange, poseWarning, onPoseWarning, debugView, garment, imported, skirtRawPieces, avatarGLBUrl, onReset, onSimulate }) {
  const rawPieces = imported ? imported.rawPieces : skirtRawPieces
  const roles = imported ? imported.roles : SKIRT_ROLES
  const seedEdges = imported ? imported.edgeInstructions : undefined
  const seedSeams = imported ? imported.seamInstructions : undefined
  const seamEditor = useSeamEditor(rawPieces, roles, seedEdges, seedSeams)
  const statsRef = useRef({ substeps: 0, emaMs: 0, lastCostMs: 0 })
  const exportRef = useRef(null)

  return (
    <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0 }}>
      <aside style={{ width: 260, flex: '0 0 auto', borderInlineEnd: '1px solid var(--border)', background: 'var(--panel)', overflowY: 'auto' }}>
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
        {!bodyOnly && imported && imported.skipped.length > 0 && (
          <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--text-2)', borderBottom: '1px solid var(--border)', lineHeight: 1.5 }}>
            {t(lang, 'piecesUsedSkipped', {
              used: imported.recognized.length,
              total: imported.recognized.length + imported.skipped.length,
              list: imported.skipped.map((s) => s.label).join(', '),
            })}
          </div>
        )}
        <MeasurementPanel lang={lang} measurements={measurements} onChange={onMeasurementsChange} />
        {!bodyOnly && <FabricPanel lang={lang} fabricId={fabricId} onChange={onFabricChange} qualityTier={qualityTier} onQualityTierChange={onQualityTierChange} />}
        <AvatarPanel lang={lang} skinTone={skinToneId} onChange={onSkinToneChange} pose={poseId} onPoseChange={onPoseChange} />
        <ExportPanel lang={lang} exportRef={exportRef} />
        {!bodyOnly && debugView === 'seams' && <SeamEditorPanel lang={lang} editor={seamEditor} onSimulate={onSimulate} />}
      </aside>
      <main style={{ flex: '1 1 auto', position: 'relative' }}>
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
        <Canvas shadows camera={{ position: [1.6, dims.H * 0.6, 2.2], fov: 40 }}>
          <Scene dims={dims} lang={lang} debugView={debugView} fabricId={fabricId} qualityTier={qualityTier} skinToneId={skinToneId} poseId={poseId} garment={garment} seamEditor={seamEditor} avatarGLBUrl={avatarGLBUrl} statsRef={statsRef} exportRef={exportRef} onPoseWarning={onPoseWarning} />
        </Canvas>
        {debugView === 'cloth' && isSolverHUDEnabled() && <SolverHUD statsRef={statsRef} />}
      </main>
    </div>
  )
}
