/**
 * 手元で動きを確かめるための入口。
 * -----------------------------------------------------------------------------
 * このサーバーは AI クライアント（Claude Desktop 等）の設定ファイルに書いて使う。
 * 設定を間違えたときクライアントが出すのは「接続できません」だけなので、利用者には
 * 「場所の書き間違いなのか」「そもそも起動できていないのか」を切り分ける手立てが無い。
 *
 * そこで、待ち受けに入らず結果だけ返す指定を用意する。
 *
 * - `--version` … 起動できることと、どの版かを確かめる
 * - `--health`  … 指したフォルダが読めるか、スキーマが組み立てられるか、何件見えているか
 *
 * どちらも stdout へ書く。待ち受けに入らないので、MCP の通信路とは重ならない。
 */
import { SCHEMA_REGISTRY } from './registry.js';
import type { DocumentStore } from './store.js';

/** 引数の読み取り結果。`root` はワークスペースの場所（省略時は従来どおり環境変数 → cwd）。 */
export interface CliCommand {
  mode: 'serve' | 'version' | 'health' | 'help';
  root?: string;
  /** 知らない指定を受け取ったときの、その字面。 */
  error?: string;
}

export const USAGE = `md-business MCP サーバー

  md-business-mcp [ワークスペース]      待ち受ける（AI クライアントから接続する）
  md-business-mcp --health [ワークスペース]  設定を点検して結果を出す
  md-business-mcp --version             版を出す
  md-business-mcp --help                この使い方を出す

ワークスペースを省いたときは、環境変数 MD_BUSINESS_WORKSPACE、
それも無ければカレントディレクトリを使う。`;

/**
 * `process.argv.slice(2)` を読む。
 *
 * 指定と場所の前後は問わない（設定ファイルの `args` へ後ろから足す書き方があるため）。
 * 知らない指定は待ち受けに入らず使い方を出す。黙って起動すると、綴り違いに気づけない
 * まま「動かない」だけが残る。
 */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  let mode: CliCommand['mode'] = 'serve';
  let root: string | undefined;

  for (const arg of argv) {
    if (!arg.startsWith('-')) {
      root ??= arg;
      continue;
    }
    switch (arg) {
      case '--version':
      case '-v':
        return { mode: 'version' };
      case '--help':
      case '-h':
        return { mode: 'help' };
      case '--health':
        mode = 'health';
        break;
      default:
        return { mode: 'help', error: arg };
    }
  }

  return root === undefined ? { mode } : { mode, root };
}

/** 点検 1 項目。`ok` が false のものだけが全体を NG にする。 */
export interface HealthCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  root: string;
  ok: boolean;
  checks: HealthCheck[];
}

/**
 * 設定を点検する。
 *
 * 点検自体が例外で終わると「動かない」側に回ってしまうので、各項目は失敗を戻り値として返す。
 */
export async function checkHealth(input: {
  store: DocumentStore;
  root: string;
}): Promise<HealthReport> {
  const { store, root } = input;
  const checks: HealthCheck[] = [];

  // 一番多い間違いは、設定ファイルへ書いた場所が実在しないこと。
  let documents: string[] | null = null;
  let sheets: string[] | null = null;
  try {
    documents = await store.list();
    sheets = await store.listSheets();
    checks.push({ name: 'ワークスペース', ok: true, detail: root });
  } catch (error: unknown) {
    checks.push({
      name: 'ワークスペース',
      ok: false,
      detail: `${root} を読めません: ${message(error)}`,
    });
  }

  // 読み込めても検証器を組み立てられないことがあるので、1 度実行するところまで見る。
  try {
    for (const entry of SCHEMA_REGISTRY) entry.validate({});
    checks.push({
      name: 'スキーマ',
      ok: true,
      detail: SCHEMA_REGISTRY.map((e) => e.id).join(' / '),
    });
  } catch (error: unknown) {
    checks.push({ name: 'スキーマ', ok: false, detail: message(error) });
  }

  // 0 件は間違いとは限らない（これから置く場合もある）ので、数を見せるだけに留める。
  if (documents !== null && sheets !== null) {
    checks.push({
      name: '文書',
      ok: true,
      detail: `文書 ${documents.length} 件 / 検証シート ${sheets.length} 件`,
    });
  }

  return { root, ok: checks.every((c) => c.ok), checks };
}

/** 点検結果を、項目ごとに 1 行で書き出す。 */
export function formatHealth(report: HealthReport): string {
  return report.checks.map((c) => `${c.ok ? 'OK' : 'NG'}  ${c.name}: ${c.detail}`).join('\n');
}

/**
 * 待ち受けに入らない指定（version / health / help）を実行し、終了コードを返す。
 *
 * stdio と HTTP の 2 つの入口が同じ答えを返すよう、判断はここへ 1 つだけ置く。
 */
export async function runInfoCommand(
  command: CliCommand,
  deps: {
    root: string;
    store: DocumentStore;
    versionLine: string;
    out: (text: string) => void;
    err: (text: string) => void;
  },
): Promise<number> {
  if (command.mode === 'version') {
    deps.out(`${deps.versionLine}\n`);
    return 0;
  }

  if (command.mode === 'health') {
    const report = await checkHealth({ store: deps.store, root: deps.root });
    deps.out(`${formatHealth(report)}\n`);
    return report.ok ? 0 : 1;
  }

  deps.out(`${USAGE}\n`);
  if (command.error === undefined) return 0;
  deps.err(`知らない指定です: ${command.error}\n`);
  return 1;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
