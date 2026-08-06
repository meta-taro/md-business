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

/**
 * 行 ID を持つ検証シート。
 *
 * 行 index は 1 本挿すだけで以降が全部ずれるので、read してから update するまでの間に
 * 人が行を足すと、エージェントは黙って別の行を書き換える。ID なら同じ行を指し続ける。
 */
const ID_SHEET =
  [
    '#! md-business:test-spec-tsv/v1',
    '#@ rowid _id',
    'No.:number\t項目!\t結果:enum(OK|NG)\t_id',
    '1\t新規登録\tOK\traaaaaaaaaaaa',
    '2\t金額計算\tNG\trbbbbbbbbbbbb',
  ].join('\n') + '\n';

function idStore(): MemoryDocumentStore {
  return new MemoryDocumentStore({ 'sheets/id.tsv': ID_SHEET });
}

describe('行 ID を持つ検証シート', () => {
  it('read_tsv は行 ID を返し、ID 列は列にも行にも出さない', async () => {
    const r = await readTsv(idStore(), 'sheets/id.tsv');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rowIds).toEqual(['raaaaaaaaaaaa', 'rbbbbbbbbbbbb']);
    // ID は行を指すための識別子であって記入欄ではない。列として見せると
    // エージェントが書き換えてしまい、指し先が変わる。
    expect(r.columns.map((c) => c.name)).toEqual(['No.', '項目', '結果']);
    expect(r.rows[0]).toEqual(['1', '新規登録', 'OK']);
  });

  it('行 ID で対象行を指して更新できる', async () => {
    const s = idStore();
    const r = await updateTsvRow(s, {
      path: 'sheets/id.tsv',
      row: 'rbbbbbbbbbbbb',
      values: { 結果: 'OK' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toBe(1);
    expect(r.rowId).toBe('rbbbbbbbbbbbb');
    expect(r.values).toEqual(['2', '金額計算', 'OK']);
  });

  it('読んだ後に行が挿さっても、同じ ID は同じ行を指す', async () => {
    const s = idStore();
    // 人が先頭へ 1 行挿した状態（アプリの外での編集）。
    await s.write(
      'sheets/id.tsv',
      ID_SHEET.replace('1\t新規登録', '0\t事前確認\tOK\trcccccccccccc\n1\t新規登録'),
    );

    const r = await updateTsvRow(s, {
      path: 'sheets/id.tsv',
      row: 'raaaaaaaaaaaa',
      values: { 結果: 'NG' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toBe(1);
    expect(r.values).toEqual(['1', '新規登録', 'NG']);
  });

  it('知らない行 ID は書き込まずに失敗する', async () => {
    const s = idStore();
    const r = await updateTsvRow(s, {
      path: 'sheets/id.tsv',
      row: 'rdddddddddddd',
      values: { 結果: 'OK' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('rdddddddddddd');
    expect(await s.read('sheets/id.tsv')).toBe(ID_SHEET);
  });

  it('ID を持つシートへの行 index 指定は拒否する', async () => {
    // 受け付けると、ID がある場面でも index が使われ続けて挿し込みに壊される。
    const s = idStore();
    const r = await updateTsvRow(s, { path: 'sheets/id.tsv', row: 0, values: { 結果: 'NG' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('行 ID');
    expect(await s.read('sheets/id.tsv')).toBe(ID_SHEET);
  });

  it('追記した行にも ID を振り、その ID で更新できる', async () => {
    const s = idStore();
    const appended = await appendTsvRow(s, {
      path: 'sheets/id.tsv',
      values: { 'No.': '3', 項目: '追加項目' },
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    expect(appended.rowId).toBeDefined();
    expect(appended.values).toEqual(['3', '追加項目', '']);

    const r = await updateTsvRow(s, {
      path: 'sheets/id.tsv',
      row: appended.rowId as string,
      values: { 結果: 'OK' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toEqual(['3', '追加項目', 'OK']);
  });

  it('ID 列は書き込み対象にならない', async () => {
    const s = idStore();
    const r = await appendTsvRow(s, { path: 'sheets/id.tsv', values: { _id: 'reeeeeeeeeeee' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('未知の列名');
  });
});

/**
 * 控え行を持つ検証シート。
 *
 * 控え（`#@ hidden <id> …`）は、書き直した元の文言を消さずに表から外しておくためのもの。
 * エージェントから見えると、実施対象と勘違いして結果を書き込んだり、`△` のような
 * 過去の記入を直そうとしたりする。読みでは外し、書き戻しでは元の位置へ戻す。
 */
const HIDDEN_SHEET =
  [
    '#! md-business:test-spec-tsv/v1',
    '#@ rowid _id',
    '#@ hidden rbbbbbbbbbbbb',
    'No.:number\t項目!\t結果:enum(OK|NG)\t_id',
    '1\t新規登録\tOK\traaaaaaaaaaaa',
    '2\t新規登録（初版）\t△\trbbbbbbbbbbbb',
    '3\t金額計算\tNG\trcccccccccccc',
  ].join('\n') + '\n';

function hiddenStore(): MemoryDocumentStore {
  return new MemoryDocumentStore({ 'sheets/hidden.tsv': HIDDEN_SHEET });
}

describe('控え行を持つ検証シート', () => {
  it('read_tsv は控え行を出さない', async () => {
    const r = await readTsv(hiddenStore(), 'sheets/hidden.tsv');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((row) => row[1])).toEqual(['新規登録', '金額計算']);
    expect(r.rowIds).toEqual(['raaaaaaaaaaaa', 'rcccccccccccc']);
  });

  it('控え行は issues に出さない', async () => {
    // 控えは過去の記入をそのまま預かる場所なので、列型に反していても直す対象ではない。
    const r = await readTsv(hiddenStore(), 'sheets/hidden.tsv');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issues).toEqual([]);
  });

  it('控えの宣言はそのまま返す（控えがあること自体は隠さない）', async () => {
    const r = await readTsv(hiddenStore(), 'sheets/hidden.tsv');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.directives).toContain('hidden rbbbbbbbbbbbb');
  });

  it('別の行を更新しても控えは元の位置に残る', async () => {
    const s = hiddenStore();
    const r = await updateTsvRow(s, {
      path: 'sheets/hidden.tsv',
      row: 'rcccccccccccc',
      values: { 結果: 'OK' },
    });
    expect(r.ok).toBe(true);

    expect(await s.read('sheets/hidden.tsv')).toBe(
      HIDDEN_SHEET.replace('3\t金額計算\tNG', '3\t金額計算\tOK'),
    );
  });

  it('追記しても控えは元の位置に残る', async () => {
    const s = hiddenStore();
    const r = await appendTsvRow(s, {
      path: 'sheets/hidden.tsv',
      values: { 'No.': '4', 項目: '在庫引当' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const after = (await s.read('sheets/hidden.tsv')).split('\n');
    expect(after[5]).toBe('2\t新規登録（初版）\t△\trbbbbbbbbbbbb');
    expect(after[7]).toBe(`4\t在庫引当\t\t${r.rowId as string}`);
  });

  it('控えの行 ID を指した更新は書き込まずに失敗する', async () => {
    // 書けてしまうと、表に出ていない行が知らないうちに書き換わる。
    const s = hiddenStore();
    const r = await updateTsvRow(s, {
      path: 'sheets/hidden.tsv',
      row: 'rbbbbbbbbbbbb',
      values: { 結果: 'OK' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('rbbbbbbbbbbbb');
    expect(await s.read('sheets/hidden.tsv')).toBe(HIDDEN_SHEET);
  });
});

describe('行 ID を持たない検証シート', () => {
  // 既存シートは ID 列を持たない。MCP が勝手に ID 列を足すと、触った覚えのない
  // 全行が diff に出る。ID 列を焼くのはグリッドで保存したときだけにする。
  it('read_tsv の行 ID は空（その場限りの採番を ID として渡さない）', async () => {
    const r = await readTsv(store(), 'sheets/受注.tsv');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rowIds).toEqual([]);
  });

  it('追記しても ID 列・rowid 宣言が増えない', async () => {
    const s = store();
    await appendTsvRow(s, { path: 'sheets/受注.tsv', values: { 'No.': '3' } });
    const after = await s.read('sheets/受注.tsv');
    expect(after).not.toContain('rowid');
    expect(after).not.toContain('_id');
    expect(after).toBe(SHEET + '3\t\t\t\t\n');
  });

  it('行 ID を渡すと、行 index で指すよう促して失敗する', async () => {
    const s = store();
    const r = await updateTsvRow(s, {
      path: 'sheets/受注.tsv',
      row: 'raaaaaaaaaaaa',
      values: { 結果: 'OK' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('index');
    expect(await s.read('sheets/受注.tsv')).toBe(SHEET);
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

/**
 * 計算列（`#@ computed <列名> = <式>`）を持つ検証シート。
 *
 * 事故はここで起きた。人の「実数で埋めて」の一声で AI が集計列を潰し、
 * そのまま提出物として出た。アプリのグリッドだけを塞いでも、MCP から同じことができる。
 */
const COMPUTED_SHEET =
  [
    '#! md-business:test-spec-tsv/v1',
    '#@ computed No. = rowNumber()',
    'No.:number\t項目!\t結果:enum(OK|NG)',
    '1\t新規登録\tOK',
    '2\t金額計算\tNG',
  ].join('\n') + '\n';

function computedStore(): MemoryDocumentStore {
  return new MemoryDocumentStore({ 'sheets/計算.tsv': COMPUTED_SHEET });
}

describe('計算列を持つ検証シート', () => {
  it('計算列への追加時の指定は書き込まずに失敗する', async () => {
    const s = computedStore();
    const r = await appendTsvRow(s, {
      path: 'sheets/計算.tsv',
      values: { 'No.': '99', 項目: '在庫引当' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // 黙って落とすと、埋めたつもりのまま完了報告される。列名を挙げて理由を返す。
    expect(r.error).toContain('No.');
    expect(r.error).toContain('計算列');
    expect(await s.read('sheets/計算.tsv')).toBe(COMPUTED_SHEET);
  });

  it('計算列への更新時の指定も書き込まずに失敗する', async () => {
    const s = computedStore();
    const r = await updateTsvRow(s, {
      path: 'sheets/計算.tsv',
      row: 0,
      values: { 'No.': '99' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('計算列');
    expect(await s.read('sheets/計算.tsv')).toBe(COMPUTED_SHEET);
  });

  it('計算列を指定しない追加は通り、計算列は算出値で埋まる', async () => {
    const s = computedStore();
    const r = await appendTsvRow(s, { path: 'sheets/計算.tsv', values: { 項目: '在庫引当' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 空のままにすると、表計算へ貼ったときに番号列だけが抜ける。
    expect(r.values).toEqual(['3', '在庫引当', '']);

    const after = await readTsv(s, 'sheets/計算.tsv');
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.rows.map((row) => row[0])).toEqual(['1', '2', '3']);
  });

  it('他の列の更新は通り、計算列は算出値のまま残る', async () => {
    const s = computedStore();
    const r = await updateTsvRow(s, { path: 'sheets/計算.tsv', row: 1, values: { 結果: 'OK' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toEqual(['2', '金額計算', 'OK']);
  });

  it('崩れている計算列は書き込みのついでに揃える', async () => {
    // 手で番号を振り直したまま放置された状態。塞いだ後に残る唯一の壊れ方なので、
    // 触った行だけでなく列ごと直す（1 行だけ直すと番号が飛んだままになる）。
    const s = new MemoryDocumentStore({
      'x.tsv': '#@ computed No. = rowNumber()\nNo.:number\t項目\n7\ta\n9\tb\n',
    });
    const r = await updateTsvRow(s, { path: 'x.tsv', row: 1, values: { 項目: 'b2' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toEqual(['2', 'b2']);

    const after = await readTsv(s, 'x.tsv');
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.rows.map((row) => row[0])).toEqual(['1', '2']);
  });

  it('未知の式を宣言した列は塞がない（書く手段を残す）', async () => {
    const s = new MemoryDocumentStore({
      'y.tsv': '#@ computed 件数 = countIn("観点.tsv")\n項目\t件数\na\t1\n',
    });
    const r = await updateTsvRow(s, { path: 'y.tsv', row: 0, values: { 件数: '5' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toEqual(['a', '5']);
  });
});
