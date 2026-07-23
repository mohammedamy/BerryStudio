import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Header from './ui/Header'
import MeasurementPanel from './ui/MeasurementPanel'
import FabricPanel from './ui/FabricPanel'
import Scene from './scene/Scene'
import { DEFAULT_MEASUREMENTS } from './state/measurements'
import { computeBodyDims } from './body/computeBodyDims'
import { DEFAULT_FABRIC } from './cloth/fabricPresets'

export default function App() {
  const [category, setCategory] = useState('women')
  const [measurementsByCategory, setMeasurementsByCategory] = useState(DEFAULT_MEASUREMENTS)
  const [debugView, setDebugView] = useState('cloth')
  const [fabricId, setFabricId] = useState(DEFAULT_FABRIC)

  const measurements = measurementsByCategory[category]
  const dims = useMemo(() => computeBodyDims(measurements, category), [measurements, category])

  return (
    <>
      <Header
        category={category} onCategoryChange={setCategory}
        debugView={debugView} onDebugViewChange={setDebugView}
      />
      <div style={{ flex: '1 1 auto', display: 'flex', minHeight: 0 }}>
        <aside style={{ width: 260, flex: '0 0 auto', borderInlineEnd: '1px solid var(--border)', background: 'var(--panel)', overflowY: 'auto' }}>
          <MeasurementPanel
            measurements={measurements}
            onChange={(next) => setMeasurementsByCategory((prev) => ({ ...prev, [category]: next }))}
          />
          <FabricPanel fabricId={fabricId} onChange={setFabricId} />
        </aside>
        <main style={{ flex: '1 1 auto', position: 'relative' }}>
          <Canvas shadows camera={{ position: [1.6, dims.H * 0.6, 2.2], fov: 40 }}>
            <Scene dims={dims} debugView={debugView} fabricId={fabricId} />
          </Canvas>
        </main>
      </div>
    </>
  )
}
