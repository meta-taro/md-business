/**
 * 検証グリッドのスプレッドシート列レター（Issue 010・田中さん 2026-07-23
 * 「ヘッダーの項目が ABC…AA AB になっていない」）。
 * ------------------------------------------------------------------
 * カスタム TSV の 1 行目は「型付きヘッダ（列定義）」なので、Excel / Sheets のような
 * A,B,C… の列座標は別レイヤーで必要になる（肉厚ヘッダや表上の補足を載せた検証シートでも
 * 列位置を一意に指せるようにするため）。ここは座標レターを生む純関数だけを持ち、
 * バーの描画は Svelte 側の薄いグルーに任せて node 環境の vitest で検査する。
 */

/**
 * 0 始まりの列インデックスを Excel 式の列レターへ変換する（0→A, 25→Z, 26→AA, 27→AB…）。
 * 26 進の「二分法 base-26」（各桁が 1〜26 を表す bijective base-26）。負値は座標を持たない
 * 列として空文字を返す。
 */
export function columnLabel(index: number): string {
  if (index < 0) return '';
  let n = index;
  let label = '';
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/** 列数ぶんの座標レターを 0 始まりで並べた配列を返す（座標バー描画用）。 */
export function columnLabels(count: number): string[] {
  const labels: string[] = [];
  for (let i = 0; i < count; i++) labels.push(columnLabel(i));
  return labels;
}
