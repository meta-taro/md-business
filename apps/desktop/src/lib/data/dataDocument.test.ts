import { describe, it, expect } from 'vitest';
import { isDataFile, readDataDocument } from './dataDocument';

describe('データファイルの判定', () => {
  it('.json / .xml を開く対象と見なす', () => {
    expect(isDataFile('a.json')).toBe(true);
    expect(isDataFile('sub/dir/b.xml')).toBe(true);
  });

  it('拡張子の大小は問わない', () => {
    expect(isDataFile('A.JSON')).toBe(true);
    expect(isDataFile('A.Xml')).toBe(true);
  });

  it('正本（.md / .tsv）と拡張子なしは対象外', () => {
    expect(isDataFile('a.md')).toBe(false);
    expect(isDataFile('a.tsv')).toBe(false);
    expect(isDataFile('json')).toBe(false);
  });

  it('ファイルを開いていなければ対象外', () => {
    expect(isDataFile(null)).toBe(false);
  });
});

describe('JSON を木として読む', () => {
  it('入れ子の深さと並び順をそのまま行にする', () => {
    const doc = readDataDocument('order.json', '{"id":"A-1","items":[{"qty":2}]}');
    expect(doc.kind).toBe('tree');
    if (doc.kind !== 'tree') return;
    expect(doc.format).toBe('json');
    expect(doc.rows.map((row) => [row.depth, row.name, row.value])).toEqual([
      [0, 'order.json', null],
      [1, 'id', 'A-1'],
      [1, 'items', null],
      [2, '0', null],
      [3, 'qty', '2'],
    ]);
  });

  it('根の名前はファイル名にする（JSON の根は名前を持たない）', () => {
    const doc = readDataDocument('deep/nested/order.json', '{}');
    expect(doc.kind === 'tree' && doc.rows[0]?.name).toBe('order.json');
  });

  it('値の型を行に残す（画面で数値と文字列を区別するため）', () => {
    const doc = readDataDocument('a.json', '{"n":1,"s":"1","b":true,"z":null}');
    expect(doc.kind === 'tree' && doc.rows.map((row) => row.valueType)).toEqual([
      null,
      'number',
      'string',
      'boolean',
      'null',
    ]);
  });

  it('子を持つ行は、それが分かる', () => {
    const doc = readDataDocument('a.json', '{"a":{"b":1}}');
    expect(doc.kind === 'tree' && doc.rows.map((row) => row.hasChildren)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('行の鍵は同名の兄弟があっても重複しない', () => {
    const doc = readDataDocument('a.json', '[{"n":1},{"n":1}]');
    if (doc.kind !== 'tree') throw new Error('tree を期待');
    const keys = doc.rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('XML を木として読む', () => {
  it('属性を行に添える', () => {
    const doc = readDataDocument('a.xml', '<order id="A-1"><item qty="2">鉛筆</item></order>');
    if (doc.kind !== 'tree') throw new Error('tree を期待');
    expect(doc.format).toBe('xml');
    expect(doc.rows.map((row) => [row.depth, row.name, row.value])).toEqual([
      [0, 'order', null],
      [1, 'item', '鉛筆'],
    ]);
    expect(doc.rows[0]?.attributes).toEqual([{ name: 'id', value: 'A-1' }]);
    expect(doc.rows[1]?.attributes).toEqual([{ name: 'qty', value: '2' }]);
  });

  it('属性が無ければ空で揃える（画面側で場合分けしないで済むように）', () => {
    const doc = readDataDocument('a.xml', '<order/>');
    expect(doc.kind === 'tree' && doc.rows[0]?.attributes).toEqual([]);
  });

  it('根の名前は要素名（ファイル名で上書きしない）', () => {
    const doc = readDataDocument('a.xml', '<order/>');
    expect(doc.kind === 'tree' && doc.rows[0]?.name).toBe('order');
  });
});

describe('開けないときは理由を返す', () => {
  it('壊れた JSON は syntax として断る', () => {
    const doc = readDataDocument('a.json', '{\n  "id": \n}');
    expect(doc.kind).toBe('refused');
    expect(doc.kind === 'refused' && doc.problem.kind).toBe('syntax');
  });

  it('壊れた XML は止まった行が分かる', () => {
    const doc = readDataDocument('a.xml', '<order>\n  <item>\n');
    expect(doc.kind === 'refused' && doc.problem.line).toBe(2);
  });

  it('上限に当たったら理由が分かる（木は返さない）', () => {
    const doc = readDataDocument('a.json', '{"a":{"b":1}}', { maxNodes: 1 });
    expect(doc.kind === 'refused' && doc.problem.kind).toBe('nodes');
  });

  it('文書型宣言は doctype として断る', () => {
    const xml = '<!DOCTYPE root [<!ENTITY x SYSTEM "file:///etc/passwd">]>\n<root>&x;</root>';
    expect(readDataDocument('a.xml', xml)).toMatchObject({
      kind: 'refused',
      problem: { kind: 'doctype' },
    });
  });

  it('外部で定義された実体参照は entity として断る', () => {
    expect(readDataDocument('a.xml', '<root>&x;</root>')).toMatchObject({
      kind: 'refused',
      problem: { kind: 'entity' },
    });
  });

  it('対象外の拡張子は unsupported として断る（呼び違いを黙って通さない）', () => {
    const doc = readDataDocument('a.md', '# 見出し');
    expect(doc.kind === 'refused' && doc.problem.kind).toBe('unsupported');
  });
});
