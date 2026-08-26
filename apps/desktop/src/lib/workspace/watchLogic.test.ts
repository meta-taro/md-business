import { describe, it, expect } from 'vitest';
import { decideFileChangeAction, type FileChangeEvent, type WatchViewState } from './watchLogic';

/** テスト補助：kind と relPath から監視イベントを組み立てる。 */
function ev(
  kind: FileChangeEvent['kind'],
  relPath: string,
  scope: FileChangeEvent['scope'] = 'tree',
): FileChangeEvent {
  return { kind, relPath, scope };
}

/** テスト補助：画面状態。既定は業務文書として開いているフォルダ。 */
function view(partial: Partial<WatchViewState> = {}): WatchViewState {
  return { activePath: null, dirty: false, siteVisible: false, ...partial };
}

describe('decideFileChangeAction', () => {
  it('宣言そのものの変更は無視する（一覧にも画面にも出ない）', () => {
    expect(decideFileChangeAction(ev('modified', 'md-business.yml', 'config'), view())).toBe(
      'ignore',
    );
    expect(decideFileChangeAction(ev('rescan', 'md-business.yml', 'config'), view())).toBe('ignore');
  });

  it('web を名乗っていないフォルダでは、サイトの部品は無視する', () => {
    // 一覧に出ないものを走査し直しても、一覧には出ない。
    // 見ているのはブラウザの側なので、そちらの担当へ回る。
    expect(decideFileChangeAction(ev('rescan', 'style.css', 'site'), view())).toBe('ignore');
    expect(
      decideFileChangeAction(
        ev('modified', 'index.html', 'site'),
        view({ activePath: 'index.html' }),
      ),
    ).toBe('ignore');
  });

  it('web を名乗るフォルダでは、サイトの部品も一覧に出るので追いかける', () => {
    // ここで無視すると、AI が書いた index.html が一覧に出ないまま残り、
    // 書けたのか書けなかったのかが利用者から見えない。
    expect(
      decideFileChangeAction(ev('rescan', 'index.html', 'site'), view({ siteVisible: true })),
    ).toBe('rescan');
    expect(
      decideFileChangeAction(
        ev('modified', 'style.css', 'site'),
        view({ activePath: 'style.css', siteVisible: true }),
      ),
    ).toBe('reload');
    expect(
      decideFileChangeAction(
        ev('modified', 'style.css', 'site'),
        view({ activePath: 'index.html', siteVisible: true }),
      ),
    ).toBe('ignore');
  });

  it('rescan は開いているファイル・dirty に関係なく rescan', () => {
    // ツリー構造が変わったので、開いているファイルの状態に依らず再走査する。
    expect(decideFileChangeAction(ev('rescan', 'docs/x.md'), view())).toBe('rescan');
    expect(
      decideFileChangeAction(ev('rescan', 'a.md'), view({ activePath: 'a.md', dirty: true })),
    ).toBe('rescan');
  });

  it('開いているファイルの外部変更 × 未編集 は reload', () => {
    expect(decideFileChangeAction(ev('modified', 'a.md'), view({ activePath: 'a.md' }))).toBe(
      'reload',
    );
  });

  it('開いているファイルの外部変更 × 編集中 は conflict（編集を破壊しない）', () => {
    expect(
      decideFileChangeAction(ev('modified', 'a.md'), view({ activePath: 'a.md', dirty: true })),
    ).toBe('conflict');
  });

  it('開いていないファイルの内容変更は ignore', () => {
    // 未オープン、または別ファイルの modified は画面に無関係なので何もしない。
    expect(decideFileChangeAction(ev('modified', 'other.md'), view({ activePath: 'a.md' }))).toBe(
      'ignore',
    );
    expect(decideFileChangeAction(ev('modified', 'a.md'), view())).toBe('ignore');
  });
});
