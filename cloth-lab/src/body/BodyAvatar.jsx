import { Component, Suspense } from 'react'
import Avatar from './Avatar'
import GLBAvatar from './GLBAvatar'

// Tier-1 fallback: a GLB load failure (bad URL, network, CORS, invalid
// file) surfaces as a thrown error on the render AFTER GLTFLoader's promise
// rejects — Suspense only catches the pending state, not a rejection, so
// that needs its own boundary. React has no built-in functional
// ErrorBoundary; this is the standard minimal class-component shape.
class AvatarErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.warn('GLBAvatar failed to load, falling back to the procedural avatar:', error) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

// Three-tier fallback for an optional real GLB avatar (cloth-lab realism
// plan, Tier 2/C1): (1) no url configured, or the url fails to load at all
// -> procedural Avatar (also shown as the Suspense fallback while a good
// url is still loading, so a slow load and a failed one look identical
// until/unless the load actually succeeds). (2) loads but GLBAvatar can't
// find a recognizable Mixamo/RPM arm rig -> renders the GLB in its
// original pose rather than guessing at a correction — a real body,
// possibly with cloth that doesn't fit it precisely, still beats no real
// body at all. (3) loads AND the rig is recognized -> GLBAvatar repose-
// corrects it to the same arms-down convention collisionRig.js and
// placement.js already assume. `collisionRigRef`, if given, is where tier
// 3 writes a WP-8.3 mesh-fit collision rig (real measurements from the
// loaded mesh) — see GLBAvatar.jsx and meshFitCollisionRig.js; tiers 1/2
// leave it untouched (null), and whatever reads it (ClothMesh.jsx) falls
// back to the formula-driven rig in that case.
// `skinColor` (WP-8.6) only ever reaches the procedural Avatar — a loaded
// GLB carries its own baked-in skin texture/material, which this doesn't
// touch (see body/skinTones.js's own header comment).
// `pose` (WP-8.5) reaches both tiers — the procedural Avatar's own static
// geometry/rotation variants, and GLBAvatar's bone-rotation repose (with a
// `walk` scoped to GLBs that ship embedded animation clips; the procedural
// avatar has no skeleton to animate, so `walk` there is a no-op standing
// pose, same honest degradation as everywhere else in this fallback chain).
export default function BodyAvatar({ dims, url, collisionRigRef, skinColor, pose }) {
  if (!url) return <Avatar dims={dims} skinColor={skinColor} pose={pose} />
  return (
    <AvatarErrorBoundary fallback={<Avatar dims={dims} skinColor={skinColor} pose={pose} />}>
      <Suspense fallback={<Avatar dims={dims} skinColor={skinColor} pose={pose} />}>
        <GLBAvatar dims={dims} url={url} collisionRigRef={collisionRigRef} pose={pose} />
      </Suspense>
    </AvatarErrorBoundary>
  )
}
