/**
 * ツール実行 1 件分の操作ログ entry と、その組み立て純ロジック。
 * -----------------------------------------------------------------------------
 * MCP サーバーは各ツールの実行後にこの entry を `onLog` へ渡す。発火（副作用）は
 * server 側が担い、ここは「結果からどんな entry になるか」だけを決める純関数に閉じる
 * （時刻はテスト決定性のため呼び出し側が確定して渡す）。
 */

/** ツール実行の結果を 1 行の操作ログに落としたもの。UI（MCP タブ）へ流す最小形。 */
export interface ToolLogEntry {
  /** 種別タグ。他イベントと混在しても弁別できるよう固定文字列にする。 */
  type: 'log';
  /** 実行したツール名（read_document など）。 */
  tool: string;
  /** ツールが成否どちらで返ったか。 */
  ok: boolean;
  /** 実行時刻（epoch ミリ秒）。呼び出し側が確定して渡す。 */
  ts: number;
  /** 対象のワークスペース相対パス。パスを持たないツール（list_schemas 等）では省く。 */
  path?: string;
  /** 失敗理由など補足。成功時は持たせない。 */
  detail?: string;
}

/** entry を組むのに参照するツール結果の最小形（成功・失敗の共通部分だけ見る）。 */
export interface ToolResultLike {
  ok: boolean;
  /** 成功結果が持つ正規化済みパス。対象がワークスペース全体の結果は null を持つ。 */
  path?: string | null;
  /** 失敗結果が持つ日本語理由。 */
  error?: string;
}

/**
 * ツール結果 + 引数パス + 時刻から操作ログ entry を組む。
 *
 * - `path` は成功結果の正規化済み `result.path` を最優先し、無ければ（null 含む）引数の
 *   `argPath`（失敗時のフォールバック）を使う。どちらも無いツールでは省略する。
 * - `detail` は失敗時のみ `error` を載せる（成功時は付けない）。
 */
export function buildToolLogEntry(
  tool: string,
  result: ToolResultLike,
  argPath: string | undefined,
  ts: number,
): ToolLogEntry {
  const entry: ToolLogEntry = { type: 'log', tool, ok: result.ok, ts };
  const path = result.path ?? argPath;
  if (path !== undefined) entry.path = path;
  if (!result.ok && result.error !== undefined) entry.detail = result.error;
  return entry;
}
