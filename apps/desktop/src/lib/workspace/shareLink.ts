/**
 * 共有リンク（`md-business://open?...`）の組み立てと読み取り。
 * -----------------------------------------------------------------------------
 * 同じリポジトリを各自が clone している職場で、「この文書を見て」をチャットで渡すための形。
 * リンクは **どのリポジトリの・どのファイルか** しか運ばない。受け取った側の手元では、
 * 既に開いたことのあるフォルダの中からリポジトリが一致するものを探して開く。
 *
 * ここが外部から叩ける口になるため、次を守る。リンクを踏んだだけで起きてよいのは
 * 「手元にある文書を 1 つ表示する」ことだけで、それ以外は何も起きてはならない。
 *
 * - リンクにローカルの絶対パスを書けない。運べるのはリポジトリ名と、その中の相対パスだけ。
 * - 相対パスは親をたどれない。絶対パス・ドライブ文字・区切りの円記号も受け取らない。
 * - ブランチ名は**見出しにしか使わない**。リンクからブランチを切り替えない
 *   （他人が送った 1 行で、受け取った側の作業ツリーが動いてはいけない）。
 * - 一致するフォルダが手元に無ければ、開かずにその旨を返す。探しに行かない。
 */

import { unusableSegmentReason } from '@md-business/core';
import { isRowId } from '@md-business/schema-test-spec-tsv';

/** 共有リンクが運ぶ中身。 */
export interface ShareTarget {
  /** `github.com/owner/repo` の形。比較は大文字小文字を無視する。 */
  repo: string;
  /** リポジトリ root からの相対パス。 */
  path: string;
  /** 共有した人が見ていたブランチ。分からなければ null。切り替えには使わない。 */
  ref: string | null;
  /**
   * 指したい物理行（1 始まり）。行 ID があればそちらを優先する。
   * 行は前に 1 行足されるだけでずれるので、ID を振れない文書のための逃げ道。
   */
  line?: number;
  /** 検証シートの行 ID（`_id` 列の値）。行の増減でずれないので、行番号より先に使う。 */
  id?: string;
}

/** リポジトリを開いている手元のフォルダ 1 つ分。 */
export interface ShareCandidate {
  /** フォルダの絶対パス。 */
  folder: string;
  /** そのフォルダの origin から割り出したリポジトリ名（`github.com/owner/repo`）。 */
  repo: string;
  /** リポジトリ root から見たそのフォルダの位置（root 直下なら空・末尾は `/`）。 */
  prefix: string;
  /** いま画面に出ているフォルダかどうか。 */
  current: boolean;
}

const SCHEME = 'md-business';
/** 指示は 1 つだけ。増やすときは「表示するだけ」で収まるかを先に確かめる。 */
const ACTION = 'open';

/** クエリ値として置くときに意味が変わる文字だけを逃がす（`/` は読みやすさのため残す）。 */
function encodeValue(value: string): string {
  return encodeURIComponent(value).replace(/%2F/g, '/');
}

/** 手元のファイルを指す相対パスとして受け取れるか。 */
function isSafeRepoPath(path: string): boolean {
  if (path === '' || path.includes('\\')) return false;
  // 制御文字は符号化（%00 など）を解いた後に現れる。見えないので、混ざったまま
  // OS へ渡すと「なぜ開けないのか」が誰にも分からなくなる。
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  if (path.startsWith('/')) return false;
  // `C:/...` のようなドライブ指定は相対パスではない。
  if (/^[A-Za-z]:/.test(path)) return false;
  const segments = path.split('/');
  return segments.every(
    (segment) =>
      segment !== '' &&
      segment !== '.' &&
      segment !== '..' &&
      // 名前として使えない形（代替データストリーム・予約デバイス名）は、MCP のツール引数と
      // 同じ判定で落とす。同じ「外から届いた相対パス」を、入口ごとに違う強さで見ない。
      unusableSegmentReason(segment) === null,
  );
}

/** `host/owner/repo` の形になっているか（ホストと最低 1 つの名前が要る）。 */
function isSafeRepoName(repo: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9.-]*(\/[A-Za-z0-9._-]+)+$/.test(repo) && !repo.includes('..');
}

/**
 * ブランチ名として無理がないか。
 *
 * 表示にしか使わないが、`--upload-pack=...` のような指定に見える文字列をそのまま
 * 画面へ出すと、後からブランチ操作へ回したときに指定として解釈されうる。入口で落としておく。
 */
function isSafeRef(ref: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) && !ref.includes('..');
}

/**
 * 行番号として読める値か。正の整数を 10 進の数字だけで書いたものに限る。
 *
 * `Number()` に任せると `1e3` や `0x10` も数になり、送った人が書いていない行へ飛ぶ。
 * 桁の上限は、どんな文書でも届かない大きさで切っておく（大きな数を後段へ流さない）。
 */
function parseLine(raw: string | null): number | null {
  if (raw === null || !/^[1-9][0-9]{0,8}$/.test(raw)) return null;
  return Number(raw);
}

/** 共有リンクの文字列を作る。 */
export function buildShareLink(target: ShareTarget): string {
  const parts = [`repo=${encodeValue(target.repo)}`, `path=${encodeValue(target.path)}`];
  if (target.ref !== null && target.ref !== '') parts.push(`ref=${encodeValue(target.ref)}`);
  if (target.line !== undefined) parts.push(`line=${target.line}`);
  if (target.id !== undefined) parts.push(`id=${encodeValue(target.id)}`);
  return `${SCHEME}://${ACTION}?${parts.join('&')}`;
}

/**
 * 受け取ったリンクを読み取る。少しでも形が合わなければ null を返す。
 *
 * 迷ったら開かない側へ倒す。外から届く文字列なので、good なものを通すより
 * bad でないものを通す作りにすると、想定しなかった形が抜けていく。
 */
export function parseShareLink(raw: string): ShareTarget | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol.toLowerCase() !== `${SCHEME}:`) return null;
  // 非特殊スキームのホストは小文字化されないので、こちらで揃える。
  if (url.host.toLowerCase() !== ACTION) return null;
  // 指示の後ろに何か付いている形は想定していない。
  if (url.pathname !== '' && url.pathname !== '/') return null;

  const repo = url.searchParams.get('repo');
  const path = url.searchParams.get('path');
  if (repo === null || path === null) return null;
  if (!isSafeRepoName(repo) || !isSafeRepoPath(path)) return null;

  const rawRef = url.searchParams.get('ref');
  const ref = rawRef !== null && isSafeRef(rawRef) ? rawRef : null;
  const target: ShareTarget = { repo, path, ref };
  // 行と ID は「開いた後どこを見せるか」の添え書き。読めなければ落として、文書だけは開く。
  const line = parseLine(url.searchParams.get('line'));
  if (line !== null) target.line = line;
  const id = url.searchParams.get('id');
  if (id !== null && isRowId(id)) target.id = id;
  return target;
}

/**
 * リンクの指すファイルを、手元のどのフォルダで開くかを決める。
 *
 * 候補は利用者が既に開いたフォルダに限る（呼び出し側が用意する）。ここで新しい場所を
 * 作らないのが要点で、一致するものが無ければ null を返して判断を利用者へ戻す。
 */
export function resolveShareFolder(
  target: ShareTarget,
  candidates: readonly ShareCandidate[],
): { folder: string; relPath: string } | null {
  const wanted = target.repo.toLowerCase();
  let fallback: { folder: string; relPath: string } | null = null;

  for (const candidate of candidates) {
    if (candidate.repo.toLowerCase() !== wanted) continue;
    // フォルダがリポジトリの一部なら、その範囲の中にあるものしか出せない。
    if (!target.path.startsWith(candidate.prefix)) continue;
    const relPath = target.path.slice(candidate.prefix.length);
    if (relPath === '') continue;
    // いま開いているフォルダを優先するのは、clone が複数あるときに
    // 利用者が見ている方で開くのが意図に近いから。
    if (candidate.current) return { folder: candidate.folder, relPath };
    fallback ??= { folder: candidate.folder, relPath };
  }
  return fallback;
}
