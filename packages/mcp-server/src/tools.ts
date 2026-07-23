/**
 * MCP P0 ツール本体（Issue 004 Phase 2・B-1 P0）。
 * -----------------------------------------------------------------------------
 * read_document / validate_document（本 Block MCP-3）。create / update / search は
 * 後続ブロックで追加。fs には触れず DocumentStore 越しに動くので純ロジックとして
 * 単体テストできる。パスは必ず safeRelativePath でワークスペース境界を担保する。
 */
import { splitFrontmatter, validateWithCompiled, type ValidationError } from '@md-business/core';
import { safeRelativePath } from './workspacePath.js';
import { detectSchemaId, resolveSchema } from './registry.js';
import type { DocumentStore } from './store.js';

/** ツールが実行そのものに失敗した（越境パス・ファイル不在など）ときの共通形。 */
export interface ToolError {
  ok: false;
  /** 日本語の失敗理由（MCP 応答へそのまま載せる）。 */
  error: string;
}

export interface ReadDocumentOk {
  ok: true;
  /** 正規化済み相対パス。 */
  path: string;
  /** 検出した schema id（宣言なし / 未知なら null）。 */
  schema: string | null;
  /** frontmatter オブジェクト。 */
  frontmatter: Record<string, unknown>;
  /** frontmatter を除いた Markdown 本文。 */
  body: string;
}

/** ローカル文書を読み、frontmatter / body / 検出 schema を返す。 */
export async function readDocument(
  store: DocumentStore,
  requestedPath: string,
): Promise<ReadDocumentOk | ToolError> {
  const safe = safeRelativePath(requestedPath);
  if (!safe.ok) return { ok: false, error: safe.reason };
  if (!(await store.exists(safe.relative))) {
    return { ok: false, error: `ファイルが見つかりません: ${safe.relative}` };
  }
  const src = await store.read(safe.relative);
  const { data, body } = splitFrontmatter(src);
  return { ok: true, path: safe.relative, schema: detectSchemaId(data), frontmatter: data, body };
}

export interface ValidateDocumentOk {
  ok: true;
  path: string;
  /** 検出した schema id（未宣言 / 未知なら null）。 */
  schema: string | null;
  /** JSON Schema 検証を通ったか。schema 未検出時は false。 */
  valid: boolean;
  /** 検証エラー（valid:true なら空）。 */
  errors: ValidationError[];
}

/** ローカル文書を検出スキーマで検証する。schema 未宣言/未知は valid:false + schema エラー。 */
export async function validateDocument(
  store: DocumentStore,
  requestedPath: string,
): Promise<ValidateDocumentOk | ToolError> {
  const safe = safeRelativePath(requestedPath);
  if (!safe.ok) return { ok: false, error: safe.reason };
  if (!(await store.exists(safe.relative))) {
    return { ok: false, error: `ファイルが見つかりません: ${safe.relative}` };
  }
  const src = await store.read(safe.relative);
  const { data } = splitFrontmatter(src);
  const schemaId = detectSchemaId(data);
  if (schemaId === null) {
    return {
      ok: true,
      path: safe.relative,
      schema: null,
      valid: false,
      errors: [
        {
          path: '/',
          message:
            'schema が未宣言、または未知のスキーマです（schema / schemaVersion / スキーマ のいずれかで宣言してください）',
          keyword: 'schema',
        },
      ],
    };
  }
  const entry = resolveSchema(schemaId);
  // detectSchemaId が既知 id を返した以上、resolveSchema は必ず解決する。
  if (entry === null) {
    return { ok: false, error: `スキーマを解決できません: ${schemaId}` };
  }
  const result = validateWithCompiled(data, entry.validate);
  if (result.ok) {
    return { ok: true, path: safe.relative, schema: schemaId, valid: true, errors: [] };
  }
  return { ok: true, path: safe.relative, schema: schemaId, valid: false, errors: result.errors };
}
