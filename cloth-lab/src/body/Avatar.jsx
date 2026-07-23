import { useMemo } from 'react'
import * as THREE from 'three'
import { torsoProfile } from './computeBodyDims'

// A simplified but proportionally-faithful port of the production app's
// procedural avatar (js/three-view.js buildProcedural): same lathed-torso +
// capsule-limb technique, driven by the same computeBodyDims() output.
// Facial detail (eyes/brows/hair) is intentionally left out for this MVP —
// the focus of this phase is the cloth simulation, not avatar cosmetics.
export default function Avatar({ dims, skinColor = '#e3b08c' }) {
  const { H, headH, neckTopY, shoulderY, hipY, span, neckR, shoulderHalf, chestR, hipR, armLen, upperR, legLen, thighR, female } = dims

  const torsoPts = useMemo(
    () => torsoProfile(dims).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)),
    [dims],
  )

  const mat = <meshStandardMaterial color={skinColor} roughness={0.75} />

  return (
    <group name="avatar">
      <mesh castShadow receiveShadow scale={[1, 1, female ? 0.72 : 0.78]}>
        <latheGeometry args={[torsoPts, 32]} />
        {mat}
      </mesh>

      <mesh castShadow position={[0, (neckTopY + shoulderY) / 2, 0]}>
        <capsuleGeometry args={[neckR, headH * 0.35, 6, 16]} />
        {mat}
      </mesh>

      <mesh castShadow position={[0, neckTopY + headH * 0.5, 0]} scale={[0.82, 1.02, 0.9]}>
        <sphereGeometry args={[headH * 0.5, 24, 18]} />
        {mat}
      </mesh>

      {[-1, 1].map((s) => (
        <mesh key={`shoulder${s}`} castShadow scale={[1, 0.8, 0.9]} position={[s * shoulderHalf * 0.9, shoulderY - span * 0.04, 0]}>
          <sphereGeometry args={[chestR * 0.3, 24, 18]} />
          {mat}
        </mesh>
      ))}

      {[-1, 1].map((s) => (
        <group key={`arm${s}`} position={[s * shoulderHalf * 0.95, shoulderY - span * 0.04, 0]} rotation={[0, 0, s * 0.08]}>
          <mesh castShadow position={[0, -armLen * 0.26, 0]}>
            <capsuleGeometry args={[upperR, armLen * 0.42, 6, 16]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, -armLen * 0.66, 0]}>
            <capsuleGeometry args={[upperR * 0.72, armLen * 0.4, 6, 16]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, -armLen * 0.92, 0]} scale={[1, 1, 0.6]}>
            <capsuleGeometry args={[upperR * 0.6, armLen * 0.12, 6, 16]} />
            {mat}
          </mesh>
        </group>
      ))}

      {[-1, 1].map((s) => (
        <group key={`leg${s}`} position={[s * hipR * 0.5, hipY - span * 0.05, 0]}>
          <mesh castShadow position={[0, -legLen * 0.24, 0]}>
            <capsuleGeometry args={[thighR, legLen * 0.4, 6, 16]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, -legLen * 0.66, 0]}>
            <capsuleGeometry args={[thighR * 0.62, legLen * 0.4, 6, 16]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, -legLen * 0.97, legLen * 0.06]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1.3, 1]}>
            <capsuleGeometry args={[thighR * 0.5, legLen * 0.12, 6, 16]} />
            {mat}
          </mesh>
        </group>
      ))}
    </group>
  )
}
