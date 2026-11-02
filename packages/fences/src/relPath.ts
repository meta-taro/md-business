/**
 * 「いま開いているファイルからの相対パス」を、ルートからの相対パスへ直す。
 *
 * セルに書くリンクは、書いた人が見ているファイルからの相対で書けたほうが短く、意味も分かる。
 * 一方でファイルを開く側（workspace）はルートからの相対しか受け取らない。その差をここで埋める。
 *
 * ルートの外へ出る形は解かない。開けないだけでなく、ルート外を読めてしまうと、フォルダを
 * 選んで開くという前提そのものが崩れる。
 */

/**
 * 相対パスを解く。解けなければ null。
 *
 * @param fromRelPath いま開いているファイル（ルートからの相対）。未選択なら null
 * @param linkPath リンクに書かれたパス（fromRelPath のあるフォルダからの相対）
 */
export function resolveRelPath(fromRelPath: string | null, linkPath: string): string | null {
  if (fromRelPath === null) return null;

  // Windows で入力すると区切りが `\` になる。書いた本人の環境でだけ動く形にしない。
  const link = linkPath.replace(/\\/g, '/').trim();
  if (link === '') return null;

  const from = fromRelPath.replace(/\\/g, '/');
  const base = from.split('/').slice(0, -1);

  const segments = [...base];
  for (const segment of link.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      // ルートより上は無い。ここで畳めない時点で、開ける先ではない。
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  // `..` や `./` だけの形はフォルダを指す。開くファイルが決まらないので解かない。
  const last = link.split('/').filter((s) => s !== '').at(-1);
  if (segments.length === 0 || last === undefined || last === '.' || last === '..') return null;

  return segments.join('/');
}
