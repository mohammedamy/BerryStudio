import { OrbitControls } from '@react-three/drei'
import Avatar from '../body/Avatar'
import StaticPiecesDebug from '../cloth/StaticPiecesDebug'
import WeldDebugView from '../cloth/WeldDebugView'
import ClothMesh from '../cloth/ClothMesh'

// The actual <Canvas> contents: lighting, ground, avatar, orbit camera.
export default function Scene({ dims, debugView, fabricId }) {
  return (
    <>
      <color attach="background" args={['#14151a']} />
      <hemisphereLight args={['#8899bb', '#111114', 0.55]} />
      <directionalLight position={[2, 4, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#20222b" roughness={1} />
      </mesh>

      <Avatar dims={dims} />
      {debugView === 'pieces' && <StaticPiecesDebug dims={dims} />}
      {debugView === 'weld' && <WeldDebugView dims={dims} />}
      {debugView === 'cloth' && <ClothMesh dims={dims} fabricId={fabricId} />}

      <OrbitControls target={[0, dims.H * 0.55, 0]} minDistance={0.6} maxDistance={4} enableDamping dampingFactor={0.1} />
    </>
  )
}
