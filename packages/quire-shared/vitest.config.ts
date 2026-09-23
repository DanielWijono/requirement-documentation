import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Plain data and type declarations: nothing to execute.
      exclude: ['src/seed.ts', 'src/types.ts'],
      reporter: ['text-summary'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
})
