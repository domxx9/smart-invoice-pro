import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
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
