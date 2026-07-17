/**
 * DB 設計書（RDB）プレビュー provider。
 */
import {
  normalizeDbSpecFrontmatter,
  autofillDbSpec,
  translateDbSpecErrors,
  translateDbSpecWarnings,
  type DbSpec,
} from '@md-business/schema-db-spec';
import validateDbSpec from '@md-business/schema-db-spec/validate';
import { renderDbSpecBody } from '@md-business/renderer-pdf';
import dbSpecCss from '@md-business/renderer-pdf/styles/db-spec.css?raw';
import { createSchemaPreview } from '../previewFactory';

function withPreviewDefaults(data: Record<string, unknown>): DbSpec {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['schema']) safe['schema'] = 'db-spec/v1';
  if (!safe['documentNumber']) safe['documentNumber'] = '';
  if (!safe['title']) safe['title'] = '';
  if (!safe['version']) safe['version'] = '0.1.0';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (!safe['status']) safe['status'] = 'draft';
  if (!safe['engine']) safe['engine'] = 'postgres';
  if (!Array.isArray(safe['authors']) || (safe['authors'] as unknown[]).length === 0) {
    safe['authors'] = [{ name: '' }];
  }
  if (!Array.isArray(safe['tables'])) {
    safe['tables'] = [];
  }
  return safe as unknown as DbSpec;
}

export const dbSpecProvider = createSchemaPreview<DbSpec>({
  meta: {
    id: 'db-spec',
    label: 'DB 設計書',
    markers: ['tables', 'テーブル'],
  },
  normalize: normalizeDbSpecFrontmatter,
  autofill: autofillDbSpec,
  validate: validateDbSpec,
  translateErrors: translateDbSpecErrors,
  translateWarnings: translateDbSpecWarnings,
  withPreviewDefaults,
  documentTitle: (data) => data.title || `DB 設計書 ${data.documentNumber ?? ''}`.trim(),
  // データ駆動スキーマは frontmatter のみで描くため body は無視する。
  renderBody: (data) => renderDbSpecBody(data),
  css: dbSpecCss,
});
