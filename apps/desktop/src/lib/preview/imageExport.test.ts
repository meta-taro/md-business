import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORDER,
  IMAGE_PRESETS,
  buildShotSpec,
  describeOutput,
  type ImageOrder,
} from './imageExport';

describe('画像書き出しの注文', () => {
  it('型は名前と寸法の組で持つ', () => {
    const names = IMAGE_PRESETS.map((preset) => preset.name);
    expect(names).toContain('ogp');
    expect(names).toContain('instagram-story');
    const ogp = IMAGE_PRESETS.find((preset) => preset.name === 'ogp');
    expect(ogp).toEqual({ name: 'ogp', width: 1200, height: 630 });
  });

  it('既定は OGP を 2 倍の PNG で撮る', () => {
    // 2 倍が既定なのは、SNS も OGP も高精細の画面で見られるため。
    expect(DEFAULT_ORDER.preset).toBe('ogp');
    expect(DEFAULT_ORDER.scale).toBe(2);
    expect(DEFAULT_ORDER.format).toBe('png');
  });

  it('注文を Rust が読める形に組み替える', () => {
    const spec = buildShotSpec({ preset: 'ogp', scale: 2, format: 'png', quality: 85 });
    expect(spec).toEqual({
      width: 1200,
      height: 630,
      scale: 2,
      format: { type: 'png', transparent: false },
    });
  });

  it('透過を選ぶと背景を抜く注文になる', () => {
    const spec = buildShotSpec({
      preset: 'instagram-post',
      scale: 1,
      format: 'png-transparent',
      quality: 85,
    });
    expect(spec.width).toBe(1080);
    expect(spec.format).toEqual({ type: 'png', transparent: true });
  });

  it('JPEG のときだけ品質が載る', () => {
    const spec = buildShotSpec({ preset: 'x-post', scale: 1, format: 'jpeg', quality: 70 });
    expect(spec.format).toEqual({ type: 'jpeg', quality: 70 });
  });

  it('知らない型の名前は組み立てない', () => {
    // 型の上では起きないが、外から来た値（古い設定・MCP 越しの注文）は型で守れない。
    // 知らない名前を寸法 0 として通すと、撮る側まで行ってから断られる。
    const order = { preset: 'tiktok', scale: 1, format: 'png', quality: 85 } as unknown as ImageOrder;
    expect(() => buildShotSpec(order)).toThrow();
  });

  it('出来上がりの寸法と形式を先に見せる', () => {
    // 倍率を掛けた「実際に出るピクセル数」を出す。1200×630 と書いてあるのに
    // 2400×1260 が出てくると、貼る先の規定に合っているか判断できない。
    expect(describeOutput({ preset: 'ogp', scale: 2, format: 'png', quality: 85 })).toBe(
      '2400 × 1260 px · PNG',
    );
    expect(
      describeOutput({ preset: 'ogp', scale: 1, format: 'png-transparent', quality: 85 }),
    ).toBe('1200 × 630 px · PNG（透過）');
    expect(describeOutput({ preset: 'x-post', scale: 1, format: 'jpeg', quality: 70 })).toBe(
      '1200 × 675 px · JPEG 70',
    );
  });

  it('端数の出る倍率でも整数のピクセル数を見せる', () => {
    // 728 × 1.5 = 1092、90 × 1.5 = 135。小数の付いた寸法は出さない。
    expect(describeOutput({ preset: 'web-banner', scale: 1.5, format: 'png', quality: 85 })).toBe(
      '1092 × 135 px · PNG',
    );
  });
});
