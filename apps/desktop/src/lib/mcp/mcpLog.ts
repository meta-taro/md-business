/**
 * 組み込み MCP サーバーの状態・操作ログを扱う純ロジック。
 *
 * Rust 側から届くイベントは外部入力に近い（サーバーの版が進めば知らない形も来る）ので、
 * 受け取り口で必ず検証してから画面状態へ入れる。ここには副作用を置かず、ストア
 * （mcp.svelte.ts）が invoke / listen を担う。
 */

/** サイドカーの接続状態。Rust の `McpState` と 1:1。 */
export type McpState = 'starting' | 'ready' | 'unavailable';

/** Rust から届くサイドカーの状態。未確定の項目は null で来る。 */
export interface McpStatus {
  state: McpState;
  /** 接続先 URL（接続可能なときのみ）。 */
  url: string | null;
  port: number | null;
  /** bearer トークン。AI クライアント側の設定へ貼るため画面に出す。 */
  token: string | null;
  /** 劣化理由など、人が読む補足。 */
  detail: string | null;
}

/** ツール実行 1 件の操作ログ。MCP タブの 1 行に対応する。 */
export interface McpLogEntry {
  /** 実行されたツール名。 */
  tool: string;
  ok: boolean;
  /** 実行時刻（epoch ミリ秒）。 */
  ts: number;
  /** 対象のワークスペース相対パス。パスを持たないツールでは無い。 */
  path?: string;
  /** 失敗理由など補足。 */
  detail?: string;
}

/**
 * 保持する操作ログの上限。長時間使うと際限なく増えるため、古い行から捨てる。
 * 画面で遡れれば足りる量として 500 件を上限にする。
 */
export const MCP_LOG_CAP = 500;

/**
 * 操作ログを 1 件足す。新しいものが先頭で、上限を超えたぶんは末尾（古い側）から落ちる。
 * 元の配列は書き換えない（rune の再描画を確実に起こすため）。
 */
export function appendLog(
  entries: readonly McpLogEntry[],
  entry: McpLogEntry,
  cap: number = MCP_LOG_CAP,
): McpLogEntry[] {
  return [entry, ...entries].slice(0, cap);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * `mcp-log` イベントの payload を操作ログとして解釈する。読めない形は null（読み飛ばす）。
 * 補足項目（path / detail）は型が合うときだけ載せ、合わなくても本体は捨てない。
 */
export function parseLogEvent(payload: unknown): McpLogEntry | null {
  if (!isRecord(payload)) return null;
  if (payload['type'] !== 'log') return null;
  const { tool, ok, ts, path, detail } = payload;
  if (typeof tool !== 'string' || typeof ok !== 'boolean' || typeof ts !== 'number') return null;
  return {
    tool,
    ok,
    ts,
    ...(typeof path === 'string' ? { path } : {}),
    ...(typeof detail === 'string' ? { detail } : {}),
  };
}

/** 実行時刻を時分秒で表す（日付は同一セッション内でほぼ同じなので省く）。 */
export function formatLogTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 接続状態を 1 行の説明にする（接続先 URL / 起動中 / 劣化理由）。 */
export function connectionHint(status: McpStatus): string {
  if (status.state === 'ready' && status.url !== null) return status.url;
  if (status.state === 'unavailable') return status.detail ?? '利用できません';
  return '起動中…';
}
