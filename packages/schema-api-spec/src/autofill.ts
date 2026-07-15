export interface AutofillWarning {
  path: string;
  message: string;
}

export interface AutofillResult {
  data: Record<string, unknown>;
  warnings: AutofillWarning[];
}

/**
 * Fill in sensible defaults for api-spec frontmatter so authors can publish a
 * minimal draft without ceremony. Defaults:
 *
 *   schema   → 'api-spec/v1'
 *   version  → '0.1.0'        (draft default; SemVer triple required)
 *   status   → 'draft'
 *   protocol → 'rest'
 *   auth     → 'none'
 *
 * Warnings (do not block validation — design-consistency checks the JSON
 * Schema cannot express):
 *   - duplicate operationId across endpoints → ambiguous operation reference.
 *   - duplicate method + path combination → ambiguous route.
 *   - duplicate response status within one endpoint → ambiguous response.
 *   - response.errorRef referencing an error code not declared in `errors[]`.
 *
 * Returns a shallow clone; input is not mutated.
 */
export function autofillApiSpec(input: unknown): AutofillResult {
  const warnings: AutofillWarning[] = [];
  if (!isPlainObject(input)) return { data: {}, warnings };

  const data: Record<string, unknown> = { ...input };

  if (!data['schema']) data['schema'] = 'api-spec/v1';
  if (data['version'] == null || data['version'] === '') data['version'] = '0.1.0';
  if (data['status'] == null || data['status'] === '') data['status'] = 'draft';
  if (data['protocol'] == null || data['protocol'] === '') data['protocol'] = 'rest';
  if (data['auth'] == null || data['auth'] === '') data['auth'] = 'none';

  const declaredErrorCodes = collectErrorCodes(data['errors']);

  const endpoints = data['endpoints'];
  if (Array.isArray(endpoints)) {
    const seenOperationIds = new Set<string>();
    const seenRoutes = new Set<string>();

    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      if (!isPlainObject(endpoint)) continue;

      const operationId = endpoint['operationId'];
      if (typeof operationId === 'string') {
        if (seenOperationIds.has(operationId)) {
          warnings.push({
            path: `endpoints[${i}].operationId`,
            message: `operationId "${operationId}" が重複しています。エンドポイント参照が一意に決まりません。`,
          });
        }
        seenOperationIds.add(operationId);
      }

      const method = endpoint['method'];
      const path = endpoint['path'];
      if (typeof method === 'string' && typeof path === 'string') {
        const route = `${method} ${path}`;
        if (seenRoutes.has(route)) {
          warnings.push({
            path: `endpoints[${i}].path`,
            message: `ルート "${route}" が重複しています。メソッドとパスの組み合わせは一意である必要があります。`,
          });
        }
        seenRoutes.add(route);
      }

      const responses = endpoint['responses'];
      if (Array.isArray(responses)) {
        const seenStatuses = new Set<number>();
        for (let j = 0; j < responses.length; j++) {
          const response = responses[j];
          if (!isPlainObject(response)) continue;

          const status = response['status'];
          if (typeof status === 'number') {
            if (seenStatuses.has(status)) {
              warnings.push({
                path: `endpoints[${i}].responses[${j}].status`,
                message: `ステータスコード ${status} がエンドポイント "${String(operationId ?? i)}" 内で重複しています。`,
              });
            }
            seenStatuses.add(status);
          }

          const errorRef = response['errorRef'];
          if (
            typeof errorRef === 'string' &&
            declaredErrorCodes !== null &&
            !declaredErrorCodes.has(errorRef)
          ) {
            warnings.push({
              path: `endpoints[${i}].responses[${j}].errorRef`,
              message: `エラー参照 "${errorRef}" が errors[] に宣言されていません。`,
            });
          }
        }
      }
    }
  }

  return { data, warnings };
}

/**
 * Collect declared error codes. Returns `null` when no `errors` array is present
 * so the caller can skip dangling-reference checks entirely (an author who omits
 * the catalog should not be warned about every errorRef).
 */
function collectErrorCodes(errors: unknown): Set<string> | null {
  if (!Array.isArray(errors)) return null;
  const codes = new Set<string>();
  for (const entry of errors) {
    if (isPlainObject(entry) && typeof entry['code'] === 'string') {
      codes.add(entry['code']);
    }
  }
  return codes;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
