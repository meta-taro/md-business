/**
 * エディタ（VS Code 拡張）から起動されたときに、対象ファイルをそのエディタで開く口。
 * -----------------------------------------------------------------------------
 * 拡張はサーバーを起こす前に待ち受け口（名前付きパイプ / UNIX ソケット）を開き、その在り処を
 * 環境変数 `MD_BUSINESS_EDITOR_PIPE` で渡す。ここは開いてほしいファイルの絶対パスを 1 行の
 * JSON で送り、拡張から 1 行の JSON で結果を受け取る。
 *
 * デスクトップアプリを起こさないのは、拡張から繋いでいる人は VS Code で作業しているから。
 * アプリが入っていない PC でも画面に出せるようにする。
 */
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join as nodeJoin } from 'node:path';
import type { DesktopOpenResult, DesktopOpener } from './desktopOpener.js';
import { safeRelativePath } from './workspacePath.js';

/** エディタへ送る依頼（1 行の JSON）。 */
export interface EditorOpenRequest {
  path: string;
}

/** エディタから返る結果（1 行の JSON）。 */
export type EditorOpenReply = { ok: true } | { ok: false; error: string };

export type SendToEditor = (pipe: string, request: EditorOpenRequest) => Promise<EditorOpenReply>;

/** 拡張が応えないまま待ち続けると、呼んだ AI の手番が止まる。 */
const REPLY_TIMEOUT_MS = 5000;

/** 待ち受け口へ繋いで 1 往復だけ話す。 */
export const sendToEditor: SendToEditor = (pipe, request) =>
  new Promise((resolve) => {
    const socket = createConnection(pipe);
    let buffer = '';
    let settled = false;
    const finish = (reply: EditorOpenReply): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reply);
    };
    socket.setTimeout(REPLY_TIMEOUT_MS, () =>
      finish({ ok: false, error: 'VS Code から応答がありませんでした。' }),
    );
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end === -1) return;
      finish(parseReply(buffer.slice(0, end)));
    });
    socket.on('error', (error: NodeJS.ErrnoException) =>
      // 相手が先に切ると、OS によっては close より先に書き込みが EPIPE / ECONNRESET で失敗する。
      finish(
        error.code === 'EPIPE' || error.code === 'ECONNRESET'
          ? { ok: false, error: 'VS Code が応答の前に接続を閉じました。' }
          : { ok: false, error: `VS Code へ繋げませんでした: ${error.message}` },
      ),
    );
    socket.on('close', () =>
      finish({ ok: false, error: 'VS Code が応答の前に接続を閉じました。' }),
    );
  });

function parseReply(line: string): EditorOpenReply {
  try {
    const value: unknown = JSON.parse(line);
    if (typeof value === 'object' && value !== null && 'ok' in value) {
      if (value.ok === true) return { ok: true };
      const error = 'error' in value && typeof value.error === 'string' ? value.error : undefined;
      if (error !== undefined) return { ok: false, error };
    }
  } catch {
    // 下で読めなかったことを返す。
  }
  return { ok: false, error: 'VS Code からの応答を読めませんでした。' };
}

export interface EditorOpenerOptions {
  /** 現在のワークスペース root。set-root で変わるので、開くたびに読み直す。 */
  getRoot: () => string;
  /** 拡張が開いた待ち受け口の在り処。 */
  pipe: string;
  exists?: (path: string) => boolean;
  join?: (...parts: string[]) => string;
  send?: SendToEditor;
}

export function createEditorOpener(options: EditorOpenerOptions): DesktopOpener {
  const { getRoot, pipe, exists = existsSync, join = nodeJoin, send = sendToEditor } = options;
  return {
    async open(relativePath: string): Promise<DesktopOpenResult> {
      const safe = safeRelativePath(relativePath);
      if (!safe.ok) return { ok: false, error: safe.reason };

      // 拡張側でも確かめるが、打ち間違いはここで止めたほうが理由が具体的に返せる。
      const target = join(getRoot(), safe.relative);
      if (!exists(target)) {
        return { ok: false, error: `ワークスペースに ${safe.relative} がありません。` };
      }

      const reply = await send(pipe, { path: target });
      return reply.ok ? { ok: true, path: safe.relative } : reply;
    },
  };
}
