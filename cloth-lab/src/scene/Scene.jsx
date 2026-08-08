import { useRef, useState } from 'react'
import { OrbitControls, Environment } from '@react-three/drei'
import BodyAvatar from '../body/BodyAvatar'
import { resolveSkinToneHex } from '../body/skinTones'
import StaticPiecesDebug from '../cloth/StaticPiecesDebug'
import WeldDebugView from '../cloth/WeldDebugView'
import ClothMesh from '../cloth/ClothMesh'
import SeamEditorScene from '../seam/SeamEditorScene'
import PostFX from './PostFX'
import AdaptiveDpr from './AdaptiveDpr'
import ExportControls from './ExportControls'
import { getAssetBase } from '../assetBase'

// The actual <Canvas> contents: lighting, ground, avatar, orbit camera.
export default function Scene({ dims, lang = 'en', debugView, fabricId, qualityTier, skinToneId, poseId, garment, seamEditor, avatarGLBUrl, statsRef, exportRef, onPoseWarning }) {
  // Disabled while grabbing a cloth particle — otherwise dragging the mouse
  // to move the pin also orbits the camera at the same time, fighting itself.
  const [dragging, setDragging] = useState(false)
  // WP-8.3: written by BodyAvatar/GLBAvatar (tier 3 of its fallback, a
  // real loaded+reposed GLB) during render, read by ClothMesh's own effect
  // afterward — see BodyAvatar.jsx's header comment for the full flow.
  // Siblings, not parent/child, so this ref is the hand-off point.
  const meshFitRigRef = useRef(null)
  // WP-9.5: the turntable exporters rotate THIS group, not the camera —
  // simpler than animating OrbitControls' azimuth and gives the same
  // visual result (subject spins in place) without fighting user-driven
  // orbit input mid-capture.
  const turntableGroupRef = useRef(null)

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
      <Environment files={`${getAssetBase()}env/studio_small_08_1k.hdr`} background={false} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#20222b" roughness={1} />
      </mesh>

      <group ref={turntableGroupRef}>
        {debugView !== 'seams' && (
          <BodyAvatar dims={dims} lang={lang} url={avatarGLBUrl} collisionRigRef={meshFitRigRef} skinColor={resolveSkinToneHex(skinToneId)} pose={poseId} onPoseWarning={onPoseWarning} />
        )}
        {debugView === 'pieces' && <StaticPiecesDebug dims={dims} pieces={garment?.pieces} seams={garment?.seams} />}
        {debugView === 'weld' && <WeldDebugView dims={dims} pieces={garment?.pieces} seams={garment?.seams} />}
        {debugView === 'cloth' && (
          <ClothMesh dims={dims} fabricId={fabricId} qualityTier={qualityTier} onDragStateChange={setDragging} pieces={garment?.pieces} seams={garment?.seams} statsRef={statsRef} meshFitRigRef={meshFitRigRef} />
        )}
        {debugView === 'seams' && <SeamEditorScene editor={seamEditor} />}
      </group>

      <OrbitControls
        target={[0, dims.H * 0.55, 0]} minDistance={0.6} maxDistance={4}
        enableDamping dampingFactor={0.1} enabled={!dragging}
      />
      <PostFX />
      <AdaptiveDpr />
      {exportRef && <ExportControls exportRef={exportRef} turntableGroupRef={turntableGroupRef} />}
    </>
  )
}
