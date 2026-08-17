import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // 既定の 5 秒では足りないテストがある。mermaid を実際に読み込む経路は、その 1 回で
    // 大きな依存木の変換を丸ごと負担する。所要は機械の混み具合で変わり（monorepo 全体を
    // 並列で回すと数倍になる）、遅い日にだけ落ちる。測っているのは分岐の通り方であって
    // 速さではないので、待ち時間の側を広げる。
    testTimeout: 20_000,
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/popup/index.ts',
        'src/viewer/index.ts',
        'src/content/file-md.ts',
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
