import { useMemo } from 'react'
import * as THREE from 'three'
import { torsoProfile, armProfile, legProfile } from './computeBodyDims'
import { torsoZBump } from './torsoSculpt'

// A simplified but proportionally-faithful port of the production app's
// procedural avatar (js/three-view.js buildProcedural): lathed-torso +
// lathed-limb technique, driven by the same computeBodyDims() output.
// Limbs used to be 3 stacked capsules plus a ball-joint sphere at the
// shoulder — cheap, but that construction is literally how an artist's
// wooden posing mannequin is built, and it reads that way. A single
// continuously-tapered lathe mesh per limb (same revolve-a-curve technique
// the torso already used) removes every joint seam that made it look like
// segmented toy parts.
//
// Redesigned for a materially more human look — user-requested, not a
// tuning pass: bust (female adults) and deltoid shoulder volume, real
// hands (palm + 4 fingers + thumb, not a flattened capsule blob) and real
// feet (heel/arch/toe, not the same blob rotated 90°), a jaw taper on the
// head, and a from-scratch face (eyes, brows, nose, lips, ears) + category
// hair — all a straight port of js/three-view.js's own addFace()/addHair()/
// bust/deltoid code (that file had already built this for the root app's
// 3D Preview; this file's own header used to say "facial detail is still
// intentionally left out", which was true only of THIS file, not the
// sibling implementation it's a port of). Ported here as JSX rather than
// copied verbatim — same geometry/positions, expressed the way this file's
// existing torso/limb meshes already are.
//
// A second pass, still user-requested: the female torso itself now has a
// real breast and lower-back curve sculpted into its own mesh, not just
// two spheres glued onto an otherwise front/back-symmetric lathe shell —
// see torsoSculpt.js's own header for why a lathe alone can't express that
// asymmetry and how this displaces its vertices to get it anyway. The old
// glued-on bust spheres are gone; the torso surface itself now carries
// that volume, blended smoothly into the surrounding ribcage/waist curve
// instead of reading as two balls stuck onto a flat chest.
// WP-8.5: static geometry/rotation pose variants. Arm/leg lathe meshes are
// built with their pivot (y=0 in armProfile/legProfile) at the shoulder/hip
// attach point (see those functions' own header comment), so an arm's whole
// pose is just that one mesh's `rotation` — no separate joints to drive.
// `standing` reproduces this component's exact pre-WP-8.5 angles unchanged.
const ARM_ANGLE = { standing: 0.08, apose: 0.45, tpose: Math.PI / 2 - 0.04, contrapposto: 0.08, seated: 0.08 }

// Same per-category palette js/three-view.js's own HAIR table uses —
// deliberately independent of the user-selected skin tone (skinTones.js's
// own header already scopes hair color out of that picker).
const HAIR_COLOR = { women: '#2a1c14', men: '#241a12', girls: '#3a2416', boys: '#2c1e14' }

// dims only carries the two booleans (female/kid) this file already keyed
// its pose logic off of, not the 4-way category string HAIR_COLOR and
// addHair()'s own style branching need — recovered here rather than
// threading a new prop through BodyAvatar/Scene, since female+kid already
// determine it uniquely.
function categoryOf(female, kid) {
  if (female) return kid ? 'girls' : 'women'
  return kid ? 'boys' : 'men'
}

// One hand: a flattened palm capsule + 4 fingers (the middle two slightly
// longer, matching real proportions) + an angled thumb — replacing the
// single flattened capsule blob this used to end each arm in. `r` is the
// wrist radius (armProfile's own last-point radius, upperR*0.32) everything
// else scales from, so a hand stays proportional to whatever arm it's on.
function Hand({ r, mat }) {
  const fingerR = r * 0.34
  const fingerLen = r * 3.4
  const palmLen = r * 1.7
  return (
    <group position={[0, -palmLen * 0.3, 0]}>
      <mesh castShadow position={[0, -palmLen * 0.4, 0]} scale={[1.3, 1, 0.6]}>
        <capsuleGeometry args={[r * 0.92, palmLen * 0.35, 4, 10]} />
        {mat}
      </mesh>
      {[-1.7, -0.6, 0.6, 1.7].map((fx, i) => (
        <mesh
          key={fx}
          castShadow
          position={[fx * fingerR * 1.85, -palmLen * 0.75 - fingerLen * (i === 1 || i === 2 ? 0.34 : 0.28), 0]}
          rotation={[0, 0, fx * 0.04]}
        >
          <capsuleGeometry args={[fingerR, fingerLen * (i === 1 || i === 2 ? 0.62 : 0.5), 4, 8]} />
          {mat}
        </mesh>
      ))}
      <mesh castShadow position={[r * 1.55, -palmLen * 0.15, r * 0.5]} rotation={[0.25, 0, -0.85]}>
        <capsuleGeometry args={[fingerR * 1.2, fingerLen * 0.4, 4, 8]} />
        {mat}
      </mesh>
    </group>
  )
}

// One foot: a main (heel-to-arch) mass, a rounded heel behind it, and a
// tapered toe cap in front — replacing the single capsule (rotated 90° and
// stretched) this used to end each leg in, which read as a blunt cylindrical
// stump rather than a foot. `r` is the ankle radius (legProfile's own
// last-point radius, thighR*0.38); `footLen` scales the whole foot, tied to
// thighR (not a fixed constant) so it stays proportional to the avatar's
// own build the same way every other feature here does.
function Foot({ r, footLen, mat }) {
  return (
    <group position={[0, -footLen * 0.1, footLen * 0.32]}>
      <mesh castShadow scale={[0.82, 0.46, 1.5]}>
        <sphereGeometry args={[r * 1.7, 14, 10]} />
        {mat}
      </mesh>
      <mesh castShadow position={[0, footLen * 0.02, -footLen * 0.42]} scale={[0.78, 0.5, 0.62]}>
        <sphereGeometry args={[r * 1.4, 10, 8]} />
        {mat}
      </mesh>
      <mesh castShadow position={[0, -footLen * 0.06, footLen * 0.4]} scale={[0.66, 0.36, 0.58]}>
        <sphereGeometry args={[r * 1.2, 10, 8]} />
        {mat}
      </mesh>
    </group>
  )
}

// Split legProfile's single hip->ankle taper at its knee-ish midpoint
// (index 3, -legLen*0.50 — see legProfile's own point list) into two
// segments, each re-based so its own start sits at local y=0 the same way
// the un-split profile does, so the same rotate-around-shoulder/hip-pivot
// technique applies to both halves independently.
// Same split index the seated pose has always used — legProfile has 3 more
// points now (the calf swell/knee pinch, see that function's own header)
// but the knee itself is still the profile's 5th entry (index 4), so this
// moves in step with it automatically.
export default function Avatar({ dims, skinColor = '#e3b08c', pose = 'standing' }) {
  const { headH, neckTopY, shoulderY, hipY, span, neckR, shoulderHalf, hipR, legLen, thighR, armLen, chestR, female, kid } = dims
  const category = categoryOf(female, kid)

  const torsoPts = useMemo(
    () => torsoProfile(dims).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)),
    [dims],
  )
  // Built imperatively (not `<latheGeometry>` JSX) because the front/back
  // breast + lower-back sculpt (torsoZBump) needs to displace individual
  // vertices after the lathe revolve — something a declarative geometry
  // element can't do. The Z flatten (scale.z on the old plain-lathe mesh)
  // is baked in here instead of left as a mesh-level `scale`, so the
  // sculpt's own Z deltas are added in real, already-flattened meters —
  // matching what torsoSculpt.js's femaleTorsoExtraRadius assumes when
  // sizing collisionRig.js's safety margin.
  const torsoGeometry = useMemo(() => {
    const geo = new THREE.LatheGeometry(torsoPts, 32)
    const zScale = female ? 0.72 : 0.78
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const zRaw = pos.getZ(i)
      let z = zRaw * zScale
      if (female && !kid) z += torsoZBump(y, Math.atan2(x, zRaw), dims)
      pos.setZ(i, z)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    return geo
  }, [torsoPts, female, kid, dims])
  const armPts = useMemo(
    () => armProfile(dims).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)),
    [dims],
  )
  const legPts = useMemo(
    () => legProfile(dims).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)),
    [dims],
  )
  const seatedLegPts = useMemo(() => {
    if (pose !== 'seated') return null
    const raw = legProfile(dims)
    const kneeIdx = 4
    const thigh = raw.slice(0, kneeIdx + 1).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y))
    const kneeY = raw[kneeIdx][1]
    const calf = raw.slice(kneeIdx).map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y - kneeY))
    return { thigh, calf, thighLen: -kneeY, calfLen: -(raw[raw.length - 1][1] - kneeY) }
  }, [dims, pose])
  const armAngle = ARM_ANGLE[pose] ?? ARM_ANGLE.standing

  // MeshPhysicalMaterial (not Standard) for the same reason ClothMesh
  // switched this session: a touch of clearcoat gives skin a soft sheen
  // instead of flat-matte plastic, without the material reading as glossy —
  // clearcoatRoughness stays high so the highlight layer is diffuse, not a
  // sharp specular dot.
  const mat = <meshPhysicalMaterial color={skinColor} roughness={0.62} clearcoat={0.12} clearcoatRoughness={0.6} />
  const hairColor = HAIR_COLOR[category]
  // MeshPhysicalMaterial, not Standard — `sheen` isn't a real property of
  // MeshStandardMaterial (three.js silently warns and ignores it there;
  // confirmed live in this session's own console). Physical is what every
  // other sheen-bearing material in this file already uses.
  const hairMat = <meshPhysicalMaterial color={hairColor} roughness={0.5} metalness={0.05} sheen={0.6} side={THREE.DoubleSide} />
  const eyeWhiteMat = <meshStandardMaterial color="#ffffff" roughness={0.25} />
  const irisMat = <meshStandardMaterial color="#3a2a1e" roughness={0.2} />
  const browMat = <meshStandardMaterial color={hairColor} roughness={0.7} />
  const lipMat = <meshPhysicalMaterial color={female ? '#b85b57' : '#a9685c'} roughness={0.45} sheen={0.4} />

  // Contrapposto: a weight-shifted stance — one hip/leg (arbitrarily s===1,
  // "left" by three.js's own +X convention) carries the weight and stays
  // near-standing, the other relaxes outward, with a small counter-tilt on
  // the torso to sell the shift. A simplified read of the pose (no bent
  // knee on the relaxed leg — that combination is what `seated` is for),
  // not an anatomical claim.
  const isContrapposto = pose === 'contrapposto'
  const torsoTilt = isContrapposto ? 0.05 : 0

  // Face feature scale, in the head's own local space (origin at head
  // center) — same layout js/three-view.js's addFace() uses.
  const ez = headH * 0.42, ey = headH * 0.06, ex = headH * 0.17
  // Reads back off the already-computed armPts/legPts (their own last
  // point IS the wrist/ankle radius) rather than calling armProfile()/
  // legProfile() a second time for the same value.
  const wristR = armPts[armPts.length - 1].x
  const ankleR = legPts[legPts.length - 1].x

  return (
    <group name="avatar">
      <mesh castShadow receiveShadow geometry={torsoGeometry} rotation={[0, 0, torsoTilt]}>
        {mat}
      </mesh>

      {/* Deltoid shoulder volume — port of js/three-view.js's own shoulder
          spheres; softens the hard seam a bare torso/arm join otherwise
          leaves right at the point a real shoulder is roundest. */}
      {[-1, 1].map((s) => (
        <mesh
          key={`deltoid${s}`} castShadow
          scale={[1, 0.8, 0.9]}
          position={[s * shoulderHalf * 0.9, shoulderY - span * 0.04, 0]}
        >
          <sphereGeometry args={[chestR * 0.3, 16, 12]} />
          {mat}
        </mesh>
      ))}

      <mesh castShadow position={[0, (neckTopY + shoulderY) / 2, 0]}>
        <capsuleGeometry args={[neckR, headH * 0.35, 6, 16]} />
        {mat}
      </mesh>

      <group position={[0, neckTopY + headH * 0.5, 0]}>
        <mesh castShadow scale={[0.82, 1.02, 0.9]}>
          <sphereGeometry args={[headH * 0.5, 24, 18]} />
          {mat}
        </mesh>
        {/* Jaw taper — without this the head is a plain scaled sphere with
            no chin/jawline definition at all. */}
        <mesh castShadow scale={[0.9, 0.7, 0.85]} position={[0, -headH * 0.24, headH * 0.03]}>
          <sphereGeometry args={[headH * 0.34, 20, 16]} />
          {mat}
        </mesh>

        {/* Face — eyes (white + iris), brows, nose, lips, ears. Port of
            js/three-view.js's addFace(); layout unchanged from there. */}
        {[-1, 1].map((s) => (
          <group key={`eye${s}`}>
            <mesh castShadow scale={[1, 0.62, 0.5]} position={[s * ex, ey, ez]}>
              <sphereGeometry args={[headH * 0.075, 14, 10]} />
              {eyeWhiteMat}
            </mesh>
            <mesh position={[s * ex, ey, ez + headH * 0.03]}>
              <sphereGeometry args={[headH * 0.036, 10, 8]} />
              {irisMat}
            </mesh>
            <mesh castShadow position={[s * ex, ey + headH * 0.11, ez * 0.98]} rotation={[0, 0, -s * 0.12]}>
              <boxGeometry args={[headH * 0.16, headH * 0.02, headH * 0.03]} />
              {browMat}
            </mesh>
            <mesh castShadow scale={[0.4, 0.9, 0.6]} position={[s * headH * 0.42, ey - headH * 0.02, 0]}>
              <sphereGeometry args={[headH * 0.09, 12, 10]} />
              {mat}
            </mesh>
          </group>
        ))}
        <mesh castShadow rotation={[Math.PI * 0.52, 0, 0]} position={[0, ey - headH * 0.08, ez + headH * 0.05]}>
          <coneGeometry args={[headH * 0.06, headH * 0.18, 8]} />
          {mat}
        </mesh>
        <mesh castShadow rotation={[Math.PI * 0.5, 0, 0]} position={[0, ey - headH * 0.24, ez * 0.96]}>
          <torusGeometry args={[headH * 0.09, headH * 0.028, 8, 16, Math.PI]} />
          {lipMat}
        </mesh>

        {/* Hair — category-styled, same as js/three-view.js's addHair():
            a crown + back cap for everyone, long hair for women, ponytails
            for girls, boys/men keep just the short cap. */}
        <mesh castShadow position={[0, headH * 0.08, 0]}>
          <sphereGeometry args={[headH * 0.55, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.46]} />
          {hairMat}
        </mesh>
        <mesh castShadow rotation={[0, -Math.PI / 2, 0]} position={[0, 0, -headH * 0.02]}>
          <sphereGeometry args={[headH * 0.54, 20, 16, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.55]} />
          {hairMat}
        </mesh>
        {category === 'women' && (
          <>
            <mesh castShadow scale={[1, 1, 0.5]} position={[0, 0, -headH * 0.16]}>
              <latheGeometry
                args={[[
                  [headH * 0.52, headH * 0.34], [headH * 0.62, 0], [headH * 0.6, -headH * 1.2],
                  [headH * 0.5, -headH * 2.4], [headH * 0.3, -headH * 2.9],
                ].map(([r, y]) => new THREE.Vector2(r, y)), 20]}
              />
              {hairMat}
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} castShadow position={[s * headH * 0.44, -headH * 0.5, -headH * 0.06]} rotation={[0, 0, s * 0.06]}>
                <capsuleGeometry args={[headH * 0.06, headH * 1.0, 4, 8]} />
                {hairMat}
              </mesh>
            ))}
          </>
        )}
        {category === 'girls' && [-1, 1].map((s) => (
          <mesh key={s} castShadow position={[s * headH * 0.5, headH * 0.1, -headH * 0.1]} rotation={[0, 0, s * 0.5]}>
            <capsuleGeometry args={[headH * 0.12, headH * 0.7, 4, 8]} />
            {hairMat}
          </mesh>
        ))}
      </group>

      {[-1, 1].map((s) => (
        <mesh
          key={`arm${s}`} castShadow
          position={[s * shoulderHalf * 0.95, shoulderY - span * 0.04, 0]}
          rotation={[0, 0, s * (isContrapposto && s === 1 ? armAngle * 2.5 : armAngle)]}
        >
          <latheGeometry args={[armPts, 16]} />
          {mat}
          <group position={[0, -armLen, 0]}>
            <Hand r={wristR} mat={mat} />
          </group>
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
                  <group position={[0, -seatedLegPts.calfLen * 0.94, 0]}>
                    <Foot r={ankleR} footLen={thighR * 2.8} mat={mat} />
                  </group>
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
            <group position={[0, -legLen * 0.92, 0]}>
              <Foot r={ankleR} footLen={thighR * 2.8} mat={mat} />
            </group>
          </group>
        )
      })}
    </group>
  )
}
