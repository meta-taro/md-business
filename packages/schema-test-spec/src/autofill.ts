export interface AutofillWarning {
  path: string;
  message: string;
}

export interface AutofillResult {
  data: Record<string, unknown>;
  warnings: AutofillWarning[];
}

/**
 * Fill in sensible defaults for test-spec frontmatter so authors can publish
 * a minimal draft without ceremony. Defaults:
 *
 *   schema   → 'test-spec/v1'
 *   version  → '0.1.0'        (draft default; SemVer triple required)
 *   status   → 'draft'
 *
 * Warnings (do not block validation):
 *   - `type: 'enum'` declared but `values` missing → flagged as a clear
 *     authoring mistake (schema will also block it via the if/then clause,
 *     but warning fires first so error message is more actionable).
 *   - `googleSheetId` provided but no columns → likely incomplete setup.
 *   - duplicate column names → ambiguous when mapping to Sheets headers.
 *   - `visual` key references a value not declared in `values` → unused style.
 *
 * Returns a shallow clone; input is not mutated.
 */
export function autofillTestSpec(input: unknown): AutofillResult {
  const warnings: AutofillWarning[] = [];
  if (!isPlainObject(input)) return { data: {}, warnings };

  const data: Record<string, unknown> = { ...input };

  if (!data['schema']) data['schema'] = 'test-spec/v1';
  if (data['version'] == null || data['version'] === '') data['version'] = '0.1.0';
  if (data['status'] == null || data['status'] === '') data['status'] = 'draft';

  const columns = data['columns'];
  if (Array.isArray(columns)) {
    const seen = new Set<string>();
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      if (!isPlainObject(column)) continue;
      const name = column['name'];
      if (typeof name === 'string') {
        if (seen.has(name)) {
          warnings.push({
            path: `columns[${i}].name`,
            message: `列名 "${name}" が重複しています。Sheets ヘッダーは一意である必要があります。`,
          });
        }
        seen.add(name);
      }
      const type = column['type'];
      const values = column['values'];
      if (type === 'enum' && (!Array.isArray(values) || values.length === 0)) {
        warnings.push({
          path: `columns[${i}].values`,
          message: `列 "${String(name ?? i)}" は type=enum ですが values が宣言されていません。プルダウンの候補値を最低 1 件指定してください。`,
        });
      }
      const visual = column['visual'];
      if (
        isPlainObject(visual) &&
        Array.isArray(values) &&
        values.every((v) => typeof v === 'string')
      ) {
        const allowed = new Set(values as string[]);
        for (const visualKey of Object.keys(visual)) {
          if (!allowed.has(visualKey)) {
            warnings.push({
              path: `columns[${i}].visual.${visualKey}`,
              message: `visual キー "${visualKey}" が values に存在しません。書式が適用されません。`,
            });
          }
        }
      }
    }
  }

  return { data, warnings };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
