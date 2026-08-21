import { describe, it, expect } from 'vitest';
import {
  parseTsv,
  readReviewColumns,
  validateTsv,
  ROW_ID_COLUMN,
} from '@md-business/schema-test-spec-tsv';
import { isTsvSource } from './detect';
import { readRowTints } from './gridStyleDirectives';
import {
  TSV_PRESETS,
  buildPresetTsv,
  findPreset,
  presetFileName,
  validateSheetName,
  type TsvPreset,
} from './tsvPresets';

/**
 * 検証シートの列プリセット（新規作成の雛形）の検査。
 *
 * 出力は「グリッドで開けて、そのまま実施を書き始められる形」でなければ意味がない。
 * 形の確認はプリセット定義を目で読むのではなく、実際に生成して parse / validate に通す。
 */

describe('TSV_PRESETS', () => {
  it('id は重複しない（選択の指定が別のプリセットへ流れない）', () => {
    const ids = TSV_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('試験ケース・観点表・指摘一覧を持つ', () => {
    expect(TSV_PRESETS.map((preset) => preset.id)).toContain('test-case');
    expect(TSV_PRESETS.map((preset) => preset.id)).toContain('viewpoint');
    expect(TSV_PRESETS.map((preset) => preset.id)).toContain('review');
  });

  it('どのプリセットも列名が重複しない（列を名前で指すディレクティブが効かなくなる）', () => {
    for (const preset of TSV_PRESETS) {
      const names = preset.columns.map((column) => column.name);
      expect(new Set(names).size, preset.id).toBe(names.length);
    }
  });
});

describe('findPreset', () => {
  it('id で引ける', () => {
    expect(findPreset('test-case')?.id).toBe('test-case');
  });
  it('知らない id は null（保存された選択が消えていても落ちない）', () => {
    expect(findPreset('nope')).toBeNull();
  });
});

describe('buildPresetTsv', () => {
  const built = TSV_PRESETS.map((preset) => ({ preset, text: buildPresetTsv(preset, '受注機能') }));

  it('グリッドで開ける（1 行目が v1 マジック行）', () => {
    for (const { preset, text } of built) {
      expect(isTsvSource(text), preset.id).toBe(true);
    }
  });

  it('列定義が復元できる', () => {
    for (const { preset, text } of built) {
      expect(parseTsv(text).columns, preset.id).toEqual(preset.columns);
    }
  });

  it('検証に引っかからない', () => {
    for (const { preset, text } of built) {
      expect(validateTsv(parseTsv(text)), preset.id).toEqual([]);
    }
  });

  it('データ行は 0 行（実施内容は使う人が書く）', () => {
    for (const { preset, text } of built) {
      expect(parseTsv(text).rows, preset.id).toEqual([]);
    }
  });

  it('行 ID 列を末尾に持ち、宣言も書く', () => {
    for (const { preset, text } of built) {
      const doc = parseTsv(text);
      expect(doc.columns[doc.columns.length - 1]?.name, preset.id).toBe(ROW_ID_COLUMN);
      expect(doc.directives, preset.id).toContain(`rowid ${ROW_ID_COLUMN}`);
    }
  });

  it('結果の色分けが自分の列に効く（宣言だけあって当たらない状態にしない）', () => {
    for (const { preset, text } of built) {
      const doc = parseTsv(text);
      const names = doc.columns.map((column) => column.name);
      expect(readRowTints(doc.directives, names).length, preset.id).toBeGreaterThan(0);
    }
  });

  it('指摘一覧は、往復の宣言が自分の列に当たる（宣言だけあって効かない状態にしない）', () => {
    const preset = findPreset('review');
    expect(preset).not.toBeNull();
    const doc = parseTsv(buildPresetTsv(preset as TsvPreset, ''));
    const columns = readReviewColumns(
      doc.directives,
      doc.columns.map((column) => column.name),
    );

    expect(columns).not.toBeNull();
    // 「反映済み」を選べなければ、突き合わせが一度も起きない雛形になる。
    const state = doc.columns[columns?.stateColumn ?? -1];
    expect(state?.enumValues).toContain('反映済み');
  });

  it('タイトルを書く', () => {
    const doc = parseTsv(buildPresetTsv(TSV_PRESETS[0], '受注機能'));
    expect(doc.meta['タイトル']).toBe('受注機能');
  });

  it('タイトルが空なら meta 行を書かない（値のない `キー: ` は末尾空白の差分になる）', () => {
    expect(buildPresetTsv(TSV_PRESETS[0], '')).not.toContain('タイトル');
    expect(buildPresetTsv(TSV_PRESETS[0], '   ')).not.toContain('タイトル');
  });

  it('タイトルの前後の空白は落とす', () => {
    expect(parseTsv(buildPresetTsv(TSV_PRESETS[0], '  受注機能  ')).meta['タイトル']).toBe(
      '受注機能',
    );
  });

  it('末尾に改行を 1 つ付ける（付けないと git の差分に「改行なし」が出る）', () => {
    for (const { preset, text } of built) {
      expect(text.endsWith('\n'), preset.id).toBe(true);
      expect(text.endsWith('\n\n'), preset.id).toBe(false);
    }
  });
});

describe('presetFileName', () => {
  it('拡張子を付ける', () => {
    expect(presetFileName('001-login')).toBe('001-login.tsv');
  });
  it('付いていれば重ねない', () => {
    expect(presetFileName('001-login.tsv')).toBe('001-login.tsv');
  });
  it('大文字の拡張子も重ねない', () => {
    expect(presetFileName('001-login.TSV')).toBe('001-login.TSV');
  });
  it('前後の空白は落とす', () => {
    expect(presetFileName('  001-login  ')).toBe('001-login.tsv');
  });
  it('空のままなら拡張子だけの名前にしない', () => {
    expect(presetFileName('   ')).toBe('');
  });
});

describe('validateSheetName', () => {
  // 新規作成の入力は、改名と同じ規則で弾く。ここが素通りすると、書き込みの可否が
  // Rust 側の生のエラー文字列でしか分からない（入力中に理由が出ない）。
  it('通る名前は null', () => {
    expect(validateSheetName('001-login')).toBeNull();
    expect(validateSheetName('001-login.tsv')).toBeNull();
  });
  it('区切り文字を含む名前は separator', () => {
    expect(validateSheetName('sub/001-login')).toBe('separator');
    expect(validateSheetName('sub\\001-login')).toBe('separator');
    expect(validateSheetName('../001-login')).toBe('separator');
  });
  it('使えない記号は invalidChar', () => {
    expect(validateSheetName('001:login')).toBe('invalidChar');
  });
  it('空入力は empty', () => {
    expect(validateSheetName('   ')).toBe('empty');
  });
});
