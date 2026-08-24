<!-- prettier-ignore-start -->
# 新しい PC を立ち上げたときにやること — 道具カード

> **このファイルは自動同期されます。**直接編集しても次の同期で上書きされます。
> 誤りや古い記述があれば Issue で知らせてください。

**入っている物が PC ごとに違うと、同じ指示を出しても AI の出来が変わります。**
成果物の質の差が、本人の力量ではなく環境の差で生まれます。**新しい PC では、特に支障が無ければ通しておくことを勧めます。**

> **必須ではありません。**
> **既に自分で同等の仕組みを組んでいるなら、それを使ってください。**入れ替える必要はありません。
> ここに書いてあるのは「何も無い状態から始めるときの、無難な既定」です。
> 合わない部分は自分の環境に合わせて構いません。

## 2 層あります。混ぜないでください

| 層 | 何 | 対象 |
|---|---|---|
| **1. 知性** | **ECC** | **全案件。**UI が無くても効く（API・スクレイパー・ゲーム・CLI） |
| **2. デザイン** | taste-skill / DESIGN.md / awesome-design-md | **UI のある案件だけ** |

**ECC はデザインの道具ではなく、考え方の型そのものです。**
これが入っていない PC は、そもそも AI の思考の質が落ちます。

詳細は `ecc.md` / `design-stack.md`。**このカードは手順だけです。**

---

## 前提

- Claude Code が入っていること
- `git` が入っていること
- Node.js が入っていること（`npx` を使うため）

---

## 1. ECC — Claude Code の中で 2 行

```
/plugin marketplace add https://github.com/affaan-m/ECC
/plugin install ecc@ecc
```

> **既に `install.sh` で手動導入済みの PC では、これをやってはいけません。**二重になります。
> 判別方法は §5。

---

## 2. ECC の rules — プラグインでは配られないので手で置く

**使う言語のパックだけ。全部入れない。**

**Windows (PowerShell)**

```powershell
git clone https://github.com/affaan-m/ECC.git "$env:TEMP\ECC"
mkdir "$env:USERPROFILE\.claude\rules\ecc" -Force
Copy-Item -Recurse "$env:TEMP\ECC\rules\common" "$env:USERPROFILE\.claude\rules\ecc\"
Copy-Item -Recurse "$env:TEMP\ECC\rules\typescript" "$env:USERPROFILE\.claude\rules\ecc\"
```

**macOS / Linux**

```bash
git clone https://github.com/affaan-m/ECC.git /tmp/ECC
mkdir -p ~/.claude/rules/ecc
cp -R /tmp/ECC/rules/common ~/.claude/rules/ecc/
cp -R /tmp/ECC/rules/typescript ~/.claude/rules/ecc/
```

`typescript` の部分を自分のリポの言語に置き換えます（`python` / `golang` / `java` など）。

---

## 3. taste-skill

```bash
npx skills add https://github.com/Leonxlnx/taste-skill
```

これは公式の手順です。**pnpm を使う環境でも、この 1 行は `npx` のまま**で構いません
（パッケージを追加せず一時実行するだけなので）。

---

## 4. Claude Code を再起動する

**入れただけでは効きません。**再起動して読み込ませます。

---

## 5. 入ったか確認する

**ECC（プラグイン方式）**

`~/.claude/plugins/installed_plugins.json` に `ecc@ecc` があるか。

**ECC（手動方式が既に入っていないか）**

```bash
grep -rl "^origin: ECC" ~/.claude/skills/ | wc -l
```

**0 より大きければ手動導入済み**です。この状態で §1 のプラグインを入れると二重になります。
どちらか一方に寄せてください（手順は `ecc.md` §5）。

**taste-skill**

```bash
ls ~/.claude/skills/ | grep taste
```

---

## 6. DESIGN.md はリポジトリ側

PC ではなく**プロダクトのリポジトリのルート**に置きます。
無い場合は `design-stack.md` を読んでから作ってください。**中身を決めるのは人間です。**
<!-- prettier-ignore-end -->
