import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/mark-black.png'],
      manifest: {
        name: 'Zach McIvor Personal Training',
        short_name: 'ZM Training',
        description: 'Forge Your Path — coaching and client app for Zach McIvor Personal Training.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#FFFFFF',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,ico}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Without these, a newly-deployed service worker sits "waiting"
        // until every open tab/installed-app instance is fully closed, so
        // a normal refresh keeps serving the old cached JS indefinitely —
        // this is why UI changes can look like they never deployed.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
