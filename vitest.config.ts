import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
      thresholds: {
        'src/core/**.ts': {
          statements: 80,
        },
        'src/lib/**.ts': {
          statements: 70,
        },
        'src/cli/**.ts': {
          statements: 50,
        },
      },
    },
  },
});
