import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Tauri は固定 dev サーバー（src-tauri/tauri.conf.json の build.devUrl と一致）を
// 前提とするため、ポートを固定し strictPort で衝突時に fail-fast させる。
// Tauri の既定ポート 1420 は他の Tauri アプリと衝突し、先に起動した側が勝って
// 後発は必ず失敗する（同じ開発機で別の Tauri アプリを dev 実行すると起きる）。
// 巻き込まれないよう本アプリ専用の 1430 番台を使う。ビルド済みアプリは devUrl を
// 参照しないため、この指定は開発時にのみ効く。
// TAURI_DEV_HOST はモバイル/実機デバッグ用（デスクトップ MVP では未使用）。
const host = process.env['TAURI_DEV_HOST'];

export default defineConfig({
  plugins: [sveltekit()],
  // Rust 側のログを消さないよう Vite の画面クリアを無効化。
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: host ?? false,
    hmr: host ? { protocol: 'ws', host, port: 1431 } : undefined,
    // src-tauri 配下の変更で Vite が再起動しないよう監視から除外。
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
