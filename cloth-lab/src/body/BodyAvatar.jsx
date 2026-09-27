import { Component, Suspense, useEffect, useRef } from 'react'
import Avatar from './Avatar'
import GLBAvatar from './GLBAvatar'
import { t } from '../i18n'

// Tier-1 fallback: a GLB load failure (bad URL, network, CORS, invalid
// file) surfaces as a thrown error on the render AFTER GLTFLoader's promise
// rejects — Suspense only catches the pending state, not a rejection, so
// that needs its own boundary. React has no built-in functional
// ErrorBoundary; this is the standard minimal class-component shape.
class AvatarErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) {
    console.warn('GLBAvatar failed to load, falling back to the procedural avatar:', error)
    if (this.props.onLoadError) this.props.onLoadError()
  }
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
// `onPoseWarning(message|null)` surfaces GLBAvatar's degraded-support cases
// (unrecognized rig, VRM, no walk animation, "seated" leg fallback) as
// user-visible UI instead of a console.warn nobody but a developer would
// ever see — see GLBAvatar.jsx's own header comment for why it's two
// separate state slots combined there rather than one. Cleared here
// whenever there's no url at all (plain procedural avatar, no GLB-specific
// limitation possible) — GLBAvatar unmounting doesn't otherwise get a
// chance to clear whatever it last reported.
export default function BodyAvatar({ dims, lang = 'en', url, collisionRigRef, skinColor, pose, onPoseWarning }) {
  // A previous GLB can leave a mesh-derived collision rig in the shared Scene
  // ref. Clear it during the URL-changing render so ClothMesh never collides
  // against a body that is no longer on screen while the next GLB is loading,
  // or after it falls back to the procedural body.
  const lastUrlRef = useRef(undefined)
  if (lastUrlRef.current !== url) {
    lastUrlRef.current = url
    if (collisionRigRef) collisionRigRef.current = null
  }
  useEffect(() => {
    if (!url && onPoseWarning) onPoseWarning(null)
  }, [url, onPoseWarning])
  if (!url) return <Avatar dims={dims} skinColor={skinColor} pose={pose} />
  return (
    <AvatarErrorBoundary
      // Error boundaries retain their failure state for their whole mount.
      // Keying by URL makes a valid later choice retry instead of keeping the
      // procedural fallback that a previous bad custom URL selected.
      key={url}
      fallback={<Avatar dims={dims} skinColor={skinColor} pose={pose} />}
      onLoadError={() => onPoseWarning && onPoseWarning(t(lang, 'avatarLoadError'))}
    >
      <Suspense fallback={<Avatar dims={dims} skinColor={skinColor} pose={pose} />}>
        <GLBAvatar dims={dims} lang={lang} url={url} collisionRigRef={collisionRigRef} pose={pose} onPoseWarning={onPoseWarning} />
      </Suspense>
    </AvatarErrorBoundary>
  )
}
