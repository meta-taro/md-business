/**
 * MCP サーバーから届く「画面でしかできない操作」の依頼を扱う純ロジック。
 *
 * PDF 出力はプレビューを印刷する機能なので、サーバー側では実行できない。サーバーは
 * 依頼を投げて応答を待つため、こちらは受けられない理由も必ず言葉にして返す必要がある
 * （黙ると依頼元は時間切れまで待たされる）。
 *
 * 副作用（listen / invoke / 印刷）は呼び出し側（+layout）に置き、ここは判断だけを持つ。
 */

/** サーバーから届く依頼。今のところ PDF 出力のみ。 */
export interface AppRequestPayload {
  id: string;
  action: 'export-pdf';
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
  if (payload['action'] !== 'export-pdf') return null;
  return { id, action: 'export-pdf', path };
}

/** PDF 出力を受けられるかの判断材料。 */
export interface ExportPdfContext {
  /** フォルダを開いているか。 */
  hasWorkspace: boolean;
  /** 現在ツリーにあるファイルの相対パス一覧。 */
  knownPaths: readonly string[];
}

export type ExportPdfPlan = { ok: true; path: string } | { ok: false; error: string };

/**
 * 依頼された PDF 出力を実行してよいか判断する。
 *
 * 依頼元（AI クライアント）は画面の状態を知らないので、断る場合は次に何をすれば
 * よいか分かる言葉で返す。
 */
export function planExportPdf(path: string, context: ExportPdfContext): ExportPdfPlan {
  if (!context.hasWorkspace) {
    return { ok: false, error: 'フォルダが開かれていません（アプリでフォルダを開いてください）' };
  }
  if (!context.knownPaths.includes(path)) {
    return { ok: false, error: `開いているフォルダに ${path} がありません` };
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
