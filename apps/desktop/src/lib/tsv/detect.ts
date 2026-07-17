/**
 * カスタム TSV 検証シートの判定（Issue 010・Block TSV-9）。
 *
 * エディター source を右ペインで「グリッド編集」（本命 UI）か
 * 「読み取りプレビュー」（renderer-pdf HTML）のどちらで開くかを振り分ける。
 * 先頭の非空行が v1 マジック `#! md-business:test-spec-tsv/v1` かどうかだけで判定する
 * 軽量関数（全文パースはしない）。判定ロジックは node 環境の vitest で検査する。
 */

/** カスタム TSV v1 のフォーマット識別子（`#!` マジック行に書く値）。 */
export const TSV_FORMAT_ID = 'md-business:test-spec-tsv/v1';

/**
 * source がカスタム TSV 検証シートか（先頭の非空行が v1 マジック行か）を判定する。
 *
 * - 先頭の空行（空白のみ含む）は読み飛ばす。
 * - 最初の実質行が `#!` で始まり、残りを trim した値が {@link TSV_FORMAT_ID} に一致すれば true。
 * - `#!` は列 0 のみ有効（`classifyLine` と同じ・先頭空白ありはマジック扱いしない）。
 */
export function isTsvSource(source: string): boolean {
  for (const rawLine of source.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '') {
      continue;
    }
    if (!line.startsWith('#!')) {
      return false;
    }
    return line.slice(2).trim() === TSV_FORMAT_ID;
  }
  return false;
}
