import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// WP-5.4: separate build config for the embedded-mode entry point
// (src/embed.js) — vite.config.js (unchanged) stays the standalone
// cloth-lab app's own dev/build config; this one produces a plain ES
// module the root app dynamically imports (js/app.js, WP-5.5), NOT a
// full HTML app. `external` mirrors index.html's import map exactly: the
// whole point of routing these through the root app's own import map is
// ONE shared copy of react/three/etc. on the page, so this build must
// NOT bundle its own copies — an unbundled external stays a bare
// `import "react"` in the output, resolved by whichever import map the
// consuming page provides (see embed.js's own header comment).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-embed',
    lib: {
      entry: 'src/embed.js',
      formats: ['es'],
      fileName: () => 'cloth-lab-embed.js',
    },
    rollupOptions: {
      // A function matcher, not a plain string list: `three/addons/...`
      // subpath imports (GPUComputationRenderer, SkeletonUtils, RGBELoader,
      // the exporters) need externalizing too, or Rollup's default EXACT
      // string match only externalizes the bare `three` specifier and
      // bundles every addon file's source inline — verified by inspecting
      // a first build attempt with the plain-array form: it still shared
      // one 'three' core correctly (every bundled addon's own `from
      // 'three'` import got consolidated into the external one), but
      // needlessly duplicated addon code the root app's three-view.js
      // already loads separately from the same unpkg URL this import map
      // points at.
      external: (id) => id === 'react' || id === 'react-dom' || id === 'react-dom/client' || id === 'react/jsx-runtime'
        || id === '@react-three/fiber' || id === '@react-three/drei'
        || id === 'three' || id.startsWith('three/addons/'),
    },
  },
})
