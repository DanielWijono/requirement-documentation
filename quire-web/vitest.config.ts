import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'html'],
      // Just below the measured baseline (2026-09-23: 95 / 88 / 71 / 95) so regressions fail the run.
      thresholds: { statements: 90, branches: 82, functions: 65, lines: 90 },
    },
  },
})
