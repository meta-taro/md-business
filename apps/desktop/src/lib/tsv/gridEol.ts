/**
 * 書き戻し時の末尾改行の維持（DOM 非依存の純ロジック）。
 *
 * `serializeTsv` は行を `\n` で連結するだけで末尾に改行を付けない（ファイル書き出し層で
 * 付ける想定の純テキスト契約）。グリッド編集はその出力をそのまま正本ソースへ流すため、
 * 何もしないと保存のたびに元ファイルの末尾改行が落ち、内容と無関係な 1 行が毎回 diff に
 * 出てしまう。テキストファイルは末尾改行ありが通例なので、**元テキストの状態をそのまま
 * 引き継ぐ**（あったら付け直す・無かったら付けない）。
 */

/**
 * 書き戻しテキスト `next` に、元テキスト `prev` の末尾改行の有無を反映して返す。
 *
 * 付け直す改行は常に `\n`（本文の行区切りと揃える）。`prev` が CRLF 終端でも、
 * 本文が LF に正規化される以上、末尾だけ CRLF を残すと不揃いになるため。
 */
export function preserveTrailingEol(next: string, prev: string): string {
  if (!prev.endsWith('\n')) return next;
  if (next.endsWith('\n')) return next;
  return `${next}\n`;
}
