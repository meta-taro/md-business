import {
  parseTestSpecMarkdown,
  translateTestSpecErrors,
  type TestSpec,
} from '@md-business/schema-test-spec';
import type { CompiledValidator } from '@md-business/core';

export type ParseForSidebarResult =
  | { ok: true; spec: TestSpec }
  | { ok: false; error: string };

const EMPTY_GUIDANCE =
  'frontmatter が空です。上の「テンプレ / ローカル MD」から雛形を選ぶか、textarea に schema: test-spec/v1 を含む YAML を貼り付けてください。';

export function parseTestSpecForSidebar(
  src: string,
  validate: CompiledValidator,
): ParseForSidebarResult {
  if (!hasMeaningfulFrontmatter(src)) {
    return { ok: false, error: EMPTY_GUIDANCE };
  }
  const parsed = parseTestSpecMarkdown(src, validate);
  if (!parsed.ok) {
    const messages = translateTestSpecErrors(parsed.errors);
    return { ok: false, error: messages.join('\n') };
  }
  return { ok: true, spec: parsed.testSpec };
}

function hasMeaningfulFrontmatter(src: string): boolean {
  if (typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (trimmed.length === 0) return false;
  const stripped = trimmed
    .replace(/^---\s*\n?/, '')
    .replace(/\n?---\s*$/, '')
    .trim();
  return stripped.length > 0;
}
