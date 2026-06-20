export type SpecStatus = 'draft' | 'review' | 'approved';

export type TocMode = 'auto' | 'manual';

export interface SpecPerson {
  name: string;
  role?: string;
}

export interface Spec {
  schemaVersion: 'spec/v1';
  documentNumber: string;
  title: string;
  /** Document version using SemVer triple (e.g. "0.3.0"). */
  version: string;
  /** ISO 8601 YYYY-MM-DD. */
  issueDate: string;
  status: SpecStatus;
  authors: SpecPerson[];
  reviewers?: SpecPerson[];
  /**
   * External references — sibling documents, requirement specs, etc.
   * Strings are passed through verbatim (URL / relative path / freeform).
   */
  relatedDocs?: string[];
  /**
   * Multi-file chapter layout (B3). Empty array or omitted = single-md mode (B1)
   * where chapters are derived from Markdown headings. When non-empty, each
   * entry is a relative `.md` path resolved against the index file.
   */
  chapters?: string[];
  /** `auto` derives chapters from Markdown headings; `manual` requires `chapters`. */
  toc?: TocMode;
  /** Accent color preset name or `#rrggbb`. Same vocabulary as schema-invoice. */
  theme?: string;
  /** Optional template for the PDF save filename. */
  fileName?: string;
}
