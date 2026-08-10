/**
 * 更新ダイアログの見た目を確かめるための見本状態。
 *
 * 更新ダイアログは、新しい Release が公開されていないと出ない。つまり出す前に見た目を
 * 確かめる手段が無く、文言の折り返し・ボタンの並び・進捗表示の崩れは、出したあとに
 * 使う人が見て初めて分かる。一度出てしまうと直すには次のリリースが要るので割に合わない。
 *
 * ここは見本の値を持つだけの純データにしてある。開発ビルドでこれを流し込んで目で見る
 * （ヘルプメニューの開発用ブロック）。本番ビルドでは呼び出し側ごと消えるので、見本が
 * そのまま画面へ出ることはない。
 */
import type { UpdateState } from './updateFlow';

/** 見本 1 つ。`label` は開発用の選択肢に出す名前。 */
export interface UpdatePreview {
  label: string;
  state: UpdateState;
}

/**
 * 更新内容の見本。
 *
 * 実際のリリースノートは見出しと箇条書きで書く。短い見本だけで確かめると、長い行の
 * 折り返しとノート欄のスクロールを見落とす。
 */
const SAMPLE_NOTES = [
  '### 追加',
  '',
  '- 検証シートのセルに書いた参照を押して、別のシートの行や基本設計書の見出しへ移動できるようにしました',
  '- 列ごとに文字の寄せ（左 / 中央 / 右）を指定できるようにしました',
  '',
  '### 修正',
  '',
  '- 行数の多い検証シートで、文字を打ってから表示に反映されるまで引っかかる問題を直しました',
  '- 保存のたびに、編集していない行まで差分に出ることがある問題を直しました',
].join('\n');

/**
 * ダイアログが描き分ける状態の見本を、確認したい順に返す。
 *
 * 状態を足したら、ここにも見本を足す（足し忘れは単体テストで落ちる）。
 */
export function previewStates(): UpdatePreview[] {
  return [
    { label: '確認中', state: { status: 'checking' } },
    { label: '最新', state: { status: 'up-to-date' } },
    {
      label: '更新あり',
      state: { status: 'available', version: '0.7.0', notes: SAMPLE_NOTES },
    },
    {
      label: 'ダウンロード中',
      state: {
        status: 'downloading',
        version: '0.7.0',
        downloaded: 4_800_000,
        total: 12_000_000,
        percent: 40,
      },
    },
    { label: 'インストール中', state: { status: 'installing', version: '0.7.0' } },
    { label: '再起動待ち', state: { status: 'ready', version: '0.7.0' } },
    {
      label: '失敗',
      state: {
        status: 'error',
        message: '更新の確認に失敗しました。ネットワーク接続を確認してください。',
      },
    },
  ];
}
