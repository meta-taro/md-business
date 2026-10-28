import { afterEach, describe, expect, it } from 'vitest';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';

import {
  bridgePipePath,
  resolveOpenRequest,
  startOpenBridge,
  type OpenBridge,
} from '../src/mcp/openBridge.js';

describe('bridgePipePath', () => {
  it('Windows では名前付きパイプにする', () => {
    expect(bridgePipePath('win32', 'C:/Temp', 'abc')).toBe('\\\\.\\pipe\\md-business-vscode-abc');
  });

  it('それ以外は一時フォルダのソケットにする', () => {
    expect(bridgePipePath('darwin', '/tmp', 'abc')).toBe('/tmp/md-business-vscode-abc.sock');
  });

  it('呼ぶたびに別の口になる', () => {
    expect(bridgePipePath('linux', '/tmp')).not.toBe(bridgePipePath('linux', '/tmp'));
  });
});

describe('resolveOpenRequest', () => {
  const folders = ['C:\\work\\docs'];

  it('ワークスペースの中のファイルは開いてよい', () => {
    expect(resolveOpenRequest('{"path":"C:\\\\work\\\\docs\\\\a.md"}', folders, 'win32')).toEqual({
      ok: true,
      path: 'C:\\work\\docs\\a.md',
    });
  });

  it('Windows ではドライブ名の大小を区別しない', () => {
    expect(resolveOpenRequest('{"path":"c:/work/docs/specs/a.md"}', folders, 'win32').ok).toBe(true);
  });

  it('ワークスペースの外は断る', () => {
    expect(resolveOpenRequest('{"path":"C:/work/other/a.md"}', folders, 'win32')).toEqual({
      ok: false,
      error: 'VS Code で開いているワークスペースの外は開けません。',
    });
    expect(resolveOpenRequest('{"path":"C:/work/docs/../x.md"}', folders, 'win32').ok).toBe(false);
    expect(resolveOpenRequest('{"path":"C:/work/docs"}', folders, 'win32').ok).toBe(false);
  });

  it('似た名前のフォルダを中と取り違えない', () => {
    expect(resolveOpenRequest('{"path":"/w/docs2/a.md"}', ['/w/docs'], 'linux').ok).toBe(false);
    expect(resolveOpenRequest('{"path":"/w/docs/a.md"}', ['/w/docs'], 'linux').ok).toBe(true);
  });

  it('相対パスは断る', () => {
    expect(resolveOpenRequest('{"path":"a.md"}', folders, 'win32')).toEqual({
      ok: false,
      error: '絶対パスで依頼してください。',
    });
  });

  it('読めない依頼は断る', () => {
    for (const line of ['???', '{}', '{"path":3}', 'null']) {
      expect(resolveOpenRequest(line, folders, 'win32')).toEqual({
        ok: false,
        error: '依頼を読めませんでした。',
      });
    }
  });
});

describe('startOpenBridge', () => {
  let bridge: OpenBridge | undefined;
  afterEach(() => {
    bridge?.dispose();
    bridge = undefined;
  });

  const ask = (pipe: string, text: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const socket = createConnection(pipe, () => socket.write(text));
      let out = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => (out += chunk));
      socket.on('end', () => resolve(out));
      socket.on('error', reject);
    });

  it('1 行を受け取って処理し、結果を 1 行で返す', async () => {
    const seen: string[] = [];
    bridge = await startOpenBridge(bridgePipePath(process.platform, tmpdir()), async (line) => {
      seen.push(line);
      return { ok: true };
    });
    await expect(ask(bridge.pipe, '{"path":"x"}\n')).resolves.toBe('{"ok":true}\n');
    expect(seen).toEqual(['{"path":"x"}']);
  });

  it('処理が失敗したら理由を返す', async () => {
    bridge = await startOpenBridge(bridgePipePath(process.platform, tmpdir()), async () => {
      throw new Error('開けません');
    });
    await expect(ask(bridge.pipe, 'x\n')).resolves.toBe('{"ok":false,"error":"開けません"}\n');
  });

  it('同じ口を二重に取ろうとしたら失敗する', async () => {
    const pipe = bridgePipePath(process.platform, tmpdir());
    bridge = await startOpenBridge(pipe, async () => ({ ok: true }));
    await expect(startOpenBridge(pipe, async () => ({ ok: true }))).rejects.toThrow();
  });
});
