import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  build: {
    cssMinify: 'esbuild' // 👈 Deaktiviert LightningCSS für CSS-Minification
  }
})