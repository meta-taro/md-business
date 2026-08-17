import { defineConfig } from 'vitest/config';

// Phase 1b では純ロジック（テーマ解決など）だけを vitest で検証する。
// Svelte コンポーネント / ルーンは svelte-check + vite build を品質ゲートにするため、
// ここでは SvelteKit プラグインを噛ませず素の node 環境でユニットテストを回す。
export default defineConfig({
  test: {
    environment: 'node',
    // 既定の 5 秒では足りないテストがある。プレビューの遅延読み込みを確かめるテストは
    // `import()` を実測するため、その 1 回で大きな依存木の変換を丸ごと負担する。
    // 変換の所要は機械の混み具合で変わり（monorepo 全体を並列で回すと数倍になる）、
    // 遅い日にだけ落ちる。測っているのは「何を読んだか」であって速さではないので、
    // 待ち時間の側を広げる。
    testTimeout: 20_000,
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'build/**', '.svelte-kit/**', 'src-tauri/**'],
  },
});
