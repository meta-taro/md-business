import { describe, it, expect } from 'vitest';
import { buildTree, toDocEntry, type DocEntry } from './fileTree';
import {
  initialExpandedPaths,
  toggleExpanded,
  flattenVisible,
  computeDirty,
  shouldReopenFile,
  remapRenamedPath,
  filterTree,
  collectFolderPaths,
  shouldClearFilter,
  decideTreeKey,
  type VisibleRow,
} from './workspaceLogic';

const entries = (...relPaths: string[]): DocEntry[] => relPaths.map((p) => toDocEntry(p));

const rowLabels = (rows: VisibleRow[]): string[] =>
  rows.map((r) => `${r.depth}:${r.node.kind}:${r.node.path}`);

describe('initialExpandedPaths', () => {
  it('第 1 階層のフォルダ path のみを返す（ファイル・入れ子は含めない）', () => {
    const tree = buildTree(entries('docs/sub/a.md', 'alpha/b.md', 'z.md'));
    expect(initialExpandedPaths(tree).sort()).toEqual(['alpha', 'docs']);
  });

  it('フォルダが無ければ空配列', () => {
    const tree = buildTree(entries('a.md', 'b.md'));
    expect(initialExpandedPaths(tree)).toEqual([]);
  });
});

describe('toggleExpanded', () => {
  it('未展開の path は追加される', () => {
    const next = toggleExpanded(new Set(['docs']), 'alpha');
    expect(next.has('alpha')).toBe(true);
    expect(next.has('docs')).toBe(true);
  });

  it('展開済みの path は除去される', () => {
    const next = toggleExpanded(new Set(['docs', 'alpha']), 'docs');
    expect(next.has('docs')).toBe(false);
    expect(next.has('alpha')).toBe(true);
  });

  it('入力 Set を破壊しない（不変更新）', () => {
    const input = new Set(['docs']);
    toggleExpanded(input, 'alpha');
    expect([...input]).toEqual(['docs']);
  });
});

describe('flattenVisible', () => {
  it('折り畳まれたフォルダは children を出さない', () => {
    const tree = buildTree(entries('docs/a.md', 'docs/b.md'));
    const rows = flattenVisible(tree, new Set()); // docs 折り畳み
    expect(rowLabels(rows)).toEqual(['0:folder:docs']);
  });

  it('展開フォルダは children を depth+1 で出す', () => {
    const tree = buildTree(entries('docs/a.md', 'docs/b.md'));
    const rows = flattenVisible(tree, new Set(['docs']));
    expect(rowLabels(rows)).toEqual([
      '0:folder:docs',
      '1:file:docs/a.md',
      '1:file:docs/b.md',
    ]);
  });

  it('ルート直下のファイルは depth 0', () => {
    const tree = buildTree(entries('z.md'));
    const rows = flattenVisible(tree, new Set());
    expect(rowLabels(rows)).toEqual(['0:file:z.md']);
  });

  it('入れ子の展開は親が展開されている時のみ辿る', () => {
    const tree = buildTree(entries('a/b/c.md'));
    // a のみ展開、a/b は折り畳み → a/b までしか見えない
    const rows = flattenVisible(tree, new Set(['a']));
    expect(rowLabels(rows)).toEqual(['0:folder:a', '1:folder:a/b']);
    // a と a/b 両方展開 → c.md まで見える
    const rows2 = flattenVisible(tree, new Set(['a', 'a/b']));
    expect(rowLabels(rows2)).toEqual([
      '0:folder:a',
      '1:folder:a/b',
      '2:file:a/b/c.md',
    ]);
  });
});

describe('computeDirty', () => {
  it('ファイル未オープン（activePath=null）は常に false（seed 編集は保存対象外）', () => {
    expect(computeDirty(null, 'seed 本文を編集した', 'ディスク上の別内容')).toBe(false);
  });

  it('オープン中で source と savedSource が一致すれば false', () => {
    expect(computeDirty('a.md', '# 同じ', '# 同じ')).toBe(false);
  });

  it('オープン中で source が savedSource と異なれば true', () => {
    expect(computeDirty('a.md', '# 編集後', '# 保存済み')).toBe(true);
  });
});

describe('shouldReopenFile', () => {
  it('切替前のファイルが新ツリーにも在れば true（開き直す）', () => {
    expect(shouldReopenFile('docs/a.md', ['docs/a.md', 'z.md'])).toBe(true);
  });

  it('新ツリーに無ければ false（新ブランチで消えた＝選択解除のまま）', () => {
    expect(shouldReopenFile('docs/only-on-old.md', ['docs/a.md'])).toBe(false);
  });

  it('未オープン（activePath=null）は false', () => {
    expect(shouldReopenFile(null, ['docs/a.md'])).toBe(false);
  });
});

describe('remapRenamedPath', () => {
  it('開いていたファイル自身が改名されたら新しいパスを返す', () => {
    expect(remapRenamedPath('docs/旧名.tsv', 'docs/旧名.tsv', 'docs/新名.tsv')).toBe(
      'docs/新名.tsv',
    );
  });

  it('親フォルダが改名されたら配下も付け替える', () => {
    expect(remapRenamedPath('旧/検証/a.md', '旧', '新')).toBe('新/検証/a.md');
  });

  it('無関係なファイルはそのまま', () => {
    expect(remapRenamedPath('other/a.md', 'docs', 'documents')).toBe('other/a.md');
  });

  it('名前の前方一致だけでは付け替えない（旧 と 旧フォルダ を混同しない）', () => {
    expect(remapRenamedPath('旧フォルダ/a.md', '旧', '新')).toBe('旧フォルダ/a.md');
  });

  it('未オープンなら null のまま', () => {
    expect(remapRenamedPath(null, 'docs', 'documents')).toBeNull();
  });
});

describe('filterTree', () => {
  it('空クエリは元のツリーをそのまま返す', () => {
    const tree = buildTree(entries('docs/a.md', 'z.md'));
    expect(filterTree(tree, '')).toBe(tree);
    expect(filterTree(tree, '   ')).toBe(tree);
  });

  it('ファイル名にマッチする行だけを残し、祖先フォルダは保持する', () => {
    const tree = buildTree(entries('docs/spec/report.md', 'docs/spec/other.md', 'z.md'));
    const filtered = filterTree(tree, 'report');
    // docs / docs/spec は文脈として残り、other.md と z.md は落ちる。
    expect(rowLabels(flattenVisible(filtered, new Set(collectFolderPaths(filtered))))).toEqual([
      '0:folder:docs',
      '1:folder:docs/spec',
      '2:file:docs/spec/report.md',
    ]);
  });

  it('大文字小文字を無視する', () => {
    const tree = buildTree(entries('docs/README.md', 'docs/a.md'));
    const filtered = filterTree(tree, 'readme');
    expect(rowLabels(flattenVisible(filtered, new Set(collectFolderPaths(filtered))))).toEqual([
      '0:folder:docs',
      '1:file:docs/README.md',
    ]);
  });

  it('フォルダ名がマッチしたら配下を丸ごと残す', () => {
    const tree = buildTree(entries('spec/a.md', 'spec/b.md', 'other/c.md'));
    const filtered = filterTree(tree, 'spec');
    expect(rowLabels(flattenVisible(filtered, new Set(collectFolderPaths(filtered))))).toEqual([
      '0:folder:spec',
      '1:file:spec/a.md',
      '1:file:spec/b.md',
    ]);
  });

  it('どれにもマッチしなければ空配列', () => {
    const tree = buildTree(entries('docs/a.md', 'z.md'));
    expect(filterTree(tree, 'zzz-none')).toEqual([]);
  });

  it('入力ツリーを破壊しない（絞り込みは新ノードを返す）', () => {
    const tree = buildTree(entries('docs/a.md', 'docs/b.md'));
    filterTree(tree, 'a.md');
    // 元の docs フォルダは children 2 件のまま。
    const docs = tree.find((n) => n.path === 'docs');
    expect(docs?.children.length).toBe(2);
  });
});

// 業務文書のファイル名は日本語が既定と考えてよいため、絞り込みは日本語入力の
// 実情（IME・全角・濁点の合成揺れ）に耐える必要がある。
describe('filterTree（日本語ファイル名）', () => {
  it('日本語のファイル名を日本語クエリで絞り込める', () => {
    const tree = buildTree(entries('設計/基本設計書.md', '設計/API仕様書.md', '請求書.md'));
    const filtered = filterTree(tree, '基本設計');
    expect(rowLabels(flattenVisible(filtered, new Set(collectFolderPaths(filtered))))).toEqual([
      '0:folder:設計',
      '1:file:設計/基本設計書.md',
    ]);
  });

  it('日本語のフォルダ名がマッチしたら配下を丸ごと残す', () => {
    const tree = buildTree(entries('検証シート/受発注.tsv', '検証シート/在庫.tsv', '他/x.md'));
    const filtered = filterTree(tree, '検証');
    expect(rowLabels(flattenVisible(filtered, new Set(collectFolderPaths(filtered))))).toEqual([
      '0:folder:検証シート',
      '1:file:検証シート/在庫.tsv',
      '1:file:検証シート/受発注.tsv',
    ]);
  });

  it('サロゲートペアを含む名前を引ける', () => {
    // 𠮷 は基本多言語面外（UTF-16 で 2 コード単位）。人名・屋号のファイル名で実際に現れる。
    const tree = buildTree(entries('𠮷野家_見積.md', '山田_見積.md'));
    const filtered = filterTree(tree, '𠮷野');
    expect(filtered.map((n) => n.path)).toEqual(['𠮷野家_見積.md']);
  });

  it('濁点が分解された名前（NFD）を通常入力（NFC）で引ける', () => {
    // macOS の走査結果は濁点が分解された形で返ることがある。見た目が同じでも
    // コード列が違うため、素の includes では一致しない。
    const tree = buildTree(entries('ダイジェスト.md'.normalize('NFD')));
    const filtered = filterTree(tree, 'ダイジェスト'.normalize('NFC'));
    expect(filtered.length).toBe(1);
  });

  it('全角で入力した英数クエリで半角のファイル名を引ける', () => {
    // IME を on にしたまま英字を打つと全角になる。見た目上は同じ語なので一致させる。
    const tree = buildTree(entries('api-spec.md', 'other.md'));
    const filtered = filterTree(tree, 'ＡＰＩ');
    expect(filtered.map((n) => n.path)).toEqual(['api-spec.md']);
  });

  it('半角カナのクエリで全角カナのファイル名を引ける', () => {
    const tree = buildTree(entries('シフト表.tsv', '請求書.md'));
    const filtered = filterTree(tree, 'ｼﾌﾄ');
    expect(filtered.map((n) => n.path)).toEqual(['シフト表.tsv']);
  });
});

// UI は en/ja/zh/ko を出すので、ファイル名も同じ言語圏で運用されうる。
describe('filterTree（韓国語・中国語のファイル名）', () => {
  it('韓国語のファイル名を韓国語クエリで絞り込める', () => {
    const tree = buildTree(entries('설계서/기본설계서.md', '설계서/API명세서.md', '청구서.md'));
    const filtered = filterTree(tree, '기본설계');
    expect(rowLabels(flattenVisible(filtered, new Set(collectFolderPaths(filtered))))).toEqual([
      '0:folder:설계서',
      '1:file:설계서/기본설계서.md',
    ]);
  });

  it('ハングルが字母に分解された名前（NFD）を通常入力（NFC）で引ける', () => {
    // ハングルは合成済み音節と字母列の 2 通りの表し方がある。macOS の走査結果は
    // 分解形で返ることがあり、日本語の濁点と同じ不一致が起きる。
    const tree = buildTree(entries('검증시트.tsv'.normalize('NFD')));
    const filtered = filterTree(tree, '검증'.normalize('NFC'));
    expect(filtered.length).toBe(1);
  });

  it('中国語のファイル名を中国語クエリで絞り込める', () => {
    const tree = buildTree(entries('设计文档/概要设计.md', '设计文档/接口说明.md', '发票.md'));
    const filtered = filterTree(tree, '概要');
    expect(rowLabels(flattenVisible(filtered, new Set(collectFolderPaths(filtered))))).toEqual([
      '0:folder:设计文档',
      '1:file:设计文档/概要设计.md',
    ]);
  });

  it('中国語の全角括弧を含む名前を引ける', () => {
    const tree = buildTree(entries('发票（2026年6月）.md', '其他.md'));
    const filtered = filterTree(tree, '发票');
    expect(filtered.map((n) => n.path)).toEqual(['发票（2026年6月）.md']);
  });

  it('簡体字と繁体字は畳まない（別の字として扱う）', () => {
    // NFKC は互換文字だけを畳む。簡繁変換は正規化の仕事ではなく、
    // 畳むと「発票」と「发票」が混ざって検索結果が読めなくなる。
    const tree = buildTree(entries('发票.md', '發票.md'));
    expect(filterTree(tree, '发票').map((n) => n.path)).toEqual(['发票.md']);
    expect(filterTree(tree, '發票').map((n) => n.path)).toEqual(['發票.md']);
  });
});

describe('shouldClearFilter', () => {
  it('Escape で入力があればクリアする', () => {
    expect(shouldClearFilter('Escape', false, '検証')).toBe(true);
  });

  it('IME 変換中の Escape はクリアしない（変換の取り消し操作のため）', () => {
    expect(shouldClearFilter('Escape', true, 'けんしょう')).toBe(false);
  });

  it('入力が空なら何もしない', () => {
    expect(shouldClearFilter('Escape', false, '')).toBe(false);
  });

  it('Escape 以外のキーでは何もしない', () => {
    expect(shouldClearFilter('Enter', false, '検証')).toBe(false);
  });
});

describe('collectFolderPaths', () => {
  it('全階層のフォルダ path を返す（ファイルは含めない）', () => {
    const tree = buildTree(entries('a/b/c.md', 'a/d.md', 'z.md'));
    expect(collectFolderPaths(tree).sort()).toEqual(['a', 'a/b']);
  });

  it('フォルダが無ければ空配列', () => {
    const tree = buildTree(entries('x.md', 'y.md'));
    expect(collectFolderPaths(tree)).toEqual([]);
  });
});

describe('decideTreeKey', () => {
  // docs/                (0)
  //   sub/               (1)
  //     a.md             (2)
  //   b.md               (3)
  // empty/               (4)
  // z.md                 (5)
  const tree = buildTree(entries('docs/sub/a.md', 'docs/b.md', 'z.md'));
  const withEmpty = [
    ...tree.filter((n) => n.path === 'docs'),
    { name: 'empty', path: 'empty', kind: 'folder' as const, children: [] },
    ...tree.filter((n) => n.path === 'z.md'),
  ];
  const allOpen = new Set(['docs', 'docs/sub', 'empty']);
  const rows = flattenVisible(withEmpty, allOpen);
  const ctx = (index: number, expanded: ReadonlySet<string> = allOpen) => ({
    rows,
    index,
    expanded,
    toggleable: true,
  });

  it('行の並びが前提どおり', () => {
    expect(rowLabels(rows)).toEqual([
      '0:folder:docs',
      '1:folder:docs/sub',
      '2:file:docs/sub/a.md',
      '1:file:docs/b.md',
      '0:folder:empty',
      '0:file:z.md',
    ]);
  });

  it('下キーで次の行へ、末尾では止まる', () => {
    expect(decideTreeKey('ArrowDown', ctx(0))).toEqual({ kind: 'move', index: 1 });
    expect(decideTreeKey('ArrowDown', ctx(5))).toBeNull();
  });

  it('上キーで前の行へ、先頭では止まる', () => {
    expect(decideTreeKey('ArrowUp', ctx(3))).toEqual({ kind: 'move', index: 2 });
    expect(decideTreeKey('ArrowUp', ctx(0))).toBeNull();
  });

  it('Home / End で先頭・末尾へ飛ぶ', () => {
    expect(decideTreeKey('Home', ctx(3))).toEqual({ kind: 'move', index: 0 });
    expect(decideTreeKey('End', ctx(0))).toEqual({ kind: 'move', index: 5 });
    expect(decideTreeKey('Home', ctx(0))).toBeNull();
    expect(decideTreeKey('End', ctx(5))).toBeNull();
  });

  it('右キー: 閉じたフォルダは開く', () => {
    const closed = new Set<string>();
    const closedRows = flattenVisible(withEmpty, closed);
    expect(
      decideTreeKey('ArrowRight', { rows: closedRows, index: 0, expanded: closed, toggleable: true }),
    ).toEqual({ kind: 'expand', path: 'docs' });
  });

  it('右キー: 開いたフォルダは最初の子へ入る', () => {
    expect(decideTreeKey('ArrowRight', ctx(0))).toEqual({ kind: 'move', index: 1 });
  });

  it('右キー: 子の無いフォルダでは動かない', () => {
    expect(decideTreeKey('ArrowRight', ctx(4))).toBeNull();
  });

  it('右キー: ファイルでは動かない', () => {
    expect(decideTreeKey('ArrowRight', ctx(2))).toBeNull();
  });

  it('左キー: 開いたフォルダは閉じる', () => {
    expect(decideTreeKey('ArrowLeft', ctx(1))).toEqual({ kind: 'collapse', path: 'docs/sub' });
  });

  it('左キー: ファイルは親フォルダへ戻る', () => {
    expect(decideTreeKey('ArrowLeft', ctx(2))).toEqual({ kind: 'move', index: 1 });
    expect(decideTreeKey('ArrowLeft', ctx(3))).toEqual({ kind: 'move', index: 0 });
  });

  it('左キー: 閉じたフォルダは親フォルダへ戻る', () => {
    const expanded = new Set(['docs']);
    const partial = flattenVisible(withEmpty, expanded);
    // 0:docs / 1:docs/sub(閉) / 2:docs/b.md / 3:empty / 4:z.md
    expect(decideTreeKey('ArrowLeft', { rows: partial, index: 1, expanded, toggleable: true })).toEqual({
      kind: 'move',
      index: 0,
    });
  });

  it('左キー: 最上位では動かない', () => {
    expect(decideTreeKey('ArrowLeft', ctx(5))).toBeNull();
  });

  it('フィルタ中（toggleable=false）は開閉せず移動だけになる', () => {
    expect(decideTreeKey('ArrowLeft', { ...ctx(1), toggleable: false })).toEqual({
      kind: 'move',
      index: 0,
    });
    const closed = new Set<string>();
    const closedRows = flattenVisible(withEmpty, closed);
    expect(
      decideTreeKey('ArrowRight', { rows: closedRows, index: 0, expanded: closed, toggleable: false }),
    ).toBeNull();
  });

  it('対象外のキー・行が無いときは何もしない', () => {
    expect(decideTreeKey('a', ctx(0))).toBeNull();
    expect(decideTreeKey('Enter', ctx(0))).toBeNull();
    expect(decideTreeKey('ArrowDown', { rows: [], index: 0, expanded: allOpen, toggleable: true })).toBeNull();
  });

  it('選択行が失われている（index が範囲外）ときは先頭へ寄せる', () => {
    expect(decideTreeKey('ArrowDown', ctx(99))).toEqual({ kind: 'move', index: 0 });
    expect(decideTreeKey('ArrowUp', ctx(-1))).toEqual({ kind: 'move', index: 0 });
  });
});
