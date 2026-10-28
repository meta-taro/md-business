import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // エントリは VS Code API の配線だけを持つ。判断は src/ の他のモジュールへ出してテストする。
      exclude: [
        'src/**/*.d.ts',
        'src/extension.ts',
        'src/preview/panel.ts',
        'src/preview/messages.ts',
        'src/webview/main.ts',
        'src/webview/grid.ts',
        'src/grid/provider.ts',
        'src/grid/messages.ts',
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
