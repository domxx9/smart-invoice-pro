import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
  },
  server: {
    proxy: {
      '/api/sqsp': {
        target: 'https://api.squarespace.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sqsp/, ''),
      },
    },
  },
})
