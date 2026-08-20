---
スキーマ: db-spec/v1
文書番号: DB-2026-0101
タイトル: 備品貸出管理 DB 設計書
版: "1.0.0"
発行日: "2026-08-03"
ステータス: 承認済
エンジン: PostgreSQL
テーマ: 青
作成者:
  - 名前: 山田 太郎
    役割: 設計担当
レビュアー:
  - 名前: 佐藤 花子
    役割: 総務部門 窓口
関連文書:
  - ./spec.md
  - ./api-spec.md
テーブル:
  - 名前: assets
    説明: 貸出備品。管理番号で一意。廃棄しても行は消さず status で表す
    列:
      - { 名前: id, 型: bigserial, 主キー: true }
      - { 名前: asset_code, 型: varchar(32), NULL許可: false, 一意: true }
      - { 名前: name, 型: varchar(120), NULL許可: false }
      - { 名前: category, 型: varchar(32), NULL許可: false }
      - { 名前: status, 型: varchar(16), NULL許可: false, 既定値: "'available'" }
      - { 名前: note, 型: text }
      - { 名前: created_at, 型: timestamptz, NULL許可: false, 既定値: now() }
      - { 名前: updated_at, 型: timestamptz, NULL許可: false, 既定値: now() }
    インデックス:
      - { 名前: ix_assets_category_status, 列: [category, status] }
    トリガー:
      - { 名前: trg_assets_updated_at, 契機: "BEFORE UPDATE", 処理: "set updated_at = now()" }
  - 名前: loans
    説明: 貸出。返却すると returned_at が入る。返却済みの行は書き換えない
    列:
      - { 名前: id, 型: bigserial, 主キー: true }
      - { 名前: asset_id, 型: bigint, NULL許可: false, 外部キー: { テーブル: assets, 列: id, 削除時: restrict } }
      - { 名前: borrower_code, 型: varchar(32), NULL許可: false }
      - { 名前: lent_at, 型: timestamptz, NULL許可: false, 既定値: now() }
      - { 名前: due_on, 型: date, NULL許可: false }
      - { 名前: returned_at, 型: timestamptz }
      - { 名前: note, 型: text }
    インデックス:
      - { 名前: ix_loans_asset_open, 列: [asset_id], 一意: true }
      - { 名前: ix_loans_due_on, 列: [due_on] }
      - { 名前: ix_loans_borrower, 列: [borrower_code, lent_at] }
ファイル名: "DB設計書_{文書番号}_v{版}"
---

# 1. 方針

## 1.1 消さない

備品も貸出も削除しない。廃棄した備品は `assets.status` を `retired` にし、
返却は `loans.returned_at` を入れて表す。紙の台帳では消された行の追跡ができなかった。

## 1.2 社員の情報は持たない

`loans.borrower_code` は人事システムの社員コードをそのまま入れる。
氏名と所属はこのデータベースに置かない。持てば必ず古くなり、二重管理になる。

# 2. テーブル

## 2.1 assets（備品）

| 列 | 意味 |
|---|---|
| `asset_code` | 備品に貼るラベルの番号。人が読んで打つので変えない |
| `category` | `pc` / `tablet` / `projector` / `other` |
| `status` | `available`（貸出可）/ `retired`（廃棄済） |

貸出中かどうかは `assets` に持たず、`loans` に開いている行があるかで決める。
二か所に持つと、片方だけ更新された状態が必ず出る。

## 2.2 loans（貸出）

| 列 | 意味 |
|---|---|
| `due_on` | 返却期限。日付だけで持つ（時刻まで決めていない） |
| `returned_at` | 返却の記録。`NULL` の間が貸出中 |

# 3. 同じ備品を二重に貸さないための制約

`ix_loans_asset_open` は `returned_at IS NULL` に限った部分インデックスとして張る。

```sql
create unique index ix_loans_asset_open
  on loans (asset_id)
  where returned_at is null;
```

これで「1 つの備品に開いている貸出は 1 件まで」がデータベース側で保証される。
アプリ側の確認だけに任せると、二人が同時に借りる操作をしたときに両方通る。

# 4. 期限超過の取り出し

```sql
select l.id, a.asset_code, l.borrower_code, l.due_on,
       current_date - l.due_on as overdue_days
  from loans l
  join assets a on a.id = l.asset_id
 where l.returned_at is null
   and l.due_on < current_date
 order by overdue_days desc;
```

`ix_loans_due_on` はこの取り出しのために張っている。
