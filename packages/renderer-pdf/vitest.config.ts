import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // tests-e2e/ は Playwright runner で実行する（vitest と別 runner）。
    // 同じ拡張子 *.spec.ts を vitest が拾わないよう明示的に除外する。
    exclude: ['node_modules/**', 'dist/**', 'tests-e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
        'src/browser.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
