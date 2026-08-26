/**
 * 組み込み MCP サーバーの状態・操作ログを扱う純ロジック。
 *
 * Rust 側から届くイベントは外部入力に近い（サーバーの版が進めば知らない形も来る）ので、
 * 受け取り口で必ず検証してから画面状態へ入れる。ここには副作用を置かず、ストア
 * （mcp.svelte.ts）が invoke / listen を担う。
 */

import type { MessageKey } from '../i18n/messages';

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
  /** 劣化理由のコード（Rust の `McpReason`）。表示文言はこちらの辞書が決める。 */
  reason: string | null;
  /** サーバーが報告した原文（診断用）。訳せないので理由コードの補助に留める。 */
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

/**
 * 劣化理由コード → 文言キーの対応表。サーバー側が新しい理由を足しても画面が壊れないよう、
 * 知らないコードは既定の文言へ倒す（表に無い＝未知）。
 */
const REASON_KEYS: Record<string, MessageKey> = {
  'sidecar-missing': 'mcp.reason.sidecarMissing',
  'node-missing': 'mcp.reason.nodeMissing',
  'spawn-failed': 'mcp.reason.spawnFailed',
  'no-output': 'mcp.reason.noOutput',
  'exited-early': 'mcp.reason.exitedEarly',
  'server-error': 'mcp.reason.serverError',
  'status-unreadable': 'mcp.reason.statusUnreadable',
};

/** 劣化理由コードを文言キーへ写す。未知のコード・未設定は既定の文言キー。 */
export function reasonMessageKey(reason: string | null): MessageKey {
  if (reason === null) return 'mcp.reason.unknown';
  return REASON_KEYS[reason] ?? 'mcp.reason.unknown';
}

/**
 * 接続状態の表示内容。URL は訳す対象ではないので、翻訳が要る場合とは別物として返す
 * （画面側は kind で描き分ける）。
 */
export type ConnectionText = { kind: 'url'; url: string } | { kind: 'key'; key: MessageKey };

/** 接続状態を画面に出す 1 行にする（接続先 URL / 起動中 / 劣化理由）。 */
export function connectionText(status: McpStatus): ConnectionText {
  if (status.state === 'ready' && status.url !== null) return { kind: 'url', url: status.url };
  if (status.state === 'unavailable') {
    return { kind: 'key', key: reasonMessageKey(status.reason) };
  }
  return { kind: 'key', key: 'mcp.starting' };
}

/** ステータスバーの MCP 表示（短い文言と点の色）。 */
export interface McpIndicator {
  key: MessageKey;
  /** 点の見た目。`ok`=稼働中 / `neutral`=起動中 / `warn`=使えない。 */
  tone: 'ok' | 'neutral' | 'warn';
}

/**
 * ステータスバーに出す短い状態表示を決める。
 *
 * 常に見えている場所なので、詳細（URL・劣化理由）は MCP タブに任せ、ここは
 * 「動いているか」だけを一目で分かる形にする。
 */
export function indicatorText(status: McpStatus): McpIndicator {
  if (status.state === 'ready') return { key: 'status.mcpReady', tone: 'ok' };
  if (status.state === 'unavailable') return { key: 'status.mcpOff', tone: 'warn' };
  return { key: 'status.mcpStarting', tone: 'neutral' };
}

/** ツール実行がワークスペースに与えた変化（ファイル監視イベントと同じ形）。 */
export interface McpFileChange {
  relPath: string;
  kind: 'modified' | 'rescan';
  scope: 'tree' | 'site' | 'config';
}

/**
 * 書き込み系ツールの実行ログを、ワークスペースの変化として読み替える。
 *
 * AI が書いた結果は、利用者が何もしなくても画面へ出るべきもの。ファイル監視だけに
 * 頼ると検知が届かない環境（監視の初期化に失敗した場合など）で取りこぼすため、
 * サーバー自身の実行ログからも同じ更新を起こす。読み取り系・失敗した実行は変化なし。
 */
export function fileChangeFromLog(entry: McpLogEntry): McpFileChange | null {
  if (!entry.ok || entry.path === undefined) return null;
  // 作成はツリーの構造が変わる。更新は中身だけなので、開いているファイルだけが対象。
  if (entry.tool === 'create_document') {
    return { relPath: entry.path, kind: 'rescan', scope: 'tree' };
  }
  if (entry.tool === 'update_document') {
    return { relPath: entry.path, kind: 'modified', scope: 'tree' };
  }
  // 検証シートの行追加・行更新も既存ファイルへの書き込み（新規作成はしない）。
  if (entry.tool === 'append_tsv_row' || entry.tool === 'update_tsv_row') {
    return { relPath: entry.path, kind: 'modified', scope: 'tree' };
  }
  // 宣言が置かれたら、それを読み直す側へ回す（監視が張れない環境でも気づけるように）。
  if (entry.tool === 'declare_web_mode') {
    return { relPath: entry.path, kind: 'modified', scope: 'config' };
  }
  return null;
}
