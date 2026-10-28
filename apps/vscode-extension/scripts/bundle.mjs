/**
 * 拡張を単一ファイルへバンドルする。
 * -----------------------------------------------------------------------------
 * `.vsix` に node_modules を含めずに済ませるため、依存はすべて内包する。
 * `vscode` だけは拡張ホストが実行時に渡すので外に出す。
 *
 * 出力を CJS にするのは、拡張ホストが `main` を require で読むため。
 */
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

await build({
  entryPoints: [resolve(ROOT, 'src/extension.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  // engines.vscode の下限（1.101）が載せている Node に合わせる。
  target: 'node20',
  external: ['vscode'],
  outfile: resolve(ROOT, 'dist/extension.cjs'),
  minify: false,
  sourcemap: false,
  logLevel: 'info',
});
