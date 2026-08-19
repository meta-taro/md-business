/**
 * パスの 1 セグメント（`/` で区切った 1 つの名前）が、文書の置き場所として使えるか。
 * -----------------------------------------------------------------------------
 * ワークスペースの外へ抜ける経路とは別の話で、こちらは「作れてしまうが、後から
 * 開けない・消せない名前」を入口で落とすためにある。外から届いたパスを受け取る所は
 * 複数あるので（MCP のツール引数・共有リンク）、判定は 1 か所に置いて両方から使う。
 *
 * 判定は OS を見ずに常に同じにする。ワークスペースが OS をまたいで持ち運ばれても、
 * 片方でしか開けない文書を作らないため。
 */

/** そのセグメントを受け取れない理由。 */
export type UnusableSegmentReason = 'stream-separator' | 'reserved-device-name';

/**
 * Windows の予約デバイス名。拡張子を付けても予約のまま扱われる。
 */
const RESERVED_DEVICE_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 10 }, (_, i) => `com${i}`),
  ...Array.from({ length: 10 }, (_, i) => `lpt${i}`),
]);

/**
 * 受け取れないなら理由を、受け取れるなら null を返す。
 *
 * - `stream-separator`: NTFS の代替データストリーム（`a.md:x`）。書き込みは通るが、
 *   内容は本体ファイルの裏側へ入りファイル一覧には現れない＝アプリから見えない文書ができる。
 * - `reserved-device-name`: `CON` / `con.md` は該当、`console.md` は非該当。
 */
export function unusableSegmentReason(segment: string): UnusableSegmentReason | null {
  if (segment.includes(':')) return 'stream-separator';
  const stem = segment.split('.')[0] ?? '';
  if (RESERVED_DEVICE_NAMES.has(stem.toLowerCase())) return 'reserved-device-name';
  return null;
}
