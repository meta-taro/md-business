---
スキーマ: nosql-db-spec/v1
文書番号: EXAMPLE-NOSQL-0001
タイトル: 会議室の表示端末 データ設計書
版: "1.0.0"
発行日: "2026-08-20"
ステータス: 承認済
エンジン: Firestore
テーマ: 青
作成者:
  - 名前: 山田 太郎
    役割: 設計担当
関連文書:
  - ./02-spec.md
  - ./04-db-spec.md
コレクション:
  - パス: rooms/{roomCode}
    説明: 会議室 1 つ分の、いま表示端末に出す状態
    ドキュメントID戦略: 自動
    形状:
      name: { 型: 文字列, 必須: true, 説明: ドアに出す部屋の名前 }
      floor: { 型: 数値, 必須: true }
      capacity: { 型: 数値, 必須: true }
      state:
        型: 文字列
        必須: true
        選択肢: [vacant, occupied, closed]
        説明: いまの状態。予約の開始・終了で書き換わる
      current:
        型: マップ
        説明: いま使われている予約。空いていれば無い
        形状:
          title: { 型: 文字列, 必須: true }
          organizerCode: { 型: 文字列, 必須: true }
          startsAt: { 型: タイムスタンプ, 必須: true }
          endsAt: { 型: タイムスタンプ, 必須: true }
      updatedAt: { 型: タイムスタンプ, 必須: true }
    インデックス:
      - { フィールド: [floor, state], スコープ: コレクション, モード: 昇順 }
  - パス: rooms/{roomCode}/upcoming
    説明: その部屋の今日これからの予約。日付が変わると入れ替える
    ドキュメントID戦略: UUID
    形状:
      title: { 型: 文字列, 必須: true }
      organizerCode: { 型: 文字列, 必須: true }
      startsAt: { 型: タイムスタンプ, 必須: true }
      endsAt: { 型: タイムスタンプ, 必須: true }
      series: { 型: 真偽値, 既定値: false, 説明: 繰り返しの一部なら true }
      attendees:
        型: 配列
        説明: 出席予定の社員コード。氏名は入れない
        要素: { 型: 文字列 }
    インデックス:
      - { フィールド: [startsAt], スコープ: コレクション, モード: 昇順 }
    TTL: { フィールド: endsAt, 有効: true }
  - パス: panels/{panelId}
    説明: 表示端末そのもの。生きているかを見るためだけに置く
    ドキュメントID戦略: 認証UID
    形状:
      roomCode: { 型: 文字列, 必須: true }
      appVersion: { 型: 文字列, 必須: true }
      lastSeenAt: { 型: タイムスタンプ, 必須: true }
      battery: { 型: 数値, 説明: 電池式の端末のみ。0〜100 }
    インデックス:
      - { フィールド: [lastSeenAt], スコープ: コレクション, モード: 降順 }
セキュリティルール:
  - { 対象: "/rooms/{roomCode}", 許可: [読み取り], 条件: "request.auth != null" }
  - { 対象: "/rooms/{roomCode}/upcoming/{docId}", 許可: [読み取り], 条件: "request.auth != null" }
  - { 対象: "/panels/{panelId}", 許可: [更新], 条件: "request.auth.uid == panelId" }
ファイル名: "データ設計書_{文書番号}_v{版}"
---

# 1. 何のためのものか

会議室のドアの横に置く表示端末が読む。**正本ではない**。
予約そのものは [`04-db-spec.md`](./04-db-spec.md) の PostgreSQL にあり、
ここへは表示に要るぶんだけ書き写す。

## 1.1 なぜ書き写すか

表示端末は 40 台ある。全部が数秒おきに予約サービスへ問い合わせると、
人が予約を取る操作より端末の問い合わせのほうが多くなる。
書き込みは予約が変わったときだけなので、写したほうが安い。

## 1.2 ずれたとき

写し先がずれても、予約そのものは失われない。
`updatedAt` が 10 分以上古い部屋は、表示端末側で「確認中」と出して、
その部屋の状態を出さない。

# 2. 置き方

## 2.1 rooms

部屋 1 つに 1 件。ドキュメント ID は部屋の番号をそのまま使う。
表示端末は自分の部屋 1 件だけを購読する。

## 2.2 rooms/{roomCode}/upcoming

その日これからの予約だけを置く。終わった予約は `endsAt` を過ぎたら消える（TTL）。
過去を辿りたいときは PostgreSQL を見る。

## 2.3 panels

端末が 5 分おきに `lastSeenAt` を書く。総務の画面で、
1 時間書かれていない端末を「反応がない」として出す。

# 3. 持たないもの

- 氏名・メールアドレス・部署名（社員コードだけを持つ）
- 会議の本文・添付
- 取り消された予約（消えるだけ。記録は PostgreSQL 側）
