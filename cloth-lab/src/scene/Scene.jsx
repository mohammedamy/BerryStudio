import { useState } from 'react'
import * as THREE from 'three'
import { OrbitControls, Environment } from '@react-three/drei'
import Avatar from '../body/Avatar'
import StaticPiecesDebug from '../cloth/StaticPiecesDebug'
import WeldDebugView from '../cloth/WeldDebugView'
import ClothMesh from '../cloth/ClothMesh'
import SeamEditorScene from '../seam/SeamEditorScene'

// The actual <Canvas> contents: lighting, ground, avatar, orbit camera.
export default function Scene({ dims, debugView, fabricId, garment, seamEditor }) {
  // Disabled while grabbing a cloth particle — otherwise dragging the mouse
  // to move the pin also orbits the camera at the same time, fighting itself.
  const [dragging, setDragging] = useState(false)

  return (
    <>
      <color attach="background" args={['#14151a']} />
      <hemisphereLight args={['#8899bb', '#111114', 0.55]} />
      <directionalLight position={[2, 4, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />
      {/* Procedural (no network fetch) environment — baked from a few soft
          emissive panels, purely for ambient reflection/sheen quality on
          fabric and skin; doesn't touch the scene background (set above). */}
      <Environment resolution={128} background={false}>
        <mesh position={[0, 2, 3]} scale={[4, 3, 1]}>
          <planeGeometry />
          <meshBasicMaterial color="#cfd6e6" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[-3, 1.5, -2]} rotation={[0, Math.PI * 0.4, 0]} scale={[3, 2.5, 1]}>
          <planeGeometry />
          <meshBasicMaterial color="#8a93b8" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[3, 0.5, -1]} rotation={[0, -Math.PI * 0.35, 0]} scale={[2.5, 2, 1]}>
          <planeGeometry />
          <meshBasicMaterial color="#3a3d4a" side={THREE.DoubleSide} />
        </mesh>
      </Environment>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#20222b" roughness={1} />
      </mesh>

      {debugView !== 'seams' && <Avatar dims={dims} />}
      {debugView === 'pieces' && <StaticPiecesDebug dims={dims} pieces={garment?.pieces} seams={garment?.seams} />}
      {debugView === 'weld' && <WeldDebugView dims={dims} pieces={garment?.pieces} seams={garment?.seams} />}
      {debugView === 'cloth' && (
        <ClothMesh dims={dims} fabricId={fabricId} onDragStateChange={setDragging} pieces={garment?.pieces} seams={garment?.seams} />
      )}
      {debugView === 'seams' && <SeamEditorScene editor={seamEditor} />}

      <OrbitControls
        target={[0, dims.H * 0.55, 0]} minDistance={0.6} maxDistance={4}
        enableDamping dampingFactor={0.1} enabled={!dragging}
      />
    </>
  )
}
