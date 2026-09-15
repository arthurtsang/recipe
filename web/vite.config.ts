import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  APPLE_TOUCH_PNG_180_B64,
  FAVICON_ICO_B64,
  FAVICON_PNG_32_B64,
} from './favicon-assets'

function secretGardenFavicons(): Plugin {
  const files: { fileName: string; b64: string }[] = [
    { fileName: 'favicon.ico', b64: FAVICON_ICO_B64 },
    { fileName: 'favicon-32x32.png', b64: FAVICON_PNG_32_B64 },
    { fileName: 'apple-touch-icon.png', b64: APPLE_TOUCH_PNG_180_B64 },
    // DDG cached this old public path; keep the URL, serve the official mark.
    { fileName: 'metro-bistro-icon.png', b64: APPLE_TOUCH_PNG_180_B64 },
  ]
  return {
    name: 'secret-garden-favicons',
    buildStart() {
      for (const file of files) {
        writeFileSync(resolve(__dirname, 'public', file.fileName), Buffer.from(file.b64, 'base64'))
      }
    },
    generateBundle() {
      for (const file of files) {
        this.emitFile({ type: 'asset', fileName: file.fileName, source: Buffer.from(file.b64, 'base64') })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), secretGardenFavicons()],
  server: {
    build: {
      outDir: 'dist',
      sourcemap: false
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      }
    }
  }
})
