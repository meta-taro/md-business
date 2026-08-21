---
スキーマ: api-spec/v1
文書番号: EXAMPLE-API-0001
タイトル: 会議室予約 API 詳細設計書
版: "1.0.0"
発行日: "2026-08-20"
ステータス: 承認済
プロトコル: REST
認証: Bearer
ベースURL: https://api.example.com/v1
テーマ: 青
作成者:
  - 名前: 山田 太郎
    役割: 設計担当
関連文書:
  - ./02-spec.md
  - ./04-db-spec.md
ファイル名: "API設計書_{文書番号}_v{版}"
エンドポイント:
  - オペレーションID: searchRooms
    メソッド: GET
    パス: /rooms/availability
    概要: 空いている会議室を探す
    タグ: [rooms]
    認証: Bearer
    リクエスト:
      クエリパラメータ:
        - 名前: startsAt
          型: 文字列
          必須: true
          説明: 開始時刻（ISO 8601・15 分刻み）
        - 名前: endsAt
          型: 文字列
          必須: true
          説明: 終了時刻（開始から最長 4 時間）
        - 名前: capacity
          型: 整数
          必須: false
          説明: 必要な人数。指定するとこれ以上の部屋だけ返す
        - 名前: floor
          型: 整数
          必須: false
          説明: 階で絞る
    レスポンス:
      - ステータス: 200
        説明: 空いている部屋
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: rooms
              型: 配列
              説明: 空いている部屋の一覧
              要素:
                - 名前: roomCode
                  型: 文字列
                  DB参照: EXAMPLE-DB-0001#rooms.room_code
                - 名前: name
                  型: 文字列
                  DB参照: EXAMPLE-DB-0001#rooms.name
                - 名前: capacity
                  型: 整数
                  DB参照: EXAMPLE-DB-0001#rooms.capacity
            - 名前: total
              型: 整数
              説明: 件数
      - ステータス: 400
        エラー参照: VALIDATION_FAILED
      - ステータス: 401
        エラー参照: UNAUTHORIZED
  - オペレーションID: createReservation
    メソッド: POST
    パス: /reservations
    概要: 予約する
    タグ: [reservations]
    認証: Bearer
    リクエスト:
      ボディ:
        コンテンツタイプ: application/json
        フィールド:
          - 名前: roomCode
            型: 文字列
            必須: true
            説明: 部屋の番号
          - 名前: title
            型: 文字列
            必須: true
            説明: 会議の名前。表示端末に出る
          - 名前: startsAt
            型: 文字列
            必須: true
          - 名前: endsAt
            型: 文字列
            必須: true
          - 名前: repeat
            型: オブジェクト
            必須: false
            説明: 繰り返す場合だけ
            要素:
              - 名前: every
                型: 文字列
                説明: weekly / monthly
              - 名前: count
                型: 整数
                説明: 回数（最大 26）
    レスポンス:
      - ステータス: 201
        説明: できた予約
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: reservationId
              型: 文字列
              DB参照: EXAMPLE-DB-0001#reservations.id
            - 名前: seriesId
              型: 文字列
              説明: 繰り返しのときだけ入る
              DB参照: EXAMPLE-DB-0001#reservations.series_id
            - 名前: skipped
              型: 配列
              説明: 繰り返しのうち、埋まっていて作れなかった日
              要素:
                - 名前: startsAt
                  型: 文字列
      - ステータス: 400
        エラー参照: VALIDATION_FAILED
      - ステータス: 409
        エラー参照: ALREADY_BOOKED
  - オペレーションID: cancelReservation
    メソッド: POST
    パス: /reservations/{id}/cancel
    概要: 予約を取り消す
    タグ: [reservations]
    認証: Bearer
    リクエスト:
      パスパラメータ:
        - 名前: id
          型: 文字列
          必須: true
          説明: 予約 ID
      ボディ:
        コンテンツタイプ: application/json
        フィールド:
          - 名前: reason
            型: 文字列
            必須: false
            説明: 代理で取り消すときに残す
    レスポンス:
      - ステータス: 204
        説明: 取り消した
      - ステータス: 403
        エラー参照: NOT_ORGANIZER
      - ステータス: 404
        エラー参照: NOT_FOUND
      - ステータス: 409
        エラー参照: ALREADY_STARTED
  - オペレーションID: listMyReservations
    メソッド: GET
    パス: /reservations
    概要: 自分の予約を一覧する
    タグ: [reservations]
    認証: Bearer
    リクエスト:
      クエリパラメータ:
        - 名前: from
          型: 文字列
          必須: false
          説明: この日以降。既定は今日
        - 名前: limit
          型: 整数
          必須: false
          説明: 最大 100。既定は 20
    レスポンス:
      - ステータス: 200
        説明: 予約の一覧
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: items
              型: 配列
              要素:
                - 名前: reservationId
                  型: 文字列
                - 名前: roomCode
                  型: 文字列
                - 名前: title
                  型: 文字列
                - 名前: startsAt
                  型: 日時
                - 名前: status
                  型: 文字列
                  DB参照: EXAMPLE-DB-0001#reservations.status
      - ステータス: 401
        エラー参照: UNAUTHORIZED
エラー:
  - コード: UNAUTHORIZED
    HTTPステータス: 401
    メッセージ: 認証が必要です
  - コード: VALIDATION_FAILED
    HTTPステータス: 400
    メッセージ: リクエストの内容が不正です
  - コード: ALREADY_BOOKED
    HTTPステータス: 409
    メッセージ: その時間帯は先に取られました
  - コード: NOT_ORGANIZER
    HTTPステータス: 403
    メッセージ: 取り消せるのは主催者だけです
  - コード: ALREADY_STARTED
    HTTPステータス: 409
    メッセージ: 開始した予約は取り消せません
  - コード: NOT_FOUND
    HTTPステータス: 404
    メッセージ: 指定された予約は存在しません
---

# 1. 共通のこと

## 1.1 認証

すべて `Authorization: Bearer <token>` が要る。社員の認証基盤が出したトークンで、
有効期限は 60 分。切れていたら `401` を返す。

## 1.2 時刻

送るのも返すのも ISO 8601 の文字列（`2026-08-20T13:00:00+09:00`）。
サーバー側は UTC で持つ。15 分刻みでない時刻は `400` になる。

## 1.3 エラーの形

```json
{
  "code": "ALREADY_BOOKED",
  "message": "その時間帯は先に取られました"
}
```

# 2. エンドポイント

## 2.1 GET /rooms/availability — 空きを探す

開始と終了は必須。`capacity` と `floor` で絞れる。
**この結果は返した瞬間から古くなる**。空いていた部屋が予約のときに埋まっていることはあり、
そのときは `409 ALREADY_BOOKED` になる。

## 2.2 POST /reservations — 予約する

重なりはデータベース側の制約で弾く。`repeat` を付けると同じ曜日・時刻で繰り返し作る。
**埋まっている回は飛ばして作る**（作れなかった日は `skipped` で返す）。
全部作れないときだけ `409` にする。

## 2.3 POST /reservations/{id}/cancel — 取り消す

主催者以外は `403`。開始時刻を過ぎていたら `409`。
総務の権限を持つ人は他人の予約も取り消せるが、`reason` を付ける。

## 2.4 GET /reservations — 自分の予約

既定では今日以降を 20 件。取り消したものも `status` 付きで返す。
