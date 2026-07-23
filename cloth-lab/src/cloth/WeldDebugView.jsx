import { useMemo } from 'react'
import * as THREE from 'three'
import { TSHIRT_PIECES, TSHIRT_SEAMS } from '../pattern/tshirt'
import { triangulateAll } from '../pattern/triangulate'
import { assembleCloth } from './assemble'

// 1 = interior / free boundary (never unioned with anything — neckline, hem,
// cuffs, and true mesh-interior points all land here), 2 = ordinary 2-piece
// seam, 3+ = a true multi-piece corner (shoulder/cap-top, underarm).
const INTERIOR_COLOR = [0.30, 0.33, 0.40]
const SEAM_COLOR = [0.20, 0.85, 0.45]
const CORNER_COLOR = [0.95, 0.25, 0.20]

// Build-order step 5: color every render vertex by weld degree so a bad
// `reverse` flag or a missed seam pairing shows up as a wrong color right
// here, instead of surfacing as an unexplained tear once physics is running.
export default function WeldDebugView({ dims }) {
  const geometry = useMemo(() => {
    const triangulated = triangulateAll(TSHIRT_PIECES, TSHIRT_SEAMS, 2)
    const cloth = assembleCloth(triangulated, dims, TSHIRT_SEAMS)

    const positions = new Float32Array(cloth.renderVertexCount * 3)
    const colors = new Float32Array(cloth.renderVertexCount * 3)
    let cornerCount = 0
    let maxDegree = 0
    for (let i = 0; i < cloth.renderVertexCount; i++) {
      const sp = cloth.renderVertexToSimParticle[i]
      positions[i * 3] = cloth.simRestPositions[sp * 3]
      positions[i * 3 + 1] = cloth.simRestPositions[sp * 3 + 1]
      positions[i * 3 + 2] = cloth.simRestPositions[sp * 3 + 2]

      const deg = cloth.weldDegree[i]
      maxDegree = Math.max(maxDegree, deg)
      const rgb = deg >= 3 ? CORNER_COLOR : deg === 2 ? SEAM_COLOR : INTERIOR_COLOR
      if (deg >= 3) cornerCount++
      colors[i * 3] = rgb[0]
      colors[i * 3 + 1] = rgb[1]
      colors[i * 3 + 2] = rgb[2]
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geom.setIndex(new THREE.BufferAttribute(cloth.renderTriangles, 1))
    geom.computeVertexNormals()

    // eslint-disable-next-line no-console
    console.log(
      `[WeldDebugView] ${cloth.simParticleCount} sim particles from ${cloth.renderVertexCount} render verts` +
      ` — max weld degree ${maxDegree}, ${cornerCount} corner render-verts (degree ≥3)`,
    )

    return geom
  }, [dims])

  return (
    <group name="weld-debug">
      <mesh geometry={geometry}>
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh geometry={geometry} renderOrder={1}>
        <meshBasicMaterial color="#05060a" wireframe transparent opacity={0.3} depthTest={false} />
      </mesh>
    </group>
  )
}
