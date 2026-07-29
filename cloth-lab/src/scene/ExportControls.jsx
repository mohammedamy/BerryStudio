import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { exportGLB, exportOBJ, exportUSDZ } from '../export/exporters'
import { exportTurntablePNGs, recordTurntableVideo } from '../export/exportTurntable'

// WP-9.5: a logic-only Scene child (same pattern as AdaptiveDpr) that
// captures {gl, scene, camera} via useThree() and publishes bound export
// functions onto `exportRef.current` — ExportPanel.jsx (rendered in the
// sidebar, outside the Canvas/r3f tree) calls them on button click. Same
// sibling-hand-off-via-ref shape as meshFitRigRef/statsRef elsewhere in
// this app, for the same reason: the exporter needs live r3f state that
// only exists inside the Canvas.
export default function ExportControls({ exportRef, turntableGroupRef }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    if (!exportRef) return
    exportRef.current = {
      exportGLB: () => exportGLB(scene),
      exportOBJ: () => exportOBJ(scene),
      exportUSDZ: () => exportUSDZ(scene),
      exportTurntablePNGs: () => turntableGroupRef.current && exportTurntablePNGs(gl, scene, camera, turntableGroupRef.current),
      recordTurntableVideo: () => turntableGroupRef.current && recordTurntableVideo(gl, turntableGroupRef.current),
    }
    return () => { if (exportRef) exportRef.current = null }
  }, [exportRef, turntableGroupRef, gl, scene, camera])

  return null
}
