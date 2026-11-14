import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.png'],
      manifest: {
        name: 'Super Breaker',
        short_name: 'SuperBreaker',
        description: 'Smash bricks, grab powerups, chase three stars.',
        theme_color: '#0b0820',
        background_color: '#0b0820',
        display: 'fullscreen',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,webp,json,tmj,tsj,mp3,wav,xml,fnt}'],
        // Normal maps only serve the desktop High tier, so phones shouldn't precache them.
        globIgnores: ['**/*_n.png'],
        runtimeCaching: [
          {
            urlPattern: /_n\.png$/,
            handler: 'CacheFirst',
            options: { cacheName: 'normal-maps' },
          },
        ],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
