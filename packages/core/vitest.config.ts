import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      // RNF-41: core com cobertura mínima de 90% de linhas.
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
})
