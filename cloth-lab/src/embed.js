import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { setAssetBase } from './assetBase.js'
import './index.css'
// No standalone.css import here (deliberately) — that file's html/body
// height:100% rule is only correct when this app owns the whole page; see
// its own header comment. The embedded build must never touch the host
// (root BerryStudio app) page's html/body.

// WP-5.4: the embedded entry point — built separately via vite.lib.config.js
// (format: 'es', external: react/react-dom/three/@react-three/fiber/
// @react-three/drei, all resolved through the root app's own import map so
// there's exactly one copy of each loaded on the page) and consumed by
// js/app.js when `state.clothLabEngine === 'embedded'`. `.js`, not `.jsx`,
// deliberately — this file uses createElement directly rather than JSX
// syntax so it needs no JSX-in-.js build config beyond what App.jsx (a
// normal .jsx file) already gets from @vitejs/plugin-react.
let root = null

// `container`: a DOM node the caller owns and sizes — this never touches
// anything outside it (see index.css's .cloth-lab-root scoping, WP-5.2).
// `assetBase`: where env/textures/ are served from for THIS deployment
// (the root app knows its own asset layout; cloth-lab's own Vite `base`
// config, which only applies to the standalone build, doesn't apply here).
// `pattern`: the same payload shape buildClothLabPayload() (js/app.js)
// already builds — omit to start on the built-in demo T-shirt, exactly
// like opening the standalone app with nothing imported yet.
// `onReady`: called once, synchronously, after the first render — the
// embedded equivalent of the iframe path's `postMessage({type:
// 'clothlab:ready'})` handshake, which embedded mode has no need for
// (no cross-document boundary to wait across).
// `bodyOnly`: WP-10's standalone BodyForm page (body.html) — renders just
// the avatar (no garment/cloth/seam UI), see App.jsx's own `bodyOnly` prop.
// Vite's lib build extracts the `import './index.css'` above into a
// SEPARATE file (dist-embed/cloth-lab.css) rather than inlining it — lib
// mode has no runtime CSS-injection helper the way a normal app build's
// dev server does. Injecting it here, resolved via import.meta.url (this
// module's own URL, wherever the host page actually loaded it from) rather
// than a hardcoded path, means the caller never needs to know or hardcode
// cloth-lab's internal build output layout.
let styleInjected = false
function injectStylesheet() {
  if (styleInjected) return
  styleInjected = true
  const href = new URL(/* @vite-ignore */ './cloth-lab.css', import.meta.url).href
  if (document.querySelector(`link[href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

export function mount(container, { assetBase, pattern = null, onReady, bodyOnly = false } = {}) {
  injectStylesheet()
  if (assetBase) setAssetBase(assetBase)
  root = createRoot(container)
  root.render(createElement(App, { embedded: true, pattern, onReady, bodyOnly }))
  return { update, unmount }
}

// Re-renders with a NEW pattern object — App.jsx only re-applies it when
// the reference actually changed (see its lastAppliedPatternRef check), so
// the caller should skip calling this at all for an unchanged payload
// (js/app.js already does this dedup for the iframe path today; reuse the
// same check rather than sending on every measurement keystroke).
export function update({ pattern = null, onReady, bodyOnly = false } = {}) {
  if (!root) return
  root.render(createElement(App, { embedded: true, pattern, onReady, bodyOnly }))
}

export function unmount() {
  if (!root) return
  root.unmount()
  root = null
}
