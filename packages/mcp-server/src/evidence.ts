/**
 * 証拠の保存（save_evidence）。
 * -----------------------------------------------------------------------------
 * 調べて取り出した中身を、報告書から指せる形で 1 件 1 ファイルに残す層。要は 4 つ。
 *
 * 1. **出どころを本文に残す**。どのファイルをどのツールで見た結果なのかが無い塊は、
 *    後から確かめようがないので証拠にならない
 * 2. **上書きしない**。同じ番号への保存は断る。証拠が黙って差し替わると、
 *    報告書の参照が指す中身だけが変わり、記録として成立しなくなる
 * 3. **保存する前に伏せ字を通す**。証拠はそのまま人に配られる。ここを通さないと、
 *    調査の途中では伏せていた値が、成果物になった瞬間に出る
 * 4. **番号は形を決めて受け取る**。置き場の名前を呼び出し側に組み立てさせない
 */
import { maskSecrets } from './maskSecrets.js';
import { safeRelativePath } from './workspacePath.js';
import type { MaskCounts } from './toolLimits.js';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';

/** 証拠の置き場。報告書（`docs/investigations/*.md`）から `evidence/EV-001.md` で指せる並びにする。 */
export const EVIDENCE_DIR = 'docs/investigations/evidence';

/** 番号の形。ここを緩めると置き場の外へ書けてしまう。 */
const ID_PATTERN = /^EV-\d{3,}$/;

/** 本文の長さの上限。証拠は「抜き出したもの」なので、丸ごとの写しは受け取らない。 */
const MAX_BODY_LENGTH = 200_000;

/** どのツールで取り出したか。列挙にして、由来の分からない証拠を作らせない。 */
export type EvidenceTool =
  | 'search_lines'
  | 'read_lines'
  | 'filter_records'
  | 'aggregate'
  | 'build_timeline'
  | 'manual';

export interface SaveEvidenceInput {
  /** 何の証拠か。 */
  title: string;
  /** どのツールで取り出したか。 */
  tool: EvidenceTool;
  /** 元にしたファイル（ワークスペース相対パス）。1 件以上。 */
  sources: string[];
  /** 取り出した中身そのもの。 */
  body: string;
  /** なぜ残すか（所見との対応など）。 */
  note?: string;
  /** 番号。省略すると空いている次の番号。 */
  id?: string;
}

export interface SaveEvidenceOk {
  ok: true;
  id: string;
  /** 保存したワークスペース相対パス。 */
  path: string;
  /** 報告書（`docs/investigations/` 直下）から書く参照。 */
  reference: string;
  masked: MaskCounts;
}

/** 既にある証拠を見て、次の番号を決める。 */
async function nextId(store: DocumentStore): Promise<string> {
  const prefix = `${EVIDENCE_DIR}/`;
  let max = 0;
  for (const path of await store.list()) {
    if (!path.startsWith(prefix)) continue;
    const found = /^EV-(\d+)\.md$/.exec(path.slice(prefix.length));
    if (found === null) continue;
    max = Math.max(max, Number(found[1]));
  }
  return `EV-${String(max + 1).padStart(3, '0')}`;
}

/** YAML の値として安全に置けるよう、1 行に畳んで引用符で囲む。 */
function quote(value: string): string {
  const folded = value.replace(/\s+/g, ' ').trim();
  return `'${folded.replace(/'/g, "''")}'`;
}

/**
 * 抽出結果を証拠として 1 ファイルに保存する。
 */
export async function saveEvidence(
  store: DocumentStore,
  input: SaveEvidenceInput,
  now: () => number = Date.now,
): Promise<SaveEvidenceOk | ToolError> {
  if (input.title.trim() === '') return { ok: false, error: 'title が空です。' };
  if (input.body.trim() === '') {
    return { ok: false, error: 'body が空です。証拠には取り出した中身が要ります。' };
  }
  if (input.body.length > MAX_BODY_LENGTH) {
    return { ok: false, error: `body が長すぎます（上限 ${MAX_BODY_LENGTH} 文字）。` };
  }
  if (input.sources.length === 0) {
    return { ok: false, error: 'sources が空です。出どころの無い証拠は残せません。' };
  }

  const sources: string[] = [];
  for (const source of input.sources) {
    const safe = safeRelativePath(source);
    if (!safe.ok) return { ok: false, error: safe.reason };
    sources.push(safe.relative);
  }

  if (input.id !== undefined && !ID_PATTERN.test(input.id)) {
    return { ok: false, error: `id は EV-001 の形で指定してください: ${input.id}` };
  }
  const id = input.id ?? (await nextId(store));
  const path = `${EVIDENCE_DIR}/${id}.md`;

  if (await store.exists(path)) {
    return { ok: false, error: `${id} は既にあります。証拠は上書きしません。` };
  }

  const bodyMask = maskSecrets(input.body);
  const titleMask = maskSecrets(input.title);
  const noteMask = input.note === undefined ? undefined : maskSecrets(input.note);

  const masked: MaskCounts = {};
  for (const result of [titleMask, bodyMask, noteMask]) {
    if (result === undefined) continue;
    for (const [kind, count] of Object.entries(result.counts)) {
      masked[kind as keyof MaskCounts] = (masked[kind as keyof MaskCounts] ?? 0) + (count ?? 0);
    }
  }

  const lines = [
    '---',
    `evidence: ${id}`,
    `title: ${titleMask.text}`,
    `tool: ${input.tool}`,
    `savedAt: ${new Date(now()).toISOString()}`,
    'sources:',
    ...sources.map((source) => `  - ${quote(source)}`),
    '---',
    '',
    `# ${titleMask.text}`,
    '',
  ];
  if (noteMask !== undefined) lines.push(noteMask.text, '');
  lines.push('## 取り出した中身', '', bodyMask.text, '');

  await store.write(path, lines.join('\n'));

  return { ok: true, id, path, reference: `evidence/${id}.md`, masked };
}
