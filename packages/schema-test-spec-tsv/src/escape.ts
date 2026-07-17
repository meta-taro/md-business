/**
 * カスタム TSV セル値のバックスラッシュエスケープ / アンエスケープ。
 *
 * このパッケージのフォーマット（Issue 010）は「1 レコード = 1 物理行」を絶対制約とする。
 * セル内にタブ・改行・復帰が混じっても行が分割されないよう、これらをバックスラッシュ表記に
 * 畳み込む。CSV 風の `"..."` クォートを使わない理由は、クォートだと改行セルが複数物理行に
 * 跨り、git の行単位 diff が壊れるため（md-business の核心価値 = diff/履歴レビューが効くこと）。
 *
 * エスケープ対応表（これ以外の文字は生のまま）:
 *
 * | 実際の文字        | TSV 表記 |
 * |-------------------|----------|
 * | タブ   U+0009     | `\t`     |
 * | 改行LF U+000A     | `\n`     |
 * | 復帰CR U+000D     | `\r`     |
 * | バックスラッシュ  | `\\`     |
 */

/**
 * 生のセル値を TSV 表記へエスケープする。
 *
 * バックスラッシュを最初に畳むことで（`\` → `\\`）、後続のトークン文字と衝突しない。
 * `|`・引用符・全角記号などは特別扱いせず生のまま通す。
 */
export function escapeCell(value: string): string {
  let out = '';
  for (const ch of value) {
    switch (ch) {
      case '\\':
        out += '\\\\';
        break;
      case '\t':
        out += '\\t';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\r':
        out += '\\r';
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/**
 * TSV 表記のセルを生のセル値へアンエスケープする。
 *
 * 単一パス走査で実装する（replace チェーンにしない）。理由: `\\t`（エスケープされた
 * バックスラッシュ + 文字 t）を `\t`（タブ）へ誤変換しないため。左から 1 文字ずつ読み、
 * `\` を見たら次の 1 文字だけをエスケープシーケンスとして消費する。
 *
 * - `\t` `\n` `\r` `\\` → それぞれ タブ / LF / CR / `\`
 * - 未知のエスケープ（例 `\x`）や末尾の孤立 `\` は、バックスラッシュを literal として温存
 *   （`escapeCell` は既知の 4 種しか生成しないが、外部入力の堅牢性のため）。
 */
export function unescapeCell(cell: string): string {
  let out = '';
  for (let i = 0; i < cell.length; i++) {
    const ch = cell[i];
    if (ch === '\\' && i + 1 < cell.length) {
      const next = cell[i + 1];
      switch (next) {
        case 't':
          out += '\t';
          i++;
          break;
        case 'n':
          out += '\n';
          i++;
          break;
        case 'r':
          out += '\r';
          i++;
          break;
        case '\\':
          out += '\\';
          i++;
          break;
        default:
          // 未知のエスケープ: バックスラッシュを literal として残し、次文字は次周回で処理
          out += '\\';
      }
    } else {
      out += ch;
    }
  }
  return out;
}
