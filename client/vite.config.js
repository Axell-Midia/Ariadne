import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FoodTracker',
        short_name: 'FoodTracker',
        description: 'Registra tus comidas y reacciones a lo largo del año',
        theme_color: '#0a1420',
        background_color: '#0a1420',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // el chunk de WebLLM (IA local) pesa ~6 MB: no se precachea con el shell,
        // se cachea en runtime al abrir la pestaña de IA (runtimeCaching de abajo)
        globIgnores: ['**/assets/lib-*.js'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // nombre de archivo con hash → inmutable, CacheFirst es seguro
            urlPattern: /\/assets\/lib-[\w-]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ia-lib',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 3 }
            }
          }
        ]
      }
    })
  ]
})