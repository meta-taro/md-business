import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(__dirname);

export default defineConfig({
  root,
  publicDir: resolve(root, 'public'),
  define: {
    // gray-matter / js-yaml occasionally probe for the Node global identifier.
    global: 'globalThis',
  },
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: true,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // baseline 項目5 と合わせ、依存パッケージ由来の eval を build 段階で
        // エラー扱いにする（MV3 CSP は unsafe-eval を拒否するため）。
        if (warning.code === 'EVAL') {
          throw new Error(
            `Bundle contains eval: ${warning.id ?? ''}\n${warning.message}\n` +
              `CSP-safe な代替に置き換えてください（packages/core では gray-matter 廃止済み）。`,
          );
        }
        defaultHandler(warning);
      },
      input: {
        popup: resolve(root, 'src/popup/index.html'),
        viewer: resolve(root, 'src/viewer/index.html'),
        content: resolve(root, 'src/content/file-md.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'content') return 'content/file-md.js';
          if (chunk.name === 'popup') return 'popup/index.js';
          if (chunk.name === 'viewer') return 'viewer/index.js';
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (asset) => {
          if (asset.name?.endsWith('.css')) return 'assets/[name]-[hash][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
