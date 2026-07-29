// WP-9.5: turntable export — PNG-sequence + MP4/WebM, both via native
// browser APIs (canvas -> blob, canvas.captureStream() + MediaRecorder),
// no new dependency. No zip library is added for the PNG sequence either
// (same "no new dependency" reasoning as GIF export, see exporters.js) —
// frames download individually, named so they sort/import in order into
// any external tool (ffmpeg, a GIF maker, etc).

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

// Rotates `target` (an object with a settable `.rotation.y`, e.g. a Group
// wrapping the avatar+cloth) through a full turn over `frames` steps,
// rendering and capturing each one. Restores the original rotation when
// done (this is a capture pass, not a permanent scene change) — including
// on an early return from an error, via try/finally.
export async function exportTurntablePNGs(renderer, scene, camera, turntableGroup, { frames = 24, baseName = 'garment_frame' } = {}) {
  const originalY = turntableGroup.rotation.y
  try {
    for (let i = 0; i < frames; i++) {
      turntableGroup.rotation.y = originalY + (i / frames) * Math.PI * 2
      renderer.render(scene, camera)
      const blob = await canvasToBlob(renderer.domElement)
      const n = String(i + 1).padStart(String(frames).length, '0')
      downloadBlob(blob, `${baseName}_${n}.png`)
    }
  } finally {
    turntableGroup.rotation.y = originalY
    renderer.render(scene, camera)
  }
}

// Same rotation sweep, recorded as a single video via MediaRecorder instead
// of individual frames. `durationMs` is the full-turn duration; capture
// runs at the canvas's own render rate (whatever rAF cadence the Canvas is
// already driving), not a fixed frame count.
const VIDEO_MIME_CANDIDATES = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm']

export function pickSupportedVideoMimeType() {
  if (typeof MediaRecorder === 'undefined') return null
  return VIDEO_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) || null
}

export function recordTurntableVideo(renderer, turntableGroup, { durationMs = 4000, baseName = 'garment_turntable' } = {}) {
  const mimeType = pickSupportedVideoMimeType()
  if (!mimeType) return Promise.reject(new Error('MediaRecorder: no supported video mime type on this browser'))

  const stream = renderer.domElement.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType })
  const chunks = []
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  const originalY = turntableGroup.rotation.y
  const startTime = performance.now()
  let rafId = null

  function spin() {
    const elapsed = performance.now() - startTime
    turntableGroup.rotation.y = originalY + (elapsed / durationMs) * Math.PI * 2
    if (elapsed < durationMs) rafId = requestAnimationFrame(spin)
  }

  return new Promise((resolve, reject) => {
    recorder.onerror = (e) => { cancelAnimationFrame(rafId); turntableGroup.rotation.y = originalY; reject(e.error || e) }
    recorder.onstop = () => {
      turntableGroup.rotation.y = originalY
      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
      downloadBlob(new Blob(chunks, { type: mimeType }), `${baseName}.${ext}`)
      resolve()
    }
    recorder.start()
    spin()
    setTimeout(() => recorder.stop(), durationMs + 50)
  })
}
