---
name: New distribution channel
about: 新しい配布チャネルの追加提案
title: "[channel] "
labels: channel
---

## チャネル名

例: `apps/figma-plugin`

## 想定ユーザー

## ビルド・配布方法

## 既存の viewer-* を再利用する戦略

各 viewer-* パッケージはチャネル間で共有します。チャネル個別の改修を避け、共通 viewer を再利用する設計にしてください。

## やらないリスト（除外チャネル）に当たらないことの確認

- [ ] Obsidian / Logseq プラグインではない
- [ ] Microsoft Word アドインではない
- [ ] バックエンドサーバ常駐を必要としない
