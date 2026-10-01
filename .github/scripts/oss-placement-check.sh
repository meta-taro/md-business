#!/usr/bin/env bash
# 公開リポの「置き場所」検査。作業の記録が git に入っていないかを見る。
#
# 語の検査（oss-privacy-check.sh）とは別に要る。記録は文面が中立でも、
# 公開リポに置く理由が無い。語の検査はそれを素通りする。
#
# 使い方（3 か所で同じものを走らせる）:
#   pre-commit : bash .github/scripts/oss-placement-check.sh
#   pre-push   : bash .github/scripts/oss-placement-check.sh
#   CI         : .github/workflows/oss-placement-check.yml
#
# 見るのは index（git ls-files）。commit 前に走らせれば、これから入るものも含む。
# 終了コード: 0 = 問題なし / 1 = 問題あり
#
# 出力はパスだけ。ファイルの中身は出さない（CI のログも公開されるため）。
#
# 許可の範囲を変えたいときは、このファイルを編集する（差分が履歴に残る）。
# 手元だけで通す抜け道は作らない。
set -uo pipefail

# .claude/ のうち公開してよいもの: 設定と配布物だけ
ALLOW_CLAUDE='^\.claude/(tools|rules|templates|hooks|commands|agents|skills)/|^\.claude/settings\.json$'

# .claude/ の外でも、名前で作業記録と分かるもの
DENY_NAMES='(^|/)(handoff|project-status|session-notes)[^/]*$'

fail=0

files="$(git ls-files)"

rec="$(printf '%s\n' "$files" | grep -E '^\.claude/' | grep -v -E "$ALLOW_CLAUDE" || true)"
if [ -n "$rec" ]; then
  echo "✗ .claude/ に作業の記録が入っています（設定と配布物以外）:"
  printf '%s\n' "$rec" | sed 's/^/    /'
  fail=1
fi

named="$(printf '%s\n' "$files" | grep -E "$DENY_NAMES" | grep -v -E "$ALLOW_CLAUDE" || true)"
if [ -n "$named" ]; then
  echo "✗ 作業の記録と見られるファイルが入っています:"
  printf '%s\n' "$named" | sed 's/^/    /'
  fail=1
fi

if ! grep -qxF '/.claude/*' .gitignore 2>/dev/null; then
  echo "✗ .gitignore に '/.claude/*' がありません（記録が次の commit で入ります）"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "記録は手元か、非公開の <リポ名>-notes に置いてください。"
  echo "追跡を外すのは git rm --cached <パス>（手元のファイルは残ります）。"
  exit 1
fi
echo "✓ 置き場所の検査: 問題なし"
