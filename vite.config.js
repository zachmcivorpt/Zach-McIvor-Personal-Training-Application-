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
        // A stable id keeps Android/Play treating this as the same app even
        // if name/start_url ever change later — PWABuilder's Android
        // packaging step reads this for the TWA's identity.
        id: '/',
        name: 'APEX Coaching Platform',
        short_name: 'APEX',
        description: 'APEX Coaching Platform — train, nutrition, lifestyle, performance.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#FFFFFF',
        categories: ['health', 'fitness', 'lifestyle'],
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
