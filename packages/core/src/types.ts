import type { Root } from 'mdast';

export interface ParsedMarkdown {
  data: Record<string, unknown>;
  body: string;
  ast: Root;
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: ValidationError[] };

export type ParseAndValidateResult<T> =
  | { ok: true; frontmatter: T; body: string; ast: Root }
  | { ok: false; errors: ValidationError[] };
