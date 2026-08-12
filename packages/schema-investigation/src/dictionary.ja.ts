/**
 * Japanese → English key dictionary for investigation (調査報告書) frontmatter.
 *
 * Authors write Markdown frontmatter in Japanese, and
 * {@link normalizeInvestigationFrontmatter} maps keys to the canonical English
 * shape that {@link investigationSchema} validates.
 */

export type DictionaryScope = 'root' | 'person' | 'target' | 'tool' | 'window' | 'finding';

export type Dictionary = Record<DictionaryScope, Record<string, string>>;

export const INVESTIGATION_JA_DICTIONARY: Dictionary = {
  root: {
    スキーマ: 'schema',
    schema: 'schema',
    種別: 'kind',
    kind: 'kind',
    調査種別: 'kind',
    文書番号: 'documentNumber',
    documentNumber: 'documentNumber',
    番号: 'documentNumber',
    タイトル: 'title',
    title: 'title',
    表題: 'title',
    題名: 'title',
    作成日時: 'createdAt',
    createdAt: 'createdAt',
    作成日: 'createdAt',
    状態: 'status',
    status: 'status',
    ステータス: 'status',
    作成者: 'authors',
    authors: 'authors',
    調査者: 'authors',
    担当: 'authors',
    レビュアー: 'reviewers',
    reviewers: 'reviewers',
    確認者: 'reviewers',
    対象ファイル: 'targets',
    targets: 'targets',
    対象: 'targets',
    使用ツール: 'tools',
    tools: 'tools',
    ツール: 'tools',
    調査時間帯: 'window',
    window: 'window',
    時間帯: 'window',
    対象期間: 'window',
    所見: 'findings',
    findings: 'findings',
    要約: 'summary',
    summary: 'summary',
    まとめ: 'summary',
    関連文書: 'relatedDocs',
    relatedDocs: 'relatedDocs',
    関連資料: 'relatedDocs',
    テーマ: 'theme',
    theme: 'theme',
    テーマカラー: 'theme',
    色: 'theme',
    ファイル名: 'fileName',
    fileName: 'fileName',
    保存名: 'fileName',
  },
  person: {
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
  target: {
    パス: 'path',
    path: 'path',
    ファイル: 'path',
    ハッシュ: 'sha256',
    sha256: 'sha256',
    'SHA-256': 'sha256',
    備考: 'note',
    note: 'note',
    メモ: 'note',
  },
  tool: {
    名前: 'name',
    name: 'name',
    名称: 'name',
    版: 'version',
    version: 'version',
    バージョン: 'version',
  },
  window: {
    開始: 'from',
    from: 'from',
    開始日時: 'from',
    終了: 'to',
    to: 'to',
    終了日時: 'to',
  },
  finding: {
    番号: 'id',
    id: 'id',
    所見番号: 'id',
    要約: 'summary',
    summary: 'summary',
    内容: 'summary',
    深刻度: 'severity',
    severity: 'severity',
    重大度: 'severity',
    根拠: 'evidence',
    evidence: 'evidence',
    証跡: 'evidence',
  },
};

/** 調査の種別。型は同じで、参照するデータ源が違う。 */
export const KIND_TRANSLATIONS: Record<string, string> = {
  ログ: 'log',
  ログ調査: 'log',
  log: 'log',
  ネットワーク: 'network',
  ネットワーク調査: 'network',
  通信: 'network',
  network: 'network',
};

export const STATUS_TRANSLATIONS: Record<string, string> = {
  調査中: 'investigating',
  investigating: 'investigating',
  進行中: 'investigating',
  完了: 'concluded',
  concluded: 'concluded',
  結論: 'concluded',
  保留: 'suspended',
  suspended: 'suspended',
  中断: 'suspended',
};

export const SEVERITY_TRANSLATIONS: Record<string, string> = {
  高: 'high',
  high: 'high',
  中: 'medium',
  medium: 'medium',
  低: 'low',
  low: 'low',
  情報: 'info',
  info: 'info',
  参考: 'info',
};

/**
 * Theme color translations — kept in sync with the other document types so
 * authors can reuse the same vocabulary.
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
