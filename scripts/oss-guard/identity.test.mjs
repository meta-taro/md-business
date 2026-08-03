import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkIdentity, isAllowedEmail } from './identity.mjs';

const ids = (findings) => findings.map((f) => f.patternId);

test('GitHub noreply メールを通す', () => {
  assert.equal(isAllowedEmail('3032390+meta-taro@users.noreply.github.com'), true);
  // ID 前置のない旧形式も GitHub が払い出す。
  assert.equal(isAllowedEmail('meta-taro@users.noreply.github.com'), true);
  // web UI の merge commit が使う committer。
  assert.equal(isAllowedEmail('noreply@github.com'), true);
});

test('到達可能な個人・組織メールを通さない', () => {
  assert.equal(isAllowedEmail('someone@gmail.com'), false);
  assert.equal(isAllowedEmail('someone@example.co.jp'), false);
  // noreply を含むだけの別ドメインを通さない（部分一致での取りこぼし防止）。
  assert.equal(isAllowedEmail('noreply@github.com.evil.test'), false);
  assert.equal(isAllowedEmail('x@users.noreply.github.com.evil.test'), false);
});

test('author / committer の非許可メールをそれぞれ検出する', () => {
  const f = checkIdentity({
    authorName: 'meta-taro',
    authorEmail: 'someone@gmail.com',
    committerName: 'meta-taro',
    committerEmail: '3032390+meta-taro@users.noreply.github.com',
  });
  assert.deepEqual(ids(f), ['identity-email']);
  assert.equal(f[0].field, 'author');
});

test('author と committer が両方非許可なら 2 件検出する', () => {
  const f = checkIdentity({
    authorName: 'meta-taro',
    authorEmail: 'a@gmail.com',
    committerName: 'meta-taro',
    committerEmail: 'b@example.co.jp',
  });
  assert.equal(f.length, 2);
  assert.deepEqual(
    f.map((x) => x.field),
    ['author', 'committer']
  );
});

test('検出結果はメールの局所部を伏せる', () => {
  const f = checkIdentity({
    authorName: 'meta-taro',
    authorEmail: 'personal.address@gmail.com',
    committerName: 'meta-taro',
    committerEmail: 'personal.address@gmail.com',
  });
  // CI ログも公開されるため、実値をそのまま出さない。
  for (const finding of f) {
    assert.ok(!finding.matched.includes('personal.address'));
    assert.ok(finding.matched.includes('gmail.com'));
  }
});

test('表示名の内部参照を検出する', () => {
  const f = checkIdentity({
    authorName: 'dev-slot2',
    authorEmail: '1+x@users.noreply.github.com',
    committerName: '1+x@users.noreply.github.com',
    committerEmail: '1+x@users.noreply.github.com',
  });
  assert.ok(ids(f).includes('internal-handle'));
});

test('許可メール + 内部参照なしの表示名なら検出しない', () => {
  assert.deepEqual(
    checkIdentity({
      authorName: 'meta-taro',
      authorEmail: '3032390+meta-taro@users.noreply.github.com',
      committerName: 'meta-taro',
      committerEmail: '3032390+meta-taro@users.noreply.github.com',
    }),
    []
  );
});

test('メール未設定を検出する', () => {
  const f = checkIdentity({
    authorName: 'meta-taro',
    authorEmail: '',
    committerName: 'meta-taro',
    committerEmail: '3032390+meta-taro@users.noreply.github.com',
  });
  assert.deepEqual(ids(f), ['identity-email']);
});
