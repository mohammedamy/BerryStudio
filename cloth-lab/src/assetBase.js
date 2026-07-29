// WP-5.2: `import.meta.env.BASE_URL` is only correct for the STANDALONE
// build (main.jsx), where Vite's own `base` config (vite.config.js) is the
// single source of truth for where static assets (env/, textures/) are
// served from. The embedded build (embed.js, WP-5.4) is mounted inside the
// root app's own page at an asset base the root app controls, not Vite's —
// so it needs an explicit override instead. Defaults to
// `import.meta.env.BASE_URL` so every existing call site (Scene.jsx's HDRI,
// ClothMesh.jsx's fabric textures) keeps working unchanged for the
// standalone build without calling setAssetBase() at all.
let base = import.meta.env.BASE_URL

export function setAssetBase(url) {
  base = url
}

export function getAssetBase() {
  return base
}
