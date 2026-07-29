import { useState } from 'react'
import { OrbitControls, Environment } from '@react-three/drei'
import BodyAvatar from '../body/BodyAvatar'
import StaticPiecesDebug from '../cloth/StaticPiecesDebug'
import WeldDebugView from '../cloth/WeldDebugView'
import ClothMesh from '../cloth/ClothMesh'
import SeamEditorScene from '../seam/SeamEditorScene'
import PostFX from './PostFX'

// The actual <Canvas> contents: lighting, ground, avatar, orbit camera.
export default function Scene({ dims, debugView, fabricId, garment, seamEditor, avatarGLBUrl, statsRef }) {
  // Disabled while grabbing a cloth particle — otherwise dragging the mouse
  // to move the pin also orbits the camera at the same time, fighting itself.
  const [dragging, setDragging] = useState(false)

  return (
    <>
      <color attach="background" args={['#14151a']} />
      <hemisphereLight args={['#8899bb', '#111114', 0.55]} />
      <directionalLight position={[2, 4, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />
      {/* Real CC0 studio-softbox HDRI (bundled locally, see public/env/README.md)
          for ambient reflection/sheen quality on fabric and skin — deliberately
          a local file rather than drei's preset= (which fetches from a
          third-party GitHub-raw proxy with no SLA) so this has zero live
          network dependency during a demo. Doesn't touch the scene background
          (set above) — reflections/lighting only. */}
      <Environment files={`${import.meta.env.BASE_URL}env/studio_small_08_1k.hdr`} background={false} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#20222b" roughness={1} />
      </mesh>

      {debugView !== 'seams' && <BodyAvatar dims={dims} url={avatarGLBUrl} />}
      {debugView === 'pieces' && <StaticPiecesDebug dims={dims} pieces={garment?.pieces} seams={garment?.seams} />}
      {debugView === 'weld' && <WeldDebugView dims={dims} pieces={garment?.pieces} seams={garment?.seams} />}
      {debugView === 'cloth' && (
        <ClothMesh dims={dims} fabricId={fabricId} onDragStateChange={setDragging} pieces={garment?.pieces} seams={garment?.seams} statsRef={statsRef} />
      )}
      {debugView === 'seams' && <SeamEditorScene editor={seamEditor} />}

      <OrbitControls
        target={[0, dims.H * 0.55, 0]} minDistance={0.6} maxDistance={4}
        enableDamping dampingFactor={0.1} enabled={!dragging}
      />
      <PostFX />
    </>
  )
}
