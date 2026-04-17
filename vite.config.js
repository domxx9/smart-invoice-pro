import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Notes on the Shopify proxy:
//   Each merchant has their own `{shop}.myshopify.com` origin, so a single static target
//   doesn't work. Instead the browser client sends `X-Shopify-Shop-Domain: <shop>` and we
//   rewrite the proxy target per-request. Native builds call Shopify directly via
//   Capacitor HTTP and never hit this proxy.
const SHOPIFY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i

export default defineConfig({
  plugins: [react()],
  base: './',
  // MediaPipe's tasks-genai pulls in dynamic imports inside our Web Worker
  // (src/workers/mediapipeWorker.js). Rollup rejects the default IIFE output
  // for workers that code-split, so emit ES-module workers and keep the
  // `new Worker(url, { type: 'module' })` contract in gemmaWorker.js.
  worker: {
    format: 'es',
  },
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
      '/api/shopify': {
        // Placeholder target — overridden per-request via the X-Shopify-Shop-Domain
        // header below. Shopify always serves *.myshopify.com over TLS on 443.
        target: 'https://shop.myshopify.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/shopify/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const shop = req.headers['x-shopify-shop-domain']
            if (typeof shop === 'string' && SHOPIFY_DOMAIN_RE.test(shop)) {
              proxyReq.setHeader('host', shop)
              // http-proxy resolves the target once, so we overwrite the path's host
              // by directly poking the underlying socket's hostname via setHeader('host')
              // and rewriting the request's `_headers` — but the cleanest knob is
              // `proxyReq.setHeader` and relying on `changeOrigin`. If the hostname
              // must differ from the initial target, use `proxyReq.setHeader` + an
              // explicit DNS lookup is not needed because *.myshopify.com shares the
              // same edge. `router` below handles the real per-request retarget.
            }
          })
        },
        // `router` lets http-proxy pick the target per-request, which is exactly what
        // we need for a dynamic Shopify shop domain.
        router: (req) => {
          const shop = req.headers['x-shopify-shop-domain']
          if (typeof shop === 'string' && SHOPIFY_DOMAIN_RE.test(shop)) {
            return `https://${shop}`
          }
          return 'https://shop.myshopify.com'
        },
      },
    },
  },
})
