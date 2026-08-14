import { describe, it, expect } from 'vitest';
import { planRowReveal, type RevealState } from './gridReveal';

const START: RevealState = { revealed: null, releasedSpot: null };

/** 直前に「A1 を寄せ終えて、窓の中に見えている」状態を作る。 */
function settled(spot: string): RevealState {
  const plan = planRowReveal({ spot, inWindow: true, ...START });
  return { revealed: plan.revealed, releasedSpot: plan.releasedSpot };
}

describe('planRowReveal', () => {
  it('選択が窓の外へ移ったら寄せる（Enter / 矢印で表の外へ出たとき）', () => {
    const plan = planRowReveal({ spot: '500:0:nav', inWindow: false, ...START });
    expect(plan.reveal).toBe(true);
  });

  it('選択が窓の中にあるなら寄せない', () => {
    const plan = planRowReveal({ spot: '3:0:nav', inWindow: true, ...START });
    expect(plan.reveal).toBe(false);
  });

  // この Issue の本体。窓は scrollTop から導かれるので、人がホイールを回すだけでも
  // この判定が走り直す。そこで寄せると scrollTop が書き戻され、人の操作と引き合って揺れる。
  it('選択はそのままで窓だけ動いたときは寄せない（人がスクロールしただけ）', () => {
    const state = settled('500:0:nav');
    const plan = planRowReveal({ spot: '500:0:nav', inWindow: false, ...state });
    expect(plan.reveal).toBe(false);
  });

  it('スクロールで外へ出たあとに選択が動けば、また寄せる', () => {
    const away = planRowReveal({ spot: '500:0:nav', inWindow: false, ...settled('500:0:nav') });
    const moved = planRowReveal({
      spot: '501:0:nav',
      inWindow: false,
      revealed: away.revealed,
      releasedSpot: away.releasedSpot,
    });
    expect(moved.reveal).toBe(true);
  });

  it('編集へ入っただけ（同じセル）でも、窓の外なら寄せる', () => {
    const state = settled('7:2:nav');
    const plan = planRowReveal({ spot: '7:2:edit', inWindow: false, ...state });
    expect(plan.reveal).toBe(true);
  });
});

// 揺れのもう 1 つの出どころ。窓から外れた選択セルは DOM ごと消えるので焦点が浮く。
// 浮いたことを理由に焦点を取り戻すと、スクロールで戻ってきた瞬間に表示が寄る。
describe('planRowReveal — 焦点を手放す', () => {
  it('人がスクロールして選択が窓から外れたら、その選択について焦点を手放す', () => {
    const plan = planRowReveal({ spot: '500:0:nav', inWindow: false, ...settled('500:0:nav') });
    expect(plan.releasedSpot).toBe('500:0:nav');
  });

  it('手放した状態は、スクロールで窓へ戻ってきても続く（戻った拍子に寄せないため）', () => {
    const away = planRowReveal({ spot: '500:0:nav', inWindow: false, ...settled('500:0:nav') });
    const back = planRowReveal({
      spot: '500:0:nav',
      inWindow: true,
      revealed: away.revealed,
      releasedSpot: away.releasedSpot,
    });
    expect(back.releasedSpot).toBe('500:0:nav');
  });

  it('選択が動いたら手放しは解ける（次はふつうに焦点を当てる）', () => {
    const away = planRowReveal({ spot: '500:0:nav', inWindow: false, ...settled('500:0:nav') });
    const moved = planRowReveal({
      spot: '501:0:nav',
      inWindow: true,
      revealed: away.revealed,
      releasedSpot: away.releasedSpot,
    });
    expect(moved.releasedSpot).toBeNull();
  });

  it('寄せて窓へ入れた場合は手放さない（キーボード操作の続きだから）', () => {
    const plan = planRowReveal({ spot: '500:0:nav', inWindow: false, ...START });
    expect(plan.reveal).toBe(true);
    expect(plan.releasedSpot).toBeNull();
  });
});
