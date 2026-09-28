/**
 * このソフトが何者かを、AI エージェントへ 1 度で渡す。
 *
 * ツールの description は「そのツールが何をするか」しか言えないので、道具の一覧を全部読んでも
 * 「これは何のソフトで、いま繋いでいるのはどの版か」は組み立てられない。利用者に説明を求めたり、
 * 手元にもないリポジトリを探しに行ったりする前に、ここを読んでもらう。
 *
 * 変更履歴は実行時に読めない（このサーバーは繋いだ先のフォルダで動き、md-business の
 * リポジトリが同じ機械にあるとは限らない）ので、ビルド時に焼き込んだものを使う。
 * 焼き込みは scripts/generate-about.mjs が作る。
 */
import { listSchemas } from './registry.js';
import { EMBEDDED_RELEASES } from './generated/releases.js';

/** 配布物の識別子。3 つは版が独立していて、番号を揃えていない。 */
export const APP_IDS = ['desktop', 'chrome-extension', 'workspace-addon'] as const;
export type AppId = (typeof APP_IDS)[number];

/** 焼き込みに載らなかった古い版の行き先。 */
export const RELEASES_URL = 'https://github.com/meta-taro/md-business/releases';

/** 引数なしで返す件数。全部返すと 1 回の応答が変更履歴で埋まる。 */
const DEFAULT_LIMIT = 3;

export interface ReleaseEntry {
  version: string;
  /** その版の CHANGELOG 本文（Markdown のまま）。 */
  notes: string;
}

export interface EmbeddedApp {
  /** いま出ている版。 */
  version: string;
  /** 焼き込みに載らなかった古い版があるか。 */
  hasOlder: boolean;
  /** 新しい順。 */
  releases: ReleaseEntry[];
}

export type EmbeddedReleases = Record<AppId, EmbeddedApp>;

export interface AboutApp {
  id: AppId;
  label: string;
  /** その配布物でしかできないこと。3 つは役割が違う。 */
  role: string;
  /** 手に入る場所、または配っていない旨。 */
  availability: string;
  version: string;
}

export interface AboutReleases {
  app: AppId;
  entries: ReleaseEntry[];
  hasOlder: boolean;
  /** 載らなかった古い版があるときだけ入る。 */
  olderReleases?: string;
}

export interface AboutOk {
  ok: true;
  name: 'md-business';
  summary: string;
  schemas: { id: string; label: string }[];
  apps: AboutApp[];
  releases: AboutReleases;
}

export interface AboutError {
  ok: false;
  error: string;
}

export type AboutResult = AboutOk | AboutError;

export interface AboutInput {
  app?: string;
  version?: string;
  limit?: number;
}

/**
 * 素性の説明。ここだけは焼き込みでなく手で書く（変更履歴から組んでも「何のためのソフトか」は出ない）。
 */
const SUMMARY = `md-business は、業務文書を Markdown / TSV で持つための道具。

請求書・見積書・領収書、基本設計書、API 詳細設計書、DB 設計書、検証シートといった、
これまで表計算や文書作成ソフトで作られてきたものを、**テキストのまま正本にする**。
体裁は読むときに与えるもので、ファイルの中身には入れない。

- **書式は JSON Schema で決まっている**。frontmatter の項目名・型・必須は機械が確かめられる。
  だから AI が書いても壊れたまま気づかない、が起きない。
- **git に載る**。誰がいつどこを変えたかが差分で読める。表計算のファイルではこれができない。
- **読む口は 3 つある**（下記 apps）。同じ 1 本の Markdown を、机の上のアプリ・ブラウザ・
  スプレッドシートのどれからでも開く。

AI エージェントから触るときは、この MCP サーバーのツールを使う（素のファイル編集をしない）。
理由と入口は、このサーバーの instructions に書いてある。`;

/**
 * 配布物ごとの役割。版と履歴は焼き込みから、ここは手で持つ。
 */
const APP_META: Record<AppId, Omit<AboutApp, 'version'>> = {
  desktop: {
    id: 'desktop',
    label: 'デスクトップアプリ（Windows / macOS）',
    role:
      'フォルダを開いて編集・下見・PDF 出力までを 1 つで行う。検証シートは表として開ける。' +
      'この MCP サーバーを内側に持っているので、AI からの書き込みがそのまま画面に映る。',
    availability: 'https://meta-taro.github.io/md-business/download/',
  },
  'chrome-extension': {
    id: 'chrome-extension',
    label: 'Chrome 拡張',
    role: '手元の .md をブラウザで開いて下見し、A4 の PDF にする。入れる物が要らない側の入口。',
    availability: 'Chrome ウェブストア',
  },
  'workspace-addon': {
    id: 'workspace-addon',
    label: 'Google Workspace アドオン',
    role:
      '検証シートをスプレッドシートの操作のまま記入し、GitHub へ戻す。' +
      'Markdown を書かない人が同じ 1 本を触るための口。',
    // 配っていないものを「ここで手に入る」と書くと、探しに行かせて空振りさせる。
    availability: '未公開（Google Workspace Marketplace へ申請を準備している段階）',
  },
};

function isAppId(value: string): value is AppId {
  return (APP_IDS as readonly string[]).includes(value);
}

/** タグ名（`v0.30.2`）のまま渡ってくることがある。 */
function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/, '');
}

export function buildAbout(input: AboutInput, data: EmbeddedReleases = EMBEDDED_RELEASES): AboutResult {
  const appId = input.app ?? 'desktop';
  if (!isAppId(appId)) {
    return {
      ok: false,
      error: `知らない配布物です: ${appId}（受け取れるのは ${APP_IDS.join(' / ')}）`,
    };
  }

  const embedded = data[appId];
  let entries: ReleaseEntry[];

  if (input.version) {
    const wanted = normalizeVersion(input.version);
    const found = embedded.releases.find((r) => r.version === wanted);
    if (!found) {
      // 焼き込みは直近の数版だけなので、「手元に無い」は「存在しない」ではない。
      // 黙って最新を返すと、古い版の話をしているつもりの相手に別の版の中身を渡すことになる。
      const have = embedded.releases.map((r) => r.version).join(' / ');
      return {
        ok: false,
        error: `${appId} の ${wanted} は焼き込まれていません（手元にあるのは ${have}）。それより古い版は ${RELEASES_URL} を見てください。`,
      };
    }
    entries = [found];
  } else {
    // 0 件返すと「版が 1 つも無い」と見分けが付かないので、下限は 1 件。
    const limit = Math.max(1, input.limit ?? DEFAULT_LIMIT);
    entries = embedded.releases.slice(0, limit);
  }

  const hasOlder = embedded.hasOlder || entries.length < embedded.releases.length;

  return {
    ok: true,
    name: 'md-business',
    summary: SUMMARY,
    schemas: listSchemas(),
    apps: APP_IDS.map((id) => ({ ...APP_META[id], version: data[id].version })),
    releases: {
      app: appId,
      entries,
      hasOlder,
      ...(hasOlder ? { olderReleases: RELEASES_URL } : {}),
    },
  };
}
