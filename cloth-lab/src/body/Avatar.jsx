import { useMemo } from 'react'
import * as THREE from 'three'
import { torsoProfile, armProfile, legProfile } from './computeBodyDims'

// A simplified but proportionally-faithful port of the production app's
// procedural avatar (js/three-view.js buildProcedural): lathed-torso +
// lathed-limb technique, driven by the same computeBodyDims() output.
// Limbs used to be 3 stacked capsules plus a ball-joint sphere at the
// shoulder — cheap, but that construction is literally how an artist's
// wooden posing mannequin is built, and it reads that way. A single
// continuously-tapered lathe mesh per limb (same revolve-a-curve technique
// the torso already used) removes every joint seam that made it look like
// segmented toy parts. Facial detail (eyes/brows/hair) is still
// intentionally left out — full facial geometry is a much larger, riskier
// effort than "stop reading as a mannequin," which is what this addresses.
export default function Avatar({ dims, skinColor = '#e3b08c' }) {
  const { headH, neckTopY, shoulderY, hipY, span, neckR, shoulderHalf, hipR, legLen, thighR, female } = dims

  const torsoPts = useMemo(
    () => torsoProfile(dims).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)),
    [dims],
  )
  const armPts = useMemo(
    () => armProfile(dims).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)),
    [dims],
  )
  const legPts = useMemo(
    () => legProfile(dims).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)),
    [dims],
  )

  // MeshPhysicalMaterial (not Standard) for the same reason ClothMesh
  // switched this session: a touch of clearcoat gives skin a soft sheen
  // instead of flat-matte plastic, without the material reading as glossy —
  // clearcoatRoughness stays high so the highlight layer is diffuse, not a
  // sharp specular dot.
  const mat = <meshPhysicalMaterial color={skinColor} roughness={0.62} clearcoat={0.12} clearcoatRoughness={0.6} />

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
        <mesh
          key={`arm${s}`} castShadow
          position={[s * shoulderHalf * 0.95, shoulderY - span * 0.04, 0]}
          rotation={[0, 0, s * 0.08]}
        >
          <latheGeometry args={[armPts, 16]} />
          {mat}
        </mesh>
      ))}

      {[-1, 1].map((s) => (
        <group key={`leg${s}`} position={[s * hipR * 0.5, hipY - span * 0.05, 0]}>
          <mesh castShadow>
            <latheGeometry args={[legPts, 16]} />
            {mat}
          </mesh>
          <mesh
            castShadow position={[0, -legLen * 0.92, legLen * 0.06]}
            rotation={[Math.PI / 2, 0, 0]} scale={[1, 1.3, 1]}
          >
            <capsuleGeometry args={[thighR * 0.42, legLen * 0.1, 6, 16]} />
            {mat}
          </mesh>
        </group>
      ))}
    </group>
  )
}
