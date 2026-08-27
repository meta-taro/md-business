/**
 * サイトの部品（HTML / CSS / JS など）を読み書きする口。
 *
 * 業務文書には形（スキーマ）があるので専用の口があるが、サイトの部品にはそれが無い。
 * かといって素のファイル書き込みで作ると、画面に出ず、MCP の記録にも残らないので、
 * 利用者からは「何がどう変わったのか」が追えなくなる。ここはその 1 本道になる。
 *
 * 触れるのは web を名乗っているフォルダだけ。名乗っていないフォルダでは、置いても
 * 一覧に出ないファイルが増えるだけで、作った当人にも確かめる手段が無い。
 * ただし名乗りは「求めているもの」であって実行の許可ではないので、ここを通ったからと
 * いって script が動くようになるわけではない（許可は利用者が自分の PC で 1 回与える）。
 */

import { parseProjectConfig, PROJECT_CONFIG_FILENAME } from '@md-business/core';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';
import { safeRelativePath } from './workspacePath.js';

/** 読みに来たのか書きに来たのか。断るときの案内先だけが変わる。 */
type SiteAction = 'read' | 'write';

/** 別に持ち主のいる拡張子と、その行き先。 */
const OWNED_EXTS: Record<string, Record<SiteAction, string>> = {
  md: {
    read: '業務文書なので read_document で読む',
    write: '業務文書なので create_document / update_document で書く',
  },
  tsv: {
    read: '検証シートなので read_tsv で読む',
    write: '検証シートなので append_tsv_row / update_tsv_row で 1 行ずつ触る',
  },
};

/**
 * 文字として扱えない拡張子。
 *
 * ここを通る中身は文字列なので、画像やフォントを渡されても、開けないファイルが
 * 出来上がるだけになる。壊れたファイルは見た目が普通なので、断る側に倒す。
 */
const BINARY_EXTS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'pdf',
  'mp4',
  'webm',
  'mp3',
  'wav',
  'wasm',
];

/** 相対パスの拡張子（小文字）。拡張子が無ければ null。 */
function extOf(relative: string): string | null {
  const name = relative.split('/').at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  // 先頭のドットは拡張子ではなく名前の一部（`.gitignore`）。
  if (dot <= 0) return null;
  return name.slice(dot + 1).toLowerCase();
}

/** 触ってよい相手かを決める。通れば正規化した相対パスを返す。 */
export function planSiteAccess(
  requestedPath: string,
  declaration: string,
  action: SiteAction,
): { ok: true; relative: string } | ToolError {
  const safe = safeRelativePath(requestedPath);
  if (!safe.ok) return { ok: false, error: safe.reason };

  if (safe.relative === PROJECT_CONFIG_FILENAME) {
    return {
      ok: false,
      error:
        action === 'write'
          ? `${PROJECT_CONFIG_FILENAME} はこの口では書きません。宣言を置くのは declare_web_mode です。`
          : `${PROJECT_CONFIG_FILENAME} はサイトの部品ではありません。中身を見るなら read_lines です。`,
    };
  }

  const { config } = parseProjectConfig(declaration);
  if (config.mode !== 'web') {
    return {
      ok: false,
      error:
        `このフォルダは web モードを名乗っていないので、サイトの部品を` +
        `${action === 'write' ? '置きませんでした' : '読みませんでした'}。` +
        `名乗っていないフォルダでは一覧に出ず、作ったものを確かめられません。` +
        `先に declare_web_mode で ${PROJECT_CONFIG_FILENAME} に宣言してください。`,
    };
  }

  const ext = extOf(safe.relative);
  if (ext === null) {
    return {
      ok: false,
      error: `拡張子の無いファイルは一覧に出ないので、この口では扱いません: ${safe.relative}`,
    };
  }
  const owner = OWNED_EXTS[ext];
  if (owner !== undefined) return { ok: false, error: `${safe.relative} は${owner[action]}。` };
  if (BINARY_EXTS.includes(ext)) {
    return {
      ok: false,
      error: `.${ext} は文字として扱えないので、この口では触れません: ${safe.relative}`,
    };
  }

  return { ok: true, relative: safe.relative };
}

/**
 * フォルダの名乗りを読む。
 *
 * 宣言が無いフォルダは「まだ何も言っていない」＝ document モードとして読む。
 * 置いてあるのに読めないときも同じ側へ落とす（読めないものを web と見なさない）。
 */
async function readDeclaration(store: DocumentStore): Promise<string> {
  if (!(await store.exists(PROJECT_CONFIG_FILENAME))) return '';
  try {
    return await store.read(PROJECT_CONFIG_FILENAME);
  } catch {
    return '';
  }
}

export interface WriteSiteFileInput {
  path: string;
  content: string;
}

export interface WriteSiteFileOk {
  ok: true;
  path: string;
  /** 新しく作ったか（false なら中身を置き換えた）。 */
  created: boolean;
  summary: string;
}

/** サイトの部品を 1 ファイル書く。中身は渡されたまま置く（組み立て直さない）。 */
export async function writeSiteFile(
  store: DocumentStore,
  input: WriteSiteFileInput,
): Promise<WriteSiteFileOk | ToolError> {
  const plan = planSiteAccess(input.path, await readDeclaration(store), 'write');
  if (!plan.ok) return plan;

  const created = !(await store.exists(plan.relative));
  await store.write(plan.relative, input.content);
  return {
    ok: true,
    path: plan.relative,
    created,
    summary: created
      ? `${plan.relative} を作りました。開いている面にそのまま映ります。`
      : `${plan.relative} を書き換えました。開いている面にそのまま映ります。`,
  };
}

export interface ReadSiteFileInput {
  path: string;
}

export interface ReadSiteFileOk {
  ok: true;
  path: string;
  /** 置いてあるままの中身。伏せ字にも切り詰めにもしない。 */
  content: string;
}

/**
 * サイトの部品を 1 ファイル読む。
 *
 * 置いてあるままを返すのは、読んで直して書き戻す使い方が前提だから。伏せ字や
 * 行の切り詰めが混ざると、触っていないはずの箇所まで書き換わってしまう。
 */
export async function readSiteFile(
  store: DocumentStore,
  input: ReadSiteFileInput,
): Promise<ReadSiteFileOk | ToolError> {
  const plan = planSiteAccess(input.path, await readDeclaration(store), 'read');
  if (!plan.ok) return plan;

  if (!(await store.exists(plan.relative))) {
    return { ok: false, error: `${plan.relative} は在りません。` };
  }
  return { ok: true, path: plan.relative, content: await store.read(plan.relative) };
}

export interface ListSiteFilesOk {
  ok: true;
  /** 触れる部品の相対パス（ソート済み）。 */
  files: string[];
}

/**
 * web を名乗るフォルダにあるサイトの部品を並べる。
 *
 * 並べるのは、この口で読み書きできるものだけ。別の口が持つもの（業務文書・検証シート）や
 * 文字として扱えないもの（画像・フォント）を混ぜると、そのまま read_site_file へ渡して
 * 断られることになる。まだ何も無いフォルダは空で返す——ここで断ると、これから作る場面と
 * 名乗っていない場面の区別が付かなくなる。
 */
export async function listSiteFiles(store: DocumentStore): Promise<ListSiteFilesOk | ToolError> {
  const declaration = await readDeclaration(store);
  // 1 件も無いフォルダでも名乗りだけは確かめる。パスに依らない断り方をここで作るため、
  // 実在しない名前を通して判定する。
  const gate = planSiteAccess('index.html', declaration, 'read');
  if (!gate.ok) return gate;

  const files = (await store.listSite()).filter(
    (path) => planSiteAccess(path, declaration, 'read').ok,
  );
  return { ok: true, files };
}
