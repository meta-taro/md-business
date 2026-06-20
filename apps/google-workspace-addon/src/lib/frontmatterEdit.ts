import yaml from 'js-yaml';

export type ColumnType =
  | 'text'
  | 'multiline_text'
  | 'enum'
  | 'date'
  | 'number'
  | 'checkbox'
  | 'url';

const VALID_TYPES: ReadonlyArray<ColumnType> = [
  'text',
  'multiline_text',
  'enum',
  'date',
  'number',
  'checkbox',
  'url',
];

export interface ColumnInput {
  name: string;
  type: ColumnType;
  values?: string[];
}

export type EditResult =
  | { ok: true; newSrc: string }
  | { ok: false; error: string };

const OPEN = '---';
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Split a markdown source into raw YAML (without delimiters) and body.
 * Why: frontmatterEdit functions need to round-trip through js-yaml without
 *      losing the body, and the sidebar UI also wants to display the YAML
 *      portion to the user.
 */
export function extractFrontmatter(src: string): { yaml: string; body: string } {
  if (!src.startsWith(OPEN)) {
    return { yaml: '', body: src };
  }
  const match = FRONTMATTER_RE.exec(src);
  if (!match) {
    return { yaml: '', body: src };
  }
  const body = src.slice(match[0].length);
  return { yaml: match[1] ?? '', body };
}

/**
 * Replace the frontmatter YAML portion of a markdown source, preserving body.
 * When `src` has no frontmatter, the new block is prepended.
 */
export function replaceFrontmatter(src: string, newYaml: string): string {
  const trimmed = newYaml.replace(/\r?\n$/, '');
  const block = `---\n${trimmed}\n---`;
  if (!src.startsWith(OPEN) || !FRONTMATTER_RE.test(src)) {
    return `${block}\n${src}`;
  }
  return src.replace(FRONTMATTER_RE, `${block}\n`);
}

function loadYamlObject(yamlStr: string): Record<string, unknown> {
  if (yamlStr.trim().length === 0) return {};
  const parsed = yaml.load(yamlStr, { schema: yaml.JSON_SCHEMA });
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

function dumpYaml(obj: Record<string, unknown>): string {
  return yaml.dump(obj, { noRefs: true, lineWidth: 120, sortKeys: false }).replace(/\r?\n$/, '');
}

function buildColumn(column: ColumnInput): Record<string, unknown> {
  const out: Record<string, unknown> = { name: column.name, type: column.type };
  if (column.type === 'enum' && column.values && column.values.length > 0) {
    out.values = column.values;
  }
  return out;
}

export function appendColumnToFrontmatter(src: string, column: ColumnInput): EditResult {
  if (typeof column.name !== 'string' || column.name.trim().length === 0) {
    return { ok: false, error: 'column name is required' };
  }
  if (!VALID_TYPES.includes(column.type)) {
    return { ok: false, error: `unsupported column type: ${String(column.type)}` };
  }

  const { yaml: existingYaml, body } = extractFrontmatter(src);
  const data = loadYamlObject(existingYaml);
  const columns = Array.isArray(data.columns) ? [...(data.columns as unknown[])] : [];
  columns.push(buildColumn(column));
  data.columns = columns;

  const newYaml = dumpYaml(data);
  const baseSrc = existingYaml === '' && body === src ? body : src;
  return { ok: true, newSrc: replaceFrontmatter(baseSrc, newYaml) };
}

export function removeLastColumnFromFrontmatter(src: string): EditResult {
  const { yaml: existingYaml } = extractFrontmatter(src);
  if (existingYaml === '') {
    return { ok: false, error: 'no frontmatter found in source' };
  }
  const data = loadYamlObject(existingYaml);
  const columns = Array.isArray(data.columns) ? [...(data.columns as unknown[])] : [];
  if (columns.length > 0) {
    columns.pop();
  }
  data.columns = columns;
  return { ok: true, newSrc: replaceFrontmatter(src, dumpYaml(data)) };
}

export type TestSpecTemplateKey = 'minimal' | 'full' | 'clear';

export function applyTestSpecTemplate(templateKey: TestSpecTemplateKey): string {
  if (templateKey === 'clear') return '';
  if (templateKey === 'minimal') return MINIMAL_TEMPLATE;
  return FULL_TEMPLATE;
}

const MINIMAL_TEMPLATE = [
  '---',
  'schema: test-spec/v1',
  'documentNumber: TEST-2026-0001',
  'title: 検証シート',
  'issueDate: 2026-06-19',
  'authors:',
  '  - { name: 担当, role: PdM }',
  'columns:',
  '  - { name: 項目, type: text }',
  '---',
].join('\n');

const FULL_TEMPLATE = [
  '---',
  'schema: test-spec/v1',
  'documentNumber: TEST-2026-0001',
  'title: ログイン機能 検証シート',
  'issueDate: 2026-06-19',
  'status: executing',
  'authors:',
  '  - { name: 担当, role: PdM }',
  'columns:',
  '  - { name: 項目, type: text }',
  '  - { name: 手順, type: multiline_text }',
  '  - name: 結果',
  '    type: enum',
  '    values: [OK, NG, 保留, 未実施]',
  '    visual:',
  '      NG: { row_background: "#fce8e6" }',
  '      保留: { background: "#fef7e0" }',
  '      OK: { color: "#1e7e34" }',
  '  - { name: 実施日, type: date }',
  '  - { name: 回数, type: number, min: 1, max: 10 }',
  '  - { name: 完了, type: checkbox }',
  '  - { name: 参考リンク, type: url }',
  '---',
].join('\n');
