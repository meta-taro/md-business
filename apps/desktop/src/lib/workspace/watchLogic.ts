/**
 * ファイル監視イベントの反応判断（純ロジック）。
 *
 * Rust の watcher が発行する `workspace-file-changed`（`{ relPath, kind }`）を、
 * 現在の画面状態（開いているファイル・未保存編集の有無）に照らして、どう反応するかを
 * 1 つの動作へ落とす。副作用（read / rescan / バナー表示）は呼び出し側の rune ストア／
 * レイアウトが担い、この判断だけを vitest 単体テストする。
 */

/** Rust から届く 1 変更。serde camelCase 済み（`FileChange` と一致）。 */
export interface FileChangeEvent {
  relPath: string;
  /** `'modified'`=内容変更 / `'rescan'`=ツリー構造変更（作成・削除・リネーム）。 */
  kind: 'modified' | 'rescan';
  /**
   * その変更が誰に効くか。`'tree'`=一覧に出る文書 / `'site'`=サイトの部品 /
   * `'config'`=このフォルダの宣言。**送り側（Rust）が決める。**こちらで拡張子を
   * 見分け直すと、同じ表を 2 か所に持つことになる。
   */
  scope: 'tree' | 'site' | 'config';
}

/** 判断に使う現在の画面状態。 */
export interface WatchViewState {
  /** 選択中ファイルの相対パス。未オープンは null。 */
  activePath: string | null;
  /** 開いているファイルに未保存編集があるか。 */
  dirty: boolean;
  /**
   * 今のフォルダで、サイトの部品も一覧に出ているか（web を名乗っているか）。
   * 出ていないフォルダでは追いかける先が無く、出ているフォルダでは業務文書と同じ扱いになる。
   */
  siteVisible: boolean;
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
 * - 宣言が変わったら走査し直す（一覧に出るものが入れ替わる）。
 * - 一覧に出ないものは無視する（web を名乗っていないフォルダのサイトの部品）。
 * - `rescan`（構造変更）は開いているファイル状態に依らず最優先で再走査。
 * - `modified` は「開いているファイルそのもの」の変更だけを扱い、それ以外は無視する。
 *   未編集なら読み直し（reload）、編集中なら編集を守るため competing 表示（conflict）。
 */
export function decideFileChangeAction(
  event: FileChangeEvent,
  view: WatchViewState,
): FileChangeAction {
  // 宣言そのものは一覧にも画面にも出ないが、名乗り方が変わると一覧に出るものが入れ替わる
  // （サイトの部品が出る／出なくなる）。走査し直さないと、名乗りを置いた後に書かれた
  // ファイルがフォルダを開き直すまで出てこない。
  if (event.scope === 'config') return 'rescan';
  // サイトの部品は、web を名乗っていないフォルダでは一覧に出ない＝読み直す先も走査し直す先も無い。
  // 見ているのはブラウザの側なので、そちらの担当（browserPreview）へ回る。
  // 名乗っているフォルダでは一覧に出るので、業務文書と同じように追いかける。ここで無視すると、
  // AI が書いたファイルが一覧に出ないまま残り、書けたのかどうかが利用者から見えない。
  if (event.scope === 'site' && !view.siteVisible) return 'ignore';
  if (event.kind === 'rescan') return 'rescan';
  // ここから kind === 'modified'
  if (view.activePath === null || event.relPath !== view.activePath) return 'ignore';
  return view.dirty ? 'conflict' : 'reload';
}
