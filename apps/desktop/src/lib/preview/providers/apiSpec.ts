/**
 * API 設計書プレビュー provider（{@link ../previewFactory} へ渡す config）。
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
import { API_SPEC_META } from './meta';

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
  meta: API_SPEC_META,
  normalize: normalizeApiSpecFrontmatter,
  autofill: autofillApiSpec,
  validate: validateApiSpec,
  translateErrors: translateApiSpecErrors,
  translateWarnings: translateApiSpecWarnings,
  withPreviewDefaults,
  documentTitle: (data) => data.title || `API 設計書 ${data.documentNumber ?? ''}`.trim(),
  // データ駆動スキーマは frontmatter のみで描くため body は無視する。
  renderBody: (data) => renderApiSpecBody(data),
  css: apiSpecCss,
});
