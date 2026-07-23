import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Header from './ui/Header'
import MeasurementPanel from './ui/MeasurementPanel'
import FabricPanel from './ui/FabricPanel'
import Scene from './scene/Scene'
import { DEFAULT_MEASUREMENTS } from './state/measurements'
import { computeBodyDims } from './body/computeBodyDims'
import { DEFAULT_FABRIC } from './cloth/fabricPresets'
import { buildSkirtRaw, DEFAULT_SKIRT_STYLE } from './pattern/library/skirt'
import { useSeamEditor } from './seam/useSeamEditor'
import SeamEditorPanel from './seam/SeamEditorPanel'

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

  const measurements = measurementsByCategory[category]
  const dims = useMemo(() => computeBodyDims(measurements, category), [measurements, category])

  const skirtRawPieces = useMemo(
    () => buildSkirtRaw(measurements, DEFAULT_SKIRT_STYLE).filter((p) => p.id !== 'waistband'),
    [measurements],
  )
  const seamEditor = useSeamEditor(skirtRawPieces, SKIRT_ROLES)

  return (
    <>
      <Header
        category={category} onCategoryChange={setCategory}
        debugView={debugView} onDebugViewChange={setDebugView}
      />
      <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0 }}>
        <aside style={{ width: 260, flex: '0 0 auto', borderInlineEnd: '1px solid var(--border)', background: 'var(--panel)', overflowY: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-2)' }}>Garment:</span>
            <strong>{garment ? 'Custom (seam-authored)' : 'T-shirt (default)'}</strong>
            {garment && (
              <button
                onClick={() => setGarment(null)}
                style={{ marginInlineStart: 'auto', border: 'none', background: 'transparent', color: 'var(--accent-2)', fontSize: 12, cursor: 'pointer' }}
              >
                Reset
              </button>
            )}
          </div>
          <MeasurementPanel
            measurements={measurements}
            onChange={(next) => setMeasurementsByCategory((prev) => ({ ...prev, [category]: next }))}
          />
          <FabricPanel fabricId={fabricId} onChange={setFabricId} />
          {debugView === 'seams' && (
            <SeamEditorPanel
              editor={seamEditor}
              onSimulate={(result) => { setGarment(result); setDebugView('cloth') }}
            />
          )}
        </aside>
        <main style={{ flex: '1 1 auto', position: 'relative' }}>
          <Canvas shadows camera={{ position: [1.6, dims.H * 0.6, 2.2], fov: 40 }}>
            <Scene dims={dims} debugView={debugView} fabricId={fabricId} garment={garment} seamEditor={seamEditor} />
          </Canvas>
        </main>
      </div>
    </>
  )
}
