export interface AutofillWarning {
  path: string;
  message: string;
}

export interface AutofillResult {
  data: Record<string, unknown>;
  warnings: AutofillWarning[];
}

/**
 * Fill in sensible defaults for db-spec frontmatter so authors can publish
 * a minimal draft without ceremony. Defaults:
 *
 *   schema   → 'db-spec/v1'
 *   version  → '0.1.0'        (draft default; SemVer triple required)
 *   status   → 'draft'
 *
 * Warnings (do not block validation — design-consistency checks the JSON
 * Schema cannot express):
 *   - duplicate table names → ambiguous DDL generation target.
 *   - duplicate column names within a table → invalid DDL.
 *   - `pk: true` combined with `nullable: true` → contradictory constraint.
 *   - index referencing a column not declared in its table.
 *   - fk referencing a table not declared in the document.
 *
 * Returns a shallow clone; input is not mutated.
 */
export function autofillDbSpec(input: unknown): AutofillResult {
  const warnings: AutofillWarning[] = [];
  if (!isPlainObject(input)) return { data: {}, warnings };

  const data: Record<string, unknown> = { ...input };

  if (!data['schema']) data['schema'] = 'db-spec/v1';
  if (data['version'] == null || data['version'] === '') data['version'] = '0.1.0';
  if (data['status'] == null || data['status'] === '') data['status'] = 'draft';

  const tables = data['tables'];
  if (Array.isArray(tables)) {
    const tableNames = new Set<string>();
    for (const table of tables) {
      if (isPlainObject(table) && typeof table['name'] === 'string') {
        tableNames.add(table['name']);
      }
    }

    const seenTableNames = new Set<string>();
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      if (!isPlainObject(table)) continue;

      const tableName = table['name'];
      if (typeof tableName === 'string') {
        if (seenTableNames.has(tableName)) {
          warnings.push({
            path: `tables[${i}].name`,
            message: `テーブル名 "${tableName}" が重複しています。DDL 生成先が一意に決まりません。`,
          });
        }
        seenTableNames.add(tableName);
      }

      const columnNames = new Set<string>();
      const columns = table['columns'];
      if (Array.isArray(columns)) {
        for (let j = 0; j < columns.length; j++) {
          const column = columns[j];
          if (!isPlainObject(column)) continue;

          const columnName = column['name'];
          if (typeof columnName === 'string') {
            if (columnNames.has(columnName)) {
              warnings.push({
                path: `tables[${i}].columns[${j}].name`,
                message: `列名 "${columnName}" がテーブル "${String(tableName ?? i)}" 内で重複しています。`,
              });
            }
            columnNames.add(columnName);
          }

          if (column['pk'] === true && column['nullable'] === true) {
            warnings.push({
              path: `tables[${i}].columns[${j}].nullable`,
              message: `列 "${String(columnName ?? j)}" は pk=true と nullable=true が同時指定されています。主キーは NULL を許可できません。`,
            });
          }

          const fk = column['fk'];
          if (isPlainObject(fk) && typeof fk['table'] === 'string' && !tableNames.has(fk['table'])) {
            warnings.push({
              path: `tables[${i}].columns[${j}].fk.table`,
              message: `外部キー参照先テーブル "${fk['table']}" が本文書内に宣言されていません。外部スキーマ参照であれば無視できます。`,
            });
          }
        }
      }

      const indexes = table['indexes'];
      if (Array.isArray(indexes)) {
        for (let j = 0; j < indexes.length; j++) {
          const index = indexes[j];
          if (!isPlainObject(index)) continue;
          const indexColumns = index['columns'];
          if (!Array.isArray(indexColumns)) continue;
          const unknown = indexColumns.filter(
            (c) => typeof c === 'string' && !columnNames.has(c),
          );
          if (unknown.length > 0) {
            warnings.push({
              path: `tables[${i}].indexes[${j}].columns`,
              message: `インデックス "${String(index['name'] ?? j)}" が未宣言の列 (${unknown.join(', ')}) を参照しています。`,
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
