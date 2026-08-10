import { describe, it, expect } from 'vitest';
import { MemoryDocumentStore } from './store.js';
import { readData } from './dataTools.js';

/**
 * JSON / XML の読み取り。判定とパースは @md-business/data-tree が持つので、ここで確かめるのは
 * 「境界（越境パス・不在）を先に弾くか」「読めなかった理由が日本語で伝わるか」の 2 点。
 */

const INVOICE_JSON = '{"番号":"A-1","金額":500,"明細":[{"品名":"作業"}]}';
const INVOICE_XML = '<Invoice><ID>A-1</ID><Total currency="JPY">500</Total></Invoice>';

function store(): MemoryDocumentStore {
  return new MemoryDocumentStore({
    'data/請求.json': INVOICE_JSON,
    'data/請求.xml': INVOICE_XML,
    'docs/仕様.md': '# 仕様\n',
  });
}

describe('readData', () => {
  it('JSON を木構造にして返す', async () => {
    const r = await readData(store(), 'data/請求.json');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.path).toBe('data/請求.json');
    expect(r.format).toBe('json');
    expect(r.root.children.map((c) => c.name)).toEqual(['番号', '金額', '明細']);
  });

  it('XML を木構造にして返し、属性も持つ', async () => {
    const r = await readData(store(), 'data/請求.xml');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.format).toBe('xml');
    expect(r.root.name).toBe('Invoice');
    const total = r.root.children.find((c) => c.name === 'Total');
    expect(total?.value).toBe('500');
    expect(total?.attributes?.[0]).toEqual({ name: 'currency', value: 'JPY' });
  });

  it('ワークスペース外のパスを拒む', async () => {
    const r = await readData(store(), '../他所/請求.json');
    expect(r.ok).toBe(false);
  });

  it('存在しないファイルは読む前に弾く', async () => {
    const r = await readData(store(), 'data/無い.json');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('見つかりません');
  });

  it('扱わない拡張子は、扱う拡張子を挙げて断る', async () => {
    const r = await readData(store(), 'docs/仕様.md');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('.json');
    expect(r.error).toContain('.xml');
  });

  it('壊れた JSON は構文エラーとして断る', async () => {
    const s = new MemoryDocumentStore({ 'data/壊れ.json': '{"a":}' });
    const r = await readData(s, 'data/壊れ.json');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('構文');
  });

  it('DTD 宣言のある XML は、読まない理由を添えて断る', async () => {
    const s = new MemoryDocumentStore({
      'data/dtd.xml': '<!DOCTYPE Invoice [<!ENTITY x SYSTEM "file:///etc/passwd">]>\n<Invoice/>',
    });
    const r = await readData(s, 'data/dtd.xml');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('DTD');
  });

  it('深すぎる入れ子は、何行目で止めたかを添えて断る', async () => {
    const deep = '<a>'.repeat(300) + 'x' + '</a>'.repeat(300);
    const s = new MemoryDocumentStore({ 'data/深い.xml': `<root>\n${deep}\n</root>` });
    const r = await readData(s, 'data/深い.xml');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('2 行目');
  });
});

/**
 * 節を指して部分だけ読む。
 *
 * 木を丸ごと返すと、ファイルが大きいほど 1 回の応答がそのまま膨らむ。読み手が要るのは
 * たいてい一部分なので、位置と深さで切って返し、切った分は「何個隠れているか」を添える。
 * 黙って縮めると、少ないのか無いのかが区別できなくなる。
 */
const NESTED_JSON = JSON.stringify({
  番号: 'A-1',
  取引先: { 名称: '株式会社B', 住所: { 都道府県: '東京都', 市区: '千代田区' } },
  明細: [{ 品名: '作業', 金額: 500 }, { 品名: '部品', 金額: 300 }],
});
const REPEATED_XML = '<請求><明細><行>A</行><行>B</行></明細></請求>';

function nested(): MemoryDocumentStore {
  return new MemoryDocumentStore({
    'data/入れ子.json': NESTED_JSON,
    'data/繰り返し.xml': REPEATED_XML,
  });
}

describe('readData（節を指して読む）', () => {
  it('at で指した節の部分木だけを返す', async () => {
    const r = await readData(nested(), 'data/入れ子.json', { at: ['取引先', '住所'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.at).toEqual(['取引先', '住所']);
    expect(r.root.name).toBe('住所');
    expect(r.root.children.map((c) => c.value)).toEqual(['東京都', '千代田区']);
  });

  it('配列の要素は添字の名前で指せる', async () => {
    const r = await readData(nested(), 'data/入れ子.json', { at: ['明細', '1', '品名'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.value).toBe('部品');
  });

  it('at の途中が見つからないとき、その場所にある名前を挙げて断る', async () => {
    const r = await readData(nested(), 'data/入れ子.json', { at: ['取引先', '電話'] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('電話');
    expect(r.error).toContain('名称');
    expect(r.error).toContain('住所');
  });

  it('同じ名前の兄弟が並ぶときは、選び方を示して断る', async () => {
    const r = await readData(nested(), 'data/繰り返し.xml', { at: ['明細', '行'] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('2');
    expect(r.error).toContain('行#0');
  });

  it('同じ名前の兄弟は #番号 で選べる', async () => {
    const r = await readData(nested(), 'data/繰り返し.xml', { at: ['明細', '行#1'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.value).toBe('B');
  });

  it('既定の深さで切り、切った子の数を添える', async () => {
    const r = await readData(nested(), 'data/入れ子.json');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const 取引先 = r.root.children.find((c) => c.name === '取引先');
    // 既定は 2 世代。取引先（1 世代目）の子は返り、その子は切られる。
    const 住所 = 取引先?.children.find((c) => c.name === '住所');
    expect(住所?.children).toEqual([]);
    expect(住所?.omittedChildren).toBe(2);
    expect(取引先?.omittedChildren).toBeUndefined();
  });

  it('depth: 0 は指した節だけを返す', async () => {
    const r = await readData(nested(), 'data/入れ子.json', { depth: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.children).toEqual([]);
    expect(r.root.omittedChildren).toBe(3);
  });

  it('depth: -1 は下をすべて返す', async () => {
    const r = await readData(nested(), 'data/入れ子.json', { depth: -1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const 住所 = r.root.children
      .find((c) => c.name === '取引先')
      ?.children.find((c) => c.name === '住所');
    expect(住所?.children.map((c) => c.value)).toEqual(['東京都', '千代田区']);
    expect(住所?.omittedChildren).toBeUndefined();
  });

  it('at で降りた先にも depth が効く', async () => {
    const r = await readData(nested(), 'data/入れ子.json', { at: ['明細'], depth: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.root.children).toHaveLength(2);
    expect(r.root.children[0]?.children).toEqual([]);
    expect(r.root.children[0]?.omittedChildren).toBe(2);
  });
});
