import { defineConfig } from 'vitest/config';

// Phase 1b では純ロジック（テーマ解決など）だけを vitest で検証する。
// Svelte コンポーネント / ルーンは svelte-check + vite build を品質ゲートにするため、
// ここでは SvelteKit プラグインを噛ませず素の node 環境でユニットテストを回す。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'build/**', '.svelte-kit/**', 'src-tauri/**'],
  },
});
