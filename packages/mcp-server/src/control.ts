/**
 * 制御チャネル — 親プロセスから stdin 経由で受け取るコマンドの解釈。
 * -----------------------------------------------------------------------------
 * HTTP モードで動かすとき、stdin は MCP の通信路ではなく「アプリ → サーバー」の
 * 制御路になる。改行区切りの JSON を 1 行 1 コマンドとして流す。
 *
 * ここは I/O を持たない純ロジック：バイト列の切り出し（splitControlLines）と
 * 1 行の解釈（parseControlLine）だけを担う。どちらも壊れた入力で例外を投げず、
 * 判定結果として返す — パイプは途中で切れるし、親子でバージョンがずれることも
 * ある。制御チャネルの不調でサーバー本体を落とさないための約束。
 */

/** ワークスペース root の差し替え。アプリ側のフォルダ切り替えに追従する。 */
export interface SetRootCommand {
  type: 'set-root';
  /** 差し替え先の絶対パス。解決は受け取り側（store）が行う。 */
  root: string;
}

export type ControlCommand = SetRootCommand;

export type ControlLineResult =
  | { kind: 'command'; command: ControlCommand }
  /** 空行など、意味を持たない行。 */
  | { kind: 'ignored' }
  /** 解釈できない行。呼び出し側は stderr へ記録して読み進める。 */
  | { kind: 'error'; message: string };

/**
 * 受信済みバッファから完結した行を取り出す。
 *
 * stdin のチャンク境界は行境界と一致しないので、末尾の未完結分は `rest` として
 * 返し、次のチャンクの先頭に連結してもらう。
 */
export function splitControlLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split('\n');
  // 最後の要素は改行で終わっていない断片（バッファが改行で終わる場合は空文字）。
  const rest = parts.pop() ?? '';
  return { lines: parts.map((line) => line.replace(/\r$/, '')), rest };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 1 行を制御コマンドとして解釈する。 */
export function parseControlLine(line: string): ControlLineResult {
  const trimmed = line.trim();
  if (trimmed === '') return { kind: 'ignored' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: 'error', message: '制御コマンドを JSON として解釈できません。' };
  }
  if (!isPlainObject(parsed)) {
    return { kind: 'error', message: '制御コマンドは JSON オブジェクトである必要があります。' };
  }

  const type = parsed['type'];
  if (type !== 'set-root') {
    return { kind: 'error', message: `未知の制御コマンドです: ${String(type)}` };
  }

  const root = parsed['root'];
  if (typeof root !== 'string' || root.trim() === '') {
    // 空 root を通すと store がカレントディレクトリを指してしまう。
    return { kind: 'error', message: 'set-root には空でない root が必要です。' };
  }
  return { kind: 'command', command: { type: 'set-root', root: root.trim() } };
}
