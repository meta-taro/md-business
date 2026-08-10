/**
 * 更新ダイアログに出す「これまでの更新内容」。
 *
 * 更新の口（updater）が答えるのは「新しい版があるか」だけで、最新のときは何も持って
 * 帰らない。そのため最新の利用者には空のダイアログしか出ず、直したことが伝わらないし、
 * お知らせ自体が壊れていても気づけない。
 *
 * 材料は配布物へ同梱した変更履歴（CHANGELOG.md）を使う。ビルド時に取り込むので、
 * 通信も、配信元を信じる手順も増えない。手元の版までの内容は必ず出せる。
 * それより前は同梱せず、Release の一覧へ送る（全部抱えるとダイアログに収まらない）。
 */
import changelog from '../../../CHANGELOG.md?raw';

/** 変更履歴 1 版分。`notes` は見出しを除いた本文（Markdown のまま）。 */
export interface ReleaseEntry {
  version: string;
  notes: string;
}

/** ダイアログに出す版の数。 */
export const RELEASE_HISTORY_LIMIT = 3;

/** 直近数件より前を見るときの行き先。 */
export const RELEASES_URL = 'https://github.com/meta-taro/md-business/releases';

/**
 * 変更履歴を版ごとに切り出す。新しい順（ファイルに書かれている順）。
 *
 * 版の区切りは行頭の `## ` のみ。`### 追加` のような本文の見出しは含めたまま返す。
 * 囲み（``` / ~~~）の中は、Markdown の例を載せたときに版と読み違えないよう見出しとして扱わない。
 */
export function parseChangelog(markdown: string, limit = RELEASE_HISTORY_LIMIT): ReleaseEntry[] {
  const entries: ReleaseEntry[] = [];
  let current: { version: string; lines: string[] } | null = null;
  let fenced = false;

  const close = (): void => {
    if (current === null) return;
    entries.push({ version: current.version, notes: current.lines.join('\n').trim() });
    current = null;
  };

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;

    if (!fenced && line.startsWith('## ')) {
      close();
      if (entries.length >= limit) return entries;
      current = { version: line.slice(3).trim(), lines: [] };
      continue;
    }
    current?.lines.push(line);
  }
  close();
  return entries;
}

/** 同梱した変更履歴の直近数件。中身は変わらないので 1 度だけ切り出す。 */
let cached: ReleaseEntry[] | null = null;

export function recentReleases(): ReleaseEntry[] {
  cached ??= parseChangelog(changelog);
  return cached;
}
