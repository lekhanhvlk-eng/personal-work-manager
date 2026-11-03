import { defineConfig } from 'vitest/config'

// Kiểm thử tích hợp CSDL: cần PostgreSQL thật, đặt TEST_DATABASE_URL.
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
})
