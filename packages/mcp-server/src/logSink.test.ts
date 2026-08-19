import { describe, expect, it, vi } from 'vitest';
import { createLogSink, type LogFs } from './logSink';
import type { ToolLogEntry } from './toolLog';

function fakeFs(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const dirs = new Set<string>();
  const fs: LogFs = {
    readText: (path) => files.get(path) ?? null,
    ensureDir: (path) => {
      dirs.add(path);
    },
    append: (path, text) => {
      files.set(path, (files.get(path) ?? '') + text);
    },
    writeText: (path, text) => {
      files.set(path, text);
    },
    list: (path) =>
      [...files.keys()]
        .filter((name) => name.startsWith(`${path}/`))
        .map((name) => name.slice(path.length + 1))
        .filter((name) => !name.includes('/')),
    archive: (from, to) => {
      files.set(to, files.get(from) ?? '');
      files.delete(from);
    },
    remove: (path) => {
      files.delete(path);
    },
  };
  return { fs, files, dirs };
}

const ENTRY: ToolLogEntry = { type: 'log', tool: 'read_document', ok: true, ts: 0 };

function at(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 10).getTime();
}

describe('残す', () => {
  it('その日のファイルへ 1 行ずつ足す', () => {
    const { fs, files } = fakeFs();
    const write = createLogSink({ getRoot: () => '/w', fs });
    write({ ...ENTRY, ts: at(2026, 8, 14) });
    write({ ...ENTRY, tool: 'read_tsv', ts: at(2026, 8, 14) });
    const written = files.get('/w/.md-business/logs/2026-08-14.jsonl') ?? '';
    expect(written.trimEnd().split('\n')).toHaveLength(2);
    expect(JSON.parse(written.split('\n')[1] ?? '{}').tool).toBe('read_tsv');
  });

  it('日付が変われば別のファイルになる', () => {
    const { fs, files } = fakeFs();
    const write = createLogSink({ getRoot: () => '/w', fs });
    write({ ...ENTRY, ts: at(2026, 8, 14) });
    write({ ...ENTRY, ts: at(2026, 8, 15) });
    expect(files.has('/w/.md-business/logs/2026-08-14.jsonl')).toBe(true);
    expect(files.has('/w/.md-business/logs/2026-08-15.jsonl')).toBe(true);
  });

  it('ログ本体は Git に乗せない', () => {
    const { fs, files } = fakeFs();
    createLogSink({ getRoot: () => '/w', fs })(ENTRY);
    expect(files.get('/w/.md-business/.gitignore')).toContain('logs/');
  });

  it('既にある .gitignore は書き換えない', () => {
    const { fs, files } = fakeFs({ '/w/.md-business/.gitignore': '手で書いた\n' });
    createLogSink({ getRoot: () => '/w', fs })(ENTRY);
    expect(files.get('/w/.md-business/.gitignore')).toBe('手で書いた\n');
  });

  it('設定で切ってあれば書かない', () => {
    const { fs, files } = fakeFs({ '/w/.md-business/config.json': '{"log":{"enabled":false}}' });
    createLogSink({ getRoot: () => '/w', fs })(ENTRY);
    expect([...files.keys()]).toEqual(['/w/.md-business/config.json']);
  });

  it('開いているフォルダが変われば、そちらへ書く', () => {
    const { fs, files } = fakeFs();
    let root = '/a';
    const write = createLogSink({ getRoot: () => root, fs });
    write({ ...ENTRY, ts: at(2026, 8, 14) });
    root = '/b';
    write({ ...ENTRY, ts: at(2026, 8, 14) });
    expect(files.has('/a/.md-business/logs/2026-08-14.jsonl')).toBe(true);
    expect(files.has('/b/.md-business/logs/2026-08-14.jsonl')).toBe(true);
  });

  it('設定を読み直すのはフォルダごとに 1 度', () => {
    const { fs } = fakeFs();
    const readText = vi.spyOn(fs, 'readText');
    const write = createLogSink({ getRoot: () => '/w', fs });
    write(ENTRY);
    write(ENTRY);
    write(ENTRY);
    expect(readText.mock.calls.filter((c) => String(c[0]).endsWith('config.json'))).toHaveLength(1);
  });
});

describe('書けなくても止めない', () => {
  it('書き込みが投げても呼び出し側へ伝えない', () => {
    const { fs } = fakeFs();
    fs.append = () => {
      throw new Error('読み取り専用');
    };
    const write = createLogSink({ getRoot: () => '/w', fs });
    expect(() => write(ENTRY)).not.toThrow();
  });

  it('設定が壊れていても既定で書き、理由を伝える', () => {
    const { fs, files } = fakeFs({ '/w/.md-business/config.json': '{壊れている' });
    const warn = vi.fn();
    createLogSink({ getRoot: () => '/w', fs, warn })({ ...ENTRY, ts: at(2026, 8, 14) });
    expect(files.has('/w/.md-business/logs/2026-08-14.jsonl')).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('config.json'));
  });

  it('理由を伝える先が無くても落ちない', () => {
    const { fs } = fakeFs({ '/w/.md-business/config.json': '{壊れている' });
    expect(() => createLogSink({ getRoot: () => '/w', fs })(ENTRY)).not.toThrow();
  });
});

describe('古い分を畳む', () => {
  it('期限を過ぎたファイルを archive へ移す', () => {
    const { fs, files } = fakeFs({ '/w/.md-business/logs/2026-07-10.jsonl': '古い\n' });
    createLogSink({ getRoot: () => '/w', fs })({ ...ENTRY, ts: at(2026, 8, 14) });
    expect(files.has('/w/.md-business/logs/2026-07-10.jsonl')).toBe(false);
    expect(files.get('/w/.md-business/logs/archive/2026-07-10.jsonl.gz')).toBe('古い\n');
  });

  it('delete と書いてあれば消す', () => {
    const { fs, files } = fakeFs({
      '/w/.md-business/config.json': '{"log":{"onExpire":"delete"}}',
      '/w/.md-business/logs/2026-07-10.jsonl': '古い\n',
    });
    createLogSink({ getRoot: () => '/w', fs })({ ...ENTRY, ts: at(2026, 8, 14) });
    expect(files.has('/w/.md-business/logs/2026-07-10.jsonl')).toBe(false);
    expect(files.has('/w/.md-business/logs/archive/2026-07-10.jsonl.gz')).toBe(false);
  });

  it('畳むのはフォルダごとに 1 度（毎回フォルダを数え直さない）', () => {
    const { fs } = fakeFs({ '/w/.md-business/logs/2026-07-10.jsonl': '古い\n' });
    const list = vi.spyOn(fs, 'list');
    const write = createLogSink({ getRoot: () => '/w', fs });
    write({ ...ENTRY, ts: at(2026, 8, 14) });
    write({ ...ENTRY, ts: at(2026, 8, 14) });
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('畳めなくても書き込みは続ける', () => {
    const { fs, files } = fakeFs({ '/w/.md-business/logs/2026-07-10.jsonl': '古い\n' });
    fs.archive = () => {
      throw new Error('無理');
    };
    createLogSink({ getRoot: () => '/w', fs })({ ...ENTRY, ts: at(2026, 8, 14) });
    expect(files.has('/w/.md-business/logs/2026-08-14.jsonl')).toBe(true);
  });
});
