/**
 * 拡張と、プレビューの webview で動くスクリプトをそれぞれ単一ファイルへバンドルする。
 * -----------------------------------------------------------------------------
 * `.vsix` に node_modules を含めずに済ませるため、依存はすべて内包する。
 * `vscode` だけは拡張ホストが実行時に渡すので外に出す。
 *
 * 出力を CJS にするのは、拡張ホストが `main` を require で読むため。
 */
import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * 事前コンパイル済みの検証関数は `import * as m from 'ajv/dist/runtime/ucs2length'` と書き、
 * `m.default` を関数として呼ぶ。読み込む側が `"type": "module"` のパッケージなので、esbuild は
 * Node の流儀で `default` に `module.exports` 全体を入れてしまい、呼んだ時点で落ちる。
 * `exports.default` をそのまま `default` として渡す薄い ESM に差し替える。
 */
const ajvRuntimeDefault = {
  name: 'ajv-runtime-default',
  setup(b) {
    b.onResolve({ filter: /^ajv\/dist\/runtime\/ucs2length$/ }, (args) =>
      args.namespace === 'ajv-runtime-default'
        ? undefined
        : { path: args.path, namespace: 'ajv-runtime-default', pluginData: args.resolveDir },
    );
    b.onLoad({ filter: /.*/, namespace: 'ajv-runtime-default' }, (args) => ({
      contents: `export default require(${JSON.stringify(`${args.path}.js`)}).default;\n`,
      resolveDir: args.pluginData,
      loader: 'js',
    }));
  },
};

await build({
  entryPoints: [resolve(ROOT, 'src/extension.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  // engines.vscode の下限（1.101）が載せている Node に合わせる。
  target: 'node20',
  external: ['vscode'],
  outfile: resolve(ROOT, 'dist/extension.cjs'),
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});

// webview はブラウザとして動く。DOMPurify が DOM を要るので、描画はこちら側で行う。
await build({
  entryPoints: [resolve(ROOT, 'src/webview/main.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  // engines.vscode の下限（1.101）が載せている Chromium に合わせる。
  target: 'chrome128',
  outfile: resolve(ROOT, 'dist/preview.js'),
  plugins: [ajvRuntimeDefault],
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});

// 検証シートの表エディタ。DOM で表を組むだけなので検証器は持たない（判定は拡張側で行う）。
await build({
  entryPoints: [resolve(ROOT, 'src/webview/grid.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome128',
  outfile: resolve(ROOT, 'dist/tsvGrid.js'),
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});

// MCP サーバーは拡張とは別プロセスで動く。利用者に Node を入れてもらわずに済むよう、
// エディタ自身の Node で実行できる単一ファイルにする。
await build({
  entryPoints: [resolve(ROOT, '../../packages/mcp-server/src/bin.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: resolve(ROOT, 'dist/mcp-server.cjs'),
  plugins: [ajvRuntimeDefault],
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});

// 文書種別ごとの見た目は Chrome 拡張と同じ CSS を使う。
const STYLES = ['invoice', 'spec', 'test-spec', 'db-spec', 'nosql-db-spec', 'api-spec'];
const stylesSrc = resolve(ROOT, '../../packages/renderer-pdf/src/styles');
const stylesDest = resolve(ROOT, 'dist/styles');
await mkdir(stylesDest, { recursive: true });
for (const name of STYLES) {
  await copyFile(resolve(stylesSrc, `${name}.css`), resolve(stylesDest, `${name}.css`));
}
