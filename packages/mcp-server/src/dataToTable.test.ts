import { describe, it, expect } from 'vitest';
import { MemoryDocumentStore } from './store.js';
import { dataToTable } from './dataToTable.js';

/**
 * 繰り返し構造の表化。read_data で木を降りて自前で組み立てるのと違い、ここで確かめるのは
 * 「列の決まり方」「載せられない値を黙って捨てないか」「表として壊れない文字列か」の 3 点。
 */

const ROWS_JSON = JSON.stringify({
  明細: [
    { 品名: '作業', 数量: 2 },
    { 品名: '部材', 単価: 300 },
  ],
});

const XML = `<Invoice><行 区分="役務"><品名>作業</品名></行><行><品名>部材</品名></行></Invoice>`;

function store(extra: Record<string, string> = {}): MemoryDocumentStore {
  return new MemoryDocumentStore({
    'data/請求.json': ROWS_JSON,
    'data/請求.xml': XML,
    'docs/仕様.md': '# 仕様\n',
    ...extra,
  });
}

describe('dataToTable', () => {
  it('列は行に現れた順の和で、無い値のセルは空のままにする', async () => {
    const r = await dataToTable(store(), 'data/請求.json', { at: ['明細'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.columns).toEqual(['品名', '数量', '単価']);
    expect(r.markdown).toContain('| 作業 | 2 |  |');
    expect(r.markdown).toContain('| 部材 |  | 300 |');
  });

  it('出典としてファイルと位置を表の前に置く', async () => {
    const r = await dataToTable(store(), 'data/請求.json', { at: ['明細'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown.split('\n')[0]).toContain('data/請求.json');
    expect(r.markdown.split('\n')[0]).toContain('明細');
  });

  it('セルの | を退避し、改行とタブは空白に畳む', async () => {
    const s = store({
      'data/記号.json': JSON.stringify({ 行: [{ 備考: 'a|b', 説明: '1 行目\n2 行目\tあり' }] }),
    });
    const r = await dataToTable(s, 'data/記号.json', { at: ['行'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown).toContain('a\\|b');
    expect(r.markdown).toContain('1 行目 2 行目 あり');
    // 出典 / 空行 / 見出し / 区切り / 本体 1 行 の 5 行。改行が混じると行数が増える。
    expect(r.markdown.trim().split('\n')).toHaveLength(5);
  });

  it('上限を超えた行は載せず、載せなかった件数を返す', async () => {
    const many = JSON.stringify({ 行: Array.from({ length: 5 }, (_, i) => ({ n: i })) });
    const r = await dataToTable(store({ 'data/多.json': many }), 'data/多.json', {
      at: ['行'],
      limit: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rowCount).toBe(2);
    expect(r.totalRows).toBe(5);
    expect(r.truncated).toBe(3);
    expect(r.markdown).toContain('3');
  });

  it('打ち切っていなければ truncated は 0 で、注記も出さない', async () => {
    const r = await dataToTable(store(), 'data/請求.json', { at: ['明細'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.truncated).toBe(0);
    expect(r.rowCount).toBe(2);
    expect(r.markdown).not.toContain('ほか');
  });

  it('XML の同名要素の並びを行にし、属性は @名前 の列にする', async () => {
    const r = await dataToTable(store(), 'data/請求.xml', {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.columns).toEqual(['@区分', '品名']);
    expect(r.markdown).toContain('| 役務 | 作業 |');
    expect(r.markdown).toContain('|  | 部材 |');
  });

  it('さらに子を持つ項目は列にせず、落とした名前を挙げる', async () => {
    const nested = JSON.stringify({ 行: [{ 品名: '作業', 内訳: { 単価: 100 } }] });
    const r = await dataToTable(store({ 'data/入.json': nested }), 'data/入.json', { at: ['行'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.columns).toEqual(['品名']);
    expect(r.nestedColumns).toEqual(['内訳']);
  });

  it('同名の項目が 1 行に複数あるときは先頭を載せ、その名前を挙げる', async () => {
    const dup = '<r><行><tag>a</tag><tag>b</tag></行></r>';
    const r = await dataToTable(store({ 'data/重.xml': dup }), 'data/重.xml', {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.markdown).toContain('| a |');
    expect(r.multiValuedColumns).toEqual(['tag']);
  });

  it('値だけが並ぶ配列は 1 列の表にする', async () => {
    const flat = JSON.stringify({ 品目: ['作業', '部材'] });
    const r = await dataToTable(store({ 'data/並.json': flat }), 'data/並.json', { at: ['品目'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.columns).toEqual(['値']);
    expect(r.markdown).toContain('| 作業 |');
    expect(r.markdown).toContain('| 部材 |');
  });

  it('行になる子が無い位置は、表を作れない理由を述べて断る', async () => {
    const r = await dataToTable(store(), 'data/請求.json', { at: ['明細', '0', '品名'] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('品名');
  });

  it('存在しない位置は、そこにある名前を挙げて断る', async () => {
    const r = await dataToTable(store(), 'data/請求.json', { at: ['無い'] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('明細');
  });

  it('存在しないファイルは読む前に弾く', async () => {
    const r = await dataToTable(store(), 'data/無い.json', {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('見つかりません');
  });

  it('0 以下や小数の上限は、表を作る前に断る', async () => {
    const r = await dataToTable(store(), 'data/請求.json', { at: ['明細'], limit: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('limit');
  });

  it('ワークスペース外のパスを拒む', async () => {
    const r = await dataToTable(store(), '../他所/請求.json', {});
    expect(r.ok).toBe(false);
  });

  it('扱わない拡張子は断る', async () => {
    const r = await dataToTable(store(), 'docs/仕様.md', {});
    expect(r.ok).toBe(false);
  });
});
