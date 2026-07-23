import { useMemo } from 'react'
import { Line } from '@react-three/drei'

const cm = (v) => v * 0.01
const LAYOUT_Y = 1.25 // world height to lay pieces out at (roughly chest level, arbitrary — this view never touches the avatar)
const GAP = 0.15
const VERTEX_R = 0.022 // generous click target — these represent point INDICES, not real-world scale, so err large

const COLOR_DEFAULT = '#8892a6'
const COLOR_ASSIGNED = '#3ddc84'
const COLOR_PENDING = '#ffcc33'
const COLOR_OUTLINE = '#4a5568'

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
        const assigned = assignedByPiece[pieceIdx]
        return (
          <group key={draft.id}>
            <Line points={[...linePoints, linePoints[0]]} color={COLOR_OUTLINE} lineWidth={1.5} />
            {draft.outline.map(([x, y], vertIdx) => {
              const isPending = pendingStart?.pieceIdx === pieceIdx && pendingStart?.vertIdx === vertIdx
              const isInPendingEdge = pendingEdges.some((pe) => pe.pieceIdx === pieceIdx && (vertIdx === pe.from || vertIdx === pe.to))
              const isAssigned = assigned.has(vertIdx)
              const color = isPending ? COLOR_PENDING : (isAssigned || isInPendingEdge) ? COLOR_ASSIGNED : COLOR_DEFAULT
              return (
                <mesh
                  key={vertIdx}
                  position={[offsetX + cm(x), LAYOUT_Y - cm(y), 0]}
                  onClick={(e) => { e.stopPropagation(); handleVertexClick(pieceIdx, vertIdx) }}
                  onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
                  onPointerOut={() => { document.body.style.cursor = 'auto' }}
                >
                  <sphereGeometry args={[isPending ? VERTEX_R * 1.6 : VERTEX_R, 12, 8]} />
                  <meshBasicMaterial color={color} toneMapped={false} />
                </mesh>
              )
            })}
          </group>
        )
      })}
    </group>
  )
}
