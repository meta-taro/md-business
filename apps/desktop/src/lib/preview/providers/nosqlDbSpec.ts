/**
 * DB 設計書（NoSQL）プレビュー provider。
 */
import {
  normalizeNosqlDbSpecFrontmatter,
  autofillNosqlDbSpec,
  translateNosqlDbSpecErrors,
  translateNosqlDbSpecWarnings,
  type NosqlDbSpec,
} from '@md-business/schema-nosql-db-spec';
import validateNosqlDbSpec from '@md-business/schema-nosql-db-spec/validate';
import { renderNosqlDbSpecBody } from '@md-business/renderer-pdf';
import nosqlDbSpecCss from '@md-business/renderer-pdf/styles/nosql-db-spec.css?raw';
import { createSchemaPreview } from '../previewFactory';

function withPreviewDefaults(data: Record<string, unknown>): NosqlDbSpec {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['schema']) safe['schema'] = 'nosql-db-spec/v1';
  if (!safe['documentNumber']) safe['documentNumber'] = '';
  if (!safe['title']) safe['title'] = '';
  if (!safe['version']) safe['version'] = '0.1.0';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (!safe['status']) safe['status'] = 'draft';
  if (!safe['engine']) safe['engine'] = 'firestore';
  if (!Array.isArray(safe['authors']) || (safe['authors'] as unknown[]).length === 0) {
    safe['authors'] = [{ name: '' }];
  }
  if (!Array.isArray(safe['collections'])) {
    safe['collections'] = [];
  }
  return safe as unknown as NosqlDbSpec;
}

export const nosqlDbSpecProvider = createSchemaPreview<NosqlDbSpec>({
  meta: {
    id: 'nosql-db-spec',
    label: 'NoSQL 設計書',
    markers: ['collections', 'コレクション'],
  },
  normalize: normalizeNosqlDbSpecFrontmatter,
  autofill: autofillNosqlDbSpec,
  validate: validateNosqlDbSpec,
  translateErrors: translateNosqlDbSpecErrors,
  translateWarnings: translateNosqlDbSpecWarnings,
  withPreviewDefaults,
  documentTitle: (data) => data.title || `NoSQL 設計書 ${data.documentNumber ?? ''}`.trim(),
  renderBody: renderNosqlDbSpecBody,
  css: nosqlDbSpecCss,
});
