/**
 * Japanese → English key dictionary for spec (基本設計書) frontmatter.
 *
 * Authors write Markdown frontmatter in Japanese, and {@link normalizeSpecFrontmatter}
 * maps keys to the canonical English shape that {@link specSchema} validates.
 */

export type DictionaryScope = 'root' | 'party';

export type Dictionary = Record<DictionaryScope, Record<string, string>>;

export const SPEC_JA_DICTIONARY: Dictionary = {
  root: {
    スキーマ: 'schemaVersion',
    schemaVersion: 'schemaVersion',
    文書番号: 'documentNumber',
    documentNumber: 'documentNumber',
    番号: 'documentNumber',
    タイトル: 'title',
    title: 'title',
    表題: 'title',
    題名: 'title',
    版: 'version',
    version: 'version',
    バージョン: 'version',
    発行日: 'issueDate',
    issueDate: 'issueDate',
    発行年月日: 'issueDate',
    更新日: 'issueDate',
    ステータス: 'status',
    status: 'status',
    状態: 'status',
    作成者: 'authors',
    authors: 'authors',
    著者: 'authors',
    起案者: 'authors',
    レビュアー: 'reviewers',
    reviewers: 'reviewers',
    レビュー者: 'reviewers',
    査読者: 'reviewers',
    関連文書: 'relatedDocs',
    relatedDocs: 'relatedDocs',
    関連資料: 'relatedDocs',
    参考資料: 'relatedDocs',
    章ファイル: 'chapters',
    chapters: 'chapters',
    分割ファイル: 'chapters',
    目次: 'toc',
    toc: 'toc',
    テーマ: 'theme',
    theme: 'theme',
    テーマカラー: 'theme',
    カラー: 'theme',
    色: 'theme',
    ファイル名: 'fileName',
    fileName: 'fileName',
    保存名: 'fileName',
  },
  party: {
    名前: 'name',
    name: 'name',
    名称: 'name',
    氏名: 'name',
    役割: 'role',
    role: 'role',
    肩書き: 'role',
    肩書: 'role',
    役職: 'role',
  },
};

/**
 * Status enum translations. Authors write Japanese labels in frontmatter
 * (`ステータス: ドラフト`), which normalize to the canonical English enum
 * that `specSchema` validates.
 */
export const STATUS_TRANSLATIONS: Record<string, string> = {
  ドラフト: 'draft',
  draft: 'draft',
  下書き: 'draft',
  レビュー中: 'review',
  レビュー: 'review',
  review: 'review',
  査読中: 'review',
  承認済: 'approved',
  承認済み: 'approved',
  approved: 'approved',
  確定: 'approved',
};

/**
 * Table-of-contents mode translations.
 */
export const TOC_TRANSLATIONS: Record<string, string> = {
  自動: 'auto',
  auto: 'auto',
  手動: 'manual',
  manual: 'manual',
};

/**
 * Theme color translations — kept in sync with schema-invoice so authors
 * can reuse the same vocabulary across document types.
 */
export const THEME_VALUE_TRANSLATIONS: Record<string, string> = {
  青: 'blue',
  ブルー: 'blue',
  blue: 'blue',
  赤: 'red',
  レッド: 'red',
  red: 'red',
  黄: 'yellow',
  黄色: 'yellow',
  イエロー: 'yellow',
  yellow: 'yellow',
  橙: 'orange',
  オレンジ: 'orange',
  orange: 'orange',
  紫: 'purple',
  パープル: 'purple',
  purple: 'purple',
  黒: 'black',
  ブラック: 'black',
  black: 'black',
  灰: 'gray',
  灰色: 'gray',
  グレー: 'gray',
  グレイ: 'gray',
  gray: 'gray',
  grey: 'gray',
};
