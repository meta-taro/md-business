/**
 * API 設計書プレビュー provider（Phase 1c の apiSpecPreview.ts を工場 config へ移設）。
 */
import {
  normalizeApiSpecFrontmatter,
  autofillApiSpec,
  translateApiSpecErrors,
  translateApiSpecWarnings,
  type ApiSpec,
} from '@md-business/schema-api-spec';
import validateApiSpec from '@md-business/schema-api-spec/validate';
import { renderApiSpecBody } from '@md-business/renderer-pdf';
import apiSpecCss from '@md-business/renderer-pdf/styles/api-spec.css?raw';
import { createSchemaPreview } from '../previewFactory';

function withPreviewDefaults(data: Record<string, unknown>): ApiSpec {
  const safe: Record<string, unknown> = { ...data };
  if (!safe['documentNumber']) safe['documentNumber'] = '';
  if (!safe['title']) safe['title'] = '';
  if (!safe['issueDate']) safe['issueDate'] = '';
  if (!Array.isArray(safe['authors']) || (safe['authors'] as unknown[]).length === 0) {
    safe['authors'] = [{ name: '' }];
  }
  if (!Array.isArray(safe['endpoints'])) {
    safe['endpoints'] = [];
  }
  return safe as unknown as ApiSpec;
}

export const apiSpecProvider = createSchemaPreview<ApiSpec>({
  meta: {
    id: 'api-spec',
    label: 'API 設計書',
    markers: ['endpoints', 'エンドポイント'],
  },
  normalize: normalizeApiSpecFrontmatter,
  autofill: autofillApiSpec,
  validate: validateApiSpec,
  translateErrors: translateApiSpecErrors,
  translateWarnings: translateApiSpecWarnings,
  withPreviewDefaults,
  documentTitle: (data) => data.title || `API 設計書 ${data.documentNumber ?? ''}`.trim(),
  renderBody: renderApiSpecBody,
  css: apiSpecCss,
});
