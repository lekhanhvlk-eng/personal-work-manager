import { defineConfig, devices } from '@playwright/test'

// Kiểm thử đầu-cuối trên khung hình điện thoại Android, chế độ dùng thử (không cần Supabase).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'android-pixel7', use: { ...devices['Pixel 7'], permissions: ['clipboard-read', 'clipboard-write'] } },
    {
      name: 'android-small-360',
      use: {
        ...devices['Galaxy S9+'],
        viewport: { width: 360, height: 740 },
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
  ],
  webServer: {
    command: 'npx vite build --mode e2e && npx vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
})
