/**
 * サイドカーを単一ファイルへバンドルする。
 * -----------------------------------------------------------------------------
 * デスクトップアプリはこの 1 ファイルをリソースとして同梱し、Node ランタイムで
 * 起動する。node_modules を配布物に含めずに済ませるため、依存はすべて内包する。
 *
 * 出力を CJS にするのは、拡張子 `.cjs` なら配置先の package.json の type 設定に
 * 左右されず Node が常に CommonJS として読むため（アプリのリソース配下に
 * package.json は置かれない）。
 */
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

await build({
  entryPoints: [resolve(ROOT, 'src/binSidecar.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  // Tauri アプリが要求する Node の下限に合わせる。
  target: 'node20',
  // tsc の出力（dist/）とは別ディレクトリへ出す。両者を混ぜると
  // ビルドキャッシュの出力範囲が重なり、片方の復元がもう片方を消しうる。
  outfile: resolve(ROOT, 'dist-sidecar/sidecar.cjs'),
  // 実行時に Ajv が new Function で validator を生成するため、識別子は保つ
  // （壊れたときにスタックトレースから追えるようにする意図も兼ねる）。
  minify: false,
  sourcemap: false,
  logLevel: 'info',
});
