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
// WP-8.5: static geometry/rotation pose variants. Arm/leg lathe meshes are
// built with their pivot (y=0 in armProfile/legProfile) at the shoulder/hip
// attach point (see those functions' own header comment), so an arm's whole
// pose is just that one mesh's `rotation` — no separate joints to drive.
// `standing` reproduces this component's exact pre-WP-8.5 angles unchanged.
const ARM_ANGLE = { standing: 0.08, apose: 0.45, tpose: Math.PI / 2 - 0.04, contrapposto: 0.08, seated: 0.08 }
// Seated is the one pose that isn't a pure rotation: sitting bends the knee,
// which a single hip-to-ankle lathe can't represent by rotating alone (that
// would just tilt a straight leg). Only this pose splits the leg into a
// thigh + calf pair with its own knee pivot — see buildSeatedLeg() below —
// instead of adding partial skeletal machinery for every pose.
export default function Avatar({ dims, skinColor = '#e3b08c', pose = 'standing' }) {
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
  // Split legProfile's single hip->ankle taper at its knee-ish midpoint
  // (index 3, -legLen*0.50 — see legProfile's own point list) into two
  // segments, each re-based so its own start sits at local y=0 the same way
  // the un-split profile does, so the same rotate-around-shoulder/hip-pivot
  // technique applies to both halves independently.
  const seatedLegPts = useMemo(() => {
    if (pose !== 'seated') return null
    const raw = legProfile(dims)
    const thigh = raw.slice(0, 4).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y))
    const kneeY = raw[3][1]
    const calf = raw.slice(3).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y - kneeY))
    return { thigh, calf, thighLen: -kneeY, calfLen: -(raw[raw.length - 1][1] - kneeY) }
  }, [dims, pose])
  const armAngle = ARM_ANGLE[pose] ?? ARM_ANGLE.standing

  // MeshPhysicalMaterial (not Standard) for the same reason ClothMesh
  // switched this session: a touch of clearcoat gives skin a soft sheen
  // instead of flat-matte plastic, without the material reading as glossy —
  // clearcoatRoughness stays high so the highlight layer is diffuse, not a
  // sharp specular dot.
  const mat = <meshPhysicalMaterial color={skinColor} roughness={0.62} clearcoat={0.12} clearcoatRoughness={0.6} />

  // Contrapposto: a weight-shifted stance — one hip/leg (arbitrarily s===1,
  // "left" by three.js's own +X convention) carries the weight and stays
  // near-standing, the other relaxes outward, with a small counter-tilt on
  // the torso to sell the shift. A simplified read of the pose (no bent
  // knee on the relaxed leg — that combination is what `seated` is for),
  // not an anatomical claim.
  const isContrapposto = pose === 'contrapposto'
  const torsoTilt = isContrapposto ? 0.05 : 0

  return (
    <group name="avatar">
      <mesh castShadow receiveShadow scale={[1, 1, female ? 0.72 : 0.78]} rotation={[0, 0, torsoTilt]}>
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
          rotation={[0, 0, s * (isContrapposto && s === 1 ? armAngle * 2.5 : armAngle)]}
        >
          <latheGeometry args={[armPts, 16]} />
          {mat}
        </mesh>
      ))}

      {[-1, 1].map((s) => {
        const relaxed = isContrapposto && s === 1
        if (pose === 'seated' && seatedLegPts) {
          return (
            <group key={`leg${s}`} position={[s * hipR * 0.5, hipY - span * 0.05, 0]}>
              {/* Thigh: rotated from hanging-down to horizontal-forward. */}
              <group rotation={[-Math.PI / 2, 0, 0]}>
                <mesh castShadow>
                  <latheGeometry args={[seatedLegPts.thigh, 16]} />
                  {mat}
                </mesh>
                {/* Calf: pivots at the knee, rotated back down relative to
                    the (already-rotated) thigh parent so it points toward
                    the floor in world space, same as a bent knee. */}
                <group position={[0, -seatedLegPts.thighLen, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <mesh castShadow>
                    <latheGeometry args={[seatedLegPts.calf, 16]} />
                    {mat}
                  </mesh>
                  <mesh
                    castShadow position={[0, -seatedLegPts.calfLen * 0.92, seatedLegPts.calfLen * 0.06]}
                    rotation={[Math.PI / 2, 0, 0]} scale={[1, 1.3, 1]}
                  >
                    <capsuleGeometry args={[thighR * 0.42, seatedLegPts.calfLen * 0.1, 6, 16]} />
                    {mat}
                  </mesh>
                </group>
              </group>
            </group>
          )
        }
        return (
          <group
            key={`leg${s}`}
            position={[s * hipR * 0.5 + (relaxed ? s * hipR * 0.15 : 0), hipY - span * 0.05, 0]}
            rotation={[0, 0, relaxed ? s * 0.1 : 0]}
          >
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
        )
      })}
    </group>
  )
}
