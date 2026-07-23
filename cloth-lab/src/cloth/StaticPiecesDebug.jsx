import { useMemo } from 'react'
import * as THREE from 'three'
import { TSHIRT_PIECES, TSHIRT_SEAMS } from '../pattern/tshirt'
import { triangulateAll } from '../pattern/triangulate'
import { placePiece } from '../pattern/placement'

const PIECE_COLORS = { front: '#6d5efc', back: '#00c2a8', sleeveR: '#ff5d8f', sleeveL: '#e2a52b' }

// Build-order steps 3-4: render every piece in its initial placed position
// with ZERO physics running, so placement/winding/triangulation bugs are
// caught before motion is even involved.
export default function StaticPiecesDebug({ dims }) {
  const pieces = useMemo(() => {
    const triangulated = triangulateAll(TSHIRT_PIECES, TSHIRT_SEAMS, 2)
    return triangulated.map((tp) => {
      const positions3D = placePiece(tp, dims)
      const geometry = new THREE.BufferGeometry()
      const posArray = new Float32Array(positions3D.length * 3)
      positions3D.forEach(([x, y, z], i) => { posArray[i * 3] = x; posArray[i * 3 + 1] = y; posArray[i * 3 + 2] = z })
      geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
      geometry.setIndex(new THREE.BufferAttribute(tp.triangles, 1))
      geometry.computeVertexNormals()
      return { id: tp.pieceId, geometry }
    })
  }, [dims])

  return (
    <group name="static-pieces-debug">
      {pieces.map((p) => (
        <mesh key={p.id} geometry={p.geometry}>
          <meshStandardMaterial color={PIECE_COLORS[p.id] || '#888'} side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}
