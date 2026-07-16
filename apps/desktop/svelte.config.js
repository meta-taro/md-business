import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Tauri は静的アセット（SPA）を webview で読み込むため、adapter-static + SPA fallback
 * 構成にする。SSR はデスクトップアプリでは不要なのでルート layout で ssr=false を宣言。
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
  },
};

export default config;
