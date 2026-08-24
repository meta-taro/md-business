<!-- prettier-ignore-start -->
# デザインスタック 3 点セット — 道具カード

> **このファイルは自動同期されます。**直接編集しても次の同期で上書きされます。
> 誤りや古い記述があれば Issue で知らせてください。

AI に UI を作らせるときの品質を、**個人の感覚ではなく環境で揃える**ための 3 点。
入っている PC と入っていない PC で、同じ指示を出しても出来が変わります。

| 何 | 置き場所 | 役割 |
|---|---|---|
| **DESIGN.md** | **リポジトリのルート** | このプロダクトの見た目の正本。AI が読む |
| **taste-skill** | **PC の `~/.claude/`** | AI の出力品質を底上げする Claude Skill |
| **awesome-design-md** | **どこにも入れない**（読むだけ） | 73 ブランドの DESIGN.md 実例カタログ |

**入れる場所が 3 つとも違います。**ここを間違えると効きません。

---

## 1. DESIGN.md — リポジトリに置く

Google Stitch が出した概念。**プレーンテキストのデザインシステム文書**で、
Figma のエクスポートも JSON スキーマも要りません。Markdown ファイルを 1 枚
プロジェクトルートに置くだけで、AI コーディングエージェントがそれを読んで UI を作ります。

- 仕様: <https://stitch.withgoogle.com/docs/design-md/overview/>

**中身は人間が決めます。**色・字・余白・コンポーネントの原則は AI が決めるところではありません。
決まっていない状態で AI に書かせると、画面ごとに色がバラバラになります。

---

## 2. taste-skill — PC に入れる

<https://github.com/Leonxlnx/taste-skill>（MIT）

「Anti-Slop Frontend Framework」。**AI が出しがちな平凡な UI を避けるための Skill** です。

### 入れ方

```bash
npx skills add https://github.com/Leonxlnx/taste-skill
```

`npx skills add` は [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) の CLI で、
リポジトリの `skills/` フォルダを走査します。**上のコマンドで全部入ります。**

1 つだけ入れるなら install 名を指定します。

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

> **install 名はフォルダ名ではありません。**SKILL の frontmatter の `name:` の値です。

### 版について

- 既定の `design-taste-frontend` は **v2（experimental）**。v1 からの大幅な書き直し
- **v1 が入っている PC は、同じコマンドを再実行すれば v2 に上がります**（install 名は変わらない）
- v1 の挙動に依存しているなら `design-taste-frontend-v1` を指定する
- GPT / Codex 向けの厳しめ変種 `gpt-taste` もある

### 3 つのダイヤル

出力の方向を数値で調整します。

| ダイヤル | 低い | 高い |
|---|---|---|
| **DESIGN_VARIANCE** | 中央寄せ・整然 | 非対称・現代的 |
| **MOTION_INTENSITY** | hover 程度 | スクロール連動・マグネティック |
| **VISUAL_DENSITY** | 余白の多い画面 | 情報密度の高いダッシュボード |

**プロダクトの性格に合わせて決め、DESIGN.md に書いておきます。**毎回口頭で伝えない。

---

## 3. awesome-design-md — 読むだけ。入れない

<https://github.com/VoltAgent/awesome-design-md>（MIT）

**73 ブランドの DESIGN.md 実例集**（Claude / Linear / Stripe など）。
トークン・パターン・ルールまで分析されたものが並んでいます。

**リポジトリには含めません。**DESIGN.md を書くときに開いて、近い性格のものを参考にします。
コピーしてそのまま使うのではなく、**自分のプロダクトの言葉に置き換えて書く**。

---

## この 3 つが揃っていないとどうなるか

- **DESIGN.md が無い** → 画面ごとに色と余白がバラバラになる。あとから直すのは全画面の書き換え
- **taste-skill が無い** → AI の出す UI が平凡なまま。指示の書き方でしか差が出せない
- **awesome-design-md を知らない** → DESIGN.md を白紙から書くことになり、書けずに放置される

**3 つとも、PC ごとに入っていたり入っていなかったりします。**
成果物の質の差が本人の力量ではなく環境の差で生まれるので、**特に支障が無ければ入れておくことを勧めます。**

**必須ではありません。**既に自分のやり方が確立しているなら、それを使ってください。
<!-- prettier-ignore-end -->
