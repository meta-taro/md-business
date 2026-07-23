/**
 * ワークスペース・パス安全ガード（Issue 004 Phase 2・MCP P0 の土台）。
 * -----------------------------------------------------------------------------
 * MCP ツール（read / create / update / search）はエージェントから渡された
 * 相対パスでローカルファイルを触る。越境（`../` トラバーサル）・絶対パス・UNC を
 * ワークスペース境界の外へ出さないことを、fs に触れず OS 非依存で保証する純ロジック。
 *
 * 絶対パス解決（node:path の resolve）はホスト OS でドライブレター / 区切りが
 * 変わり非決定的なので、ここでは相対パスの正規化と越境判定のみを行う。実際の
 * 絶対パス化（workspaceRoot への join）は fs レイヤー（Block MCP-6）の責務。
 */

/** 正規化に成功した相対パス（ワークスペース内で完結）。 */
export interface SafePathOk {
  ok: true;
  /** `/` 区切り・`.`/`..` を畳んだ正規相対パス（表示・キーにも使う）。 */
  relative: string;
}

/** 越境・絶対パス・空などで拒否した結果。 */
export interface SafePathRejected {
  ok: false;
  /** 拒否理由（日本語・ツール応答へそのまま載せる）。 */
  reason: string;
}

export type SafePathResult = SafePathOk | SafePathRejected;

/** POSIX 絶対パス / Windows ドライブレター / UNC のいずれかなら true。 */
function isAbsoluteLike(input: string): boolean {
  // /foo, \foo（POSIX 絶対・UNC 片側）, C:\ or c:/（ドライブレター）, \\server（UNC）
  return /^([a-zA-Z]:[\\/]|[\\/])/.test(input);
}

/**
 * 相対パスをワークスペース内で完結する正規相対パスへ整える。
 * - 区切りは `/`（バックスラッシュも受理して正規化）。
 * - `.` と空セグメントは除去、`..` は 1 段戻す（ルートを越えるなら拒否）。
 * - 空 / 空白のみ / 絶対パス / UNC / 全部畳むと空になる入力は拒否。
 */
export function safeRelativePath(requested: string): SafePathResult {
  if (typeof requested !== 'string' || requested.trim() === '') {
    return { ok: false, reason: '空のパスは指定できません' };
  }
  if (isAbsoluteLike(requested)) {
    return { ok: false, reason: '絶対パス・ドライブ・UNC は指定できません（ワークスペース相対のみ）' };
  }

  const segments = requested.split(/[\\/]+/);
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) {
        return { ok: false, reason: 'ワークスペース外への参照（..）は指定できません' };
      }
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  if (stack.length === 0) {
    return { ok: false, reason: '空のパスは指定できません' };
  }
  return { ok: true, relative: stack.join('/') };
}
