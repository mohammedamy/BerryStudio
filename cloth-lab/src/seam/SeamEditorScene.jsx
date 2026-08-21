import { useLayoutEffect, useMemo, useRef } from 'react'
import { Line } from '@react-three/drei'
import { Color, Object3D } from 'three'

const cm = (v) => v * 0.01
const LAYOUT_Y = 1.25 // world height to lay pieces out at (roughly chest level, arbitrary — this view never touches the avatar)
const GAP = 0.15
const VERTEX_R = 0.022 // generous click target — these represent point INDICES, not real-world scale, so err large
const PENDING_SCALE = 1.6

const COLOR_DEFAULT = '#8892a6'
const COLOR_ASSIGNED = '#3ddc84'
const COLOR_PENDING = '#ffcc33'
const COLOR_OUTLINE = '#4a5568'

const dummy = new Object3D()
const dummyColor = new Color()

// One piece's clickable outline vertices, as a SINGLE instanced mesh rather
// than one <mesh> per point. Fixed BerryStudio-Upgrade-Plan bug report: a
// real (non-demo) garment's outlines are bezier-sampled — see
// js/canvas.js's cubicBezierSample()/js/pattern-import.js's sampleCubic(),
// n≈6 per curve span — so a multi-piece garment with a few curved edges
// each easily reaches a few hundred outline points combined. The previous
// per-vertex <mesh> (its own sphereGeometry + meshBasicMaterial + 3 event
// handlers) turned that into a few hundred separate WebGL draw calls just
// to show clickable dots, on top of drei's <Line> already rebuilding its
// own geometry buffer from a brand-new points array every render. That's
// exactly the kind of per-frame cost AdaptiveDpr.jsx's FrameBudgetController
// is watching — heavy enough on modest hardware to push measured frame
// time back and forth across its 1.15x/0.75x thresholds, so the resolution
// it drives (`setDpr`) oscillates visibly (the reported "flicker"), and in
// the worst case the sheer draw-call/GC load stalls the tab hard enough to
// read as a crash. A single instancedMesh collapses all of a piece's
// vertices into ONE draw call, with per-instance position/color/scale set
// imperatively (no React reconciliation, no new geometry per point) and a
// single onClick resolved via the THREE.js-native `event.instanceId`.
function PieceVertices({ draft, offsetX, pieceIdx, pendingStart, pendingEdges, assigned, onVertexClick }) {
  const meshRef = useRef(null)
  const count = draft.outline.length

  const positions = useMemo(
    () => draft.outline.map(([x, y]) => [offsetX + cm(x), LAYOUT_Y - cm(y), 0]),
    [draft.outline, offsetX]
  )

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    for (let i = 0; i < count; i++) {
      const isPending = pendingStart?.pieceIdx === pieceIdx && pendingStart?.vertIdx === i
      const isInPendingEdge = pendingEdges.some((pe) => pe.pieceIdx === pieceIdx && (i === pe.from || i === pe.to))
      const isAssigned = assigned.has(i)
      const color = isPending ? COLOR_PENDING : isAssigned || isInPendingEdge ? COLOR_ASSIGNED : COLOR_DEFAULT
      const [x, y, z] = positions[i]
      dummy.position.set(x, y, z)
      dummy.scale.setScalar(isPending ? PENDING_SCALE : 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, dummyColor.set(color))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  if (count === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[null, null, count]}
      onClick={(e) => { e.stopPropagation(); onVertexClick(pieceIdx, e.instanceId) }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'auto' }}
    >
      <sphereGeometry args={[VERTEX_R, 12, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

// Renders every draft piece laid out flat and spread apart, facing the
// camera, each vertex individually clickable — the "directly in the 3D
// view" seam-authoring surface. Deliberately NOT placed on the avatar body:
// authoring an edge/seam pairing only needs to see each piece's own outline
// clearly, not its eventual 3D-draped position (that's what the Simulate
// button hands off to the existing placement/assemble pipeline for).
export default function SeamEditorScene({ editor }) {
  const { drafts, pendingStart, pendingEdges, assignedByPiece, handleVertexClick } = editor

  const layout = useMemo(() => {
    let cursor = 0
    const entries = drafts.map((draft) => {
      const xs = draft.outline.map((p) => p[0])
      const minX = Math.min(...xs), maxX = Math.max(...xs)
      const width = cm(maxX - minX)
      const offsetX = cursor - cm(minX)
      cursor += width + GAP
      return { draft, offsetX }
    })
    const totalWidth = cursor - GAP
    return entries.map((e) => ({ ...e, offsetX: e.offsetX - totalWidth / 2 }))
  }, [drafts])

  return (
    <group name="seam-editor">
      {layout.map(({ draft, offsetX }, pieceIdx) => {
        const linePoints = draft.outline.map(([x, y]) => [offsetX + cm(x), LAYOUT_Y - cm(y), 0])
        return (
          <group key={draft.id}>
            <Line points={[...linePoints, linePoints[0]]} color={COLOR_OUTLINE} lineWidth={1.5} />
            <PieceVertices
              draft={draft}
              offsetX={offsetX}
              pieceIdx={pieceIdx}
              pendingStart={pendingStart}
              pendingEdges={pendingEdges}
              assigned={assignedByPiece[pieceIdx]}
              onVertexClick={handleVertexClick}
            />
          </group>
        )
      })}
    </group>
  )
}
