/**
 * 共通観点マスタからの展開（`#@ expand <マスタ.tsv> key=… columns=… [apply=… for=…]`）。
 *
 * 権限・文字数上限・連打・タブ移動順のように、**機能が変わっても文面がほぼ同じ観点**がある。
 * それを機能ごとに手で書き写しているので、観点を 1 つ足したときに既にあるシートへ行き渡らない。
 * 写し漏れは「そのシートに無い」という形でしか現れないため、シートを見ても気づけない。
 * 対象が大きいほど効く（画面の数だけ写す先がある）。
 *
 * ## 既にある行には触らない
 *
 * 展開し直しは**足りないキーを足すだけ**。人が入れた結果も、現場に合わせて直した手順も、
 * マスタの文面で上書きしない。上書きは一見きれいに揃うが、消えたことが誰にも見えない。
 *
 * ## `columns=` は必須
 *
 * 「同じ名前の列を全部写す」を既定にすると、マスタ側の `結果` 列まで写る。写った先では
 * **もう試したことになっている行**が並び、しかも見た目は正しい。既定で安全側に倒せない
 * 以上、どの列を写すかは毎回書かせる。
 *
 * ## 文面のずれは黙る
 *
 * 写したあとに現場で直したのか、マスタが後から更新されたのかを、こちらからは見分けられない
 * （`#@ link` / `#@ review` と同じ判断）。見分けられないものを警告にすると、消していい警告に
 * 慣れる。知らせるのは**マスタから消えたキー**だけで、これは片側にしか無いと言い切れる。
 *
 * ここは「足す行を組む」ところまで。実際に足すかどうか・どこへ書くかは呼ぶ側が決める。
 */
import { splitLinkedValues } from './columnLink.js';
import { splitDirectiveOptions } from './directiveOptions.js';
import type { TsvDocument } from './parse.js';

/** ディレクティブの種別語。 */
const EXPAND_DIRECTIVE = 'expand';

/** 受け付けるオプション。ここに無いキーが来たら宣言ごと捨てる。 */
const KNOWN_OPTIONS = new Set(['key', 'columns', 'apply', 'for']);

/** 列名・適用先の区切り。 */
const VALUE_SEPARATOR = ',';

/** その PC でしか開けない書き方。共有した時点で壊れているので受け付けない。 */
const ABSOLUTE_PATTERN = /^(\/|[a-z]:\/)/i;

/** 展開の宣言 1 本。 */
export interface ExpandRule {
  /** マスタ（いま開いているファイルからの相対）。 */
  path: string;
  /** 観点を見分ける列の名前。マスタとこのシートで同じ名前を使う。 */
  key: string;
  /** マスタから写す列の名前。 */
  columns: readonly string[];
  /** 適用先で絞るときの、マスタ側の列名。絞らなければ null。 */
  apply: string | null;
  /** 絞り込む値。`apply` が null なら空。 */
  values: readonly string[];
}

/** 展開してみた結果。ここでは何も書き換えていない。 */
export interface ExpandPlan {
  /** 足せる行。並びはこのシートの列定義どおりで、写さない列は空のまま。 */
  rows: readonly (readonly string[])[];
  /** 足せる行のキー（`rows` と同じ順）。 */
  keys: readonly string[];
  /** 宣言が指しているのにマスタに無い列。1 つでもあれば何も足さない。 */
  missingColumns: readonly string[];
  /** このシートにあるが、マスタにもう無いキー。消すかどうかは人が決める。 */
  orphans: readonly string[];
  /** キーが空で写せなかったマスタ行の数（見出し代わりの行など）。 */
  skipped: number;
}

const EMPTY_PLAN: ExpandPlan = {
  rows: [],
  keys: [],
  missingColumns: [],
  orphans: [],
  skipped: 0,
};

/**
 * ディレクティブ群から展開の宣言を読む。
 *
 * `key=` / `columns=` が無い・このシートに無い列を指している・`apply=` と `for=` が片方だけ・
 * 知らないオプション・列を引けない参照先（`.tsv` 以外）・絶対パスなら、**その宣言を捨てる**。
 */
export function readExpandRules(
  directives: readonly string[],
  columnNames: readonly string[],
): ExpandRule[] {
  const rules: ExpandRule[] = [];

  for (const directive of directives) {
    if (!directive.startsWith(`${EXPAND_DIRECTIVE} `)) continue;
    const rule = parseRule(directive.slice(EXPAND_DIRECTIVE.length + 1).trim(), columnNames);
    if (rule !== null) rules.push(rule);
  }

  return rules;
}

function parseRule(body: string, columnNames: readonly string[]): ExpandRule | null {
  const { head, options } = splitDirectiveOptions(body);

  const path = normalizePath(head);
  if (path === null) return null;

  for (const key of options.keys()) {
    if (!KNOWN_OPTIONS.has(key)) return null;
  }

  const key = options.get('key') ?? '';
  if (key === '' || !hasColumn(columnNames, key)) return null;

  const columns = splitValues(options.get('columns'));
  if (columns.length === 0) return null;
  if (columns.some((column) => !hasColumn(columnNames, column))) return null;

  const apply = options.get('apply') ?? '';
  const values = splitValues(options.get('for'));
  // 片方だけでは何を絞るのかが決まらない。黙って絞らずに展開すると、要らない観点が全部入る。
  if ((apply === '') !== (values.length === 0)) return null;

  return { path, key, columns, apply: apply === '' ? null : apply, values };
}

function normalizePath(head: string): string | null {
  // Windows で入力すると区切りが `\` になる。書いた本人の環境でだけ動く形にしない。
  const path = head.replace(/\\/g, '/').trim();
  if (path === '' || ABSOLUTE_PATTERN.test(path)) return null;
  // 列を引ける形式に限る。`.md` には列が無いので、指せても写せない。
  if (!path.toLowerCase().endsWith('.tsv')) return null;
  return path;
}

function splitValues(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(VALUE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function hasColumn(columnNames: readonly string[], name: string): boolean {
  return columnNames.some((column) => column.trim() === name);
}

function columnIndex(doc: TsvDocument, name: string): number {
  return doc.columns.findIndex((column) => column.name.trim() === name);
}

/**
 * マスタと突き合わせて、足せる行を組む。**`doc` も `master` も書き換えない。**
 *
 * 既にあるキーは飛ばす。マスタ側で同じキーが 2 回出てきたら 1 回だけ足す（どちらが正しいか
 * を決められないので、先に出たほうを使う）。
 */
export function planExpansion(doc: TsvDocument, rule: ExpandRule, master: TsvDocument): ExpandPlan {
  const keyAt = columnIndex(doc, rule.key);
  if (keyAt < 0) return EMPTY_PLAN;

  const masterKeyAt = columnIndex(master, rule.key);
  const missingColumns = [rule.key, ...rule.columns, ...(rule.apply === null ? [] : [rule.apply])]
    .filter((name, at, all) => all.indexOf(name) === at)
    .filter((name) => columnIndex(master, name) < 0);
  // 1 列でも欠けていれば、欠けた列だけ空の行が並ぶ。半端に足すより足さないほうが気づける。
  if (missingColumns.length > 0 || masterKeyAt < 0) return { ...EMPTY_PLAN, missingColumns };

  const applyAt = rule.apply === null ? -1 : columnIndex(master, rule.apply);
  const width = doc.columns.length;
  const targets = rule.columns.map((name) => ({ at: columnIndex(doc, name), from: columnIndex(master, name) }));

  const known = new Set(
    doc.rows.map((cells) => (cells[keyAt] ?? '').trim()).filter((value) => value !== ''),
  );
  const inMaster = new Set<string>();

  const rows: string[][] = [];
  const keys: string[] = [];
  let skipped = 0;

  for (const cells of master.rows) {
    const key = (cells[masterKeyAt] ?? '').trim();
    // キーが無い行は、足したあとで追えない（次の展開でまた足す）。写さずに数だけ知らせる。
    if (key === '') {
      skipped += 1;
      continue;
    }
    inMaster.add(key);
    if (known.has(key)) continue;
    if (applyAt >= 0 && !matchesApply(cells[applyAt] ?? '', rule.values)) continue;

    known.add(key);
    const row = Array.from({ length: width }, () => '');
    row[keyAt] = key;
    for (const target of targets) {
      if (target.at >= 0) row[target.at] = cells[target.from] ?? '';
    }
    rows.push(row);
    keys.push(key);
  }

  return {
    rows,
    keys,
    missingColumns,
    orphans: [...known].filter((key) => !inMaster.has(key) && !keys.includes(key)),
    skipped,
  };
}

/** 適用先のセルは多値。どれか 1 つでも当たれば、その観点はこのシートに要る。 */
function matchesApply(cell: string, values: readonly string[]): boolean {
  return splitLinkedValues(cell, VALUE_SEPARATOR).some((value) => values.includes(value));
}
