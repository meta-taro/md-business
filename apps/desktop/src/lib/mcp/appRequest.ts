/**
 * MCP サーバーから届く「画面でしかできない操作」の依頼を扱う純ロジック。
 *
 * 文書を画面に出すこと・プレビューを印刷することは、サーバー側では実行できない。
 * サーバーは依頼を投げて応答を待つため、こちらは受けられない理由も必ず言葉にして
 * 返す必要がある（黙ると依頼元は時間切れまで待たされる）。
 *
 * 副作用（listen / invoke / 印刷）は呼び出し側（+layout）に置き、ここは判断だけを持つ。
 */

/** サーバーから届く依頼の種類。 */
export type AppRequestAction = 'export-pdf' | 'open-document';

const ACTIONS: readonly string[] = ['export-pdf', 'open-document'];

/** サーバーから届く依頼。 */
export interface AppRequestPayload {
  id: string;
  action: AppRequestAction;
  /** 対象のワークスペース相対パス。 */
  path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** 依頼イベントの payload を検証して読み取る。読めない形は null（読み飛ばす）。 */
export function parseRequestEvent(payload: unknown): AppRequestPayload | null {
  if (!isRecord(payload)) return null;
  const id = nonEmptyString(payload['id']);
  const path = nonEmptyString(payload['path']);
  if (id === null || path === null) return null;
  const action = payload['action'];
  if (typeof action !== 'string' || !ACTIONS.includes(action)) return null;
  return { id, action: action as AppRequestAction, path };
}

/** 依頼を受けられるかの判断材料。 */
export interface DocumentRequestContext {
  /** 今開いているフォルダの名前。開いていなければ null。 */
  folderName: string | null;
  /** 現在ツリーにあるファイルの相対パス一覧。 */
  knownPaths: readonly string[];
}

export type DocumentRequestPlan = { ok: true; path: string } | { ok: false; error: string };

/**
 * 依頼された文書を扱ってよいか判断する（画面を出す・印刷する に共通）。
 *
 * 依頼元（AI クライアント）は画面の状態を知らないので、断る場合は次に何をすれば
 * よいか分かる言葉で返す。とくに**今どのフォルダを開いているか**を添える。
 * これが無いと、依頼元は自分が別のフォルダを前提にしていることに気づけず、
 * 同じ依頼を繰り返す。
 *
 * フォルダを黙って切り替える案は採らない。人が編集している最中に表示が飛ぶうえ、
 * 依頼元からは飛ばしたことが見えない。
 */
export function planDocumentRequest(
  path: string,
  context: DocumentRequestContext,
): DocumentRequestPlan {
  if (context.folderName === null) {
    return { ok: false, error: 'フォルダが開かれていません（アプリでフォルダを開いてください）' };
  }
  if (!context.knownPaths.includes(path)) {
    return {
      ok: false,
      error: `開いているフォルダ「${context.folderName}」に ${path} がありません`,
    };
  }
  return { ok: true, path };
}

export interface WaitUntilOptions {
  /** 待つ上限（ミリ秒）。依頼元の時間切れより短くする。 */
  timeoutMs: number;
  /** 判定の間隔（ミリ秒）。 */
  stepMs: number;
}

/**
 * 条件が満たされるまで待つ。満たされれば true、時間切れなら false。
 *
 * 文書を開いてもプレビューの描画は 1 拍あとなので、印刷可能になるまで待つ必要がある。
 * ただし描画が終わらない場合に待ち続けると依頼元が先に諦めるため、必ず上限を持つ。
 */
export async function waitUntil(
  predicate: () => boolean,
  options: WaitUntilOptions,
): Promise<boolean> {
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    if (predicate()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, options.stepMs));
  }
}
