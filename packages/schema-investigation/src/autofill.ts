export interface AutofillWarning {
  path: string;
  message: string;
}

export interface AutofillResult {
  data: Record<string, unknown>;
  warnings: AutofillWarning[];
}

/**
 * Fill in sensible defaults for investigation frontmatter so an author can
 * start a report the moment they start looking. Defaults that map onto the
 * schema:
 *
 *   schema → 'investigation/v1'
 *   status → 'investigating'
 *
 * `kind` is deliberately left empty. Which data source was read is a fact about
 * the investigation, not a default — guessing it would put an unchecked claim
 * into the record.
 *
 * Warnings (do not block validation):
 *   - concluded with no findings → a conclusion with nothing behind it.
 *   - the investigated window runs backwards → the bounds were swapped.
 *
 * Returns a shallow clone; the input is not mutated.
 */
export function autofillInvestigation(input: unknown): AutofillResult {
  const warnings: AutofillWarning[] = [];
  if (!isPlainObject(input)) return { data: {}, warnings };

  const data: Record<string, unknown> = { ...input };

  if (data['schema'] == null || data['schema'] === '') data['schema'] = 'investigation/v1';
  if (data['status'] == null || data['status'] === '') data['status'] = 'investigating';

  const findings = data['findings'];
  const findingCount = Array.isArray(findings) ? findings.length : 0;
  if (data['status'] === 'concluded' && findingCount === 0) {
    warnings.push({
      path: 'findings',
      message: '状態が「完了」ですが、所見（findings）が 1 件もありません。',
    });
  }

  const window = data['window'];
  if (isPlainObject(window)) {
    const from = toTime(window['from']);
    const to = toTime(window['to']);
    if (from != null && to != null && from > to) {
      warnings.push({
        path: 'window',
        message: '調査時間帯の開始（from）が終了（to）より後になっています。',
      });
    }
  }

  return { data, warnings };
}

/** Returns null for anything that is not a parsable date-time — the schema reports those. */
function toTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
