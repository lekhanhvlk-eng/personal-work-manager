/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Chế độ "artifact": đóng gói thành MỘT tệp HTML để mở trên điện thoại qua link
// (lưu dữ liệu trên máy, không service worker, router trong bộ nhớ).
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact'
  return {
    define: artifact
      ? {
          'import.meta.env.VITE_ARTIFACT': JSON.stringify('true'),
          'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
          'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(''),
        }
      : {},
    resolve: artifact ? { alias: { 'virtual:pwa-register': '/src/pwa-register-stub.ts' } } : {},
    build: artifact
      ? {
          outDir: 'dist-artifact',
          cssCodeSplit: false,
          assetsInlineLimit: 100_000_000,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : {},
    plugins: [
      react(),
      !artifact &&
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
          manifest: {
            name: 'Trợ lý Công việc – Quản lý & Báo cáo',
            short_name: 'Trợ lý CV',
            description: 'Ghi nhận công việc nhanh, điều phối đội nhóm và xuất báo cáo thông minh.',
            lang: 'vi',
            dir: 'ltr',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            orientation: 'portrait',
            background_color: '#f8fafc',
            theme_color: '#1d5fed',
            categories: ['productivity', 'business'],
            icons: [
              { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
              { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
            shortcuts: [
              {
                name: 'Thêm công việc',
                short_name: 'Thêm mới',
                url: '/add',
                icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
              },
              {
                name: 'Xuất báo cáo mới',
                short_name: 'Báo cáo',
                url: '/reports/new',
                icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
              },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
            navigateFallback: '/index.html',
            // Không bao giờ lưu đệm các yêu cầu API/xác thực của Supabase.
            navigateFallbackDenylist: [/^\/auth\//, /^\/rest\//],
            runtimeCaching: [
              {
                urlPattern: ({ url }) =>
                  url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts',
                  expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                },
              },
            ],
          },
          devOptions: { enabled: false },
        }),
    ],
    server: { host: true, port: 5173 },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      env: { TZ: 'UTC' },
    },
  }
})
