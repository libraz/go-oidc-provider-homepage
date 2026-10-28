---
title: ストレージ構成の選び方
description: SQL、DynamoDB、Redis の Hot / Cold 分離、自前ストアから選び、既存スキーマの migration と retention 保守を安全に進めるための判断マップ。
pageClass: pg-use-cases-storage-decision
---

# ユースケース — ストレージ構成の選び方

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
| **AWS / DynamoDB** — AWS ネイティブな永続バックエンドを使いたい | サブストアごとに DynamoDB テーブル 1 つ | [DynamoDB ストア](/ja/use-cases/dynamodb-store) |
| **既存データベース** — すでに `users` テーブルとマイグレーションを運用している | アダプタ所有の `oidc_*` テーブル（命名を合わせて変更）+ ID 情報を投影 | [テーブル名の差し替え](/ja/use-cases/sql-store#テーブル名を差し替える) · [ユーザストアを自前実装](/ja/use-cases/byo-userstore) · [ストアを自前実装](/ja/use-cases/byo-store)（カラムも独自にする場合） |
| **スケール / 高頻度生成** — 揮発状態を永続ストアから外したい | `composite` で分離: 永続 SQL + 揮発 Redis | [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) |

<figure class="fig">
  <div class="fig-head">既にあるものから選ぶ 3 つの入口</div>
  <svg class="fig-svg" role="img" aria-labelledby="uc-storage-decision-title" viewBox="0 0 960 392" xmlns="http://www.w3.org/2000/svg">
    <title id="uc-storage-decision-title">ストレージ構成の選び方。新規なら SQL アダプタ 1 つで済みます。既存の users テーブルがあるなら、OIDC のテーブルだけ SQL アダプタに任せて UserStore は自前で用意します。書き換えの激しい状態を SQL から外したいなら、composite アダプタで両方のバックエンドを束ねます。</title>
    <!-- question -->
    <rect class="fg-box fg-box--accent" x="32" y="24" width="896" height="72" rx="8"/>
    <text class="fg-t fg-accent" x="56" y="52">状態をどこに置くか</text>
    <text class="fg-s" x="56" y="76">答えは、OP の好みではなく、その環境で既に運用しているものから決まります</text>
    <!-- branches -->
    <path class="fg-leader" d="M480,96 V120 M168,120 H792"/>
    <path class="fg-edge fg-edge--thin" d="M168,120 V144" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M480,120 V144" marker-end="url(#fg-a)"/>
    <path class="fg-edge fg-edge--thin" d="M792,120 V144" marker-end="url(#fg-a)"/>
    <!-- card 1 -->
    <rect class="fg-box" x="32" y="144" width="272" height="224" rx="8"/>
    <text class="fg-t2" x="48" y="172">更地から始める</text>
    <text class="fg-s" x="48" y="196">自前のスキーマがまだ無い</text>
    <line class="fg-rule" x1="48" y1="216" x2="288" y2="216"/>
    <text class="fg-m fg-accent" x="48" y="244">SQL アダプタ 1 つ</text>
    <text class="fg-s" x="48" y="268">OIDC のテーブルを</text>
    <text class="fg-s" x="48" y="292">users ごと任せる</text>
    <rect class="fg-pill fg-pill--ok" x="48" y="316" width="240" height="32" rx="16"/>
    <text class="fg-s fg-ok" x="168" y="337" text-anchor="middle">作るものが最も少ない</text>
    <!-- card 2 -->
    <rect class="fg-box" x="344" y="144" width="272" height="224" rx="8"/>
    <text class="fg-t2" x="360" y="172">既存のデータベースがある</text>
    <text class="fg-s" x="360" y="196">users テーブルが既にある</text>
    <line class="fg-rule" x1="360" y1="216" x2="600" y2="216"/>
    <text class="fg-m fg-accent" x="360" y="244">SQL + 自前の UserStore</text>
    <text class="fg-s" x="360" y="268">プロトコル状態はアダプタに、</text>
    <text class="fg-s" x="360" y="292">ID 情報は今の場所のまま</text>
    <rect class="fg-pill" x="360" y="316" width="240" height="32" rx="16"/>
    <text class="fg-s fg-dim" x="480" y="337" text-anchor="middle">ユーザの移行が不要</text>
    <!-- card 3 -->
    <rect class="fg-box" x="656" y="144" width="272" height="224" rx="8"/>
    <text class="fg-t2" x="672" y="172">高頻度の状態を分離する</text>
    <text class="fg-s" x="672" y="196">熱い部分は Redis に置く</text>
    <line class="fg-rule" x1="672" y1="216" x2="912" y2="216"/>
    <text class="fg-m fg-accent" x="672" y="244">composite</text>
    <text class="fg-s" x="672" y="268">永続サブストアは SQL、</text>
    <text class="fg-s" x="672" y="292">揮発サブストアは Redis</text>
    <rect class="fg-pill fg-pill--warn" x="672" y="316" width="240" height="32" rx="16"/>
    <text class="fg-s fg-warn" x="792" y="337" text-anchor="middle">運用先が 2 つに増える</text>
  </svg>
  <figcaption class="fig-note">これらは入口であって、行き着く先ではありません。左から始めて後で右へ移るのは設定変更で済みます。振り分けはサブストアの分割位置にあり、その上の層は何も知る必要がありません。</figcaption>
</figure>

3 番目の分岐には落とし穴が 2 つあります。認可コードと PAR の `request_uri` は短寿命なので揮発状態に見えますが、置き場所は永続側です。`composite.TxClusterKinds` のメンバは、すべて同じバックエンドに解決される必要があります。消費済み `jti` の再利用防止セットも短寿命ですが、有効なマーカーが追い出されると再利用検知の窓が再び開くため、追い出しをしない Redis インスタンスでない限り永続側に置きます。

## 更地

`sql` アダプタはスキーマ一式を同梱しているので、組み込み側が OIDC テーブルを設計する必要はありません。`New(db, dialect)` が SQLite / MySQL 8.0+ / PostgreSQL 14+ に対して（対応する `SQLite()` / `MySQL()` / `Postgres()` dialect 経由で）ストアを構築し、アダプタが自身の `oidc_*` テーブルを所有します。

- **開発 / examples**: 新しい接続に同梱スキーマを適用するために、ストアの `Migrate(ctx)` を呼びます。これはデモとテストのための便宜であり、既存テーブルの更新経路ではありません。
- **本番**: ストアの `Schema()` を呼ぶと、dialect 固有の DDL を（`WithNaming` の上書きを適用済みの状態で）得られます。この文字列を既存のマイグレーションツールに流し込んでください。DDL をそのまま公開しているのは、アダプタが前提とするスキーマと本番スキーマをレビューで差分比較できるようにするためです。

既存 DB では、最初のリクエスト前に [`schema/MIGRATIONS.md`](https://github.com/libraz/go-oidc-provider/blob/main/op/storeadapter/sql/schema/MIGRATIONS.md) の追加カラムとインデックスを適用してください。追加されるカラム（登録時の `allowed_scopes`、MFA の `row_version`、認可ごとの状態、`chain_id`、`access_revoked_at`）、retention インデックス、MySQL の照合順序変更は [SQL ガイド](/ja/use-cases/sql-store#sql-migration-before-first-request)にまとめています。必須カラムが欠けていると `Store.Migrate` は起動を拒否します。ロールアウトと GC の順序は [ストレージの保守](/ja/operations/storage-maintenance)を参照してください。

## 既存データベース

データベースもマイグレーションも組み込み側のまま維持します。アダプタがその隣にどう収まるかは、2 つの事実で決まります。

- **アダプタは形が固定されたテーブルを所有します。** `WithNaming` は *物理テーブル名* を変更します（`oidc_clients` を任意の命名規則へ）が、*列は固定* です — アダプタは既知の列集合に対してクエリを組み立てます。未知の論理キーは `New` を失敗させるので、打ち間違いは最初のクエリ時ではなく構築時に表面化します。
- **本物の `users` テーブルは組み込み側のものです。** アダプタの `oidc_users` テーブル（`subject`、`claims`、`updated_at`、および任意の `username` / `password_hash`）は投影先であって、置き換えではありません。すでに情報量の多い `users` テーブルがあるなら、*組み込み側の* 列を読んで `store.User` を返す `store.UserStore`(組み込みのパスワードログインを使うなら `store.UserPasswordStore` も)を実装してください。ユーザデータをアダプタの形に移行する必要はありません。

つまり「既存テーブルを再利用したい」は 2 つに分かれます: OIDC の **プロトコル** テーブル（認可コード、リフレッシュチェーン、grant など）はアダプタのものなので `WithNaming` で名前を合わせてマイグレーションに作らせ、**ID** 情報は自前実装の `UserStore` の背後に置いたままにします。

::: details どのサブストアを自前実装する価値があるか
どのサブストアも自前実装できますが、組み込み側がほぼ必ず所有するのはユーザの投影（`UserStore` / `UserPasswordStore`）です。ユーザレコードは組み込み側のドメインだからです。プロトコル系サブストア（コード、トークン、grant）は手書きのバックエンドで得をすることはまれなので、そこは `sql` アダプタを使ってください。ゼロからの実装例は [ストアを自前実装](/ja/use-cases/byo-store) を、ID だけを差し替える場合は [ユーザストアを自前実装](/ja/use-cases/byo-userstore) を参照してください。
:::

## スケールのための分離（Hot/Cold）

1 つのバックエンドではもう形が合わなくなったとき — 永続行に揮発状態が生む QPS は要らず、揮発行に永続ストアの保証は要らない — `composite` アダプタが各サブストアを永続側か揮発側のバックエンドへルーティングします。標準的な本番構成は、永続側に SQL、揮発側に Redis を置く形です。詳しい手順は [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) のページにあります。

## Redis に載せてよいもの — ルール

Redis か SQL かの選択は「そのデータが短寿命かどうか」では **ありません**。1 つの不変条件に従います: アトミックに同時コミットしなければならないサブストア（`composite.TxClusterKinds`）は同じバックエンドを共有する必要があるため、永続側に留まります。データの寿命が決めるのは、その残りだけです。

| バケット | サブストア | 理由 |
|---|---|---|
| **永続側（SQL）必須** | `AuthorizationCodeStore`、`RefreshTokenStore`、`GrantStore`、`PushedAuthRequestStore`、`AccessTokenRegistry`、`OpaqueAccessTokenStore`、`GrantRevocationStore` | トランザクションクラスタのメンバー — 1 つの整合性ドメインでコミット / CAS されます。Redis アダプタはこれらに `nil` を返すので、`composite` は永続側の外へルートできません。 |
| **Redis 向き（揮発）** | `InteractionStore` | 短寿命・高頻度生成で、単体では失っても差し支えなく（ユーザはログインをやり直す）、クラスタの *外* にあります。 |
| **永続側、または `noeviction` の Redis** | `ConsumedJTIStore` | クラスタの外ですが、再利用防止マーカーが追い出されると、盗まれた DPoP や `private_key_jwt` の proof が再利用できてしまいます。Redis に置けるのは追い出しをしないインスタンスだけで、そのインスタンスでは、ほかのサブストア向けに `volatile-*` や `allkeys-*` を使えません。 |
| **組み込み側の判断** | `SessionStore` | どちらの保存先にもルートできます。`WithSessionDurabilityPosture` は logout の起点 / session snapshot の耐久性を宣言します。BCL の target は grant 由来で解決され、`bcl.no_sessions_for_subject` は eligible RP target が 0 件だった session 付き logout を記録します。 |

直感に反するメンバーが PAR です: `request_uri` は短寿命で *揮発に見えます* が、OP はこれを認可コードの経路の中で消費するため、クラスタに属し永続側に留まります。サブストア単位の正式な表、サブストアごとの Redis の追い出しポリシー、必須バックエンドが `nil` のときの `op.New` のガードレールは [Hot / Cold 分離](/ja/use-cases/hot-cold-redis) のページにあります。

::: warning Redis の最低ライン
`oidcredis.New` は TLS(`rediss://`)と AUTH 無しでは起動を拒否します。開発専用の例外口は `oidcredis.WithDevModeAllowPlaintext` で、本番で使うのは手で打ち込まないと出てこないセキュリティ後退です。
:::

## 構成を健全に保つ

起動前にスキーマを適用し、writer の互換性境界を確認します。運用中は SQL の retention GC をスケジュールして `GCStats` を監視し、DynamoDB TTL は期限判定ではなくストレージ回収として扱います。[ストレージの保守](/ja/operations/storage-maintenance)、[バックアップ / DR](/ja/operations/backup)、バックエンド別の [SQL](/ja/use-cases/sql-store)、[DynamoDB](/ja/use-cases/dynamodb-store)、[BYO ストア](/ja/use-cases/byo-store) を参照してください。
