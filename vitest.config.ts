import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Use jsdom so DOM globals (document, localStorage, etc.) are available in unit tests
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],

    // Resolve the '@/' path alias used throughout the source
    alias: {
      '@': path.resolve(__dirname, './src'),
    },

    // Where Vitest looks for test files
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
    ],

    // Exclude build output and third-party code
    exclude: ['node_modules', 'dist', 'worker'],

    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov', 'html'],

      // Instrument only project source – not test helpers or node_modules
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',        // Entry-point bootstrap – untestable in isolation
        'src/**/*.d.ts',
        'src/assets/**',
        'src/index.css',
        'src/App.css',
      ],

      // Minimum coverage thresholds – CI fails if coverage REGRESSES below these.
      // Measured baseline (2026-11-06):
      //   Statements: 69.85%  Branches: 53.84%  Functions: 70.79%  Lines: 71.94%
      // Thresholds sit a few points below so real regressions fail CI.
      thresholds: {
        lines: 65,
        branches: 50,
        functions: 65,
        statements: 65,
      },
    },
  },
});
