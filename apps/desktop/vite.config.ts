import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Tauri は固定 dev サーバー（src-tauri/tauri.conf.json の build.devUrl と一致）を
// 前提とするため、ポートを 1420 に固定し strictPort で衝突時に fail-fast させる。
// TAURI_DEV_HOST はモバイル/実機デバッグ用（デスクトップ MVP では未使用）。
const host = process.env['TAURI_DEV_HOST'];

export default defineConfig({
  plugins: [sveltekit()],
  // Rust 側のログを消さないよう Vite の画面クリアを無効化。
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    // src-tauri 配下の変更で Vite が再起動しないよう監視から除外。
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
