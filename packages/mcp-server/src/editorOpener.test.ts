import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEditorOpener, sendToEditor } from './editorOpener.js';

const ROOT = 'C:/work/docs';
const joinSlash = (...parts: string[]): string => parts.join('/');

describe('createEditorOpener', () => {
  it('ワークスペースの中のファイルを絶対パスにしてエディタへ送る', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const opener = createEditorOpener({
      getRoot: () => ROOT,
      pipe: 'PIPE',
      exists: () => true,
      join: joinSlash,
      send,
    });

    await expect(opener.open('specs/./a.md')).resolves.toEqual({ ok: true, path: 'specs/a.md' });
    expect(send).toHaveBeenCalledWith('PIPE', { path: 'C:/work/docs/specs/a.md' });
  });

  it('ワークスペースの外は送らずに断る', async () => {
    const send = vi.fn();
    const opener = createEditorOpener({ getRoot: () => ROOT, pipe: 'PIPE', exists: () => true, send });

    const result = await opener.open('../secret.md');
    expect(result.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('無いファイルは送らずに、どれが無いかを返す', async () => {
    const send = vi.fn();
    const opener = createEditorOpener({ getRoot: () => ROOT, pipe: 'PIPE', exists: () => false, send });

    await expect(opener.open('a.md')).resolves.toEqual({
      ok: false,
      error: 'ワークスペースに a.md がありません。',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('エディタが断った理由をそのまま返す', async () => {
    const opener = createEditorOpener({
      getRoot: () => ROOT,
      pipe: 'PIPE',
      exists: () => true,
      send: async () => ({ ok: false, error: '開けませんでした' }),
    });
    await expect(opener.open('a.md')).resolves.toEqual({ ok: false, error: '開けませんでした' });
  });
});

describe('sendToEditor', () => {
  let server: Server | undefined;
  let counter = 0;

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  const pipePath = (): string => {
    counter += 1;
    const name = `md-business-editor-test-${process.pid}-${counter}`;
    return process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`);
  };

  const listen = async (onLine: (line: string, reply: (text: string) => void) => void) => {
    const pipe = pipePath();
    server = createServer((socket) => {
      socket.setEncoding('utf8');
      let buffer = '';
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        const end = buffer.indexOf('\n');
        if (end !== -1) onLine(buffer.slice(0, end), (text) => socket.write(text));
      });
    });
    await new Promise<void>((resolve) => server!.listen(pipe, resolve));
    return pipe;
  };

  it('1 行の JSON を送り、1 行の JSON を受け取る', async () => {
    const received: string[] = [];
    const pipe = await listen((line, reply) => {
      received.push(line);
      reply('{"ok":true}\n');
    });

    await expect(sendToEditor(pipe, { path: 'C:/work/a.md' })).resolves.toEqual({ ok: true });
    expect(received).toEqual(['{"path":"C:/work/a.md"}']);
  });

  it('エディタが返した理由を受け取る', async () => {
    const pipe = await listen((_line, reply) => reply('{"ok":false,"error":"外です"}\n'));
    await expect(sendToEditor(pipe, { path: 'x' })).resolves.toEqual({ ok: false, error: '外です' });
  });

  it('読めない応答は読めなかったと返す', async () => {
    const pipe = await listen((_line, reply) => reply('???\n'));
    await expect(sendToEditor(pipe, { path: 'x' })).resolves.toEqual({
      ok: false,
      error: 'VS Code からの応答を読めませんでした。',
    });
  });

  it('待ち受けが無ければ繋げなかったと返す', async () => {
    const result = await sendToEditor(pipePath(), { path: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/^VS Code へ繋げませんでした/);
  });

  it('応答の前に閉じられたらそう返す', async () => {
    const pipe = pipePath();
    server = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => server!.listen(pipe, resolve));
    await expect(sendToEditor(pipe, { path: 'x' })).resolves.toEqual({
      ok: false,
      error: 'VS Code が応答の前に接続を閉じました。',
    });
  });
});
