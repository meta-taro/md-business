import { describe, it, expect } from 'vitest';
import { affectsSite, shouldAutoLive, shouldStop } from './browserPreview';

/** テスト補助：監視から届く形（relPath と scope）を組み立てる。 */
function ch(relPath: string, scope: 'tree' | 'site' | 'config' = 'tree') {
  return { relPath, scope };
}

describe('affectsSite', () => {
  it('ページになるものが変わったら組み直す', () => {
    expect(affectsSite(ch('docs/仕様.md'), false)).toBe(true);
    expect(affectsSite(ch('README.MD'), false)).toBe(true);
  });

  // ページ以外もサイトの一部として出るので、変わったら読み直させる。
  // ここで落とすと、直したのに開いたままの窓が古いままになる。
  it('web モードで出している間は、書いた HTML / CSS / JS でも組み直す', () => {
    expect(affectsSite(ch('style.css', 'site'), true)).toBe(true);
    expect(affectsSite(ch('js/app.js', 'site'), true)).toBe(true);
    expect(affectsSite(ch('about.html', 'site'), true)).toBe(true);
  });

  // 一覧に出るものは、どちらのモードでもページや添付として出る。
  it('文書やデータの変化は、出し方に関係なく組み直す', () => {
    expect(affectsSite(ch('docs/test-specs/001-login.tsv'), false)).toBe(true);
    expect(affectsSite(ch('data/口座.json'), false)).toBe(true);
    expect(affectsSite(ch('画像.png'), false)).toBe(true);
  });

  // 業務文書として出している間は、これらを集めていない。組み直しても中身は同じで、
  // 見ている人には、何もしていないのに窓が瞬いたようにしか映らない。
  it('業務文書として出している間は、サイトの部品では組み直さない', () => {
    expect(affectsSite(ch('style.css', 'site'), false)).toBe(false);
    expect(affectsSite(ch('about.html', 'site'), false)).toBe(false);
  });

  // 宣言が何を意味するかは、宣言を読み直す側が決める。
  it('宣言そのものでは組み直さない', () => {
    expect(affectsSite(ch('md-business.yml', 'config'), true)).toBe(false);
  });

  // 書き出した先の変化で組み直すと、書き出すたびに組み直しが起きる。
  it('書き出し先の変化では組み直さない', () => {
    expect(affectsSite(ch('dist/index.html', 'site'), true)).toBe(false);
    expect(affectsSite(ch('dist/a.md'), true)).toBe(false);
  });
});

describe('shouldStop', () => {
  it('開いているフォルダが変わったら畳む', () => {
    expect(shouldStop('C:/work/a', 'C:/work/b')).toBe(true);
  });

  // 別のフォルダの中身を、前のフォルダの URL で見せ続けることになる。
  it('フォルダを閉じたら畳む', () => {
    expect(shouldStop('C:/work/a', null)).toBe(true);
  });

  it('同じフォルダのままなら畳まない', () => {
    expect(shouldStop('C:/work/a', 'C:/work/a')).toBe(false);
  });
});

describe('shouldAutoLive', () => {
  const base = { trigger: 'opened', declaredWeb: true, trusted: true, serving: false } as const;

  it('web モードで同意済みのフォルダを開いたら、押さずに立てる', () => {
    expect(shouldAutoLive(base)).toBe(true);
  });

  // 開いただけで許可を訊く窓が出ると、読むだけのつもりの人にまで押させることになる。
  it('同意がなければ立てない', () => {
    expect(shouldAutoLive({ ...base, trusted: false })).toBe(false);
  });

  it('宣言が無ければ立てない', () => {
    expect(shouldAutoLive({ ...base, declaredWeb: false })).toBe(false);
  });

  // 宣言はプロジェクトの中にあるので、書いた側から置ける。置かれた瞬間に待ち受けが
  // 立つ形にすると、ファイルを 1 つ置くだけで手元にポートが開く。
  it('宣言が書き換わったことでは立てない', () => {
    expect(shouldAutoLive({ ...base, trigger: 'declared' })).toBe(false);
  });

  // 押して畳んだ人の手を、再走査のたびに元へ戻すことになる。
  it('同じフォルダを取り直しただけでは立てない', () => {
    expect(shouldAutoLive({ ...base, trigger: 'rescanned' })).toBe(false);
  });

  // 押して止めた人の手を上書きしない。立て直すと URL も変わる。
  it('もう立っているなら立て直さない', () => {
    expect(shouldAutoLive({ ...base, serving: true })).toBe(false);
  });
});
