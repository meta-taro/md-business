import {
  describeFrontmatterError,
  FrontmatterError,
  splitFrontmatter,
  validateWithCompiled,
  type FrontmatterProblemKind,
  type ValidationError,
} from '@md-business/core';
import { resolveSchema } from '@md-business/mcp-server';
import {
  translateApiSpecError,
  API_SPEC_JA_DICTIONARY,
  SCHEMA_VERSION as API_ID,
} from '@md-business/schema-api-spec';
import {
  translateDbSpecError,
  DB_SPEC_JA_DICTIONARY,
  SCHEMA_VERSION as DB_ID,
} from '@md-business/schema-db-spec';
import {
  translateInvestigationError,
  INVESTIGATION_JA_DICTIONARY,
  SCHEMA_VERSION as INVESTIGATION_ID,
} from '@md-business/schema-investigation';
import {
  translateInvoiceError,
  INVOICE_JA_DICTIONARY,
  SCHEMA_VERSION as INVOICE_ID,
} from '@md-business/schema-invoice';
import {
  translateNosqlDbSpecError,
  NOSQL_DB_SPEC_JA_DICTIONARY,
  SCHEMA_VERSION as NOSQL_ID,
} from '@md-business/schema-nosql-db-spec';
import {
  translateSpecError,
  SPEC_JA_DICTIONARY,
  SCHEMA_VERSION as SPEC_ID,
} from '@md-business/schema-spec';
import {
  translateTestSpecError,
  TEST_SPEC_JA_DICTIONARY,
  SCHEMA_VERSION as TEST_SPEC_ID,
} from '@md-business/schema-test-spec';

import { lineForPath, SCHEMA_KEYS } from './keyLines.js';

export type Severity = 'error' | 'warning';

export interface Problem {
  /** 文書の 1 始まりの行。 */
  line: number;
  message: string;
  severity: Severity;
}

interface SchemaWording {
  translate: (error: ValidationError) => string;
  /** 文書に書けるキー → 正準キー（最上位のみ）。 */
  aliases: Readonly<Record<string, string>>;
}

const WORDING: Readonly<Record<string, SchemaWording>> = {
  [INVOICE_ID]: {
    translate: translateInvoiceError,
    aliases: INVOICE_JA_DICTIONARY.root,
  },
  [SPEC_ID]: {
    translate: translateSpecError,
    aliases: SPEC_JA_DICTIONARY.root,
  },
  [TEST_SPEC_ID]: {
    translate: translateTestSpecError,
    aliases: TEST_SPEC_JA_DICTIONARY.root,
  },
  [DB_ID]: {
    translate: translateDbSpecError,
    aliases: DB_SPEC_JA_DICTIONARY.root,
  },
  [NOSQL_ID]: {
    translate: translateNosqlDbSpecError,
    aliases: NOSQL_DB_SPEC_JA_DICTIONARY.root,
  },
  [API_ID]: {
    translate: translateApiSpecError,
    aliases: API_SPEC_JA_DICTIONARY.root,
  },
  [INVESTIGATION_ID]: {
    translate: translateInvestigationError,
    aliases: INVESTIGATION_JA_DICTIONARY.root,
  },
};

// Chrome 拡張と同じ文言にする。同じ書き間違いに、道具ごとに違う説明を出さないため。
const YAML_EXPLANATIONS: Record<FrontmatterProblemKind, string> = {
  indentation: '行頭の字下げが、上の行とそろっていません。',
  tab: '字下げにタブが使われています。空白に置き換えてください。',
  'duplicate-key': '同じ項目名が 2 回書かれています。',
  unterminated: '引用符またはかっこが閉じられていません。',
  'block-mapping': 'この行が「項目名: 値」の形になっていません。',
  'too-large': 'frontmatter が大きすぎて読み取れません。',
  'too-many-anchors': 'YAML のアンカー（&名前）が多すぎます。',
  'too-many-aliases': 'YAML の参照（*名前）が多すぎます。',
  unknown: '',
};

function declaredSchema(data: Record<string, unknown>): string | null {
  for (const key of SCHEMA_KEYS) {
    const value = data[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/**
 * Markdown 文書の frontmatter の誤りを、行つきで返す。
 *
 * スキーマを宣言していない文書はただの Markdown として扱い、YAML が壊れていても
 * 何も出さない。md-business の形で書くと宣言したファイルにだけ口を出す。
 */
export function diagnose(text: string): Problem[] {
  let data: Record<string, unknown>;
  try {
    data = splitFrontmatter(text).data;
  } catch (error: unknown) {
    if (!(error instanceof FrontmatterError)) throw error;
    // YAML が読めないと宣言の有無も分からないので、宣言の行そのものを探す。
    if (!/^(?:schema|schemaVersion|スキーマ)\s*:/m.test(text)) return [];
    const problem = describeFrontmatterError(error);
    const message =
      YAML_EXPLANATIONS[problem.kind] || `ここで読み取りが止まりました（${problem.raw}）。`;
    return [{ line: problem.line ?? 1, message, severity: 'error' }];
  }

  const id = declaredSchema(data);
  if (id === null) return [];

  const entry = resolveSchema(id);
  if (entry === null) {
    return [
      {
        line: lineForPath(text, ''),
        message: `スキーマ「${id}」は md-business では扱えません。`,
        severity: 'warning',
      },
    ];
  }

  const result = validateWithCompiled(data, entry.validate);
  if (result.ok) return [];
  const wording = WORDING[entry.id];
  return result.errors.map((err) => ({
    line: lineForPath(text, err.path, wording?.aliases),
    message: wording ? wording.translate(err) : err.message,
    severity: 'error',
  }));
}
