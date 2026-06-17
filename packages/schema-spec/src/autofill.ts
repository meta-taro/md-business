export interface AutofillWarning {
  path: string;
  message: string;
}

export interface AutofillResult {
  data: Record<string, unknown>;
  warnings: AutofillWarning[];
}

/**
 * Fill in sensible defaults for spec frontmatter so authors can publish a
 * minimal draft without ceremony. Defaults that map onto the schema:
 *
 *   schemaVersion → 'spec/v1'
 *   version       → '0.1.0'        (draft default; SemVer triple required)
 *   status        → 'draft'
 *   toc           → 'auto'
 *
 * Warnings (do not block validation):
 *   - `toc: 'manual'` declared but `chapters` is missing/empty → manual mode
 *     needs an explicit ordered list, so we flag it.
 *   - `toc: 'auto'` with non-empty `chapters` → mixed signal; `chapters` wins
 *     at render time so we warn instead of silently dropping one.
 *
 * Returns a shallow clone; the input is not mutated.
 */
export function autofillSpec(input: unknown): AutofillResult {
  const warnings: AutofillWarning[] = [];
  if (!isPlainObject(input)) return { data: {}, warnings };

  const data: Record<string, unknown> = { ...input };

  if (!data['schemaVersion']) data['schemaVersion'] = 'spec/v1';
  if (data['version'] == null || data['version'] === '') data['version'] = '0.1.0';
  if (data['status'] == null || data['status'] === '') data['status'] = 'draft';

  const chapters = data['chapters'];
  const hasChapters = Array.isArray(chapters) && chapters.length > 0;
  const toc = data['toc'];

  if (toc == null || toc === '') {
    data['toc'] = 'auto';
  } else if (toc === 'manual' && !hasChapters) {
    warnings.push({
      path: 'chapters',
      message:
        '目次=手動（toc: manual）の場合、章ファイル（chapters）を 1 件以上指定してください。',
    });
  } else if (toc === 'auto' && hasChapters) {
    warnings.push({
      path: 'toc',
      message:
        '目次=自動（toc: auto）と章ファイル（chapters）が両方指定されています。レンダリング時は章ファイルが優先されます。',
    });
  }

  return { data, warnings };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
