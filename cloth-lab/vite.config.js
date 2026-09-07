import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative assets support both berrystudio.org/cloth-lab/ and GitHub Pages.
export default defineConfig({
  base: './',
  plugins: [react()],
})
