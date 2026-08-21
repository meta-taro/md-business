/**
 * 検証シートの列プリセット（新規作成の雛形）。
 * ------------------------------------------------------------------
 * 検証シートは「どんな列で書くか」が決まってしまえば、あとは実施を埋めるだけになる。
 * 逆に言うと、白紙から列を組み立てる最初の数分が毎回まるごと重複する。よく使う列の組を
 * 名前付きで持っておき、選ぶだけで書き始められる状態にする。
 *
 * 設計方針:
 * - **本文は `serializeTsv` に作らせる**: 文字列を手で組むと、区切りや行順といった書式の
 *   決まりごとが仕様と別々に育つ。生成物が必ず読み戻せることを、生成の側で保証する。
 * - **値の無い meta キーは書かない**: 出力は `# キー: 値` なので、空値だと行末に空白が残り、
 *   最初の 1 編集で「中身は変わっていないのに差分が出る」状態になる。
 * - **データ行は入れない**: 記入例を置くと消す手間が先に来る。列と色分けだけ用意する。
 * - **純ロジック**: DOM 非依存。Svelte 側は選択結果を受けて本文を作り、保存するだけ。
 */

import {
  ROW_ID_COLUMN,
  serializeTsv,
  type ParsedHeader,
  type TsvDocument,
} from '@md-business/schema-test-spec-tsv';
import type { MessageKey } from '$lib/i18n/messages';
// 名前の規則は改名と 1 か所に持つ（新規作成だけ別の規則になると、通る名前が導線で変わる）。
import { validateNewName, type NewNameError } from '../components/fileTreeMenu';
import { TSV_FORMAT_ID } from './detect';

/** 検証シートのファイル拡張子。 */
const TSV_EXTENSION = '.tsv';

/** 実施状況を表す列の選択肢（どのプリセットでも共通）。 */
const RESULT_CHOICES = ['OK', 'NG', '保留', '未実施'] as const;

/** 実施状況で行に敷く色。残件が色の帯で見えるようにする。 */
const RESULT_STYLE = `style 結果 OK=#e7f6ec NG=#fcebec 保留=#fdf3e2`;

/** 指摘の往復で使う状態語。`反映済み` だけが現物の変更を要求する（`review.ts` 参照）。 */
const REVIEW_CHOICES = ['未着手', '提案済み', '反映済み', 'クローズ'] as const;

/**
 * 指摘の状態で行に敷く色。`未着手` に色を当てない（起こしただけの行が大半を占めるので、
 * 塗ると表全体が色で埋まって、動いている行が沈む）。
 */
const REVIEW_STYLE = `style 状態 反映済み=#e7f6ec 提案済み=#fdf3e2 クローズ=#eef0f2`;

/** 選べる雛形 1 件。 */
export interface TsvPreset {
  /** 保存・受け渡しに使う識別子。表示名を変えても壊れないよう英字で持つ。 */
  id: string;
  /** 選択肢に出す名前（辞書キー）。列名は日本語のままだが、選ぶ画面は表示言語に合わせる。 */
  labelKey: MessageKey;
  /** どんなときに選ぶかの一言（辞書キー）。 */
  descriptionKey: MessageKey;
  /** 生成する `#@` 行（種別語を含む本体）。 */
  directives: string[];
  /** 生成する列定義。 */
  columns: ParsedHeader[];
}

/** 注記の要らない列（文字列）。 */
function textColumn(name: string): ParsedHeader {
  return { name, type: 'text', required: false };
}

/** 複数行を書く列。 */
function multilineColumn(name: string): ParsedHeader {
  return { name, type: 'multiline_text', required: false };
}

/**
 * 実施の記録に使う共通の後半列（結果・実施日・担当・備考 + 行 ID）。
 * 前半（何を確かめるか）だけがプリセットごとに変わる。
 */
function trailingColumns(): ParsedHeader[] {
  return [
    { name: '結果', type: 'enum', required: false, enumValues: [...RESULT_CHOICES] },
    { name: '実施日', type: 'date', required: false },
    textColumn('担当'),
    multilineColumn('備考'),
    // 行 ID。グリッドが行を追跡するために全プリセット共通で末尾に置く。
    textColumn(ROW_ID_COLUMN),
  ];
}

/** 選べる雛形の一覧。 */
export const TSV_PRESETS: readonly TsvPreset[] = [
  {
    id: 'test-case',
    labelKey: 'newSheet.presetTestCase',
    descriptionKey: 'newSheet.presetTestCaseDesc',
    directives: [`rowid ${ROW_ID_COLUMN}`, RESULT_STYLE],
    columns: [
      { name: 'No.', type: 'number', required: false },
      textColumn('項目'),
      multilineColumn('手順'),
      multilineColumn('期待結果'),
      ...trailingColumns(),
    ],
  },
  {
    id: 'viewpoint',
    labelKey: 'newSheet.presetViewpoint',
    descriptionKey: 'newSheet.presetViewpointDesc',
    directives: [`rowid ${ROW_ID_COLUMN}`, RESULT_STYLE],
    columns: [
      { name: 'No.', type: 'number', required: false },
      textColumn('分類'),
      multilineColumn('観点'),
      multilineColumn('確認方法'),
      ...trailingColumns(),
    ],
  },
  {
    id: 'review',
    labelKey: 'newSheet.presetReview',
    descriptionKey: 'newSheet.presetReviewDesc',
    // 状態と対象を宣言しておく。宣言が無いと、状態列はただの文字列になり、
    // 「反映済み」と書いただけで直ったことになってしまう。
    directives: [`rowid ${ROW_ID_COLUMN}`, 'review state=状態 target=対象', REVIEW_STYLE],
    columns: [
      { name: 'No.', type: 'number', required: false },
      multilineColumn('指摘'),
      // 指し先（例 `001-login.tsv#No.=12`）。ここが行まで指していないと裏取りができない。
      textColumn('対象'),
      multilineColumn('対応方針'),
      { name: '状態', type: 'enum', required: false, enumValues: [...REVIEW_CHOICES] },
      multilineColumn('備考'),
      // 起票者・起票日の列は置かない。誰がいつ書いたかは履歴に残っているので、
      // 手で書かせると履歴と食い違う欄が 2 つ増えるだけになる。
      textColumn(ROW_ID_COLUMN),
    ],
  },
];

/** id から雛形を引く。選択が失われていても落ちないよう、無ければ null。 */
export function findPreset(id: string): TsvPreset | null {
  return TSV_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * 雛形から検証シートの本文を作る。タイトルは空なら書かない（値の無い meta 行を残さない）。
 * 末尾は改行 1 つ（付けないと差分に「改行なし」が出る）。
 */
export function buildPresetTsv(preset: TsvPreset, title = ''): string {
  const trimmedTitle = title.trim();
  const doc: TsvDocument = {
    formatId: TSV_FORMAT_ID,
    meta: trimmedTitle === '' ? {} : { タイトル: trimmedTitle },
    directives: [...preset.directives],
    columns: preset.columns.map((column) => ({ ...column })),
    rows: [],
  };
  return `${serializeTsv(doc)}\n`;
}

/**
 * 入力されたファイル名を検証シートの名前に整える。既に拡張子が付いていれば重ねない
 * （`001-login.tsv.tsv` を作らない）。空入力は空のまま返し、拡張子だけの名前にしない。
 */
export function presetFileName(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') return '';
  if (trimmed.toLowerCase().endsWith(TSV_EXTENSION)) return trimmed;
  return `${trimmed}${TSV_EXTENSION}`;
}

/**
 * 新規作成で入力された名前を、書き込む前にその場で判定する。改名と同じ規則を使う。
 *
 * 最終ゲートは Rust 側（親フォルダを実パスで解決し、ルート外なら書かない）で、ここはその手前。
 * 区切り文字を弾くのは、新規作成をフォルダ移動の手段にしないため。判定は拡張子を補ってから
 * 行う（`.tsv` を付けた形が最終的に書き込まれる名前であり、そちらを検査しないと意味がない）。
 */
export function validateSheetName(input: string): NewNameError | null {
  const name = presetFileName(input);
  // 空入力では拡張子を付けないので、空のまま validateNewName へ渡って empty になる。
  return validateNewName(name, 'file');
}
