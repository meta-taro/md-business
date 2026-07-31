/**
 * ワークスペース・パス安全ガード（MCP P0 の土台）。
 * -----------------------------------------------------------------------------
 * MCP ツール（read / create / update / search）はエージェントから渡された
 * 相対パスでローカルファイルを触る。越境（`../` トラバーサル）・絶対パス・UNC を
 * ワークスペース境界の外へ出さないことを、fs に触れず OS 非依存で保証する純ロジック。
 *
 * 絶対パス解決（node:path の resolve）はホスト OS でドライブレター / 区切りが
 * 変わり非決定的なので、ここでは相対パスの正規化と越境判定のみを行う。実際の
 * 絶対パス化（workspaceRoot への join）は fs レイヤーの責務。
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
 * Windows の予約デバイス名。拡張子を付けても予約のまま扱われる。
 * ワークスペース外へ抜ける経路ではないが、これらの名前で作った文書は
 * エクスプローラや多くのエディタから開けず削除もしづらいので受け付けない。
 */
const RESERVED_DEVICE_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 10 }, (_, i) => `com${i}`),
  ...Array.from({ length: 10 }, (_, i) => `lpt${i}`),
]);

/** 1 セグメントが予約デバイス名か（`CON` / `con.md` はいずれも該当・`console.md` は非該当）。 */
function isReservedDeviceName(segment: string): boolean {
  const stem = segment.split('.')[0] ?? '';
  return RESERVED_DEVICE_NAMES.has(stem.toLowerCase());
}

/**
 * 相対パスをワークスペース内で完結する正規相対パスへ整える。
 * - 区切りは `/`（バックスラッシュも受理して正規化）。
 * - `.` と空セグメントは除去、`..` は 1 段戻す（ルートを越えるなら拒否）。
 * - 空 / 空白のみ / 絶対パス / UNC / 全部畳むと空になる入力は拒否。
 * - コロンを含むセグメント・予約デバイス名は拒否（下の各コメント参照）。
 *
 * 判定は OS を見ずに常に同じにする。ワークスペースが OS をまたいで持ち運ばれても、
 * 片方でしか開けない文書を作らないため。
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
    // NTFS の代替データストリーム（`a.md:x`）。書き込みは通るが、内容は本体ファイルの
    // 裏側へ入りファイル一覧には現れない＝アプリから見えない文書ができてしまう。
    if (segment.includes(':')) {
      return { ok: false, reason: `コロンを含む名前は指定できません: ${segment}` };
    }
    if (isReservedDeviceName(segment)) {
      return { ok: false, reason: `この名前は使えません（予約された名前です）: ${segment}` };
    }
    stack.push(segment);
  }

  if (stack.length === 0) {
    return { ok: false, reason: '空のパスは指定できません' };
  }
  return { ok: true, relative: stack.join('/') };
}
