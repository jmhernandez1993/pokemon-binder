import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the same build works at a domain root (Vercel) or a sub-path (GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Gen 1 Binder',
        short_name: 'Binder',
        description: 'Track a one-full-art-per-Pokémon Gen 1 binder.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e1014',
        theme_color: '#0e1014',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell is precached; card images (~23 MB) are cached on first view instead.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['cards/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/cards/'),
            handler: 'CacheFirst',
            options: { cacheName: 'card-images', expiration: { maxEntries: 600 } },
          },
        ],
      },
    }),
  ],
})
