/**
 * 同梱の MCP サーバーから「このファイルを画面に出して」を受け取る口。
 * -----------------------------------------------------------------------------
 * サーバーは別プロセスで動くので、VS Code の API を直接は呼べない。拡張が名前付きパイプ
 * （Windows）/ UNIX ソケットで待ち受け、在り処を環境変数でサーバーへ渡す。
 * 話し方は 1 行の JSON を 1 往復するだけ（`{"path": 絶対パス}` → `{"ok": true}`）。
 *
 * 同じ PC の別のプロセスも繋げてしまうので、開いてよいのは開いているワークスペースの中だけにする。
 */
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { posix, win32 } from 'node:path';

export type OpenReply = { ok: true } | { ok: false; error: string };

export type OpenRequestResult = { ok: true; path: string } | { ok: false; error: string };

/** 窓ごとに別の口にする。複数の窓が同じ名前を取り合わないよう乱数を付ける。 */
export function bridgePipePath(
  platform: NodeJS.Platform,
  tmpdir: string,
  id: string = randomBytes(8).toString('hex'),
): string {
  const name = `md-business-vscode-${id}`;
  return platform === 'win32' ? `\\\\.\\pipe\\${name}` : posix.join(tmpdir, `${name}.sock`);
}

/** 受け取った 1 行を読み、開いてよいファイルの絶対パスに決める。 */
export function resolveOpenRequest(
  line: string,
  folders: readonly string[],
  platform: NodeJS.Platform,
): OpenRequestResult {
  let path: unknown;
  try {
    const value: unknown = JSON.parse(line);
    path = typeof value === 'object' && value !== null && 'path' in value ? value.path : undefined;
  } catch {
    return { ok: false, error: '依頼を読めませんでした。' };
  }
  if (typeof path !== 'string' || path === '') return { ok: false, error: '依頼を読めませんでした。' };

  const lib = platform === 'win32' ? win32 : posix;
  if (!lib.isAbsolute(path)) return { ok: false, error: '絶対パスで依頼してください。' };
  const target = lib.normalize(path);
  // Windows はドライブ名の大小が揃わないことがある（c:\ と C:\）。
  const same = (a: string): string => (platform === 'win32' ? a.toLowerCase() : a);
  const inside = folders.some((folder) => {
    const rel = lib.relative(same(lib.normalize(folder)), same(target));
    return rel !== '' && !rel.startsWith('..') && !lib.isAbsolute(rel);
  });
  return inside
    ? { ok: true, path: target }
    : { ok: false, error: 'VS Code で開いているワークスペースの外は開けません。' };
}

export interface OpenBridge {
  pipe: string;
  dispose(): void;
}

/** 待ち受けを始める。依頼 1 件ごとに `handle` を呼び、その結果を返す。 */
export async function startOpenBridge(
  pipe: string,
  handle: (line: string) => Promise<OpenReply>,
): Promise<OpenBridge> {
  const server: Server = createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let answered = false;
    socket.on('data', (chunk: string) => {
      if (answered) return;
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end === -1) return;
      answered = true;
      handle(buffer.slice(0, end))
        .catch((error: unknown): OpenReply => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }))
        .then((reply) => socket.end(`${JSON.stringify(reply)}\n`));
    });
    socket.on('error', () => socket.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(pipe, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return { pipe, dispose: () => server.close() };
}
