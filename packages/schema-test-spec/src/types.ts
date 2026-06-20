export type TestSpecStatus = 'draft' | 'review' | 'executing' | 'completed';

export type ColumnType =
  | 'text'
  | 'multiline_text'
  | 'enum'
  | 'date'
  | 'number'
  | 'checkbox'
  | 'url';

export interface ColumnVisualStyle {
  /** Hex color (#rgb / #rgba / #rrggbb / #rrggbbaa) applied to the entire row. */
  row_background?: string;
  /** Hex color applied to the single cell. */
  background?: string;
  /** Hex color applied to the cell text. */
  color?: string;
}

export interface TestSpecColumn {
  name: string;
  type: ColumnType;
  /** Required when `type === 'enum'`. Listed values populate DataValidation pulldown. */
  values?: string[];
  /**
   * Keyed by enum value (or "any" for type=enum-less columns). Each entry maps
   * to one ConditionalFormatRule applied to either the entire row
   * (`row_background`) or the single cell (`background` / `color`).
   */
  visual?: Record<string, ColumnVisualStyle>;
  /** Number type — optional inclusive lower bound. */
  min?: number;
  /** Number type — optional inclusive upper bound. */
  max?: number;
}

export interface TestSpecPerson {
  name: string;
  role?: string;
}

export interface TestSpec {
  schema: 'test-spec/v1';
  documentNumber: string;
  title: string;
  /** Document version using SemVer triple (e.g. "0.1.0"). */
  version: string;
  /** ISO 8601 YYYY-MM-DD. */
  issueDate: string;
  status: TestSpecStatus;
  authors: TestSpecPerson[];
  reviewers?: TestSpecPerson[];
  relatedDocs?: string[];
  /**
   * Required when onEdit auto-sync is enabled (PdM decision 2026-06-18 / A-3).
   * Identifies the bound Google Sheets document by its file ID.
   */
  googleSheetId?: string;
  /**
   * GitHub binding for onEdit auto-sync (PdM decision 2026-06-18 / case A).
   * Format: `owner/repo@branch:path` (e.g. `meta-taro/md-business@main:verify/login.md`).
   * `@branch` is optional and defaults to `main` during parsing.
   */
  repository?: string;
  /** Column schema — drives DataValidation, ConditionalFormat, SetFrozenRows. */
  columns: TestSpecColumn[];
  theme?: string;
  fileName?: string;
}
