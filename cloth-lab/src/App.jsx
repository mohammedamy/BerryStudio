import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Header from './ui/Header'
import MeasurementPanel from './ui/MeasurementPanel'
import FabricPanel from './ui/FabricPanel'
import AvatarPanel, { DEFAULT_SKIN_TONE } from './ui/AvatarPanel'
import ExportPanel from './ui/ExportPanel'
import SolverHUD, { isSolverHUDEnabled } from './ui/SolverHUD'
import Scene from './scene/Scene'
import { DEFAULT_MEASUREMENTS } from './state/measurements'
import { computeBodyDims } from './body/computeBodyDims'
import { DEFAULT_FABRIC } from './cloth/fabricPresets'
import { buildSkirtRaw, DEFAULT_SKIRT_STYLE } from './pattern/library/skirt'
import { useSeamEditor } from './seam/useSeamEditor'
import SeamEditorPanel from './seam/SeamEditorPanel'
import { convertAppPattern } from './pattern/importFromApp'

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
export default function App({ embedded = false, pattern = null, onReady } = {}) {
  const [category, setCategory] = useState(pattern?.category || 'women')
  const [measurementsByCategory, setMeasurementsByCategory] = useState(
    pattern ? { ...DEFAULT_MEASUREMENTS, [pattern.category]: pattern.measurements } : DEFAULT_MEASUREMENTS,
  )
  const [debugView, setDebugView] = useState('cloth')
  const [fabricId, setFabricId] = useState((pattern && pattern.fabricId) || DEFAULT_FABRIC)
  const [skinToneId, setSkinToneId] = useState(DEFAULT_SKIN_TONE)
  const [garment, setGarment] = useState(null) // null = default T-shirt; else {pieces, seams} from the seam editor
  // Per-category GLB avatar URLs from the bridge (root app's state.avatarGLB
  // dict) — keyed by category, not a single URL, because cloth-lab's own
  // Header category switcher is independent of the bridge: switching
  // category in here must not lose the association or need a resend.
  const [avatarGLBByCategory, setAvatarGLBByCategory] = useState((pattern && pattern.avatarGLB) || {})

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
  function applyIncomingPattern(payload) {
    const result = convertAppPattern(payload)
    setCategory(payload.category)
    setMeasurementsByCategory((prev) => ({ ...prev, [payload.category]: payload.measurements }))
    if (result.fabricId) setFabricId(result.fabricId)
    setAvatarGLBByCategory(payload.avatarGLB || {})
    setGarment(null) // the previous "Simulate This Garment" result doesn't apply to a new pattern
    setImported(result)
    setGarmentVersion((v) => v + 1)
    setDebugView('seams')
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
    <div className="cloth-lab-root">
      <Header
        embedded={embedded}
        category={category} onCategoryChange={setCategory}
        debugView={debugView} onDebugViewChange={setDebugView}
      />
      <Workspace
        key={garmentVersion}
        dims={dims} measurements={measurements}
        onMeasurementsChange={(next) => setMeasurementsByCategory((prev) => ({ ...prev, [category]: next }))}
        fabricId={fabricId} onFabricChange={setFabricId}
        skinToneId={skinToneId} onSkinToneChange={setSkinToneId}
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
function Workspace({ dims, measurements, onMeasurementsChange, fabricId, onFabricChange, skinToneId, onSkinToneChange, debugView, garment, imported, skirtRawPieces, avatarGLBUrl, onReset, onSimulate }) {
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
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--text-2)' }}>Garment:</span>
          <strong>{imported ? 'From your BerryStudio design' : garment ? 'Custom (seam-authored)' : 'T-shirt (default)'}</strong>
          {(garment || imported) && (
            <button
              onClick={onReset}
              style={{ marginInlineStart: 'auto', border: 'none', background: 'transparent', color: 'var(--accent-2)', fontSize: 12, cursor: 'pointer' }}
            >
              Reset
            </button>
          )}
        </div>
        {imported && imported.skipped.length > 0 && (
          <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--text-2)', borderBottom: '1px solid var(--border)', lineHeight: 1.5 }}>
            {imported.recognized.length} of {imported.recognized.length + imported.skipped.length} pieces used — skipped: {imported.skipped.map((s) => s.label).join(', ')}
          </div>
        )}
        <MeasurementPanel measurements={measurements} onChange={onMeasurementsChange} />
        <FabricPanel fabricId={fabricId} onChange={onFabricChange} />
        <AvatarPanel skinTone={skinToneId} onChange={onSkinToneChange} />
        <ExportPanel exportRef={exportRef} />
        {debugView === 'seams' && <SeamEditorPanel editor={seamEditor} onSimulate={onSimulate} />}
      </aside>
      <main style={{ flex: '1 1 auto', position: 'relative' }}>
        <Canvas shadows camera={{ position: [1.6, dims.H * 0.6, 2.2], fov: 40 }}>
          <Scene dims={dims} debugView={debugView} fabricId={fabricId} skinToneId={skinToneId} garment={garment} seamEditor={seamEditor} avatarGLBUrl={avatarGLBUrl} statsRef={statsRef} exportRef={exportRef} />
        </Canvas>
        {debugView === 'cloth' && isSolverHUDEnabled() && <SolverHUD statsRef={statsRef} />}
      </main>
    </div>
  )
}
