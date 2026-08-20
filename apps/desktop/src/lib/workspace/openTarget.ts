/**
 * 外から「このファイルを見せてほしい」と渡された絶対パスを、画面の操作へ翻訳する。
 * -----------------------------------------------------------------------------
 * 頼む側（MCP・エクスプローラの関連付け）は絶対パスしか持っていないが、画面は
 * 1 つのフォルダを開いてその中を見る作りになっている。渡されたファイルが今のフォルダの
 * 中とは限らないので、「選ぶだけでよいか」「フォルダごと切り替える必要があるか」を先に決める。
 *
 * 切り替え先を勝手に作らないのが要点。以前に利用者自身が開いたフォルダの中でなければ
 * 決められないと返し、フォルダを選ぶかどうかの判断は利用者へ戻す。外から来た依頼が
 * 未知の場所を開かせられると、リンクを踏んだだけで見覚えのない中身が並ぶことになる。
 */

export type OpenTarget =
  /** 今開いているフォルダの中にある。そのファイルを選ぶだけでよい。 */
  | { kind: 'select'; relPath: string }
  /** 別のフォルダの中にある。そのフォルダへ切り替えてから選ぶ。 */
  | { kind: 'switch'; root: string; relPath: string }
  /** どのフォルダの中とも言えない。画面は何もしない。 */
  | { kind: 'unknown' };

/** 区切り文字の違いと末尾の区切りを吸収する（比較のためだけに使う）。 */
function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * フォルダの中にあれば、そのフォルダからの相対パスを返す。
 *
 * 末尾に区切りを足してから比べるのは、`work` と `work2` のように名前の途中まで
 * 一致するだけのフォルダを中と誤らないため。大文字小文字を無視するのは Windows / macOS の
 * 既定に合わせるためで、返す相対パスは元の綴りのまま切り出す。
 */
function relativeInside(absolute: string, folder: string): string | null {
  const base = normalize(folder);
  if (base === '') return null;
  const prefix = `${base}/`;
  if (!absolute.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const relative = absolute.slice(prefix.length);
  return relative === '' ? null : relative;
}

/**
 * 渡された絶対パスを、今のフォルダと過去に開いたフォルダに照らして解決する。
 *
 * @param absolutePath 開いてほしいファイルの絶対パス
 * @param root 今開いているフォルダ（まだ開いていなければ null）
 * @param recent 過去に開いたフォルダ。入れ子で当てはまるときは内側を優先する
 */
export function resolveOpenTarget(
  absolutePath: string,
  root: string | null,
  recent: readonly string[],
): OpenTarget {
  const absolute = normalize(absolutePath);
  if (absolute === '') return { kind: 'unknown' };

  if (root !== null) {
    const relPath = relativeInside(absolute, root);
    if (relPath !== null) return { kind: 'select', relPath };
  }

  // 入れ子のときに内側を選ぶのは、利用者が直近で見ている範囲に近いのが内側だから。
  let best: { root: string; relPath: string } | null = null;
  for (const folder of recent) {
    const relPath = relativeInside(absolute, folder);
    if (relPath === null) continue;
    if (best === null || folder.length > best.root.length) best = { root: folder, relPath };
  }
  if (best !== null) return { kind: 'switch', root: best.root, relPath: best.relPath };

  return { kind: 'unknown' };
}

/**
 * ファイルの親から上へ辿ったフォルダを、近い順に返す。
 *
 * 綴りは比較しやすい形（`/` 区切り・末尾なし）に揃える。Windows のドライブは `C:` で止まり、
 * POSIX は `/` で止まる。ファイル自身は含めない。
 */
export function ancestorFolders(absoluteFilePath: string): string[] {
  const absolute = normalize(absoluteFilePath);
  const folders: string[] = [];
  let current = absolute;
  for (;;) {
    const cut = current.lastIndexOf('/');
    if (cut < 0) break;
    // 根（`/home` の上）は空文字になる。区切りそのものが根の名前。
    const parent = cut === 0 ? '/' : current.slice(0, cut);
    folders.push(parent);
    if (parent === '/') break;
    current = parent;
  }
  return folders;
}

/** そのフォルダが版管理の起点か（`.git` があるか）。 */
export type HasGit = (folder: string) => boolean;

/**
 * 外から渡されたファイルに対して、開く起点にするフォルダを決める。
 *
 * `.git` のある位置を優先するのは、そこが利用者にとっての「ひとつの仕事のまとまり」だから。
 * 無ければファイルの親だけにする（上へ広げると、関係のない兄弟フォルダまで画面に並ぶ）。
 *
 * ドライブ直下（`C:` / `/`）は起点にしない。そこを開くと機械の中身を丸ごと走査することになり、
 * 開くつもりのなかったものが並ぶ。決められないと返して、利用者にフォルダを選んでもらう。
 */
export function chooseOpenRoot(absoluteFilePath: string, hasGit: HasGit): string | null {
  const folders = ancestorFolders(absoluteFilePath);
  const usable = folders.filter((folder) => folder !== '/' && !/^[A-Za-z]:$/.test(folder));
  for (const folder of usable) {
    if (hasGit(folder)) return folder;
  }
  return usable[0] ?? null;
}
