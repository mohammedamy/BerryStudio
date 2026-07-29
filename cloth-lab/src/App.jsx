import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Header from './ui/Header'
import MeasurementPanel from './ui/MeasurementPanel'
import FabricPanel from './ui/FabricPanel'
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

export default function App() {
  const [category, setCategory] = useState('women')
  const [measurementsByCategory, setMeasurementsByCategory] = useState(DEFAULT_MEASUREMENTS)
  const [debugView, setDebugView] = useState('cloth')
  const [fabricId, setFabricId] = useState(DEFAULT_FABRIC)
  const [garment, setGarment] = useState(null) // null = default T-shirt; else {pieces, seams} from the seam editor
  // Per-category GLB avatar URLs from the bridge (root app's state.avatarGLB
  // dict) — keyed by category, not a single URL, because cloth-lab's own
  // Header category switcher is independent of the bridge: switching
  // category in here must not lose the association or need a resend.
  const [avatarGLBByCategory, setAvatarGLBByCategory] = useState({})

  // Whatever the bridge (root BerryStudio app, embedded via iframe — see
  // js/app.js's syncClothLab/loadClothLab) last sent, converted — see
  // pattern/importFromApp.js. null = standalone / nothing imported yet,
  // falls back to the skirt-import demo below exactly as before this feature.
  const [imported, setImported] = useState(null)
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

  // Bridge from the root BerryStudio app. Announce we're mounted and ready to
  // receive (the root app waits for this before posting, to avoid a race
  // where it sends before this listener exists), then on each pattern:
  // convert it (closed-world classifier — see importFromApp.js for exactly
  // what is/isn't recognized), sync category/measurements/fabric to match,
  // and always land in the Seams view for review — never auto-simulate, see
  // importFromApp.js's header comment for why.
  useEffect(() => {
    function onMessage(e) {
      if (!e.data || e.data.type !== 'berrystudio:pattern') return
      const result = convertAppPattern(e.data)
      setCategory(e.data.category)
      setMeasurementsByCategory((prev) => ({ ...prev, [e.data.category]: e.data.measurements }))
      if (result.fabricId) setFabricId(result.fabricId)
      setAvatarGLBByCategory(e.data.avatarGLB || {})
      setGarment(null) // the previous "Simulate This Garment" result doesn't apply to a new pattern
      setImported(result)
      setGarmentVersion((v) => v + 1)
      setDebugView('seams')
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage({ type: 'clothlab:ready' }, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <>
      <Header
        category={category} onCategoryChange={setCategory}
        debugView={debugView} onDebugViewChange={setDebugView}
      />
      <Workspace
        key={garmentVersion}
        dims={dims} measurements={measurements}
        onMeasurementsChange={(next) => setMeasurementsByCategory((prev) => ({ ...prev, [category]: next }))}
        fabricId={fabricId} onFabricChange={setFabricId}
        debugView={debugView} garment={garment}
        imported={imported} skirtRawPieces={skirtRawPieces}
        avatarGLBUrl={avatarGLBByCategory[category]}
        onReset={() => { setGarment(null); setImported(null); setGarmentVersion((v) => v + 1) }}
        onSimulate={(result) => { setGarment(result); setDebugView('cloth') }}
      />
    </>
  )
}

// Owns the one useSeamEditor instance shared by the sidebar panel and the 3D
// Seams view — split out from App so the whole thing can be remounted
// (via App's key={garmentVersion}) as a unit whenever a new garment import
// needs a fresh seam-editor rather than picking up on top of a stale one.
function Workspace({ dims, measurements, onMeasurementsChange, fabricId, onFabricChange, debugView, garment, imported, skirtRawPieces, avatarGLBUrl, onReset, onSimulate }) {
  const rawPieces = imported ? imported.rawPieces : skirtRawPieces
  const roles = imported ? imported.roles : SKIRT_ROLES
  const seedEdges = imported ? imported.edgeInstructions : undefined
  const seedSeams = imported ? imported.seamInstructions : undefined
  const seamEditor = useSeamEditor(rawPieces, roles, seedEdges, seedSeams)
  const statsRef = useRef({ substeps: 0, emaMs: 0, lastCostMs: 0 })

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
        {debugView === 'seams' && <SeamEditorPanel editor={seamEditor} onSimulate={onSimulate} />}
      </aside>
      <main style={{ flex: '1 1 auto', position: 'relative' }}>
        <Canvas shadows camera={{ position: [1.6, dims.H * 0.6, 2.2], fov: 40 }}>
          <Scene dims={dims} debugView={debugView} fabricId={fabricId} garment={garment} seamEditor={seamEditor} avatarGLBUrl={avatarGLBUrl} statsRef={statsRef} />
        </Canvas>
        {debugView === 'cloth' && isSolverHUDEnabled() && <SolverHUD statsRef={statsRef} />}
      </main>
    </div>
  )
}
