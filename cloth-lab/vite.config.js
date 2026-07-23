import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Built output is served at a subpath alongside the existing production site
// (see .github/workflows/deploy-pages.yml) — https://mohammedamy.github.io/BerryStudio/cloth-lab/,
// not at the domain root, so every asset URL needs this prefix — but only
// for `vite build`. Applying it to `vite dev` too (as an unconditional
// `base:` would) forces the dev server itself onto that same subpath,
// breaking the plain http://localhost:5173/ URL the app.js iframe embed
// (loadClothLab in ../js/app.js) and .claude/launch.json both expect.
export default defineConfig(({ command, isPreview }) => ({
  base: (command === 'build' || isPreview) ? '/BerryStudio/cloth-lab/' : '/',
  plugins: [react()],
}))
