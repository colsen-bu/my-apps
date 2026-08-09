import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the built app runs from any subpath — GitHub Pages project
// sites, a folder on a static host, or opened straight off disk.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Riftbound Collection',
        short_name: 'Riftbound',
        description: 'Track your Riftbound TCG collection.',
        theme_color: '#0d1017',
        background_color: '#0d1017',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // cards.json is ~650KB; the default 2MB cap already covers it, but be explicit.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        runtimeCaching: [
          {
            // Card art lives on Riot's CDN. Cache what you actually look at so
            // the app stays usable on a plane, without pulling 660MB up front.
            urlPattern: /^https:\/\/cmsassets\.rgpub\.io\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'riftbound-card-art',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
