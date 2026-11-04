/**
 * 居場所を相手へ送るときの「文書の名前」を組む（DOM 非依存の純ロジック）。
 *
 * 相対パスだけでは、別のリポの docs/a.md どうしが同じ文書に見える。そこで git の
 * remote を頭に付けて `<host>/<owner>/<repo>#<相対パス>` にする。相手の PC でも
 * 同じ remote を clone していれば、同じ名前になる。
 *
 * - 資格情報・ポート・末尾の .git は落とす（https と ssh で同じ名前にするため、
 *   そして資格情報を部屋へ流さないため）。
 * - ローカルパスの remote・ワークスペース外のパスは名前にしない。PC のユーザー名が
 *   入るうえ、他の PC では意味を持たない。
 * - 長すぎる名前は切り詰めずに諦める。切ると別の文書と同じ名前になりうる。
 */

export interface GitRemote {
  name: string;
  url: string;
}

/** 運び役が受け付ける上限（バイト）。 */
export const MAX_NAME_BYTES = 512;

/** remote の URL を `host/owner/repo` にする。名前にできなければ null。 */
export function repoIdFromRemote(url: string): string | null {
  const text = url.trim();
  let host: string;
  let path: string;

  const scpLike = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(text);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let parsed: URL;
    try {
      parsed = new URL(text);
    } catch {
      return null;
    }
    if (parsed.protocol === 'file:') return null;
    host = parsed.hostname;
    path = parsed.pathname;
  } else if (scpLike && !/^[a-z]$/i.test(scpLike[1] ?? '')) {
    // `git@host:owner/repo`。1 文字のホストは Windows のドライブ文字（C:\...）なので除く。
    host = scpLike[1] ?? '';
    path = scpLike[2] ?? '';
  } else {
    return null;
  }

  const segments = path
    .replace(/\.git\/?$/, '')
    .split('/')
    .filter((part) => part !== '');
  if (host === '' || segments.length === 0) return null;
  return `${host.toLowerCase()}/${segments.join('/')}`;
}

/** ワークスペース相対パスを `/` 区切りに揃える。外へ出るもの・絶対パスは null。 */
function normalizeRelativePath(relativePath: string): string | null {
  const slashed = relativePath.replace(/\\/g, '/');
  if (slashed === '' || slashed.startsWith('/') || /^[a-z]:/i.test(slashed)) return null;
  const parts = slashed.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.length === 0 || parts.includes('..')) return null;
  return parts.join('/');
}

/** origin を優先し、無ければ名前順で最初の remote を使う。 */
function pickRemote(remotes: readonly GitRemote[]): GitRemote | undefined {
  return (
    remotes.find((remote) => remote.name === 'origin') ??
    [...remotes].sort((a, b) => a.name.localeCompare(b.name))[0]
  );
}

/** 文書の名前を組む。送れないときは null（呼び出し側は居場所を送らない）。 */
export function documentName(remotes: readonly GitRemote[], relativePath: string): string | null {
  const remote = pickRemote(remotes);
  if (!remote) return null;
  const repo = repoIdFromRemote(remote.url);
  const path = normalizeRelativePath(relativePath);
  if (repo === null || path === null) return null;
  const name = `${repo}#${path}`;
  return new TextEncoder().encode(name).length > MAX_NAME_BYTES ? null : name;
}
