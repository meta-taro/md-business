import { describe, it, expect } from 'vitest';
import { MemoryDocumentStore } from './store.js';
import {
  readTsv,
  appendTsvRow,
  updateTsvRow,
  MAX_TSV_CELL_CHARS,
  MAX_TSV_SOURCE_CHARS,
} from './tsvTools.js';

/**
 * 検証シートのカスタム TSV を MCP から触るツール群。Markdown 側の read/create/update と
 * 同じく DocumentStore 越しに動く純ロジックなので、ここは MemoryDocumentStore で完結する。
 */

/** ヘッダ・メタ・ディレクティブを一通り持つ最小の検証シート（末尾改行あり）。 */
const SHEET =
  [
    '#! md-business:test-spec-tsv/v1',
    '# タイトル: 受注検証シート',
    '#@ style 結果 OK=#e7f6ec',
    'No.:number\t項目!\t結果:enum(OK|NG)\t実施日:date\t備考:multiline',
    '1\t新規登録\tOK\t2026-07-30\t',
    '2\t金額計算\tNG\t2026-07-30\t端数が合わない',
  ].join('\n') + '\n';

function store(): MemoryDocumentStore {
  return new MemoryDocumentStore({ 'sheets/受注.tsv': SHEET });
}

describe('readTsv', () => {
  it('ヘッダ・メタ・ディレクティブ・行を構造化して返す', async () => {
    const r = await readTsv(store(), 'sheets/受注.tsv');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.path).toBe('sheets/受注.tsv');
    expect(r.formatId).toBe('md-business:test-spec-tsv/v1');
    expect(r.meta['タイトル']).toBe('受注検証シート');
    expect(r.directives).toEqual(['style 結果 OK=#e7f6ec']);
    expect(r.columns.map((c) => c.name)).toEqual(['No.', '項目', '結果', '実施日', '備考']);
    expect(r.columns[1]?.required).toBe(true);
    expect(r.columns[2]?.enumValues).toEqual(['OK', 'NG']);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toEqual(['2', '金額計算', 'NG', '2026-07-30', '端数が合わない']);
    expect(r.issues).toEqual([]);
  });

  it('列型に反するセルを issues として返す', async () => {
    const s = new MemoryDocumentStore({
      'x.tsv': 'No.:number\t結果:enum(OK|NG)\n1\t△\n',
    });
    const r = await readTsv(s, 'x.tsv');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ row: 0, column: 1, columnName: '結果', code: 'enum_value' });
  });

  it('存在しないパス・越境パスは失敗する', async () => {
    const missing = await readTsv(store(), 'sheets/なし.tsv');
    expect(missing.ok).toBe(false);
    const escaped = await readTsv(store(), '../outside.tsv');
    expect(escaped.ok).toBe(false);
  });

  it('ヘッダ行が無いファイルは失敗する（列型が決まらないため）', async () => {
    const s = new MemoryDocumentStore({ 'empty.tsv': '#! md-business:test-spec-tsv/v1\n' });
    const r = await readTsv(s, 'empty.tsv');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('ヘッダ');
  });
});

describe('appendTsvRow', () => {
  it('列名指定の値で 1 行追加し、指定の無い列は空のままにする', async () => {
    const s = store();
    const r = await appendTsvRow(s, {
      path: 'sheets/受注.tsv',
      values: { 'No.': '3', 項目: '在庫引当', 結果: 'OK', 実施日: '2026-07-30' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toBe(2);
    // 未指定の 備考 は空セル＝未入力の正本表現（`—` や N/A では埋めない）
    expect(r.values).toEqual(['3', '在庫引当', 'OK', '2026-07-30', '']);
    expect(r.issues).toEqual([]);

    const after = await readTsv(s, 'sheets/受注.tsv');
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.rows).toHaveLength(3);
    expect(after.rows[2]?.[1]).toBe('在庫引当');
  });

  it('マジック行・メタ・ディレクティブ・末尾改行を保つ', async () => {
    const s = store();
    await appendTsvRow(s, { path: 'sheets/受注.tsv', values: { 'No.': '3' } });
    const text = await s.read('sheets/受注.tsv');
    expect(text.startsWith('#! md-business:test-spec-tsv/v1\n')).toBe(true);
    expect(text).toContain('# タイトル: 受注検証シート');
    expect(text).toContain('#@ style 結果 OK=#e7f6ec');
    expect(text.endsWith('\n')).toBe(true);
    // 追加は末尾 1 行だけ（既存行は動かさない）
    expect(text.trimEnd().split('\n')).toHaveLength(7);
  });

  it('セル内改行はエスケープして 1 物理行に畳む', async () => {
    const s = store();
    await appendTsvRow(s, {
      path: 'sheets/受注.tsv',
      values: { 'No.': '3', 項目: 'a', 備考: '1 行目\n2 行目' },
    });
    const text = await s.read('sheets/受注.tsv');
    expect(text).toContain('1 行目\\n2 行目');

    const after = await readTsv(s, 'sheets/受注.tsv');
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.rows[2]?.[4]).toBe('1 行目\n2 行目');
  });

  it('列型に反する値は書き込んだうえで issues として返す', async () => {
    const s = store();
    const r = await appendTsvRow(s, {
      path: 'sheets/受注.tsv',
      values: { 'No.': '3', 項目: 'a', 結果: '△' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issues.map((i) => i.code)).toEqual(['enum_value']);
    // 追加した行の違反だけを返し、文書全体の件数は数だけ添える
    expect(r.totalIssues).toBe(1);
  });

  it('未知の列名は書き込まずに失敗する', async () => {
    const s = store();
    const r = await appendTsvRow(s, {
      path: 'sheets/受注.tsv',
      values: { 存在しない列: 'x' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('存在しない列');
    // 利用可能な列名を示して次の一手を出せるようにする
    expect(r.error).toContain('項目');
    expect(await s.read('sheets/受注.tsv')).toBe(SHEET);
  });

  it('同名の列があるヘッダでは、その列名指定を曖昧として拒否する', async () => {
    const s = new MemoryDocumentStore({ 'dup.tsv': '項目\t項目\n1\t2\n' });
    const r = await appendTsvRow(s, { path: 'dup.tsv', values: { 項目: 'x' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('重複');
  });
});

describe('updateTsvRow', () => {
  it('指定した列だけを差し替え、他の列は据え置く', async () => {
    const s = store();
    const r = await updateTsvRow(s, {
      path: 'sheets/受注.tsv',
      row: 1,
      values: { 結果: 'OK', 備考: '修正済み' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toEqual(['2', '金額計算', 'OK', '2026-07-30', '修正済み']);

    const after = await readTsv(s, 'sheets/受注.tsv');
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.rows[0]).toEqual(['1', '新規登録', 'OK', '2026-07-30', '']);
    expect(after.rows).toHaveLength(2);
  });

  it('空文字を渡せばセルを未入力へ戻せる', async () => {
    const s = store();
    const r = await updateTsvRow(s, { path: 'sheets/受注.tsv', row: 1, values: { 備考: '' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values[4]).toBe('');
  });

  it('範囲外の行 index は書き込まずに失敗する', async () => {
    const s = store();
    const r = await updateTsvRow(s, { path: 'sheets/受注.tsv', row: 5, values: { 結果: 'OK' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('5');
    expect(await s.read('sheets/受注.tsv')).toBe(SHEET);
  });

  it('負の行 index も拒否する', async () => {
    const s = store();
    const r = await updateTsvRow(s, { path: 'sheets/受注.tsv', row: -1, values: { 結果: 'OK' } });
    expect(r.ok).toBe(false);
  });

  it('セル数が列数に満たない行を更新しても列位置がずれない', async () => {
    // 末尾の空セルが省略された行（保存元によっては起こりうる）
    const s = new MemoryDocumentStore({ 'short.tsv': 'a\tb\tc\n1\n' });
    const r = await updateTsvRow(s, { path: 'short.tsv', row: 0, values: { c: 'z' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toEqual(['1', '', 'z']);
  });
});

describe('同じシートへの並行操作', () => {
  it('同時に追記しても行が消えない', async () => {
    const s = store();
    // AI クライアントは独立したツール呼び出しを並行で投げる。読み → 書き戻しが
    // 重なると、待ち合わせが無ければ後勝ちで行が黙って消える。
    await Promise.all(
      ['3', '4', '5'].map((no) =>
        appendTsvRow(s, { path: 'sheets/受注.tsv', values: { 'No.': no, 項目: `項目${no}` } }),
      ),
    );

    const after = await readTsv(s, 'sheets/受注.tsv');
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.rows).toHaveLength(5);
    expect(after.rows.map((row) => row[0])).toEqual(['1', '2', '3', '4', '5']);
  });

  it('同時に別々の行を更新しても片方の変更が失われない', async () => {
    const s = store();
    await Promise.all([
      updateTsvRow(s, { path: 'sheets/受注.tsv', row: 0, values: { 備考: '一つ目' } }),
      updateTsvRow(s, { path: 'sheets/受注.tsv', row: 1, values: { 備考: '二つ目' } }),
    ]);

    const after = await readTsv(s, 'sheets/受注.tsv');
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.rows[0]?.[4]).toBe('一つ目');
    expect(after.rows[1]?.[4]).toBe('二つ目');
  });
});

describe('入力サイズの上限', () => {
  it('上限ちょうどのセルは受け付ける', async () => {
    const s = store();
    const r = await appendTsvRow(s, {
      path: 'sheets/受注.tsv',
      values: { 'No.': '3', 項目: 'a', 備考: 'あ'.repeat(MAX_TSV_CELL_CHARS) },
    });
    expect(r.ok).toBe(true);
  });

  it('上限を超えるセルは書き込まずに失敗する', async () => {
    const s = store();
    const r = await appendTsvRow(s, {
      path: 'sheets/受注.tsv',
      values: { 'No.': '3', 項目: 'a', 備考: 'あ'.repeat(MAX_TSV_CELL_CHARS + 1) },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // どの列が長すぎるのかを示す（値そのものはエラーへ載せない）
    expect(r.error).toContain('備考');
    expect(r.error).toContain(String(MAX_TSV_CELL_CHARS));
    expect(await s.read('sheets/受注.tsv')).toBe(SHEET);
  });

  it('行更新でも上限を超えるセルは書き込まずに失敗する', async () => {
    const s = store();
    const r = await updateTsvRow(s, {
      path: 'sheets/受注.tsv',
      row: 0,
      values: { 備考: 'あ'.repeat(MAX_TSV_CELL_CHARS + 1) },
    });
    expect(r.ok).toBe(false);
    expect(await s.read('sheets/受注.tsv')).toBe(SHEET);
  });

  it('上限を超える大きさの TSV は解析せずに失敗する', async () => {
    const big = 'a\tb\n' + '1\t2\n'.repeat(Math.ceil(MAX_TSV_SOURCE_CHARS / 4) + 1);
    const s = new MemoryDocumentStore({ 'big.tsv': big });
    const r = await readTsv(s, 'big.tsv');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('big.tsv');
  });

  it('上限を超える大きさの TSV へは追記もできない', async () => {
    const big = 'a\tb\n' + '1\t2\n'.repeat(Math.ceil(MAX_TSV_SOURCE_CHARS / 4) + 1);
    const s = new MemoryDocumentStore({ 'big.tsv': big });
    const r = await appendTsvRow(s, { path: 'big.tsv', values: { a: 'x' } });
    expect(r.ok).toBe(false);
    expect(await s.read('big.tsv')).toBe(big);
  });
});
