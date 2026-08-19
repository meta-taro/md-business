<script lang="ts">
  /**
   * 画像を 1 枚出すだけの面。編集も保存もしない。
   *
   * 中身は読み取り側が data URL にして渡してくる。ここで元のパスを組み立て直したり、
   * ファイルを取りにいったりはしない——プレビューが外から物を取れないようにしてある
   * 前提を、この画面のためだけに崩さないため。
   *
   * 見出し（種類・大きさ・切り替え）は呼び出し側が持つ。参考データ（.json / .xml）の
   * 面と同じ並びに見せたいので、器の作りを揃えている。
   */
  import type { OpenImage } from '$lib/workspace/docState';
  import type { ImageFitMode } from './imageView';

  interface Props {
    image: OpenImage;
    fit: ImageFitMode;
    /** 実寸が分かったとき（読み込み後）に 1 度呼ばれる。 */
    onMeasure?: (size: { width: number; height: number }) => void;
  }
  const { image, fit, onMeasure }: Props = $props();

  // 実寸は読み込みが終わるまで分からない。読み込めた時点で 1 度だけ呼び出し側へ渡す。
  function measure(event: Event): void {
    const img = event.currentTarget;
    if (!(img instanceof HTMLImageElement)) return;
    onMeasure?.({ width: img.naturalWidth, height: img.naturalHeight });
  }
</script>

<div class="image-body" class:actual={fit === 'actual'}>
  <img
    src={image.dataUrl}
    alt={image.relPath}
    class:actual={fit === 'actual'}
    onload={measure}
  />
</div>

<style>
  /* 収めるときは中央に置く。原寸のときは左上から並べ、はみ出した分をこの枠で送る
     （画像側にスクロールを持たせると、中央寄せのぶん左端が出せなくなる）。 */
  .image-body {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    padding: var(--space-3);
    overflow: auto;
  }
  .image-body.actual {
    place-items: start;
  }
  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  img.actual {
    max-width: none;
    max-height: none;
    object-fit: none;
  }
</style>
