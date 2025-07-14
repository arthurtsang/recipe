import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['recipe.youramaryllis.com'],
    proxy: {
      '/recipes': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
})
