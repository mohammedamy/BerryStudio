import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js'
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js'

// WP-9.5: GLB/OBJ/USDZ export of the current scene (avatar + draped
// garment, whatever's actually on screen) — all three exporters are
// first-party three.js addons, no new dependency. GIF export is
// deliberately NOT implemented here: every JS GIF encoder is a new
// third-party dependency, against this project's dependency-minimal
// posture (see fabricPresets.js's own "no new dependency" precedent for
// the same reasoning) — flagged as documented future work, not silently
// dropped.
//
// USDZ specifically: implemented and exercised (no runtime errors, valid
// zip/usdc bytes produced), but NOT verified in Apple Quick Look on a real
// device — no iOS hardware was available in the environment this was
// built in. Ship it, but don't claim "confirmed working in Quick Look"
// until someone with a device actually checks it; USDZExporter's own
// material-feature envelope is narrower than GLTFExporter's (per three.js's
// docs), so a real check might surface a fabric-material gap this couldn't
// catch.

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

export function exportGLB(scene, filename = 'garment.glb') {
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        const blob = new Blob([result], { type: 'model/gltf-binary' })
        downloadBlob(blob, filename)
        resolve()
      },
      reject,
      { binary: true },
    )
  })
}

export function exportOBJ(scene, filename = 'garment.obj') {
  const exporter = new OBJExporter()
  const text = exporter.parse(scene)
  downloadBlob(new Blob([text], { type: 'text/plain' }), filename)
  return Promise.resolve()
}

export async function exportUSDZ(scene, filename = 'garment.usdz') {
  const exporter = new USDZExporter()
  const bytes = await exporter.parseAsync(scene)
  downloadBlob(new Blob([bytes], { type: 'model/vnd.usdz+zip' }), filename)
}
