import { useEffect, useState } from 'react'

// WP-7.3 dev overlay: reads the plain-object `statsRef` ClothMesh.jsx writes
// into every frame (see its useFrame callback) — NOT via useFrame itself,
// since this renders as a plain HTML overlay outside the <Canvas>/R3F tree,
// not a scene object. Polls on its own throttled interval instead, which
// also naturally caps the HUD's own re-render rate independent of the sim's
// actual frame rate — a debug readout doesn't need to repaint at 60fps to
// be useful, and a slower repaint is itself one less thing competing for
// main-thread time while diagnosing a performance problem.
const POLL_MS = 250

export function isSolverHUDEnabled() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('hud') === '1'
}

export default function SolverHUD({ statsRef }) {
  const [stats, setStats] = useState(() => ({ substeps: 0, emaMs: 0, lastCostMs: 0 }))

  useEffect(() => {
    const id = setInterval(() => setStats({ ...statsRef.current }), POLL_MS)
    return () => clearInterval(id)
  }, [statsRef])

  return (
    <div
      style={{
        position: 'absolute', top: 10, insetInlineEnd: 10, zIndex: 10,
        padding: '8px 10px', borderRadius: 8, background: 'rgba(10,11,14,0.75)',
        border: '1px solid var(--border)', color: '#cfd3dc', fontSize: 11.5,
        fontFamily: 'ui-monospace, monospace', lineHeight: 1.6, pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 700, color: '#fff', marginBottom: 2 }}>Solver</div>
      <div>substeps: {stats.substeps} (4-12)</div>
      <div>step cost (EMA): {stats.emaMs.toFixed(2)}ms</div>
      <div>step cost (last): {stats.lastCostMs.toFixed(2)}ms</div>
    </div>
  )
}
