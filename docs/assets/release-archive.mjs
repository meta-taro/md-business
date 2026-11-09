/**
 * 過去の版の一覧ページが「どのリリースをどう並べるか」を決める部分。
 *
 * 一覧はブラウザが GitHub のリリースから組み立てるので、版を出すたびにページを直さなくてよい。
 * 各版の成果物はダウンロードページ（`?v=`）に任せ、ここでは版・日付・入っている OS だけを出す。
 * 検査は scripts/download-archive.test.mjs にある。
 */

import { classifyAsset } from './release-assets.mjs';

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

export function releasesApiUrl(repo, page) {
  return `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`;
}

function platformLabel(meta) {
  if (meta.os === 'macos') return 'macOS';
  return meta.arch === 'arm64' ? 'Windows ARM64' : 'Windows x64';
}

function compareDesc(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.parts[i] !== b.parts[i]) return b.parts[i] - a.parts[i];
  }
  return 0;
}

/**
 * GitHub のリリース一覧を、並べる版の配列にする。
 * 下書き・試験版・デスクトップの形でないタグ・配る成果物の無い版は落とす。
 */
export function archiveEntries(releases) {
  const entries = [];
  for (const r of releases) {
    const m = TAG.exec(r.tag_name ?? '');
    if (!m || r.draft || r.prerelease) continue;
    const platforms = [];
    for (const a of r.assets ?? []) {
      const meta = classifyAsset(a.name);
      if (!meta) continue;
      const label = platformLabel(meta);
      if (!platforms.includes(label)) platforms.push(label);
    }
    if (platforms.length === 0) continue;
    const version = `${m[1]}.${m[2]}.${m[3]}`;
    // html_url は API の応答そのものなので、GitHub のリリースを指していなければ組み立て直す。
    const fallback = `https://github.com/meta-taro/md-business/releases/tag/${r.tag_name}`;
    const releaseUrl = typeof r.html_url === 'string' && r.html_url.startsWith('https://github.com/')
      ? r.html_url
      : fallback;
    entries.push({
      version,
      parts: [Number(m[1]), Number(m[2]), Number(m[3])],
      date: (r.published_at ?? '').slice(0, 10),
      downloadHref: `../?v=${version}`,
      releaseUrl,
      platforms: ['Windows x64', 'Windows ARM64', 'macOS'].filter((p) => platforms.includes(p)),
    });
  }
  return entries.sort(compareDesc).map(({ parts, ...rest }) => rest);
}
