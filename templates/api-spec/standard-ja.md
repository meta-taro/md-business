---
スキーマ: api-spec/v1
文書番号: API-2026-0001
タイトル: 受発注サブシステム API 詳細設計書
版: "0.3.0"
発行日: "2026-07-15"
ステータス: レビュー中
プロトコル: REST
認証: Bearer
ベースURL: https://api.example.com/v1
テーマ: 青
作成者:
  - 名前: 田中 正智
    役割: API 設計担当
  - 名前: 山田 太郎
    役割: バックエンドリード
レビュアー:
  - 名前: 佐藤 花子
    役割: PM
関連文書:
  - ./../spec/orders.md
  - ./../db-spec/orders-db.md
ファイル名: "API設計書_{文書番号}_v{版}"
エンドポイント:
  - オペレーションID: listOrders
    メソッド: GET
    パス: /orders
    概要: 注文一覧を取得する
    タグ: [orders]
    認証: Bearer
    リクエスト:
      クエリパラメータ:
        - 名前: page
          型: 整数
          必須: false
          説明: ページ番号（1 始まり）
        - 名前: status
          型: 文字列
          必須: false
          説明: 注文状態でのフィルタ
    レスポンス:
      - ステータス: 200
        説明: 注文一覧
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: items
              型: 配列
              説明: 注文の配列
              要素:
                - 名前: orderId
                  型: 文字列
                  DB参照: API-2026-0001#orders.order_id
                - 名前: status
                  型: 文字列
                - 名前: totalAmount
                  型: 整数
            - 名前: total
              型: 整数
              説明: 総件数
      - ステータス: 401
        エラー参照: UNAUTHORIZED
  - オペレーションID: createOrder
    メソッド: POST
    パス: /orders
    概要: 注文を作成する
    タグ: [orders]
    認証: Bearer
    リクエスト:
      ボディ:
        コンテンツタイプ: application/json
        フィールド:
          - 名前: customerId
            型: 文字列
            必須: true
            説明: 顧客 ID（ULID）
          - 名前: items
            型: 配列
            必須: true
            要素:
              - 名前: sku
                型: 文字列
              - 名前: quantity
                型: 整数
          - 名前: shippingAddress
            型: オブジェクト
            必須: true
            要素:
              - 名前: postalCode
                型: 文字列
              - 名前: address1
                型: 文字列
    レスポンス:
      - ステータス: 201
        説明: 作成された注文
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: orderId
              型: 文字列
              DB参照: API-2026-0001#orders.order_id
      - ステータス: 400
        エラー参照: VALIDATION_FAILED
      - ステータス: 409
        エラー参照: OUT_OF_STOCK
  - オペレーションID: getOrder
    メソッド: GET
    パス: /orders/{id}
    概要: 注文を取得する
    タグ: [orders]
    認証: Bearer
    リクエスト:
      パスパラメータ:
        - 名前: id
          型: 文字列
          必須: true
          説明: 注文 ID
    レスポンス:
      - ステータス: 200
        説明: 注文
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: orderId
              型: 文字列
              DB参照: API-2026-0001#orders.order_id
            - 名前: acceptedAt
              型: 日時
              説明: 受注成立日時
      - ステータス: 404
        エラー参照: NOT_FOUND
エラー:
  - コード: UNAUTHORIZED
    HTTPステータス: 401
    メッセージ: 認証が必要です
  - コード: VALIDATION_FAILED
    HTTPステータス: 400
    メッセージ: リクエストの内容が不正です
  - コード: OUT_OF_STOCK
    HTTPステータス: 409
    メッセージ: 在庫が不足しています
  - コード: NOT_FOUND
    HTTPステータス: 404
    メッセージ: 指定された注文は存在しません
---

# 1. 概要

本書は受発注サブシステムが公開する REST API の詳細設計を定義する。エンドポイント・リクエスト / レスポンスのフィールド構造・認証方式・エラーカタログを frontmatter に構造化して記述し、Chrome 拡張で A4 PDF として出力できる。

`DB参照`（`dbRef`）は `<文書番号>#<テーブル>.<列>` 形式で DB 設計書（`schema: db-spec/v1`）のカラムを相互参照する。API のフィールドがどの永続化カラムに対応するかを明示することで、設計変更時の影響範囲を追跡できる。

# 2. 共通仕様

## 2.1 認証

全エンドポイントは `Authorization: Bearer <token>` を要求する。トークンは OAuth 2.0 のアクセストークン（有効期限 60 分）を用いる。認証に失敗した場合は `401 UNAUTHORIZED` を返す。

## 2.2 エラー表現

エラーレスポンスは `errors[]` カタログのコードを `errorRef` で参照する。ボディは以下の共通形とする。

```json
{
  "code": "OUT_OF_STOCK",
  "message": "在庫が不足しています"
}
```

# 3. エンドポイント

## 3.1 GET /orders — 注文一覧

注文を一覧取得する。`page` / `status` クエリで絞り込む。レスポンスは `items[]` と総件数 `total` を返す。

## 3.2 POST /orders — 注文作成

注文を新規作成する。`customerId`・`items[]`・`shippingAddress` が必須。在庫引当に失敗した場合は `409 OUT_OF_STOCK`、入力不正は `400 VALIDATION_FAILED` を返す。

## 3.3 GET /orders/{id} — 注文取得

注文 ID を指定して 1 件取得する。存在しない場合は `404 NOT_FOUND` を返す。

---

> 本サンプルは md-business の `schema-api-spec` で扱う「API 詳細設計書」スキーマの実例です。
> frontmatter は日本語キーで記述し、`normalizeApiSpecFrontmatter` が正規の英語形へ変換したうえで
> Ajv バリデーションを通します。Chrome 拡張で開くと表紙 + エンドポイント一覧 + 本文の PDF を出力できます。
