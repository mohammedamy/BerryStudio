import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served at a subpath alongside the existing production site (see
// .github/workflows/deploy-pages.yml) — https://mohammedamy.github.io/BerryStudio/cloth-lab/,
// not at the domain root, so every asset URL needs this prefix.
export default defineConfig({
  base: '/BerryStudio/cloth-lab/',
  plugins: [react()],
})
