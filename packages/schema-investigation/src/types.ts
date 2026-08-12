export type InvestigationKind = 'log' | 'network';

export type InvestigationStatus = 'investigating' | 'concluded' | 'suspended';

export type FindingSeverity = 'high' | 'medium' | 'low' | 'info';

export interface InvestigationPerson {
  name: string;
  role?: string;
}

/** 調べた元のファイル。パスだけでは足りない — 同じパスの中身は入れ替わる。 */
export interface InvestigationTarget {
  /** ワークスペース相対パス。 */
  path: string;
  /** 中身の SHA-256（小文字 16 進 64 桁）。後から同じファイルか確かめるための唯一の手掛かり。 */
  sha256: string;
  note?: string;
}

/** 使った道具と版。同じ操作でも版が違えば結果が違いうる。 */
export interface InvestigationTool {
  name: string;
  version: string;
}

/** 調査が対象にした時間帯。ここを書かないと「その時間には何も無かった」と読める。 */
export interface InvestigationWindow {
  /** ISO 8601 date-time。 */
  from: string;
  /** ISO 8601 date-time。 */
  to: string;
}

/**
 * 所見。`evidence` は必須で、`save_evidence` が返す参照
 * （`evidence/EV-001.md`）の形しか受け付けない。根拠の無い所見を書けなくするため。
 */
export interface InvestigationFinding {
  /** `F-01` の形。本文から所見を指すための番号。 */
  id: string;
  summary: string;
  severity?: FindingSeverity;
  evidence: string[];
}

export interface Investigation {
  schema: 'investigation/v1';
  /** 調査の種別。型は同じで、参照するデータ源が違う。 */
  kind: InvestigationKind;
  documentNumber: string;
  title: string;
  /** ISO 8601 date-time。 */
  createdAt: string;
  status: InvestigationStatus;
  authors: InvestigationPerson[];
  reviewers?: InvestigationPerson[];
  targets: InvestigationTarget[];
  tools: InvestigationTool[];
  window: InvestigationWindow;
  findings?: InvestigationFinding[];
  /** 全体の要約。所見が出揃う前は空でよい。 */
  summary?: string;
  relatedDocs?: string[];
  /** アクセント色のプリセット名または `#rrggbb`。他の文書種別と同じ語彙。 */
  theme?: string;
  /** PDF 保存名のテンプレート。 */
  fileName?: string;
}
