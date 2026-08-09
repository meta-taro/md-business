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
