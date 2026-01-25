import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['recipe.youramaryllis.com'],
    proxy: {
      '/api': 'http://localhost:8081',
      '/uploads': 'http://localhost:8081',
      '/auth': 'http://localhost:8081',
    },
  },
})
