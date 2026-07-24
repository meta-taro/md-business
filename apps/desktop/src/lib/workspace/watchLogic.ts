/**
 * ファイル監視イベントの反応判断（純ロジック・DOC-SPEC-DESKTOP-2026-0001 §3.4）。
 *
 * Rust の watcher が発行する `workspace-file-changed`（`{ relPath, kind }`）を、
 * 現在の画面状態（開いているファイル・未保存編集の有無）に照らして、どう反応するかを
 * 1 つの動作へ落とす。副作用（read / rescan / バナー表示）は呼び出し側の rune ストア／
 * レイアウトが担い、この判断だけを vitest 単体テストする（§7.3）。
 */

/** Rust から届く 1 変更。serde camelCase 済み（`FileChange` と一致）。 */
export interface FileChangeEvent {
  relPath: string;
  /** `'modified'`=内容変更 / `'rescan'`=ツリー構造変更（作成・削除・リネーム）。 */
  kind: 'modified' | 'rescan';
}

/** 判断に使う現在の画面状態。 */
export interface WatchViewState {
  /** 選択中ファイルの相対パス。未オープンは null。 */
  activePath: string | null;
  /** 開いているファイルに未保存編集があるか。 */
  dirty: boolean;
}

/**
 * 監視イベントへの反応。
 * - `reload`: 開いているファイルを読み直す（未編集なので破壊しない）。
 * - `rescan`: ツリーを再走査する（開いているファイルは維持する）。
 * - `conflict`: 開いているファイルが外部変更されたが編集中。競合バナーを出す（自動では上書きしない）。
 * - `ignore`: 画面に無関係。何もしない。
 */
export type FileChangeAction = 'reload' | 'rescan' | 'conflict' | 'ignore';

/**
 * 監視イベントと画面状態から反応を決める。
 *
 * - `rescan`（構造変更）は開いているファイル状態に依らず最優先で再走査。
 * - `modified` は「開いているファイルそのもの」の変更だけを扱い、それ以外は無視する。
 *   未編集なら読み直し（reload）、編集中なら編集を守るため competing 表示（conflict）。
 */
export function decideFileChangeAction(
  event: FileChangeEvent,
  view: WatchViewState,
): FileChangeAction {
  if (event.kind === 'rescan') return 'rescan';
  // ここから kind === 'modified'
  if (view.activePath === null || event.relPath !== view.activePath) return 'ignore';
  return view.dirty ? 'conflict' : 'reload';
}
