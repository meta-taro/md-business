<!-- prettier-ignore-start -->
# ECC (Everything Claude Code) — 道具カード

> **このファイルは自動同期されます。**直接編集しても次の同期で上書きされます。
> 誤りや古い記述があれば Issue で知らせてください。

AI コーディングエージェントに **plan → test → implement → review → verify → remember → improve**
の型を土台として持たせる MIT ライセンスのフレームワーク。エージェント・スキル・コマンド・
フックを一式で入れる。

> **これはデザインの道具ではありません。考え方の型そのものです。**
> UI の無い案件（API・スクレイパー・ゲーム・CLI）にも等しく効きます。
>
> **必須ではありません。**既に自分で同等の仕組み（自作の agents / skills / rules）を
> 組んでいるなら、それを使ってください。**入れ替える必要はありません。**
> ECC は「何も無い状態から始めるときの、無難な既定」です。

- リポジトリ: <https://github.com/affaan-m/ECC>（MIT）
- npm パッケージ名: `ecc-universal`（**リポ名とプラグイン名と全部違う**・後述）

## これはリポジトリに入れる物ではありません

**入る先は PC の `~/.claude/`（Windows は `%USERPROFILE%\.claude`）です。**
リポジトリに commit しても効きません。**各自が自分の PC で 1 回入れます。**

## 版数はこのカードに書かない

版数を書くと次のリリースで嘘になる。入手は必ずリポジトリを開いて、そこに出ている最新を取る。

---

## 1. 入れ方は 2 通り。**混ぜてはいけません**

README の原文: **"Do not stack install methods."**
同じ環境に 2 回入れると skill / command / hook / 設定が二重になります。

| 方式 | 中身 | 向き |
|---|---|---|
| **A. プラグイン** | `/plugin` コマンド 2 つ。更新も Claude Code 側が見る | **既定。これを使う** |
| **B. 手動** | git clone して `install.sh --profile full` | プラグインを意図的に避けるときだけ |

**どちらか片方だけ。**A を入れた後に `./install.sh --profile full` を走らせない。
B を入れた後に `/plugin install` しない。

**既に片方が入っている PC に、もう片方を足さないでください。**
二重になった場合の直し方は §5。

---

## 2. 方式 A（既定）— プラグイン

Claude Code の中で 2 行。

```
/plugin marketplace add https://github.com/affaan-m/ECC
/plugin install ecc@ecc
```

`settings.json` に宣言的に書いても同じ結果になります。

```json
{
  "extraKnownMarketplaces": {
    "ecc": { "source": { "source": "github", "repo": "affaan-m/ECC" } }
  },
  "enabledPlugins": { "ecc@ecc": true }
}
```

### プラグイン方式で **やってはいけないこと**

- **リポジトリの `hooks/hooks.json` を `settings.json` へコピーしない。**
  Claude Code v2.1+ がプラグインの hooks を自動で読むため、**二重実行になります**
- **`./install.sh --profile full` を後から走らせない**

### プラグイン方式で **自動では入らないもの**

- **MCP サーバー定義**（意図的に自動有効化されません）。要るものだけ `/mcp` で入れる
- **rules**（次項）

---

## 3. `rules` はプラグインでは配れません

README の原文: **"Claude Code plugins cannot distribute rules"**。
必要な rule パックだけ手で置きます。

```bash
git clone https://github.com/affaan-m/ECC.git
cd ECC
mkdir -p ~/.claude/rules/ecc
cp -R rules/common ~/.claude/rules/ecc/
cp -R rules/typescript ~/.claude/rules/ecc/
```

**`rules/common` ＋ 実際に使う言語パック 1 つ**から始める、と README が指定しています。
全部入れない。

言語パックは `common` / `typescript` / `python` / `golang` / `java` など。**自分のリポの言語だけ。**

---

## 4. 3 つの名前は互換ではありません

| 何 | 名前 |
|---|---|
| GitHub のリポジトリ | `affaan-m/ECC` |
| Claude のマーケットプレイス / プラグイン識別子 | `ecc@ecc` |
| npm パッケージ | `ecc-universal` |

**古い記事には別のマーケットプレイス識別子が載っています。**それは旧称です。`ecc@ecc` を使ってください。

---

## 5. 二重に入ってしまったとき

順番が決まっています。

1. Claude Code からプラグインを外す
2. リポジトリのルートで `node scripts/uninstall.js` を実行（インストール状態に記録されたファイルだけ消えます）
3. 手でコピーした rule フォルダのうち、要らないものを消す
4. **どちらか一方の方式で入れ直す**

ECC は自分が入れたファイルしか消しません。無関係なファイルは触りません。

---

## 6. 入っているか確認する

**skills が `~/.claude/skills/` の直下にフラットに並んでいれば、手動インストール済みです。**
（README の指定: skills は直下に置く。`~/.claude/skills/ecc/` の下に入れ子にしない）

ECC 由来のファイルは frontmatter に `origin: ECC` が付いています。

```bash
grep -rl "^origin: ECC" ~/.claude/skills/ | wc -l
```

プラグインとして入っているかは `~/.claude/plugins/installed_plugins.json` に `ecc@ecc` があるかどうか。

**両方に出たら二重です**（§5 へ）。

---

## 7. 既知の注意

### `npx ecc-universal setup` は現時点で動きません

README に警告があります。**npm リリース 2.1.0 には入っていません。**
2.2.0 が出るまで実行しないでください。ガイド付きセットアップは 2.2 以降の機能です。

### 既存の agents / skills と名前がぶつかります

`planner` / `architect` / `tdd-guide` / `code-reviewer` / `security-reviewer` /
`build-error-resolver` などは ECC が持っている名前です。
**自作の同名ファイルを既に置いている PC では、どちらが効いているか分からなくなります。**
入れる前に `~/.claude/agents/` の中身を控えてください。

### Claude Code 側のコマンドのエラーは ECC では拾えません

`/plugin marketplace add` や `/plugin install` が「既に存在する」「スコープが衝突する」と
返すのは Claude Code 本体の挙動です。**その状態で手動インストールを重ねて回避しないでください。**
衝突しているスコープを先に解消します。
<!-- prettier-ignore-end -->
