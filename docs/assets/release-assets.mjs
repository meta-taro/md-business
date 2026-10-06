/**
 * ダウンロードページが「どの成果物をどの入口に出すか」を決める部分。
 *
 * Windows は x64 と ARM64 の 2 本を配る。拡張子だけで選ぶと先に並んだほうが
 * どちらの機械にも出てしまうので、ファイル名に入っている形（`_x64` / `_arm64`）で分ける。
 * 検査は scripts/download-assets.test.mjs にある。
 */

const WINDOWS_ARCH_LABEL = { x64: 'x64', arm64: 'ARM64' };

/** Windows の成果物名から形を読む。形の入っていない古い名前は x64 しか無かった頃のもの。 */
function windowsArch(name) {
  return /_arm64[_-]/.test(name) ? 'arm64' : 'x64';
}

/**
 * 成果物名を、配る対象なら `{ os, arch, kind, primary }` に、そうでなければ null にする。
 * `.sig` / `latest.json` / `*.app.tar.gz` は自動更新用なので一覧に出さない。
 */
export function classifyAsset(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.msi') || n.endsWith('.exe')) {
    const arch = windowsArch(n);
    const type = n.endsWith('.msi') ? 'MSI' : 'EXE';
    return {
      os: 'windows',
      arch,
      kind: `Windows ${WINDOWS_ARCH_LABEL[arch]} インストーラ (${type})`,
      primary: type === 'MSI',
    };
  }
  if (n.endsWith('.dmg')) {
    return { os: 'macos', arch: 'universal', kind: 'macOS ディスクイメージ (DMG)', primary: true };
  }
  return null;
}

/**
 * 主ボタンに出す成果物。Windows は形が合うものだけを選ぶ（形が分からなければ x64）。
 * 合うものが無ければ undefined を返し、ページは一覧から選んでもらう形にする。
 */
export function pickPrimary(assets, os, arch) {
  const fits = (a) => a.meta.os === os && (os !== 'windows' || a.meta.arch === (arch ?? 'x64'));
  return assets.find((a) => fits(a) && a.meta.primary) || assets.find(fits);
}

/**
 * `navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness'])` の結果から形を読む。
 * Windows の UA 文字列は ARM の機械でも x64 を名乗ることがあるため、文字列からは読まない。
 * 手がかりが無い（Chromium 以外）・読めないときは null。
 */
export function archFromHints(hints) {
  if (!hints || !hints.architecture) return null;
  if (hints.architecture === 'arm') return 'arm64';
  if (hints.architecture === 'x86' && hints.bitness === '64') return 'x64';
  return null;
}
