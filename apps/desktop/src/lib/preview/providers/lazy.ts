/**
 * スキーマを見分けてから、そのスキーマぶんだけ読み込む口。
 *
 * 7 スキーマの検証器は合わせて 485 KB あるが、1 つの文書が使うのはそのうち 1 つだけ。
 * まとめて読む作りだと、請求書を 1 枚開くのに API 設計書と NoSQL 設計書の検証器まで
 * 読み終わるのを待つことになる。ここで `import()` に包んでおくと、束ねられる単位が
 * スキーマごとに分かれ、開いた文書のぶんだけが読まれる。
 *
 * 見分けに要る情報（ID / 表示名 / マーカー）は meta.ts 側にあり、そちらは描画一式を
 * 一切引かない。だから「どのスキーマか」を決める時点では、まだ何も読んでいない。
 *
 * 読み込んだ provider は使い回す。同じ文書を打つたびに読み直すと、編集のたびに
 * 待たされることになる。
 */
import type { PreviewProvider } from '../previewFactory';
import type { PreviewProviderMeta } from '../registry';
import { PROVIDER_METAS } from './meta';

/** 見分け情報に「読み込む手立て」を付けたもの。検出はこれだけで済む。 */
export interface LazyProvider extends PreviewProviderMeta {
  load(): Promise<PreviewProvider>;
}

/** meta.ts の登録順のまま、各スキーマの読み込み口を与える。 */
const LOADERS: Readonly<Record<string, () => Promise<PreviewProvider>>> = {
  invoice: () => import('./invoice').then((m) => m.invoiceProvider),
  'test-spec': () => import('./testSpec').then((m) => m.testSpecProvider),
  'db-spec': () => import('./dbSpec').then((m) => m.dbSpecProvider),
  'nosql-db-spec': () => import('./nosqlDbSpec').then((m) => m.nosqlDbSpecProvider),
  'api-spec': () => import('./apiSpec').then((m) => m.apiSpecProvider),
  investigation: () => import('./investigation').then((m) => m.investigationProvider),
  spec: () => import('./spec').then((m) => m.specProvider),
};

/** 読み込み済みの provider。ID ごとに 1 回だけ読む。 */
const loaded = new Map<string, PreviewProvider>();
/** 読み込み中のもの。同じスキーマの文書が続けて来ても二重に読まない。 */
const pending = new Map<string, Promise<PreviewProvider>>();

export const LAZY_PROVIDERS: readonly LazyProvider[] = PROVIDER_METAS.map((meta) => ({
  id: meta.id,
  label: meta.label,
  markers: meta.markers,
  load: () => loadProvider(meta.id),
}));

function loadProvider(id: string): Promise<PreviewProvider> {
  const already = loaded.get(id);
  if (already) return Promise.resolve(already);

  const inFlight = pending.get(id);
  if (inFlight) return inFlight;

  const loader = LOADERS[id];
  if (!loader) return Promise.reject(new Error(`未知のスキーマです: ${id}`));

  const promise = loader().then((provider) => {
    loaded.set(id, provider);
    pending.delete(id);
    return provider;
  });
  pending.set(id, promise);
  return promise;
}

/**
 * これまでに読み込んだスキーマ ID（登録順）。
 *
 * 「開いた文書のぶんだけ読む」は描画結果に表れない性質なので、外から確かめる
 * 手立てをここに置く。診断・テスト用で、描画の判断には使わない。
 */
export function loadedProviderIds(): string[] {
  return PROVIDER_METAS.filter((meta) => loaded.has(meta.id)).map((meta) => meta.id);
}
