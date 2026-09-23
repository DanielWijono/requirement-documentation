import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry points and the declarative schema (its lazy `references` callbacks only run inside drizzle-kit).
      exclude: ['src/server.ts', 'src/cli/**', 'src/db/schema.ts'],
      reporter: ['text-summary'],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
})
