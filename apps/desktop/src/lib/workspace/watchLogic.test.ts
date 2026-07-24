import { describe, it, expect } from 'vitest';
import { decideFileChangeAction, type FileChangeEvent } from './watchLogic';

/** テスト補助：kind と relPath から監視イベントを組み立てる。 */
function ev(kind: FileChangeEvent['kind'], relPath: string): FileChangeEvent {
  return { kind, relPath };
}

describe('decideFileChangeAction', () => {
  it('rescan は開いているファイル・dirty に関係なく rescan', () => {
    // ツリー構造が変わったので、開いているファイルの状態に依らず再走査する。
    expect(
      decideFileChangeAction(ev('rescan', 'docs/x.md'), { activePath: null, dirty: false }),
    ).toBe('rescan');
    expect(
      decideFileChangeAction(ev('rescan', 'a.md'), { activePath: 'a.md', dirty: true }),
    ).toBe('rescan');
  });

  it('開いているファイルの外部変更 × 未編集 は reload', () => {
    expect(
      decideFileChangeAction(ev('modified', 'a.md'), { activePath: 'a.md', dirty: false }),
    ).toBe('reload');
  });

  it('開いているファイルの外部変更 × 編集中 は conflict（編集を破壊しない）', () => {
    expect(
      decideFileChangeAction(ev('modified', 'a.md'), { activePath: 'a.md', dirty: true }),
    ).toBe('conflict');
  });

  it('開いていないファイルの内容変更は ignore', () => {
    // 未オープン、または別ファイルの modified は画面に無関係なので何もしない。
    expect(
      decideFileChangeAction(ev('modified', 'other.md'), { activePath: 'a.md', dirty: false }),
    ).toBe('ignore');
    expect(
      decideFileChangeAction(ev('modified', 'a.md'), { activePath: null, dirty: false }),
    ).toBe('ignore');
  });
});
