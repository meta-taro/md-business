import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';

const root = resolve(__dirname);

// mermaid 11.x の cytoscape 依存（architecture / mindmap diagram）は UMD root
// detector で `Function("return this")()` を、cytoscape の lodash は
// `require("util").types` を含むため MV3 CSP を通らない。dynamic import 経由
// しか触らないので、空 shim に alias して bundle から実装を完全に外す。
// 残る ER / flowchart / sequence は dagre 系レイアウトで CSP セーフ。
const cytoscapeShim = resolve(root, 'src/shims/cytoscape-empty.ts');

/**
 * lodash-es は内部 helper の `_root.js` / `_nodeUtil.js` で
 *   - `Function('return this')()` (root detection の最終フォールバック)
 *   - `freeModule.require('util').types` (node-only API への probe)
 * を行っており、それぞれ Chrome MV3 CSP の `unsafe-eval` 拒否と
 * `require` 未定義に引っかかる（scan-bundle で検出される）。
 *
 * lodash-es 本体は mermaid 経由で dagre-d3-es が引いているため alias で
 * 丸ごと潰すことはできない。問題の 2 ファイルだけを browser-safe な実装で
 * 置換することで、dagre / flowchart / ER 系の layout は無傷で動く。
 */
function shimLodashCspViolations(): Plugin {
  // 既知の CSP 違反パターン（lodash 系の root detection と node-util probe）を
  // 検出して browser-safe 実装で置換する。lodash-es 本体（dagre-d3-es 経由で
  // mermaid に流れ込む）と、@mermaid-js/parser がビルド時に内包している
  // 同等コード（dist/chunks/ 配下に lodash の root.js / nodeUtil.js 相当が
  // 焼き込まれている）の両方を対象にする。
  //
  // - `Function("return this")()` → `globalThis`
  // - `freeModule.require("util").types` → `undefined`
  // - `nNNN && nNNN.require && nNNN.require("util").types` → `undefined`
  // 元の lodash-es ソースはシングルクォート（`Function('return this')()`）。
  // rollup output 後はダブルに正規化されることもあるので両方対応。
  const ROOT_PATTERN = /Function\(\s*['"]return this['"]\s*\)\s*\(\s*\)/g;
  const NODE_UTIL_PATTERN_1 = /\b\w+\s*&&\s*\w+\.require\s*&&\s*\w+\.require\(\s*['"]util['"]\s*\)\.types/g;
  const NODE_UTIL_PATTERN_2 = /\b\w+\.require\(\s*['"]util['"]\s*\)\.types/g;
  return {
    name: 'mdb-shim-lodash-csp',
    enforce: 'pre',
    transform(code, id) {
      // 文字列マッチで安く弾く（`/g` フラグ付き RegExp#test は lastIndex が
      // 残るので、ガードには使わない）。
      const hasFn = code.includes("Function('return this')") || code.includes('Function("return this")');
      const hasReq = code.includes(".require('util')") || code.includes('.require("util")');
      if (!hasFn && !hasReq) return null;
      const next = code
        .replace(ROOT_PATTERN, '(typeof globalThis!=="undefined"?globalThis:self)')
        .replace(NODE_UTIL_PATTERN_1, 'undefined')
        .replace(NODE_UTIL_PATTERN_2, 'undefined');
      return { code: next, map: { mappings: '' } };
    },
  };
}

export default defineConfig({
  root,
  publicDir: resolve(root, 'public'),
  plugins: [shimLodashCspViolations()],
  resolve: {
    alias: [
      { find: /^cytoscape$/, replacement: cytoscapeShim },
      { find: /^cytoscape-cose-bilkent$/, replacement: cytoscapeShim },
      { find: /^cytoscape-fcose$/, replacement: cytoscapeShim },
    ],
  },
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
