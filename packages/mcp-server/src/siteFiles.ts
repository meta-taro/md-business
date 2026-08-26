/**
 * サイトの部品（HTML / CSS / JS など）を書く口。
 *
 * 業務文書には形（スキーマ）があるので専用の口があるが、サイトの部品にはそれが無い。
 * かといって素のファイル書き込みで作ると、画面に出ず、MCP の記録にも残らないので、
 * 利用者からは「何がどう変わったのか」が追えなくなる。ここはその 1 本道になる。
 *
 * 書けるのは web を名乗っているフォルダだけ。名乗っていないフォルダでは、置いても
 * 一覧に出ないファイルが増えるだけで、作った当人にも確かめる手段が無い。
 * ただし名乗りは「求めているもの」であって実行の許可ではないので、ここを通ったからと
 * いって script が動くようになるわけではない（許可は利用者が自分の PC で 1 回与える）。
 */

import { parseProjectConfig, PROJECT_CONFIG_FILENAME } from '@md-business/core';
import type { DocumentStore } from './store.js';
import type { ToolError } from './tools.js';
import { safeRelativePath } from './workspacePath.js';

/** 別に持ち主のいる拡張子と、その行き先。 */
const OWNED_EXTS: Record<string, string> = {
  md: '業務文書なので create_document / update_document で書く',
  tsv: '検証シートなので append_tsv_row / update_tsv_row で 1 行ずつ触る',
};

/**
 * 文字として書けない拡張子。
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

/** 書いてよい相手かを決める。通れば正規化した相対パスを返す。 */
export function planSiteWrite(
  requestedPath: string,
  declaration: string,
): { ok: true; relative: string } | ToolError {
  const safe = safeRelativePath(requestedPath);
  if (!safe.ok) return { ok: false, error: safe.reason };

  if (safe.relative === PROJECT_CONFIG_FILENAME) {
    return {
      ok: false,
      error: `${PROJECT_CONFIG_FILENAME} はこの口では書きません。宣言を置くのは declare_web_mode です。`,
    };
  }

  const { config } = parseProjectConfig(declaration);
  if (config.mode !== 'web') {
    return {
      ok: false,
      error:
        `このフォルダは web モードを名乗っていないので、サイトの部品を置きませんでした。` +
        `置いても一覧に出ず、作ったものを確かめられません。` +
        `先に declare_web_mode で ${PROJECT_CONFIG_FILENAME} に宣言してください。`,
    };
  }

  const ext = extOf(safe.relative);
  if (ext === null) {
    return {
      ok: false,
      error: `拡張子の無いファイルは置けません（一覧に出ないため）: ${safe.relative}`,
    };
  }
  const owner = OWNED_EXTS[ext];
  if (owner !== undefined) return { ok: false, error: `${safe.relative} は${owner}。` };
  if (BINARY_EXTS.includes(ext)) {
    return {
      ok: false,
      error: `.${ext} は文字では書けないので、この口からは置けません: ${safe.relative}`,
    };
  }

  return { ok: true, relative: safe.relative };
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
  // 宣言が無いフォルダは「まだ何も言っていない」＝ document モードとして読む。
  // 置いてあるのに読めないときも同じ側へ落とす（読めないものを web と見なさない）。
  let declaration = '';
  if (await store.exists(PROJECT_CONFIG_FILENAME)) {
    try {
      declaration = await store.read(PROJECT_CONFIG_FILENAME);
    } catch {
      declaration = '';
    }
  }

  const plan = planSiteWrite(input.path, declaration);
  if (!plan.ok) return plan;

  const created = !(await store.exists(plan.relative));
  await store.write(plan.relative, input.content);
  return {
    ok: true,
    path: plan.relative,
    created,
    summary: created
      ? `${plan.relative} を作りました。ブラウザで開いて確かめてください。`
      : `${plan.relative} を書き換えました。ブラウザで開いて確かめてください。`,
  };
}
