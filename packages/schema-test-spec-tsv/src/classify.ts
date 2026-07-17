/**
 * カスタム TSV の物理行の種類。
 *
 * - `magic`: フォーマット識別行 `#! md-business:test-spec-tsv/v1`（1 行目）。
 * - `directive`: 構造メタ行 `#@ …`（条件付き書式など）。
 * - `meta`: 文書メタ行 `# …`（キー: 値・人間可読）。
 * - `data`: 型付きヘッダ行 or データ行（マーカーなし）。
 * - `blank`: 空白のみの行（パーサが読み飛ばす）。
 */
export type LineKind = 'magic' | 'directive' | 'meta' | 'data' | 'blank';

/**
 * 空白（半角スペース / タブ）だけで構成された行を判定する正規表現。
 * 空文字列にもマッチする。
 */
const BLANK_LINE = /^[ \t]*$/;

/**
 * 1 物理行の種類を、**行頭（列 0）のマーカー**だけで判別する純関数。
 *
 * マーカー（`#!` / `#@` / `#`）は必ず列 0 にある場合のみ有効。先頭に空白がある行は
 * データ行として扱う（Excel/Sheets がコメントを「行頭 `#`」でのみ判定するのと同じ挙動＝
 * コピペ互換）。空白のみの行は `blank`。
 *
 * 二文字マーカー（`#!` / `#@`）を一文字マーカー（`#`）より先に判定する。
 */
export function classifyLine(line: string): LineKind {
  if (BLANK_LINE.test(line)) {
    return 'blank';
  }
  if (line.startsWith('#!')) {
    return 'magic';
  }
  if (line.startsWith('#@')) {
    return 'directive';
  }
  if (line.startsWith('#')) {
    return 'meta';
  }
  return 'data';
}
