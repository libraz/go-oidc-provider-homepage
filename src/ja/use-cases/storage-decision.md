---
title: ストレージ構成の選び方
description: 更地・既存 DB・Hot/Cold 分離という入口別に、各 OIDC サブストアの置き場と Redis に載せてよいものを判断するマップ。
---

# 使い方 — ストレージ構成の選び方

本ライブラリは、`users` テーブルもデータベースもマイグレーションツールも所有しません。ストレージには小さな `store.*` サブストアインターフェース越しに触れ、その裏側をどう用意するかは組み込み側が決めます。このページは、その判断の入口です。状況を選ぶと、読むべき具体ガイドが分かります。

::: tip 考え方
ほぼすべては 2 つの問いで決まります: **OIDC のテーブルをどこに置くか**(1 つのバックエンドか、2 つに分けるか)、そして **すでに合わせるべきスキーマを持っているか**。サブストアインターフェースはどの場合も同一で、変わるのは裏側の保存先だけです。
:::

::: info はじめて本番構成を作る場合
最初は SQL アダプタ 1 つで始めるのがいちばん簡単です。Redis や `composite` は、ログイン途中の状態や JTI 再利用防止セットが SQL の負荷要因になってから検討しても遅くありません。既存の `users` テーブルだけを使いたい場合も、OIDC のプロトコルテーブルまで自前実装する必要はありません。
:::

## 入口を選ぶ

| 状況 | 構成 | ガイド |
|---|---|---|
| **更地** — スキーマがまだ無い | SQL バックエンド 1 つ、アダプタ所有のテーブル | [SQL ストア](/ja/use-cases/sql-store) |
| **既存データベース** — すでに `users` テーブルとマイグレーションを運用している | アダプタ所有の `oidc_*` テーブル(命名を合わせて変更)+ ID 情報を投影 | [ストアを自前実装](/ja/use-cases/byo-store) · [ユーザストアを自前実装](/ja/use-cases/byo-userstore) |
| **スケール / 高頻度生成** — 揮発状態を永続ストアから外したい | `composite` で分離: 永続 SQL + 揮発 Redis | [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) |

<svg class="storage-choice" role="img" aria-labelledby="storage-choice-title" viewBox="0 0 760 430" style="width:100%;height:auto;max-width:760px;display:block;margin:1.5rem auto" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <title id="storage-choice-title">ストレージ構成の選択。新規なら SQL アダプタ 1 つ、既存 users テーブルがあるなら OIDC テーブルだけ SQL アダプタに任せて UserStore を自前実装、高頻度の揮発状態を分離したいなら composite で SQL と Redis に分ける。</title>
  <defs>
    <marker id="storage-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1.5 1.5 L8.5 5 L1.5 8.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </marker>
  </defs>
  <rect x="250" y="18" width="260" height="52" rx="8"/>
  <text class="h" x="380" y="40" text-anchor="middle">どこに状態を置くか</text>
  <text class="t sub" x="380" y="58" text-anchor="middle">まず 3 つの入口から選ぶ</text>

  <path d="M380 70 V100" marker-end="url(#storage-arrow)"/>
  <rect x="40" y="102" width="210" height="74" rx="8"/>
  <text class="h" x="145" y="130" text-anchor="middle">更地</text>
  <text class="t sub" x="145" y="151" text-anchor="middle">スキーマがまだ無い</text>

  <rect x="274" y="102" width="212" height="74" rx="8"/>
  <text class="h" x="380" y="130" text-anchor="middle">既存 DB あり</text>
  <text class="t sub" x="380" y="151" text-anchor="middle">users テーブルを運用済み</text>

  <rect x="510" y="102" width="210" height="74" rx="8"/>
  <text class="h" x="615" y="130" text-anchor="middle">高頻度状態を分離</text>
  <text class="t sub" x="615" y="151" text-anchor="middle">Redis を使いたい</text>

  <path d="M145 176 V218" marker-end="url(#storage-arrow)"/>
  <path d="M380 176 V218" marker-end="url(#storage-arrow)"/>
  <path d="M615 176 V218" marker-end="url(#storage-arrow)"/>

  <rect class="accent" x="40" y="220" width="210" height="92" rx="8"/>
  <text class="h accent-text" x="145" y="248" text-anchor="middle">SQL アダプタ 1 つ</text>
  <text class="t sub" x="145" y="272" text-anchor="middle">OIDC テーブルを</text>
  <text class="t sub" x="145" y="291" text-anchor="middle">アダプタに任せる</text>

  <rect class="accent" x="274" y="220" width="212" height="92" rx="8"/>
  <text class="h accent-text" x="380" y="248" text-anchor="middle">SQL + UserStore</text>
  <text class="t sub" x="380" y="272" text-anchor="middle">プロトコル状態は SQL</text>
  <text class="t sub" x="380" y="291" text-anchor="middle">ID 情報は既存 DB</text>

  <rect class="accent" x="510" y="220" width="210" height="92" rx="8"/>
  <text class="h accent-text" x="615" y="248" text-anchor="middle">composite</text>
  <text class="t sub" x="615" y="272" text-anchor="middle">永続 SQL</text>
  <text class="t sub" x="615" y="291" text-anchor="middle">揮発 Redis</text>

  <rect class="soft" x="66" y="350" width="628" height="56" rx="8"/>
  <text class="t" x="380" y="373" text-anchor="middle">注意: 短寿命でも、認可コードや PAR は永続側に置く</text>
  <text class="m sub" x="380" y="392" text-anchor="middle">composite.TxClusterKinds は 1 つのバックエンドにまとめる</text>
</svg>

## 更地

`sql` アダプタはスキーマ一式を同梱しているので、組み込み側が OIDC テーブルを設計する必要はありません。`New(db, dialect)` が SQLite / MySQL 8.0+ / PostgreSQL 14+ に対して(対応する `SQLite()` / `MySQL()` / `Postgres()` dialect 経由で)ストアを構築し、アダプタが自身の `oidc_*` テーブルを所有します。

- **開発 / examples**: ストアの `Migrate(ctx)` を呼ぶと、同梱の v1 スキーマをライブ接続に適用します。これはデモとテストのための便宜であり、本番のマイグレーション実行系ではありません。
- **本番**: ストアの `Schema()` を呼ぶと、dialect 固有の DDL を(`WithNaming` の上書きを適用済みの状態で)得られます。この文字列を既存のマイグレーションツールに流し込んでください。DDL をそのまま公開しているのは、アダプタが前提とするスキーマと本番スキーマをレビューで差分比較できるようにするためです。

## 既存データベース

データベースもマイグレーションも組み込み側のまま維持します。アダプタがその隣にどう収まるかは、2 つの事実で決まります。

- **アダプタは形が固定されたテーブルを所有します。** `WithNaming` は *物理テーブル名* を変更します(`oidc_clients` を任意の命名規則へ)が、*列は固定* です — アダプタは既知の列集合に対してクエリを組み立てます。未知の論理キーは `New` を失敗させるので、打ち間違いは最初のクエリ時ではなく構築時に表面化します。
- **本物の `users` テーブルは組み込み側のものです。** アダプタの `oidc_users` テーブル(`subject`、`claims`、`updated_at`、および任意の `username` / `password_hash`)は投影先であって、置き換えではありません。すでに情報量の多い `users` テーブルがあるなら、*組み込み側の* 列を読んで `store.User` を返す `store.UserStore`(パスワードグラントを扱うなら `store.UserPasswordStore` も)を実装してください。ユーザデータをアダプタの形に移行する必要はありません。

つまり「既存テーブルを再利用したい」は 2 つに分かれます: OIDC の **プロトコル** テーブル(認可コード、リフレッシュチェーン、grant など)はアダプタのものなので `WithNaming` で名前を合わせてマイグレーションに作らせ、**ID** 情報は自前実装の `UserStore` の背後に置いたままにします。

::: details どのサブストアを自前実装する価値があるか
どのサブストアも自前実装できますが、組み込み側がほぼ必ず所有するのはユーザの投影(`UserStore` / `UserPasswordStore`)です。ユーザレコードは組み込み側のドメインだからです。プロトコル系サブストア(コード、トークン、grant)は手書きのバックエンドで得をすることはまれなので、そこは `sql` アダプタを使ってください。ゼロからの実装例は [ストアを自前実装](/ja/use-cases/byo-store) を、ID だけを差し替える場合は [ユーザストアを自前実装](/ja/use-cases/byo-userstore) を参照してください。
:::

## スケールのための分離(Hot/Cold)

1 つのバックエンドではもう形が合わなくなったとき — 永続行に揮発状態が生む QPS は要らず、揮発行に永続ストアの保証は要らない — `composite` アダプタが各サブストアを永続側か揮発側のバックエンドへルーティングします。標準的な本番構成は、永続側に SQL、揮発側に Redis を置く形です。詳しい手順は [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) のページにあります。

## Redis に載せてよいもの — ルール

Redis か SQL かの選択は「そのデータが短寿命かどうか」では **ありません**。1 つの不変条件に従います: アトミックに同時コミットしなければならないサブストア(`composite.TxClusterKinds`)は同じバックエンドを共有する必要があるため、永続側に留まります。データの寿命が決めるのは、その残りだけです。

| バケット | サブストア | 理由 |
|---|---|---|
| **永続側(SQL)必須** | `AuthorizationCodeStore`、`RefreshTokenStore`、`GrantStore`、`PushedAuthRequestStore`、`AccessTokenRegistry`、`OpaqueAccessTokenStore`、`GrantRevocationStore` | トランザクションクラスタのメンバー — 1 つの整合性ドメインでコミット / CAS されます。Redis アダプタはこれらに `nil` を返すので、`composite` は永続側の外へルートできません。 |
| **Redis 向き(揮発)** | `InteractionStore`、`ConsumedJTIStore` | 短寿命・高頻度生成で、単体では失っても差し支えなく、クラスタの *外* にあります。 |
| **組み込み側の判断** | `SessionStore` | どちらの保存先にもルートできます。`WithSessionDurabilityPosture` で意図を宣言すると、Back-Channel Logout の監査シグナルが想定内 / 想定外のギャップを分類します。 |

直感に反するメンバーが PAR です: `request_uri` は短寿命で *揮発に見えます* が、OP はこれを認可コードの経路の中で消費するため、クラスタに属し永続側に留まります。サブストア単位の正式な表と、必須バックエンドが `nil` のときの `op.New` のガードレールは [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) のページにあります。

::: warning Redis の最低ライン
`redis.New` は TLS(`rediss://`)と AUTH 無しでは起動を拒否します。開発専用の例外口は `redis.WithDevModeAllowPlaintext` で、本番で使うのは手で打ち込まないと出てこないセキュリティ後退です。
:::
