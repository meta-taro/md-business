export interface AutofillWarning {
  path: string;
  message: string;
}

export interface AutofillResult {
  data: Record<string, unknown>;
  warnings: AutofillWarning[];
}

/**
 * Fill in sensible defaults for nosql-db-spec frontmatter so authors can
 * publish a minimal draft without ceremony. Defaults:
 *
 *   schema   → 'nosql-db-spec/v1'
 *   version  → '0.1.0'        (draft default; SemVer triple required)
 *   status   → 'draft'
 *
 * Warnings (do not block validation — design-consistency checks the JSON
 * Schema cannot express):
 *   - duplicate collection paths → ambiguous provisioning target.
 *   - partitionKeyField / sortKeyField without docIdStrategy: composite.
 *   - composite key fields not declared in the collection's shape.
 *   - ttl.field not declared in the collection's shape.
 *   - index fields whose top-level segment is not declared in the shape
 *     (dot notation resolves against the first segment only — nested map
 *     shapes are not walked).
 *
 * Returns a shallow clone; input is not mutated.
 */
export function autofillNosqlDbSpec(input: unknown): AutofillResult {
  const warnings: AutofillWarning[] = [];
  if (!isPlainObject(input)) return { data: {}, warnings };

  const data: Record<string, unknown> = { ...input };

  if (!data['schema']) data['schema'] = 'nosql-db-spec/v1';
  if (data['version'] == null || data['version'] === '') data['version'] = '0.1.0';
  if (data['status'] == null || data['status'] === '') data['status'] = 'draft';

  const collections = data['collections'];
  if (Array.isArray(collections)) {
    const seenPaths = new Set<string>();
    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      if (!isPlainObject(collection)) continue;

      const path = collection['path'];
      if (typeof path === 'string') {
        if (seenPaths.has(path)) {
          warnings.push({
            path: `collections[${i}].path`,
            message: `コレクションパス "${path}" が重複しています。プロビジョニング先が一意に決まりません。`,
          });
        }
        seenPaths.add(path);
      }

      const shape = collection['shape'];
      const shapeFields = isPlainObject(shape)
        ? new Set(Object.keys(shape))
        : null;

      const isComposite = collection['docIdStrategy'] === 'composite';
      for (const keyProp of ['partitionKeyField', 'sortKeyField'] as const) {
        const keyField = collection[keyProp];
        if (typeof keyField !== 'string' || keyField === '') continue;
        if (!isComposite) {
          warnings.push({
            path: `collections[${i}].${keyProp}`,
            message: `${keyProp} は docIdStrategy: composite のときのみ意味を持ちます（現在: ${String(collection['docIdStrategy'] ?? '未指定')}）。`,
          });
        } else if (shapeFields && !shapeFields.has(keyField)) {
          warnings.push({
            path: `collections[${i}].${keyProp}`,
            message: `複合キーのフィールド "${keyField}" が shape に宣言されていません。`,
          });
        }
      }

      const ttl = collection['ttl'];
      if (isPlainObject(ttl) && typeof ttl['field'] === 'string') {
        if (shapeFields && !shapeFields.has(ttl['field'])) {
          warnings.push({
            path: `collections[${i}].ttl.field`,
            message: `TTL フィールド "${ttl['field']}" が shape に宣言されていません。`,
          });
        }
      }

      const indexes = collection['indexes'];
      if (Array.isArray(indexes) && shapeFields) {
        for (let j = 0; j < indexes.length; j++) {
          const index = indexes[j];
          if (!isPlainObject(index)) continue;
          const fields = index['fields'];
          if (!Array.isArray(fields)) continue;
          const unknown = fields.filter(
            (f) =>
              typeof f === 'string' &&
              !shapeFields.has(f.split('.')[0] ?? f),
          );
          if (unknown.length > 0) {
            warnings.push({
              path: `collections[${i}].indexes[${j}].fields`,
              message: `インデックスが shape に未宣言のフィールド (${unknown.join(', ')}) を参照しています。`,
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
