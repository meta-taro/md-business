---
スキーマ: api-spec/v1
文書番号: API-2026-0101
タイトル: 備品貸出管理 API 詳細設計書
版: "1.0.0"
発行日: "2026-08-03"
ステータス: 承認済
プロトコル: REST
認証: Bearer
ベースURL: https://asset.example.internal/api/v1
テーマ: 青
作成者:
  - 名前: 山田 太郎
    役割: 設計担当
レビュアー:
  - 名前: 佐藤 花子
    役割: 総務部門 窓口
関連文書:
  - ./spec.md
  - ./db-spec.md
ファイル名: "API設計書_{文書番号}_v{版}"
エンドポイント:
  - オペレーションID: listAssets
    メソッド: GET
    パス: /assets
    概要: 備品の一覧を取得する
    タグ: [assets]
    認証: Bearer
    リクエスト:
      クエリパラメータ:
        - 名前: category
          型: 文字列
          必須: false
          説明: 区分での絞り込み（pc / tablet / projector / other）
        - 名前: onlyAvailable
          型: 真偽
          必須: false
          説明: true のとき貸出中を除く
    レスポンス:
      - ステータス: 200
        説明: 備品の一覧
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: items
              型: 配列
              説明: 備品の配列
              要素:
                - 名前: assetCode
                  型: 文字列
                  DB参照: DB-2026-0101#assets.asset_code
                - 名前: name
                  型: 文字列
                - 名前: category
                  型: 文字列
                - 名前: lentTo
                  型: 文字列
                  説明: 貸出中のとき借りている人の社員コード。空いていれば入らない
                - 名前: dueOn
                  型: 日付
                  DB参照: DB-2026-0101#loans.due_on
            - 名前: total
              型: 整数
              説明: 総件数
      - ステータス: 401
        エラー参照: UNAUTHORIZED
  - オペレーションID: lendAsset
    メソッド: POST
    パス: /loans
    概要: 備品を貸し出す
    タグ: [loans]
    認証: Bearer
    リクエスト:
      ボディ:
        コンテンツタイプ: application/json
        フィールド:
          - 名前: assetCode
            型: 文字列
            必須: true
            説明: 貸し出す備品の管理番号
          - 名前: borrowerCode
            型: 文字列
            必須: true
            説明: 借りる人の社員コード
          - 名前: dueOn
            型: 日付
            必須: false
            説明: 返却期限。省略すると貸出日の 14 日後
    レスポンス:
      - ステータス: 201
        説明: 作られた貸出
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: loanId
              型: 文字列
              DB参照: DB-2026-0101#loans.id
            - 名前: dueOn
              型: 日付
              DB参照: DB-2026-0101#loans.due_on
      - ステータス: 400
        エラー参照: VALIDATION_FAILED
      - ステータス: 404
        エラー参照: ASSET_NOT_FOUND
      - ステータス: 409
        エラー参照: ALREADY_LENT
  - オペレーションID: returnLoan
    メソッド: POST
    パス: /loans/{id}/return
    概要: 貸出を返却済みにする
    タグ: [loans]
    認証: Bearer
    リクエスト:
      パスパラメータ:
        - 名前: id
          型: 文字列
          必須: true
          説明: 貸出 ID
    レスポンス:
      - ステータス: 200
        説明: 返却された貸出
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: loanId
              型: 文字列
            - 名前: returnedAt
              型: 日時
              DB参照: DB-2026-0101#loans.returned_at
      - ステータス: 404
        エラー参照: LOAN_NOT_FOUND
      - ステータス: 409
        エラー参照: ALREADY_RETURNED
  - オペレーションID: listOverdue
    メソッド: GET
    パス: /loans/overdue
    概要: 返却期限を過ぎた貸出を取得する
    タグ: [loans]
    認証: Bearer
    レスポンス:
      - ステータス: 200
        説明: 期限を過ぎた貸出。超過日数の多い順
        ボディ:
          コンテンツタイプ: application/json
          フィールド:
            - 名前: items
              型: 配列
              要素:
                - 名前: loanId
                  型: 文字列
                - 名前: assetCode
                  型: 文字列
                - 名前: borrowerCode
                  型: 文字列
                - 名前: dueOn
                  型: 日付
                - 名前: overdueDays
                  型: 整数
                  説明: 返却期限からの経過日数
      - ステータス: 401
        エラー参照: UNAUTHORIZED
エラー:
  - コード: UNAUTHORIZED
    HTTPステータス: 401
    メッセージ: 認証が必要です
  - コード: VALIDATION_FAILED
    HTTPステータス: 400
    メッセージ: リクエストの内容が正しくありません
  - コード: ASSET_NOT_FOUND
    HTTPステータス: 404
    メッセージ: その管理番号の備品はありません
  - コード: ALREADY_LENT
    HTTPステータス: 409
    メッセージ: その備品は貸出中です
  - コード: LOAN_NOT_FOUND
    HTTPステータス: 404
    メッセージ: その貸出はありません
  - コード: ALREADY_RETURNED
    HTTPステータス: 409
    メッセージ: その貸出は返却済みです
---

# 1. 何のための API か

画面で行える操作を、機械からも同じように行えるようにする。
棚卸しのときに一覧をまとめて取る用途を想定している。

`DB参照` は `<文書番号>#<テーブル>.<列>` の形で [DB 設計書](./db-spec.md) の列を指す。
どのフィールドがどの列に対応するかを書いておくと、列を変えるときに直す場所が追える。

# 2. 共通の決まり

## 2.1 認証

すべてのエンドポイントが `Authorization: Bearer <token>` を要る。
トークンは社内の認証基盤が発行する。失敗したときは `401 UNAUTHORIZED` を返す。

## 2.2 エラーの形

エラーは `errors[]` のコードを返す。本文はどのエラーでも同じ形にする。

```json
{
  "code": "ALREADY_LENT",
  "message": "その備品は貸出中です"
}
```

# 3. エンドポイント

## 3.1 GET /assets — 備品一覧

区分と空きで絞り込む。貸出中の備品には借りている人と返却期限が入る。

## 3.2 POST /loans — 貸し出す

`dueOn` を省略すると貸出日の 14 日後になる。
既に貸出中の備品を指すと `409 ALREADY_LENT` を返す。
この判定はデータベース側の部分一意インデックスに任せており、
同時に 2 件の要求が来ても片方だけが通る。

## 3.3 POST /loans/{id}/return — 返す

返却済みの貸出をもう一度返そうとすると `409 ALREADY_RETURNED` を返す。
返却を取り消す口は用意していない。誤りは総務が新しい貸出として記録し直す。

## 3.4 GET /loans/overdue — 期限を過ぎたもの

超過日数の多い順に返す。総務が朝に見る画面がこれを使う。
