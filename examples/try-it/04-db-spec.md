---
スキーマ: db-spec/v1
文書番号: EXAMPLE-DB-0001
タイトル: 会議室予約 DB 設計書
版: "1.0.0"
発行日: "2026-08-20"
ステータス: 承認済
エンジン: PostgreSQL
テーマ: 青
作成者:
  - 名前: 山田 太郎
    役割: 設計担当
関連文書:
  - ./02-spec.md
  - ./06-api-spec.md
テーブル:
  - 名前: rooms
    説明: 会議室。使わなくなっても行は消さず active で表す
    列:
      - { 名前: id, 型: bigserial, 主キー: true }
      - { 名前: room_code, 型: varchar(16), NULL許可: false, 一意: true }
      - { 名前: name, 型: varchar(60), NULL許可: false }
      - { 名前: floor, 型: smallint, NULL許可: false }
      - { 名前: capacity, 型: smallint, NULL許可: false }
      - { 名前: has_projector, 型: boolean, NULL許可: false, 既定値: "false" }
      - { 名前: active, 型: boolean, NULL許可: false, 既定値: "true" }
      - { 名前: created_at, 型: timestamptz, NULL許可: false, 既定値: now() }
    インデックス:
      - { 名前: ix_rooms_floor_capacity, 列: [floor, capacity] }
  - 名前: reservations
    説明: 予約。取り消しても行は消さず status で表す。重なりは制約で弾く
    列:
      - { 名前: id, 型: bigserial, 主キー: true }
      - { 名前: room_id, 型: bigint, NULL許可: false, 外部キー: { テーブル: rooms, 列: id, 削除時: restrict } }
      - { 名前: organizer_code, 型: varchar(32), NULL許可: false }
      - { 名前: title, 型: varchar(120), NULL許可: false }
      - { 名前: starts_at, 型: timestamptz, NULL許可: false }
      - { 名前: ends_at, 型: timestamptz, NULL許可: false }
      - { 名前: status, 型: varchar(16), NULL許可: false, 既定値: "'booked'" }
      - { 名前: series_id, 型: uuid }
      - { 名前: note, 型: text }
      - { 名前: created_at, 型: timestamptz, NULL許可: false, 既定値: now() }
      - { 名前: canceled_at, 型: timestamptz }
      - { 名前: canceled_by, 型: varchar(32) }
    インデックス:
      - { 名前: ix_reservations_room_start, 列: [room_id, starts_at] }
      - { 名前: ix_reservations_organizer, 列: [organizer_code, starts_at] }
      - { 名前: ix_reservations_series, 列: [series_id] }
  - 名前: room_closures
    説明: 清掃・工事などで貸し出さない時間帯。予約と同じように重なりを見る
    列:
      - { 名前: id, 型: bigserial, 主キー: true }
      - { 名前: room_id, 型: bigint, NULL許可: false, 外部キー: { テーブル: rooms, 列: id, 削除時: cascade } }
      - { 名前: reason, 型: varchar(60), NULL許可: false }
      - { 名前: starts_at, 型: timestamptz, NULL許可: false }
      - { 名前: ends_at, 型: timestamptz, NULL許可: false }
    インデックス:
      - { 名前: ix_room_closures_room_start, 列: [room_id, starts_at] }
ファイル名: "DB設計書_{文書番号}_v{版}"
---

# 1. 方針

## 1.1 重なりはデータベースで弾く

`reservations` には、部屋と時間帯の組に対する排他制約を張る。

```sql
alter table reservations
  add constraint ex_reservations_no_overlap
  exclude using gist (
    room_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'booked');
```

アプリで「空きを確認してから書く」形にすると、確認と書き込みの間に別の予約が入る。
制約に任せれば、負けた側の書き込みが失敗するだけで済む。

## 1.2 消さない

取り消した予約は `status = 'canceled'` にし、`canceled_at` と `canceled_by` を入れる。
行を消すと「誰がいつ取り消したのか」が残らない。

## 1.3 氏名を持たない

`organizer_code` は人事システムの社員コードをそのまま入れる。
氏名・所属はこのデータベースに置かない。置けば必ず古くなる。

# 2. テーブル

## 2.1 rooms（会議室）

| 列 | 意味 |
| --- | --- |
| `room_code` | 部屋のドアに貼る番号。人が読んで打つので変えない |
| `capacity` | 座れる人数。検索の絞り込みに使う |
| `active` | 貸し出しをやめた部屋を `false` にする。過去の予約は残る |

## 2.2 reservations（予約）

| 列 | 意味 |
| --- | --- |
| `status` | `booked` / `canceled` / `finished` |
| `series_id` | 繰り返しで作った予約をまとめる。単発なら空 |
| `ends_at` | 終了時刻。開始と同じ値は入れられない（15 分刻み・最長 4 時間） |

## 2.3 room_closures（貸し出さない時間帯）

清掃と工事をここに入れる。予約の検索は `reservations` と `room_closures` の
両方を見て空きを出す。

# 3. よく使う問い合わせ

## 3.1 ある日の空き

```sql
select r.room_code, r.name, r.capacity
from rooms r
where r.active
  and r.capacity >= $1
  and not exists (
    select 1 from reservations v
    where v.room_id = r.id
      and v.status = 'booked'
      and tstzrange(v.starts_at, v.ends_at) && tstzrange($2, $3)
  )
  and not exists (
    select 1 from room_closures c
    where c.room_id = r.id
      and tstzrange(c.starts_at, c.ends_at) && tstzrange($2, $3)
  )
order by r.floor, r.capacity;
```

## 3.2 自分の予約

```sql
select id, room_id, title, starts_at, ends_at, status
from reservations
where organizer_code = $1
  and starts_at >= now() - interval '30 days'
order by starts_at desc;
```

# 4. 増え方

1 日あたりの予約はおよそ 300 件。年間で 8 万行弱、5 年で 40 万行。
この量では分割しない。`starts_at` の索引だけで足りる。
