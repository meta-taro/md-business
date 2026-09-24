import { describe, it, expect } from 'vitest';
import { buildAbout, APP_IDS, RELEASES_URL } from './about.js';
import type { EmbeddedReleases } from './about.js';

/**
 * 焼き込みデータの代わり。実物（src/generated/releases.ts）は CHANGELOG を書き換えるたび
 * 中身が変わるので、振る舞いの検証には固定の材料を使う。
 * 実物との突き合わせは releasesGenerated.test.ts が別に見る。
 */
const FIXTURE: EmbeddedReleases = {
  desktop: {
    version: '1.2.3',
    hasOlder: true,
    releases: [
      { version: '1.2.3', notes: '### 修正\n\n- 撮ると落ちていたのを直した' },
      { version: '1.2.2', notes: '### 追加\n\n- 面が出どころを名乗るようになった' },
      { version: '1.2.1', notes: '### 修正\n\n- タブを並べ替えられないのを直した' },
      { version: '1.2.0', notes: '### 追加\n\n- 窓を 2 枚開けるようになった' },
    ],
  },
  'chrome-extension': {
    version: '0.6.0',
    hasOlder: false,
    releases: [{ version: '0.6.0', notes: '### 追加\n\n- 請求書以外の書式も開けるようになった' }],
  },
  'workspace-addon': {
    version: '0.1.0',
    hasOlder: false,
    releases: [{ version: '0.1.0', notes: '### 追加\n\n- 検証シートを表計算の画面で書ける' }],
  },
};

describe('buildAbout', () => {
  it('引数なしでも、素性・扱える書式・配布物の版が揃って返る', () => {
    const r = buildAbout({}, FIXTURE);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe('md-business');
    expect(r.summary.length).toBeGreaterThan(0);
    // 扱える書式はレジストリから組む。手で書くとスキーマが増えたときにズレる。
    expect(r.schemas.map((s) => s.id)).toContain('invoice/v1');
    expect(r.apps.map((a) => a.id)).toEqual([...APP_IDS]);
  });

  it('配布物の版は焼き込んだものを出す（コードに直書きしない）', () => {
    const r = buildAbout({}, FIXTURE);
    if (!r.ok) return;
    expect(r.apps.find((a) => a.id === 'desktop')?.version).toBe('1.2.3');
    expect(r.apps.find((a) => a.id === 'chrome-extension')?.version).toBe('0.6.0');
  });

  it('引数なしのときは、主役であるデスクトップの直近を返す', () => {
    const r = buildAbout({}, FIXTURE);
    if (!r.ok) return;
    expect(r.releases.app).toBe('desktop');
    expect(r.releases.entries).toHaveLength(3);
    expect(r.releases.entries[0]).toEqual({
      version: '1.2.3',
      notes: '### 修正\n\n- 撮ると落ちていたのを直した',
    });
  });

  it('limit で件数を変えられる', () => {
    const r = buildAbout({ limit: 1 }, FIXTURE);
    if (!r.ok) return;
    expect(r.releases.entries.map((e) => e.version)).toEqual(['1.2.3']);
  });

  it('焼き込んだ数より多く求められても、在るだけ返す', () => {
    const r = buildAbout({ limit: 99 }, FIXTURE);
    if (!r.ok) return;
    expect(r.releases.entries).toHaveLength(4);
  });

  it('limit が 0 以下でも 1 件は返す（空を返すと版が無いのと見分けられない）', () => {
    const r = buildAbout({ limit: 0 }, FIXTURE);
    if (!r.ok) return;
    expect(r.releases.entries).toHaveLength(1);
  });

  it('app を指すと、その配布物の履歴になる', () => {
    const r = buildAbout({ app: 'chrome-extension' }, FIXTURE);
    if (!r.ok) return;
    expect(r.releases.app).toBe('chrome-extension');
    expect(r.releases.entries.map((e) => e.version)).toEqual(['0.6.0']);
  });

  it('version を指すと、その 1 版だけを返す', () => {
    const r = buildAbout({ app: 'desktop', version: '1.2.1' }, FIXTURE);
    if (!r.ok) return;
    expect(r.releases.entries).toEqual([
      { version: '1.2.1', notes: '### 修正\n\n- タブを並べ替えられないのを直した' },
    ]);
  });

  it('version は先頭の v を付けて呼ばれても同じものを指す（タグ名でそのまま渡ってくる）', () => {
    const r = buildAbout({ app: 'desktop', version: 'v1.2.1' }, FIXTURE);
    if (!r.ok) return;
    expect(r.releases.entries.map((e) => e.version)).toEqual(['1.2.1']);
  });

  it('載せきらなかった古い版があるときは、その先の行き先を添える', () => {
    const r = buildAbout({ app: 'desktop' }, FIXTURE);
    if (!r.ok) return;
    expect(r.releases.hasOlder).toBe(true);
    expect(r.releases.olderReleases).toBe(RELEASES_URL);
  });

  it('全部載っているときは、その先の行き先を出さない', () => {
    const r = buildAbout({ app: 'chrome-extension' }, FIXTURE);
    if (!r.ok) return;
    expect(r.releases.hasOlder).toBe(false);
    expect(r.releases.olderReleases).toBeUndefined();
  });

  it('知らない配布物は、受け取れるものを添えて断る', () => {
    const r = buildAbout({ app: 'vscode' }, FIXTURE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('vscode');
    expect(r.error).toContain('desktop');
    expect(r.error).toContain('chrome-extension');
  });

  it('手元に無い版は、手元にある版を添えて断る（黙って最新を返さない）', () => {
    const r = buildAbout({ app: 'desktop', version: '9.9.9' }, FIXTURE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('9.9.9');
    expect(r.error).toContain('1.2.3');
    // 焼き込みには限りがあるので、無い＝存在しないではない。その先を必ず示す。
    expect(r.error).toContain(RELEASES_URL);
  });
});
