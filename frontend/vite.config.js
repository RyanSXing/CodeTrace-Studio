import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/run': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/tokens': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/trace': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
