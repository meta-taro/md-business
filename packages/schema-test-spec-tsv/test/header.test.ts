import { describe, it, expect } from 'vitest';
import { parseTypedHeader } from '../src/header.js';

/**
 * カスタム TSV の 1 行目は「型付きヘッダ行」。各セルは `列名[:型(パラメータ)][!]` 記法で、
 * 既存 `@md-business/schema-test-spec` の ColumnType へ写像しつつ、Desktop 入力ウィジェットの
 * UI ヒント（radio / datetime）と必須マーカー（末尾 `!`）を運ぶ。
 */
describe('parseTypedHeader', () => {
  it('defaults to text when no type annotation is present', () => {
    expect(parseTypedHeader('項目')).toEqual({
      name: '項目',
      type: 'text',
      required: false,
    });
  });

  it('maps :multiline to multiline_text', () => {
    expect(parseTypedHeader('手順:multiline')).toEqual({
      name: '手順',
      type: 'multiline_text',
      required: false,
    });
  });

  it('maps :enum(...) to enum with pipe-split values', () => {
    expect(parseTypedHeader('結果:enum(〇|▲|×)')).toEqual({
      name: '結果',
      type: 'enum',
      required: false,
      enumValues: ['〇', '▲', '×'],
    });
  });

  it('maps :radio(...) to enum with a radio UI hint', () => {
    expect(parseTypedHeader('結果:radio(〇|▲|×)')).toEqual({
      name: '結果',
      type: 'enum',
      required: false,
      enumValues: ['〇', '▲', '×'],
      ui: 'radio',
    });
  });

  it('maps :date to date', () => {
    expect(parseTypedHeader('実施日:date')).toEqual({
      name: '実施日',
      type: 'date',
      required: false,
    });
  });

  it('maps :datetime to date with a datetime UI hint (and does not collide with :date)', () => {
    expect(parseTypedHeader('実施:datetime')).toEqual({
      name: '実施',
      type: 'date',
      required: false,
      ui: 'datetime',
    });
  });

  it('maps :number to number', () => {
    expect(parseTypedHeader('件数:number')).toEqual({
      name: '件数',
      type: 'number',
      required: false,
    });
  });

  it('maps :checkbox to checkbox', () => {
    expect(parseTypedHeader('完了:checkbox')).toEqual({
      name: '完了',
      type: 'checkbox',
      required: false,
    });
  });

  it('maps :url to url', () => {
    expect(parseTypedHeader('参照:url')).toEqual({
      name: '参照',
      type: 'url',
      required: false,
    });
  });

  it('treats a trailing ! as the required marker (with a type)', () => {
    expect(parseTypedHeader('結果:enum(OK|NG)!')).toEqual({
      name: '結果',
      type: 'enum',
      required: true,
      enumValues: ['OK', 'NG'],
    });
  });

  it('treats a trailing ! as required even without a type annotation', () => {
    expect(parseTypedHeader('項目!')).toEqual({
      name: '項目',
      type: 'text',
      required: true,
    });
  });

  it('keeps a colon in the name when the suffix is not a known type', () => {
    expect(parseTypedHeader('補足:参考')).toEqual({
      name: '補足:参考',
      type: 'text',
      required: false,
    });
  });

  it('falls back to text for an unknown type keyword', () => {
    expect(parseTypedHeader('foo:bar')).toEqual({
      name: 'foo:bar',
      type: 'text',
      required: false,
    });
  });

  it('accepts a single enum value', () => {
    expect(parseTypedHeader('状態:enum(未実施)')).toEqual({
      name: '状態',
      type: 'enum',
      required: false,
      enumValues: ['未実施'],
    });
  });

  it('yields an empty enumValues list for enum with empty parentheses', () => {
    expect(parseTypedHeader('区分:enum()')).toEqual({
      name: '区分',
      type: 'enum',
      required: false,
      enumValues: [],
    });
  });

  it('reads an arrow inside the parentheses as an external choice source', () => {
    // 選択肢を引けたかどうかは別のファイルを読まないと決まらないので、enumValues は
    // 埋めない（空配列にすると「選択肢が 0 個」と区別がつかなくなる）。
    expect(parseTypedHeader('種別:enum(-> 提出物.tsv#種別)')).toEqual({
      name: '種別',
      type: 'enum',
      required: false,
      enumSource: { path: '提出物.tsv', column: '種別' },
    });
  });

  it('keeps the radio hint and the required marker on an external choice source', () => {
    expect(parseTypedHeader('種別:radio(-> 提出物.tsv#種別)!')).toEqual({
      name: '種別',
      type: 'enum',
      required: true,
      ui: 'radio',
      enumSource: { path: '提出物.tsv', column: '種別' },
    });
  });

  it('treats an unreadable arrow form as a plain choice list', () => {
    // 参照先として読めない書き方は、黙って参照扱いにせず今までどおり選択肢として読む。
    expect(parseTypedHeader('種別:enum(-> 提出物.tsv)')).toEqual({
      name: '種別',
      type: 'enum',
      required: false,
      enumValues: ['-> 提出物.tsv'],
    });
  });

  it('does not treat parentheses on a non-enum type as an annotation (falls back to name)', () => {
    expect(parseTypedHeader('実施:date(x)')).toEqual({
      name: '実施:date(x)',
      type: 'text',
      required: false,
    });
  });

  it('unescapes the column name', () => {
    expect(parseTypedHeader('行\\n名:date')).toEqual({
      name: '行\n名',
      type: 'date',
      required: false,
    });
  });

  it('unescapes enum values', () => {
    expect(parseTypedHeader('メモ:enum(a\\tb|c)')).toEqual({
      name: 'メモ',
      type: 'enum',
      required: false,
      enumValues: ['a\tb', 'c'],
    });
  });
});
