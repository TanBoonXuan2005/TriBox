import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The proxy rewrites the Host header to the target (localhost:3000), so the
      // backend can't tell the request came from the page's own origin
      // (localhost:5173). Forward the original host as X-Forwarded-Host so
      // /api/chat's same-origin check can recognise our own published page in dev
      // the same way it does in prod (where it's served by this same backend).
      '/api': {
        target: 'http://localhost:3000',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.host) proxyReq.setHeader('x-forwarded-host', req.headers.host);
          });
        },
      },
      '/s/': 'http://localhost:3000',
      '/widget.js': 'http://localhost:3000',
    },
  },
})
