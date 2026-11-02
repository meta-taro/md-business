import { normalizeForSearch, splitQuery } from './normalize.js';

/** zumen のサンプル 1 本。`file` は索引のあるフォルダからの相対名。 */
export interface Sample {
  name: string;
  file: string;
  caption: string;
  captionEn: string;
  kind: string;
  category: string;
  categoryLabel: string;
  categoryLabelEn: string;
  uses: string[];
}

export interface SampleIndexResult {
  samples: Sample[];
  /** 形が合わず捨てた図の数 */
  skipped: number;
  /** 件数の上限で切ったか */
  truncated: boolean;
}

export interface ReadSampleIndexOptions {
  maxSamples?: number;
  maxTextLength?: number;
}

const DEFAULT_MAX_SAMPLES = 2000;
const DEFAULT_MAX_TEXT = 500;
/** `<name>.zumen.yaml` がファイル名の上限（多くの環境で 255 バイト）に収まるよう、名前は UTF-8 で数える */
const MAX_NAME_BYTES = 200;
const MAX_USES = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join('') : value;
}

/**
 * 名前はそのままファイル名になる（`<name>.zumen.yaml`）。索引は外から来るので、
 * 別のフォルダを指せる名前や Windows で作れない名前は受けない。
 */
function isSafeName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || new TextEncoder().encode(name).length > MAX_NAME_BYTES) return false;
  if (name === '.' || name === '..' || name.startsWith('.')) return false;
  // Windows で作れない文字・制御文字。% と # は URL に載せたとき別の意味になる
  if (/[\\/:*?"<>|%#\u0000-\u001f\u007f-\u009f]/.test(name)) return false;
  // 見えない文字・向きを変える文字は、画面の名前と実際のファイル名を食い違わせる
  if (/[\u200b-\u200f\u202a-\u202e\u2028\u2029\u2060-\u2069\ufeff]/.test(name)) return false;
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(name)) return false;
  // Windows の予約デバイス名は拡張子が付いていても開けない（CON.zumen.yaml も不可）
  if (/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)/i.test(name)) return false;
  return !/[. ]$/.test(name);
}

/** 大文字小文字・正規化の違いだけの名前は、Windows / macOS では同じファイルになる */
function nameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

/** zumen の `examples/gallery/index.json` を読む。信頼できない入力として扱い、投げずに捨てる。 */
export function readSampleIndex(raw: unknown, options: ReadSampleIndexOptions = {}): SampleIndexResult {
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
  const maxText = options.maxTextLength ?? DEFAULT_MAX_TEXT;
  const samples: Sample[] = [];
  let skipped = 0;
  let truncated = false;
  const seen = new Set<string>();

  const categories = isRecord(raw) && Array.isArray(raw['categories']) ? raw['categories'] : [];
  for (const category of categories) {
    if (!isRecord(category) || !Array.isArray(category['items'])) continue;
    const key = clip(category['key'], maxText);
    const label = clip(category['label'], maxText);
    const labelEn = clip(category['labelEn'], maxText);
    for (const item of category['items']) {
      if (!isRecord(item) || !isSafeName(item['name']) || seen.has(nameKey(item['name']))) {
        skipped += 1;
        continue;
      }
      if (samples.length >= maxSamples) {
        truncated = true;
        break;
      }
      const name = item['name'];
      seen.add(nameKey(name));
      const uses = Array.isArray(item['uses'])
        ? item['uses'].filter((u): u is string => typeof u === 'string').slice(0, MAX_USES).map((u) => clip(u, maxText))
        : [];
      samples.push({
        name,
        file: `${name}.zumen.yaml`,
        caption: clip(item['caption'], maxText) || name,
        captionEn: clip(item['captionEn'], maxText),
        kind: clip(item['kind'], maxText),
        category: key,
        categoryLabel: label,
        categoryLabelEn: labelEn,
        uses,
      });
    }
    if (truncated) break;
  }
  return { samples, skipped, truncated };
}

const SAMPLE_WEIGHTS: ReadonlyArray<[(s: Sample) => string, number]> = [
  [(s) => s.caption, 6],
  [(s) => s.name, 4],
  [(s) => s.categoryLabel, 3],
  [(s) => s.captionEn, 2],
  [(s) => s.categoryLabelEn, 1],
  [(s) => s.uses.join(' '), 1],
];

/** サンプルの検索。語はすべて含むものだけ（AND）。同点は索引の並び順のまま。 */
export function searchSamples(samples: readonly Sample[], query: string, options: { limit?: number } = {}): Sample[] {
  const terms = splitQuery(query);
  if (terms.length === 0) return [];
  const scored: Array<{ sample: Sample; score: number; order: number }> = [];

  samples.forEach((sample, order) => {
    const fields = SAMPLE_WEIGHTS.map(([get, weight]) => [normalizeForSearch(get(sample)), weight] as const);
    let score = 0;
    for (const term of terms) {
      const best = fields.reduce((max, [text, weight]) => (text.includes(term) && weight > max ? weight : max), 0);
      if (best === 0) return;
      score += best;
    }
    scored.push({ sample, score, order });
  });

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, options.limit ?? 50).map((s) => s.sample);
}
