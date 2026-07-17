/**
 * デスクトップ・プレビューのスキーマ振り分け（純ロジック）。
 *
 * chrome-extension の `PluginRegistry.resolve` と同じ優先順位を移植:
 *   1. `schema:` の直接一致（例: "invoice" → invoice）
 *   2. `schema:` の prefix 一致（例: "api-spec/v1" → api-spec）
 *   3. `schemaVersion:` の prefix 一致（例: "db-spec/v1" → db-spec）
 *   4. マーカーキーによる検出（登録順で先勝ち）
 *   5. どれにも当たらなければ undefined（呼び出し側が「対象外」を表示）
 *
 * schema / schemaVersion が無い純日本語 frontmatter でも、マーカー（例: api-spec の
 * `endpoints` / `エンドポイント`）で正しいビューワーへ自動振り分けできる。
 *
 * ここは描画を含まない純関数なので renderer を import せず単体テストできる。実際の
 * provider（render 付き）は本メタ型を継承し、本関数でそのまま解決する。
 */
export interface PreviewProviderMeta {
  /** スキーマ ID（`schema:` フィールド / prefix と突き合わせる。例: "api-spec"）。 */
  readonly id: string;
  /** ペイン見出し等に出す表示名（例: "API 設計書"）。 */
  readonly label: string;
  /** schema / schemaVersion が無い時に検出へ使うマーカーキー群。 */
  readonly markers: readonly string[];
}

export function resolveProvider<T extends PreviewProviderMeta>(
  frontmatter: Record<string, unknown>,
  providers: readonly T[],
): T | undefined {
  const schemaField = frontmatter['schema'];
  if (typeof schemaField === 'string') {
    const direct = providers.find((p) => p.id === schemaField);
    if (direct) return direct;
    const prefix = schemaField.split('/')[0];
    if (prefix) {
      const byPrefix = providers.find((p) => p.id === prefix);
      if (byPrefix) return byPrefix;
    }
  }

  const schemaVersion = frontmatter['schemaVersion'];
  if (typeof schemaVersion === 'string') {
    const id = schemaVersion.split('/')[0];
    if (id) {
      const byVersion = providers.find((p) => p.id === id);
      if (byVersion) return byVersion;
    }
  }

  // schema / schemaVersion が無い（or 未知）場合はマーカーで検出。登録順で先勝ち。
  for (const provider of providers) {
    if (provider.markers.some((key) => key in frontmatter)) return provider;
  }

  return undefined;
}
