/**
 * MCP P0 ツール本体（Issue 004 Phase 2・B-1 P0）。
 * -----------------------------------------------------------------------------
 * read_document / validate_document（本 Block MCP-3）。create / update / search は
 * 後続ブロックで追加。fs には触れず DocumentStore 越しに動くので純ロジックとして
 * 単体テストできる。パスは必ず safeRelativePath でワークスペース境界を担保する。
 */
import {
  splitFrontmatter,
  serializeMarkdown,
  buildDocument,
  validateWithCompiled,
  type ValidationError,
} from '@md-business/core';
import { safeRelativePath } from './workspacePath.js';
import { detectSchemaId, resolveSchema } from './registry.js';
import { diffLines, type DiffLine } from './diff.js';
import type { DocumentStore } from './store.js';

/** ツールが実行そのものに失敗した（越境パス・ファイル不在など）ときの共通形。 */
export interface ToolError {
  ok: false;
  /** 日本語の失敗理由（MCP 応答へそのまま載せる）。 */
  error: string;
}

/** schema 宣言が無い / 未知のときに返す共通の検証エラー。 */
function schemaUndeclaredErrors(): ValidationError[] {
  return [
    {
      path: '/',
      message:
        'schema が未宣言、または未知のスキーマです（schema / schemaVersion / スキーマ のいずれかで宣言してください）',
      keyword: 'schema',
    },
  ];
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
      errors: schemaUndeclaredErrors(),
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

export interface CreateDocumentInput {
  /** 使用するスキーマ id（`invoice/v1` など）。検証器の選択と schema 宣言の注入に使う。 */
  schema: string;
  /** 構造化 frontmatter（schema 宣言キーは無くてよい・こちらで注入する）。 */
  frontmatter: Record<string, unknown>;
  /** Markdown 本文。 */
  body: string;
  /** 書き込み先ワークスペース相対パス。 */
  path: string;
}

export interface CreateDocumentOk {
  ok: true;
  path: string;
  /** 実際に宣言・検証した schema id。 */
  schema: string;
  /** JSON Schema 検証を通ったか。 */
  valid: boolean;
  /** 検証エラー（valid:true なら空）。 */
  errors: ValidationError[];
}

/**
 * 構造化 frontmatter + 本文から新規文書を作成する。schema 宣言は種別の canonical キー
 * （invoice/spec は schemaVersion、他は schema）で注入する。既存パスは上書きしない。
 * buildDocument の方針どおり検証が通らなくても書き出し、valid/errors を透過的に返す
 *（エージェントは update で修正できる）。
 */
export async function createDocument(
  store: DocumentStore,
  input: CreateDocumentInput,
): Promise<CreateDocumentOk | ToolError> {
  const safe = safeRelativePath(input.path);
  if (!safe.ok) return { ok: false, error: safe.reason };
  const entry = resolveSchema(input.schema);
  if (entry === null) return { ok: false, error: `未知のスキーマです: ${input.schema}` };
  if (await store.exists(safe.relative)) {
    return { ok: false, error: `既に存在します（上書きしません）: ${safe.relative}` };
  }
  // 選択スキーマと宣言を一致させるため、canonical キーへ id を上書き注入する。
  const frontmatter = { ...input.frontmatter, [entry.schemaKey]: entry.id };
  const { markdown, validation } = buildDocument({ frontmatter, body: input.body, validate: entry.validate });
  await store.write(safe.relative, markdown);
  return {
    ok: true,
    path: safe.relative,
    schema: entry.id,
    valid: validation.ok,
    errors: validation.ok ? [] : validation.errors,
  };
}

export interface UpdateDocumentInput {
  /** 更新対象のワークスペース相対パス。 */
  path: string;
  /** 差し替える frontmatter（既存へ浅くマージ・省略時は据え置き）。 */
  frontmatter?: Record<string, unknown>;
  /** 差し替える本文（省略時は据え置き）。 */
  body?: string;
}

export interface UpdateDocumentOk {
  ok: true;
  path: string;
  /** 更新後 frontmatter から検出した schema id（未宣言なら null）。 */
  schema: string | null;
  valid: boolean;
  errors: ValidationError[];
  /** 更新前後の行 diff（プレビュー用）。 */
  diff: DiffLine[];
}

/**
 * 既存文書の frontmatter（浅くマージ）／本文を更新する。schema は更新後の frontmatter から
 * 再検出して検証し、更新前後の行 diff を添えて返す。create と違い対象が存在しないと error。
 */
export async function updateDocument(
  store: DocumentStore,
  input: UpdateDocumentInput,
): Promise<UpdateDocumentOk | ToolError> {
  const safe = safeRelativePath(input.path);
  if (!safe.ok) return { ok: false, error: safe.reason };
  if (!(await store.exists(safe.relative))) {
    return { ok: false, error: `ファイルが見つかりません: ${safe.relative}` };
  }
  const before = await store.read(safe.relative);
  const parsed = splitFrontmatter(before);
  const frontmatter = { ...parsed.data, ...(input.frontmatter ?? {}) };
  const body = input.body ?? parsed.body;
  const schemaId = detectSchemaId(frontmatter);

  let markdown: string;
  let valid: boolean;
  let errors: ValidationError[];
  if (schemaId === null) {
    markdown = serializeMarkdown(frontmatter, body);
    valid = false;
    errors = schemaUndeclaredErrors();
  } else {
    const entry = resolveSchema(schemaId);
    if (entry === null) return { ok: false, error: `スキーマを解決できません: ${schemaId}` };
    const built = buildDocument({ frontmatter, body, validate: entry.validate });
    markdown = built.markdown;
    valid = built.validation.ok;
    errors = built.validation.ok ? [] : built.validation.errors;
  }

  const diff = diffLines(before, markdown);
  await store.write(safe.relative, markdown);
  return { ok: true, path: safe.relative, schema: schemaId, valid, errors, diff };
}
